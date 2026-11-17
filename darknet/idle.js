import { HOME, sendReport } from "./protocol.js";

/** @param {NS} ns */
export async function main(ns) {
    const [reportPort, offlineEpoch] = ns.args;
    if (ns.getHostname() === HOME) return;

    const { success, code, message } = await ns.dnet.phishingAttack();
    const payload = { type: "idle", offlineEpoch, success, code, message, completedAt: Date.now() };
    for (let reportRetry = 0; reportRetry < 5; reportRetry++) {
        if (sendReport(ns, reportPort, payload)) return;
        await ns.sleep(1_000);
    }
    ns.print(message);
}