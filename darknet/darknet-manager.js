/**
 * Darknet Manager
 * 
 * Master controller for Darknet operations
 * Coordinates exploration, phishing, stasis, migration, and stock promotion
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 2.1.0 - Full API Integration
 * 
 * RAM Cost: ~0.8GB (manager only, workers run separately)
 * 
 * Usage:
 *   run darknet/darknet-manager.js [--explore] [--phish] [--stasis] [--migrate] [--stock]
 */

import {
    HOME, MANAGER_PORT, REPORT_INTERVAL, LOG_LEVELS,
    EXPLORER_PORT, PHISHING_PORT, STASIS_PORT, MIGRATION_PORT, STOCK_PORT,
    sendReport, createJobId
} from './protocol.js';

import {
    log, asleep, getNsDataThroughFile, formatMoney, formatNumber
} from './utils.js';

// ============================================================================
// MANAGER CONFIGURATION
// ============================================================================

/** Default manager configuration */
export const MANAGER_CONFIG = {
    /** Enable explorer */
    enableExplorer: true,
    
    /** Enable phishing */
    enablePhishing: true,
    
    /** Enable stasis */
    enableStasis: true,
    
    /** Enable migration */
    enableMigration: true,
    
    /** Enable stock promotion */
    enableStock: true,
    
    /** Report interval (ms) */
    reportInterval: REPORT_INTERVAL,
    
    /** Enable debug logging */
    debug: false,
    
    /** Enable auto-update */
    autoUpdate: true,
    
    /** Maximum workers per type */
    maxWorkers: 10,
    
    /** Worker RAM allocation (GB) */
    workerRam: 1.0
};

/** Argument schema for command-line configuration */
export const argsSchema = [
    ['explore', true],
    ['phish', true],
    ['stasis', true],
    ['migrate', true],
    ['stock', true],
    ['no-explore', false],
    ['no-phish', false],
    ['no-stasis', false],
    ['no-migrate', false],
    ['no-stock', false],
    ['debug', false],
    ['interval', REPORT_INTERVAL],
    ['maxWorkers', 10],
    ['workerRam', 1.0],
    ['help', false]
];

// ============================================================================
// MANAGER STATE
// ============================================================================

let workers = {
    explorer: [],
    phishing: [],
    stasis: [],
    migration: [],
    stock: []
};

let stats = {
    explorer: {},
    phishing: {},
    stasis: {},
    migration: {},
    stock: {},
    lastUpdate: 0
};

let running = true;
let jobId = createJobId('darknet-manager');

// ============================================================================
// WORKER MANAGEMENT
// ============================================================================

/**
 * Start a worker script
 * 
 * @param {NS} ns - Netscript context
 * @param {string} script - Script to run
 * @param {number} ram - RAM to allocate
 * @param {string[]} args - Arguments
 * @returns {Promise<number>} - PID or -1 if failed
 */
async function startWorker(ns, script, ram, args = []) {
    try {
        const host = ns.getHostname();
        const freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
        
        if (freeRam < ram) {
            return -1; // Not enough RAM
        }
        
        const pid = await ns.run(script, host, Math.max(1, Math.floor(ram)), args);
        return pid;
    } catch (e) {
        log(ns, `Failed to start worker ${script}: ${e}`, false, LOG_LEVELS.ERROR);
        return -1;
    }
}

/**
 * Start explorer workers
 * 
 * @param {NS} ns - Netscript context
 * @param {number} count - Number of workers
 * @returns {Promise<number[]>} - Array of PIDs
 */
async function startExplorerWorkers(ns, count) {
    const pids = [];
    
    for (let i = 0; i < count; i++) {
        const pid = await startWorker(
            ns,
            'darknet/explorer.js',
            MANAGER_CONFIG.workerRam,
            [`--reportPort ${EXPLORER_PORT}`, `--debug ${MANAGER_CONFIG.debug}`]
        );
        
        if (pid > 0) {
            pids.push(pid);
            workers.explorer.push(pid);
        }
        
        await asleep(ns, 500);
    }
    
    return pids;
}

/**
 * Start phishing workers
 * 
 * @param {NS} ns - Netscript context
 * @param {number} count - Number of workers
 * @returns {Promise<number[]>} - Array of PIDs
 */
