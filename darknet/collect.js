import { HOME, sendReport } from "./protocol.js";

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname();
    const [port, offlineEpoch] = ns.args;
    const summary = { type: "collection", offlineEpoch, copied: [], caches: [], errors: [] };

    for (const name of ns.ls(host)) {
        try {
            if (name.endsWith(".cache")) {
                const reward = ns.dnet.openCache(name, true);
                summary.caches.push({ name, reward });
            } else if (/\.(lit|txt)$/.test(name) && !ns.fileExists(name, HOME)) {
                if (ns.scp(name, HOME, host)) summary.copied.push(name);
                else summary.errors.push(name);
            }
        } catch (error) {
            summary.errors.push(`${name}: ${String(error)}`);
        }
    }

    if (summary.copied.length || summary.caches.length || summary.errors.length) {
        for (let attempt = 0; attempt < 5; attempt++) {
            if (sendReport(ns, port, summary)) return;
            await ns.sleep(1_000);
        }
        ns.print(JSON.stringify(summary));
    }
}