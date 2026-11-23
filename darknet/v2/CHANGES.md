# Darknet Framework v2.1.0 - Complete API Integration

## Summary

This update implements **ALL official Darknet API functions** from Bitburner, with full RAM optimization and comprehensive error handling. The framework now supports:

- **Phishing**: `ns.dnet.phishingAttack()` for passive income generation
- **Heartbleed**: `ns.dnet.heartbleed()` for authentication clues
- **Stasis**: `ns.dnet.setStasisLink()`, `getStasisLinkedServers()`, `getStasisLinkLimit()` for network stabilization
- **Migration**: `ns.dnet.induceServerMigration()` for network exploration
- **Stock Promotion**: `ns.dnet.promoteStock()` for volatility manipulation

## Files Updated

### New Files Created
1. **phishing.js** - Complete phishing attack implementation with tracking and statistics
2. **migration-explorer.js** - Network exploration via forced server migrations
3. **stock-promoter.js** - Stock volatility promotion for increased profits

### Files Updated
1. **protocol.js** - Added all new API constants, RAM costs, and configuration
2. **utils.js** - Added utility functions for all new API operations with RAM dodging
3. **worker.js** - Enhanced with phishing integration and improved exploration
4. **collector.js** - Added phishing and cache collection integration
5. **stasis.js** - Updated with proper `setStasisLink()` functionality
6. **darknet-manager.js** - Full coordination of all Darknet operations

## API Functions Implemented

### Phishing Operations
- `phishingAttack(ns, server, threads)` - Execute phishing attacks
- `runPhishingAttack(ns)` - Simple phishing attack wrapper
- `canPhish(ns)` - Check if phishing is viable

### Heartbleed Operations
- `heartbleed(ns, host, peek)` - Extract server logs for clues
- `getAuthClues(ns, host)` - Parse authentication hints from logs

### Stasis Operations
- `setStasisLink(ns)` - Create stasis link on current server
- `getStasisLinkedServers(ns)` - List all stasis-linked servers
- `getStasisLinkLimit(ns)` - Get maximum stasis links available

### Migration Operations
- `induceServerMigration(ns, target)` - Induce migration on target server
- `forceServerMigration(ns, target, charges)` - Force migration with multiple charges

### Stock Operations
- `promoteStock(ns, symbol)` - Increase stock volatility
- `getStockInfo(ns, symbol)` - Get stock information
- `getPortfolio(ns)` - Get player's stock portfolio

## RAM Optimization

All API functions with RAM costs > 0.0 GB use file-based RAM dodging via `getNsDataThroughFile()`:

- `probeServers()`: 0.1 GB → ✅ Optimized
- `getServerDetails()`: 0.1 GB → ✅ Optimized
- `authenticate()`: 0.1 GB → ✅ Optimized (updated)
- `heartbleed()`: 0.1 GB → ✅ Optimized
- `setStasisLink()`: 0.1 GB → ✅ Optimized
- `getStasisLinkedServers()`: 0.1 GB → ✅ Optimized
- `openCache()`: 0.1 GB → ✅ Optimized
- `memoryReallocation()`: 0.2 GB → ✅ Optimized
- `promoteStock()`: 0.2 GB → ✅ Optimized
- `induceServerMigration()`: 0.3 GB → ✅ Optimized

Low/zero RAM functions (0.0 GB) call API directly:
- `phishingAttack()`: 0.0 GB → ✅ Direct call
- `connectToSession()`: 0.0 GB → ✅ Direct call
- `getStasisLinkLimit()`: 0.0 GB → ✅ Direct call

## Features Added

### Phishing Module (phishing.js)
- Automatic phishing attacks on current server
- Statistics tracking (successes, earnings, cache files)
- Integration with cache opening
- Configurable cooldowns and targets
- Command-line configuration

### Migration Explorer (migration-explorer.js)
- Force server migrations to explore disconnected networks
- Network mapping and discovery
- Configurable migration charges and cooldowns
- Automatic exploration of new connections
- Statistics and reporting

### Stock Promoter (stock-promoter.js)
- Increase stock volatility for higher profits
- Monitor and maintain target volatility levels
- Support for all available stock symbols
- Batch processing for efficiency
- Statistics and reporting

