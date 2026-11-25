import test from "node:test";
import assert from "node:assert/strict";
import { authenticateDeepGreen } from "../darknet/deepgreen.js";
import { BUNDLE, WORKER, WORKER_VERSION } from "../darknet/protocol.js";
import { isSupported } from "../darknet/solvers.js";
import { deploy, observeNeighbors } from "../darknet/worker.js";

const target = "cryptic_neon$gene5i5";

function mastermindScore(password, guess) {
    let exact = 0;
    const unmatched = new Map();
    const wrongPositions = [];
    for (let index = 0; index < password.length; index++) {
        if (password[index] === guess[index]) {
            exact++;
        } else {
            unmatched.set(password[index], (unmatched.get(password[index]) ?? 0) + 1);
            wrongPositions.push(guess[index]);
        }
    }
    let misplaced = 0;
    for (const symbol of wrongPositions) {
        const available = unmatched.get(symbol);
        if (!available) continue;
        unmatched.set(symbol, available - 1);
        misplaced++;
    }
    return exact + "," + misplaced;
}

function fixture(password, format, beforeReply) {
    let session = false;
    let clue;
    const submitted = [];
    const details = {
        modelId: "DeepGreen", passwordFormat: format, passwordLength: password.length, difficulty: 4,
        isOnline: true, isConnectedToCurrentServer: true, hasSession: false,
    };
    const ns = {
        dnsLookup: () => "10.0.0.2",
        getHostname: () => "nearby",
        getScriptRam: file => file === WORKER ? 10.1 : 5.85,
        getServerMaxRam: () => 16,
        getServerUsedRam: () => 0,
        scp(files, to, from) {
            assert.ok(session);
            assert.deepEqual([files, to, from], [BUNDLE, target, "nearby"]);
            return true;
        },
        exec(file, host, options, ...args) {
            assert.ok(session);
            assert.deepEqual([file, host, options, args],
                [WORKER, target, { threads: 1, preventDuplicates: true }, [10150, 10151, 1, WORKER_VERSION]]);
            return 43;
        },
        dnet: {
            probe: () => [target],
            getServerDetails: () => ({ ...details, hasSession: session }),
            async authenticate(host, value) {
                assert.equal(host, target);
                assert.equal(value.length, password.length);
                submitted.push(value);
                const response = beforeReply?.(submitted.length);
                if (response) return response;
                if (value === password) {
                    session = true;
                    return { success: true, code: 200 };
                }
                clue = JSON.stringify({ code: 401, passwordAttempted: value, data: mastermindScore(password, value) });
                return { success: false, code: 401, message: "Unauthorized" };
            },
            async heartbleed(_host, options) {
                assert.deepEqual(options, { peek: true, logsToCapture: 10 });
                return { success: true, logs: ["{other noise", clue] };
            },
        },
    };
    return { ns, details, submitted };
}

test("DeepGreen solves numeric, alphabetic, and mixed codes with repeated symbols", async () => {
    for (const [password, format] of [
        ["101081", "numeric"], ["0123456789", "numeric"], ["zzzz", "alphabetic"],
        ["zAZaAZzZaa", "alphabetic"], ["Z9zZZ0aB9B", "alphanumeric"], ["7", "numeric"],
    ]) {
        const { ns, details, submitted } = fixture(password, format);
        assert.ok(isSupported(details));
        assert.equal(await authenticateDeepGreen(ns, target, details, Infinity, new Map()), undefined);
        assert.equal(submitted.at(-1), password);
        assert.ok(submitted.length <= 80);
    }
});

test("DeepGreen resumes the same probe after a temporary timeout", async () => {
    const searches = new Map();
    const { ns, details, submitted } = fixture("3727", "numeric", index =>
        index === 3 ? { success: false, code: 408, message: "Request Timeout" } : undefined);
    assert.equal(await authenticateDeepGreen(ns, target, details, Infinity, searches), "Request Timeout");
    const interrupted = submitted.at(-1);
    assert.equal(await authenticateDeepGreen(ns, target, details, Infinity, searches), undefined);
    assert.equal(submitted[3], interrupted);
    assert.equal(searches.size, 0);
});

test("DeepGreen keeps worker feedback opt-in and reuses the successful session for deployment", async () => {
    const { ns, submitted } = fixture("a9a", "alphanumeric");
    assert.equal(observeNeighbors(ns, true, false)[0].supported, false);
    assert.equal(observeNeighbors(ns, false, true)[0].supported, true);
    const workerArgs = [10150, 10151, 1, WORKER_VERSION];
    assert.equal(await deploy(ns, target, workerArgs, false, Infinity, { puzzleEnabled: false, searches: new Map() }),
        "DeepGreen feedback disabled");
    assert.deepEqual(submitted, []);
    assert.equal(await deploy(ns, target, workerArgs), "worker launched");
    assert.ok(BUNDLE.includes("darknet/feedback.js"));
    assert.ok(BUNDLE.includes("darknet/deepgreen.js"));
});
