import test from "node:test";
import assert from "node:assert/strict";
import { assignJobs, main as manager } from "../darknet-manager.js";
import { main as collect } from "../darknet/collect.js";
import { deploy, observeNeighbors, main as worker } from "../darknet/worker.js";
import { BUNDLE, COLLECTOR, SIGHTING_TTL, WORKER, WORKER_VERSION } from "../darknet/protocol.js";

const ready = { modelId: "ZeroLogon", isOnline: true, isConnectedToCurrentServer: true };

test("schedule one job per host and worker, skipping stale, unknown and cooling-down hosts", () => {
    const neighbors = names => names.map(host => ({host, supported: host !== "unknown"}));
    const now = 2 * SIGHTING_TTL;
    const makeWorker = (host, pid, targets, at = now) => ({host, pid, at, neighbors: neighbors(targets)});
    const workers = new Map([
        ["home", makeWorker("home", 1, ["unknown", "cooling", "darkweb", "spare"])],
        ["other", makeWorker("other", 2, ["darkweb", "home", "next"])],
        ["old", makeWorker("old", 3, ["unseen"], 1)],
    ]);
    const jobs = new Map();
    let id = 0;
    assignJobs(workers, jobs, new Map([["cooling", now + 10]]), now, () => String(++id));
    assert.deepEqual([...jobs].map(([target, job]) => [target, job.worker]), [
        ["darkweb", "home"], ["next", "other"],
    ]);
    assignJobs(workers, jobs, new Map(), now, () => String(++id));
    assert.equal(jobs.size, 2);
});

test("probe tolerates a host vanishing and reports unsupported in-game models", () => {
    const ns = {dnet: {
        probe: () => ["vanished", "moved", "darkweb", "unknown"],
        getServerDetails(host) {
            if (host === "vanished") throw Error("offline");
            if (host === "moved") return {...ready, isConnectedToCurrentServer: false};
            return {...ready, modelId: host === "darkweb" ? ready.modelId : "Other", depth: 1};
        },
    }};
    assert.deepEqual(observeNeighbors(ns).map(item => [item.host, item.supported]), [
        ["darkweb", true], ["unknown", false],
    ]);
});

function deployMock({details = ready, copy = true, launch = 23, unlock = true, used = 11, maxRam = 16} = {}) {
    const calls = [];
    const ns = {
        dnet: {
            getServerDetails: () => details,
            authenticate: async (...args) => { calls.push(["puzzle", ...args]); return {success: unlock}; },
            memoryReallocation: async target => { calls.push(["ram", target]); used -= 5; },
            getBlockedRam: () => used,
        },
        getHostname: () => "home",
        getServerMaxRam: () => maxRam,
        getServerUsedRam: () => used,
        getScriptRam: () => 8,
        scp: (files, ...args) => { calls.push(["copy", files, ...args]); return copy; },
        exec: (...args) => { calls.push(["launch", ...args]); return launch; },
    };
    return {ns, calls};
}

test("resolve the starter game puzzle, reclaim enough RAM and deploy the complete bundle", async () => {
    const {ns, calls} = deployMock();
    assert.equal(await deploy(ns, "darkweb", [50, 51, 1]), "worker launched");
    assert.deepEqual(calls, [
        ["puzzle", "darkweb", ""], ["ram", "darkweb"], ["copy", BUNDLE, "darkweb", "home"],
        ["launch", WORKER, "darkweb", {threads: 1, preventDuplicates: true}, 50, 51, 1],
    ]);
});

test("spare RAM scales puzzle threads while reserving room for the collector", async () => {
    const {ns, calls} = deployMock({used: 8, maxRam: 64});
    assert.equal(await deploy(ns, "darkweb", []), "worker launched");
    assert.equal(calls.find(([kind]) => kind === "launch")[3].threads, 6);
});

test("already open sessions are reused and a copy failure prevents launching", async () => {
    const {ns, calls} = deployMock({details: {...ready, hasSession: true}, copy: false, used: 0});
    assert.equal(await deploy(ns, "darkweb", []), "copy failed");
    assert.deepEqual(calls.map(([op]) => op), ["copy"]);
});

