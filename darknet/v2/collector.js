/**
 * Darknet Collector
 * 
 * Collects resources from Darknet servers (money, data files, etc.)
 * Now with phishing integration and caching support
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 2.1.0 - Phishing Integration
 * 
 * RAM Cost: ~0.4GB
 * 
 * Usage:
 *   run darknet/collector.js [--phish] [--cache] [--interval 5000]
 */

import {
    HOME, REPORT_INTERVAL, LOG_LEVELS, COLLECTOR_PORT,
    sendReport, createJobId
} from './protocol.js';

import {
    probeServers, getServerDetails, openCache, phishingAttack,
    getNsDataThroughFile, formatMoney, formatNumber, log, asleep
} from './utils.js';

// ============================================================================
// COLLECTOR CONFIGURATION
// ============================================================================

/** Default collector configuration */
export const COLLECTOR_CONFIG = {
    /** Enable phishing attacks */
    enablePhishing: true,
    
    /** Enable cache opening */
    enableCache: true,
    
    /** Enable money collection */
    enableMoney: true,
    
    /** Collection interval (ms) */
    interval: REPORT_INTERVAL,
    
    /** Maximum concurrent collections */
    maxConcurrent: 10,
    
    /** Enable debug logging */
    debug: false,
    
    /** Report interval (ms) */
    reportInterval: REPORT_INTERVAL,
    
    /** Target servers (empty = all discovered) */
    targetServers: [],
    
    /** Enable auto-explore new servers */
    autoExplore: true
};

/** Argument schema for command-line configuration */
export const argsSchema = [
    ['phish', true],
    ['cache', true],
    ['money', true],
    ['interval', REPORT_INTERVAL],
    ['maxConcurrent', 10],
    ['debug', false],
    ['target', null],
    ['autoExplore', true],
    ['help', false]
];

// ============================================================================
// COLLECTOR STATE
// ============================================================================

let collected = {
    money: 0,
    cacheFiles: 0,
    phishingSuccesses: 0,
    phishingEarnings: 0,
    serversProcessed: 0
};

let discoveredServers = new Set();
let processedServers = new Set();
let cacheFilesFound = new Map(); // Map of server -> cache files

// ============================================================================
// COLLECTION FUNCTIONS
// ============================================================================

/**
 * Collect money from a server (placeholder - money collection happens through phishing)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} server - Server hostname
 * @returns {Promise<Object>} - Collection result
 */
async function collectMoney(ns, server) {
    // In Darknet, money is primarily collected through phishing
    // This is a placeholder for any other money collection
    return {
        success: true,
        server,
        amount: 0,
        message: 'Money collection not implemented (use phishing)'
    };
}

/**
 * Open cache files on a server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} server - Server hostname
 * @returns {Promise<Object>} - Cache opening result
 */
async function openCacheFiles(ns, server) {
    const results = [];
    let totalEarnings = 0;
    let filesOpened = 0;
    
    try {
        // Get cache files on this server
        const script = `ns.ls('${server}', '.cache')`;
        const cacheFiles = await getNsDataThroughFile(ns, script);
        
        if (!Array.isArray(cacheFiles)) return { success: true, server, filesOpened: 0, earnings: 0, results };
        
        for (const file of cacheFiles) {
            try {
                const result = await openCache(ns, file);
                results.push(result);
                
                if (result.success) {
                    filesOpened++;
                    totalEarnings += result.money || 0;
                    
                    // Track cache file
                    if (!cacheFilesFound.has(server)) {
                        cacheFilesFound.set(server, []);
                    }
                    cacheFilesFound.get(server).push(file);
                }
            } catch (e) {
                results.push({
                    success: false,
                    file,
                    message: `Error: ${e}`
                });
            }
        }
        
        return {
            success: true,
            server,
            filesOpened,
            earnings: totalEarnings,
            results
        };
    } catch (e) {
        return {
            success: false,
            server,
            filesOpened: 0,
            earnings: 0,
            message: `Error: ${e}`,
            results
        };
    }
}

