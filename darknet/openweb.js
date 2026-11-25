import { authenticateFeedbackPuzzle } from "./feedback.js";

const FORMATS = new Set(["numeric", "alphabetic", "alphanumeric"]);
const MAX_PACKET_SAMPLES = 4;

export function isOpenWebAccessPointPuzzle(details) {
    const { modelId, passwordFormat, passwordLength, difficulty } = details;
    return modelId === "OpenWebAccessPoint" && FORMATS.has(passwordFormat) &&
        Number.isInteger(passwordLength) && passwordLength >= 1 && passwordLength <= 9 &&
        Number.isFinite(difficulty) && difficulty >= 0;
}

function matchesFormat(value, format) {
    if (/[^0-9A-Za-z]/.test(value)) return false;
    const hasDigits = /[0-9]/.test(value);
    const hasLetters = /[A-Za-z]/.test(value);
    if (hasDigits && hasLetters) return format === "alphanumeric";
    return format === (hasDigits ? "numeric" : "alphabetic");
}

function labeledCandidates(packet, host, length, format) {
    const candidates = new Set();
    // The game includes the entire hostname, which can itself contain colons.
    const marker = " " + host + ":";
    for (let index = packet.indexOf(marker); index !== -1; index = packet.indexOf(marker, index + 1)) {
        const start = index + marker.length;
        const end = start + length;
        const value = packet.slice(start, end);
        if (packet[end] === " " && matchesFormat(value, format)) candidates.add(value);
    }
    return candidates;
}

function unlabeledCandidates(packet, length, format) {
    const candidates = new Set();
    for (let start = 0; start + length <= packet.length; start++) {
        const value = packet.slice(start, start + length);
        if (matchesFormat(value, format)) candidates.add(value);
    }
    return candidates;
}

function* openWebGuesses({ passwordLength: length, passwordFormat: format, difficulty }, target) {
    if (difficulty <= 16) {
        const packet = yield { value: "_", feedback: true };
        const candidates = labeledCandidates(packet, target, length, format);
        if (!candidates.size) throw new Error("OpenWebAccessPoint packet is missing the labeled clue");
        for (const value of candidates) yield { value };
        return;
    }

    // Deep packets embed the answer in independently generated noise.
    let candidates;
    for (let sample = 0; sample < MAX_PACKET_SAMPLES; sample++) {
        const packet = yield { value: "_".repeat(sample + 1), feedback: true };
        const present = unlabeledCandidates(packet, length, format);
        candidates = candidates ? new Set([...candidates].filter(value => present.has(value))) : present;
        if (!candidates.size) throw new Error("OpenWebAccessPoint packet clues disagree");
        if (candidates.size === 1 || (sample > 0 && candidates.size <= 6)) break;
    }
    for (const value of candidates) yield { value };
}

function parsePacket(data, { passwordLength }) {
    return typeof data === "string" && data.length >= passwordLength ? data : undefined;
}

export function authenticateOpenWebAccessPoint(ns, target, details, deadline, searches, heartbeat) {
    return authenticateFeedbackPuzzle(ns, target, details, deadline, searches, heartbeat,
        { guesses: openWebGuesses, parse: parsePacket });
}
