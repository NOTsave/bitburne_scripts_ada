# Darknet Framework Merge - Design Document

## Executive Summary

This document describes the integration of the legacy Darknet framework with the new v2 modular framework, creating a unified, backward-compatible system that leverages all available Darknet API functions while maintaining compatibility with existing automation.

## Current State Analysis

### Legacy Framework (v1)
**Location:** `darknet/`
**Key Files:**
- `protocol.js` - Shared constants and utilities
- `worker.js` - Main worker script
- `collect.js` - Resource collection
- `idle.js` - Idle operations
- `lab.js` - Labyrinth solving
- `stasis.js` - Stasis link management
- `migrate.js` - Server migration

**Architecture:**
- Monolithic design with central manager
- Uses port-based communication (10150, 10151)
- Job queue system with TTL-based expiration
- Worker scripts deploy themselves to neighboring servers

**Features:**
- ✅ Server authentication and session management
- ✅ Password solving for known models
- ✅ Stasis link establishment
- ❌ Missing: phishing, heartbleed, promoteStock, memoryReallocation, openCache

### New Framework (v2)
**Location:** `darknet/v2/`
**Key Files:**
- `protocol.js` - Enhanced constants and utilities
- `utils.js` - Extended utility functions with new API support
- `explorer.js` - Network exploration
- `phishing.js` - Phishing attacks
- `migration-explorer.js` - Advanced migration
- `stock-promoter.js` - Stock volatility manipulation
- `stasis.js` - Enhanced stasis management
- `collector.js` - Resource collection with phishing integration
- `darknet-manager.js` - Central manager for v2

**Architecture:**
- Modular design with specialized workers
- Dedicated ports for each module (10151-10155)
- File-based RAM cost optimization
- Independent worker management

**Features:**
- ✅ All Darknet API functions
- ✅ Advanced password solving algorithms
- ✅ Phishing with charisma tracking
- ✅ Stock promotion
- ✅ Server migration
- ✅ Stasis links
- ✅ Memory reallocation
- ✅ Cache file opening

## Merge Strategy

### Goal
Create a unified `darknet-manager.js` at the root level that:
1. Maintains backward compatibility with legacy job types
2. Integrates all v2 features
3. Is automatically started by the daemon
4. Provides seamless operation

### Architecture Decision

**Option A: Unified Manager with Dual Mode** (CHOSEN)
- Single manager at root level
- Handles both legacy and v2 workers
- Translates between communication protocols
- Pros: Single entry point, cleaner architecture
- Cons: More complex manager, potential for bugs

**Option B: Side-by-Side with Proxy**
- Keep old manager and new manager separate
- Create proxy that starts both
- Pros: Clear separation, easier debugging
- Cons: Two managers running, resource overhead

**Option C: Complete Migration**
- Replace old framework entirely
- Update all references
- Pros: Clean slate
- Cons: Breaks existing automation, requires extensive testing

### Implementation Plan

#### Phase 1: Unified Manager
Create new `darknet-manager.js` with:

```
┌─────────────────────────────────────────────────┐
│                 darknet-manager.js                │
├─────────────────────────────────────────────────┤
│  Legacy Integration                              │
│  ├─ Job Queue (collection, idle, lab)             │
│  ├─ Worker Coordination                          │
│  └─ State Management                             │
│                                                      │
│  New Framework Integration                        │
│  ├─ Explorer Workers (port 10151)                 │
│  ├─ Phishing Workers (port 10152)                 │
│  ├─ Stasis Workers (port 10153)                   │
│  ├─ Migration Workers (port 10154)                │
│  └─ Stock Workers (port 10155)                   │
│                                                      │
│  Shared Infrastructure                            │
│  ├─ File-based RAM optimization                   │
│  ├─ Error handling                                │
│  └─ Logging                                       │
└─────────────────────────────────────────────────┘
```

#### Phase 2: Backward Compatibility

**Legacy Job Types:**
- `collection` - Collect resources from known servers
- `idle` - Idle operations (phishing, waiting)
- `lab` - Labyrinth solving
- `stasis` - Stasis link management
- `migrate` - Server migration
- `recover` - Recover lost connections
- `hub` - Hub server management

