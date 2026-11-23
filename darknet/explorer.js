/**
 * Darknet Explorer Script
 * 
 * Explores the Darknet, discovers new servers, and authenticates with them.
 * Can run independently or as part of the worker network.
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 1.0.0
 */

import {
    HOME, WORKER_VERSION, REPORT_INTERVAL, sendReport
} from './protocol.js';

import {
    probeServers, getServerDetails, getAllServerDetails,
    authenticate, tryAuthenticate,
    hasDarkscapeNavigator, hasDarknetAccess,
    getNsDataThroughFile
} from './utils.js';

import { puzzleAnswer, isSupported, puzzleCandidates } from './solvers.js';

// ============================================================================
// EXPLORATION STATE
// ============================================================================

const discoveredServers = new Set();
const authenticatedServers = new Set();
const unsolvableServers = new Set();

// ============================================================================
// EXPLORATION FUNCTIONS
// ============================================================================

/**
 * Explore immediate neighbors
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Exploration results
 */
export async function exploreNeighbors(ns) {
    const results = {
        discovered: [],
        authenticated: [],
        unsolvable: [],
        errors: []
    };
    
    try {
        const servers = await probeServers(ns);
        
        for (const host of servers) {
            if (discoveredServers.has(host)) continue;
            
            try {
                const details = await getServerDetails(ns, host);
                
                if (!details) {
                    results.errors.push({ host, error: 'No details available' });
                    continue;
                }
                
                discoveredServers.add(host);
                results.discovered.push(host);
                
                // Try to authenticate
                const authResult = await tryAuthenticate(ns, host);
                
                if (authResult.success) {
                    authenticatedServers.add(host);
                    results.authenticated.push(host);
                } else if (!isSupported(details)) {
                    unsolvableServers.add(host);
                    results.unsolvable.push({ host, reason: 'Unsupported puzzle type' });
                } else {
                    results.unsolvable.push({ host, reason: authResult.message });
                }
                
            } catch (e) {
                results.errors.push({ host, error: String(e) });
            }
        }
        
        return results;
        
    } catch (e) {
        return { discovered: [], authenticated: [], unsolvable: [], errors: [{ error: String(e) }] };
    }
}

/**
 * Deep exploration - recursively explore from a starting point
 * 
 * @param {NS} ns - Netscript context
 * @param {string} startHost - Starting server (optional, defaults to current)
 * @param {number} maxDepth - Maximum depth to explore (default: 3)
 * @param {number} currentDepth - Current depth (internal)
 * @returns {Promise<Object>} - Complete exploration results
 */
export async function deepExplore(ns, startHost = null, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
        return { discovered: [], authenticated: [], unsolvable: [], errors: [] };
    }
    
    const host = startHost || ns.getHostname();
    const results = {
        discovered: [],
        authenticated: [],
        unsolvable: [],
        errors: []
    };
    
    try {
        // First, explore immediate neighbors
        const immediate = await exploreNeighbors(ns);
        
        // Merge results
        results.discovered = [...immediate.discovered];
        results.authenticated = [...immediate.authenticated];
        results.unsolvable = [...immediate.unsolvable];
        results.errors = [...immediate.errors];
        
        // For each newly discovered server, continue exploration
        for (const newHost of immediate.discovered) {
            if (newHost !== host) {
                // We'd need to run this on the new server, which requires
                // deploying a worker there. For now, just mark as discovered.
                // In a full implementation, we'd deploy an explorer worker.
                results.discovered.push(newHost);
            }
        }
        
        return results;
        
    } catch (e) {
        results.errors.push({ error: String(e) });
        return results;
    }
}

/**
 * Get comprehensive server information
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Complete server info
 */
export async function getServerInfo(ns) {
    const host = ns.getHostname();
    
    try {
        const details = await getServerDetails(ns, host);
        const neighbors = await probeServers(ns);
        
        return {
            host,
            details,
            neighbors,
            isAuthenticated: authenticatedServers.has(host),
            isDiscovered: discoveredServers.has(host)
        };
    } catch (e) {
        return {
            host,
            error: String(e),
            isAuthenticated: false,
            isDiscovered: false
        };
    }
}

// ============================================================================
// MAIN EXPLORER FUNCTION
// ============================================================================

/**
 * Main explorer function
 * 
 * @param {NS} ns - Netscript context
 */
export async function main(ns) {
    const args = ns.args;
    const reportPort = args[0] || null;
    const offlineEpoch = args[1] || Date.now();
    
    // Check if we have Darknet access
    if (!await hasDarknetAccess(ns)) {
        ns.print('ERROR: Darknet API not available');
        return;
    }
    
    // Check for DarkscapeNavigator.exe
    if (!await hasDarkscapeNavigator(ns)) {
        ns.print('ERROR: DarkscapeNavigator.exe required');
        return;
    }
    
    // Initialize discovered servers
    discoveredServers.clear();
    authenticatedServers.clear();
    unsolvableServers.clear();
    
    // Main loop
    while (true) {
        try {
            // Explore neighbors
            const results = await exploreNeighbors(ns);
            
            // Report results if we have a report port
            if (reportPort !== null) {
                sendReport(ns, reportPort, {
                    type: 'exploration',
                    offlineEpoch,
                    host: ns.getHostname(),
                    discovered: results.discovered,
                    authenticated: results.authenticated,
                    unsolvable: results.unsolvable,
                    errors: results.errors
                });
            }
            
            // Log results
            if (results.discovered.length > 0) {
                ns.print(`Discovered ${results.discovered.length} new servers`);
            }
            
            if (results.authenticated.length > 0) {
                ns.print(`Authenticated with ${results.authenticated.length} servers`);
            }
            
            if (results.unsolvable.length > 0) {
                ns.print(`WARN: ${results.unsolvable.length} servers unsolvable`);
            }
            
            if (results.errors.length > 0) {
                ns.print(`ERROR: ${results.errors.length} errors during exploration`);
            }
            
            // If no report port, just print summary
            if (reportPort === null) {
                ns.print(`Exploration complete. Discovered: ${discoveredServers.size}, Authenticated: ${authenticatedServers.size}`);
                break;
            }
            
        } catch (e) {
            ns.print(`ERROR: Exploration failed: ${e}`);
        }
        
        await ns.sleep(REPORT_INTERVAL);
    }
}

/**
 * Run standalone exploration (for manual execution)
 * 
 * @param {NS} ns - Netscript context
 */
export async function runStandalone(ns) {
    // This function can be called directly for manual exploration
    const results = await deepExplore(ns);
    
    ns.print('=== DARKNET EXPLORATION RESULTS ===');
    ns.print(`Discovered: ${results.discovered.length} servers`);
    ns.print(`Authenticated: ${results.authenticated.length} servers`);
    ns.print(`Unsolvable: ${results.unsolvable.length} servers`);
    ns.print(`Errors: ${results.errors.length}`);
    
    if (results.discovered.length > 0) {
        ns.print('\nDiscovered Servers:');
        for (const host of results.discovered) {
            ns.print(`  - ${host}`);
        }
    }
    
    if (results.authenticated.length > 0) {
        ns.print('\nAuthenticated Servers:');
        for (const host of results.authenticated) {
            ns.print(`  - ${host}`);
        }
    }
}
