import test from "node:test";
import assert from "node:assert/strict";
import { authenticateFactori } from "../darknet/factori.js";
import { BUNDLE, WORKER, WORKER_VERSION } from "../darknet/protocol.js";
import { isSupported } from "../darknet/solvers.js";
import { deploy, observeNeighbors } from "../darknet/worker.js";

const target = "cryptolocalhost";
const powers = 64n * 2n ** 2n * 97n ** 3n * 9859n ** 2n;

function factoriFixture(password, difficulty, reply) {
    const submitted = [];
    const details = {
        modelId: "Factori-Os", passwordFormat: "numeric", passwordLength: password.length, difficulty,
        isOnline: true, isConnectedToCurrentServer: true, hasSession: false,
    };
    let hasSession = false;
    let feedback;
    const ns = {
        dnsLookup: () => "10.0.0.1",
        getHostname: () => "nearby",
        getScriptRam: file => file === WORKER ? 10.1 : 5.85,
        getServerMaxRam: () => 16,
        getServerUsedRam: () => 0,
        scp(files, to, from) {
            assert.ok(hasSession);
            assert.deepEqual([files, to, from], [BUNDLE, target, "nearby"]);
            return true;
        },
        exec(file, host, options, ...args) {
            assert.ok(hasSession);
            assert.deepEqual([file, host, options, args],
                [WORKER, target, { threads: 1, preventDuplicates: true }, [10150, 10151, 1, WORKER_VERSION]]);
            return 42;
        },
        dnet: {
            getServerDetails: () => ({ ...details, hasSession }),
            async authenticate(host, value) {
                assert.equal(host, target);
                submitted.push(value);
                const temporary = reply?.(value);
                if (temporary) return temporary;
                if (value === password) {
                    hasSession = true;
                    return { success: true, code: 200 };
                }
                feedback = {
                    code: 401, passwordAttempted: value,
                    data: String(Number(password) % Number(value) === 0),
                };
                return { success: false, code: 401, message: "Unauthorized" };
            },
            async heartbleed(host, options) {
                assert.equal(host, target);
                assert.deepEqual(options, { peek: true, logsToCapture: 10 });
                return { success: true, logs: [
                    "{invalid json",
                    JSON.stringify({ code: 401, passwordAttempted: "different", data: "true" }),
                    JSON.stringify(feedback),
                ] };
            },
        },
    };
    return { ns, details, submitted };
}

test("Factori-Os deploys from the existing worker with its acquired session", async () => {
    const { ns, details, submitted } = factoriFixture("1672", 5);
    assert.ok(isSupported(details));
    assert.equal(await deploy(ns, target, [10150, 10151, 1, WORKER_VERSION]), "worker launched");
    assert.equal(submitted.at(-1), "1672");
});

test("Factori-Os keeps the exact product when the same large prime occurs twice", async () => {
    assert.ok(powers > BigInt(Number.MAX_SAFE_INTEGER));
    assert.equal(BigInt(Number(powers)), powers);
    const { ns, details, submitted } = factoriFixture(String(powers), 30);
    assert.equal(await authenticateFactori(ns, target, details, Infinity, new Map()), undefined);
    assert.ok(submitted.includes(String(9859n ** 2n)));
    assert.equal(submitted.at(-1), String(powers));
});

test("Factori-Os resumes the interrupted divisor and clears its state when solved", async () => {
    let interrupt = true;
    const searches = new Map();
    const { ns, details, submitted } = factoriFixture("1672", 5, value => {
        if (value === "3" && interrupt) return { success: false, code: 408, message: "Request Timeout" };
    });

    assert.equal(await authenticateFactori(ns, target, details, Infinity, searches), "Request Timeout");
    const tried = submitted.length;
    interrupt = false;
    assert.equal(await authenticateFactori(ns, target, details, Infinity, searches), undefined);
    assert.equal(submitted[tried], "3");
    assert.equal(searches.size, 0);
});

test("Factori-Os tries a one-digit puzzle without needing divisibility logs", async () => {
    const { ns, details, submitted } = factoriFixture("0", 0);
    ns.dnet.heartbleed = assert.fail;
    assert.equal(await authenticateFactori(ns, target, details, Infinity, new Map()), undefined);
    assert.deepEqual(submitted, ["0"]);
});


test("workers skip multi-digit Factori feedback when the manager disables it", async () => {
    const { ns, submitted } = factoriFixture("1672", 5);
    ns.dnet.probe = () => [target];
    assert.equal(observeNeighbors(ns, false)[0].supported, false);
    assert.equal(observeNeighbors(ns, true)[0].supported, true);
    assert.equal(await deploy(ns, target, [], false, Infinity, { factoriEnabled: false, searches: new Map() }),
        "Factori feedback disabled");
    assert.deepEqual(submitted, []);

    const single = factoriFixture("7", 1);
    single.ns.dnet.probe = () => [target];
    assert.equal(observeNeighbors(single.ns, false)[0].supported, true);
});
