/**
 * Darknet Stock Promoter
 * 
 * Uses ns.dnet.promoteStock() to increase stock volatility for profit
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 2.1.0
 * 
 * RAM Cost: ~0.2GB per promotion call
 * 
 * Usage:
 *   run darknet/stock-promoter.js [--symbol SYM] [--target-volatility 10]
 *   run darknet/stock-promoter.js --all --target-volatility 5
 */

import {
    HOME, WORKER_VERSION, REPORT_INTERVAL, STOCK_PROMOTION_INTERVAL,
    STOCK_PORT, STOCK_LOG, LOG_LEVELS,
    sendReport, createJobId
} from './protocol.js';

import {
    promoteStock, getServerDetails, getAllServerDetails,
    getNsDataThroughFile, formatMoney, formatNumber, log, asleep
} from './utils.js';

// ============================================================================
// STOCK CONFIGURATION
// ============================================================================

/** Default stock promotion configuration */
export const STOCK_CONFIG = {
    /** Target volatility level */
    targetVolatility: 10,
    
    /** Cooldown between promotions (ms) */
    cooldown: STOCK_PROMOTION_INTERVAL,
    
    /** Maximum volatility */
    maxVolatility: 50,
    
    /** Minimum volatility */
    minVolatility: 0.1,
    
    /** Promotion batch size */
    batchSize: 5,
    
    /** Enable debug logging */
    debug: false,
    
    /** Report interval (ms) */
    reportInterval: REPORT_INTERVAL,
    
    /** Enable all stocks promotion */
    promoteAll: false,
    
    /** Stock symbols to focus on */
    focusSymbols: [],
    
    /** Enable volatility monitoring */
    monitorVolatility: true
};

/** Argument schema for command-line configuration */
export const argsSchema = [
    ['symbol', null],           // Specific stock symbol to promote
    ['targetVolatility', 10],   // Target volatility level
    ['cooldown', STOCK_PROMOTION_INTERVAL],
    ['batchSize', 5],
    ['debug', false],
    ['all', false],             // Promote all available stocks
    ['monitor', true],          // Monitor volatility
    ['help', false]
];

// ============================================================================
// STOCK STATE
// ============================================================================

let promotions = {};           // Map of symbol -> promotion count
let volatilityLevels = {};     // Map of symbol -> current volatility
let totalPromotions = 0;
let lastPromotionTime = 0;

// ============================================================================
// STOCK PROMOTION FUNCTIONS
// ============================================================================

/**
 * Promote a single stock
 * 
 * @param {NS} ns - Netscript context
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} - Promotion result
 */
export async function doPromoteStock(ns, symbol) {
    try {
        const result = await promoteStock(ns, symbol);
        
        // Update stats
        promotions[symbol] = (promotions[symbol] || 0) + 1;
        totalPromotions++;
        lastPromotionTime = Date.now();
        
        return {
            success: result?.success || false,
            symbol,
            message: result?.message || 'Promotion successful',
            volatility: result?.volatility || volatilityLevels[symbol]
        };
    } catch (e) {
        return {
            success: false,
            symbol,
            message: `Error: ${e}`
        };
    }
}

/**
 * Get current volatility for a stock
 * 
 * @param {NS} ns - Netscript context
 * @param {string} symbol - Stock symbol
 * @returns {Promise<number>} - Current volatility
 */
export async function getVolatility(ns, symbol) {
    try {
        // Use file-based RAM dodging to get stock volatility
        const script = `ns.dnet.getStockVolatility('${symbol}')`;
        const result = await getNsDataThroughFile(ns, script);
        
        if (typeof result === 'number') {
            volatilityLevels[symbol] = result;
            return result;
        }
        
        return volatilityLevels[symbol] || 0;
    } catch (e) {
        return volatilityLevels[symbol] || 0;
    }
}

/**
 * Check if a stock needs promotion
 * 
 * @param {NS} ns - Netscript context
 * @param {string} symbol - Stock symbol
 * @param {number} targetVolatility - Target volatility level
 * @returns {Promise<Object>} - { needsPromotion: boolean, current: number, reason?: string }
 */
