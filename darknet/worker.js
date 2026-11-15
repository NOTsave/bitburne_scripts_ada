import { BUNDLE, COLLECTOR, HOME, REPORT_INTERVAL, WORKER, sendReport } from "./protocol.js";
import { isSupported, puzzleAnswer } from "./solvers.js";

export function freeRam(ns, host) {
    return Math.max(0, ns.getServerMaxRam(host) - ns.getServerUsedRam(host));
}

export function observeNeighbors(ns) {
    const neighbors = [];
    for (const host of ns.dnet.probe()) {
        try {
            const details = ns.dnet.getServerDetails(host);
            if (!details.isConnectedToCurrentServer || !details.isOnline) continue;
            neighbors.push({
                host,
                model: details.modelId,
                depth: details.depth,
                supported: isSupported(details) || details.hasSession === true,
            });
        } catch {
            // A neighbor can vanish between probe and getServerDetails.
        }
    }
    return neighbors;
}

export async function deploy(ns, target, workerArgs) {
    const details = ns.dnet.getServerDetails(target);
    if (!details.isOnline || !details.isConnectedToCurrentServer) return "link lost";

    if (!details.hasSession) {
        const answer = puzzleAnswer(details);
        if (answer === undefined) return "unsupported model";
        const result = await ns.dnet.authenticate(target, answer);
        if (!result.success) return "puzzle rejected";
    }

    const workerRam = ns.getScriptRam(WORKER, ns.getHostname());
    if (freeRam(ns, target) < workerRam && ns.dnet.getBlockedRam(target) > 0) {
        await ns.dnet.memoryReallocation(target);
    }
    const available = freeRam(ns, target);
    if (workerRam <= 0 || available < workerRam) return "waiting for RAM";

    // Authentication runs faster with more threads. Keep enough RAM to open caches.
    const collectorRam = ns.getScriptRam(COLLECTOR, ns.getHostname());
    const threads = Math.max(1, Math.min(8, Math.floor((available - collectorRam) / workerRam)));
    if (!ns.scp(BUNDLE, target, ns.getHostname())) return "copy failed";
    const pid = ns.exec(WORKER, target, { threads, preventDuplicates: true }, ...workerArgs);
    return pid > 0 ? "worker launched" : "launch declined";
}

async function runCollector(ns, host, reportPort, offlineEpoch) {
    const files = ns.ls(host);
    const hasCollectibles = files.some(name => name.endsWith(".cache") ||
        (/\.(lit|txt)$/.test(name) && !ns.fileExists(name, HOME)));
    if (!hasCollectibles) return;
    const requiredRam = ns.getScriptRam(COLLECTOR, host);
    if (freeRam(ns, host) < requiredRam && ns.dnet.getBlockedRam(host) > 0) {
        await ns.dnet.memoryReallocation();
    }
    if (requiredRam > 0 && freeRam(ns, host) >= requiredRam) {
        ns.run(COLLECTOR, { preventDuplicates: true }, reportPort, offlineEpoch);
    }
}

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname();
    const [reportPort, jobPort, offlineEpoch] = ns.args;
    const jobs = ns.getPortHandle(jobPort);
    let lastJob = "";
    let result;

    while (true) {
        try {
            const neighbors = observeNeighbors(ns);
            sendReport(ns, reportPort, { type: "heartbeat", offlineEpoch, neighbors, free: freeRam(ns, host), result });

            const assignment = jobs.peek();
            const job = assignment?.offlineEpoch === offlineEpoch && assignment.jobs.find(
                candidate => candidate.worker === host && candidate.pid === ns.pid && candidate.expires > Date.now(),
            );
            if (job && job.id !== lastJob) {
                lastJob = job.id;
                let status;
                try {
                    status = await deploy(ns, job.target, [reportPort, jobPort, offlineEpoch]);
                } catch (error) {
                    status = String(error);
                }
                result = { id: job.id, target: job.target, status };
            } else if (host !== HOME && assignment?.offlineEpoch === offlineEpoch &&
                Date.now() - assignment.at < 2 * REPORT_INTERVAL) {
                await runCollector(ns, host, reportPort, offlineEpoch);
            }
        } catch (error) {
            ns.print(String(error));
        }
        await ns.sleep(REPORT_INTERVAL);
    }
}