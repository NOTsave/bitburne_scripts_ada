import { HOME, JOB_TTL, RETRY_DELAY, SIGHTING_TTL, WORKER, WORKER_VERSION } from "./darknet/protocol.js";
import { puzzleAnswer } from "./darknet/solvers.js";

const STATE_FILE = "data/darknet-state.txt";
const FLAGS = [["port", 10150], ["migrate", false], ["no-stasis", false], ["no-lab", false], ["phish", false], ["help", false]];
const MIGRATION_INTERVAL = 60_000;

function fresh(worker, now) {
    return worker && now - worker.at <= SIGHTING_TTL;
}

function queueJob(jobs, kind, target, worker, now, nextId, riderPid) {
    jobs.set(target, { id: nextId(), kind, target, worker: worker.host, pid: worker.pid, expires: now + JOB_TTL, riderPid });
}

/** Assign at most one stasis handoff and one migration batch. */
export function assignRoutes(workers, jobs, retryAt, routing, now, nextId) {
    const active = [...workers.values()].filter(worker => fresh(worker, now));
    const outstanding = [...jobs.values()];
    const busy = new Set(outstanding.map(job => job.worker));
    const available = worker => !busy.has(worker.host) && !jobs.has(worker.host) && (retryAt.get(worker.host) ?? 0) <= now;

    if (!routing.links.length && routing.autoStasis && now >= routing.nextStasisAt &&
        !outstanding.some(job => job.kind === "stasis")) {
        const candidates = active.filter(worker => worker.location?.movable && worker.location.canAnchor && available(worker));
        candidates.sort((a, b) => a.location.depth - b.location.depth || b.neighbors.length - a.neighbors.length);
        if (candidates.length) {
            const hub = candidates[0];
            routing.nextStasisAt = now + MIGRATION_INTERVAL;
            queueJob(jobs, "stasis", hub.host, hub, now, nextId);
            return;
        }
    }

    if (!routing.hub || !routing.sessionVerified) return;
    const anchor = workers.get(routing.hub);
    if (!fresh(anchor, now)) {
        const root = workers.get(HOME);
        if (fresh(root, now) && available(root) && !jobs.has(routing.hub) && (retryAt.get(routing.hub) ?? 0) <= now) {
            queueJob(jobs, "recover", routing.hub, root, now, nextId);
        }
        return;
    }

    if (!routing.migrate || now < routing.nextMigrationAt || !anchor.location?.canCharge || !available(anchor) ||
        outstanding.length || active.some(worker => worker.neighbors.some(
            neighbor => neighbor.supported && !fresh(workers.get(neighbor.host), now) &&
                (retryAt.get(neighbor.host) ?? 0) <= now))) return;

    const rider = anchor.neighbors.map(neighbor => workers.get(neighbor.host)).find(worker =>
        fresh(worker, now) && worker.location?.movable && available(worker) &&
        !routing.links.includes(worker.host));
    if (rider) {
        routing.nextMigrationAt = now + MIGRATION_INTERVAL;
        queueJob(jobs, "migrate", rider.host, anchor, now, nextId, rider.pid);
    }
}

function refreshLinks(ns, routing, now) {
    if (now < routing.nextLinkCheckAt) return;
    routing.nextLinkCheckAt = now + 5_000;
    routing.links = ns.dnet.getStasisLinkedServers();
    if (!routing.links.includes(routing.hub)) {
        routing.hub = routing.links.find(host => {
            const details = ns.dnet.getServerDetails(host);
            return details.isOnline && puzzleAnswer(details) !== undefined;
        }) ?? null;
        routing.sessionVerified = false;
    }
    if (routing.hub && !routing.sessionVerified) {
        const details = ns.dnet.getServerDetails(routing.hub);
        const answer = puzzleAnswer(details);
        routing.sessionVerified = details.isOnline && answer !== undefined &&
            ns.dnet.connectToSession(routing.hub, answer).success;
    }
}