export async function needsPromotion(ns, symbol, targetVolatility = STOCK_CONFIG.targetVolatility) {
    try {
        const current = await getVolatility(ns, symbol);
        
        if (current >= targetVolatility) {
            return {
                needsPromotion: false,
                current,
                reason: `Already at target volatility (${current} >= ${targetVolatility})`
            };
        }
        
        if (current >= STOCK_CONFIG.maxVolatility) {
            return {
                needsPromotion: false,
                current,
                reason: `At maximum volatility (${current} >= ${STOCK_CONFIG.maxVolatility})`
            };
        }
        
        return {
            needsPromotion: true,
            current,
            reason: `Below target volatility (${current} < ${targetVolatility})`
        };
    } catch (e) {
        return {
            needsPromotion: false,
            current: 0,
            reason: `Error: ${e}`
        };
    }
}

/**
 * Promote stock to target volatility
 * 
 * @param {NS} ns - Netscript context
 * @param {string} symbol - Stock symbol
 * @param {number} targetVolatility - Target volatility level
 * @returns {Promise<Object>} - Promotion results
 */
export async function promoteToTarget(ns, symbol, targetVolatility = STOCK_CONFIG.targetVolatility) {
    const results = [];
    
    // Check current volatility
    const { needsPromotion, current } = await needsPromotion(ns, symbol, targetVolatility);
    
    if (!needsPromotion) {
        return {
            success: true,
            symbol,
            currentVolatility: current,
            targetVolatility,
            message: 'Already at target',
            promotions: 0,
            results
        };
    }
    
    // Calculate how many promotions needed
    // Each promotion increases volatility by ~1
    const promotionsNeeded = Math.ceil(targetVolatility - current);
    const actualPromotions = Math.min(promotionsNeeded, STOCK_CONFIG.batchSize);
    
    for (let i = 0; i < actualPromotions; i++) {
        const result = await doPromoteStock(ns, symbol);
        results.push(result);
        
        if (!result.success) {
            return {
                success: false,
                symbol,
                currentVolatility: current + i,
                targetVolatility,
                message: `Failed at promotion ${i + 1}`,
                promotions: i + 1,
                results
            };
        }
        
        // Update volatility estimate
        volatilityLevels[symbol] = (volatilityLevels[symbol] || 0) + 1;
        
        // Small delay
        await asleep(ns, 500);
    }
    
    return {
        success: true,
        symbol,
        currentVolatility: volatilityLevels[symbol],
        targetVolatility,
        message: `Promoted ${actualPromotions} times`,
        promotions: actualPromotions,
        results
    };
}

/**
 * Get all available stock symbols
 * 
 * @param {NS} ns - Netscript context
 * @returns {Promise<string[]>} - Array of stock symbols
 */
export async function getAvailableSymbols(ns) {
    try {
        // Try to get symbols from Darknet
        const script = 'ns.dnet.getStockSymbols()';
        const result = await getNsDataThroughFile(ns, script);
        
        if (Array.isArray(result)) {
            return result;
        }
        
        // Fallback: use common stock symbols if available
        return Object.keys(volatilityLevels);
    } catch (e) {
        log(ns, `Failed to get stock symbols: ${e}`, false, LOG_LEVELS.WARN);
        return [];
    }
}

/**
 * Promote all stocks to target volatility
 * 
 * @param {NS} ns - Netscript context
 * @param {number} targetVolatility - Target volatility level
 * @param {string[]} focusSymbols - Symbols to focus on (optional)
 * @returns {Promise<Object>} - Promotion results for all stocks
 */
