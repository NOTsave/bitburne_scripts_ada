import { isDeepGreenPuzzle } from "./deepgreen.js";
import { isFactoriPuzzle } from "./factori.js";
import { isOpenWebAccessPointPuzzle } from "./openweb.js";

import { EURO_ZONE_COUNTRIES, TOP_PASS_WORDS } from "./password-lists.js";

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

const GAME_PASSWORD_LISTS = new Map([
    ["EuroZone Free", EURO_ZONE_COUNTRIES],
    ["TopPass", TOP_PASS_WORDS],
]);

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

function matchesPassword(details, password) {
    if (password.length !== details.passwordLength) return false;
    let format;
    if (/^\d+$/.test(password)) format = "numeric";
    else if (/^[A-Za-z]+$/.test(password)) format = "alphabetic";
    else if (/^[0-9A-Za-z]+$/.test(password)) format = "alphanumeric";
    else if ([...password].every(character => character.charCodeAt(0) < 128)) format = "ASCII";
    else format = "unicode";
    return format === details.passwordFormat;
}

function solvePrimeTime(clue) {
    if (typeof clue !== "string" || !/^[1-9]\d*$/.test(clue)) return undefined;
    let remaining = Number(clue);
    if (!Number.isSafeInteger(remaining)) return undefined;

    // The generator multiplies one prime from 1471 to 9859 by primes at most 97.
    for (let divisor = 2; divisor <= 99 && divisor * divisor <= remaining; divisor++) {
        while (remaining % divisor === 0) remaining /= divisor;
    }

    return remaining >= 1471 && remaining <= 9859 ? String(remaining) : undefined;
}

function decodeOrdoXenos(clue) {
    if (typeof clue !== "string") return undefined;
    const [ciphertext, maskData, extra] = clue.split(";");
    if (!ciphertext || !maskData || extra !== undefined) return undefined;

    const masks = maskData.split(" ");
    if (masks.length !== ciphertext.length || !masks.every(mask => /^000[01]{5}$/.test(mask))) return undefined;
    const answer = masks.map((mask, index) =>
        String.fromCharCode(ciphertext.charCodeAt(index) ^ Number.parseInt(mask, 2))).join("");
    return /^[0-9A-Za-z]+$/.test(answer) ? answer : undefined;
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
        case "BellaCuore": {
            if (details.passwordFormat !== "numeric" || typeof details.data !== "string") return undefined;
            const digits = details.data.trim().toUpperCase();
            // The same model also produces range clues such as "IX,XX". Only single values resolve here.
            if (digits !== "NULLA" &&
                (!digits || !/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(digits))) {
                return undefined;
            }
            let decimal = 0;
            if (digits !== "NULLA") {
                const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
                for (let index = 0; index < digits.length; index++) {
                    const value = values[digits[index]];
                    decimal += value < values[digits[index + 1]] ? -value : value;
                }
            }
            const answer = String(decimal);
            return answer.length === details.passwordLength ? answer : undefined;
        }
        case "110100100": {
            if (typeof details.data !== "string") return undefined;
            const bytes = details.data.trim().split(/\s+/);
            if (bytes.length !== details.passwordLength || !bytes.every(byte => /^[01]{8}$/.test(byte))) {
                return undefined;
            }
            const answer = bytes.map(byte => String.fromCharCode(Number.parseInt(byte, 2))).join("");
            if (!/^[0-9A-Za-z]+$/.test(answer)) return undefined;
            return matchesPassword(details, answer) ? answer : undefined;
        }
        case "PrimeTime 2":
        case "OrdoXenos": {
            const answer = details.modelId === "PrimeTime 2" ? solvePrimeTime(details.data) : decodeOrdoXenos(details.data);
            return answer !== undefined && matchesPassword(details, answer) ? answer : undefined;
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

function sortedDigitOrders(details) {
    if (details.passwordFormat !== "numeric" || typeof details.data !== "string") return [];
    const digits = details.data.trim();
    if (!/^\d{1,3}$/.test(digits) || digits.length !== details.passwordLength) return [];

    let orders = new Set([""]);
    for (const digit of digits) {
        const next = new Set();
        for (const order of orders) {
            for (let index = 0; index <= order.length; index++) {
                next.add(order.slice(0, index) + digit + order.slice(index));
            }
        }
        orders = next;
    }
    return [...orders].filter(order => order === "0" || !order.startsWith("0")).sort();
}

export function puzzleCandidates(details) {
    const dictionary = GAME_PASSWORD_LISTS.get(details.modelId);
    if (dictionary) return dictionary.filter(password => matchesPassword(details, password));
    if (details.modelId === "PHP 5.4") return sortedDigitOrders(details);
    if (details.modelId === "AccountsManager_4.2") {
        const { passwordFormat, passwordLength, passwordHint, difficulty } = details;
        if (passwordFormat !== "numeric" || !Number.isInteger(passwordLength) ||
            passwordLength < 1 || passwordLength > 3) return [];

        const hintCeiling = 10 ** passwordLength;
        if (passwordHint !== "The password is a number between 0 and " + hintCeiling) return [];

        // The displayed ceiling comes from the digit count. Difficulty narrows the generated range.
        const minimum = passwordLength === 1 ? 0 : hintCeiling / 10;
        const configuredCeiling = Number.isFinite(difficulty) && difficulty >= 0
            ? Math.ceil(10 * (difficulty + 3) / 3)
            : hintCeiling;
        const count = Math.max(0, Math.min(hintCeiling, configuredCeiling) - minimum);
        return Array.from({ length: count }, (_, index) => String(minimum + index));
    }
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
    return isFactoriPuzzle(details) || isDeepGreenPuzzle(details) || isOpenWebAccessPointPuzzle(details) ||
        puzzleCandidates(details).length > 0;
}