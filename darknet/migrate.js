import { REPORT_INTERVAL, sendReport } from "./protocol.js";

/** @param {NS} ns */
export async function main(ns) {
    const [reportPort, jobPort, offlineEpoch, id, target, riderPid] = ns.args;
    const host = ns.getHostname();
    let status = "migration charge sent";
    try {
        const jobs = ns.getPortHandle(jobPort);
        const initialDepth = ns.dnet.getServerDetails(target).depth;
        for (let batchStep = 0; batchStep < 8; batchStep++) {
            const plan = jobs.peek();
            if (plan?.offlineEpoch !== offlineEpoch || Date.now() - plan.at >= 2 * REPORT_INTERVAL ||
                !plan.jobs.some(job => job.id === id && job.expires > Date.now())) {
                status = "migration job ended";
                break;
            }
            const links = ns.dnet.getStasisLinkedServers();
            if (!links.includes(host) || links.includes(target) || !ns.isRunning(riderPid)) {
                status = "migration paused: hub or rider unavailable";
                break;
            }
            const details = ns.dnet.getServerDetails(target);
            if (!details.isOnline || !details.isConnectedToCurrentServer || details.depth !== initialDepth) {
                status = "explorer left the hub's neighborhood";
                break;
            }
            if (details.isStationary) {
                status = "explorer cannot migrate";
                break;
            }
            const result = await ns.dnet.induceServerMigration(target);
            if (!result.success) {
                status = result.message;
                break;
            }
        }
    } catch (error) {
        status = String(error);
    }
    sendReport(ns, reportPort, { type: "route", offlineEpoch, result: { id, target, status } });
}