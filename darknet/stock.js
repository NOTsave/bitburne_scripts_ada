import { sendReport } from "./protocol.js";

/** @param {NS} ns */
export async function main(ns) {
    const [reportPort, offlineEpoch, id, symbol] = ns.args;
    const host = ns.getHostname();
    let success = false;
    let status;
    try {
        const result = await ns.dnet.promoteStock(symbol);
        success = result.success;
        status = `${symbol}: ${result.message}`;
    } catch (error) {
        status = `${symbol}: ${String(error)}`;
    }
    const report = { type: "route", offlineEpoch, result: { id, target: host, success, status } };
    for (let attempt = 0; attempt < 3; attempt++) {
        if (sendReport(ns, reportPort, report)) return;
        if (attempt < 2) await ns.sleep(500);
    }
}
