import { authenticateFeedbackPuzzle } from "./feedback.js";

const DIGITS = "0123456789";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const EMPTY = "_";
const ALPHABETS = new Map([
    ["numeric", DIGITS],
    ["alphabetic", LETTERS],
    ["alphanumeric", DIGITS + LETTERS],
]);

export function isDeepGreenPuzzle(details) {
    const { modelId, passwordFormat, passwordLength } = details;
    return modelId === "DeepGreen" && ALPHABETS.has(passwordFormat) &&
        Number.isInteger(passwordLength) && passwordLength >= 1 && passwordLength <= 10;
}

function parseScore(data, { passwordLength }) {
    if (typeof data !== "string" || !/^\d{1,2},\d{1,2}$/.test(data)) return undefined;
    const [exact, misplaced] = data.split(",").map(Number);
    return exact + misplaced <= passwordLength ? { exact, matches: exact + misplaced } : undefined;
}

function* findSymbols(symbols, present, length) {
    if (present < 0 || present > symbols.length) throw new Error("Inconsistent DeepGreen symbol feedback");
    if (present === 0) return "";
    if (present === symbols.length) return symbols;

    const midpoint = Math.floor(symbols.length / 2);
    const left = symbols.slice(0, midpoint);
    const { matches } = yield { value: left.padEnd(length, EMPTY), feedback: true };
    return (yield* findSymbols(left, matches, length)) +
        (yield* findSymbols(symbols.slice(midpoint), present - matches, length));
}

function* findPositions(symbol, positions, copies, length) {
    if (copies < 0 || copies > positions.length) throw new Error("Inconsistent DeepGreen position feedback");
    if (copies === 0) return [];
    if (copies === positions.length) return positions;

    const midpoint = Math.floor(positions.length / 2);
    const left = positions.slice(0, midpoint);
    const probe = Array(length).fill(EMPTY);
    for (const position of left) probe[position] = symbol;
    const { exact } = yield { value: probe.join(""), feedback: true };
    return [
        ...(yield* findPositions(symbol, left, exact, length)),
        ...(yield* findPositions(symbol, positions.slice(midpoint), copies - exact, length)),
    ];
}

function* deepGreenGuesses({ passwordLength: length, passwordFormat }) {
    const alphabet = ALPHABETS.get(passwordFormat);
    let present = "";

    // Each probe gives the number of distinct symbols present in its group.
    for (let start = 0; start < alphabet.length && present.length < length; start += length) {
        const group = alphabet.slice(start, start + length);
        const { matches } = yield { value: group.padEnd(length, EMPTY), feedback: true };
        present += yield* findSymbols(group, matches, length);
        if (present.length > length) throw new Error("Inconsistent DeepGreen symbol feedback");
    }
    if (!present) throw new Error("No DeepGreen symbols matched");

    const answer = Array(length).fill(EMPTY);
    let available = Array.from({ length }, (_, index) => index);
    for (let index = 0; index < present.length; index++) {
        const symbol = present[index];
        const remainingSymbols = present.length - index - 1;

        let copies = available.length;
        if (remainingSymbols) {
            copies = 1;
            if (available.length > remainingSymbols + 1) {
                const { exact } = yield { value: symbol.repeat(length), feedback: true };
                if (exact < 1 || exact > available.length - remainingSymbols) {
                    throw new Error("Inconsistent DeepGreen repeat count");
                }
                copies = exact;
            }
        }

        // The exact score counts this symbol only at the selected positions.
        const placed = yield* findPositions(symbol, available, copies, length);
        for (const position of placed) answer[position] = symbol;
        available = available.filter(position => answer[position] === EMPTY);
    }

    yield { value: answer.join("") };
}

export function authenticateDeepGreen(ns, target, details, deadline, searches, heartbeat) {
    return authenticateFeedbackPuzzle(ns, target, details, deadline, searches, heartbeat,
        { guesses: deepGreenGuesses, parse: parseScore });
}
