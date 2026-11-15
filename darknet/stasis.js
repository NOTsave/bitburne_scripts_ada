import { WORKER, sendReport } from "./protocol.js";

/** @param {NS} ns */
export async function main(ns) {
    const [reportPort, jobPort, offlineEpoch, version, id] = ns.args;
    const host = ns.getHostname();
    let status;
    try {
        const links = ns.dnet.getStasisLinkedServers();
        if (links.includes(host)) status = "hub already linked";
        else if (links.length) status = "another stasis link is active";
        else {
            const result = await ns.dnet.setStasisLink(true);
            status = result.success ? "stasis linked" : result.message;
        }
    } catch (error) {
        status = String(error);
    }

    sendReport(ns, reportPort, { type: "route", offlineEpoch, result: { id, target: host, status } });
    ns.spawn(WORKER, { spawnDelay: 0, preventDuplicates: true }, reportPort, jobPort, offlineEpoch, version);
}