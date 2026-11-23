/**
 * Darknet Phishing Module
 * 
 * Implements ns.dnet.phishingAttack() for passive income generation.
 * Runs on individual Darknet servers to earn money and find cache files.
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 2.1.0
 * 
 * RAM Cost: ~0.0GB (phishingAttack has low/no RAM cost)
 * 
 * Usage:
 *   run darknet/phishing.js [--reportPort 10152] [--cooldown 15000]
 */

import {
    HOME, WORKER_VERSION, REPORT_INTERVAL, PHISHING_COOLDOWN,
    PHISHING_PORT, PHISHING_LOG, LOG_LEVELS,
    sendReport, createJobId, isWorkerFresh
} from './protocol.js';

import {
    runPhishingAttack, canPhish, openCache, listFiles,
    getNsDataThroughFile, formatMoney, formatNumber, log, asleep
} from './utils.js';

// ============================================================================
// PHISHING CONFIGURATION
// ============================================================================

/** Default phishing configuration */
export const PHISHING_CONFIG = {
    /** Cooldown between phishing attacks (ms) */
    cooldown: PHISHING_COOLDOWN,
    
    /** Minimum charisma to attempt phishing */
    minCharisma: 100,
    
    /** Minimum crime success rate */
    minCrimeSuccess: 0.5,
    
    /** Enable debug logging */
    debug: false,
    
    /** Report interval (ms) */
    reportInterval: REPORT_INTERVAL,
    
    /** Enable cache opening after phishing */
    autoOpenCaches: true,
    
    /** Track individual attack results */
    trackResults: true
};

/** Argument schema for command-line configuration */
export const argsSchema = [
    ['reportPort', PHISHING_PORT],
    ['cooldown', PHISHING_COOLDOWN],
    ['debug', false],
    ['autoOpenCaches', true],
    ['trackResults', true],
    ['minCharisma', 100],
    ['help', false]
];

// ============================================================================
// PHISHING STATE
// ============================================================================

let lastPhishingTime = 0;
let totalMoneyEarned = 0;
let totalCachesFound = 0;
let attackCount = 0;
let successCount = 0;

// ============================================================================
// PHISHING FUNCTIONS
// ============================================================================

/**
 * Run a single phishing attack
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Phishing result
 */
export async function runPhishing(ns) {
    try {
        const result = await runPhishingAttack(ns);
        
        // Update stats
        attackCount++;
        totalMoneyEarned += result.money || 0;
        
        if (result.success) {
            successCount++;
            if (result.cacheFile) {
                totalCachesFound++;
            }
        }
        
        return result;
    } catch (e) {
        return {
            success: false,
            money: 0,
            cacheFile: null,
            message: `Error: ${e}`
        };
    }
}

/**
 * Open a cache file found from phishing
 * 
 * @param {NS} ns - Netscript context
 * @param {string} filename - Cache filename
 * @returns {Promise<Object>} - Cache open result
 */
export async function openPhishingCache(ns, filename) {
    try {
        const result = await openCache(ns, ns.getHostname());
        if (result && result.success) {
            return {
                success: true,
                reward: result.reward || 0,
                filename
            };
        }
        return { success: false, reward: 0, filename };
    } catch (e) {
        return { success: false, reward: 0, filename, error: String(e) };
    }
}

/**
 * Check if phishing is viable on current server
 * 
 * @param {NS} ns - Netscript context
 * @param {number} minCharisma - Minimum charisma requirement
 * @returns {Promise<Object>} - { canPhish: boolean, reason?: string }
 */
