import test from "node:test";
import assert from "node:assert/strict";
import { main as inspectCorporation } from "../corp.js";
import { createCorporationSupervisor } from "../corp-supervisor.js";

test("one-shot inspection reports formation status without waiting for a market cycle", async () => {
    for (const result of ["InsufficientFunds", "Success"]) {
        const messages = [];
        let heartbeat;
        const ns = { args: ["--once", "--preset", "bn3"], pid: 1,
            getHostname: () => "home", getScriptName: () => "corp.js", ps: () => [],
            corporation: { hasCorporation: () => false, canCreateCorporation: () => result },
            write: (_file, text) => { heartbeat = JSON.parse(text); },
            print() {}, tprint: message => messages.push(message) };
        await inspectCorporation(ns);
        assert.equal(heartbeat.stage, "NO_CORP");
        assert.match(messages.join(" "), result === "Success" ? /Create AutoCorp/ : /InsufficientFunds/);
    }
});

test("root and subfolder supervisors wait for inspection to finish, then launch the sibling once", () => {
    for (const directory of ["", "scripts/"]) {
        const script = directory + "corp.js";
        const launches = [];
        let processes = [{ filename: "/" + script, args: ["--once"], pid: 2 }];
        const ns = { getScriptName: () => "/" + directory + "corp-supervisor.js", ps: () => processes,
            getScriptRam: file => file === script ? 100 : 0, getServerMaxRam: () => 256, getServerUsedRam: () => 10,
            exec: (file, host, threads, ...args) => {
                launches.push({ file, host, threads, args });
                processes = [{ filename: file, args, pid: 3 }];
                return 3;
            } };
        const supervise = createCorporationSupervisor();
        const config = { preset: "auto", headroom: 32, funding: "off", growth: "off", supply: "auto" };
        assert.equal(supervise(ns, config).state, "dry-run");
        assert.equal(launches.length, 0);
        processes = [{ filename: "other/corp.js", args: ["--apply"], pid: 4 }];
        assert.equal(supervise(ns, config).state, "other-installation");
        processes = [];
        assert.equal(supervise(ns, config).state, "launched");
        assert.equal(supervise(ns, config).state, "running");
        assert.equal(launches.length, 1);
        assert.equal(launches[0].file, script);
        assert.ok(launches[0].args.includes("--apply"));
    }
});
