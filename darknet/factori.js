import { REPORT_INTERVAL } from "./protocol.js";

// Bitburner 3.0.1 uses small primes and, at higher difficulty, a fixed pool of large primes.
// See src/DarkNet/controllers/ServerGenerator.ts in the v3.0.1 game source.
const SMALL_PRIMES = [
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
];
const LARGE_PRIMES = [
    1069, 1409, 1471, 1567, 1597, 1601, 1697, 1747, 1801, 1889, 1979, 1999, 2063, 2207, 2371, 2503, 2539,
    2693, 2741, 2753, 2801, 2819, 2837, 2909, 2939, 3169, 3389, 3571, 3761, 3881, 4217, 4289, 4547, 4729,
    4789, 4877, 4943, 4951, 4957, 5393, 5417, 5419, 5441, 5519, 5527, 5647, 5779, 5881, 6007, 6089, 6133,
    6389, 6451, 6469, 6547, 6661, 6719, 6841, 7103, 7549, 7559, 7573, 7691, 7753, 7867, 8053, 8081, 8221,
    8329, 8599, 8677, 8761, 8839, 8963, 9103, 9199, 9343, 9467, 9551, 9601, 9739, 9749, 9859,
];
const MAX_SEARCHES = 32;

export function isFactoriPuzzle(details) {
    const { modelId, passwordFormat, passwordLength, difficulty } = details;
    return modelId === "Factori-Os" && passwordFormat === "numeric" &&
        Number.isSafeInteger(passwordLength) && passwordLength >= 1 && passwordLength <= 20 &&
        Number.isFinite(difficulty) && difficulty >= 0;
}

function* factoriGuesses({ passwordLength, difficulty }) {
    if (passwordLength === 1) {
        for (const value of "0123456789") yield { value, divisor: false };
        return;
    }

    // Keep the product exact even when the generated password exceeds MAX_SAFE_INTEGER.
    const ceiling = 10n ** BigInt(passwordLength);
    let product = 1n;
    let largeRemaining = difficulty > 24 ? 2 : difficulty > 12 ? 1 : 0;
    for (const group of [SMALL_PRIMES, LARGE_PRIMES]) {
        const large = group === LARGE_PRIMES;
        for (const factor of group) {
            if (large && !largeRemaining) break;
            const prime = BigInt(factor);
            let power = prime;
            while (product * prime < ceiling && (!large || largeRemaining)) {
                // The game tests divisibility using Number. Stop before a probe loses precision.
                if (!Number.isSafeInteger(Number(power))) break;
                if (!(yield { value: String(power), divisor: true })) break;
                product *= prime;
                if (large) largeRemaining--;
                const value = String(product);
                if (!largeRemaining && product !== power && value.length === passwordLength) {
                    yield { value, divisor: false };
                }
                power *= prime;
            }
        }
    }
}

function readDivisibility(logs, value) {
    for (const line of logs) {
        if (!line.startsWith("{")) continue;
        try {
            const entry = JSON.parse(line);
            if (entry?.code !== 401 || entry.passwordAttempted !== value) continue;
            if (entry.data === "true") return true;
            if (entry.data === "false") return false;
        } catch {
            // Ordinary in-game log noise is mixed into the response.
        }
    }
}

/** Return an error message, or undefined once this worker has a session. */
export async function authenticateFactori(ns, target, details, deadline, searches, heartbeat) {
    const ip = ns.dnsLookup(target);
    if (!ip) return "link lost";
    const signature = [ip, details.difficulty, details.passwordLength].join("/");
    let search = searches.get(target);
    if (search?.signature !== signature) {
        if (!search && searches.size >= MAX_SEARCHES) searches.delete(searches.keys().next().value);
        const guesses = factoriGuesses(details);
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

        const { value, divisor } = search.next.value;
        const result = await ns.dnet.authenticate(target, value);
        if (result.success) {
            searches.delete(target);
            return;
        }
        if (result.code !== 401) return result.message ?? "puzzle rejected";

        let divisible;
        if (divisor) {
            if (Date.now() >= deadline) return "puzzle job expired";
            const feedback = await ns.dnet.heartbleed(target, { peek: true, logsToCapture: 10 });
            if (!feedback.success) return feedback.message ?? "divisibility feedback unavailable";
            divisible = readDivisibility(feedback.logs, value);
            if (divisible === undefined) return "divisibility feedback unavailable";
        }
        search.next = search.guesses.next(divisible);
    }

    searches.delete(target);
    return "puzzle rejected";
}
