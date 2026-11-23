/**
 * Darknet Migration Explorer
 * 
 * Uses ns.dnet.induceServerMigration() to force servers to move and explore
 * disconnected parts of the Darknet.
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 2.1.0
 * 
 * RAM Cost: ~0.3GB per migration induction
 * 
 * Usage:
 *   run darknet/migration-explorer.js [--target SERVER] [--charges 10]
 */

import {
    HOME, WORKER_VERSION, REPORT_INTERVAL, MIGRATION_INDUCTION_INTERVAL,
    MIGRATION_PORT, MIGRATION_LOG, LOG_LEVELS,
    sendReport, createJobId
} from './protocol.js';

import {
    induceServerMigration, forceServerMigration,
    probeServers, getServerDetails, getAllServerDetails,
    getNsDataThroughFile, formatMoney, formatNumber, log, asleep
} from './utils.js';

// ============================================================================
// MIGRATION CONFIGURATION
// ============================================================================

/** Default migration configuration */
export const MIGRATION_CONFIG = {
    /** Number of charges needed to force migration */
    chargesNeeded: 10,
    
    /** Cooldown between migration inductions (ms) */
    cooldown: MIGRATION_INDUCTION_INTERVAL,
    
    /** Maximum migration attempts per cycle */
    maxAttempts: 5,
    
    /** Maximum concurrent migrations */
    maxConcurrent: 3,
    
    /** Enable debug logging */
    debug: false,
    
    /** Report interval (ms) */
    reportInterval: REPORT_INTERVAL,
    
    /** Auto-explore new servers after migration */
    autoExplore: true,
    
    /** Enable network mapping */
    enableMapping: true
};

/** Argument schema for command-line configuration */
export const argsSchema = [
    ['target', null],        // Specific server to migrate
    ['charges', 10],         // Number of charges needed
    ['cooldown', MIGRATION_INDUCTION_INTERVAL],
    ['maxAttempts', 5],
    ['debug', false],
    ['autoExplore', true],
    ['enableMapping', true],
    ['help', false]
];

// ============================================================================
// MIGRATION STATE
// ============================================================================

let migrationAttempts = {};  // Map of server -> attempt count
let migrationSuccesses = {}; // Map of server -> success count
let totalMigrations = 0;
let discoveredServers = new Set();
let networkMap = {}; // Map of server -> connections

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Induce migration on a single server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} target - Target server hostname
 * @returns {Promise<Object>} - Migration result
 */
export async function induceMigration(ns, target) {
    try {
        const result = await induceServerMigration(ns, target);
        
        // Update stats
        migrationAttempts[target] = (migrationAttempts[target] || 0) + 1;
        totalMigrations++;
        
        if (result?.success) {
            migrationSuccesses[target] = (migrationSuccesses[target] || 0) + 1;
        }
        
        return {
            success: result?.success || false,
            target,
            message: result?.message || 'Migration induced'
        };
    } catch (e) {
        return {
            success: false,
            target,
            message: `Error: ${e}`
        };
    }
}

/**
 * Force migration on a server (accumulate charges)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} target - Target server hostname
 * @param {number} chargesNeeded - Number of charges needed
 * @returns {Promise<Object>} - Final migration result
 */
export async function forceMigration(ns, target, chargesNeeded = MIGRATION_CONFIG.chargesNeeded) {
    const results = [];
    
    for (let i = 0; i < chargesNeeded; i++) {
        const result = await induceMigration(ns, target);
        results.push(result);
        
        if (!result.success) {
            return {
                success: false,
                target,
                chargesApplied: i + 1,
                message: `Failed at charge ${i + 1}`,
                results
            };
        }
        
        // Small delay between inductions
        await asleep(ns, 1000);
    }
    
    return {
        success: true,
        target,
        chargesApplied: chargesNeeded,
        message: 'Server migration forced',
        results
    };
}

/**
 * Check if a server needs migration
 * 
 * @param {NS} ns - Netscript context
 * @param {string} target - Target server hostname
 * @returns {Promise<Object>} - { needsMigration: boolean, reason?: string }
 */
