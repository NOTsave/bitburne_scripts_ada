import test from "node:test";
import assert from "node:assert/strict";
import { main } from "../darknet-manager.js";
import { JOB_TTL, RETRY_DELAY, WORKER, WORKER_VERSION } from "../darknet/protocol.js";
import { main as linkStasis } from "../darknet/stasis.js";
import { main as promoteStock } from "../darknet/stock.js";

const STOP = new Error("end of manager cycle");

function managerFixture({ existing, saved, neighbors = [], options = {}, onSleep, currentNode = 1, runningPids = [] } = {}) {
    const reportPort = options.port ?? 10150;
    const inbox = [];
    const assignments = [];
    const launches = [];
    const snapshots = [];
    const logs = [];
    const running = new Set(runningPids);
    if (existing) running.add(existing.pid);
    const report = (pid, epoch, host = "home", fields = {}) => inbox.push({
        type: "heartbeat", host, pid, version: WORKER_VERSION, offlineEpoch: epoch,
        at: Date.now(), neighbors, ...fields,
    });

    const ns = {
        pid: 10,
        flags: schema => ({ ...Object.fromEntries(schema), ...options }),
        getHostname: () => "home",
        getResetInfo: () => ({ currentNode }),
        getScriptName: () => "darknet-manager.js",
        ps: () => existing ? [existing] : [],
        read: () => saved ? JSON.stringify(saved) : "",
        getPortHandle(port) {
            if (port === reportPort) return { empty: () => !inbox.length, read: () => inbox.shift() };
            assert.equal(port, reportPort + 1);
            return { clear() {} };
        },
        tryWritePort(port, assignment) {
            assert.equal(port, reportPort + 1);
            assignments.push(assignment);
            return true;
        },
        run(script, launchOptions, ...args) {
            launches.push({ script, launchOptions, args });
            running.add(41);
            report(41, args[2]);
            return 41;
        },
        isRunning: pid => running.has(pid),
        fileExists: name => name === "DarkscapeNavigator.exe",
        disableLog() {},
        dnet: { getStasisLinkedServers: () => [] },
        print: line => logs.push(line),
        tprint: assert.fail,
        write(file, snapshot) {
            assert.equal(file, "data/darknet-state.txt");
            snapshots.push(JSON.parse(snapshot));
        },
        sleep: onSleep ?? (async () => { throw STOP; }),
    };
    return { ns, assignments, launches, snapshots, report, inbox, logs, running };
}

test("manager consumes the root heartbeat and publishes a fresh assignment object", async () => {
    const { ns, assignments, launches, snapshots } = managerFixture({
        neighbors: [{ host: "darkweb", supported: true }],
        options: { port: 50, phish: true, "phish-threads": 2 },
    });

    await assert.rejects(main(ns), error => error === STOP);

    assert.equal(launches.length, 1);
    assert.equal(launches[0].script, WORKER);
    const [reportPort, jobPort, epoch, version] = launches[0].args;
    assert.deepEqual([reportPort, jobPort, version], [50, 51, WORKER_VERSION]);
    const plan = assignments.at(-1);
    assert.equal(plan.offlineEpoch, epoch);
    assert.ok(Number.isFinite(plan.at));
    assert.equal(plan.phish, true);
    assert.equal(plan.phishThreads, 2);
    assert.equal(plan.jobs[0].pid, 41);
    assert.equal(plan.jobs[0].target, "darkweb");
    assert.equal(snapshots[0].workers[0].host, "home");
});

test("manager restart adopts the live worker epoch and preserves collection totals", async () => {
    const epoch = 12345;
    const { ns, assignments, launches, snapshots, report } = managerFixture({
        existing: { filename: WORKER, pid: 52, args: [10150, 10151, epoch, WORKER_VERSION] },
        saved: { reportPort: 10150, offlineEpoch: 54321, version: WORKER_VERSION, collected: { files: 4, caches: 2 } },
    });
    report(52, epoch);

    await assert.rejects(main(ns), error => error === STOP);

    assert.deepEqual(launches, []);
    assert.equal(assignments.at(-1).offlineEpoch, epoch);
    assert.equal(snapshots[0].collected.files, 4);
    assert.equal(snapshots[0].collected.caches, 2);
    assert.equal(snapshots[0].workers[0].host, "home");
});