async function startPhishingWorkers(ns, count) {
    const pids = [];
    
    for (let i = 0; i < count; i++) {
        const pid = await startWorker(
            ns,
            'darknet/phishing.js',
            MANAGER_CONFIG.workerRam,
            [`--reportPort ${PHISHING_PORT}`, `--debug ${MANAGER_CONFIG.debug}`]
        );
        
        if (pid > 0) {
            pids.push(pid);
            workers.phishing.push(pid);
        }
        
        await asleep(ns, 500);
    }
    
    return pids;
}

/**
 * Start stasis workers
 * 
 * @param {NS} ns - Netscript context
 * @param {number} count - Number of workers
 * @returns {Promise<number[]>} - Array of PIDs
 */
async function startStasisWorkers(ns, count) {
    const pids = [];
    
    for (let i = 0; i < count; i++) {
        const pid = await startWorker(
            ns,
            'darknet/stasis.js',
            MANAGER_CONFIG.workerRam,
            [`--reportPort ${STASIS_PORT}`, `--debug ${MANAGER_CONFIG.debug}`]
        );
        
        if (pid > 0) {
            pids.push(pid);
            workers.stasis.push(pid);
        }
        
        await asleep(ns, 500);
    }
    
    return pids;
}

/**
 * Start migration workers
 * 
 * @param {NS} ns - Netscript context
 * @param {number} count - Number of workers
 * @returns {Promise<number[]>} - Array of PIDs
 */
async function startMigrationWorkers(ns, count) {
    const pids = [];
    
    for (let i = 0; i < count; i++) {
        const pid = await startWorker(
            ns,
            'darknet/migration-explorer.js',
            MANAGER_CONFIG.workerRam,
            [`--reportPort ${MIGRATION_PORT}`, `--debug ${MANAGER_CONFIG.debug}`]
        );
        
        if (pid > 0) {
            pids.push(pid);
            workers.migration.push(pid);
        }
        
        await asleep(ns, 500);
    }
    
    return pids;
}

/**
 * Start stock promotion workers
 * 
 * @param {NS} ns - Netscript context
 * @param {number} count - Number of workers
 * @returns {Promise<number[]>} - Array of PIDs
 */
async function startStockWorkers(ns, count) {
    const pids = [];
    
    for (let i = 0; i < count; i++) {
        const pid = await startWorker(
            ns,
            'darknet/stock-promoter.js',
            MANAGER_CONFIG.workerRam,
            [`--reportPort ${STOCK_PORT}`, '--all', `--debug ${MANAGER_CONFIG.debug}`]
        );
        
        if (pid > 0) {
            pids.push(pid);
            workers.stock.push(pid);
        }
        
        await asleep(ns, 500);
    }
    
    return pids;
}

/**
 * Kill a worker by PID
 * 
 * @param {NS} ns - Netscript context
 * @param {number} pid - Process ID
 * @returns {Promise<boolean>} - Success
 */
async function killWorker(ns, pid) {
    try {
        // Remove from worker lists
        for (const [type, pids] of Object.entries(workers)) {
            const idx = pids.indexOf(pid);
            if (idx > -1) {
                pids.splice(idx, 1);
                break;
            }
        }
        
        return await ns.kill(pid);
    } catch (e) {
        return false;
    }
}

/**
 * Kill all workers of a specific type
 * 
 * @param {NS} ns - Netscript context
 * @param {string} type - Worker type
 * @returns {Promise<number>} - Number killed
 */
async function killWorkersOfType(ns, type) {
    let killed = 0;
    
    for (const pid of workers[type]) {
        if (await killWorker(ns, pid)) {
            killed++;
        }
    }
    
    workers[type] = [];
    return killed;
}

/**
 * Kill all workers
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Kill counts by type
 */
async function killAllWorkers(ns) {
    const counts = {};
    
    for (const type of Object.keys(workers)) {
        counts[type] = await killWorkersOfType(ns, type);
    }
    
    return counts;
}

/**
 * Check if a worker is still running
 * 
 * @param {NS} ns - Netscript context
 * @param {number} pid - Process ID
 * @returns {Promise<boolean>} - Is running
 */
async function isWorkerRunning(ns, pid) {
    try {
        return ns.isRunning(pid);
    } catch (e) {
        return false;
    }
}

/**
 * Clean up dead workers
 * 
 * @param {NS} ns - Netscript context
 */
async function cleanupDeadWorkers(ns) {
    for (const [type, pids] of Object.entries(workers)) {
        workers[type] = (await Promise.all(
            pids.map(async pid => (await isWorkerRunning(ns, pid)) ? pid : null)
        )).filter(pid => pid !== null);
    }
}

