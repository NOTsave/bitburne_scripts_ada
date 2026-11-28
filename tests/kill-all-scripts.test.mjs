import test from "node:test";
import assert from "node:assert/strict";
import { main } from "../kill-all-scripts.js";

test("skips empty hosts and waits for remote processes before removing scripts", async () => {
    const neighbors = { home: ["busy", "empty"], busy: ["home"], empty: ["home"] };
    const processes = { busy: [{ pid: 2 }], empty: [] };
    const actions = [];
    await main({
        getHostname: () => "home",
        scan: host => neighbors[host],
        print() {},
        ps: host => processes[host],
        killall: host => actions.push(["kill", host]),
        async sleep(ms) {
            actions.push(["sleep", ms]);
            processes.busy.pop();
        },
        ls: () => ["worker.js"],
        rm: (file, host) => actions.push(["rm", file, host]),
    });
    assert.deepEqual(actions, [
        ["kill", "busy"],
        ["rm", "worker.js", "empty"],
        ["sleep", 20],
        ["rm", "worker.js", "busy"],
        ["kill", "home"],
    ]);
});
