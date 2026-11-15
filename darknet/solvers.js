// FreshInstall_1.0 has four stock answers in Bitburner 3.0.1.
// Each is uniquely identified by the game's reported format and length.
const FRESH_INSTALL_ANSWERS = {
    "alphabetic:5": "admin",
    "alphabetic:8": "password",
    "numeric:4": "0000",
    "numeric:5": "12345",
};

const DESK_MEMO_HINT = /^(?:The password is|The PIN is|Remember to use|It's set to|The key is|The secret is) (\d{1,3})$/;

// Game puzzle answers only. undefined means there is no recognized answer.
export function puzzleAnswer(details) {
    switch (details.modelId) {
        case "ZeroLogon":
            return "";
        case "FreshInstall_1.0":
            return FRESH_INSTALL_ANSWERS[`${details.passwordFormat}:${details.passwordLength}`];
        case "DeskMemo_3.1": {
            const answer = DESK_MEMO_HINT.exec(details.passwordHint)?.[1];
            return answer?.length === details.passwordLength ? answer : undefined;
        }
        default:
            return undefined;
    }
}

export function isSupported(details) {
    return puzzleAnswer(details) !== undefined;
}