// ============================================================================
// STATISTICS COLLECTION
// ============================================================================

/**
 * Collect statistics from all workers
 * 
 * @param {NS} ns - Netscript context
 */
async function collectStats(ns) {
    // Listen for reports on all ports
    const ports = [
        { type: 'explorer', port: EXPLORER_PORT },
        { type: 'phishing', port: PHISHING_PORT },
        { type: 'stasis', port: STASIS_PORT },
        { type: 'migration', port: MIGRATION_PORT },
        { type: 'stock', port: STOCK_PORT }
    ];
    
    // Read from each port
    for (const { type, port } of ports) {
        try {
            const messages = [];
            while (!ns.peek(port).empty) {
                const msg = ns.read(port);
                if (msg) {
                    messages.push(msg);
                }
            }
            
            if (messages.length > 0) {
                // Update stats
                stats[type] = messages[messages.length - 1]; // Use latest
                stats.lastUpdate = Date.now();
            }
        } catch (e) {
            // Port might not exist yet
        }
    }
}

/**
 * Generate manager report
 * 
 * @param {NS} ns - Netscript context
 * @returns {Object} - Manager report
 */
function generateReport(ns) {
    const host = ns.getHostname();
    const now = Date.now();
    const uptime = now - stats.lastUpdate;
    
    return {
        jobId,
        host,
        timestamp: now,
        uptime,
        running,
        workers: {
            explorer: { count: workers.explorer.length, running: workers.explorer.filter(pid => ns.isRunning(pid)).length },
            phishing: { count: workers.phishing.length, running: workers.phishing.filter(pid => ns.isRunning(pid)).length },
            stasis: { count: workers.stasis.length, running: workers.stasis.filter(pid => ns.isRunning(pid)).length },
            migration: { count: workers.migration.length, running: workers.migration.filter(pid => ns.isRunning(pid)).length },
            stock: { count: workers.stock.length, running: workers.stock.filter(pid => ns.isRunning(pid)).length }
        },
        stats: { ...stats },
        config: { ...MANAGER_CONFIG }
    };
}

/**
 * Display formatted report
 * 
 * @param {NS} ns - Netscript context
 * @param {Object} report - Report to display
 */
function displayReport(ns, report) {
    const { host, workers, stats } = report;
    
    log(ns, `=== Darknet Manager Report ===`, false, LOG_LEVELS.INFO);
    log(ns, `Host: ${host}`, false, LOG_LEVELS.INFO);
    log(ns, `Job ID: ${report.jobId}`, false, LOG_LEVELS.INFO);
    log(ns, `Uptime: ${formatDuration(report.uptime)}`, false, LOG_LEVELS.INFO);
    log(ns, ``, false, LOG_LEVELS.INFO);
    
    log(ns, `Workers:`, false, LOG_LEVELS.INFO);
    for (const [type, { count, running }] of Object.entries(workers)) {
        log(ns, `  ${type.padEnd(12)}: ${running}/${count} running`, false, LOG_LEVELS.INFO);
    }
    log(ns, ``, false, LOG_LEVELS.INFO);
    
    // Display module-specific stats
    if (stats.explorer?.discoveredServers) {
        log(ns, `Explorer: ${stats.explorer.discoveredServers} servers discovered`, false, LOG_LEVELS.INFO);
    }
    if (stats.phishing?.totalEarnings) {
        log(ns, `Phishing: ${formatMoney(stats.phishing.totalEarnings)} earned`, false, LOG_LEVELS.INFO);
    }
    if (stats.stasis?.linkedServers) {
        log(ns, `Stasis: ${stats.stasis.linkedServers} servers linked`, false, LOG_LEVELS.INFO);
    }
    if (stats.migration?.totalMigrations) {
        log(ns, `Migration: ${stats.migration.totalMigrations} migrations`, false, LOG_LEVELS.INFO);
    }
    if (stats.stock?.totalPromotions) {
        log(ns, `Stock: ${stats.stock.totalPromotions} promotions`, false, LOG_LEVELS.INFO);
    }
}

/**
 * Format duration in human-readable format
 * 
 * @param {number} ms - Duration in milliseconds
 * @returns {string} - Formatted duration
 */
function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Send report to parent
 * 
 * @param {NS} ns - Netscript context
 * @param {number} port - Port to send on
 */
async function sendManagerReport(ns, port) {
    const report = generateReport(ns);
    sendReport(ns, port, report);
    
    // Also display locally if debug enabled
    if (MANAGER_CONFIG.debug) {
        displayReport(ns, report);
    }
}

