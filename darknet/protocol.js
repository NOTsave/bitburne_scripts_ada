/**
 * Darknet Protocol Constants and Helpers
 * 
 * Shared constants and utility functions for Darknet scripts.
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

// ============================================================================
// CONSTANTS
// ============================================================================

/** Home server constant */
export const HOME = "home";

/** Worker script names */
export const WORKER = "darknet/worker.js";
export const COLLECTOR = "darknet/collector.js";
export const EXPLORER = "darknet/explorer.js";
export const PHISHING = "darknet/phishing.js";
export const STASIS = "darknet/stasis.js";
export const MIGRATION = "darknet/migration.js";
export const MIGRATION_EXPLORER = "darknet/migration-explorer.js";
export const STOCK_PROMOTER = "darknet/stock-promoter.js";

/** Bundle of scripts to copy to Darknet servers */
export const BUNDLE = [
    "darknet/protocol.js",
    "darknet/solvers.js",
    "darknet/utils.js",
    WORKER,
    COLLECTOR,
    EXPLORER,
    PHISHING,
    STASIS,
    MIGRATION,
    MIGRATION_EXPLORER,
    STOCK_PROMOTER
];

/** Worker version - increment when making breaking changes */
export const WORKER_VERSION = 2;

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

/** How often workers send heartbeat reports (ms) */
export const REPORT_INTERVAL = 5_000;

/** How long before a worker is considered stale (ms) */
export const SIGHTING_TTL = 3 * REPORT_INTERVAL;

/** Job timeout (ms) */
export const JOB_TTL = 120_000;

/** Retry delay after failure (ms) */
export const RETRY_DELAY = 30_000;

/** Stasis link check interval (ms) */
export const STASIS_CHECK_INTERVAL = 10_000;

/** Migration interval (ms) */
export const MIGRATION_INTERVAL = 60_000;

/** Cache collection interval (ms) */
export const CACHE_CHECK_INTERVAL = 15_000;

/** Server discovery interval (ms) */
export const DISCOVERY_INTERVAL = 30_000;

/** Phishing attack cooldown (ms) - RAM optimized */
export const PHISHING_COOLDOWN = 15_000;

/** Stock promotion cooldown (ms) */
export const STOCK_PROMOTE_COOLDOWN = 30_000;

/** Migration induction interval (ms) */
export const MIGRATION_INDUCTION_INTERVAL = 20_000;

/** Heartbleed check interval (ms) */
export const HEARTBLEED_CHECK_INTERVAL = 10_000;

// ============================================================================
// STATE FILES
// ============================================================================

/** Main state file for Darknet manager */
export const STATE_FILE = "data/darknet-state.txt";

/** Worker state file */
export const WORKER_STATE_FILE = "data/darknet-worker-state.txt";

/** Exploration log file */
export const EXPLORATION_LOG = "data/darknet-exploration.log";

/** Cache collection log */
export const CACHE_LOG = "data/darknet-caches.log";

/** Phishing log */
export const PHISHING_LOG = "data/darknet-phishing.log";

/** Stock promotion log */
export const STOCK_LOG = "data/darknet-stocks.log";

/** Migration log */
export const MIGRATION_LOG = "data/darknet-migration.log";

// ============================================================================
// PORT NUMBERS
// ============================================================================

/** Default report port for Darknet manager */
export const DEFAULT_REPORT_PORT = 10150;

/** Default job port (report port + 1) */
export const DEFAULT_JOB_PORT = 10151;

/** Phishing report port */
export const PHISHING_PORT = 10152;

/** Stock promotion port */
export const STOCK_PORT = 10153;

/** Migration port */
export const MIGRATION_PORT = 10154;

// ============================================================================
// RAM CONSTANTS
// ============================================================================