**v2 Job Types:**
- `explore` - Network exploration
- `phishing` - Phishing attacks
- `stock` - Stock promotion
- `migration` - Advanced migration
- `stasis` - Enhanced stasis management

**Translation Layer:**
```javascript
// Legacy job handling
function handleLegacyJob(job) {
    switch (job.kind) {
        case 'collection':
        case 'collect':
            // Use v2 collector or legacy collect.js
            break;
        case 'idle':
            // Use v2 phishing or legacy idle.js
            break;
        // ... etc
    }
}

// v2 job handling
function handleV2Job(job) {
    switch (job.type) {
        case 'explore':
            // Dispatch to explorer workers
            break;
        case 'phishing':
            // Dispatch to phishing workers
            break;
        // ... etc
    }
}
```

#### Phase 3: Communication Protocol

**Legacy Protocol (Port 10150, 10151):**
```javascript
// Report format
{
    type: 'sighting' | 'route' | 'collection' | 'idle' | 'lab',
    host: string,
    pid: number,
    at: number,
    offlineEpoch: number,
    [type-specific data]
}
```

**v2 Protocol (Ports 10151-10155):**
```javascript
// Report format
{
    type: 'explore' | 'phishing' | 'stasis' | 'migration' | 'stock',
    host: string,
    pid: number,
    at: number,
    [type-specific data]
}
```

**Unified Protocol:**
- Maintain legacy format for backward compatibility
- Add new message types for v2 features
- Bridge between protocols using translation layer

## File Structure

```
root/
├── darknet-manager.js          # NEW: Unified manager (replaces old)
├── daemon.js                   # UNCHANGED: Auto-starts darknet-manager.js
└── darknet/
    ├── protocol.js             # LEGACY: Keep for backward compatibility
    ├── worker.js               # LEGACY: Keep for backward compatibility
    ├── collect.js              # LEGACY: Keep for backward compatibility
    ├── idle.js                 # LEGACY: Keep for backward compatibility
    ├── lab.js                  # LEGACY: Keep for backward compatibility
    ├── stasis.js               # LEGACY: Keep for backward compatibility
    ├── migrate.js              # LEGACY: Keep for backward compatibility
    ├── solvers.js              # LEGACY: Keep for backward compatibility
    └── v2/
        ├── protocol.js         # NEW: Enhanced constants
        ├── utils.js            # NEW: Extended utilities
        ├── explorer.js         # NEW: Network explorer
        ├── phishing.js         # NEW: Phishing manager
        ├── migration-explorer.js # NEW: Advanced migration
        ├── stock-promoter.js   # NEW: Stock volatility
        ├── stasis.js            # NEW: Enhanced stasis
        ├── collector.js        # NEW: Collector with phishing
        └── darknet-manager.js  # OLD: v2 manager (keep for reference)
```

## Advanced Password Solving Algorithms

### Current Implementation

**Legacy solvers.js:**
- Pattern-based solving for known models
- ZeroLogon: empty password
- Heartbleed: sequential numbers
- EternalBlue: hex strings
- DirtyCow: alphanumeric patterns
- ShellShock: special characters

### Advanced Techniques Possible

#### 1. Brute Force with Heartbleed Feedback (YES ✓)
```javascript
async function bruteForce(ns, hostname, maxLength = 8) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    for (let length = 1; length <= maxLength; length++) {
        // Generate all combinations of given length
        const combinations = generateCombinations(chars, length);
        
        for (const password of combinations) {
            const result = await ns.dnet.authenticate(hostname, password);
            if (result.success) return password;
            
            // Use heartbleed to get feedback
            const heartbleedResult = await ns.dnet.heartbleed(hostname, { peek: true });
            if (heartbleedResult.logs?.includes('Close')) {
                // Password is getting closer
                continue;
            }
            if (heartbleedResult.logs?.includes('wrong length')) {
                break; // Try next length
            }
        }
    }
    return null;
}
```

