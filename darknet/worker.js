import { BUNDLE, COLLECTOR, HOME, REPORT_INTERVAL, WORKER, WORKER_VERSION, sendReport } from "./protocol.js";
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

async function maintainRewards(ns, host, reportPort, offlineEpoch) {
    const files = ns.ls(host);
    const pending = files.filter(name => name.endsWith(".cache") ||
        (/\.(lit|txt)$/.test(name) && !ns.fileExists(name, HOME))).length;
    const requiredRam = ns.getScriptRam(COLLECTOR, host);
    const blockedRam = ns.dnet.getBlockedRam(host);
    const args = [reportPort, offlineEpoch];

    if (pending && ns.isRunning(COLLECTOR, host, ...args)) return "collecting";
    if (pending && requiredRam <= 0) return "collector missing or invalid";
    if (pending && freeRam(ns, host) >= requiredRam) {
        if (ns.run(COLLECTOR, { preventDuplicates: true }, ...args) > 0) return "collecting";
        return "collector launch declined";
    }
    if (blockedRam > 0) {
        // Releasing all blocked RAM can create a new cache.
        const result = await ns.dnet.memoryReallocation();
        return result.success ? "reclaimed RAM" : `RAM reallocation failed: ${result.message}`;
    }
    return pending ? `${pending} collectible(s) waiting for ${requiredRam} GB of free RAM` : "no collectibles";
}

/** @param {NS} ns */
export async function main(ns) {
    const host = ns.getHostname();
    const [reportPort, jobPort, offlineEpoch] = ns.args;
    const jobs = ns.getPortHandle(jobPort);
    let lastJob = "";
    let result;
    let rewards;

    while (true) {
        try {
            const neighbors = observeNeighbors(ns);
            sendReport(ns, reportPort, {
                type: "heartbeat", version: WORKER_VERSION, offlineEpoch,
                neighbors, free: freeRam(ns, host), result, rewards,
            });

            const plan = jobs.peek();
            if (host !== HOME && plan?.offlineEpoch === offlineEpoch &&
                Date.now() - plan.at < 2 * REPORT_INTERVAL) {
                try {
                    rewards = await maintainRewards(ns, host, reportPort, offlineEpoch);
                } catch (error) {
                    rewards = String(error);
                }
            }
            const assignment = jobs.peek();
            const job = assignment?.offlineEpoch === offlineEpoch && assignment.jobs.find(
                candidate => candidate.worker === host && candidate.pid === ns.pid && candidate.expires > Date.now(),
            );
            if (job && job.id !== lastJob) {
                lastJob = job.id;
                let status;
                try {
                    status = await deploy(ns, job.target, [reportPort, jobPort, offlineEpoch, WORKER_VERSION]);
                } catch (error) {
                    status = String(error);
                }
                result = { id: job.id, target: job.target, status };
            }
        } catch (error) {
            ns.print(String(error));
        }
        await ns.sleep(REPORT_INTERVAL);
    }
}