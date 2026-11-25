import { authenticateFactori, isFactoriPuzzle } from "./factori.js";
import { BUNDLE, COLLECTOR, HOME, IDLE, LAB, MIGRATION, REPORT_INTERVAL, STASIS, STOCK, WORKER, WORKER_VERSION, sendReport } from "./protocol.js";
import { isSupported, puzzleAnswer, puzzleCandidates } from "./solvers.js";

const LAB_HOSTS = new Set([
    "th3_l4byr1nth", "cru3l_l4byr1nth", "m3rc1l3ss_l4byr1nth", "ub3r_l4byr1nth",
    "et3rn4l_l4byr1nth", "end13ss_l4byr1nth", "f1n4l_l4byr1nth", "b0nus_l4byr1nth",
]);

export function freeRam(ns, host) {
    return Math.max(0, ns.getServerMaxRam(host) - ns.getServerUsedRam(host));
}

export function observeNeighbors(ns, factoriFeedback = false) {
    const neighbors = [];
    for (const host of ns.dnet.probe()) {
        try {
            const details = ns.dnet.getServerDetails(host);
            if (!details.isConnectedToCurrentServer || !details.isOnline) continue;
            neighbors.push({
                host,
                model: details.modelId,
                depth: details.depth,
                supported: details.hasSession === true || isSupported(details) &&
                    (!isFactoriPuzzle(details) || details.passwordLength === 1 || factoriFeedback),
                lab: LAB_HOSTS.has(host) && !ns.hasRootAccess(host),
            });
        } catch {
            // A neighbor can vanish between probe and getServerDetails.
        }
    }
    return neighbors;
}

export async function deploy(ns, target, workerArgs, recover = false, deadline = Infinity, factori = { searches: new Map() }) {
    const details = ns.dnet.getServerDetails(target);
    if (!details.isOnline || (!recover && !details.isConnectedToCurrentServer)) return "link lost";
    if (recover && !ns.dnet.getStasisLinkedServers().includes(target)) return "stasis link lost";

    if (!details.hasSession && !recover && isFactoriPuzzle(details)) {
        if (factori.enabled === false && details.passwordLength > 1) return "Factori feedback disabled";
        const failure = await authenticateFactori(ns, target, details, deadline, factori.searches, factori.heartbeat);
        if (failure) return failure;
    } else if (!details.hasSession) {
        const choices = recover ? [puzzleAnswer(details)] : puzzleCandidates(details);
        if (!choices.length || choices[0] === undefined) return "unsupported model";

        let solved = false;
        for (const answer of choices) {
            if (Date.now() >= deadline) return "puzzle job expired";
            const result = recover ? ns.dnet.connectToSession(target, answer) : await ns.dnet.authenticate(target, answer);
            if (result.success) {
                solved = true;
                break;
            }
            // Try the next in-game answer only when Bitburner reports an incorrect password.
            if (result.code !== 401) return result.message ?? "puzzle rejected";
        }
        if (!solved) return "puzzle rejected";
    }

    const workerRam = ns.getScriptRam(WORKER, ns.getHostname());
    if (details.isConnectedToCurrentServer && freeRam(ns, target) < workerRam && ns.dnet.getBlockedRam(target) > 0) {
        await ns.dnet.memoryReallocation(target);
    }
    const available = freeRam(ns, target);
    if (workerRam <= 0 || available < workerRam) return "waiting for RAM";

    // Authentication runs faster with more threads. Keep RAM available for a local helper.
    const local = ns.getHostname();
    const reserved = Math.max(ns.getScriptRam(COLLECTOR, local), ns.getScriptRam(MIGRATION, local));
    const threads = Math.max(1, Math.min(8, Math.floor((available - reserved) / workerRam)));
    if (!ns.scp(BUNDLE, target, ns.getHostname())) return "copy failed";
    const pid = ns.exec(WORKER, target, { threads, preventDuplicates: true }, ...workerArgs);
    return pid > 0 ? "worker launched" : "launch declined";
}

function countCollectibles(ns, host) {
    return ns.ls(host).filter(name => name.endsWith(".cache") ||
        (/\.(lit|txt)$/.test(name) && !ns.fileExists(name, HOME))).length;
}

function planIsFresh(plan, offlineEpoch) {
    return plan?.offlineEpoch === offlineEpoch && Date.now() - plan.at < 2 * REPORT_INTERVAL;
}

function hostHasJob(plan, host) {
    return plan.jobs.some(job => job.expires > Date.now() && (job.worker === host || job.target === host));
}

export function idleThreadBudget(available, perThread, reserved, maxThreads = 4) {
    if (!(perThread > 0)) return 0;
    return Math.max(0, Math.min(maxThreads, Math.floor((available - reserved) / perThread)));
}

