import test from "node:test";
import assert from "node:assert/strict";
import { main } from "../darknet-manager.js";
import { WORKER, WORKER_VERSION } from "../darknet/protocol.js";
import { main as promoteStock } from "../darknet/stock.js";

const STOP = new Error("end of manager cycle");

function managerFixture({ existing, saved, neighbors = [], options = {}, onSleep, currentNode = 1 } = {}) {
    const reportPort = options.port ?? 10150;
    const inbox = [];
    const assignments = [];
    const launches = [];
    const snapshots = [];
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
            report(41, args[2]);
            return 41;
        },
        isRunning: pid => pid === 41 || pid === existing?.pid,
        fileExists: name => name === "DarkscapeNavigator.exe",
        disableLog() {},
        dnet: { getStasisLinkedServers: () => [] },
        print() {},
        tprint: assert.fail,
        write(file, snapshot) {
            assert.equal(file, "data/darknet-state.txt");
            snapshots.push(JSON.parse(snapshot));
        },
        sleep: onSleep ?? (async () => { throw STOP; }),
    };
    return { ns, assignments, launches, snapshots, report, inbox };
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

test("stock promotion uses a spare Darknet worker and records a shared report", async t => {
    let now = 100_000;
    let cycles = 0;
    t.mock.method(Date, "now", () => now);
    const epoch = 12345;
    const available = { location: { canPromoteStock: true }, rewards: "no collectibles" };
    const { ns, assignments, snapshots, inbox, report } = managerFixture({
        existing: { filename: WORKER, pid: 52, args: [10150, 10151, epoch, WORKER_VERSION] },
        options: { "stock-symbol": "ecp" },
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
                    type: "route", host: "spare", offlineEpoch: epoch,
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
        args: [10150, 12345, "stock-job", "ECP"],
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
    assert.deepEqual(reports[1].result,
        { id: "stock-job", target: "darkweb", success: true, status: "ECP: Success" });
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
        assert.deepEqual([plan.factoriFeedback, plan.deepGreenFeedback], expected);
    }
});