test("manager replaces an older root before launching the current worker", async () => {
    const epoch = 12345;
    const { ns, launches } = managerFixture({
        existing: { filename: WORKER, pid: 52, args: [10150, 10151, epoch, WORKER_VERSION - 1] },
    });
    let stopped;
    const run = ns.run;
    ns.kill = pid => { stopped = pid; return true; };
    ns.run = (...args) => {
        assert.equal(stopped, 52);
        return run(...args);
    };

    await assert.rejects(main(ns), error => error === STOP);

    assert.deepEqual(launches[0].args, [10150, 10151, epoch, WORKER_VERSION]);
});

test("manager replaces older workers on its ports even after an epoch change", async () => {
    const { ns, report, running } = managerFixture({ runningPids: [52, 53] });
    report(52, 12345, "previous", { version: WORKER_VERSION - 1 });
    report(53, 12345, "other-ports", { version: WORKER_VERSION - 1 });
    ns.ps = host => ({
        previous: [{ filename: "/" + WORKER, pid: 52, args: [10150, 10151] }],
        "other-ports": [{ filename: WORKER, pid: 53, args: [10152, 10153] }],
    })[host] ?? [];
    ns.kill = pid => running.delete(pid);

    await assert.rejects(main(ns), error => error === STOP);
    assert.equal(running.has(52), false);
    assert.equal(running.has(53), true);
});

test("stock promotion uses a spare Darknet worker and records a shared report", async t => {
    let now = 100_000;
    let cycles = 0;
    t.mock.method(Date, "now", () => now);
    const epoch = 12345;
    const available = { location: { canPromoteStock: true }, rewards: "no collectibles" };
    const { ns, assignments, snapshots, inbox, report } = managerFixture({
        existing: { filename: WORKER, pid: 52, args: [10150, 10151, epoch, WORKER_VERSION] },
        options: { "stock-symbol": "ecp" },
        runningPids: [53, 54],
        async onSleep() {
            if (++cycles === 1) {
                now += 16_000;
                report(52, epoch, "home", available);
                report(53, epoch, "busy", { ...available, neighbors: [{ host: "new-node", supported: true }] });
                report(54, epoch, "spare", available);
            } else if (cycles === 2) {
                const plan = assignments.at(-1);
                const job = plan.jobs.find(job => job.kind === "stock");
                assert.equal(job.worker, "spare");
                assert.equal(job.symbol, "ECP");
                assert.ok(plan.jobs.some(job => job.worker === "busy" && job.target === "new-node"));
                now += 5_000;
                inbox.push({
                    type: "route", kind: "stock", host: "spare", pid: 80, workerPid: 54, offlineEpoch: epoch,
                    result: { id: job.id, target: job.target, success: true, status: "ECP: Success" },
                });
            } else throw STOP;
        },
    });

    await assert.rejects(main(ns), error => error === STOP);

    assert.deepEqual(snapshots.at(-1).stockPromotion.latest,
        { host: "spare", at: now, success: true, status: "ECP: Success" });
    assert.ok(!assignments.at(-1).jobs.some(job => job.kind === "stock"));
});

test("the one-shot stock worker retries a full report port without repeating the action", async () => {
    const reports = [];
    let actions = 0;
    await promoteStock({
        args: [10150, 12345, "stock-job", "ECP", 54],
        pid: 80,
        getHostname: () => "darkweb",
        dnet: { async promoteStock(symbol) {
            assert.equal(symbol, "ECP");
            actions++;
            return { success: true, message: "Success" };
        } },
        tryWritePort(port, report) {
            assert.equal(port, 10150);
            reports.push(report);
            return reports.length === 2;
        },
        sleep: async () => {},
    });

    assert.equal(actions, 1);
    assert.equal(reports.length, 2);
    assert.equal(reports[1].workerPid, 54);
    assert.equal(reports[1].pid, 80);
    assert.deepEqual(reports[1].result,
        { id: "stock-job", target: "darkweb", success: true, status: "ECP: Success" });
});