export async function promoteAllStocks(ns, targetVolatility = STOCK_CONFIG.targetVolatility, focusSymbols = []) {
    const results = {
        promoted: [],
        skipped: [],
        failed: []
    };
    
    let symbols = focusSymbols.length > 0 ? focusSymbols : await getAvailableSymbols(ns);
    
    // Remove duplicates and filter out null/undefined
    symbols = [...new Set(symbols)].filter(s => s && typeof s === 'string');
    
    // Process in batches
    const batchSize = STOCK_CONFIG.batchSize;
    const batches = [];
    
    for (let i = 0; i < symbols.length; i += batchSize) {
        batches.push(symbols.slice(i, i + batchSize));
    }
    
    for (const batch of batches) {
        const batchResults = await Promise.all(
            batch.map(symbol => promoteToTarget(ns, symbol, targetVolatility))
        );
        
        for (const result of batchResults) {
            if (result.promotions > 0) {
                results.promoted.push(result);
            } else if (result.success) {
                results.skipped.push(result);
            } else {
                results.failed.push(result);
            }
        }
        
        // Delay between batches
        await asleep(ns, STOCK_CONFIG.cooldown);
    }
    
    return results;
}

/**
 * Monitor and maintain stock volatility
 * 
 * @param {NS} ns - Netscript context
 * @param {string[]} symbols - Symbols to monitor
 * @param {number} targetVolatility - Target volatility level
 * @returns {Promise<Object>} - Monitoring results
 */
export async function monitorVolatility(ns, symbols = [], targetVolatility = STOCK_CONFIG.targetVolatility) {
    const results = {
        promoted: [],
        maintained: [],
        failed: []
    };
    
    const actualSymbols = symbols.length > 0 ? symbols : await getAvailableSymbols(ns);
    
    for (const symbol of actualSymbols) {
        try {
            const { needsPromotion, current } = await needsPromotion(ns, symbol, targetVolatility);
            
            if (needsPromotion) {
                const result = await promoteToTarget(ns, symbol, targetVolatility);
                if (result.success) {
                    results.promoted.push(result);
                } else {
                    results.failed.push(result);
                }
            } else {
                results.maintained.push({
                    symbol,
                    currentVolatility: current,
                    message: 'Already at target volatility'
                });
            }
            
            await asleep(ns, 100);
        } catch (e) {
            results.failed.push({
                symbol,
                message: `Error: ${e}`
            });
        }
    }
    
    return results;
}

/**
 * Get stock promotion statistics
 * 
 * @returns {Object} - Promotion stats
 */
export function getPromotionStats() {
    return {
        totalPromotions,
        promotions,
        volatilityLevels,
        lastPromotionTime,
        averageVolatility: calculateAverageVolatility()
    };
}

/**
 * Calculate average volatility across all stocks
 * 
 * @returns {number} - Average volatility
 */
function calculateAverageVolatility() {
    const values = Object.values(volatilityLevels);
    if (values.length === 0) return 0;
    
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
}

/**
 * Reset promotion statistics
 */
export function resetPromotionStats() {
    promotions = {};
    totalPromotions = 0;
}

/**
 * Save promotion stats to file
 * 
 * @param {NS} ns - Netscript context
 */
export async function savePromotionStats(ns) {
    try {
        const stats = getPromotionStats();
        const data = {
            timestamp: Date.now(),
            host: ns.getHostname(),
            ...stats,
            volatilityLevels: { ...volatilityLevels }
        };
        
        ns.write(STOCK_LOG, JSON.stringify(data, null, 2), 'w');
    } catch (e) {
        log(ns, `Failed to save promotion stats: ${e}`, false, LOG_LEVELS.ERROR);
    }
}

/**
 * Load promotion stats from file
 * 
 * @param {NS} ns - Netscript context
 */
export async function loadPromotionStats(ns) {
    try {
        if (ns.fileExists(STOCK_LOG)) {
            const data = JSON.parse(ns.read(STOCK_LOG));
            
            if (data.promotions) {
                for (const [key, value] of Object.entries(data.promotions)) {
                    promotions[key] = value;
                }
            }
            
            if (data.volatilityLevels) {
                for (const [key, value] of Object.entries(data.volatilityLevels)) {
                    volatilityLevels[key] = value;
                }
            }
            
            totalPromotions = data.totalPromotions || 0;
            
            log(ns, `Loaded promotion stats: ${Object.keys(promotions).length} stocks, ${totalPromotions} promotions`, false, LOG_LEVELS.INFO);
        }
    } catch (e) {
        log(ns, `Failed to load promotion stats: ${e}`, false, LOG_LEVELS.WARN);
    }
}

