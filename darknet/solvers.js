// Game puzzle answers only. undefined means this model needs its own solver.
export function puzzleAnswer(details) {
    if (details.modelId === "ZeroLogon") return "";
    return undefined;
}

export function isSupported(details) {
    return puzzleAnswer(details) !== undefined;
}