/**
 * Perform phishing attack on a server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} server - Server hostname
 * @param {number} threads - Number of threads (affects success rate)
 * @returns {Promise<Object>} - Phishing result
 */
async function doPhishingAttack(ns, server, threads = 1) {
    try {
        const result = await phishingAttack(ns, server, threads);
        
        if (result.success) {
            collected.phishingSuccesses++;
            collected.phishingEarnings += result.money || 0;
        }
        
        return result;
    } catch (e) {
        return {
            success: false,
            server,
            message: `Error: ${e}`
        };
    }
}

/**
 * Collect from a single server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} server - Server hostname
 * @returns {Promise<Object>} - Collection result
 */
async function collectFromServer(ns, server) {
    const results = {
        server,
        money: 0,
        cacheFiles: 0,
        phishing: { successes: 0, earnings: 0 },
        success: true,
        errors: []
    };
    
    try {
        // Get server details
        const details = await getServerDetails(ns, server);
        
        if (!details || !details.isOnline) {
            results.success = false;
            results.errors.push('Server is offline');
            return results;
        }
        
        // Collect money (if enabled)
        if (COLLECTOR_CONFIG.enableMoney) {
            const moneyResult = await collectMoney(ns, server);
            results.money = moneyResult.amount || 0;
        }
        
        // Open cache files (if enabled)
        if (COLLECTOR_CONFIG.enableCache) {
            const cacheResult = await openCacheFiles(ns, server);
            results.cacheFiles = cacheResult.filesOpened;
            collected.money += cacheResult.earnings;
        }
        
        // Perform phishing (if enabled)
        if (COLLECTOR_CONFIG.enablePhishing) {
            // Use available threads based on server RAM
            const freeRam = details.maxRam - details.usedRam;
            const threads = Math.max(1, Math.min(10, Math.floor(freeRam / 0.1)));
            
            const phishingResult = await doPhishingAttack(ns, server, threads);
            results.phishing = {
                successes: phishingResult.success ? 1 : 0,
                earnings: phishingResult.money || 0
            };
            
            if (phishingResult.success) {
                // Check for cache files from phishing
                if (phishingResult.cacheFile) {
                    results.cacheFiles++;
                }
            }
        }
        
        // Mark as processed
        processedServers.add(server);
        collected.serversProcessed++;
        collected.money += results.money + results.phishing.earnings;
        
        return results;
    } catch (e) {
        results.success = false;
        results.errors.push(String(e));
        return results;
    }
}

/**
 * Discover new servers
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<string[]>} - Newly discovered servers
 */
async function discoverServers(ns) {
    const newServers = [];
    
    try {
        const currentServer = ns.getHostname();
        const neighbors = await probeServers(ns);
        
        for (const neighbor of neighbors) {
            if (!discoveredServers.has(neighbor)) {
                discoveredServers.add(neighbor);
                newServers.push(neighbor);
            }
        }
        
        return newServers;
    } catch (e) {
        log(ns, `Failed to discover servers: ${e}`, false, LOG_LEVELS.ERROR);
        return [];
    }
}

/**
 * Collect from all discovered servers
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Collection results
 */
async function collectFromAll(ns) {
    const results = {
        collected: { ...collected },
        serverResults: [],
        newServers: [],
        errors: []
    };
    
    // Discover new servers first
    if (COLLECTOR_CONFIG.autoExplore) {
        const newServers = await discoverServers(ns);
        results.newServers = newServers;
        
        for (const server of newServers) {
            // Process new servers
            const collectResult = await collectFromServer(ns, server);
            results.serverResults.push(collectResult);
            
            if (!collectResult.success) {
                results.errors.push({
                    server: collectResult.server,
                    errors: collectResult.errors
                });
            }
        }
    }
    
    // Collect from target servers or all discovered
    let targets = COLLECTOR_CONFIG.targetServers;
    if (targets.length === 0) {
        targets = Array.from(discoveredServers);
    }
    
    // Process in batches
    const batchSize = Math.min(COLLECTOR_CONFIG.maxConcurrent, targets.length);
    const batches = [];
    
    for (let i = 0; i < targets.length; i += batchSize) {
        batches.push(targets.slice(i, i + batchSize));
    }
    
    for (const batch of batches) {
        const batchResults = await Promise.all(
            batch.map(server => collectFromServer(ns, server))
        );
        
        results.serverResults.push(...batchResults);
        
        for (const result of batchResults) {
            if (!result.success) {
                results.errors.push({
                    server: result.server,
                    errors: result.errors
                });
            }
        }
        
        // Delay between batches
        await asleep(ns, 500);
    }
    
    return results;
}

