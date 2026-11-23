/**
 * Darknet Worker
 * 
 * Generic worker script that performs multiple Darknet operations
 * Includes exploration, authentication, resource collection, and phishing
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 2.1.0 - Full API Integration with Phishing
 * 
 * RAM Cost: ~1.0GB (configurable)
 * 
 * Usage:
 *   run darknet/worker.js [--mode EXPLORE|PHISH|COLLECT|ALL] [--threads 5] [--ram 1.0]
 */

import {
    HOME, WORKER_VERSION, REPORT_INTERVAL, LOG_LEVELS,
    WORKER_PORT, EXPLORER_PORT, PHISHING_PORT, COLLECTOR_PORT,
    sendReport, createJobId
} from './protocol.js';

import {
    probeServers, getServerDetails, authenticate as authenticateServer, heartbleed as heartbleedServer,
    memoryReallocation, openCache, phishingAttack,
    getNsDataThroughFile, formatMoney, formatNumber, log, asleep
} from './utils.js';

// ============================================================================
// WORKER CONFIGURATION
// ============================================================================

/** Worker modes */
export const WORKER_MODES = {
    EXPLORE: 'explore',
    PHISH: 'phish',
    COLLECT: 'collect',
    ALL: 'all',
    AUTO: 'auto'
};

/** Default worker configuration */
export const WORKER_CONFIG = {
    /** Worker mode */
    mode: WORKER_MODES.AUTO,
    
    /** Number of threads for parallel operations */
    threads: 5,
    
    /** RAM allocation in GB */
    ram: 1.0,
    
    /** Enable exploration */
    enableExplore: true,
    
    /** Enable phishing */
    enablePhishing: true,
    
    /** Enable collection */
    enableCollect: true,
    
    /** Enable authentication */
    enableAuth: true,
    
    /** Enable memory reallocation */
    enableMemoryReallocation: true,
    
    /** Enable cache opening */
    enableCache: true,
    
    /** Worker interval (ms) */
    interval: REPORT_INTERVAL,
    
    /** Enable debug logging */
    debug: false,
    
    /** Report interval (ms) */
    reportInterval: REPORT_INTERVAL,
    
    /** Target servers (empty = all discovered) */
    targetServers: [],
    
    /** Enable auto-spread to new servers */
    autoSpread: true
};

/** Argument schema for command-line configuration */
export const argsSchema = [
    ['mode', 'auto'],
    ['threads', 5],
    ['ram', 1.0],
    ['explore', true],
    ['phish', true],
    ['collect', true],
    ['auth', true],
    ['memoryReallocation', true],
    ['cache', true],
    ['interval', REPORT_INTERVAL],
    ['debug', false],
    ['target', null],
    ['autoSpread', true],
    ['help', false]
];

// ============================================================================
// WORKER STATE
// ============================================================================

let workerStats = {
    authSuccesses: 0,
    authFailures: 0,
    exploredServers: 0,
    phishingSuccesses: 0,
    phishingEarnings: 0,
    cacheFilesOpened: 0,
    cacheEarnings: 0,
    memoryReallocations: 0,
    memoryFreed: 0,
    spreadAttempts: 0,
    spreadSuccesses: 0,
    totalOperations: 0
};

let discoveredServers = new Set();
let processedServers = new Set();
let knownPasswords = new Map(); // Map of server -> password
let running = true;
let jobId = '';

// ============================================================================
// WORKER OPERATIONS
// ============================================================================

/**
 * Authenticate with a server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} server - Server hostname
 * @param {string} password - Password to try
 * @returns {Promise<Object>} - Authentication result
 */
async function tryAuthenticate(ns, server, password = '') {
    try {
        const details = await getServerDetails(ns, server);
        
        if (!details || !details.isOnline || !details.isConnectedToCurrentServer) {
            return {
                success: false,
                server,
                reason: 'Server not accessible'
            };
        }
        
        // Use known password if available
        const actualPassword = knownPasswords.get(server) || password;
        
        const result = await authenticateServer(ns, server, actualPassword);
        
        if (result.success) {
            workerStats.authSuccesses++;
            
            // Store the password
            if (actualPassword) {
                knownPasswords.set(server, actualPassword);
            }
            
            return {
                success: true,
                server,
                password: actualPassword,
                hasSession: result.hasSession
            };
        } else {
            workerStats.authFailures++;
            
            // Try to get more info from heartbleed
            const heartbleedResult = await heartbleedServer(ns, server);
            
            return {
                success: false,
                server,
                reason: heartbleedResult?.hint || 'Authentication failed',
                logs: heartbleedResult?.logs
            };
        }
    } catch (e) {
        return {
            success: false,
            server,
            reason: `Error: ${e}`
        };
    }
}

