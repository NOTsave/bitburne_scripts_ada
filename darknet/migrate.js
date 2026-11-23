/**
 * Darknet Migration Handler
 * 
 * Handles server migration operations within the Darknet.
 * Moves workers between servers to optimize network coverage.
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 1.0.0
 */

import {
    HOME, WORKER_VERSION, REPORT_INTERVAL, sendReport
} from './protocol.js';

import {
    getServerDetails, getFreeRam, getScriptRam, getBlockedRam,
    memoryReallocation, authenticate, scp,
    getNsDataThroughFile, runScript, execScript
} from './utils.js';

import { puzzleAnswer, puzzleCandidates } from './solvers.js';

// ============================================================================
// MIGRATION OPERATIONS
// ============================================================================

/**
 * Migrate a worker from current server to target server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} target - Target server hostname
 * @param {number} riderPid - PID of the rider process
 * @param {number} jobId - Job ID for tracking
 * @returns {Promise<Object>} - Migration result
 */
export async function migrateWorker(ns, target, riderPid, jobId) {
    try {
        const currentHost = ns.getHostname();
        
        // Get details about the target server
        const details = await getServerDetails(ns, target);
        
        if (!details) {
            return { success: false, message: 'Target server not found' };
        }
        
        if (!details.isOnline) {
            return { success: false, message: 'Target server is offline' };
        }
        
        // Check if we need to authenticate
        if (!details.hasSession) {
            const answer = puzzleAnswer(details);
            
            if (!answer) {
                return { success: false, message: 'Could not determine authentication answer' };
            }
            
            const authResult = await authenticate(ns, target, answer);
            
            if (!authResult || !authResult.success) {
                return { success: false, message: `Authentication failed: ${authResult?.message}` };
            }
        }
        
        // Check RAM requirements
        const workerRam = await getScriptRam(ns, 'darknet/worker.js');
        const freeRam = await getFreeRam(ns, target);
        
        if (freeRam < workerRam) {
            // Try to free up RAM
            const blockedRam = await getBlockedRam(ns, target);
            if (blockedRam > 0) {
                const result = await memoryReallocation(ns, target);
                if (!result?.success) {
                    return { success: false, message: `Insufficient RAM (need ${workerRam}GB, have ${freeRam}GB)` };
                }
            }
        }
        
        // Copy required files to target
        const bundle = [
            'darknet/protocol.js',
            'darknet/solvers.js',
            'darknet/utils.js',
            'darknet/worker.js',
            'darknet/collector.js',
            'darknet/stasis.js',
            'darknet/migrate.js'
        ];
        
        for (const file of bundle) {
            const result = await scp(ns, file, target);
            if (!result) {
                return { success: false, message: `Failed to copy ${file} to ${target}` };
            }
        }
        
        // Get the current worker's arguments
        const self = await getNsDataThroughFile(ns, 'ns.self()');
        const currentArgs = self.args || [];
        
        // Execute worker on target server with same arguments
        const newPid = await execScript(ns, 'darknet/worker.js', target, 1, currentArgs);
        
        if (newPid > 0) {
            // Kill the rider process if specified
            if (riderPid > 0) {
                await getNsDataThroughFile(ns, `ns.kill(${riderPid})`);
            }
            
            return { 
                success: true, 
                message: 'Migration successful',
                newPid,
                newHost: target
            };
        } else {
            return { success: false, message: 'Failed to start worker on target server' };
        }
        
    } catch (e) {
        return { success: false, message: `Migration error: ${e}` };
    }
}

// ============================================================================
// MAIN MIGRATION HANDLER
// ============================================================================

/**
 * Main migration handler function
 * 
 * @param {NS} ns - Netscript context
 */
export async function main(ns) {
    const args = ns.args;
    
    if (args.length < 6) {
        ns.print('ERROR: Migration handler requires 6 arguments: reportPort, jobPort, offlineEpoch, jobId, target, riderPid');
        return;
    }
    
    const [reportPort, jobPort, offlineEpoch, jobId, target, riderPid] = args;
    
    // Validate version from jobId format
    const jobParts = String(jobId).split('/');
    if (jobParts.length !== 2 || Number(jobParts[1]) !== WORKER_VERSION) {
        ns.print(`ERROR: Version mismatch in jobId`);
        return;
    }
    
    try {
        // Attempt migration
        const result = await migrateWorker(ns, target, Number(riderPid), jobId);
        
        // Report back
        sendReport(ns, reportPort, {
            type: 'route',
            offlineEpoch,
            host: ns.getHostname(),
            result: {
                id: jobId,
                target: target,
                status: result.message,
                success: result.success
            }
        });
        
        if (result.success) {
            ns.print(`SUCCESS: Migrated to ${target} (PID: ${result.newPid})`);
        } else {
            ns.print(`WARN: Migration failed: ${result.message}`);
        }
        
    } catch (e) {
        sendReport(ns, reportPort, {
            type: 'route',
            offlineEpoch,
            host: ns.getHostname(),
            result: {
                id: jobId,
                target: args[4] || 'unknown',
                status: `Error: ${e}`,
                success: false
            }
        });
        ns.print(`ERROR: Migration failed: ${e}`);
    }
}