test("lost links, unsupported models, failed puzzles and low RAM never deploy", async () => {
    for (const [options, expected] of [
        [{details: {...ready, isOnline: false}}, "link lost"],
        [{details: {...ready, modelId: "Other"}}, "unsupported model"],
        [{unlock: false}, "puzzle rejected"],
        [{used: 15}, "waiting for RAM"],
    ]) {
        const {ns, calls} = deployMock(options);
        assert.equal(await deploy(ns, "darkweb", []), expected);
        assert.ok(!calls.some(([op]) => op === "copy" || op === "launch"));
    }
});

test("collector reports local rewards, preserves collisions and retries a full port", async () => {
    const copies = [];
    const attempts = [];
    const ns = {
        pid: 12, args: [50, 123], getHostname: () => "darkweb",
        ls: () => ["same.lit", "other.lit", "note.txt", "reward.cache", "worker.js"],
        fileExists: name => name === "same.lit",
        scp: (...args) => { copies.push(args); return true; },
        dnet: {openCache: (...args) => { assert.deepEqual(args, ["reward.cache"]); return {money: 1234}; }},
        tryWritePort: (port, report) => { assert.equal(port, 50); attempts.push(report); return attempts.length > 1; },
        sleep: async () => {},
    };
    await collect(ns);
    assert.deepEqual(copies, [["other.lit", "home", "darkweb"], ["note.txt", "home", "darkweb"]]);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1].offlineEpoch, 123);
    assert.deepEqual(attempts[1].caches, [{name: "reward.cache", reward: {money: 1234}}]);
});

test("worker reports observations, processes its assignment, and doesn't execute it twice", async () => {
    const {ns, calls} = deployMock({used: 0});
    const reports = [];
    const stop = new Error("end of test");
    let ticks = 0;
    Object.assign(ns, {
        pid: 11, args: [50, 51, 123],
        getPortHandle: () => ({peek: () => ({offlineEpoch: 123, jobs: [
            {id: "job", worker: "home", pid: 11, target: "darkweb", expires: Infinity},
        ]})}),
        tryWritePort: (_port, report) => { reports.push(report); return true; },
        sleep: async () => { if (++ticks === 2) throw stop; },
        print: assert.fail,
    });
    ns.dnet.probe = () => ["darkweb"];
    await assert.rejects(worker(ns), error => error === stop);
    assert.equal(calls.filter(([op]) => op === "launch").length, 1);
    assert.equal(reports[1].result.status, "worker launched");
});

test("manager publishes a job, releases it when its worker dies, and schedules a new PID", async () => {
    const stop = new Error("end of test");
    const inbox = [];
    const sent = [];
    const saved = [];
    let cycle = 0;
    let launched = 0;
    const ns = {
        pid: 1,
        flags: () => ({port: 50}),
        getHostname: () => "home",
        getScriptName: () => "darknet-manager.js",
        ps: () => [],
        read: () => "",
        getPortHandle: port => (port === 50 ? {empty: () => inbox.length === 0, read: () => inbox.shift()} : {clear() {}}),
        tryWritePort: (_port, report) => { sent.push(report); return true; },
        disableLog() {},
        fileExists: () => true,
        isRunning: pid => pid === 10 + launched && cycle !== 1,
        run: (_script, _options, _reportPort, _jobPort, offlineEpoch) => {
            const pid = 10 + ++launched;
            inbox.push({type: "heartbeat", version: WORKER_VERSION, host: "home", pid, offlineEpoch, at: Date.now(), free: 12,
                neighbors: [{host: "darkweb", supported: true}]});
            return pid;
        },
        print() {},
        tprint: assert.fail,
        write: (_name, snapshot) => saved.push(JSON.parse(snapshot)),
        sleep: async () => { if (++cycle === 3) throw stop; },
    };
    await assert.rejects(manager(ns), error => error === stop);
    assert.equal(sent[1].jobs[0].pid, 11);
    assert.equal(sent[2].jobs[0].pid, 12);
    assert.equal(saved[0].workers[0].host, "home");
});

