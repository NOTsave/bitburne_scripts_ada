/**
 * Darknet Stasis Manager v2
 * 
 * Manages stasis links for darknet servers to prevent them from moving
 * or going offline.
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 2.1.0
 */

import { 
    STASIS_PORT, REPORT_INTERVAL, LOG_LEVELS, 
    sendReport, createJobId
} from "./protocol.js";

import { 
    log, asleep, getNsDataThroughFile, formatNumber
} from "./utils.js";

/**
 * Main entry point
 * 
 * @param {NS} ns - Netscript context
 */
export async function main(ns) {
    const flags = ns.flags([
        ["reportPort", STASIS_PORT],
        ["host", null],
        ["interval", REPORT_INTERVAL],
        ["debug", false],
        ["help", false]
    ]);

    if (flags.help) {
        showHelp(ns);
        return;
    }

    const reportPort = Number(flags.reportPort) || STASIS_PORT;
    const targetHost = flags.host || ns.getHostname();
    const interval = Number(flags.interval) || REPORT_INTERVAL;
    const debug = flags.debug || false;

    // Validate we're on a darknet server
    try {
        ns.dnet.probe();
    } catch (e) {
        if (debug) {
            log(ns, `Not on a darknet server: ${e}`, false, LOG_LEVELS.WARN);
        }
        return;
    }

    log(ns, `Stasis Manager v2 starting on ${targetHost}`, false, LOG_LEVELS.INFO);

    // Main loop
    while (true) {
        try {
            await manageStasis(ns, targetHost, reportPort);
        } catch (e) {
            log(ns, `Stasis error: ${e}`, false, LOG_LEVELS.ERROR);
        }
        await ns.sleep(interval);
    }
}

/**
 * Manage stasis link for the current server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Target host
 * @param {number} reportPort - Port to send reports to
 */
async function manageStasis(ns, host, reportPort) {
    const currentHost = ns.getHostname();
    
    // Check current stasis links
    const links = ns.dnet.getStasisLinkedServers();
    const limit = ns.dnet.getStasisLinkLimit();
    
    // If already linked, report status
    if (links.includes(currentHost)) {
        const report = {
            type: "stasis",
            action: "already_linked",
            host: currentHost,
            links: links.length,
            limit: limit
        };
        sendReport(ns, reportPort, report);
        return;
    }
    
    // If we've reached the limit, can't link more
    if (links.length >= limit) {
        const report = {
            type: "stasis",
            action: "limit_reached",
            host: currentHost,
            links: links.length,
            limit: limit
        };
        sendReport(ns, reportPort, report);
        return;
    }
    
    // Try to set stasis link
    const result = await ns.dnet.setStasisLink(true);
    
    const report = {
        type: "stasis",
        action: result.success ? "linked" : "failed",
        host: currentHost,
        success: result.success,
        message: result.message,
        links: links.length + (result.success ? 1 : 0),
        limit: limit
    };
    
    sendReport(ns, reportPort, report);
    
    if (result.success) {
        log(ns, `Stasis link established on ${currentHost}`, false, LOG_LEVELS.INFO);
    } else {
        log(ns, `Failed to establish stasis link on ${currentHost}: ${result.message}`, false, LOG_LEVELS.WARN);
    }
}

/**
 * Remove stasis link from current server
 * 
 * @param {NS} ns - Netscript context
 * @param {string} host - Target host
 * @param {number} reportPort - Port to send reports to
 */
async function removeStasis(ns, host, reportPort) {
    const result = await ns.dnet.setStasisLink(false);
    
    const report = {
        type: "stasis",
        action: "unlinked",
        host: ns.getHostname(),
        success: result.success,
        message: result.message
    };
    
    sendReport(ns, reportPort, report);
    
    if (result.success) {
        log(ns, `Stasis link removed from ${host}`, false, LOG_LEVELS.INFO);
    } else {
        log(ns, `Failed to remove stasis link from ${host}: ${result.message}`, false, LOG_LEVELS.ERROR);
    }
}

/**
 * Get stasis link status
 * 
 * @param {NS} ns - Netscript context
 * @returns {Object} - Status information
 */
function getStasisStatus(ns) {
    const links = ns.dnet.getStasisLinkedServers();
    const limit = ns.dnet.getStasisLinkLimit();
    const current = ns.getHostname();
    
    return {
        currentHost: current,
        isLinked: links.includes(current),
        links: links,
        limit: limit,
        availableSlots: limit - links.length
    };
}

/**
 * Show help message
 * 
 * @param {NS} ns - Netscript context
 */
function showHelp(ns) {
    ns.tprint("Darknet Stasis Manager v2");
    ns.tprint("");
    ns.tprint("Usage:");
    ns.tprint("  run darknet/v2/stasis.js [OPTIONS]");
    ns.tprint("");
    ns.tprint("Options:");
    ns.tprint("  --reportPort NUM    Port to send reports to (default: 10153)");
    ns.tprint("  --host STR         Target host (default: current server)");
    ns.tprint("  --interval MS      Management interval in ms (default: 5000)");
    ns.tprint("  --debug            Enable debug logging");
    ns.tprint("  --help             Show this help message");
    ns.tprint("");
    ns.tprint("Description:");
    ns.tprint("  Manages stasis links for darknet servers");
    ns.tprint("  Prevents servers from moving or going offline");
    ns.tprint("  RAM Cost: ~0.5GB");
    ns.tprint("");
    ns.tprint("Examples:");
    ns.tprint("  run darknet/v2/stasis.js                          # Default settings");
    ns.tprint("  run darknet/v2/stasis.js --interval 10000         # Check every 10 seconds");
    ns.tprint("  run darknet/v2/stasis.js --debug                 # Enable debug logging");
}

// Export for testing
export { manageStasis, removeStasis, getStasisStatus };
