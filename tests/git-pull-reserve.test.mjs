import test from "node:test";
import assert from "node:assert/strict";
import { main } from "../git-pull.js";

for (const fallback of [false, true]) {
    for (const prefix of ["", "scripts/"]) {
        test(`ordinary update preserves reserve using ${fallback ? "local files" : "GitHub"} in ${prefix || "root"}`, async t => {
            const files = new Map([[prefix + "reserve.txt", "100000000000"], [prefix + "corp.js", "old"]]);
            if (prefix) files.set("reserve.txt", "7000000000");
            const listing = [{ type: "file", path: "reserve.txt" }, { type: "file", path: "corp.js" }];
            t.mock.method(globalThis, "fetch", async () => {
                if (fallback) throw new Error("rate limited");
                return { json: async () => listing };
            });
            const transfers = [];
            const ns = { getScriptName: () => prefix + "git-pull.js", flags: Object.fromEntries,
                ls: () => [...files.keys()], tprint() {}, print() {}, run() {},
                wget: async (url, destination) => {
                    transfers.push([url.split("?")[0], destination]);
                    files.set(destination, destination.endsWith("reserve.txt") ? "0" : "updated");
                    return true;
                },
                read: file => files.get(file), write: (file, body) => files.set(file, body) };
            await main(ns);
            assert.deepEqual(transfers, [["https://raw.githubusercontent.com/NOTsave/bitburne_scripts_ada/main/corp.js", prefix + "corp.js"]]);
            assert.equal(files.get(prefix + "reserve.txt"), "100000000000");
            assert.equal(files.get(prefix + "corp.js"), "updated");
            if (prefix) assert.equal(files.get("reserve.txt"), "7000000000");
        });
    }
}
