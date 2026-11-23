/**
 * Darknet v2 Protocol
 * 
 * Shared constants and utilities for the new Darknet framework
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 2.1.0
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Worker version for backward compatibility */
export const WORKER_VERSION = 15;

/** Home server */
export const HOME = "home";

/** Worker scripts */
export const WORKER = "darknet/worker.js";
export const COLLECTOR = "darknet/collect.js";
export const STASIS_SCRIPT = "darknet/stasis.js";
export const MIGRATION_SCRIPT = "darknet/migrate.js";
export const LAB_SCRIPT = "darknet/lab.js";
export const IDLE_SCRIPT = "darknet/idle.js";

/** Bundle of scripts to copy */
export const BUNDLE = [
    "darknet/protocol.js", 
    "darknet/solvers.js", 
    WORKER, 
    COLLECTOR, 
    STASIS_SCRIPT, 
    MIGRATION_SCRIPT, 
    LAB_SCRIPT, 
    IDLE_SCRIPT
];

// New framework scripts
export const EXPLORER_SCRIPT = "darknet/v2/explorer.js";
export const PHISHING_SCRIPT = "darknet/v2/phishing.js";
export const STOCK_SCRIPT = "darknet/v2/stock-promoter.js";
export const MIGRATION_EXPLORER_SCRIPT = "darknet/v2/migration-explorer.js";
export const STASIS_V2_SCRIPT = "darknet/v2/stasis.js";

/** Timing constants */
export const REPORT_INTERVAL = 5_000;
export const SIGHTING_TTL = 3 * REPORT_INTERVAL;
export const JOB_TTL = 120_000;
export const RETRY_DELAY = 30_000;

/** Darknet ports */
export const MANAGER_PORT = 10150;
export const EXPLORER_PORT = 10151;
export const PHISHING_PORT = 10152;
export const STASIS_PORT = 10153;
export const MIGRATION_PORT = 10154;
export const STOCK_PORT = 10155;

/** Timing constants for cooldowns */
export const PHISHING_COOLDOWN = 60_000;
export const STOCK_PROMOTE_COOLDOWN = 1000;
export const MIGRATION_INDUCTION_INTERVAL = 10_000;

/** Log levels */
export const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    SILENT: 4
};

/** Configuration for different server models */
export const MODEL_CONFIG = {
    ZeroLogon: {
        passwordFormat: "empty",
        solvable: true,
        ramFactor: 1.0
    },
    Heartbleed: {
        passwordFormat: "number",
        solvable: true,
        ramFactor: 1.5,
        usesHeartbleed: true
    },
    EternalBlue: {
        passwordFormat: "hex",
        solvable: true,
        ramFactor: 1.2
    },
    DirtyCow: {
        passwordFormat: "alphanumeric",
        solvable: true,
        ramFactor: 1.8
    },
    ShellShock: {
        passwordFormat: "special_chars",
        solvable: true,
        ramFactor: 1.5
    },
    Unknown: {
        passwordFormat: "unknown",
        solvable: false,
        ramFactor: 1.0
    }
};

/** RAM costs for API calls */
export const RAM_COSTS = {
    dnet_probe: 0.1,
    dnet_getServerDetails: 0.2,
    dnet_authenticate: 0.5,
    dnet_heartbleed: 0.8,
    dnet_connectToSession: 0.1,
    dnet_memoryReallocation: 0.3,
    dnet_openCache: 0.5,
    dnet_phishingAttack: 0.0,
    dnet_setStasisLink: 0.5,
    dnet_getStasisLinkedServers: 0.1,
    dnet_getStasisLinkLimit: 0.05,
    dnet_induceServerMigration: 0.2,
    dnet_promoteStock: 0.1
};

/** Phishing configuration */
export const PHISHING_CONFIG = {
    threads: 4,
    minCharisma: 50,
    minSuccessRate: 0.1,
    cacheProbability: 0.01,
    retryDelay: 60_000
};

/** Stock promotion configuration */
export const STOCK_CONFIG = {
    volatilityIncrease: 0.1,
    maxVolatility: 0.5,
    maxPromotions: 1000,
    cooldown: 1000,
    maxWorkers: 3
};

/** Migration configuration */
export const MIGRATION_CONFIG = {
    chargeThreshold: 100,
    maxCharges: 1000,
    cooldown: 10_000,
    maxWorkers: 2
};

