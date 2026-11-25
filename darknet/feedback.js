import { REPORT_INTERVAL } from "./protocol.js";

const MAX_SEARCHES = 32;

function readPuzzleFeedback(logs, value, parse) {
    for (const line of logs) {
        if (!line.startsWith("{")) continue;
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        if (entry?.code !== 401 || entry.passwordAttempted !== value) continue;
        const feedback = parse(entry.data);
        if (feedback !== undefined) return feedback;
    }
}

/** Return an error message, or undefined once this worker has a session. */
export async function authenticateFeedbackPuzzle(ns, target, details, deadline, searches, heartbeat, solver) {
    const ip = ns.dnsLookup(target);
    if (!ip) return "link lost";
    const signature = [ip, details.modelId, details.difficulty, details.passwordLength, details.passwordFormat].join("/");
    let search = searches.get(target);
    if (search?.signature !== signature) {
        if (!search && searches.size >= MAX_SEARCHES) searches.delete(searches.keys().next().value);
        const guesses = solver.guesses(details, target);
        search = { signature, guesses, next: guesses.next() };
        searches.set(target, search);
    }

    let nextHeartbeat = Date.now() + REPORT_INTERVAL;
    while (!search.next.done) {
        const now = Date.now();
        if (now >= deadline) return "puzzle job expired";
        if (now >= nextHeartbeat) {
            heartbeat?.();
            nextHeartbeat = now + REPORT_INTERVAL;
        }

        const { value, feedback } = search.next.value;
        const result = await ns.dnet.authenticate(target, value);
        if (result.success) {
            searches.delete(target);
            return;
        }
        if (result.code !== 401) return result.message ?? "puzzle rejected";

        let clue;
        if (feedback) {
            if (Date.now() >= deadline) return "puzzle job expired";
            const response = await ns.dnet.heartbleed(target, { peek: true, logsToCapture: 10 });
            if (!response.success) return response.message ?? "puzzle feedback unavailable";
            clue = readPuzzleFeedback(response.logs, value, data => solver.parse(data, details));
            if (clue === undefined) return "puzzle feedback unavailable";
        }
        try {
            search.next = search.guesses.next(clue);
        } catch (error) {
            searches.delete(target);
            return error instanceof Error ? error.message : String(error);
        }
    }

    searches.delete(target);
    return "puzzle rejected";
}
