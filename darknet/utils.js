/**
 * Darknet Utility Functions
 * 
 * Shared utility functions for Darknet operations.
 * All API calls use file-based RAM dodging by default.
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 2.1.0
 * 
 * UPDATED: Added support for all official Darknet API functions:
 * - ns.dnet.phishingAttack()
 * - ns.dnet.heartbleed()
 * - ns.dnet.setStasisLink()
 * - ns.dnet.getStasisLinkLimit()
 * - ns.dnet.induceServerMigration()
 * - ns.dnet.promoteStock()
 */

import {
    HOME, WORKER_VERSION, REPORT_INTERVAL, SIGHTING_TTL, JOB_TTL, 
    PHISHING_COOLDOWN, STOCK_PROMOTE_COOLDOWN, MIGRATION_INDUCTION_INTERVAL,
    RAM_COSTS, sendReport, createJobId, isWorkerFresh, isJobExpired,
    isCacheFile, isCollectibleFile, isPhishingFile
} from './protocol.js';

// ============================================================================
// RAM MANAGEMENT UTILITIES
// ============================================================================

/**
 * Gets free RAM on a server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<number>} - Free RAM in GB
 */
export async function getFreeRam(ns, host) {
    return await getNsDataThroughFile(ns, `ns.getServerMaxRam('${host}') - ns.getServerUsedRam('${host}')`, `dnet-ram-${host}.txt`);
}

/**
 * Gets RAM usage of a script (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} script - Script filename
 * @param {string} host - Server hostname (optional)
 * @returns {Promise<number>} - RAM usage in GB
 */
export async function getScriptRam(ns, script, host = HOME) {
    return await getNsDataThroughFile(ns, `ns.getScriptRam('${script}')`, `dnet-script-ram-${script.replace(/\//g, '-')}.txt`);
}

/**
 * Gets blocked RAM on a server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<number>} - Blocked RAM in GB
 */
export async function getBlockedRam(ns, host) {
    return await getNsDataThroughFile(ns, `ns.dnet.getBlockedRam('${host}')`, `dnet-blocked-ram-${host}.txt`);
}

/**
 * Reallocates blocked RAM on a server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname (optional)
 * @returns {Promise<Object>} - Result object with success status
 */
export async function memoryReallocation(ns, host = null) {
    const cmd = host 
        ? `ns.dnet.memoryReallocation('${host}')`
        : `ns.dnet.memoryReallocation()`;
    return await getNsDataThroughFile(ns, cmd, `dnet-realloc-${host || 'home'}.txt`);
}

/**
 * Checks if there's enough RAM for an operation
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @param {number} requiredRam - Required RAM in GB
 * @returns {Promise<boolean>} - True if enough RAM
 */
export async function hasEnoughRam(ns, host, requiredRam) {
    const freeRam = await getFreeRam(ns, host);
    const blockedRam = await getBlockedRam(ns, host);
    
    // If we have enough free RAM, we're good
    if (freeRam >= requiredRam) {
        return true;
    }
    
    // If there's blocked RAM, try to free it
    if (blockedRam > 0) {
        const result = await memoryReallocation(ns, host);
        if (result?.success) {
            const newFreeRam = await getFreeRam(ns, host);
            return newFreeRam >= requiredRam;
        }
    }
    
    return false;
}

// ============================================================================
// SERVER OPERATIONS
// ============================================================================

/**
 * Probes for nearby Darknet servers (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<string[]>} - Array of server hostnames
 */
export async function probeServers(ns) {
    return await getNsDataThroughFile(ns, 'ns.dnet.probe()', 'dnet-probe.txt');
}

/**
 * Gets details about a Darknet server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<Object>} - Server details
 */
export async function getServerDetails(ns, host) {
    return await getNsDataThroughFile(ns, `ns.dnet.getServerDetails('${host}')`, `dnet-details-${host}.txt`);
}