export async function checkPhishingViability(ns, minCharisma = PHISHING_CONFIG.minCharisma) {
    // Must be on a Darknet server (not home)
    if (ns.getHostname() === HOME) {
        return { canPhish: false, reason: 'Must run on Darknet server, not home' };
    }
    
    // Check if Darknet API is available
    const hasAccess = await canPhish(ns);
    if (!hasAccess.canPhish) {
        return { canPhish: false, reason: hasAccess.reason || 'No Darknet access' };
    }
    
    // Check charisma
    const player = await getNsDataThroughFile(ns, 'ns.getPlayer()', '/Temp/player-check.txt');
    if (player && player.charisma < minCharisma) {
        return { 
            canPhish: false, 
            reason: `Charisma too low (${player.charisma} < ${minCharisma})` 
        };
    }
    
    // Check crime success rate (if available)
    if (player && player.crime_success_chance && player.crime_success_chance < PHISHING_CONFIG.minCrimeSuccess) {
        return { 
            canPhish: false, 
            reason: `Crime success rate too low (${(player.crime_success_chance * 100).toFixed(1)}% < ${PHISHING_CONFIG.minCrimeSuccess * 100}%)` 
        };
    }
    
    return { canPhish: true };
}

/**
 * Get phishing statistics
 * 
 * @returns {Object} - Phishing stats
 */
export function getPhishingStats() {
    const successRate = attackCount > 0 ? (successCount / attackCount) * 100 : 0;
    const avgMoneyPerAttack = attackCount > 0 ? totalMoneyEarned / attackCount : 0;
    
    return {
        attackCount,
        successCount,
        successRate: `${successRate.toFixed(1)}%`,
        totalMoneyEarned,
        totalCachesFound,
        avgMoneyPerAttack,
        avgMoneyPerSuccess: successCount > 0 ? totalMoneyEarned / successCount : 0
    };
}

/**
 * Reset phishing statistics
 */
export function resetPhishingStats() {
    lastPhishingTime = 0;
    totalMoneyEarned = 0;
    totalCachesFound = 0;
    attackCount = 0;
    successCount = 0;
}

/**
 * Save phishing stats to file
 * 
 * @param {NS} ns - Netscript context
 */
export async function savePhishingStats(ns) {
    try {
        const stats = getPhishingStats();
        const data = {
            timestamp: Date.now(),
            host: ns.getHostname(),
            ...stats
        };
        
        ns.write(PHISHING_LOG, JSON.stringify(data, null, 2), 'w');
    } catch (e) {
        log(ns, `Failed to save phishing stats: ${e}`, false, LOG_LEVELS.ERROR);
    }
}

// ============================================================================
// PHISHING LOOP
// ============================================================================

/**
 * Main phishing loop
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 * @param {number} cooldown - Cooldown between attacks
 * @param {boolean} autoOpenCaches - Whether to auto-open caches
 */
async function phishingLoop(ns, reportPort, cooldown, autoOpenCaches) {
    const host = ns.getHostname();
    const startTime = Date.now();
    
    // Initialize
    resetPhishingStats();
    log(ns, `Phishing module started on ${host}`, false, LOG_LEVELS.INFO);
    
    while (true) {
        const now = Date.now();
        
        // Check if we can phish
        const viability = await checkPhishingViability(ns);
        if (!viability.canPhish) {
            log(ns, `Phishing not viable: ${viability.reason}`, false, LOG_LEVELS.WARN);
            await asleep(ns, 60000); // Wait a minute before retrying
            continue;
        }
        
        // Check cooldown
        if (now - lastPhishingTime < cooldown) {
            await asleep(ns, cooldown - (now - lastPhishingTime));
            continue;
        }
        
        // Run phishing attack
        const result = await runPhishing(ns);
        lastPhishingTime = Date.now();
        
        // Handle cache files
        if (result.cacheFile && autoOpenCaches) {
            const cacheResult = await openPhishingCache(ns, result.cacheFile);
            if (cacheResult.success) {
                totalCachesFound++;
                totalMoneyEarned += cacheResult.reward;
                log(ns, `Opened cache ${result.cacheFile}: +$${formatMoney(cacheResult.reward)}`, false, LOG_LEVELS.INFO);
            }
        }
        
        // Report results
        if (reportPort) {
            sendReport(ns, reportPort, {
                type: 'phishing',
                host: ns.getHostname(),
                success: result.success,
                money: result.money || 0,
                cacheFile: result.cacheFile || null,
                totalMoney: totalMoneyEarned,
                totalCaches: totalCachesFound,
                attacks: attackCount
            });
        }
        
        // Log results
        if (result.success) {
            log(ns, `Phishing attack successful: +$${formatMoney(result.money)} ${result.cacheFile ? `+ cache (${result.cacheFile})` : ''}`, false, LOG_LEVELS.INFO);
        } else if (PHISHING_CONFIG.debug) {
            log(ns, `Phishing attempt failed: ${result.message}`, false, LOG_LEVELS.DEBUG);
        }
        
        // Save stats periodically
        if (attackCount % 10 === 0) {
            await savePhishingStats(ns);
        }
        
        // Sleep for cooldown
        await asleep(ns, cooldown);
    }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Main entry point for phishing module
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
    
    const reportPort = Number(flags.reportPort) || PHISHING_PORT;
    const cooldown = Number(flags.cooldown) || PHISHING_CONFIG.cooldown;
    const autoOpenCaches = flags.autoOpenCaches !== false;
    const debug = flags.debug || false;
    
    // Update config
    PHISHING_CONFIG.cooldown = cooldown;
    PHISHING_CONFIG.debug = debug;
    PHISHING_CONFIG.autoOpenCaches = autoOpenCaches;
    
    // Start phishing loop
    await phishingLoop(ns, reportPort, cooldown, autoOpenCaches);
}