test("a Darknet worker starts collection even when it has an exploration assignment", async () => {
    const {ns, calls} = deployMock({used: 0});
    const stop = new Error("end of test");
    Object.assign(ns, {
        pid: 11, args: [50, 51, 123, WORKER_VERSION],
        getHostname: () => "darkweb",
        getPortHandle: () => ({peek: () => ({offlineEpoch: 123, at: Date.now(), jobs: [
            {id: "job", worker: "darkweb", pid: 11, target: "next", expires: Infinity},
        ]})}),
        ls: () => ["reward.cache"],
        isRunning: () => false,
        tryWritePort: () => true,
        run: (...args) => { calls.push(["collect", ...args]); return 24; },
        sleep: async () => { throw stop; },
        print: assert.fail,
    });
    ns.dnet.probe = () => ["next"];

    await assert.rejects(worker(ns), error => error === stop);
    assert.deepEqual(calls[0], ["collect", COLLECTOR, {preventDuplicates: true}, 50, 123]);
    assert.equal(calls[1][0], "puzzle");
});

test("reclaiming local RAM can discover and open a newly generated cache on the next pass", async () => {
    const {ns, calls} = deployMock({used: 13});
    const stop = new Error("end of test");
    let cycles = 0;
    const originalReallocation = ns.dnet.memoryReallocation;
    ns.dnet.memoryReallocation = async (...args) => {
        await originalReallocation(...args);
        return {success: true};
    };
    ns.dnet.probe = () => [];
    Object.assign(ns, {
        pid: 11, args: [50, 51, 123, WORKER_VERSION],
        getHostname: () => "darkweb",
        getPortHandle: () => ({peek: () => ({offlineEpoch: 123, at: Date.now(), jobs: []})}),
        ls: () => cycles ? ["new.cache"] : [],
        isRunning: () => false,
        tryWritePort: () => true,
        run: (...args) => { calls.push(["collect", ...args]); return 24; },
        sleep: async () => { if (++cycles === 2) throw stop; },
        print: assert.fail,
    });

    await assert.rejects(worker(ns), error => error === stop);
    assert.deepEqual(calls, [["ram", undefined], ["collect", COLLECTOR, {preventDuplicates: true}, 50, 123]]);
});

test("manager replaces old workers on its own ports and counts collection results", async () => {
    const stop = new Error("end of test");
    const old = {pid: 20, filename: WORKER, args: [50, 51, 12]};
    const other = {pid: 21, filename: WORKER, args: [60, 61, 12]};
    const inbox = [old, other].map(({pid}) => ({type: "heartbeat", pid, host: "darkweb", offlineEpoch: 12}));
    const killed = [];
    let snapshot;
    const ns = {
        pid: 1, flags: () => ({port: 50}), getHostname: () => "home", getScriptName: () => "darknet-manager.js",
        ps: host => host === "home" ? [] : [old, other],
        read: () => "", disableLog() {}, print() {}, tprint: assert.fail,
        getPortHandle: port => port === 50 ? {empty: () => inbox.length === 0, read: () => inbox.shift()} : {clear() {}},
        tryWritePort: () => true,
        fileExists: () => true,
        run: (_script, _options, _reportPort, _jobPort, offlineEpoch, version) => {
            assert.equal(version, WORKER_VERSION);
            inbox.push({type: "collection", host: "darkweb", offlineEpoch, copied: ["note.lit"], caches: [{}], errors: []});
            return 30;
        },
        kill: pid => { killed.push(pid); return true; },
        write: (_name, data) => { snapshot = JSON.parse(data); },
        sleep: async () => { throw stop; },
    };
    await assert.rejects(manager(ns), error => error === stop);
    assert.deepEqual(killed, [old.pid]);
    assert.deepEqual(snapshot.collected, {files: 1, caches: 1});
});