test("manager removes dead heartbeats and immediately reassigns their work", async t => {
    let now = 100_000;
    let cycle = 0;
    t.mock.method(Date, "now", () => now);
    const candidates = [{ host: "next", supported: true }];
    const { ns, assignments, snapshots, report, running, logs } = managerFixture({
        runningPids: [53, 54],
        async onSleep() {
            const plan = assignments.at(-1);
            if (++cycle === 1) {
                report(53, plan.offlineEpoch, "departing", { neighbors: candidates });
            } else if (cycle === 2) {
                assert.equal(plan.jobs[0].pid, 53);
                now += 5_000;
                running.delete(53);
                report(53, plan.offlineEpoch, "departing", { neighbors: candidates });
                report(55, plan.offlineEpoch, "already-dead", { neighbors: [{ host: "ghost", supported: true }] });
                report(54, plan.offlineEpoch, "survivor", { neighbors: candidates });
                report(56, plan.offlineEpoch, "survivor");
            } else throw STOP;
        },
    });

    await assert.rejects(main(ns), error => error === STOP);
    assert.deepEqual(assignments.at(-1).jobs.map(job => [job.worker, job.pid, job.target]),
        [["survivor", 54, "next"]]);
    assert.deepEqual(snapshots.at(-1).workers.map(worker => worker.host), ["home", "survivor"]);
    assert.ok(logs.includes("departing → next: assigned worker stopped"));
});

test("expired jobs log a timeout and wait through the retry cooldown", async t => {
    let now = 100_000;
    let cycle = 0;
    let original;
    t.mock.method(Date, "now", () => now);
    const { ns, assignments, report, logs } = managerFixture({
        neighbors: [{ host: "next", supported: true }],
        async onSleep() {
            const plan = assignments.at(-1);
            if (++cycle === 1) {
                original = plan.jobs[0];
                now = original.expires;
                report(41, plan.offlineEpoch, "home", {
                    result: { id: original.id, target: "next", status: "late success" },
                });
            } else if (cycle === 2 || cycle === 3) {
                assert.deepEqual(plan.jobs, []);
                now = original.expires + RETRY_DELAY - (cycle === 2 ? 1 : 0);
                report(41, plan.offlineEpoch);
            } else throw STOP;
        },
    });

    await assert.rejects(main(ns), error => error === STOP);
    assert.deepEqual(logs, ["home → next: job expired"]);
    const [retry] = assignments.at(-1).jobs;
    assert.equal(retry.target, "next");
    assert.notEqual(retry.id, original.id);
});

test("only the assigned worker can finish a deployment job", async t => {
    let now = 100_000;
    let cycle = 0;
    let result;
    t.mock.method(Date, "now", () => now);
    const { ns, assignments, report, logs } = managerFixture({
        runningPids: [53, 54, 55],
        async onSleep() {
            const plan = assignments.at(-1);
            if (++cycle === 1) {
                report(53, plan.offlineEpoch, "owner", { neighbors: [{ host: "target", supported: true }] });
            } else if (cycle === 2) {
                const [job] = plan.jobs;
                result = { id: job.id, target: "target", status: "worker launched" };
                now += 5_000;
                report(54, plan.offlineEpoch, "target", { result });
                report(55, plan.offlineEpoch, "owner", { result });
            } else if (cycle === 3) {
                assert.equal(plan.jobs[0].id, result.id);
                now += 5_000;
                report(53, plan.offlineEpoch, "owner", { result });
            } else throw STOP;
        },
    });

    await assert.rejects(main(ns), error => error === STOP);
    assert.deepEqual(assignments.at(-1).jobs, []);
    assert.deepEqual(logs, ["owner → target: worker launched"]);
});