// ============================================================================
// MAIN PROMOTION LOOP
// ============================================================================

/**
 * Main stock promotion loop
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 * @param {string[]} focusSymbols - Symbols to focus on
 * @param {number} targetVolatility - Target volatility
 */
async function promotionLoop(ns, reportPort, focusSymbols, targetVolatility) {
    const host = ns.getHostname();
    
    // Load previous stats
    await loadPromotionStats(ns);
    
    // Initialize
    resetPromotionStats();
    log(ns, `Stock promoter started on ${host}`, false, LOG_LEVELS.INFO);
    
    while (true) {
        const now = Date.now();
        
        // Promote stocks
        const results = await promoteAllStocks(ns, targetVolatility, focusSymbols);
        
        // Report results
        if (reportPort) {
            sendReport(ns, reportPort, {
                type: 'stock_promotion',
                host: ns.getHostname(),
                promoted: results.promoted.length,
                skipped: results.skipped.length,
                failed: results.failed.length,
                totalPromotions: totalPromotions,
                averageVolatility: calculateAverageVolatility()
            });
        }
        
        // Log results
        if (results.promoted.length > 0) {
            log(ns, `Promoted ${results.promoted.length} stocks, ${results.skipped.length} already at target`, false, LOG_LEVELS.INFO);
        }
        
        if (results.failed.length > 0 && STOCK_CONFIG.debug) {
            for (const fail of results.failed) {
                log(ns, `Failed to promote ${fail.symbol}: ${fail.message}`, false, LOG_LEVELS.DEBUG);
            }
        }
        
        // Save stats periodically
        if (totalPromotions % 10 === 0) {
            await savePromotionStats(ns);
        }
        
        // Sleep for cooldown
        await asleep(ns, STOCK_CONFIG.cooldown);
    }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Main entry point for stock promoter
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
    
    const reportPort = Number(flags.reportPort) || STOCK_PORT;
    const targetVolatility = Number(flags.targetVolatility) || STOCK_CONFIG.targetVolatility;
    const cooldown = Number(flags.cooldown) || STOCK_CONFIG.cooldown;
    const batchSize = Number(flags.batchSize) || STOCK_CONFIG.batchSize;
    const debug = flags.debug || false;
    const promoteAll = flags.all || false;
    const monitor = flags.monitor !== false;
    
    // Parse symbols
    let focusSymbols = [];
    if (flags.symbol) {
        focusSymbols = Array.isArray(flags.symbol) ? flags.symbol : [flags.symbol];
    }
    
    // Update config
    STOCK_CONFIG.targetVolatility = targetVolatility;
    STOCK_CONFIG.cooldown = cooldown;
    STOCK_CONFIG.batchSize = batchSize;
    STOCK_CONFIG.debug = debug;
    STOCK_CONFIG.promoteAll = promoteAll;
    STOCK_CONFIG.monitorVolatility = monitor;
    STOCK_CONFIG.focusSymbols = focusSymbols;
    
    // Start promotion loop
    await promotionLoop(ns, reportPort, focusSymbols, targetVolatility);
}

/**
 * Show help message
 * 
 * @param {NS} ns - Netscript context
 */
