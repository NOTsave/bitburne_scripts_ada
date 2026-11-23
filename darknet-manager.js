/**
 * Darknet Unified Manager
 * 
 * Merged framework that maintains backward compatibility with the old system
 * while adding support for new Darknet API features.
 * 
 * This manager:
 * - Handles legacy job queue (collection, idle, lab) on port 10150
 * - Starts new modular workers (explorer, phishing, stasis, migration, stock)
 * - Coordinates all Darknet operations
 * - Maintains backward compatibility with existing automation
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 2.2.0 - Unified Framework
 * 
 * Usage:
 *   run darknet-manager.js [OPTIONS]
 * 
 * Options (Legacy):
 *   --port NUM          Report port (default: 10150)
 *   --migrate          Enable migration
 *   --no-stasis        Disable stasis
 *   --no-lab           Disable labyrinth
 *   --phish            Enable phishing
 *   --phish-threads NUM Phishing threads (default: 4)
 * 
 * Options (New Framework):
 *   --explore          Enable explorer workers (default: true)
 *   --stock            Enable stock promotion (default: true)
 *   --no-explore       Disable explorer workers
 *   --no-stock         Disable stock promotion
 *   --interval MS      Report interval (default: 5000)
 *   --maxWorkers NUM   Maximum workers (default: 10)
 *   --debug            Enable debug logging
 *   --help             Show this help
 */

// ============================================================================
// IMPORTS
// ============================================================================

// Legacy imports
import { HOME, JOB_TTL, RETRY_DELAY, SIGHTING_TTL, WORKER, WORKER_VERSION } from "./darknet/protocol.js";
import { puzzleAnswer } from "./darknet/solvers.js";

// New framework imports
import { 
    MANAGER_PORT, REPORT_INTERVAL, LOG_LEVELS,
    EXPLORER_PORT, PHISHING_PORT, STASIS_PORT, MIGRATION_PORT, STOCK_PORT,
    sendReport, createJobId
} from "./darknet/v2/protocol.js";

import { 
    log, asleep, getNsDataThroughFile, formatMoney, formatNumber
} from "./darknet/v2/utils.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const STATE_FILE = "data/darknet-state.txt";
const DEFAULT_PORT = 10150;
const MIGRATION_INTERVAL = 60_000;

// ============================================================================
// LEGACY CODE (from old darknet-manager.js)
// ============================================================================

/** Helper: Check if worker is fresh */
function fresh(worker, now) {
    return worker && now - worker.at <= SIGHTING_TTL;
}

/** Helper: Queue a job */
function queueJob(jobs, kind, target, worker, now, nextId, riderPid) {
    jobs.set(target, { id: nextId(), kind, target, worker: worker.host, pid: worker.pid, expires: now + JOB_TTL, riderPid });
}

/** Helper: Generate next ID */
function nextId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/** Send report with retry */
function sendReportWithRetry(ns, port, report, retries = 5) {
    for (let i = 0; i < retries; i++) {
        if (sendReport(ns, port, report)) return true;
        ns.sleep(1000);
    }
    return false;
}

// ============================================================================
// LEGACY JOB ASSIGNMENT (from old darknet-manager.js)
// ============================================================================