/**
 * Explore nearby servers
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Exploration result
 */
async function exploreNearby(ns) {
    const results = {
        servers: [],
        authenticated: [],
        pending: [],
        failed: []
    };
    
    try {
        const neighbors = await probeServers(ns);
        
        for (const server of neighbors) {
            if (!discoveredServers.has(server)) {
                discoveredServers.add(server);
            }
            
            results.servers.push(server);
            
            // Try to authenticate if not already
            if (WORKER_CONFIG.enableAuth) {
                const details = await getServerDetails(ns, server);
                
                if (details && details.isConnectedToCurrentServer && details.isOnline) {
                    if (details.hasSession) {
                        results.authenticated.push(server);
                    } else if (!processedServers.has(server)) {
                        results.pending.push(server);
                    } else {
                        results.failed.push({
                            server,
                            reason: 'Already processed'
                        });
                    }
                } else {
                    results.failed.push({
                        server,
                        reason: 'Server not connected or offline'
                    });
                }
            }
        }
        
        workerStats.exploredServers += neighbors.length;
        return results;
    } catch (e) {
        return {
            success: false,
            message: `Error: ${e}`
        };
    }
}

/**
 * Perform phishing attack
 * 
 * @param {NS} ns - Netscript context
 * @param {string} server - Server hostname
 * @param {number} threads - Number of threads
 * @returns {Promise<Object>} - Phishing result
 */