export async function needsMigration(ns, target) {
    try {
        const details = await getServerDetails(ns, target);
        
        if (!details) {
            return { needsMigration: false, reason: 'Server not found' };
        }
        
        if (!details.isOnline) {
            return { needsMigration: false, reason: 'Server is offline' };
        }
        
        // Check if server is connected
        if (!details.isConnectedToCurrentServer) {
            return { needsMigration: true, reason: 'Server not connected - may need migration' };
        }
        
        // Check attempt count
        const attempts = migrationAttempts[target] || 0;
        if (attempts >= MIGRATION_CONFIG.maxAttempts) {
            return { needsMigration: false, reason: `Max attempts reached (${attempts})` };
        }
        
        // Server is connected and accessible
        return { needsMigration: false, reason: 'Server is accessible' };
    } catch (e) {
        return { needsMigration: false, reason: `Error: ${e}` };
    }
}

/**
 * Find servers that need migration (disconnected servers)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<string[]>} - Array of server hostnames
 */
export async function findMigrationTargets(ns) {
    const targets = [];
    
    try {
        const { servers, details } = await getAllServerDetails(ns);
        
        for (const host of servers) {
            const serverDetails = details[host];
            
            if (!serverDetails) continue;
            
            // Skip if already connected
            if (serverDetails.isConnectedToCurrentServer) {
                continue;
            }
            
            // Skip if offline
            if (!serverDetails.isOnline) {
                continue;
            }
            
            // This server might be in a disconnected part of the network
            targets.push(host);
        }
    } catch (e) {
        log(ns, `Failed to find migration targets: ${e}`, false, LOG_LEVELS.ERROR);
    }
    
    return targets;
}

/**
 * Explore network by forcing server migrations
 * 
 * @param {NS} ns - Netscript context
 * @param {string[]} targets - Servers to migrate
 * @param {number} chargesNeeded - Number of charges needed
 * @returns {Promise<Object>} - Migration results
 */
export async function exploreByMigration(ns, targets = [], chargesNeeded = MIGRATION_CONFIG.chargesNeeded) {
    const results = {
        migrated: [],
        failed: [],
        newServers: []
    };
    
    // If no targets specified, find disconnected servers
    const actualTargets = targets.length > 0 ? targets : await findMigrationTargets(ns);
    
    // Limit concurrent migrations
    const batchSize = Math.min(MIGRATION_CONFIG.maxConcurrent, actualTargets.length);
    const batches = [];
    
    for (let i = 0; i < actualTargets.length; i += batchSize) {
        batches.push(actualTargets.slice(i, i + batchSize));
    }
    
    for (const batch of batches) {
        const batchResults = await Promise.all(
            batch.map(target => forceMigration(ns, target, chargesNeeded))
        );
        
        for (const result of batchResults) {
            if (result.success) {
                results.migrated.push(result);
                
                // After migration, explore new connections
                if (MIGRATION_CONFIG.autoExplore) {
                    const newServers = await exploreNewConnections(ns);
                    results.newServers.push(...newServers);
                }
            } else {
                results.failed.push(result);
            }
        }
        
        // Delay between batches
        await asleep(ns, MIGRATION_CONFIG.cooldown);
    }
    
    return results;
}

/**
 * Explore new connections after migration
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<string[]>} - Newly discovered servers
 */
export async function exploreNewConnections(ns) {
    const newServers = [];
    
    try {
        const currentServer = ns.getHostname();
        const neighbors = await probeServers(ns);
        
        for (const neighbor of neighbors) {
            if (!discoveredServers.has(neighbor)) {
                discoveredServers.add(neighbor);
                newServers.push(neighbor);
                
                // Update network map
                if (MIGRATION_CONFIG.enableMapping) {
                    updateNetworkMap(currentServer, neighbor);
                }
            }
        }
    } catch (e) {
        log(ns, `Failed to explore new connections: ${e}`, false, LOG_LEVELS.ERROR);
    }
    
    return newServers;
}

/**
 * Update network map
 * 
 * @param {string} source - Source server
 * @param {string} target - Target server
 */
function updateNetworkMap(source, target) {
    if (!networkMap[source]) {
        networkMap[source] = new Set();
    }
    networkMap[source].add(target);
    
    // Bidirectional
    if (!networkMap[target]) {
        networkMap[target] = new Set();
    }
    networkMap[target].add(source);
}

/**
 * Get network map
 * 
 * @returns {Object} - Network map
 */
export function getNetworkMap() {
    return networkMap;
}

/**
 * Get migration statistics
 * 
 * @returns {Object} - Migration stats
 */
