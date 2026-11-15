// FreshInstall_1.0 has four stock answers in Bitburner 3.0.1.
// Each is uniquely identified by the game's reported format and length.
const FRESH_INSTALL_ANSWERS = {
    "alphabetic:5": "admin",
    "alphabetic:8": "password",
    "numeric:4": "0000",
    "numeric:5": "12345",
};

const LAIKA_NAMES = {
    3: ["max"],
    4: ["fido", "spot"],
    5: ["rover"],
};

const DESK_MEMO_HINT = /^(?:The password is|The PIN is|Remember to use|It's set to|The key is|The secret is) (\d{1,3})$/;

function solveOctantVoxel(clue) {
    const fields = /^\s*(\d+(?:\.\d+)?),\s*([0-9A-Z]+)(?:\.([0-9A-Z]+))?\s*$/i.exec(clue);
    if (!fields) return undefined;

    const [, baseText, whole, fraction = ""] = fields;
    const radix = Number(baseText);
    if (radix < 2 || radix > 17.6) return undefined;

    const glyphs = whole + fraction;
    let decimal = 0;
    for (let position = 0; position < glyphs.length; position++) {
        const digit = Number.parseInt(glyphs[position], 36);
        if (digit >= radix) return undefined;
        decimal += digit * radix ** (whole.length - position - 1);
    }

    // The game stops emitting fractional digits once the remainder is below 0.0001.
    const rounded = Math.round(decimal);
    if (Number.isSafeInteger(rounded) && Math.abs(decimal - rounded) < 0.001) return String(rounded);
    return undefined;
}

// Game puzzle answers only. undefined means there is no recognized answer.
function singlePuzzleAnswer(details) {
    switch (details.modelId) {
        case "ZeroLogon":
            return "";
        case "FreshInstall_1.0":
            return FRESH_INSTALL_ANSWERS[`${details.passwordFormat}:${details.passwordLength}`];
        case "DeskMemo_3.1": {
            const answer = DESK_MEMO_HINT.exec(details.passwordHint)?.[1];
            return answer?.length === details.passwordLength ? answer : undefined;
        }
        case "CloudBlare(tm)":
        case "OctantVoxel": {
            if (typeof details.data !== "string" || details.passwordFormat !== "numeric") return undefined;
            const answer = details.modelId === "CloudBlare(tm)"
                ? details.data.replace(/[^0-9]/g, "")
                : solveOctantVoxel(details.data);
            return answer && answer.length === details.passwordLength ? answer : undefined;
        }
        default:
            return undefined;
    }
}

export function puzzleCandidates(details) {
    if (details.modelId === "Laika4") {
        return details.passwordFormat === "alphabetic" ? (LAIKA_NAMES[details.passwordLength] ?? []) : [];
    }
    const answer = singlePuzzleAnswer(details);
    return answer === undefined ? [] : [answer];
}

export function puzzleAnswer(details) {
    const choices = puzzleCandidates(details);
    return choices.length === 1 ? choices[0] : undefined;
}

export function isSupported(details) {
    return puzzleCandidates(details).length > 0;
}