export function assignLab(workers, jobs, retryAt, now, nextId) {
    const outstanding = [...jobs.values()];
    if (outstanding.some(job => job.kind === "lab")) return;
    const busy = new Set(outstanding.flatMap(job => [job.worker, job.target]));
    for (const worker of workers.values()) {
        if (!fresh(worker, now) || !worker.location?.canNavigate || busy.has(worker.host)) continue;
        const neighbor = worker.neighbors.find(candidate => candidate.lab && !busy.has(candidate.host) &&
            (retryAt.get(candidate.host) ?? 0) <= now);
        if (neighbor) {
            queueJob(jobs, "lab", neighbor.host, worker, now, nextId);
            return;
        }
    }
}

/** The manager has exclusive use of the configured port and the next port. */
export function assignJobs(workers, jobs, retryAt, now, nextId) {
    const busyWorkers = new Set([...jobs.values()].map(job => job.worker));
    for (const worker of workers.values()) {
        if (!fresh(worker, now) || busyWorkers.has(worker.host) || jobs.get(worker.host)?.kind === "stasis") continue;
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

function finishJob(ns, host, result, jobs, retryAt, routing) {
    if (!result || jobs.get(result.target)?.id !== result.id) return;
    const { kind } = jobs.get(result.target);
    jobs.delete(result.target);
    retryAt.set(result.target, Date.now() + RETRY_DELAY);
    if (kind) routing.lastAction = { kind, host, target: result.target, status: result.status };
    ns.print(`${host} → ${result.target}: ${result.status}`);
}

function consumeReports(ns, port, reportPort, offlineEpoch, workers, jobs, retryAt, collected, routing, lab, idle) {
    while (!port.empty()) {
        const report = port.read();
        if (!report || typeof report.host !== "string") continue;
        if (report.type === "collection") {
            if (report.offlineEpoch === offlineEpoch) {
                collected.files += report.copied.length;
                collected.caches += report.caches.length;
                for (const entry of report.caches) {
                    if (!collected.lastReward || entry.openedAt >= collected.lastReward.openedAt) {
                        collected.lastReward = {
                            host: report.host, filename: entry.name, openedAt: entry.openedAt, reward: entry.reward,
                        };
                    }
                }
                ns.print(`${report.host} collected ${JSON.stringify({
                    files: report.copied, caches: report.caches, errors: report.errors,
                })}`);
            }
            continue;
        }
        if (report.type === "idle") {
            if (report.offlineEpoch === offlineEpoch) {
                idle.completed++;
                if (report.success) idle.successes++;
                if (!idle.latest || report.completedAt >= idle.latest.completedAt) {
                    const { host, success, code, message, completedAt } = report;
                    idle.latest = { host, success, code, message, completedAt };
                }
            }
            continue;
        }
        if (report.type === "lab") {
            const job = jobs.get(report.target);
            if (report.offlineEpoch === offlineEpoch && job?.kind === "lab" && job.id === report.id &&
                job.worker === report.host) {
                const { host, target, pid, coords, visited, steps, radar, status, done, solved, at } = report;
                lab.latest = { host, target, pid, coords, visited, steps, radar, status, done, solved, at };
                if (done) finishJob(ns, host, { id: report.id, target, status }, jobs, retryAt, routing);
                else job.expires = Date.now() + JOB_TTL;
            }
            continue;
        }
        if (report.type === "route") {
            if (report.offlineEpoch === offlineEpoch) finishJob(ns, report.host, report.result, jobs, retryAt, routing);
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
        finishJob(ns, report.host, report.result, jobs, retryAt, routing);
        const incoming = jobs.get(report.host);
        if (incoming && (!incoming.kind || incoming.kind === "recover") && incoming.worker !== report.host) {
            if (incoming.kind === "recover") {
                routing.lastAction = { kind: "recover", host: incoming.worker, target: report.host, status: "hub worker checked in" };
            }
            jobs.delete(report.host);
        }
    }
}

function publish(ns, port, jobPort, offlineEpoch, jobs, idlePolicy) {
    port.clear();
    ns.tryWritePort(jobPort, { offlineEpoch, at: Date.now(), jobs: [...jobs.values()], ...idlePolicy });
}

/** @param {NS} ns */
export async function main(ns) {
    const options = ns.flags(FLAGS);
    if (options.help) {
        ns.tprint("Run from home: run darknet-manager.js [--port 10150] [--no-stasis] [--migrate] [--no-lab] [--phish]");
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
    const collected = { files: 0, caches: 0, lastReward: null };
    const lab = { latest: null };
    const idle = { completed: 0, successes: 0, latest: null };
    const idlePolicy = { phish: options.phish, migrationHub: null, labEnabled: !options["no-lab"] };
    const routing = {
        autoStasis: !options["no-stasis"], migrate: options.migrate,
        hub: null, links: [], sessionVerified: false, nextLinkCheckAt: 0,
        nextStasisAt: 0, nextMigrationAt: 0, lastAction: null,
    };

    // Rejoin workers left running by an earlier manager on the same ports.
    const existing = ns.ps(HOME).find(script => script.filename.replace(/^\//, "") === WORKER &&
        script.args[0] === reportPort && script.args[1] === jobPort && script.args[3] === WORKER_VERSION);
    if (existing) {
        rootPid = existing.pid;
        offlineEpoch = existing.args[2];
    }
    try {
        const saved = JSON.parse(ns.read(STATE_FILE));
        if (saved.reportPort === reportPort) {
            if (!existing && saved.version === WORKER_VERSION && Number.isSafeInteger(saved.offlineEpoch)) {
                offlineEpoch = saved.offlineEpoch;
            }
            collected.files = saved.collected?.files ?? 0;
            collected.caches = saved.collected?.caches ?? 0;
            collected.lastReward = saved.collected?.lastReward ?? null;
            lab.latest = saved.labyrinth?.latest ?? null;
            idle.completed = saved.idleWork?.completed ?? 0;
            idle.successes = saved.idleWork?.successes ?? 0;
            idle.latest = saved.idleWork?.latest ?? null;
        }
    } catch {
        // An absent or invalid snapshot is recoverable from fresh reports.
    }
    publish(ns, assignments, jobPort, offlineEpoch, jobs, idlePolicy);

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

        consumeReports(ns, reports, reportPort, offlineEpoch, workers, jobs, retryAt, collected, routing, lab, idle);
        refreshLinks(ns, routing, now);
        for (const [target, job] of jobs) {
            if (job.expires <= now || (job.kind !== "stasis" && !ns.isRunning(job.pid))) jobs.delete(target);
        }
        for (const [target, until] of retryAt) {
            if (until <= now) retryAt.delete(target);
        }
        const nextId = () => `${offlineEpoch}/${++sequence}`;
        if (!options["no-lab"]) assignLab(workers, jobs, retryAt, now, nextId);
        assignRoutes(workers, jobs, retryAt, routing, now, nextId);
        assignJobs(workers, jobs, retryAt, now, nextId);
        idlePolicy.migrationHub = routing.migrate ? routing.hub : null;
        publish(ns, assignments, jobPort, offlineEpoch, jobs, idlePolicy);

        if (now >= checkpointAt) {
            const snapshot = [...workers.values()].map(({ host, at, free, neighbors, rewards, idleThreads }) => ({
                host, at, free, neighbors, rewards, idleThreads, stale: now - at > SIGHTING_TTL,
            }));
            ns.write(STATE_FILE, JSON.stringify({
                version: WORKER_VERSION, at: now, reportPort, offlineEpoch, collected,
                workers: snapshot, jobs: [...jobs.values()],
                labyrinth: { enabled: !options["no-lab"], latest: lab.latest },
                idleWork: { enabled: options.phish, ...idle },
                routing: { hub: routing.hub, links: routing.links, sessionVerified: routing.sessionVerified,
                    migrationEnabled: routing.migrate, lastAction: routing.lastAction },
            }, null, 2), "w");
            checkpointAt = now + 5_000;
        }
        await ns.sleep(1_000);
    }
}