async function doPhishing(ns, server, threads = 1) {
    try {
        const result = await phishingAttack(ns, server, threads);
        
        if (result.success) {
            workerStats.phishingSuccesses++;
            workerStats.phishingEarnings += result.money || 0;
            
            // Check for cache files
            if (result.cacheFile) {
                await openCacheFile(ns, result.cacheFile);
            }
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
 * Open a cache file
 * 
 * @param {NS} ns - Netscript context
 * @param {string} file - Cache file name
 * @returns {Promise<Object>} - Cache opening result
 */
async function openCacheFile(ns, file) {
    try {
        const result = await openCache(ns, file);
        
        if (result.success) {
            workerStats.cacheFilesOpened++;
            workerStats.cacheEarnings += result.money || 0;
        }
        
        return result;
    } catch (e) {
        return {
            success: false,
            file,
            message: `Error: ${e}`
        };
    }
}

/**
 * Find and open all cache files on current server
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Cache collection result
 */
async function collectCacheFiles(ns) {
    const results = {
        files: [],
        opened: 0,
        earnings: 0
    };
    
    try {
        const script = `ns.ls('${ns.getHostname()}', '.cache')`;
        const cacheFiles = await getNsDataThroughFile(ns, script);
        
        if (!Array.isArray(cacheFiles)) {
            return results;
        }
        
        for (const file of cacheFiles) {
            const result = await openCacheFile(ns, file);
            results.files.push(result);
            
            if (result.success) {
                results.opened++;
                results.earnings += result.money || 0;
            }
        }
        
        return results;
    } catch (e) {
        return {
            success: false,
            message: `Error: ${e}`
        };
    }
}

/**
 * Free up blocked RAM on current server
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Memory reallocation result
 */
async function freeMemory(ns) {
    const results = {
        freed: 0,
        attempts: 0,
        success: false
    };
    
    try {
        const currentServer = ns.getHostname();
        const details = await getServerDetails(ns, currentServer);
        
        if (!details || !details.isOnline) {
            return results;
        }
        
        // Check if there's blocked RAM
        const maxRam = details.maxRam;
        const usedRam = details.usedRam;
        const availableRam = maxRam - usedRam;
        
        // Try to free memory
        let attempt = 0;
        while (attempt < 10) {
            const result = await memoryReallocation(ns, currentServer);
            
            if (result.success) {
                results.freed += result.amount || 0;
                results.attempts++;
                
                // Check if we've freed enough
                if (result.complete || result.amount === 0) {
                    results.success = true;
                    break;
                }
            } else {
                break;
            }
            
            attempt++;
            await asleep(ns, 500);
        }
        
        workerStats.memoryReallocations += results.attempts;
        workerStats.memoryFreed += results.freed;
        
        return results;
    } catch (e) {
        return {
            success: false,
            message: `Error: ${e}`
        };
    }
}

/**
 * Spread worker to a new server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} target - Target server
 * @returns {Promise<Object>} - Spread result
 */
async function spreadToServer(ns, target) {
    try {
        // Check if we can execute on this server
        const details = await getServerDetails(ns, target);
        
        if (!details || !details.isOnline || !details.isConnectedToCurrentServer) {
            return {
                success: false,
                target,
                reason: 'Server not accessible'
            };
        }
        
        // Check if we have a session
        if (!details.hasSession) {
            return {
                success: false,
                target,
                reason: 'No session on server'
            };
        }
        
        // Check available RAM
        const freeRam = details.maxRam - details.usedRam;
        if (freeRam < WORKER_CONFIG.ram) {
            return {
                success: false,
                target,
                reason: `Not enough RAM (need ${WORKER_CONFIG.ram}GB, have ${freeRam}GB)`
            };
        }
        
        // Copy and execute
        const script = ns.getScriptName();
        const copyResult = await ns.scp(script, target);
        
        if (!copyResult) {
            return {
                success: false,
                target,
                reason: 'Failed to copy script'
            };
        }
        
        // Build arguments for worker
        const args = [
            `--mode ${WORKER_CONFIG.mode}`,
            `--threads ${WORKER_CONFIG.threads}`,
            `--ram ${WORKER_CONFIG.ram}`,
            `--reportPort ${WORKER_PORT}`
        ];
        
        if (WORKER_CONFIG.debug) args.push('--debug');
        if (WORKER_CONFIG.autoSpread) args.push('--autoSpread');
        
        const pid = await ns.exec(script, target, {
            threads: 1,
            temporary: false
        }, args);
        
        if (pid > 0) {
            workerStats.spreadSuccesses++;
            processedServers.add(target);
            
            return {
                success: true,
                target,
                pid,
                message: 'Worker spread successfully'
            };
        } else {
            return {
                success: false,
                target,
                reason: 'Failed to execute script'
            };
        }
    } catch (e) {
        return {
            success: false,
            target,
            reason: `Error: ${e}`
        };
    }
}

/**
 * Process a single server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} server - Server hostname
 * @returns {Promise<Object>} - Processing result
 */
async function processServer(ns, server) {
    const results = {
        server,
        operations: [],
        earnings: 0,
        cacheFiles: 0
    };
    
    try {
        const details = await getServerDetails(ns, server);
        
        if (!details || !details.isOnline) {
            results.operations.push({
                type: 'skip',
                reason: 'Server offline'
            });
            return results;
        }
        
        // Free memory first
        if (WORKER_CONFIG.enableMemoryReallocation) {
            const memResult = await freeMemory(ns);
            if (memResult.success) {
                results.operations.push({
                    type: 'memory_reallocation',
                    freed: memResult.freed,
                    attempts: memResult.attempts
                });
            }
        }
        
        // Collect cache files
        if (WORKER_CONFIG.enableCache) {
            const cacheResult = await collectCacheFiles(ns);
            results.earnings += cacheResult.earnings;
            results.cacheFiles += cacheResult.opened;
            results.operations.push({
                type: 'cache_collection',
                opened: cacheResult.opened,
                earnings: cacheResult.earnings
            });
        }
        
        // Phishing attacks
        if (WORKER_CONFIG.enablePhishing) {
            const freeRam = details.maxRam - details.usedRam;
            const threads = Math.max(1, Math.min(WORKER_CONFIG.threads, Math.floor(freeRam / 0.1)));
            
            const phishingResult = await doPhishing(ns, server, threads);
            if (phishingResult.success) {
                results.earnings += phishingResult.money || 0;
                results.operations.push({
                    type: 'phishing',
                    earnings: phishingResult.money,
                    threads
                });
            }
        }
        
        // Mark as processed
        processedServers.add(server);
        workerStats.totalOperations++;
        
        return results;
    } catch (e) {
        results.operations.push({
            type: 'error',
            message: String(e)
        });
        return results;
    }
}

// ============================================================================
// MAIN WORKER LOOP
// ============================================================================

/**
 * Worker loop for exploration mode
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 */
async function explorationLoop(ns, reportPort) {
    const host = ns.getHostname();
    
    log(ns, `Worker ${jobId} started in EXPLORE mode on ${host}`, false, LOG_LEVELS.INFO);
    
    while (running) {
        // Explore nearby servers
        const exploreResult = await exploreNearby(ns);
        
        // Process pending authentication
        for (const server of exploreResult.pending) {
            const authResult = await tryAuthenticate(ns, server);
            
            if (authResult.success) {
                log(ns, `Authenticated with ${server}`, false, LOG_LEVELS.INFO);
                
                // Spread to new server if auto-spread enabled
                if (WORKER_CONFIG.autoSpread) {
                    const spreadResult = await spreadToServer(ns, server);
                    if (spreadResult.success) {
                        workerStats.spreadAttempts++;
                        log(ns, `Spread to ${server} (PID: ${spreadResult.pid})`, false, LOG_LEVELS.INFO);
                    } else {
                        log(ns, `Failed to spread to ${server}: ${spreadResult.reason}`, false, LOG_LEVELS.WARN);
                    }
                }
            }
        }
        
        // Send report
        if (reportPort) {
            sendReport(ns, reportPort, {
                type: 'worker_exploration',
                host: ns.getHostname(),
                jobId,
                explored: exploreResult.servers.length,
                authenticated: exploreResult.authenticated.length,
                pending: exploreResult.pending.length,
                stats: { ...workerStats }
            });
        }
        
        // Delay
        await asleep(ns, WORKER_CONFIG.interval);
    }
}

/**
 * Worker loop for phishing mode
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 */
async function phishingLoop(ns, reportPort) {
    const host = ns.getHostname();
    
    log(ns, `Worker ${jobId} started in PHISH mode on ${host}`, false, LOG_LEVELS.INFO);
    
    while (running) {
        // Process target servers or all discovered
        let targets = WORKER_CONFIG.targetServers;
        if (targets.length === 0) {
            targets = Array.from(discoveredServers);
        }
        
        // Filter to only accessible servers
        const accessibleTargets = [];
        for (const target of targets) {
            const details = await getServerDetails(ns, target);
            if (details && details.isOnline && details.isConnectedToCurrentServer && details.hasSession) {
                accessibleTargets.push(target);
            }
        }
        
        // Perform phishing on accessible servers
        const batchSize = Math.min(WORKER_CONFIG.threads, accessibleTargets.length);
        const batches = [];
        
        for (let i = 0; i < accessibleTargets.length; i += batchSize) {
            batches.push(accessibleTargets.slice(i, i + batchSize));
        }
        
        for (const batch of batches) {
            const batchResults = await Promise.all(
                batch.map(target => doPhishing(ns, target, Math.floor(WORKER_CONFIG.threads / batch.length)))
            );
            
            // Log batch results
            const successes = batchResults.filter(r => r.success).length;
            if (successes > 0) {
                const earnings = batchResults.filter(r => r.success).reduce((sum, r) => sum + (r.money || 0), 0);
                log(ns, `Phishing batch: ${successes}/${batch.length} successes, ${formatMoney(earnings)} earned`, false, LOG_LEVELS.INFO);
            }
            
            await asleep(ns, 100);
        }
        
        // Send report
        if (reportPort) {
            sendReport(ns, reportPort, {
                type: 'worker_phishing',
                host: ns.getHostname(),
                jobId,
                phishingSuccesses: workerStats.phishingSuccesses,
                phishingEarnings: workerStats.phishingEarnings,
                stats: { ...workerStats }
            });
        }
        
        // Delay
        await asleep(ns, WORKER_CONFIG.interval);
    }
}

/**
 * Worker loop for collection mode
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 */
async function collectionLoop(ns, reportPort) {
    const host = ns.getHostname();
    
    log(ns, `Worker ${jobId} started in COLLECT mode on ${host}`, false, LOG_LEVELS.INFO);
    
    while (running) {
        // Process current server
        const processResult = await processServer(ns, ns.getHostname());
        
        // Explore and process new servers
        const exploreResult = await exploreNearby(ns);
        
        for (const server of exploreResult.pending) {
            const authResult = await tryAuthenticate(ns, server);
            
            if (authResult.success) {
                const processResult = await processServer(ns, server);
                
                if (WORKER_CONFIG.autoSpread) {
                    const spreadResult = await spreadToServer(ns, server);
                    if (spreadResult.success) {
                        workerStats.spreadAttempts++;
                    }
                }
            }
        }
        
        // Send report
        if (reportPort) {
            sendReport(ns, reportPort, {
                type: 'worker_collection',
                host: ns.getHostname(),
                jobId,
                earnings: processResult.earnings,
                cacheFiles: processResult.cacheFiles,
                operations: processResult.operations.length,
                stats: { ...workerStats }
            });
        }
        
        // Delay
        await asleep(ns, WORKER_CONFIG.interval);
    }
}

/**
 * Worker loop for ALL mode (combined)
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 */
async function allModeLoop(ns, reportPort) {
    const host = ns.getHostname();
    
    log(ns, `Worker ${jobId} started in ALL mode on ${host}`, false, LOG_LEVELS.INFO);
    
    while (running) {
        // Explore first
        const exploreResult = await exploreNearby(ns);
        
        // Process authentication and spreading
        for (const server of exploreResult.pending) {
            const authResult = await tryAuthenticate(ns, server);
            
            if (authResult.success) {
                if (WORKER_CONFIG.autoSpread) {
                    await spreadToServer(ns, server);
                }
            }
        }
        
        // Process current server
        const processResult = await processServer(ns, ns.getHostname());
        
        // Also process authenticated servers
        for (const server of exploreResult.authenticated) {
            await processServer(ns, server);
        }
        
        // Send report
        if (reportPort) {
            sendReport(ns, reportPort, {
                type: 'worker_all',
                host: ns.getHostname(),
                jobId,
                explored: exploreResult.servers.length,
                authenticated: exploreResult.authenticated.length,
                earnings: processResult.earnings,
                cacheFiles: processResult.cacheFiles,
                stats: { ...workerStats }
            });
        }
        
        // Delay
        await asleep(ns, WORKER_CONFIG.interval);
    }
}

/**
 * Worker loop for AUTO mode (adaptive)
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 */
async function autoModeLoop(ns, reportPort) {
    const host = ns.getHostname();
    
    log(ns, `Worker ${jobId} started in AUTO mode on ${host}`, false, LOG_LEVELS.INFO);
    
    while (running) {
        // Adapt mode based on situation
        let currentMode = WORKER_MODES.EXPLORE;
        
        const details = await getServerDetails(ns, host);
        
        if (details) {
            const freeRam = details.maxRam - details.usedRam;
            
            // If we have a lot of RAM, do more
            if (freeRam > WORKER_CONFIG.ram * 2) {
                currentMode = WORKER_MODES.ALL;
            } else if (freeRam > WORKER_CONFIG.ram) {
                currentMode = WORKER_MODES.PHISH;
            }
        }
        
        // Run appropriate loop for this cycle
        switch (currentMode) {
            case WORKER_MODES.EXPLORE:
                await explorationLoopIteration(ns, reportPort);
                break;
            case WORKER_MODES.PHISH:
                await phishingLoopIteration(ns, reportPort);
                break;
            case WORKER_MODES.COLLECT:
                await collectionLoopIteration(ns, reportPort);
                break;
            case WORKER_MODES.ALL:
                await allModeLoopIteration(ns, reportPort);
                break;
        }
        
        // Delay
        await asleep(ns, WORKER_CONFIG.interval);
    }
}

/**
 * Single iteration for exploration mode
 */
async function explorationLoopIteration(ns, reportPort) {
    const exploreResult = await exploreNearby(ns);
    
    for (const server of exploreResult.pending) {
        const authResult = await tryAuthenticate(ns, server);
        
        if (authResult.success && WORKER_CONFIG.autoSpread) {
            await spreadToServer(ns, server);
        }
    }
    
    if (reportPort) {
        sendReport(ns, reportPort, {
            type: 'worker_exploration',
            host: ns.getHostname(),
            jobId,
            explored: exploreResult.servers.length,
            stats: { ...workerStats }
        });
    }
}

/**
 * Single iteration for phishing mode
 */
async function phishingLoopIteration(ns, reportPort) {
    let targets = WORKER_CONFIG.targetServers;
    if (targets.length === 0) {
        targets = Array.from(discoveredServers);
    }
    
    const accessibleTargets = [];
    for (const target of targets) {
        const details = await getServerDetails(ns, target);
        if (details && details.isOnline && details.isConnectedToCurrentServer && details.hasSession) {
            accessibleTargets.push(target);
        }
    }
    
    const batchSize = Math.min(WORKER_CONFIG.threads, accessibleTargets.length);
    for (let i = 0; i < accessibleTargets.length; i += batchSize) {
        const batch = accessibleTargets.slice(i, i + batchSize);
        const threadsPer = Math.floor(WORKER_CONFIG.threads / batch.length) || 1;
        
        await Promise.all(
            batch.map(target => doPhishing(ns, target, threadsPer))
        );
        
        await asleep(ns, 100);
    }
    
    if (reportPort) {
        sendReport(ns, reportPort, {
            type: 'worker_phishing',
            host: ns.getHostname(),
            jobId,
            phishingSuccesses: workerStats.phishingSuccesses,
            phishingEarnings: workerStats.phishingEarnings
        });
    }
}

/**
 * Single iteration for collection mode
 */
async function collectionLoopIteration(ns, reportPort) {
    const processResult = await processServer(ns, ns.getHostname());
    
    const exploreResult = await exploreNearby(ns);
    
    for (const server of exploreResult.pending) {
        const authResult = await tryAuthenticate(ns, server);
        
        if (authResult.success) {
            await processServer(ns, server);
            
            if (WORKER_CONFIG.autoSpread) {
                await spreadToServer(ns, server);
            }
        }
    }
    
    if (reportPort) {
        sendReport(ns, reportPort, {
            type: 'worker_collection',
            host: ns.getHostname(),
            jobId,
            earnings: processResult.earnings,
            cacheFiles: processResult.cacheFiles,
            stats: { ...workerStats }
        });
    }
}

/**
 * Single iteration for ALL mode
 */
async function allModeLoopIteration(ns, reportPort) {
    const exploreResult = await exploreNearby(ns);
    
    for (const server of exploreResult.pending) {
        const authResult = await tryAuthenticate(ns, server);
        
        if (authResult.success && WORKER_CONFIG.autoSpread) {
            await spreadToServer(ns, server);
        }
    }
    
    const processResult = await processServer(ns, ns.getHostname());
    
    for (const server of exploreResult.authenticated) {
        await processServer(ns, server);
    }
    
    if (reportPort) {
        sendReport(ns, reportPort, {
            type: 'worker_all',
            host: ns.getHostname(),
            jobId,
            explored: exploreResult.servers.length,
            earnings: processResult.earnings,
            cacheFiles: processResult.cacheFiles,
            stats: { ...workerStats }
        });
    }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Main entry point for worker
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
    
    const mode = flags.mode || WORKER_MODES.AUTO;
    const threads = Number(flags.threads) || WORKER_CONFIG.threads;
    const ram = Number(flags.ram) || WORKER_CONFIG.ram;
    const reportPort = Number(flags.reportPort) || WORKER_PORT;
    const interval = Number(flags.interval) || REPORT_INTERVAL;
    const debug = flags.debug || false;
    const autoSpread = flags.autoSpread !== false;
    
    const explore = flags.explore !== false;
    const phish = flags.phish !== false;
    const collect = flags.collect !== false;
    const auth = flags.auth !== false;
    const memoryReallocation = flags.memoryReallocation !== false;
    const cache = flags.cache !== false;
    
    // Parse target servers
    let targetServers = [];
    if (flags.target) {
        targetServers = Array.isArray(flags.target) ? flags.target : [flags.target];
    }
    
    // Update config
    WORKER_CONFIG.mode = mode;
    WORKER_CONFIG.threads = threads;
    WORKER_CONFIG.ram = ram;
    WORKER_CONFIG.interval = interval;
    WORKER_CONFIG.debug = debug;
    WORKER_CONFIG.autoSpread = autoSpread;
    WORKER_CONFIG.enableExplore = explore;
    WORKER_CONFIG.enablePhishing = phish;
    WORKER_CONFIG.enableCollect = collect;
    WORKER_CONFIG.enableAuth = auth;
    WORKER_CONFIG.enableMemoryReallocation = memoryReallocation;
    WORKER_CONFIG.enableCache = cache;
    WORKER_CONFIG.targetServers = targetServers;
    
    // Generate job ID
    jobId = createJobId('worker');
    
    // Initialize discovered servers
    discoveredServers.add(ns.getHostname());
    
    // Start appropriate loop
    switch (mode) {
        case WORKER_MODES.EXPLORE:
            await explorationLoop(ns, reportPort);
            break;
        case WORKER_MODES.PHISH:
            await phishingLoop(ns, reportPort);
            break;
        case WORKER_MODES.COLLECT:
            await collectionLoop(ns, reportPort);
            break;
        case WORKER_MODES.ALL:
            await allModeLoop(ns, reportPort);
            break;
        case WORKER_MODES.AUTO:
        default:
            await autoModeLoop(ns, reportPort);
            break;
    }
}

/**
 * Show help message
 * 
 * @param {NS} ns - Netscript context
 */
function showHelp(ns) {
    log(ns, 'Darknet Worker', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Usage:', false, LOG_LEVELS.INFO);
    log(ns, '  run darknet/worker.js [OPTIONS]', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Options:', false, LOG_LEVELS.INFO);
    log(ns, '  --mode MODE           Worker mode: explore, phish, collect, all, auto (default: auto)', false, LOG_LEVELS.INFO);
    log(ns, '  --threads NUM        Number of threads (default: 5)', false, LOG_LEVELS.INFO);
    log(ns, '  --ram NUM            RAM allocation in GB (default: 1.0)', false, LOG_LEVELS.INFO);
    log(ns, '  --explore            Enable exploration (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --phish              Enable phishing (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --collect            Enable collection (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --auth               Enable authentication (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --memoryReallocation Enable memory reallocation (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --cache              Enable cache file opening (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --interval MS        Worker interval (default: ' + REPORT_INTERVAL + 'ms)', false, LOG_LEVELS.INFO);
    log(ns, '  --target SERVER       Target specific server (can be used multiple times)', false, LOG_LEVELS.INFO);
    log(ns, '  --autoSpread         Auto-spread to new servers (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --debug              Enable debug logging', false, LOG_LEVELS.INFO);
    log(ns, '  --reportPort NUM     Port for reporting (default: ' + WORKER_PORT + ')', false, LOG_LEVELS.INFO);
    log(ns, '  --help               Show this help message', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Description:', false, LOG_LEVELS.INFO);
    log(ns, '  Generic worker script for Darknet operations', false, LOG_LEVELS.INFO);
    log(ns, '  Supports exploration, authentication, phishing, and collection', false, LOG_LEVELS.INFO);
    log(ns, '  RAM Cost: ~1.0GB (configurable)', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Modes:', false, LOG_LEVELS.INFO);
    log(ns, '  explore: Focus on discovering and authenticating with new servers', false, LOG_LEVELS.INFO);
    log(ns, '  phish:   Focus on phishing attacks for money', false, LOG_LEVELS.INFO);
    log(ns, '  collect: Focus on collecting resources from current server', false, LOG_LEVELS.INFO);
    log(ns, '  all:     Perform all operations', false, LOG_LEVELS.INFO);
    log(ns, '  auto:    Automatically adapt based on available resources', false, LOG_LEVELS.INFO);
}

// ============================================================================
// AUTOINITIALIZATION
// ============================================================================

/**
 * Initialize worker on current server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} mode - Worker mode
 * @param {number} reportPort - Port for reporting
 * @param {Object} config - Configuration overrides
 * @returns {Promise<number>} - PID of worker process
 */
export async function initWorker(ns, mode = WORKER_MODES.AUTO, reportPort = null, config = {}) {
    const actualReportPort = reportPort || WORKER_PORT;
    
    // Build arguments
    const args = [
        `--mode ${mode}`,
        `--reportPort ${actualReportPort}`
    ];
    
    if (config.threads) args.push(`--threads ${config.threads}`);
    if (config.ram) args.push(`--ram ${config.ram}`);
    if (config.interval) args.push(`--interval ${config.interval}`);
    if (config.debug) args.push('--debug');
    if (config.autoSpread !== undefined) {
        if (config.autoSpread) args.push('--autoSpread');
        else args.push('--no-autoSpread');
    }
    if (config.explore !== undefined) {
        if (config.explore) args.push('--explore');
        else args.push('--no-explore');
    }
    if (config.phish !== undefined) {
        if (config.phish) args.push('--phish');
        else args.push('--no-phish');
    }
    if (config.collect !== undefined) {
        if (config.collect) args.push('--collect');
        else args.push('--no-collect');
    }
    
    // Run worker script
    const pid = await ns.run(
        'darknet/worker.js',
        ns.getHostname(),
        1,
        args
    );
    
    return pid;
}

/**
 * Start worker on all accessible Darknet servers
 * 
 * @param {NS} ns - Netscript context
 * @param {string[]} servers - Array of server hostnames
 * @param {string} mode - Worker mode
 * @param {number} reportPort - Port for reporting
 * @param {Object} config - Configuration overrides
 * @returns {Promise<Object>} - { started: number, failed: number, pids: number[] }
 */
export async function startWorkersOnAll(ns, servers, mode = WORKER_MODES.AUTO, reportPort = null, config = {}) {
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
            
            // Check RAM
            const freeRam = details.maxRam - details.usedRam;
            const ramNeeded = config.ram || WORKER_CONFIG.ram;
            if (freeRam < ramNeeded) {
                failed.push({ server, reason: `Not enough RAM (need ${ramNeeded}GB, have ${freeRam}GB)` });
                continue;
            }
            
            // Try to start worker
            const pid = await initWorker(ns, mode, reportPort, config);
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
 * Get worker statistics
 * 
 * @returns {Object} - Worker statistics
 */
export function getStats() {
    return { ...workerStats };
}

/**
 * Reset worker statistics
 */
export function resetStats() {
    workerStats = {
        authSuccesses: 0,
        authFailures: 0,
        exploredServers: 0,
        phishingSuccesses: 0,
        phishingEarnings: 0,
        cacheFilesOpened: 0,
        cacheEarnings: 0,
        memoryReallocations: 0,
        memoryFreed: 0,
        spreadAttempts: 0,
        spreadSuccesses: 0,
        totalOperations: 0
    };
    discoveredServers = new Set();
    processedServers = new Set();
    knownPasswords = new Map();
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
 * Get known passwords
 * 
 * @returns {Object} - Map of server -> password
 */
export function getKnownPasswords() {
    return Object.fromEntries(knownPasswords);
}

/**
 * Stop all workers
 */
export function stopAll() {
    running = false;
}

/**
 * Autocomplete function for command-line arguments
 * 
 * @param {Object} data - Autocomplete data
 */
export function autocomplete(data) {
    data.flags(argsSchema);
    return [
        WORKER_MODES.EXPLORE,
        WORKER_MODES.PHISH,
        WORKER_MODES.COLLECT,
        WORKER_MODES.ALL,
        WORKER_MODES.AUTO
    ];
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
    // Constants
    WORKER_MODES,
    WORKER_CONFIG,
    argsSchema,
    
    // Functions
    tryAuthenticate,
    exploreNearby,
    doPhishing,
    openCacheFile,
    collectCacheFiles,
    freeMemory,
    spreadToServer,
    processServer,
    initWorker,
    startWorkersOnAll,
    getStats,
    resetStats,
    getDiscoveredServers,
    getKnownPasswords,
    stopAll,
    
    // Main
    main,
    autocomplete
};