// ============================================================================
// MAIN MANAGER LOOP
// ============================================================================

/**
 * Main manager loop
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 */
async function managerLoop(ns, reportPort) {
    const host = ns.getHostname();
    
    log(ns, `Darknet Manager started on ${host}`, false, LOG_LEVELS.INFO);
    log(ns, `Job ID: ${jobId}`, false, LOG_LEVELS.INFO);
    
    // Start workers based on configuration
    log(ns, 'Starting workers...', false, LOG_LEVELS.INFO);
    
    if (MANAGER_CONFIG.enableExplorer) {
        const count = Math.min(MANAGER_CONFIG.maxWorkers, 3); // Default 3 explorers
        log(ns, `Starting ${count} explorer workers...`, false, LOG_LEVELS.INFO);
        await startExplorerWorkers(ns, count);
    }
    
    if (MANAGER_CONFIG.enablePhishing) {
        const count = Math.min(MANAGER_CONFIG.maxWorkers, 5); // Default 5 phishing workers
        log(ns, `Starting ${count} phishing workers...`, false, LOG_LEVELS.INFO);
        await startPhishingWorkers(ns, count);
    }
    
    if (MANAGER_CONFIG.enableStasis) {
        const count = Math.min(MANAGER_CONFIG.maxWorkers, 2); // Default 2 stasis workers
        log(ns, `Starting ${count} stasis workers...`, false, LOG_LEVELS.INFO);
        await startStasisWorkers(ns, count);
    }
    
    if (MANAGER_CONFIG.enableMigration) {
        const count = Math.min(MANAGER_CONFIG.maxWorkers, 2); // Default 2 migration workers
        log(ns, `Starting ${count} migration workers...`, false, LOG_LEVELS.INFO);
        await startMigrationWorkers(ns, count);
    }
    
    if (MANAGER_CONFIG.enableStock) {
        const count = Math.min(MANAGER_CONFIG.maxWorkers, 3); // Default 3 stock workers
        log(ns, `Starting ${count} stock promotion workers...`, false, LOG_LEVELS.INFO);
        await startStockWorkers(ns, count);
    }
    
    log(ns, 'All workers started. Entering management loop...', false, LOG_LEVELS.INFO);
    
    while (running) {
        try {
            // Collect stats from workers
            await collectStats(ns);
            
            // Clean up dead workers
            await cleanupDeadWorkers(ns);
            
            // Restart dead workers
            const workersToRestart = {};
            for (const [type, pids] of Object.entries(workers)) {
                const alive = pids.filter(pid => ns.isRunning(pid));
                const dead = pids.length - alive.length;
                if (dead > 0) {
                    workersToRestart[type] = dead;
                }
            }
            
            // Restart dead workers
            for (const [type, count] of Object.entries(workersToRestart)) {
                if (MANAGER_CONFIG[`enable${type.charAt(0).toUpperCase() + type.slice(1)}`]) {
                    log(ns, `Restarting ${count} dead ${type} worker(s)...`, false, LOG_LEVELS.INFO);
                    
                    const starterMap = {
                        explorer: startExplorerWorkers,
                        phishing: startPhishingWorkers,
                        stasis: startStasisWorkers,
                        migration: startMigrationWorkers,
                        stock: startStockWorkers
                    };
                    
                    await starterMap[type]?.(ns, count);
                }
            }
            
            // Send report
            if (reportPort) {
                await sendManagerReport(ns, reportPort);
            }
            
            // Display report periodically
            if (MANAGER_CONFIG.debug && Date.now() % 30000 < 100) {
                displayReport(ns, generateReport(ns));
            }
            
            // Sleep
            await asleep(ns, MANAGER_CONFIG.reportInterval);
        } catch (e) {
            log(ns, `Manager error: ${e}`, false, LOG_LEVELS.ERROR);
            await asleep(ns, 10000);
        }
    }
    
    log(ns, 'Manager loop ended.', false, LOG_LEVELS.INFO);
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Main entry point for darknet manager
 * 
 * @param {NS} ns - Netscript context
 */
export async function main(ns) {
    // Parse arguments
    const flags = ns.flags(argsSchema);
    
    if (flags.help) {
        showHelp(ns);
        return;
    }
    
    const reportPort = Number(flags.reportPort) || MANAGER_PORT;
    const interval = Number(flags.interval) || REPORT_INTERVAL;
    const maxWorkers = Number(flags.maxWorkers) || MANAGER_CONFIG.maxWorkers;
    const workerRam = Number(flags.workerRam) || MANAGER_CONFIG.workerRam;
    const debug = flags.debug || false;
    
    // Handle disable flags
    const enableExplorer = flags.explore && !flags.noExplore;
    const enablePhishing = flags.phish && !flags.noPhish;
    const enableStasis = flags.stasis && !flags.noStasis;
    const enableMigration = flags.migrate && !flags.noMigrate;
    const enableStock = flags.stock && !flags.noStock;
    
    // Update config
    MANAGER_CONFIG.reportInterval = interval;
    MANAGER_CONFIG.maxWorkers = maxWorkers;
    MANAGER_CONFIG.workerRam = workerRam;
    MANAGER_CONFIG.debug = debug;
    MANAGER_CONFIG.enableExplorer = enableExplorer;
    MANAGER_CONFIG.enablePhishing = enablePhishing;
    MANAGER_CONFIG.enableStasis = enableStasis;
    MANAGER_CONFIG.enableMigration = enableMigration;
    MANAGER_CONFIG.enableStock = enableStock;
    
    // Start manager loop
    await managerLoop(ns, reportPort);
}

/**
 * Show help message
 * 
 * @param {NS} ns - Netscript context
 */
function showHelp(ns) {
    log(ns, 'Darknet Manager', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Usage:', false, LOG_LEVELS.INFO);
    log(ns, '  run darknet/darknet-manager.js [OPTIONS]', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Options:', false, LOG_LEVELS.INFO);
    log(ns, '  --explore          Enable explorer workers', false, LOG_LEVELS.INFO);
    log(ns, '  --phish            Enable phishing workers', false, LOG_LEVELS.INFO);
    log(ns, '  --stasis           Enable stasis workers', false, LOG_LEVELS.INFO);
    log(ns, '  --migrate          Enable migration workers', false, LOG_LEVELS.INFO);
    log(ns, '  --stock            Enable stock promotion workers', false, LOG_LEVELS.INFO);
    log(ns, '  --no-explore       Disable explorer workers', false, LOG_LEVELS.INFO);
    log(ns, '  --no-phish         Disable phishing workers', false, LOG_LEVELS.INFO);
    log(ns, '  --no-stasis        Disable stasis workers', false, LOG_LEVELS.INFO);
    log(ns, '  --no-migrate       Disable migration workers', false, LOG_LEVELS.INFO);
    log(ns, '  --no-stock         Disable stock promotion workers', false, LOG_LEVELS.INFO);
    log(ns, '  --interval MS      Report interval (default: ' + REPORT_INTERVAL + 'ms)', false, LOG_LEVELS.INFO);
    log(ns, '  --maxWorkers NUM   Maximum workers per type (default: 10)', false, LOG_LEVELS.INFO);
    log(ns, '  --workerRam NUM    RAM per worker in GB (default: 1.0)', false, LOG_LEVELS.INFO);
    log(ns, '  --debug            Enable debug logging', false, LOG_LEVELS.INFO);
    log(ns, '  --help             Show this help message', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Description:', false, LOG_LEVELS.INFO);
    log(ns, '  Master controller for Darknet operations', false, LOG_LEVELS.INFO);
    log(ns, '  Coordinates exploration, phishing, stasis, migration, and stock promotion', false, LOG_LEVELS.INFO);
    log(ns, '  RAM Cost: ~0.8GB (manager only)', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Examples:', false, LOG_LEVELS.INFO);
    log(ns, '  run darknet/darknet-manager.js --explore --phish', false, LOG_LEVELS.INFO);
    log(ns, '  run darknet/darknet-manager.js --all --debug', false, LOG_LEVELS.INFO);
    log(ns, '  run darknet/darknet-manager.js --no-migrate --no-stock', false, LOG_LEVELS.INFO);
}

// ============================================================================
// AUTOINITIALIZATION
// ============================================================================

/**
 * Initialize darknet manager on current server
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 * @param {Object} config - Configuration overrides
 * @returns {Promise<number>} - PID of manager process
 */
export async function initManager(ns, reportPort = null, config = {}) {
    const actualReportPort = reportPort || MANAGER_PORT;
    
    // Build arguments
    const args = [`--reportPort ${actualReportPort}`];
    
    if (config.interval) args.push(`--interval ${config.interval}`);
    if (config.maxWorkers) args.push(`--maxWorkers ${config.maxWorkers}`);
    if (config.workerRam) args.push(`--workerRam ${config.workerRam}`);
    if (config.debug) args.push('--debug');
    if (config.explore !== undefined) {
        if (config.explore) args.push('--explore');
        else args.push('--no-explore');
    }
    if (config.phish !== undefined) {
        if (config.phish) args.push('--phish');
        else args.push('--no-phish');
    }
    if (config.stasis !== undefined) {
        if (config.stasis) args.push('--stasis');
        else args.push('--no-stasis');
    }
    if (config.migrate !== undefined) {
        if (config.migrate) args.push('--migrate');
        else args.push('--no-migrate');
    }
    if (config.stock !== undefined) {
        if (config.stock) args.push('--stock');
        else args.push('--no-stock');
    }
    
    // Run manager script
    const pid = await ns.run(
        'darknet/darknet-manager.js',
        ns.getHostname(),
        1,
        args
    );
    
    return pid;
}

/**
 * Start manager on all accessible Darknet servers
 * 
 * @param {NS} ns - Netscript context
 * @param {string[]} servers - Array of server hostnames
 * @param {number} reportPort - Port for reporting
 * @param {Object} config - Configuration overrides
 * @returns {Promise<Object>} - { started: number, failed: number, pids: number[] }
 */
export async function startManagerOnAll(ns, servers, reportPort = null, config = {}) {
    const started = [];
    const failed = [];
    const pids = [];
    
    for (const server of servers) {
        try {
            // Check if we can run on this server
            const details = await getServerDetails(ns, server);
            if (!details || !details.isOnline || !details.isConnectedToCurrentServer) {
                failed.push({ server, reason: 'Server not accessible' });
                continue;
            }
            
            // Check if we have a session
            if (!details.hasSession) {
                failed.push({ server, reason: 'No session' });
                continue;
            }
            
            // Try to start manager
            const pid = await initManager(ns, reportPort, config);
            if (pid > 0) {
                started.push(server);
                pids.push(pid);
            } else {
                failed.push({ server, reason: 'Failed to start' });
            }
        } catch (e) {
            failed.push({ server, reason: String(e) });
        }
        
        await asleep(ns, 100);
    }
    
    return { started, failed, pids };
}

// ============================================================================
// AUTOINITIALIZATION
// ============================================================================

/**
 * Deploy full Darknet framework
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 * @returns {Promise<Object>} - Deployment results
 */
export async function deployDarknetFramework(ns, reportPort = null) {
    const results = {
        manager: null,
        workers: {
            explorer: [],
            phishing: [],
            stasis: [],
            migration: [],
            stock: []
        },
        errors: []
    };
    
    try {
        // Start manager first
        results.manager = await initManager(ns, reportPort, {
            enableExplorer: true,
            enablePhishing: true,
            enableStasis: true,
            enableMigration: true,
            enableStock: true
        });
        
        if (results.manager <= 0) {
            results.errors.push('Failed to start manager');
            return results;
        }
        
        log(ns, `Darknet framework deployed. Manager PID: ${results.manager}`, false, LOG_LEVELS.INFO);
    } catch (e) {
        results.errors.push(`Deployment error: ${e}`);
    }
    
    return results;
}

/**
 * Get current manager status
 * 
 * @param {NS} ns - Netscript context
 * @returns {Object} - Current status
 */
export function getStatus(ns) {
    return generateReport(ns);
}

/**
 * Stop all Darknet operations
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Stop results
 */
export async function stopAll(ns) {
    running = false;
    const killed = await killAllWorkers(ns);
    
    return {
        killed,
        message: 'All Darknet operations stopped'
    };
}

/**
 * Autocomplete function for command-line arguments
 * 
 * @param {Object} data - Autocomplete data
 */
export function autocomplete(data) {
    data.flags(argsSchema);
    return [];
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
    // Configuration
    MANAGER_CONFIG,
    argsSchema,
    
    // Functions
    startWorker,
    startExplorerWorkers,
    startPhishingWorkers,
    startStasisWorkers,
    startMigrationWorkers,
    startStockWorkers,
    killWorker,
    killWorkersOfType,
    killAllWorkers,
    isWorkerRunning,
    cleanupDeadWorkers,
    collectStats,
    generateReport,
    displayReport,
    sendManagerReport,
    initManager,
    startManagerOnAll,
    deployDarknetFramework,
    getStatus,
    stopAll,
    
    // Main
    main,
    autocomplete
};