/**
 * Continuous collection loop
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 */
async function collectionLoop(ns, reportPort) {
    const host = ns.getHostname();
    
    log(ns, `Collector started on ${host}`, false, LOG_LEVELS.INFO);
    
    // Initial collection
    await collectFromAll(ns);
    
    while (true) {
        const now = Date.now();
        
        // Collect from all servers
        const results = await collectFromAll(ns);
        
        // Send report
        if (reportPort) {
            sendReport(ns, reportPort, {
                type: 'collection',
                host: ns.getHostname(),
                collected: results.collected,
                newServers: results.newServers.length,
                processedServers: collected.serversProcessed,
                errors: results.errors.length
            });
        }
        
        // Log results
        if (results.serverResults.length > 0) {
            const totalMoney = results.serverResults.reduce((sum, r) => sum + r.money + r.phishing.earnings, 0);
            const totalCacheFiles = results.serverResults.reduce((sum, r) => sum + r.cacheFiles, 0);
            const totalPhishing = results.serverResults.reduce((sum, r) => sum + r.phishing.successes, 0);
            
            log(ns, `Collected ${formatMoney(totalMoney)} from ${results.serverResults.length} servers`, false, LOG_LEVELS.INFO);
            log(ns, `  Cache files: ${totalCacheFiles}, Phishing successes: ${totalPhishing}`, false, LOG_LEVELS.INFO);
        }
        
        if (results.newServers.length > 0) {
            log(ns, `Discovered ${results.newServers.length} new servers: ${results.newServers.join(', ')}`, false, LOG_LEVELS.INFO);
        }
        
        if (results.errors.length > 0 && COLLECTOR_CONFIG.debug) {
            for (const error of results.errors) {
                log(ns, `Error collecting from ${error.server}: ${error.errors.join(', ')}`, false, LOG_LEVELS.DEBUG);
            }
        }
        
        // Sleep for interval
        await asleep(ns, COLLECTOR_CONFIG.interval);
    }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Main entry point for collector
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
    
    const reportPort = Number(flags.reportPort) || COLLECTOR_PORT;
    const interval = Number(flags.interval) || REPORT_INTERVAL;
    const maxConcurrent = Number(flags.maxConcurrent) || COLLECTOR_CONFIG.maxConcurrent;
    const debug = flags.debug || false;
    const phish = flags.phish !== false;
    const cache = flags.cache !== false;
    const money = flags.money !== false;
    const autoExplore = flags.autoExplore !== false;
    
    // Parse target servers
    let targetServers = [];
    if (flags.target) {
        targetServers = Array.isArray(flags.target) ? flags.target : [flags.target];
    }
    
    // Update config
    COLLECTOR_CONFIG.interval = interval;
    COLLECTOR_CONFIG.maxConcurrent = maxConcurrent;
    COLLECTOR_CONFIG.debug = debug;
    COLLECTOR_CONFIG.enablePhishing = phish;
    COLLECTOR_CONFIG.enableCache = cache;
    COLLECTOR_CONFIG.enableMoney = money;
    COLLECTOR_CONFIG.autoExplore = autoExplore;
    COLLECTOR_CONFIG.targetServers = targetServers;
    
    // Start collection loop
    await collectionLoop(ns, reportPort);
}