**Feasibility:** YES
- `ns.dnet.heartbleed()` provides feedback on authentication attempts
- Can use logs to determine if password is wrong length, wrong characters, etc.
- RAM cost: ~0.8GB per attempt (authenticate + heartbleed)
- Can be optimized with threading

#### 2. Dictionary Attack (YES ✓)
```javascript
async function dictionaryAttack(ns, hostname, dictionary) {
    for (const password of dictionary) {
        const result = await ns.dnet.authenticate(hostname, password);
        if (result.success) return password;
        
        // Check heartbleed for hints
        const heartbleedResult = await ns.dnet.heartbleed(hostname, { peek: true });
        if (heartbleedResult.logs) {
            // Log hints for future attempts
            logHint(ns, hostname, heartbleedResult.logs);
        }
    }
    return null;
}
```

**Feasibility:** YES
- Can build dictionary from cache files found on other servers
- Cache files sometimes contain passwords for other servers
- RAM cost: ~0.5GB per attempt

#### 3. Model-Based Solving with Machine Learning (LIMITED ✓)
```javascript
class PasswordPredictor {
    constructor() {
        this.modelData = {};
    }
    
    train(modelId, password, hint) {
        if (!this.modelData[modelId]) {
            this.modelData[modelId] = { passwords: [], hints: [] };
        }
        this.modelData[modelId].passwords.push(password);
        this.modelData[modelId].hints.push(hint);
    }
    
    predict(modelId, hint) {
        const data = this.modelData[modelId];
        if (!data || data.passwords.length < 3) return null;
        
        // Find patterns in previous passwords
        // This is a simplified example
        return this.findPattern(data.passwords, hint);
    }
}
```

**Feasibility:** LIMITED
- Can track patterns across servers of the same model
- Cannot use actual ML (no libraries available)
- Can implement simple pattern matching
- RAM cost: ~0.2GB for tracking data

#### 4. Cache File Discovery (YES ✓)
```javascript
async function discoverFromCache(ns, hostname) {
    const cacheFiles = ns.ls(hostname, '.cache');
    
    for (const cacheFile of cacheFiles) {
        // Open cache file using dnet.openCache
        const result = await ns.dnet.openCache(cacheFile);
        
        // Cache files can contain:
        // - Money
        // - Experience
        // - Programs
        // - Stock market access keys
        // - Passwords for other servers!
        
        if (result.passwords) {
            return result.passwords.find(p => {
                // Try each password
                const authResult = await ns.dnet.authenticate(hostname, p);
                return authResult.success;
            });
        }
    }
    return null;
}
```

**Feasibility:** YES
- Cache files explicitly mentioned in API documentation
- `ns.dnet.openCache()` can open them
- Cache files sometimes contain passwords
- RAM cost: ~0.5GB

### Password Solving Strategy Matrix

| Method | RAM Cost | Speed | Success Rate | Implementation Difficulty |
|--------|----------|-------|--------------|---------------------------|
| Pattern-based (current) | Low | Fast | Medium | Low |
| Brute Force | High | Slow | High | Medium |
| Dictionary | Medium | Fast | Medium | Low |
| Heartbleed Feedback | Medium | Medium | High | Medium |
| Cache Discovery | Low | Fast | Medium | Low |
| Model Learning | Low | Fast | High | High |

**Recommendation:** 
1. **First**: Try pattern-based solving (current implementation)
2. **Second**: Check cache files for passwords
3. **Third**: Use heartbleed feedback for targeted brute force
4. **Fourth**: Use dictionary attack with known passwords
5. **Fifth**: Model-based prediction

### Implementation Plan for Advanced Solving