async function maintainRewards(ns, host, reportPort, offlineEpoch, pending) {
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
    let idleRun = null;
    const factoriSearches = new Map();

    function stopIdle() {
        if (idleRun && (ns.kill(idleRun.pid) || !ns.isRunning(idleRun.pid))) idleRun = null;
    }

    while (true) {
        let handoff;
        try {
            const plan = jobs.peek();
            const fresh = planIsFresh(plan, offlineEpoch);
            const neighbors = observeNeighbors(ns, fresh && plan.factoriFeedback === true);
            const pending = host !== HOME && fresh ? countCollectibles(ns, host) : 0;
            if (idleRun && !ns.isRunning(idleRun.pid)) idleRun = null;
            if (idleRun && (!fresh || !plan.phish || pending || hostHasJob(plan, host))) stopIdle();

            const free = freeRam(ns, host);
            const availableForJobs = free + (idleRun?.ram ?? 0);
            let location;
            if (host !== HOME) {
                const details = ns.dnet.getServerDetails(host);
                const stasisRam = ns.getScriptRam(STASIS, host);
                const migrateRam = ns.getScriptRam(MIGRATION, host);
                const labRam = ns.getScriptRam(LAB, host);
                const stockRam = ns.getScriptRam(STOCK, host);
                const self = ns.self();
                location = {
                    depth: details.depth,
                    movable: !details.isStationary,
                    canAnchor: stasisRam > 0 && puzzleAnswer(details) !== undefined && availableForJobs + self.ramUsage * self.threads >= stasisRam,
                    canCharge: migrateRam > 0 && availableForJobs >= migrateRam,
                    canNavigate: labRam > 0 && availableForJobs >= labRam,
                    canPromoteStock: stockRam > 0 && availableForJobs >= stockRam,
                };
            }
            const heartbeat = (neighbors, free) => sendReport(ns, reportPort, {
                type: "heartbeat", version: WORKER_VERSION, offlineEpoch,
                neighbors, free, result, rewards, location, idleThreads: idleRun?.threads ?? 0,
            });
            heartbeat(neighbors, free);

            if (host !== HOME && fresh) {
                try {
                    rewards = await maintainRewards(ns, host, reportPort, offlineEpoch, pending);
                } catch (error) {
                    rewards = String(error);
                }
            }
            const assignment = jobs.peek();
            const assignmentFresh = planIsFresh(assignment, offlineEpoch);
            if (idleRun && (!assignmentFresh || !assignment.phish || hostHasJob(assignment, host))) stopIdle();
            const job = assignmentFresh && assignment.jobs.find(
                candidate => candidate.worker === host && candidate.pid === ns.pid && candidate.expires > Date.now(),
            );
            if (job && job.id !== lastJob) {
                lastJob = job.id;
                let status;
                try {
                    if (job.kind === "stasis") {
                        const self = ns.self();
                        if (freeRam(ns, host) + self.ramUsage * self.threads >= ns.getScriptRam(STASIS, host)) {
                            handoff = [reportPort, jobPort, offlineEpoch, WORKER_VERSION, job.id];
                        } else {
                            status = "waiting for stasis RAM";
                        }
                    } else if (job.kind === "lab") {
                        const cost = ns.getScriptRam(LAB, host);
                        const threads = cost > 0 ? Math.min(8, Math.floor(freeRam(ns, host) / cost)) : 0;
                        if (!threads || !ns.run(LAB, { threads, preventDuplicates: true },
                            reportPort, jobPort, offlineEpoch, job.id, job.target)) {
                            status = "waiting for Labyrinth RAM";
                        }
                    } else if (job.kind === "migrate") {
                        const cost = ns.getScriptRam(MIGRATION, host);
                        const threads = cost > 0 ? Math.min(8, Math.floor(freeRam(ns, host) / cost)) : 0;
                        if (!threads || !ns.run(MIGRATION, { threads, preventDuplicates: true },
                            reportPort, jobPort, offlineEpoch, job.id, job.target, job.riderPid)) {
                            status = "waiting for migration RAM";
                        }
                    } else if (job.kind === "stock") {
                        const cost = ns.getScriptRam(STOCK, host);
                        if (!cost || freeRam(ns, host) < cost ||
                            !ns.run(STOCK, { preventDuplicates: true }, reportPort, offlineEpoch, job.id, job.symbol)) {
                            status = "waiting for stock promotion RAM";
                        }
                    } else {
                        status = await deploy(ns, job.target, [reportPort, jobPort, offlineEpoch, WORKER_VERSION],
                            job.kind === "recover", job.expires, {
                                searches: factoriSearches,
                                enabled: assignment.factoriFeedback === true,
                                heartbeat: () => heartbeat(
                                    observeNeighbors(ns, assignment.factoriFeedback === true), freeRam(ns, host)),
                            });
                    }
                } catch (error) {
                    status = String(error);
                }
                if (status) result = { id: job.id, target: job.target, status };
            } else if (host !== HOME && !idleRun && assignmentFresh && assignment.phish &&
                rewards === "no collectibles" && !hostHasJob(assignment, host)) {
                const cost = ns.getScriptRam(IDLE, host);
                const reserved = Math.max(
                    ns.getScriptRam(COLLECTOR, host),
                    assignment.migrationHub === host ? ns.getScriptRam(MIGRATION, host) : 0,
                    assignment.labEnabled && neighbors.some(neighbor => neighbor.lab) ? ns.getScriptRam(LAB, host) : 0,
                );
                const threads = idleThreadBudget(freeRam(ns, host), cost, reserved, assignment.phishThreads);
                if (threads > 0) {
                    const pid = ns.run(IDLE, { threads, preventDuplicates: true }, reportPort, offlineEpoch);
                    if (pid > 0) idleRun = { pid, threads, ram: threads * cost };
                }
            }
        } catch (error) {
            ns.print(String(error));
        }
        if (handoff) ns.spawn(STASIS, { spawnDelay: 0, preventDuplicates: true }, ...handoff);
        await ns.sleep(REPORT_INTERVAL);
    }
}