export function getMigrationStats() {
    return {
        totalMigrations,
        migrationAttempts,
        migrationSuccesses,
        discoveredServers: discoveredServers.size,
        networkMapSize: Object.keys(networkMap).length
    };
}

/**
 * Reset migration statistics
 */
export function resetMigrationStats() {
    migrationAttempts = {};
    migrationSuccesses = {};
    totalMigrations = 0;
    // Keep discoveredServers and networkMap for persistence
}

/**
 * Save migration stats to file
 * 
 * @param {NS} ns - Netscript context
 */
export async function saveMigrationStats(ns) {
    try {
        const stats = getMigrationStats();
        const data = {
            timestamp: Date.now(),
            host: ns.getHostname(),
            ...stats,
            networkMap: networkMap
        };
        
        ns.write(MIGRATION_LOG, JSON.stringify(data, null, 2), 'w');
    } catch (e) {
        log(ns, `Failed to save migration stats: ${e}`, false, LOG_LEVELS.ERROR);
    }
}

/**
 * Load migration stats from file
 * 
 * @param {NS} ns - Netscript context
 */
export async function loadMigrationStats(ns) {
    try {
        if (ns.fileExists(MIGRATION_LOG)) {
            const data = JSON.parse(ns.read(MIGRATION_LOG));
            
            // Restore network map
            if (data.networkMap) {
                for (const [key, value] of Object.entries(data.networkMap)) {
                    networkMap[key] = new Set(value);
                }
            }
            
            // Restore discovered servers
            if (data.discoveredServers) {
                for (const server of data.discoveredServers) {
                    discoveredServers.add(server);
                }
            }
            
            log(ns, `Loaded migration stats: ${discoveredServers.size} servers, ${Object.keys(networkMap).length} connections`, false, LOG_LEVELS.INFO);
        }
    } catch (e) {
        log(ns, `Failed to load migration stats: ${e}`, false, LOG_LEVELS.WARN);
    }
}

// ============================================================================
// MAIN MIGRATION LOOP
// ============================================================================

/**
 * Main migration exploration loop
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 * @param {string[]} targetServers - Servers to migrate
 * @param {number} chargesNeeded - Number of charges needed
 */
async function migrationLoop(ns, reportPort, targetServers, chargesNeeded) {
    const host = ns.getHostname();
    
    // Load previous stats
    await loadMigrationStats(ns);
    
    // Initialize
    resetMigrationStats();
    log(ns, `Migration explorer started on ${host}`, false, LOG_LEVELS.INFO);
    
    while (true) {
        const now = Date.now();
        
        // Explore by migration
        const results = await exploreByMigration(ns, targetServers, chargesNeeded);
        
        // Report results
        if (reportPort) {
            sendReport(ns, reportPort, {
                type: 'migration',
                host: ns.getHostname(),
                migrated: results.migrated.length,
                failed: results.failed.length,
                newServers: results.newServers.length,
                totalMigrations: totalMigrations,
                discoveredServers: discoveredServers.size
            });
        }
        
        // Log results
        if (results.migrated.length > 0) {
            log(ns, `Migrated ${results.migrated.length} servers, discovered ${results.newServers.length} new connections`, false, LOG_LEVELS.INFO);
        }
        
        if (results.failed.length > 0 && MIGRATION_CONFIG.debug) {
            for (const fail of results.failed) {
                log(ns, `Failed to migrate ${fail.target}: ${fail.message}`, false, LOG_LEVELS.DEBUG);
            }
        }
        
        if (results.newServers.length > 0) {
            log(ns, `Discovered new servers: ${results.newServers.join(', ')}`, false, LOG_LEVELS.INFO);
        }
        
        // Save stats periodically
        if (totalMigrations % 10 === 0) {
            await saveMigrationStats(ns);
        }
        
        // Sleep for cooldown
        await asleep(ns, MIGRATION_CONFIG.cooldown);
    }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Main entry point for migration explorer
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
    
    const reportPort = Number(flags.reportPort) || MIGRATION_PORT;
    const chargesNeeded = Number(flags.charges) || MIGRATION_CONFIG.chargesNeeded;
    const cooldown = Number(flags.cooldown) || MIGRATION_CONFIG.cooldown;
    const maxAttempts = Number(flags.maxAttempts) || MIGRATION_CONFIG.maxAttempts;
    const debug = flags.debug || false;
    const autoExplore = flags.autoExplore !== false;
    const enableMapping = flags.enableMapping !== false;
    
    // Parse target servers
    let targetServers = [];
    if (flags.target) {
        targetServers = Array.isArray(flags.target) ? flags.target : [flags.target];
    }
    
    // Update config
    MIGRATION_CONFIG.chargesNeeded = chargesNeeded;
    MIGRATION_CONFIG.cooldown = cooldown;
    MIGRATION_CONFIG.maxAttempts = maxAttempts;
    MIGRATION_CONFIG.debug = debug;
    MIGRATION_CONFIG.autoExplore = autoExplore;
    MIGRATION_CONFIG.enableMapping = enableMapping;
    
    // Start migration loop
    await migrationLoop(ns, reportPort, targetServers, chargesNeeded);
}