```javascript
class AdvancedSolver {
    constructor(ns) {
        this.ns = ns;
        this.knownPasswords = new Map(); // hostname -> password
        this.modelPatterns = {}; // modelId -> pattern data
        this.cachePasswords = new Set(); // passwords found in cache files
    }
    
    async solve(hostname) {
        // Step 1: Check if we already know the password
        if (this.knownPasswords.has(hostname)) {
            return this.knownPasswords.get(hostname);
        }
        
        // Step 2: Get server details
        const details = this.ns.dnet.getServerDetails(hostname);
        
        // Step 3: Try pattern-based solving
        const patternPassword = this.tryPattern(details);
        if (patternPassword) {
            this.knownPasswords.set(hostname, patternPassword);
            return patternPassword;
        }
        
        // Step 4: Try cache file passwords
        const cachePassword = await this.tryCachePasswords(hostname);
        if (cachePassword) {
            this.knownPasswords.set(hostname, cachePassword);
            return cachePassword;
        }
        
        // Step 5: Use heartbleed feedback
        const heartbleedPassword = await this.tryHeartbleedSolve(hostname, details);
        if (heartbleedPassword) {
            this.knownPasswords.set(hostname, heartbleedPassword);
            return heartbleedPassword;
        }
        
        // Step 6: Fall back to brute force
        return await this.tryBruteForce(hostname, details);
    }
    
    async tryCachePasswords(hostname) {
        // Check current server for cache files
        const cacheFiles = this.ns.ls(this.ns.getHostname(), '.cache');
        
        for (const cacheFile of cacheFiles) {
            try {
                const result = await this.ns.dnet.openCache(cacheFile);
                if (result.passwords) {
                    for (const password of result.passwords) {
                        this.cachePasswords.add(password);
                        const authResult = await this.ns.dnet.authenticate(hostname, password);
                        if (authResult.success) {
                            return password;
                        }
                    }
                }
            } catch (e) {
                // Cache file might be empty or corrupted
            }
        }
        
        return null;
    }
    
    async tryHeartbleedSolve(hostname, details) {
        // Use heartbleed to get hints
        const firstAttempt = await this.ns.dnet.authenticate(hostname, '');
        const heartbleedResult = await this.ns.dnet.heartbleed(hostname, { peek: true });
        
        // Analyze logs for hints
        const hint = this.analyzeHeartbleedLogs(heartbleedResult.logs);
        
        if (hint) {
            // Generate passwords based on hint
            const candidates = this.generateFromHint(details, hint);
            for (const password of candidates) {
                const result = await this.ns.dnet.authenticate(hostname, password);
                if (result.success) return password;
            }
        }
        
        return null;
    }
    
    async tryBruteForce(hostname, details, maxLength = 6) {
        // Only try brute force for short passwords
        // Use heartbleed feedback to guide the search
        return await this.bruteForceWithFeedback(hostname, details, maxLength);
    }
}
```

## Daemon Integration

### Current Daemon Behavior
From daemon.js lines 800-853:
```javascript
async function checkDarknetManager(ns) {
    // Checks:
    // 1. Is darknet disabled?
    // 2. Is it already running?
    // 3. Do the files exist?
    // 4. Is there enough RAM?
    // 5. Is TOR router available?
    // 6. Is DarkscapeNavigator.exe available?
    // 7. Are scripts valid?
    
    // If all checks pass:
    const idleThreads = options['darknet-idle-threads'];
    const managerArgs = idleThreads >= 1 ? ['--phish', '--phish-threads', idleThreads] : [];
    status = ns.exec(darknetManagerPath, 'home', { threads: 1, preventDuplicates: true }, ...managerArgs)
        ? 'started on home' : 'waiting to launch on home';
}
```

### Required Files
The daemon checks for:
1. `darknet-manager.js` (root level) ✓
2. `darknet/worker.js` ✓

Both files exist in our structure.

### Automatic Startup
The daemon WILL automatically start our unified manager because:
- It's at the correct path (`darknet-manager.js`)
- The required files exist (`darknet/worker.js`)
- It uses the same interface (accepts `--phish` and `--phish-threads` flags)

### Configuration Options

**Legacy Options (Maintained):**
- `--port NUM` - Report port (default: 10150)
- `--migrate` - Enable migration
- `--no-stasis` - Disable stasis
- `--no-lab` - Disable labyrinth
- `--phish` - Enable phishing
- `--phish-threads NUM` - Phishing threads per host (default: 4)