/** Assign stasis and migration routes */
function assignRoutes(workers, jobs, retryAt, routing, now) {
    const active = [...workers.values()].filter(worker => fresh(worker, now));
    const outstanding = [...jobs.values()];
    const busy = new Set(outstanding.map(job => job.worker));
    const available = worker => !busy.has(worker.host) && !jobs.has(worker.host) && (retryAt.get(worker.host) ?? 0) <= now;

    // Stasis handoff
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

/** Refresh stasis links */
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

/** Assign lab jobs */
function assignLab(workers, jobs, retryAt, now) {
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

/** Assign collection and idle jobs */
function assignJobs(workers, jobs, retryAt, idlePolicy, now) {
    const busyWorkers = new Set([...jobs.values()].map(job => job.worker));
    for (const worker of workers.values()) {
        if (!fresh(worker, now) || busyWorkers.has(worker.host) || jobs.get(worker.host)?.kind === "stasis") continue;
        for (const neighbor of worker.neighbors) {
            const existing = workers.get(neighbor.host);
            if (existing && now - existing.at <= SIGHTING_TTL) continue;
            if (jobs.has(neighbor.host) && jobs.get(neighbor.host).kind === "stasis") continue;

            if (neighbor.supported || neighbor.hasSession) {
                if (!jobs.has(neighbor.host) && (retryAt.get(neighbor.host) ?? 0) <= now) {
                    const hub = worker.neighbors.find(c => c.supported && c.depth === 0);
                    if (hub && !routing.hub && idlePolicy.migrationHub === null &&
                        workers.has(hub.host) && workers.get(hub.host).location?.canCharge &&
                        !jobs.has(hub.host) && (retryAt.get(hub.host) ?? 0) <= now) {
                        idlePolicy.migrationHub = hub.host;
                        queueJob(jobs, "hub", hub.host, worker, now, nextId);
                    } else {
                        const nextJobKind = worker.neighbors.length >= 2 ? "idle" : "collect";
                        if ((nextJobKind === "collect" || idlePolicy.phish) &&
                            (nextJobKind !== "idle" || idlePolicy.phishThreads >= 1)) {
                            queueJob(jobs, nextJobKind, neighbor.host, worker, now, nextId);
                        }
                    }
                }
            } else if (neighbor.lab) {
                if (!jobs.has(neighbor.host) && idlePolicy.labEnabled &&
                    worker.location?.canNavigate && (retryAt.get(neighbor.host) ?? 0) <= now) {
                    queueJob(jobs, "lab", neighbor.host, worker, now, nextId);
                }
            }
        }
    }
}

// ============================================================================
// NEW FRAMEWORK INTEGRATION
// ============================================================================

/** New framework configuration */
const NEW_CONFIG = {
    enableExplorer: true,
    enablePhishing: true,
    enableStasis: true,
    enableMigration: true,
    enableStock: true,
    maxWorkers: 10,
    workerRam: 1.0,
    reportInterval: REPORT_INTERVAL
};

let newWorkers = {
    explorer: [],
    phishing: [],
    stasis: [],
    migration: [],
    stock: []
};

/** Start new worker */
async function startNewWorker(ns, script, ram, args = []) {
    try {
        const host = ns.getHostname();
        const freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
        if (freeRam < ram) return -1;
        
        const pid = await ns.run(script, host, Math.max(1, Math.floor(ram)), ...args);
        return pid;
    } catch (e) {
        log(ns, `Failed to start new worker ${script}: ${e}`, false, LOG_LEVELS.ERROR);
        return -1;
    }
}

/** Start explorer workers */
async function startExplorerWorkers(ns, count) {
    const pids = [];
    for (let i = 0; i < count; i++) {
        const pid = await startNewWorker(ns, 'darknet/v2/explorer.js', NEW_CONFIG.workerRam, 
            [`--reportPort ${EXPLORER_PORT}`]);
        if (pid > 0) {
            pids.push(pid);
            newWorkers.explorer.push(pid);
        }
        await ns.sleep(500);
    }
    return pids;
}

/** Start phishing workers */
async function startPhishingWorkers(ns, count, threads = 4) {
    const pids = [];
    for (let i = 0; i < count; i++) {
        const pid = await startNewWorker(ns, 'darknet/v2/phishing.js', NEW_CONFIG.workerRam,
            [`--reportPort ${PHISHING_PORT}`, `--threads ${threads}`]);
        if (pid > 0) {
            pids.push(pid);
            newWorkers.phishing.push(pid);
        }
        await ns.sleep(500);
    }
    return pids;
}

/** Start stasis workers */
async function startStasisWorkers(ns, count) {
    const pids = [];
    for (let i = 0; i < count; i++) {
        const pid = await startNewWorker(ns, 'darknet/v2/stasis.js', NEW_CONFIG.workerRam,
            [`--reportPort ${STASIS_PORT}`]);
        if (pid > 0) {
            pids.push(pid);
            newWorkers.stasis.push(pid);
        }
        await ns.sleep(500);
    }
    return pids;
}

/** Start migration workers */
async function startMigrationWorkers(ns, count) {
    const pids = [];
    for (let i = 0; i < count; i++) {
        const pid = await startNewWorker(ns, 'darknet/v2/migration-explorer.js', NEW_CONFIG.workerRam,
            [`--reportPort ${MIGRATION_PORT}`]);
        if (pid > 0) {
            pids.push(pid);
            newWorkers.migration.push(pid);
        }
        await ns.sleep(500);
    }
    return pids;
}

/** Start stock workers */
async function startStockWorkers(ns, count) {
    const pids = [];
    for (let i = 0; i < count; i++) {
        const pid = await startNewWorker(ns, 'darknet/v2/stock-promoter.js', NEW_CONFIG.workerRam,
            [`--reportPort ${STOCK_PORT}`, '--all']);
        if (pid > 0) {
            pids.push(pid);
            newWorkers.stock.push(pid);
        }
        await ns.sleep(500);
    }
    return pids;
}

/** Collect stats from new workers */
async function collectNewStats(ns) {
    const ports = [
        { type: 'explorer', port: EXPLORER_PORT },
        { type: 'phishing', port: PHISHING_PORT },
        { type: 'stasis', port: STASIS_PORT },
        { type: 'migration', port: MIGRATION_PORT },
        { type: 'stock', port: STOCK_PORT }
    ];
    
    const stats = {};
    for (const { type, port } of ports) {
        try {
            const messages = [];
            while (!ns.peek(port).empty) {
                const msg = ns.read(port);
                if (msg) messages.push(msg);
            }
            if (messages.length > 0) {
                stats[type] = messages[messages.length - 1];
            }
        } catch (e) {
            // Port may not exist
        }
    }
    return stats;
}

/** Clean up dead new workers */
async function cleanupDeadNewWorkers(ns) {
    for (const [type, pids] of Object.entries(newWorkers)) {
        newWorkers[type] = (await Promise.all(
            pids.map(async pid => ns.isRunning(pid) ? pid : null)
        )).filter(pid => pid !== null);
    }
}

/** Restart dead new workers */
async function restartDeadNewWorkers(ns) {
    const starterMap = {
        explorer: startExplorerWorkers,
        phishing: startPhishingWorkers,
        stasis: startStasisWorkers,
        migration: startMigrationWorkers,
        stock: startStockWorkers
    };
    
    for (const [type, pids] of Object.entries(newWorkers)) {
        const alive = pids.filter(pid => ns.isRunning(pid));
        const dead = pids.length - alive.length;
        if (dead > 0 && NEW_CONFIG[`enable${type.charAt(0).toUpperCase() + type.slice(1)}`]) {
            log(ns, `Restarting ${dead} dead ${type} worker(s)...`, false, LOG_LEVELS.INFO);
            await starterMap[type]?.(ns, dead);
        }
    }
}

// ============================================================================
// PUBLISH FUNCTIONS (for worker coordination)
// ============================================================================

/** Publish assignments to workers */
function publish(ns, assignments, jobPort, offlineEpoch, jobs, idlePolicy) {
    const plan = {
        offlineEpoch,
        jobs: [...jobs.values()].map(({ pid, riderPid, ...job }) => job),
        idleWork: idlePolicy.phish ? {
            enabled: true, phishThreads: idlePolicy.phishThreads
        } : { enabled: false },
        labyrinth: idlePolicy.labEnabled ? { enabled: true } : { enabled: false }
    };
    assignments.clear();
    assignments.write(JSON.stringify(plan));
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Main entry point
 * 
 * @param {NS} ns - Netscript context
 */
export async function main(ns) {
    const flags = ns.flags([
        ["port", DEFAULT_PORT],
        ["migrate", true],
        ["no-stasis", false],
        ["no-lab", false],
        ["phish", true],
        ["phish-threads", 4],
        // New framework flags
        ["explore", true],
        ["stock", true],
        ["no-explore", false],
        ["no-stock", false],
        ["interval", REPORT_INTERVAL],
        ["maxWorkers", 10],
        ["workerRam", 1.0],
        ["debug", false],
        ["help", false]
    ]);

    if (flags.help) {
        showHelp(ns);
        return;
    }

    // Parse options
    const reportPort = Number(flags.port) || DEFAULT_PORT;
    const jobPort = reportPort + 1;
    const options = {
        migrate: flags.migrate,
        phish: flags.phish,
        phishThreads: Math.max(1, Math.min(4, Math.floor(Number(flags["phish-threads"])))),
        runScript: [],
        disableScript: [],
        ["darknet-idle-threads"]: flags.phish ? flags["phish-threads"] : 1,
        ["darknet-min-home-ram"]: 64,
        ["darknet-ram-headroom"]: 16,
        ["darknet-warmup-ms"]: 0
    };

    // New framework configuration
    NEW_CONFIG.maxWorkers = Number(flags.maxWorkers) || 10;
    NEW_CONFIG.workerRam = Number(flags.workerRam) || 1.0;
    NEW_CONFIG.reportInterval = Number(flags.interval) || REPORT_INTERVAL;
    
    // Determine which new modules to enable
    const enableExplorer = flags.explore && !flags.noExplore;
    const enablePhishing = flags.phish && !flags.noPhish;
    const enableStasis = !flags["no-stasis"];
    const enableMigration = flags.migrate && !flags.noMigrate;
    const enableStock = flags.stock && !flags.noStock;
    const debug = flags.debug || false;
    
    NEW_CONFIG.enableExplorer = enableExplorer;
    NEW_CONFIG.enablePhishing = enablePhishing;
    NEW_CONFIG.enableStasis = enableStasis;
    NEW_CONFIG.enableMigration = enableMigration;
    NEW_CONFIG.enableStock = enableStock;
    NEW_CONFIG.debug = debug;

    const idlePolicy = { phish: enablePhishing, phishThreads: options["darknet-idle-threads"], migrationHub: null, labEnabled: !flags["no-lab"] };

    // Routing state
    const routing = {
        autoStasis: !flags["no-stasis"],
        migrate: enableMigration,
        hub: null,
        links: [],
        sessionVerified: false,
        nextLinkCheckAt: 0,
        nextStasisAt: 0,
        nextMigrationAt: 0,
        lastAction: null
    };

    // Worker and job tracking
    const workers = new Map();
    const jobs = new Map();
    const retryAt = new Map();
    let checkpointAt = 0;

    // State for new framework
    let newStats = {};
    let lastNewStatsUpdate = 0;

    // Start new framework workers
    log(ns, `Darknet Unified Manager starting...`, false, LOG_LEVELS.INFO);
    log(ns, `Legacy support: enabled`, false, LOG_LEVELS.INFO);
    log(ns, `New framework: ${enableExplorer ? 'explore,' : ''}${enablePhishing ? 'phish,' : ''}${enableStasis ? 'stasis,' : ''}${enableMigration ? 'migrate,' : ''}${enableStock ? 'stock' : ''}`, false, LOG_LEVELS.INFO);

    // Start new workers
    if (enableExplorer) {
        log(ns, `Starting ${NEW_CONFIG.maxWorkers} explorer workers...`, false, LOG_LEVELS.INFO);
        await startExplorerWorkers(ns, Math.min(3, NEW_CONFIG.maxWorkers));
    }
    if (enablePhishing) {
        log(ns, `Starting ${NEW_CONFIG.maxWorkers} phishing workers...`, false, LOG_LEVELS.INFO);
        await startPhishingWorkers(ns, Math.min(5, NEW_CONFIG.maxWorkers), options["darknet-idle-threads"]);
    }
    if (enableStasis) {
        log(ns, `Starting ${NEW_CONFIG.maxWorkers} stasis workers...`, false, LOG_LEVELS.INFO);
        await startStasisWorkers(ns, Math.min(2, NEW_CONFIG.maxWorkers));
    }
    if (enableMigration) {
        log(ns, `Starting ${NEW_CONFIG.maxWorkers} migration workers...`, false, LOG_LEVELS.INFO);
        await startMigrationWorkers(ns, Math.min(2, NEW_CONFIG.maxWorkers));
    }
    if (enableStock) {
        log(ns, `Starting ${NEW_CONFIG.maxWorkers} stock workers...`, false, LOG_LEVELS.INFO);
        await startStockWorkers(ns, Math.min(3, NEW_CONFIG.maxWorkers));
    }

    // Load state
    try {
        const saved = JSON.parse(ns.read(STATE_FILE));
        if (saved.reportPort === reportPort) {
            if (Number.isSafeInteger(saved.offlineEpoch)) offlineEpoch = saved.offlineEpoch;
        }
    } catch {}

    // Generate offline epoch
    let offlineEpoch = Date.now();
    let rootPid = 0;

    // Main loop
    while (true) {
        const now = Date.now();

        // Collect new framework stats
        if (now - lastNewStatsUpdate > NEW_CONFIG.reportInterval) {
            newStats = await collectNewStats(ns);
            lastNewStatsUpdate = now;
            
            // Clean up and restart dead workers
            await cleanupDeadNewWorkers(ns);
            await restartDeadNewWorkers(ns);
        }

        // Legacy job assignment
        assignRoutes(workers, jobs, retryAt, routing, now);
        refreshLinks(ns, routing, now);
        assignLab(workers, jobs, retryAt, now);
        assignJobs(workers, jobs, retryAt, idlePolicy, now);

        // Publish assignments
        const assignments = ns.getPortHandle(jobPort);
        publish(ns, assignments, jobPort, offlineEpoch, jobs, idlePolicy);

        // Consume reports
        consumeReports(ns, reportPort, jobPort, offlineEpoch, workers, jobs, retryAt, checkpointAt, routing, idlePolicy);

        // Checkpoint
        if (now - checkpointAt >= 10_000) {
            checkpointAt = now;
            try {
                ns.write(STATE_FILE, JSON.stringify({
                    reportPort,
                    offlineEpoch,
                    version: WORKER_VERSION
                }), "w");
            } catch {}
        }

        // Sleep
        await ns.sleep(1000);
    }
}

/**
 * Consume reports from workers
 * 
 * @param {NS} ns - Netscript context
 * @param {number} port - Report port
 * @param {number} jobPort - Job port
 * @param {number} offlineEpoch - Offline epoch
 * @param {Map} workers - Worker map
 * @param {Map} jobs - Job map
 * @param {Map} retryAt - Retry map
 * @param {number} checkpointAt - Last checkpoint
 * @param {Object} routing - Routing state
 * @param {Object} idlePolicy - Idle policy
 */
function consumeReports(ns, port, jobPort, offlineEpoch, workers, jobs, retryAt, checkpointAt, routing, idlePolicy) {
    const reportPortHandle = ns.getPortHandle(port);
    while (!reportPortHandle.empty()) {
        const report = reportPortHandle.read();
        if (!report) continue;

        switch (report.type) {
            case "sighting":
                if (report.offlineEpoch === offlineEpoch) {
                    workers.set(report.host, {
                        host: report.host,
                        at: report.at,
                        location: report.location,
                        neighbors: report.neighbors
                    });
                }
                break;

            case "route":
                if (report.offlineEpoch === offlineEpoch) {
                    if (report.result?.status) {
                        log(ns, report.result.status, false, LOG_LEVELS.INFO);
                    }
                    if (report.result?.id) {
                        const job = jobs.get(report.target);
                        if (job && job.id === report.result.id && job.kind === "stasis") {
                            jobs.delete(report.target);
                            if (report.result.success) {
                                routing.hub = report.target;
                            }
                            retryAt.delete(report.target);
                        } else if (job && job.id === report.result.id) {
                            jobs.delete(report.target);
                            retryAt.delete(report.target);
                        }
                    }
                }
                break;

            case "collection":
                if (report.offlineEpoch === offlineEpoch) {
                    const job = jobs.get(report.host);
                    if (job?.kind === "collect" || job?.kind === "collection") {
                        jobs.delete(report.host);
                        retryAt.delete(report.host);
                    }
                }
                break;

            case "idle":
                if (report.offlineEpoch === offlineEpoch) {
                    const job = jobs.get(report.host);
                    if (job?.kind === "idle") {
                        jobs.delete(report.host);
                        retryAt.delete(report.host);
                    }
                }
                break;

            case "lab":
                if (report.offlineEpoch === offlineEpoch) {
                    const job = jobs.get(report.target);
                    if (job?.kind === "lab" && job.id === report.id) {
                        jobs.delete(report.target);
                        retryAt.delete(report.target);
                    }
                }
                break;

            default:
                // Unknown report type - log for debugging
                if (NEW_CONFIG.debug) {
                    log(ns, `Unknown report type: ${report.type}`, false, LOG_LEVELS.DEBUG);
                }
        }
    }
}

/**
 * Show help message
 * 
 * @param {NS} ns - Netscript context
 */
function showHelp(ns) {
    ns.tprint("Darknet Unified Manager");
    ns.tprint("");
    ns.tprint("Usage:");
    ns.tprint("  run darknet-manager.js [OPTIONS]");
    ns.tprint("");
    ns.tprint("Legacy Options:");
    ns.tprint("  --port NUM          Report port (default: 10150)");
    ns.tprint("  --migrate          Enable migration");
    ns.tprint("  --no-stasis        Disable stasis");
    ns.tprint("  --no-lab           Disable labyrinth");
    ns.tprint("  --phish            Enable phishing");
    ns.tprint("  --phish-threads NUM Phishing threads per host (default: 4)");
    ns.tprint("");
    ns.tprint("New Framework Options:");
    ns.tprint("  --explore          Enable explorer workers (default: enabled)");
    ns.tprint("  --stock            Enable stock promotion workers (default: enabled)");
    ns.tprint("  --no-explore       Disable explorer workers");
    ns.tprint("  --no-stock         Disable stock promotion workers");
    ns.tprint("  --interval MS      Report interval (default: 5000)");
    ns.tprint("  --maxWorkers NUM   Maximum workers per type (default: 10)");
    ns.tprint("  --workerRam NUM    RAM per worker in GB (default: 1.0)");
    ns.tprint("  --debug            Enable debug logging");
    ns.tprint("  --help             Show this help message");
    ns.tprint("");
    ns.tprint("Description:");
    ns.tprint("  Unified Darknet manager with backward compatibility");
    ns.tprint("  Supports both legacy job types and new modular workers");
    ns.tprint("  RAM Cost: ~0.8GB (manager only)");
    ns.tprint("");
    ns.tprint("Examples:");
    ns.tprint("  run darknet-manager.js                                    # All features enabled");
    ns.tprint("  run darknet-manager.js --phish --phish-threads 4         # Legacy phishing");
    ns.tprint("  run darknet-manager.js --explore --stock                 # New framework only");
    ns.tprint("  run darknet-manager.js --no-lab --no-stock              # Custom configuration");
}

// Export for testing
export { 
    fresh, queueJob, nextId, sendReportWithRetry,
    assignRoutes, refreshLinks, assignLab, assignJobs, publish, consumeReports
};