/** Estimated RAM cost for various operations (GB) */
export const RAM_COSTS = {
    // Basic operations
    probe: 0.1,
    getServerDetails: 0.2,
    authenticate: 0.5,
    connectToSession: 0.1,
    
    // Resource operations
    openCache: 0.1,
    memoryReallocation: 0.2,
    getBlockedRam: 0.1,
    
    // New API operations (from official Bitburner Darknet API docs)
    phishingAttack: 0.0,  // Low/none RAM cost per docs
    heartbleed: 0.1,      // 0.1 GB per docs
    setStasisLink: 0.1,   // 0.1 GB per docs
    getStasisLinkLimit: 0.0, // Sync, no RAM cost
    induceServerMigration: 0.3, // 0.3 GB per docs
    getStasisLinkedServers: 0.1, // 0.1 GB per docs
    promoteStock: 0.2,    // 0.2 GB per docs
    
    // Script RAM (updated for v2.1.0)
    worker: 1.6,
    collector: 0.8,
    phishing: 0.4,       // Reduced from 0.5
    stasis: 0.5,
    migration: 0.5,      // Reduced from 0.6
    explorer: 1.0,
    stockPromoter: 0.6, // Reduced from 0.7
    manager: 0.8
};

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Darknet Manager Configuration */
export const DARKNET_CONFIG = {
    // ========================================================================
    // TIMING CONFIGURATION
    // ========================================================================
    
    /** How often to check for new servers (ms) */
    checkInterval: 30_000,
    
    /** How often to check contracts (legacy, not used in current API) (ms) */
    contractCheckInterval: 60_000,
    
    /** How often to run phishing attacks (ms) */
    phishingInterval: 15_000,
    
    /** How often to check for stock promotion opportunities (ms) */
    stockCheckInterval: 60_000,
    
    /** How often to attempt server migration (ms) */
    migrationInterval: 120_000,
    
    /** How often to check stasis links (ms) */
    stasisCheckInterval: 30_000,
    
    
    // ========================================================================
    // FINANCIAL CONFIGURATION
    // ========================================================================
    
    /** Minimum funds before interacting with Darknet */
    minFunds: 100e6,
    
    /** Max percentage of funds to spend per cycle */
    maxSpendPercent: 0.05,
    
    /** Max percentage of funds per service */
    serviceMaxPercent: 0.10,
    
    
    // ========================================================================
    // ENABLE/DISABLE FEATURES
    // ========================================================================
    
    /** Enable server discovery and authentication */
    enableDiscovery: true,
    
    /** Enable cache collection */
    enableCacheCollection: true,
    
    /** Enable phishing attacks (ns.dnet.phishingAttack) */
    enablePhishing: true,
    
    /** Enable stock promotion (ns.dnet.promoteStock) */
    enableStockPromotion: false,
    
    /** Enable server migration induction */
    enableMigration: true,
    
    /** Enable Stasis network management */
    enableStasis: true,
    
    /** Auto-lock servers with Stasis */
    autoStasisLock: true,
    
    
    // ========================================================================
    // PHISHING CONFIGURATION
    // ========================================================================
    
    /** Minimum charisma to attempt phishing */
    minPhishingCharisma: 100,
    
    /** Minimum crime success rate for phishing */
    minPhishingCrimeSuccess: 0.5,
    
    /** Number of phishing threads per server */
    phishingThreads: 1,
    
    /** Cooldown between phishing attacks per server (ms) */
    phishingCooldown: 15_000,
    
    
    // ========================================================================
    // STASIS CONFIGURATION
    // ========================================================================
    
    /** Maximum number of servers to keep in Stasis */
    maxStasisLinks: 5,
    
    /** Prioritize locking high-value servers */
    prioritizeHighValueStasis: true,
    
    
    // ========================================================================
    // MIGRATION CONFIGURATION
    // ========================================================================
    
    /** Number of migration inductions before server moves */
    migrationChargesNeeded: 10,
    
    /** Maximum migration attempts per cycle */
    maxMigrationAttempts: 5,
    
    
    // ========================================================================
    // STOCK PROMOTION CONFIGURATION
    // ========================================================================
    
    /** Target volatility increase */
    targetVolatility: 0.5,
    
    /** Maximum promotions per stock per cycle */
    maxStockPromotions: 3,
    
    /** Stocks to promote (empty = all owned stocks) */
    targetStocks: [],
    
    
    // ========================================================================
    // PRIORITY CONFIGURATION
    // ========================================================================
    
    /** Priority order for puzzle solving */
    puzzlePriority: [
        "ZeroLogon",
        "FreshInstall_1.0",
        "DeskMemo_3.1",
        "BellaCuore",
        "110100100",
        "CloudBlare(tm)",
        "OctantVoxel",
        "PHP 5.4",
        "AccountsManager_4.2",
        "Laika4"
    ],
    
    
    // ========================================================================
    // RAM CONFIGURATION
    // ========================================================================
    
    /** Minimum RAM for a worker (GB) */
    minWorkerRam: 1.0,
    
    /** Reserved RAM per worker for helpers (GB) */
    reservedRamPerWorker: 0.5,
    
    /** Maximum workers to deploy */
    maxWorkers: 20,
    
    /** Default worker threads */
    workerThreads: 1,
    
    /** Maximum RAM to use for phishing (GB) */
    maxPhishingRam: 0.5,
    
    
    // ========================================================================
    // WORKER CONFIGURATION
    // ========================================================================
    
    /** Worker script filename */
    workerScript: WORKER,
    
    /** Collector script filename */
    collectorScript: COLLECTOR,
    
    /** Phishing script filename */
    phishingScript: PHISHING,
    
    
    // ========================================================================
    // DEBUGGING CONFIGURATION
    // ========================================================================
    
    /** Enable debug logging */
    enableDebugLogs: false,
    
    /** Enable trace logging (very verbose) */
    enableTraceLogs: false,
    
    /** Log to toast notifications */
    enableToastLogs: false
};

