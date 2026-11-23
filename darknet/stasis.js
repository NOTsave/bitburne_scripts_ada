/**
 * Darknet Stasis Handler
 * 
 * Handles Stasis network operations for creating persistent links between servers.
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 1.0.0
 */

import {
    HOME, WORKER_VERSION, SIGHTING_TTL, sendReport
} from './protocol.js';

import {
    getServerDetails, getFreeRam, getScriptRam,
    memoryReallocation, connectToSession, setStasisLink, getStasisLinkLimit, getStasisLinkedServers,
    getNsDataThroughFile, execScript, runScript, killScript
} from './utils.js';

import { puzzleAnswer } from './solvers.js';

// ============================================================================
// STASIS OPERATIONS
// ============================================================================

/**
 * Create a Stasis link with the current server
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Result of Stasis operation
 */
export async function createStasisLink(ns) {
    const host = ns.getHostname();
    
    try {
        const details = await getServerDetails(ns, host);
        
        if (!details) {
            return { success: false, message: 'Server details not available' };
        }
        
        const answer = puzzleAnswer(details);
        
        if (!answer) {
            return { success: false, message: 'Could not determine puzzle answer' };
        }
        
        // Check if we have enough RAM for Stasis
        const stasisRam = await getScriptRam(ns, 'darknet/stasis.js');
        const freeRam = await getFreeRam(ns, host);
        const self = await getNsDataThroughFile(ns, 'ns.self()');
        const totalAvailable = freeRam + (self.ramUsage * self.threads);
        
        if (totalAvailable < stasisRam) {
            // Try to free up RAM
            const blockedRam = await getBlockedRam(ns, host);
            if (blockedRam > 0) {
                const result = await memoryReallocation(ns, host);
                if (!result?.success) {
                    return { success: false, message: `Insufficient RAM for Stasis (need ${stasisRam}GB, have ${totalAvailable}GB)` };
                }
            }
        }
        
        // First authenticate with the server
        const authResult = await connectToSession(ns, host, answer);
        
        if (!authResult?.success) {
            return { success: false, message: authResult?.message || 'Failed to authenticate', result: authResult };
        }
        
        // Now set the stasis link on the current server
        const stasisResult = await setStasisLink(ns);
        
        if (stasisResult?.success) {
            return { success: true, message: 'Stasis link created', result: stasisResult };
        } else {
            return { success: false, message: stasisResult?.message || 'Failed to create Stasis link', result: stasisResult };
        }
        
    } catch (e) {
        return { success: false, message: `Error creating Stasis link: ${e}` };
    }
}

/**
 * Get Stasis link limit
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Limit result
 */
export async function getStasisLimit(ns) {
    try {
        const limit = await getStasisLinkLimit(ns);
        return { success: true, limit: limit || 0 };
    } catch (e) {
        return { success: false, message: `Error: ${e}` };
    }
}

/**
 * Get Stasis linked servers
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Linked servers result
 */
export async function getLinkedServers(ns) {
    try {
        const linked = await getStasisLinkedServers(ns);
        return { success: true, servers: Array.isArray(linked) ? linked : [] };
    } catch (e) {
        return { success: false, message: `Error: ${e}` };
    }
}

/**
 * Maintain Stasis connections
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<Object>} - Maintenance result
 */
export async function maintainStasis(ns) {
    const host = ns.getHostname();
    
    try {
        const linked = await getStasisLinkedServers(ns);
        
        if (!Array.isArray(linked)) {
            return { success: false, message: 'Failed to get stasis linked servers' };
        }
        
        if (!linked.includes(host)) {
            // We're not in the Stasis network, try to join
            return await createStasisLink(ns);
        }
        
        // We're already in the Stasis network
        return { success: true, message: 'Already in Stasis network', linked };
        
    } catch (e) {
        return { success: false, message: `Error maintaining Stasis: ${e}` };
    }
}

// ============================================================================
// MAIN STASIS HANDLER
// ============================================================================

/**
 * Main Stasis handler function
 * 
 * @param {NS} ns - Netscript context
 */
export async function main(ns) {
    const args = ns.args;
    
    if (args.length < 5) {
        ns.print('ERROR: Stasis handler requires 5 arguments: reportPort, jobPort, offlineEpoch, version, jobId');
        return;
    }
    
    const [reportPort, jobPort, offlineEpoch, version, jobId] = args;
    
    // Validate version
    if (Number(version) !== WORKER_VERSION) {
        ns.print(`ERROR: Version mismatch (expected ${WORKER_VERSION}, got ${version})`);
        return;
    }
    
    try {
        // Attempt to create Stasis link
        const result = await createStasisLink(ns);
        
        // Report back
        sendReport(ns, reportPort, {
            type: 'route',
            offlineEpoch,
            host: ns.getHostname(),
            result: {
                id: jobId,
                target: ns.getHostname(),
                status: result.message,
                success: result.success
            }
        });
        
        if (result.success) {
            ns.print(`SUCCESS: Stasis link created on ${ns.getHostname()}`);
        } else {
            ns.print(`WARN: Failed to create Stasis link: ${result.message}`);
        }
        
    } catch (e) {
        sendReport(ns, reportPort, {
            type: 'route',
            offlineEpoch,
            host: ns.getHostname(),
            result: {
                id: jobId,
                target: ns.getHostname(),
                status: `Error: ${e}`,
                success: false
            }
        });
        ns.print(`ERROR: Stasis operation failed: ${e}`);
    }
}