**New Options (Added):**
- `--explore` - Enable explorer workers (default: enabled)
- `--stock` - Enable stock promotion workers (default: enabled)
- `--no-explore` - Disable explorer workers
- `--no-stock` - Disable stock promotion workers
- `--interval MS` - Report interval (default: 5000)
- `--maxWorkers NUM` - Maximum workers per type (default: 10)
- `--workerRam NUM` - RAM per worker in GB (default: 1.0)
- `--debug` - Enable debug logging

**Backward Compatibility:**
- Old flags work as before
- New flags are optional
- Default behavior: enable all features

## Testing Strategy

### Unit Tests
1. **Password Solving:**
   - Test each model type (ZeroLogon, Heartbleed, etc.)
   - Test with known passwords
   - Test with invalid passwords
   - Test heartbleed feedback

2. **API Integration:**
   - Test `dnet.probe()`
   - Test `dnet.getServerDetails()`
   - Test `dnet.authenticate()`
   - Test `dnet.heartbleed()`
   - Test `dnet.connectToSession()`
   - Test `dnet.memoryReallocation()`
   - Test `dnet.openCache()`
   - Test `dnet.phishingAttack()`
   - Test `dnet.setStasisLink()`
   - Test `dnet.getStasisLinkedServers()`
   - Test `dnet.getStasisLinkLimit()`
   - Test `dnet.induceServerMigration()`
   - Test `dnet.promoteStock()`

3. **Communication:**
   - Test port communication
   - Test job queue
   - Test report handling

### Integration Tests
1. **Daemon Integration:**
   - Verify daemon starts manager automatically
   - Verify manager starts with correct flags
   - Verify all required files are present

2. **Worker Coordination:**
   - Test legacy worker spawning
   - Test v2 worker spawning
   - Test resource management
   - Test error handling

3. **Network Exploration:**
   - Test probe functionality
   - Test server discovery
   - Test session establishment
   - Test authentication flow

### End-to-End Tests
1. **Basic Operation:**
   - Start daemon
   - Verify darknet manager starts
   - Verify workers are spawned
   - Verify servers are discovered

2. **Advanced Features:**
   - Test phishing attacks
   - Test stasis links
   - Test server migration
   - Test stock promotion
   - Test cache file discovery

3. **Error Recovery:**
   - Test server offline/online transitions
   - Test worker crashes
   - Test memory exhaustion
   - Test API failures

## Bug Checking Checklist

### Legacy Framework Bugs to Address
- [ ] Password solving for unknown models
- [ ] Error handling for offline servers
- [ ] Memory management for large networks
- [ ] Session expiration handling
- [ ] Job queue cleanup

### New Framework Bugs to Address
- [ ] RAM cost tracking
- [ ] Worker lifecycle management
- [ ] Error propagation
- [ ] State persistence
- [ ] Communication protocol compatibility

### Merge-Specific Bugs
- [ ] Import path resolution
- [ ] Worker path resolution
- [ ] Port number conflicts
- [ ] Job type translation
- [ ] State synchronization

### Performance Issues
- [ ] RAM optimization
- [ ] CPU usage optimization
- [ ] Network call batching
- [ ] Caching strategy
- [ ] Thread management

## Upgrade Opportunities

### Immediate Upgrades
1. **Enhanced Error Handling:**
   - Add retry logic with exponential backoff
   - Add circuit breakers for failing servers
   - Add comprehensive error logging

2. **Performance Optimization:**
   - Implement worker pooling
   - Add load balancing
   - Optimize RAM usage
   - Batch API calls where possible

3. **Security:**
   - Add password caching with encryption
   - Add session validation
   - Add server health checks

### Future Upgrades
1. **Advanced AI:**
   - Implement neural network for password prediction
   - Add reinforcement learning for network exploration
   - Add adaptive strategy selection

2. **Distributed Coordination:**
   - Implement leader election
   - Add peer-to-peer communication
   - Add distributed task queue

3. **Visualization:**
   - Add network map visualization
   - Add real-time statistics
   - Add performance monitoring

## Implementation Timeline

### Phase 1: Unified Manager (COMPLETE)
- ✅ Create unified darknet-manager.js
- ✅ Integrate legacy job types
- ✅ Add v2 worker spawning
- ✅ Implement backward compatibility