// ============================================================================
// PUZZLE MODELS
// ============================================================================

/** Known puzzle model IDs */
export const KNOWN_MODELS = [
    "ZeroLogon",
    "FreshInstall_1.0",
    "DeskMemo_3.1",
    "BellaCuore",
    "110100100",
    "CloudBlare(tm)",
    "OctantVoxel",
    "PHP 5.4",
    "AccountsManager_4.2",
    "Laika4"
];

/** Unknown model placeholder */
export const UNKNOWN_MODEL = "Unknown";

// ============================================================================
// PASSWORD FORMATS
// ============================================================================

/** Valid password formats */
export const PASSWORD_FORMATS = [
    "alphabetic",
    "numeric",
    "alphanumeric"
];

// ============================================================================
// PHISHING CONSTANTS
// ============================================================================

/** Phishing task name */
export const PHISHING_TASK = "phishing";

/** Minimum phishing reward to track */
export const MIN_PHISHING_REWARD = 1e6; // $1M

// ============================================================================
// STOCK CONSTANTS
// ============================================================================

/** Maximum volatility for stocks */
export const MAX_VOLATILITY = 1.0;

/** Minimum volatility for stocks */
export const MIN_VOLATILITY = 0.0;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sends a report through a port with standard metadata
 * 
 * @param {NS} ns - Netscript context
 * @param {number} port - Port number
 * @param {Object} report - Report data
 * @returns {boolean} - True if sent successfully
 */
export function sendReport(ns, port, report) {
    return ns.tryWritePort(port, {
        ...report,
        host: ns.getHostname(),
        pid: ns.pid,
        at: Date.now(),
        version: WORKER_VERSION
    });
}

/**
 * Creates a unique job ID
 * 
 * @param {number} offlineEpoch - Current epoch
 * @param {number} sequence - Sequence number
 * @returns {string} - Unique job ID
 */
export function createJobId(offlineEpoch, sequence) {
    return `${offlineEpoch}/${sequence}`;
}

/**
 * Parses a job ID to extract epoch and sequence
 * 
 * @param {string} jobId - Job ID
 * @returns {Object} - { epoch, sequence } or null
 */
export function parseJobId(jobId) {
    if (!jobId || typeof jobId !== 'string') return null;
    
    const parts = jobId.split('/');
    if (parts.length !== 2) return null;
    
    const epoch = Number(parts[0]);
    const sequence = Number(parts[1]);
    
    if (!Number.isSafeInteger(epoch) || !Number.isSafeInteger(sequence)) {
        return null;
    }
    
    return { epoch, sequence };
}

/**
 * Checks if a worker is fresh (recently checked in)
 * 
 * @param {Object} worker - Worker info
 * @param {number} now - Current timestamp
 * @returns {boolean} - True if fresh
 */
export function isWorkerFresh(worker, now) {
    if (!worker || !worker.at) return false;
    return now - worker.at <= SIGHTING_TTL;
}

/**
 * Checks if a job is expired
 * 
 * @param {Object} job - Job info
 * @param {number} now - Current timestamp
 * @returns {boolean} - True if expired
 */
export function isJobExpired(job, now) {
    if (!job || !job.expires) return true;
    return job.expires <= now;
}

/**
 * Gets the file extension for a path
 * 
 * @param {string} filename - Filename
 * @returns {string} - Extension
 */
export function getFileExtension(filename) {
    if (!filename || typeof filename !== 'string') return '';
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.slice(lastDot) : '';
}

/**
 * Checks if a filename is a cache file
 * 
 * @param {string} filename - Filename
 * @returns {boolean} - True if cache file
 */
export function isCacheFile(filename) {
    return filename && filename.endsWith('.cache');
}

/**
 * Checks if a filename is a collectible file
 * 
 * @param {string} filename - Filename
 * @returns {boolean} - True if collectible
 */
export function isCollectibleFile(filename) {
    if (!filename) return false;
    const ext = getFileExtension(filename).toLowerCase();
    return ext === '.cache' || ext === '.lit' || ext === '.txt';
}

/**
 * Checks if a filename is a phishing-related file
 * 
 * @param {string} filename - Filename
 * @returns {boolean} - True if phishing-related
 */
export function isPhishingFile(filename) {
    if (!filename) return false;
    return filename.includes('phishing') || filename.includes('cache');
}