/** Stasis configuration */
export const STASIS_CONFIG = {
    maxLinks: 5,
    refreshInterval: 5_000,
    maxWorkers: 2
};

/** Explorer configuration */
export const EXPLORER_CONFIG = {
    probeInterval: 10_000,
    maxDepth: 5,
    maxWorkers: 3,
    scannerRam: 0.5
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Send a report to a port
 * 
 * @param {NS} ns - Netscript context
 * @param {number} port - Port number
 * @param {Object} report - Report object
 * @returns {boolean} - True if write succeeded
 */
export function sendReport(ns, port, report) {
    return ns.tryWritePort(port, {
        ...report,
        host: ns.getHostname(),
        pid: ns.pid,
        at: Date.now(),
    });
}

/**
 * Create a unique job ID
 * 
 * @returns {string} - Unique job ID
 */
export function createJobId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Get message type for a report
 * 
 * @param {string} type - Report type
 * @returns {number} - Message type number
 */
export function getMessageType(type) {
    const types = {
        sighting: 1,
        route: 2,
        collection: 3,
        idle: 4,
        lab: 5,
        explore: 6,
        phishing: 7,
        stasis: 8,
        migration: 9,
        stock: 10,
        error: 99
    };
    return types[type] || types.error;
}

/**
 * Check if a server is worth exploring
 * 
 * @param {Object} details - Server details
 * @returns {boolean} - True if worth exploring
 */
export function isWorthExploring(details) {
    return details.isOnline && 
           !details.hasSession && 
           details.modelId !== "Unknown";
}

/**
 * Check if a server can be used for phishing
 * 
 * @param {NS} ns - Netscript context
 * @returns {boolean} - True if can phish
 */
export function canPhish(ns) {
    return ns.getPlayer().skills.charisma >= PHISHING_CONFIG.minCharisma;
}

/**
 * Check if a worker is fresh (recently seen)
 * 
 * @param {Object} worker - Worker object
 * @param {number} now - Current timestamp
 * @returns {boolean} - True if worker is fresh
 */
export function isWorkerFresh(worker, now) {
    if (!worker) return false;
    const SIGHTING_TTL = 3 * REPORT_INTERVAL;
    return now - worker.at <= SIGHTING_TTL;
}

/**
 * Check if a job is expired
 * 
 * @param {Object} job - Job object
 * @param {number} now - Current timestamp
 * @returns {boolean} - True if job is expired
 */
export function isJobExpired(job, now) {
    if (!job) return true;
    return now > job.expires;
}

/**
 * Check if a file is a cache file
 * 
 * @param {string} file - Filename
 * @returns {boolean} - True if it's a cache file
 */
export function isCacheFile(file) {
    return file.endsWith('.cache');
}

/**
 * Check if a file is collectible
 * 
 * @param {string} file - Filename
 * @returns {boolean} - True if collectible
 */
export function isCollectibleFile(file) {
    return !file.endsWith('.cache') && !file.endsWith('.lit') && !file.endsWith('.js');
}

/**
 * Check if a file is a phishing-related file
 * 
 * @param {string} file - Filename
 * @returns {boolean} - True if phishing file
 */
export function isPhishingFile(file) {
    return file.includes('phish') || file.includes('password') || file.includes('cred');
}

// ============================================================================
// DARKNET HOSTING CONSTANTS
// ============================================================================

/** Known darknet servers */
export const KNOWN_DARKNET_SERVERS = new Set([
    // Entry-level servers
    "darknet-server-01",
    "darknet-server-02",
    "darknet-server-03",
    // Heartbleed series
    "darknet-heartbleed-01",
    "darknet-heartbleed-02",
    // EternalBlue series
    "darknet-eternalblue-01",
    "darknet-eternalblue-02",
    // DirtyCow series
    "darknet-dirtycow-01",
    // ShellShock series
    "darknet-shellshock-01",
    // Deep servers
    "darknet-hub-01",
    "darknet-hub-02",
    "darknet-isolated-01",
    "darknet-isolated-02"
]);

/** Server model prefixes */
export const MODEL_PREFIXES = {
    ZeroLogon: "darknet-server",
    Heartbleed: "darknet-heartbleed",
    EternalBlue: "darknet-eternalblue",
    DirtyCow: "darknet-dirtycow",
    ShellShock: "darknet-shellshock"
};
