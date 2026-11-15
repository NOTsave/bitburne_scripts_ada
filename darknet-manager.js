import { HOME, JOB_TTL, RETRY_DELAY, SIGHTING_TTL, WORKER, WORKER_VERSION } from "./darknet/protocol.js";

const STATE_FILE = "data/darknet-state.txt";
const FLAGS = [["port", 10150], ["help", false]];

/** The manager has exclusive use of the configured port and the next port. */
export function assignJobs(workers, jobs, retryAt, now, nextId) {
    const busyWorkers = new Set([...jobs.values()].map(job => job.worker));
    for (const worker of workers.values()) {
        if (now - worker.at > SIGHTING_TTL || busyWorkers.has(worker.host)) continue;
        for (const neighbor of worker.neighbors) {
            const existing = workers.get(neighbor.host);
            if (existing && now - existing.at <= SIGHTING_TTL) continue;
            if (!neighbor.supported || jobs.has(neighbor.host) || (retryAt.get(neighbor.host) ?? 0) > now) continue;
            jobs.set(neighbor.host, {
                id: nextId(), target: neighbor.host, worker: worker.host, pid: worker.pid, expires: now + JOB_TTL,
            });
            break;
        }
    }
}

function consumeReports(ns, port, reportPort, offlineEpoch, workers, jobs, retryAt, collected) {
    while (!port.empty()) {
        const report = port.read();
        if (!report || typeof report.host !== "string") continue;
        if (report.type === "collection") {
            if (report.offlineEpoch === offlineEpoch) {
                collected.files += report.copied.length;
                collected.caches += report.caches.length;
                ns.print(`${report.host} collected ${JSON.stringify({
                    files: report.copied, caches: report.caches, errors: report.errors,
                })}`);
            }
            continue;
        }
        if (report.type !== "heartbeat") continue;
        if (report.version !== WORKER_VERSION) {
            const oldWorker = ns.ps(report.host).find(script =>
                script.pid === report.pid && script.filename.replace(/^\//, "") === WORKER &&
                script.args[0] === reportPort && script.args[1] === reportPort + 1);
            if (oldWorker && ns.kill(oldWorker.pid)) ns.print(`Restarting outdated worker on ${report.host}.`);
            continue;
        }
        if (report.offlineEpoch !== offlineEpoch) continue;
        if (report.at < (workers.get(report.host)?.at ?? 0)) continue;
        workers.set(report.host, report);
        if (report.result) {
            const { id, target, status } = report.result;
            if (jobs.get(target)?.id === id) {
                jobs.delete(target);
                retryAt.set(target, Date.now() + RETRY_DELAY);
                ns.print(`${report.host} → ${target}: ${status}`);
            }
        }
        const incoming = jobs.get(report.host);
        if (incoming && incoming.worker !== report.host) jobs.delete(report.host);
    }
}

function publish(ns, port, jobPort, offlineEpoch, jobs) {
    port.clear();
    ns.tryWritePort(jobPort, { offlineEpoch, at: Date.now(), jobs: [...jobs.values()] });
}

/** @param {NS} ns */
export async function main(ns) {
    const options = ns.flags(FLAGS);
    if (options.help) {
        ns.tprint("Run from home: run darknet-manager.js [--port 10150]");
        return;
    }
    if (ns.getHostname() !== HOME) {
        ns.tprint("Start darknet-manager.js on home.");
        return;
    }
    if (ns.ps(HOME).some(script => script.filename === ns.getScriptName() && script.pid !== ns.pid)) {
        ns.tprint("A Darknet manager is already running.");
        return;
    }
    const reportPort = options.port;
    const jobPort = reportPort + 1;
    if (!Number.isSafeInteger(jobPort) || reportPort < 1) {
        ns.tprint("--port must be a positive integer with room for a second port.");
        return;
    }

    const reports = ns.getPortHandle(reportPort);
    const assignments = ns.getPortHandle(jobPort);
    let offlineEpoch = Date.now();
    let rootPid = 0;
    let sequence = Date.now();
    const workers = new Map();
    const jobs = new Map();
    const retryAt = new Map();
    let checkpointAt = 0;
    const collected = { files: 0, caches: 0 };

    // Rejoin workers left running by an earlier manager on the same ports.
    const existing = ns.ps(HOME).find(script => script.filename.replace(/^\//, "") === WORKER &&
        script.args[0] === reportPort && script.args[1] === jobPort && script.args[3] === WORKER_VERSION);
    if (existing) {
        rootPid = existing.pid;
        offlineEpoch = existing.args[2];
    }
    try {
        const saved = JSON.parse(ns.read(STATE_FILE));
        if (saved.reportPort === reportPort && saved.version === WORKER_VERSION) {
            if (!existing && Number.isSafeInteger(saved.offlineEpoch)) offlineEpoch = saved.offlineEpoch;
            collected.files = saved.collected?.files ?? 0;
            collected.caches = saved.collected?.caches ?? 0;
        }
    } catch {
        // An absent or invalid snapshot is recoverable from fresh reports.
    }
    publish(ns, assignments, jobPort, offlineEpoch, jobs);

    ns.disableLog("sleep");
    while (!ns.fileExists("DarkscapeNavigator.exe", HOME)) {
        ns.print("Waiting for DarkscapeNavigator.exe on home.");
        await ns.sleep(10_000);
    }

    while (true) {
        const now = Date.now();
        if (!rootPid || !ns.isRunning(rootPid)) {
            rootPid = ns.run(WORKER, { preventDuplicates: true }, reportPort, jobPort, offlineEpoch, WORKER_VERSION);
            if (!rootPid) ns.print("Waiting for enough home RAM to start the Darknet worker.");
        }

        consumeReports(ns, reports, reportPort, offlineEpoch, workers, jobs, retryAt, collected);
        for (const [target, job] of jobs) {
            if (job.expires <= now || !ns.isRunning(job.pid)) jobs.delete(target);
        }
        for (const [target, until] of retryAt) {
            if (until <= now) retryAt.delete(target);
        }
        assignJobs(workers, jobs, retryAt, now, () => `${offlineEpoch}/${++sequence}`);
        publish(ns, assignments, jobPort, offlineEpoch, jobs);

        if (now >= checkpointAt) {
            const snapshot = [...workers.values()].map(({ host, at, free, neighbors, rewards }) => ({
                host, at, free, neighbors, rewards, stale: now - at > SIGHTING_TTL,
            }));
            ns.write(STATE_FILE, JSON.stringify({
                version: WORKER_VERSION, at: now, reportPort, offlineEpoch, collected,
                workers: snapshot, jobs: [...jobs.values()],
            }, null, 2), "w");
            checkpointAt = now + 5_000;
        }
        await ns.sleep(1_000);
    }
}