test("an acknowledged stasis handoff can outlive its original worker", async t => {
    let now = 100_000;
    let cycle = 0;
    let handoff;
    t.mock.method(Date, "now", () => now);
    const { ns, report, assignments, snapshots, inbox, running } = managerFixture({
        runningPids: [53],
        async onSleep() {
            const plan = assignments.at(-1);
            if (++cycle === 1) {
                report(53, plan.offlineEpoch, "anchor", { location: { depth: 2, movable: true, canAnchor: true } });
            } else if (cycle === 2) {
                [handoff] = plan.jobs;
                assert.equal(handoff.kind, "stasis");
                now += 5_000;
                running.delete(53);
                inbox.push({ type: "handoff", host: "anchor", pid: 53, offlineEpoch: plan.offlineEpoch, id: handoff.id });
                inbox.push({ type: "route", kind: "stasis", host: "anchor", pid: 80, workerPid: 54,
                    offlineEpoch: plan.offlineEpoch, result: { id: handoff.id, target: "anchor", status: "wrong owner" } });
            } else if (cycle === 3) {
                assert.equal(plan.jobs[0].id, handoff.id);
                assert.ok(!snapshots.at(-1).workers.some(worker => worker.host === "anchor"));
                now += 30_000;
                await linkStasis({
                    pid: 80, args: [10150, 10151, plan.offlineEpoch, WORKER_VERSION, handoff.id, 53],
                    getHostname: () => "anchor",
                    dnet: { getStasisLinkedServers: () => [], async setStasisLink() { return { success: true }; } },
                    tryWritePort(port, report) { inbox.push(report); return true; },
                    spawn(script) { assert.equal(script, WORKER); },
                });
            } else throw STOP;
        },
    });

    await assert.rejects(main(ns), error => error === STOP);
    assert.deepEqual(assignments.at(-1).jobs, []);
    assert.deepEqual(snapshots.at(-1).routing.lastAction,
        { kind: "stasis", host: "anchor", target: "anchor", status: "stasis linked" });
});

test("worker history expires unless retained by a live job or a stasis link", async t => {
    let now = 100_000;
    let cycle = 0;
    const epoch = 12345;
    t.mock.method(Date, "now", () => now);
    const { ns, report, snapshots, assignments, inbox } = managerFixture({
        existing: { filename: WORKER, pid: 52, args: [10150, 10151, epoch, WORKER_VERSION] },
        runningPids: [53, 54, 55],
        async onSleep() {
            const [job] = assignments.at(-1).jobs;
            if (++cycle === 1 || cycle === 2) {
                assert.equal(job.kind, "lab");
                assert.equal(job.pid, 55);
                now += cycle === 1 ? JOB_TTL - 5_000 : 10_000;
                if (cycle === 1) inbox.push({ type: "lab", host: "guide", target: job.target, pid: 80, workerPid: 55,
                    offlineEpoch: epoch, id: job.id, status: "Navigating", at: now });
            } else throw STOP;
        },
    });
    ns.dnet.getStasisLinkedServers = () => ["linked"];
    ns.dnet.getServerDetails = () => ({ isOnline: false });
    report(53, epoch, "old");
    report(54, epoch, "linked");
    report(55, epoch, "guide", { location: { canNavigate: true }, neighbors: [{ host: "maze", lab: true }] });

    await assert.rejects(main(ns), error => error === STOP);
    assert.deepEqual(snapshots.at(-1).workers.map(({ host, stale }) => [host, stale]),
        [["linked", true], ["guide", true]]);
    assert.equal(assignments.at(-1).jobs[0].kind, "lab");
});


test("manager requires opt-in for puzzle feedback in BitNode 15", async () => {
    for (const [currentNode, options, expected] of [
        [1, {}, [true, true]],
        [15, {}, [false, false]],
        [15, { factori: true }, [true, false]],
        [15, { "puzzle-feedback": true }, [true, true]],
    ]) {
        const { ns, assignments } = managerFixture({ currentNode, options });
        await assert.rejects(main(ns), error => error === STOP);
        const plan = assignments.at(-1);
        assert.deepEqual([plan.factoriFeedback, plan.puzzleFeedback], expected);
    }
});