### Enhanced Worker (worker.js)
- Multiple operating modes (explore, phish, collect, all, auto)
- Phishing integration with thread management
- Automatic spreading to new servers
- Memory reallocation support
- Cache file collection
- Comprehensive error handling

### Enhanced Collector (collector.js)
- Phishing attacks on discovered servers
- Cache file opening and collection
- Automatic server discovery
- Parallel processing with configurable concurrency
- Statistics tracking

### Enhanced Stasis (stasis.js)
- Proper `setStasisLink()` implementation
- Session management before stasis linking
- Error handling and validation
- Integration with existing stasis network

### Enhanced Manager (darknet-manager.js)
- Coordination of all Darknet operations
- Worker management with auto-restart
- Statistics collection from all modules
- Configurable module enable/disable
- Comprehensive reporting

## Bug Fixes

1. **Function Name Inconsistencies**: Fixed `authenticate` vs `authenticateServer`, `heartbleed` vs `heartbleedServer`
2. **RAM Optimization**: Updated `authenticate()` to use file-based dodging
3. **Import Consistency**: Standardized utility function imports across all files
4. **API Namespace**: Confirmed all functions use `ns.dnet.*` namespace
5. **Error Handling**: Enhanced error handling in all new functions

## Configuration Updates

### protocol.js
- Added RAM costs for all new API functions
- Updated script RAM estimates
- Added new ports for inter-script communication
- Added new log files and constants

### RAM Costs (Updated to Official Values)
```javascript
// New API operations (from official Bitburner Darknet API docs)
phishingAttack: 0.0,      // Low/none RAM cost per docs
heartbleed: 0.1,         // 0.1 GB per docs
setStasisLink: 0.1,      // 0.1 GB per docs
getStasisLinkLimit: 0.0, // Sync, no RAM cost
induceServerMigration: 0.3, // 0.3 GB per docs
getStasisLinkedServers: 0.1, // 0.1 GB per docs
promoteStock: 0.2,       // 0.2 GB per docs
```

## Usage Examples

### Start Complete Darknet Framework
```bash
run darknet/darknet-manager.js --explore --phish --stasis --migrate --stock
```

### Run Phishing on Current Server
```bash
run darknet/phishing.js --reportPort 10152 --cooldown 15000
```

### Explore via Migration
```bash
run darknet/migration-explorer.js --target server-name --charges 10
```

### Promote Stock Volatility
```bash
run darknet/stock-promoter.js --symbol FULCRUM --targetVolatility 10
```

### Run Worker in Auto Mode
```bash
run darknet/worker.js --mode auto --threads 5 --ram 1.0 --autoSpread
```

## Statistics and Reporting

All modules support reporting via ports:
- Explorer: Port 10151
- Phishing: Port 10152
- Stasis: Port 10153
- Migration: Port 10154
- Stock: Port 10155
- Manager: Port 10150

Statistics include:
- Operation counts (successes, failures)
- Earnings (money, cache files)
- Performance metrics (times, throughput)
- Resource usage (RAM, servers)

## Backward Compatibility

All existing functionality remains intact:
- Server exploration and authentication
- Cache file collection
- Memory reallocation
- Worker spreading
- Statistics tracking

New features are additive and don't break existing workflows.

## Testing

All files have been validated:
- ✅ Basic syntax check (brace matching)
- ✅ Import/export consistency
- ✅ Function naming consistency
- ✅ Error handling present
- ✅ RAM optimization applied where needed

## Next Steps

The framework is now complete with all official Darknet API functions implemented. Future enhancements could include:

1. Advanced password solving algorithms
2. Automated stock trading strategies
3. Enhanced network visualization
4. Performance benchmarking
5. Integration with other Bitburner systems

## Version History

- **v2.1.0** (Current): Complete API integration with all official functions
- **v2.0.0**: Initial modular framework with exploration and collection
- **v1.0.0**: Basic Darknet exploration and authentication

---

**Generated**: 2025-01-11  
**Author**: Senior Automation Engineer (Bitburner Framework)  
**Status**: Complete - All official API functions implemented and optimized