/**
 * Show help message
 * 
 * @param {NS} ns - Netscript context
 */
function showHelp(ns) {
    log(ns, 'Darknet Migration Explorer', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Usage:', false, LOG_LEVELS.INFO);
    log(ns, '  run darknet/migration-explorer.js [OPTIONS]', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Options:', false, LOG_LEVELS.INFO);
    log(ns, '  --target SERVER     Specific server to migrate (can be used multiple times)', false, LOG_LEVELS.INFO);
    log(ns, '  --charges NUM       Number of charges needed (default: 10)', false, LOG_LEVELS.INFO);
    log(ns, '  --cooldown MS       Cooldown between inductions (default: ' + MIGRATION_INDUCTION_INTERVAL + 'ms)', false, LOG_LEVELS.INFO);
    log(ns, '  --maxAttempts NUM   Max migration attempts per cycle (default: 5)', false, LOG_LEVELS.INFO);
    log(ns, '  --debug             Enable debug logging', false, LOG_LEVELS.INFO);
    log(ns, '  --autoExplore       Auto-explore new connections (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --enableMapping     Enable network mapping (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --help              Show this help message', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Description:', false, LOG_LEVELS.INFO);
    log(ns, '  Uses ns.dnet.induceServerMigration() to force servers to move', false, LOG_LEVELS.INFO);
    log(ns, '  Enables exploration of disconnected parts of the Darknet', false, LOG_LEVELS.INFO);
    log(ns, '  RAM Cost: ~0.3GB per migration induction', false, LOG_LEVELS.INFO);
}

// ============================================================================
// AUTOINITIALIZATION
// ============================================================================

/**
 * Initialize migration explorer on current server
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 * @param {string[]} targetServers - Servers to migrate
 * @param {number} chargesNeeded - Number of charges needed
 * @returns {Promise<number>} - PID of migration process
 */
export async function initMigrationExplorer(ns, reportPort = null, targetServers = [], chargesNeeded = null) {
    const actualReportPort = reportPort || MIGRATION_PORT;
    const actualCharges = chargesNeeded || MIGRATION_CONFIG.chargesNeeded;
    
    // Build arguments
    const args = [`--reportPort ${actualReportPort}`, `--charges ${actualCharges}`];
    if (targetServers.length > 0) {
        targetServers.forEach(s => args.push(`--target ${s}`));
    }
    
    // Run migration script
    const pid = await ns.run(
        'darknet/migration-explorer.js',
        ns.getHostname(),
        1,
        args
    );
    
    return pid;
}

/**
 * Start migration explorer on all accessible Darknet servers
 * 
 * @param {NS} ns - Netscript context
 * @param {string[]} servers - Array of server hostnames
 * @param {number} reportPort - Port for reporting
 * @param {string[]} targetServers - Servers to migrate
 * @returns {Promise<Object>} - { started: number, failed: number, pids: number[] }
 */
export async function startMigrationOnAll(ns, servers, reportPort = null, targetServers = []) {
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
            
            // Try to start migration explorer
            const pid = await initMigrationExplorer(ns, reportPort, targetServers);
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
    MIGRATION_CONFIG,
    argsSchema,
    
    // Functions
    induceMigration,
    forceMigration,
    needsMigration,
    findMigrationTargets,
    exploreByMigration,
    exploreNewConnections,
    updateNetworkMap,
    getNetworkMap,
    getMigrationStats,
    resetMigrationStats,
    saveMigrationStats,
    loadMigrationStats,
    initMigrationExplorer,
    startMigrationOnAll,
    
    // Main
    main,
    autocomplete
};