/**
 * Show help message
 * 
 * @param {NS} ns - Netscript context
 */
function showHelp(ns) {
    log(ns, 'Darknet Collector', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Usage:', false, LOG_LEVELS.INFO);
    log(ns, '  run darknet/collector.js [OPTIONS]', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Options:', false, LOG_LEVELS.INFO);
    log(ns, '  --phish            Enable phishing attacks (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --cache            Enable cache file opening (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --money            Enable money collection (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --interval MS      Collection interval (default: ' + REPORT_INTERVAL + 'ms)', false, LOG_LEVELS.INFO);
    log(ns, '  --maxConcurrent NUM  Maximum concurrent collections (default: 10)', false, LOG_LEVELS.INFO);
    log(ns, '  --target SERVER    Target specific server (can be used multiple times)', false, LOG_LEVELS.INFO);
    log(ns, '  --autoExplore      Auto-explore new servers (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --debug            Enable debug logging', false, LOG_LEVELS.INFO);
    log(ns, '  --help             Show this help message', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Description:', false, LOG_LEVELS.INFO);
    log(ns, '  Collects resources from Darknet servers', false, LOG_LEVELS.INFO);
    log(ns, '  Supports phishing attacks, cache file opening, and money collection', false, LOG_LEVELS.INFO);
    log(ns, '  RAM Cost: ~0.4GB', false, LOG_LEVELS.INFO);
}

// ============================================================================
// AUTOINITIALIZATION
// ============================================================================

/**
 * Initialize collector on current server
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 * @param {string[]} targetServers - Target servers to collect from
 * @returns {Promise<number>} - PID of collector process
 */
export async function initCollector(ns, reportPort = null, targetServers = []) {
    const actualReportPort = reportPort || COLLECTOR_PORT;
    
    // Build arguments
    const args = [`--reportPort ${actualReportPort}`];
    if (targetServers.length > 0) {
        targetServers.forEach(s => args.push(`--target ${s}`));
    }
    
    // Run collector script
    const pid = await ns.run(
        'darknet/collector.js',
        ns.getHostname(),
        1,
        args
    );
    
    return pid;
}

/**
 * Start collector on all accessible Darknet servers
 * 
 * @param {NS} ns - Netscript context
 * @param {string[]} servers - Array of server hostnames
 * @param {number} reportPort - Port for reporting
 * @param {string[]} targetServers - Target servers to collect from
 * @returns {Promise<Object>} - { started: number, failed: number, pids: number[] }
 */
export async function startCollectorOnAll(ns, servers, reportPort = null, targetServers = []) {
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
            
            // Try to start collector
            const pid = await initCollector(ns, reportPort, targetServers);
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

/**
 * Get collector statistics
 * 
 * @returns {Object} - Collection statistics
 */
export function getStats() {
    return { ...collected };
}

/**
 * Reset collector statistics
 */
export function resetStats() {
    collected = {
        money: 0,
        cacheFiles: 0,
        phishingSuccesses: 0,
        phishingEarnings: 0,
        serversProcessed: 0
    };
    discoveredServers = new Set();
    processedServers = new Set();
    cacheFilesFound = new Map();
}

/**
 * Get discovered servers
 * 
 * @returns {string[]} - Array of discovered servers
 */
export function getDiscoveredServers() {
    return Array.from(discoveredServers);
}

/**
 * Get cache files found
 * 
 * @returns {Object} - Cache files by server
 */
export function getCacheFiles() {
    return Object.fromEntries(cacheFilesFound);
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
    COLLECTOR_CONFIG,
    argsSchema,
    
    // Functions
    collectMoney,
    openCacheFiles,
    doPhishingAttack,
    collectFromServer,
    discoverServers,
    collectFromAll,
    initCollector,
    startCollectorOnAll,
    getStats,
    resetStats,
    getDiscoveredServers,
    getCacheFiles,
    
    // Main
    main,
    autocomplete
};
