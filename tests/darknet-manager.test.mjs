import test from "node:test";
import assert from "node:assert/strict";
import { main } from "../darknet-manager.js";
import { WORKER, WORKER_VERSION } from "../darknet/protocol.js";

const STOP = new Error("end of manager cycle");

function managerFixture({ existing, saved, neighbors = [], options = {}, onSleep } = {}) {
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
    return { ns, assignments, launches, snapshots, report };
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