/**
 * Show help message
 * 
 * @param {NS} ns - Netscript context
 */
function showHelp(ns) {
    log(ns, 'Darknet Phishing Module', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Usage:', false, LOG_LEVELS.INFO);
    log(ns, '  run darknet/phishing.js [OPTIONS]', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Options:', false, LOG_LEVELS.INFO);
    log(ns, '  --reportPort NUM    Port for reporting (default: ' + PHISHING_PORT + ')', false, LOG_LEVELS.INFO);
    log(ns, '  --cooldown MS       Cooldown between attacks (default: ' + PHISHING_COOLDOWN + 'ms)', false, LOG_LEVELS.INFO);
    log(ns, '  --debug             Enable debug logging', false, LOG_LEVELS.INFO);
    log(ns, '  --autoOpenCaches    Auto-open cache files (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --minCharisma NUM   Minimum charisma to attempt (default: 100)', false, LOG_LEVELS.INFO);
    log(ns, '  --help              Show this help message', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Description:', false, LOG_LEVELS.INFO);
    log(ns, '  Runs phishing attacks on Darknet servers using ns.dnet.phishingAttack()', false, LOG_LEVELS.INFO);
    log(ns, '  Earns money and finds cache files based on charisma and crime stats', false, LOG_LEVELS.INFO);
    log(ns, '  RAM Cost: ~0.0GB (very low)', false, LOG_LEVELS.INFO);
}

// ============================================================================
// AUTOINITIALIZATION
// ============================================================================

/**
 * Initialize phishing on current server
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 * @param {number} cooldown - Cooldown between attacks
 * @returns {Promise<number>} - PID of phishing process
 */
export async function initPhishing(ns, reportPort = null, cooldown = null) {
    const actualReportPort = reportPort || PHISHING_PORT;
    const actualCooldown = cooldown || PHISHING_CONFIG.cooldown;
    
    // Run phishing script
    const pid = await runScript(
        ns,
        'darknet/phishing.js',
        ns.getHostname(),
        1,
        [`--reportPort ${actualReportPort}`, `--cooldown ${actualCooldown}`]
    );
    
    return pid;
}

/**
 * Start phishing on all accessible Darknet servers
 * 
 * @param {NS} ns - Netscript context
 * @param {string[]} servers - Array of server hostnames
 * @param {number} reportPort - Port for reporting
 * @param {number} cooldown - Cooldown between attacks
 * @returns {Promise<Object>} - { started: number, failed: number, pids: number[] }
 */
export async function startPhishingOnAll(ns, servers, reportPort = null, cooldown = null) {
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
            
            // Try to start phishing
            const pid = await initPhishing(ns, reportPort, cooldown);
            if (pid > 0) {
                started.push(server);
                pids.push(pid);
            } else {
                failed.push({ server, reason: 'Failed to start' });
            }
        } catch (e) {
            failed.push({ server, reason: String(e) });
        }
        
        await asleep(ns, 100); // Small delay between starts
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