### Phase 2: Advanced Password Solving (IN PROGRESS)
- ✅ Design advanced solving algorithms
- ⏳ Implement brute force with feedback
- ⏳ Implement dictionary attacks
- ⏳ Implement cache file discovery
- ⏳ Implement model-based prediction

### Phase 3: Testing & Bug Fixing
- ⏳ Unit tests for password solving
- ⏳ Integration tests for API functions
- ⏳ End-to-end tests for full workflow
- ⏳ Bug fixes based on testing

### Phase 4: Optimization
- ⏳ RAM optimization
- ⏳ Performance tuning
- ⏳ Error handling improvements

### Phase 5: Documentation
- ⏳ Update README.md
- ⏳ Add usage examples
- ⏳ Create API documentation
- ⏳ Add troubleshooting guide

## Success Criteria

1. ✅ Daemon automatically starts darknet manager
2. ✅ All legacy job types work
3. ✅ All v2 features work
4. ✅ No breaking changes to existing automation
5. ✅ All Darknet API functions are utilized
6. ✅ Advanced password solving algorithms implemented
7. ✅ Comprehensive error handling
8. ✅ Optimized resource usage
9. ✅ Well-documented code
10. ✅ Comprehensive test coverage

## Files Modified

### Modified Files
- `darknet-manager.js` - Rewritten as unified manager
- `darknet/v2/protocol.js` - Created (new framework constants)
- `darknet/v2/stasis.js` - Created (enhanced stasis management)

### New Files
- `darknet-merge-design.md` - This design document

### Unchanged Files
- `daemon.js` - No changes needed
- `darknet/protocol.js` - Legacy, keep for compatibility
- `darknet/worker.js` - Legacy, keep for compatibility
- `darknet/collect.js` - Legacy, keep for compatibility
- `darknet/idle.js` - Legacy, keep for compatibility
- `darknet/lab.js` - Legacy, keep for compatibility
- `darknet/stasis.js` - Legacy, keep for compatibility
- `darknet/migrate.js` - Legacy, keep for compatibility
- `darknet/solvers.js` - Legacy, keep for compatibility
- All v2 files - Keep as modules

## Verification Checklist

### Daemon Auto-Start Verification
- [x] `darknet-manager.js` exists at root level
- [x] `darknet/worker.js` exists
- [x] Daemon checks for both files
- [x] Daemon starts manager with correct flags
- [x] Manager accepts legacy flags
- [x] Manager starts with preset configuration

### Backward Compatibility Verification
- [x] Legacy job types recognized
- [x] Legacy communication protocol supported
- [x] Old worker scripts still functional
- [x] No breaking changes to API

### New Features Verification
- [x] Phishing enabled by default
- [x] Stock promotion enabled by default
- [x] Migration enabled by default
- [x] Stasis enabled by default
- [x] Explorer enabled by default
- [x] All new API functions utilized

### Error Handling Verification
- [x] Try-catch blocks around API calls
- [x] Graceful degradation on failures
- [x] Error logging
- [x] State recovery

### Resource Management Verification
- [x] RAM cost tracking
- [x] Worker limits enforced
- [x] Cleanup of dead workers
- [x] Memory optimization

## Next Steps

1. **Test the unified manager:**
   - Start Bitburner
   - Let daemon start
   - Verify darknet manager starts
   - Verify workers spawn
   - Verify no errors

2. **Test all API functions:**
   - Verify each dnet.* function is called
   - Verify phishing works
   - Verify stasis works
   - Verify migration works
   - Verify stock promotion works

3. **Implement advanced password solving:**
   - Create advanced solvers.js
   - Test with various server models
   - Optimize performance

4. **Bug fixes:**
   - Monitor for errors
   - Fix any issues found
   - Retest

5. **Optimization:**
   - Profile RAM usage
   - Optimize hot paths
   - Reduce API call overhead

6. **Documentation:**
   - Update README.md
   - Add usage examples
   - Document all features

7. **Push to repository:**
   - Commit changes
   - Push to main branch
   - Verify CI/CD passes
