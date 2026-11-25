import test from "node:test";
import assert from "node:assert/strict";
import { authenticateOpenWebAccessPoint } from "../darknet/openweb.js";
import { BUNDLE, WORKER, WORKER_VERSION } from "../darknet/protocol.js";
import { isSupported } from "../darknet/solvers.js";
import { deploy, observeNeighbors } from "../darknet/worker.js";

const target = 'snoitu1os::(1animret)$';
const workerArgs = [10150, 10151, 1, WORKER_VERSION];

function fixture(password, format, difficulty, packets, beforeReply) {
    let session = false;
    let packetIndex = 0;
    let clue;
    const submitted = [];
    const details = {
        modelId: "OpenWebAccessPoint", passwordFormat: format, passwordLength: password.length, difficulty,
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
                [WORKER, target, { threads: 1, preventDuplicates: true }, workerArgs]);
            return 44;
        },
        dnet: {
            probe: () => [target],
            getServerDetails: () => ({ ...details, hasSession: session }),
            async authenticate(host, value) {
                assert.equal(host, target);
                submitted.push(value);
                const response = beforeReply?.(submitted.length);
                if (response) return response;
                if (value === password) {
                    session = true;
                    return { success: true, code: 200 };
                }
                clue = JSON.stringify({ code: 401, passwordAttempted: value, data: packets[packetIndex] });
                if (/^_+$/.test(value)) packetIndex++;
                return { success: false, code: 401, message: "Unauthorized" };
            },
            async heartbleed(host, options) {
                assert.equal(host, target);
                assert.deepEqual(options, { peek: true, logsToCapture: 10 });
                return { success: true, logs: ["{unrelated noise", clue] };
            },
        },
    };
    return { ns, details, submitted };
}

test("labeled OpenWebAccessPoint packets match the full host and deploy from the existing worker", async () => {
    const { ns, details, submitted } = fixture("a9Z", "alphanumeric", 16,
        [" prefix" + target + ":f9B " + target + ":555 " + target + ":b2X4 " + target + ":a9Z suffix"]);
    assert.ok(isSupported(details));
    assert.equal(observeNeighbors(ns, true, false)[0].supported, false);
    assert.equal(observeNeighbors(ns, false, true)[0].supported, true);
    assert.equal(await deploy(ns, target, workerArgs, false, Infinity, { puzzleEnabled: false, searches: new Map() }),
        "OpenWebAccessPoint feedback disabled");
    assert.deepEqual(submitted, []);
    assert.equal(await deploy(ns, target, workerArgs), "worker launched");
    assert.deepEqual(submitted, ["_", "a9Z"]);
    assert.ok(BUNDLE.includes("darknet/openweb.js"));
});

test("unlabeled packets intersect independent samples and resume an interrupted sample", async () => {
    const searches = new Map();
    const { ns, details, submitted } = fixture("0Qx", "alphanumeric", 17,
        ["5aBc8Gf0QxaB2", "Y9z0Qx2k"], index =>
            index === 2 ? { success: false, code: 408, message: "Request Timeout" } : undefined);
    assert.equal(await authenticateOpenWebAccessPoint(ns, target, details, Infinity, searches), "Request Timeout");
    assert.equal(await authenticateOpenWebAccessPoint(ns, target, details, Infinity, searches), undefined);
    assert.deepEqual(submitted, ["_", "__", "__", "0Qx"]);
    assert.equal(searches.size, 0);
});

test("unlabeled one-digit puzzles retain candidates after collecting several samples", async () => {
    const { ns, details, submitted } = fixture("0", "numeric", 40,
        ["1234567890", "1234567890", "1234567890", "1234567890"]);
    assert.equal(await authenticateOpenWebAccessPoint(ns, target, details, Infinity, new Map()), undefined);
    assert.deepEqual(submitted.slice(0, 4), ["_", "__", "___", "____"]);
    assert.equal(submitted.at(-1), "0");
});

test("a packet without the expected host label fails cleanly without submitting a candidate", async () => {
    const searches = new Map();
    const { ns, details, submitted } = fixture("99", "numeric", 8, [" wrong-host:99 "]);
    assert.equal(await authenticateOpenWebAccessPoint(ns, target, details, Infinity, searches),
        "OpenWebAccessPoint packet is missing the labeled clue");
    assert.equal(searches.size, 0);
    assert.deepEqual(submitted, ["_"]);
});