/**
 * Gets details about multiple servers efficiently
 * 
 * @param {NS} ns - Netscript context
 * @param {string[]} hosts - Array of server hostnames
 * @returns {Promise<Object>} - { servers, details } where details is a map
 */
export async function getMultipleServerDetails(ns, hosts) {
    const details = {};
    
    for (const host of hosts) {
        try {
            details[host] = await getServerDetails(ns, host);
            // Small delay to prevent RAM spikes
            await ns.sleep(10);
        } catch (e) {
            ns.print(`WARN: Failed to get details for ${host}: ${e}`);
        }
    }
    
    return { servers: hosts, details };
}

/**
 * Gets all server details for nearby servers (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - { servers, details }
 */
export async function getAllServerDetails(ns) {
    const servers = await probeServers(ns);
    const details = {};
    
    for (const host of servers) {
        try {
            details[host] = await getServerDetails(ns, host);
            await ns.sleep(10); // Prevent RAM spikes
        } catch (e) {
            ns.print(`WARN: Failed to get details for ${host}: ${e}`);
        }
    }
    
    return { servers, details };
}

// ============================================================================
// AUTHENTICATION OPERATIONS
// ============================================================================

/**
 * Authenticates with a Darknet server (RAM-optimized via file)
 * Note: authenticate has RAM cost of 0.1GB, so we use file-based dodging
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @param {string} answer - Puzzle answer
 * @returns {Promise<Object>} - Authentication result
 */
export async function authenticate(ns, host, answer) {
    try {
        // Use file-based dodging since authenticate has RAM cost
        return await getNsDataThroughFile(
            ns,
            `ns.dnet.authenticate('${host}', '${answer}')`,
            `dnet-auth-${host}.txt`
        );
    } catch (e) {
        return { success: false, message: String(e) };
    }
}

/**
 * Connects to an existing session (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @param {string} answer - Session password
 * @returns {Promise<Object>} - Connection result
 */
export async function connectToSession(ns, host, answer) {
    return await getNsDataThroughFile(ns, `ns.dnet.connectToSession('${host}', '${answer}')`, `dnet-session-${host}.txt`);
}

/**
 * Gets Stasis linked servers (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<string[]>} - Array of linked server hostnames
 */
export async function getStasisLinkedServers(ns) {
    return await getNsDataThroughFile(ns, 'ns.dnet.getStasisLinkedServers()', 'dnet-stasis-linked.txt');
}

/**
 * Gets Stasis link limit (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<number>} - Maximum number of stasis links
 */
export async function getStasisLinkLimit(ns) {
    return await getNsDataThroughFile(ns, 'ns.dnet.getStasisLinkLimit()', 'dnet-stasis-limit.txt');
}

/**
 * Sets a Stasis link on the current server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Result with success status
 */
export async function setStasisLink(ns) {
    return await getNsDataThroughFile(ns, 'ns.dnet.setStasisLink()', 'dnet-set-stasis.txt');
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * Opens caches on a server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<Object>} - Result object
 */
export async function openCache(ns, host) {
    return await getNsDataThroughFile(ns, `ns.dnet.openCache('${host}')`, `dnet-cache-${host}.txt`);
}

// ============================================================================
// PHISHING OPERATIONS (NEW!)
// ============================================================================

/**
 * Runs a phishing attack on the current server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Phishing result
 */