function showHelp(ns) {
    log(ns, 'Darknet Stock Promoter', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Usage:', false, LOG_LEVELS.INFO);
    log(ns, '  run darknet/stock-promoter.js [OPTIONS]', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Options:', false, LOG_LEVELS.INFO);
    log(ns, '  --symbol SYM        Specific stock symbol to promote (can be used multiple times)', false, LOG_LEVELS.INFO);
    log(ns, '  --targetVolatility NUM  Target volatility level (default: 10)', false, LOG_LEVELS.INFO);
    log(ns, '  --cooldown MS       Cooldown between promotions (default: ' + STOCK_PROMOTION_INTERVAL + 'ms)', false, LOG_LEVELS.INFO);
    log(ns, '  --batchSize NUM     Promotion batch size (default: 5)', false, LOG_LEVELS.INFO);
    log(ns, '  --all              Promote all available stocks', false, LOG_LEVELS.INFO);
    log(ns, '  --monitor           Monitor and maintain volatility (default: true)', false, LOG_LEVELS.INFO);
    log(ns, '  --debug             Enable debug logging', false, LOG_LEVELS.INFO);
    log(ns, '  --help              Show this help message', false, LOG_LEVELS.INFO);
    log(ns, '', false, LOG_LEVELS.INFO);
    log(ns, 'Description:', false, LOG_LEVELS.INFO);
    log(ns, '  Uses ns.dnet.promoteStock() to increase stock volatility', false, LOG_LEVELS.INFO);
    log(ns, '  Higher volatility enables larger price swings and profits', false, LOG_LEVELS.INFO);
    log(ns, '  RAM Cost: ~0.2GB per promotion call', false, LOG_LEVELS.INFO);
}

// ============================================================================
// AUTOINITIALIZATION
// ============================================================================

/**
 * Initialize stock promoter on current server
 * 
 * @param {NS} ns - Netscript context
 * @param {number} reportPort - Port for reporting
 * @param {string[]} focusSymbols - Symbols to focus on
 * @param {number} targetVolatility - Target volatility
 * @returns {Promise<number>} - PID of promoter process
 */
export async function initStockPromoter(ns, reportPort = null, focusSymbols = [], targetVolatility = null) {
    const actualReportPort = reportPort || STOCK_PORT;
    const actualVolatility = targetVolatility || STOCK_CONFIG.targetVolatility;
    
    // Build arguments
    const args = [`--reportPort ${actualReportPort}`, `--targetVolatility ${actualVolatility}`];
    if (focusSymbols.length > 0) {
        focusSymbols.forEach(s => args.push(`--symbol ${s}`));
    }
    args.push('--all'); // Promote all by default
    
    // Run promoter script
    const pid = await ns.run(
        'darknet/stock-promoter.js',
        ns.getHostname(),
        1,
        args
    );
    
    return pid;
}

/**
 * Start stock promoter on all accessible Darknet servers
 * 
 * @param {NS} ns - Netscript context
 * @param {string[]} servers - Array of server hostnames
 * @param {number} reportPort - Port for reporting
 * @param {string[]} focusSymbols - Symbols to focus on
 * @returns {Promise<Object>} - { started: number, failed: number, pids: number[] }
 */
export async function startPromoterOnAll(ns, servers, reportPort = null, focusSymbols = []) {
    const started = [];
    const failed = [];
    const pids = [];
    
    for (const server of servers) {
        try {
            // Check if we can run on this server
            const details = await getNsDataThroughFile(ns, `ns.dnet.getServerDetails('${server}')`);
            if (!details || !details.isOnline || !details.isConnectedToCurrentServer) {
                failed.push({ server, reason: 'Server not accessible' });
                continue;
            }
            
            // Check if we have a session
            if (!details.hasSession) {
                failed.push({ server, reason: 'No session' });
                continue;
            }
            
            // Try to start stock promoter
            const pid = await initStockPromoter(ns, reportPort, focusSymbols);
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
    STOCK_CONFIG,
    argsSchema,
    
    // Functions
    doPromoteStock,
    getVolatility,
    needsPromotion,
    promoteToTarget,
    getAvailableSymbols,
    promoteAllStocks,
    monitorVolatility,
    getPromotionStats,
    resetPromotionStats,
    savePromotionStats,
    loadPromotionStats,
    initStockPromoter,
    startPromoterOnAll,
    
    // Main
    main,
    autocomplete
};