export async function runPhishingAttack(ns) {
    try {
        // phishingAttack has low/no RAM cost according to docs
        const result = await ns.dnet.phishingAttack();
        return {
            success: result?.success || false,
            money: result?.money || 0,
            cacheFile: result?.cacheFile || null,
            message: result?.message || 'Phishing attack completed'
        };
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
 * Runs a phishing attack on a specific server with threads (RAM-optimized)
 * This is a wrapper that uses ns.dnet.phishingAttack() on the current server
 * The threads parameter is not directly used by the API but affects charisma scaling
 * 
 * @param {NS} ns - Netscript context
 * @param {string} server - Server hostname (must be current server or connected)
 * @param {number} threads - Number of threads (default: 1)
 * @returns {Promise<Object>} - Phishing result
 */
export async function phishingAttack(ns, server = null, threads = 1) {
    try {
        // phishingAttack runs on current server only
        const currentServer = ns.getHostname();
        
        // If server specified and it's not current, we can't phish there
        if (server && server !== currentServer) {
            return {
                success: false,
                money: 0,
                cacheFile: null,
                message: `Cannot phish on ${server}: must run on target server or connected server`
            };
        }
        
        // phishingAttack has low/no RAM cost according to docs
        const result = await ns.dnet.phishingAttack();
        return {
            success: result?.success || false,
            money: result?.money || 0,
            cacheFile: result?.cacheFile || null,
            threads: threads,
            message: result?.message || 'Phishing attack completed'
        };
    } catch (e) {
        return {
            success: false,
            money: 0,
            cacheFile: null,
            threads: threads,
            message: `Error: ${e}`
        };
    }
}

/**
 * Checks if phishing is viable on current server
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - { canPhish: boolean, reason?: string }
 */
export async function canPhish(ns) {
    try {
        // Check if we're on a Darknet server (not home)
        if (ns.getHostname() === HOME) {
            return { canPhish: false, reason: 'Must run on Darknet server' };
        }
        
        // Check if server has Darknet access
        const hasAccess = await hasDarknetAccess(ns);
        if (!hasAccess) {
            return { canPhish: false, reason: 'No Darknet API access' };
        }
        
        // Check charisma (if we can get it)
        const player = await getNsDataThroughFile(ns, 'ns.getPlayer()', 'player-info.txt');
        if (player && player.charisma < 100) {
            return { canPhish: false, reason: `Low charisma (${player.charisma})` };
        }
        
        return { canPhish: true };
    } catch (e) {
        return { canPhish: false, reason: `Error: ${e}` };
    }
}

// ============================================================================
// HEARTBLEED OPERATIONS (NEW!)
// ============================================================================

/**
 * Extracts server logs using heartbleed (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @param {boolean} peek - Whether to peek (non-destructive)
 * @returns {Promise<Object>} - Logs result
 */
export async function heartbleed(ns, host, peek = true) {
    return await getNsDataThroughFile(
        ns, 
        `ns.dnet.heartbleed('${host}', { peek: ${peek} })`,
        `dnet-heartbleed-${host}-${peek}.txt`
    );
}

/**
 * Gets authentication clues from server logs
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<string[]>} - Array of clue strings
 */
export async function getAuthClues(ns, host) {
    try {
        const result = await heartbleed(ns, host, true);
        if (result && result.logs) {
            // Parse logs for clues
            return result.logs.filter(log => 
                log.includes('password') || 
                log.includes('hint') || 
                log.includes('auth') ||
                log.includes('error')
            );
        }
        return [];
    } catch (e) {
        return [];
    }
}

// ============================================================================
// MIGRATION OPERATIONS (NEW!)
// ============================================================================

/**
 * Induces server migration (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} target - Target server hostname
 * @returns {Promise<Object>} - Migration result
 */
export async function induceServerMigration(ns, target) {
    return await getNsDataThroughFile(
        ns,
        `ns.dnet.induceServerMigration('${target}')`,
        `dnet-migrate-${target}.txt`
    );
}

/**
 * Forces a server to move by accumulating migration charges
 * 
 * @param {NS} ns - Netscript context
 * @param {string} target - Target server hostname
 * @param {number} chargesNeeded - Number of charges needed (default: 10)
 * @returns {Promise<Object>} - Final migration result
 */
export async function forceServerMigration(ns, target, chargesNeeded = 10) {
    for (let i = 0; i < chargesNeeded; i++) {
        const result = await induceServerMigration(ns, target);
        if (!result?.success) {
            return { success: false, message: `Failed at charge ${i + 1}`, attempt: i + 1 };
        }
        await ns.sleep(1000); // Cooldown between inductions
    }
    return { success: true, message: 'Server migration induced' };
}

// ============================================================================
// STOCK OPERATIONS (NEW!)
// ============================================================================

/**
 * Promotes a stock to increase volatility (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} stockSymbol - Stock symbol (e.g., 'FULCRUM')
 * @returns {Promise<Object>} - Promotion result
 */
export async function promoteStock(ns, stockSymbol) {
    return await getNsDataThroughFile(
        ns,
        `ns.dnet.promoteStock('${stockSymbol}')`,
        `dnet-promote-${stockSymbol}.txt`
    );
}

/**
 * Gets stock information (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} stockSymbol - Stock symbol
 * @returns {Promise<Object>} - Stock information
 */
export async function getStockInfo(ns, stockSymbol) {
    return await getNsDataThroughFile(
        ns,
        `ns.stock.getStock('${stockSymbol}')`,
        `stock-${stockSymbol}.txt`
    );
}

/**
 * Gets all owned stocks (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Portfolio information
 */
export async function getPortfolio(ns) {
    return await getNsDataThroughFile(ns, 'ns.stock.getPortfolio()', 'portfolio.txt');
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

/**
 * Helper to get data through file (RAM dodging)
 * Uses consistent filename generation for caching
 * 
 * @param {NS} ns - Netscript context
 * @param {string} cmd - Command to execute
 * @param {string} filename - Temp filename (optional, auto-generated if not provided)
 * @returns {Promise<any>} - Result from command
 */
export async function getNsDataThroughFile(ns, cmd, filename = null) {
    try {
        // If no filename provided, generate one from the command
        if (!filename) {
            const sanitized = cmd
                .replace(/[^a-zA-Z0-9]/g, '-')
                .substring(0, 50);
            filename = `/Temp/dnet-${sanitized}-${Date.now()}.txt`;
        }
        
        // Write the command to a temp file
        ns.write(filename, cmd, 'w');
        
        // Read the result
        const result = ns.read(filename);
        
        // Clean up
        ns.rm(filename);
        
        // Parse the result if it's JSON
        if (result && result !== '') {
            try {
                return JSON.parse(result);
            } catch (e) {
                // Not JSON, return as string
                return result;
            }
        }
        
        return null;
    } catch (e) {
        ns.print(`ERROR: Failed to execute via file: ${cmd} - ${e}`);
        throw e;
    }
}

/**
 * Lists files on a server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<string[]>} - Array of filenames
 */
export async function listFiles(ns, host) {
    return await getNsDataThroughFile(ns, `ns.ls('${host}')`, `ls-${host}.txt`);
}

/**
 * Lists files with a specific extension on a server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @param {string} extension - File extension (e.g., '.cache')
 * @returns {Promise<string[]>} - Array of matching filenames
 */
export async function listFilesByExtension(ns, host, extension) {
    const files = await listFiles(ns, host);
    return files.filter(f => f.endsWith(extension));
}

/**
 * Checks if a file exists on a server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} filename - Filename
 * @param {string} host - Server hostname
 * @returns {Promise<boolean>} - True if file exists
 */
export async function fileExists(ns, filename, host) {
    return await getNsDataThroughFile(ns, `ns.fileExists('${filename}', '${host}')`, `file-exists-${filename}-${host}.txt`);
}

/**
 * Copies a file to a server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} source - Source filename
 * @param {string} dest - Destination server
 * @param {string} host - Source server (default: home)
 * @returns {Promise<boolean>} - True if successful
 */
export async function scp(ns, source, dest, host = HOME) {
    return await getNsDataThroughFile(ns, `ns.scp('${source}', '${dest}', '${host}')`, `scp-${source}-${dest}.txt`);
}

/**
 * Checks if Darknet API is available (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<boolean>} - True if API is available
 */
export async function hasDarknetAccess(ns) {
    try {
        return await getNsDataThroughFile(ns, 'typeof ns.dnet !== "undefined"', 'dnet-check.txt');
    } catch (e) {
        return false;
    }
}

/**
 * Checks if required file exists for Darknet access (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<boolean>} - True if file exists
 */
export async function hasDarkscapeNavigator(ns) {
    return await fileExists(ns, 'DarkscapeNavigator.exe', HOME);
}

// ============================================================================
// SCRIPT OPERATIONS
// ============================================================================

/**
 * Runs a script on a server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} script - Script filename
 * @param {string} host - Server hostname
 * @param {number} threads - Number of threads (default: 1)
 * @param {string[]} args - Script arguments
 * @returns {Promise<number>} - PID or 0 if failed
 */
export async function runScript(ns, script, host, threads = 1, args = []) {
    const argsStr = args.map(a => (typeof a === 'string' ? `'${a.replace(/'/g, "\\'")}'` : String(a))).join(', ');
    const cmd = `ns.run('${script}', '${host}', { threads: ${threads} }, ${argsStr})`;
    return await getNsDataThroughFile(ns, cmd, `run-${script}-${host}.txt`);
}

/**
 * Executes a script on a server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} script - Script filename
 * @param {string} host - Server hostname
 * @param {number} threads - Number of threads (default: 1)
 * @param {string[]} args - Script arguments
 * @returns {Promise<number>} - PID or 0 if failed
 */
export async function execScript(ns, script, host, threads = 1, args = []) {
    const argsStr = args.map(a => (typeof a === 'string' ? `'${a.replace(/'/g, "\\'")}'` : String(a))).join(', ');
    const cmd = `ns.exec('${script}', '${host}', { threads: ${threads} }, ${argsStr})`;
    return await getNsDataThroughFile(ns, cmd, `exec-${script}-${host}.txt`);
}

/**
 * Kills a script by PID (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {number} pid - Process ID
 * @returns {Promise<boolean>} - True if successful
 */
export async function killScript(ns, pid) {
    return await getNsDataThroughFile(ns, `ns.kill(${pid})`, `kill-${pid}.txt`);
}

/**
 * Checks if a script is running (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} script - Script filename
 * @param {string} host - Server hostname
 * @param {string[]} args - Script arguments
 * @returns {Promise<boolean>} - True if running
 */
export async function isRunning(ns, script, host, args = []) {
    const argsStr = JSON.stringify(args);
    return await getNsDataThroughFile(ns, `ns.isRunning('${script}', '${host}', ${argsStr})`, `isrunning-${script}-${host}.txt`);
}

/**
 * Gets process info for a server (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<Array>} - Array of process info
 */
export async function getProcesses(ns, host) {
    return await getNsDataThroughFile(ns, `ns.ps('${host}')`, `ps-${host}.txt`);
}

// ============================================================================
// DARKNET-SPECIFIC UTILITIES
// ============================================================================

/**
 * Checks if a server can be authenticated
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<Object>} - { canAuth: boolean, answer?: string, reason?: string }
 */
export async function canAuthenticate(ns, host) {
    try {
        const details = await getServerDetails(ns, host);
        
        if (!details) {
            return { canAuth: false, reason: 'Server not found' };
        }
        
        if (!details.isOnline) {
            return { canAuth: false, reason: 'Server is offline' };
        }
        
        if (!details.isConnectedToCurrentServer) {
            return { canAuth: false, reason: 'Server not connected' };
        }
        
        if (details.hasSession) {
            return { canAuth: false, reason: 'Session already exists' };
        }
        
        // Import solvers inline to avoid circular dependency
        const { puzzleAnswer, isSupported, puzzleCandidates } = await import('./solvers.js');
        
        if (!isSupported(details)) {
            return { canAuth: false, reason: `Unsupported puzzle type: ${details.modelId}` };
        }
        
        const answer = puzzleAnswer(details);
        if (!answer) {
            return { canAuth: false, reason: 'Could not determine answer' };
        }
        
        if (!validateAnswer(answer, details.passwordFormat, details.passwordLength)) {
            return { canAuth: false, reason: 'Answer does not match requirements' };
        }
        
        return { canAuth: true, answer };
    } catch (e) {
        return { canAuth: false, reason: `Error: ${e}` };
    }
}

/**
 * Validates that an answer meets the requirements
 * 
 * @param {string} answer - The proposed answer
 * @param {string} passwordFormat - Expected format
 * @param {number} passwordLength - Expected length
 * @returns {boolean} - True if valid
 */
export function validateAnswer(answer, passwordFormat, passwordLength) {
    if (!answer || answer.length !== passwordLength) return false;

    switch (passwordFormat) {
        case 'numeric':
            return /^\d+$/.test(answer);
        case 'alphabetic':
            return /^[A-Za-z]+$/.test(answer);
        case 'alphanumeric':
            return /^[0-9A-Za-z]+$/.test(answer);
        default:
            return true; // Unknown format, accept anything
    }
}

/**
 * Tries to authenticate with a server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<Object>} - { success: boolean, message: string, result?: Object }
 */
export async function tryAuthenticate(ns, host) {
    try {
        const { canAuth, answer, reason } = await canAuthenticate(ns, host);
        
        if (!canAuth) {
            return { success: false, message: reason };
        }
        
        const result = await authenticate(ns, host, answer);
        
        if (result && result.success) {
            return { success: true, message: 'Authentication successful', result };
        } else {
            // Try to get clues from heartbleed
            const clues = await getAuthClues(ns, host);
            return { 
                success: false, 
                message: result?.message || 'Authentication failed',
                result,
                clues 
            };
        }
    } catch (e) {
        return { success: false, message: `Error: ${e}` };
    }
}

/**
 * Gets all collectible files from a server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<Array>} - Array of { filename, type, size }
 */
export async function getCollectibleFiles(ns, host) {
    try {
        const files = await listFiles(ns, host);
        const collectibles = [];
        
        for (const file of files) {
            // Skip script files and our own files
            if (file.endsWith('.js') || file.startsWith('data/') || file.startsWith('/Temp/')) {
                continue;
            }
            
            // Check if it's a collectible file
            if (isCollectibleFile(file)) {
                try {
                    const size = await getNsDataThroughFile(ns, `ns.getFileSize('${file}', '${host}')`, `size-${file}-${host}.txt`);
                    collectibles.push({ filename: file, type: getFileExtension(file), size });
                } catch (e) {
                    collectibles.push({ filename: file, type: getFileExtension(file), size: 0 });
                }
            }
        }
        
        return collectibles;
    } catch (e) {
        ns.print(`ERROR: Failed to get collectibles from ${host}: ${e}`);
        return [];
    }
}

/**
 * Collects all caches from a server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Server hostname
 * @returns {Promise<Object>} - { collected: number, errors: number, details: Array }
 */
export async function collectCaches(ns, host) {
    const collectibles = await getCollectibleFiles(ns, host);
    const results = [];
    let collected = 0;
    let errors = 0;
    
    for (const item of collectibles) {
        try {
            if (item.type === '.cache') {
                const result = await openCache(ns, host);
                if (result && result.success) {
                    collected++;
                    results.push({ 
                        filename: item.filename, 
                        success: true, 
                        reward: result.reward || 0 
                    });
                } else {
                    errors++;
                    results.push({ 
                        filename: item.filename, 
                        success: false, 
                        error: result?.message 
                    });
                }
            }
        } catch (e) {
            errors++;
            results.push({ 
                filename: item.filename, 
                success: false, 
                error: String(e) 
            });
        }
    }
    
    return { collected, errors, details: results };
}

/**
 * Deploys a worker script to a Darknet server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Target server
 * @param {string} workerScript - Worker script filename
 * @param {string[]} args - Arguments for the worker
 * @param {number} threads - Number of threads (default: 1)
 * @returns {Promise<Object>} - Deployment result
 */
export async function deployWorker(ns, host, workerScript, args = [], threads = 1) {
    try {
        // Check if we can deploy
        const workerRam = await getScriptRam(ns, workerScript);
        if (workerRam <= 0) {
            return { success: false, message: 'Invalid worker script' };
        }
        
        const freeRam = await getFreeRam(ns, host);
        
        // Check if we need to free up RAM
        if (freeRam < workerRam) {
            const blockedRam = await getBlockedRam(ns, host);
            if (blockedRam > 0) {
                const result = await memoryReallocation(ns, host);
                if (!result?.success) {
                    return { success: false, message: `RAM reallocation failed: ${result?.message}` };
                }
                // Recheck free RAM
                const newFreeRam = await getFreeRam(ns, host);
                if (newFreeRam < workerRam) {
                    return { success: false, message: `Still insufficient RAM (need ${workerRam}GB, have ${newFreeRam}GB)` };
                }
            } else {
                return { success: false, message: `Insufficient RAM (need ${workerRam}GB, have ${freeRam}GB)` };
            }
        }
        
        // Copy required files
        for (const file of ['darknet/protocol.js', 'darknet/solvers.js', 'darknet/utils.js', workerScript]) {
            const result = await scp(ns, file, host);
            if (!result) {
                return { success: false, message: `Failed to copy ${file}` };
            }
        }
        
        // Execute worker
        const pid = await execScript(ns, workerScript, host, threads, args);
        
        if (pid > 0) {
            return { success: true, message: 'Worker deployed', pid };
        } else {
            return { success: false, message: 'Failed to start worker', pid: 0 };
        }
    } catch (e) {
        return { success: false, message: `Error: ${e}` };
    }
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Log levels
 */
export const LOG_LEVELS = {
    ERROR: 'error',
    WARN: 'warning',
    INFO: 'info',
    DEBUG: 'debug',
    TRACE: 'trace'
};

/**
 * Log a message with level (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @param {string} message - Message to log
 * @param {string} level - Log level
 * @param {boolean} toast - Show toast notification
 */
export function log(ns, message, toast = false, level = LOG_LEVELS.INFO) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [DARKNET] [${level.toUpperCase()}]`;
    
    switch (level) {
        case LOG_LEVELS.ERROR:
            ns.print(`${prefix} ${message}`);
            if (toast) ns.tprint(`${prefix} ${message}`);
            break;
        case LOG_LEVELS.WARN:
            ns.print(`${prefix} ${message}`);
            if (toast) ns.tprint(`${prefix} ${message}`);
            break;
        case LOG_LEVELS.INFO:
            ns.print(`${prefix} ${message}`);
            break;
        case LOG_LEVELS.DEBUG:
        case LOG_LEVELS.TRACE:
            // Only log if debug is enabled
            if (ns.args && ns.args['enable-debug']) {
                ns.print(`${prefix} ${message}`);
            }
            break;
    }
}

/**
 * Format money with suffixes
 * 
 * @param {number} amount - Money amount
 * @returns {string} - Formatted money
 */
export function formatMoney(amount) {
    if (amount === 0) return '$0';
    if (amount < 1e3) return `$${amount}`;
    if (amount < 1e6) return `$${(amount / 1e3).toFixed(2)}K`;
    if (amount < 1e9) return `$${(amount / 1e6).toFixed(2)}M`;
    if (amount < 1e12) return `$${(amount / 1e9).toFixed(2)}B`;
    return `$${(amount / 1e12).toFixed(2)}T`;
}

/**
 * Format duration in milliseconds
 * 
 * @param {number} ms - Milliseconds
 * @returns {string} - Formatted duration
 */
export function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
    if (ms < 86400000) return `${(ms / 3600000).toFixed(2)}h`;
    return `${(ms / 86400000).toFixed(2)}d`;
}

/**
 * Format number with suffixes
 * 
 * @param {number} num - Number
 * @returns {string} - Formatted number
 */
export function formatNumber(num) {
    if (num < 1000) return String(num);
    if (num < 1e6) return `${(num / 1e3).toFixed(2)}K`;
    if (num < 1e9) return `${(num / 1e6).toFixed(2)}M`;
    return `${(num / 1e9).toFixed(2)}B`;
}

/**
 * Sleep for a duration (RAM-friendly)
 * 
 * @param {NS} ns - Netscript context
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export async function asleep(ns, ms) {
    await ns.sleep(ms);
}

// ============================================================================
// CONFIGURATION UTILITIES
// ============================================================================

/**
 * Gets configuration from arguments
 * 
 * @param {NS} ns - Netscript context
 * @param {Array} schema - Argument schema
 * @returns {Object} - Configuration object
 */
export function getConfiguration(ns, schema) {
    const flags = ns.flags(schema);
    const config = {};
    
    for (const [name, defaultValue] of schema) {
        config[name] = flags[name] !== undefined ? flags[name] : defaultValue;
    }
    
    return config;
}

/**
 * Checks if this is the only instance running
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<boolean>} - True if only instance
 */
export async function isOnlyInstance(ns) {
    const processes = await getProcesses(ns, HOME);
    const scriptName = ns.getScriptName();
    const currentPid = ns.pid;
    
    const count = processes.filter(p => 
        p.filename === scriptName && p.pid !== currentPid
    ).length;
    
    return count === 0;
}

/**
 * Gets instance count for a script
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<number>} - Number of instances
 */
export async function instanceCount(ns) {
    const processes = await getProcesses(ns, HOME);
    const scriptName = ns.getScriptName();
    
    return processes.filter(p => p.filename === scriptName).length;
}

/**
 * Gets player information (RAM-optimized)
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Player info
 */
export async function getPlayer(ns) {
    return await getNsDataThroughFile(ns, 'ns.getPlayer()', 'player.txt');
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
    // RAM Management
    getFreeRam,
    getScriptRam,
    getBlockedRam,
    memoryReallocation,
    hasEnoughRam,
    
    // Server Operations
    probeServers,
    getServerDetails,
    getMultipleServerDetails,
    getAllServerDetails,
    
    // Authentication
    authenticate,
    connectToSession,
    getStasisLinkedServers,
    getStasisLinkLimit,
    setStasisLink,
    
    // Cache Operations
    openCache,
    
    // Phishing Operations (NEW!)
    runPhishingAttack,
    phishingAttack,
    canPhish,
    
    // Heartbleed Operations (NEW!)
    heartbleed,
    getAuthClues,
    
    // Migration Operations (NEW!)
    induceServerMigration,
    forceServerMigration,
    
    // Stock Operations (NEW!)
    promoteStock,
    getStockInfo,
    getPortfolio,
    
    // File Operations
    getNsDataThroughFile,
    listFiles,
    listFilesByExtension,
    fileExists,
    scp,
    hasDarknetAccess,
    hasDarkscapeNavigator,
    
    // Script Operations
    runScript,
    execScript,
    killScript,
    isRunning,
    getProcesses,
    
    // Darknet-specific
    canAuthenticate,
    tryAuthenticate,
    getCollectibleFiles,
    collectCaches,
    deployWorker,
    
    // Worker Management
    deployWorker,
    
    // Logging
    log,
    LOG_LEVELS,
    formatMoney,
    formatDuration,
    formatNumber,
    asleep,
    
    // Configuration
    getConfiguration,
    isOnlyInstance,
    instanceCount,
    getPlayer
};
