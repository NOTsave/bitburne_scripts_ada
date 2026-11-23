# Darknet Automation Framework

A production-grade Darknet automation system for Bitburner with comprehensive server discovery, authentication, and resource collection.

## 📁 File Structure

```
darknet/
├── darknet-manager.js    # Main manager script (run this first)
├── protocol.js           # Constants, ports, and shared configuration
├── solvers.js            # Puzzle solving algorithms for all known models
├── utils.js              # Utility functions for Darknet operations
├── worker.js             # Worker script that runs on each server
├── collector.js          # Cache and file collection handler
├── stasis.js             # Stasis network management
├── migrate.js            # Server migration handler
├── explorer.js           # Server exploration and discovery
└── README.md             # This file
```

## 🚀 Quick Start

### Basic Usage

Start the Darknet manager on your home server:

```bash
run darknet/darknet-manager.js
```

### Advanced Usage

```bash
# Run with custom port
run darknet/darknet-manager.js --port 20000

# Run without Stasis network management
run darknet/darknet-manager.js --no-stasis

# Run with migration enabled
run darknet/darknet-manager.js --migrate

# Run with debug logging
run darknet/darknet-manager.js --enable-logging

# Show help
run darknet/darknet-manager.js --help
```

## ⚙️ Configuration

The manager uses sensible defaults, but you can customize behavior through:

### Command-Line Arguments

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--port` | number | 10150 | Port number for communication |
| `--reserve` | number | null | Reserve this much cash |
| `--continuous` | boolean | true | Run continuously |
| `--enable-logging` | boolean | false | Enable verbose logging |
| `--no-stasis` | boolean | false | Disable Stasis network management |
| `--migrate` | boolean | false | Enable server migration |

### Internal Configuration

Edit `protocol.js` to change default settings:

```javascript
export const DARKNET_CONFIG = {
    checkInterval: 30_000,        // Server check interval (ms)
    minFunds: 100e6,              // Minimum funds before interacting
    maxSpendPercent: 0.05,        // Max 5% of funds per cycle
    reputationThreshold: 0.8,     // Contract success rate threshold
    autoAcceptContracts: true,    // Auto-accept profitable contracts
    enableDebugLogs: false,       // Enable debug logging
    // ...
};
```

## 🔍 Features

### Server Discovery
- **Automatic probing** of nearby Darknet servers
- **Recursive exploration** through the network
- **Stasis network detection** and management
- **Real-time server tracking**

### Puzzle Solving
Comprehensive support for all known Darknet puzzle types:

| Puzzle Type | Description | Solver Status |
|-------------|-------------|---------------|
| ZeroLogon | Empty password | ✅ Solved |
| FreshInstall_1.0 | Default credentials | ✅ Solved |
| DeskMemo_3.1 | Password hints | ✅ Solved |
| BellaCuore | Roman numerals | ✅ Solved |
| 110100100 | Binary bytes | ✅ Solved |
| CloudBlare(tm) | Extract digits | ✅ Solved |
| OctantVoxel | Base conversion | ✅ Solved |
| PHP 5.4 | Digit permutations | ✅ Solved |
| AccountsManager_4.2 | Single digit | ✅ Solved |
| Laika4 | Dog names | ✅ Solved |

### Authentication
- **Automatic authentication** with all solvable servers
- **Session management** for servers with existing sessions
- **Multi-answer support** for puzzles with multiple solutions
- **RAM-optimized** authentication process

### Resource Collection
- **Automatic cache collection** from all accessible servers
- **File collection** (`.lit`, `.txt`) from Darknet servers
- **Reward tracking** for collected caches
- **Statistics** on collected resources

### Network Management
- **Stasis network** creation and maintenance
- **Server migration** between network nodes
- **Worker deployment** to discovered servers
- **Load balancing** across the network

### Monitoring & Logging
- **Comprehensive logging** with different levels (error, warning, info, debug)
- **State persistence** across script restarts
- **Metrics collection** for monitoring
- **Error tracking** and recovery

## 📊 Status & Metrics

Get current Darknet status:

```javascript
// From another script
import { getDarknetSummary } from 'darknet/darknet-manager.js';

const status = await getDarknetSummary(ns);
ns.tprint(`Darknet: ${status.connected ? 'Connected' : 'Disconnected'}`);
ns.tprint(`Servers: ${status.serversDiscovered}`);
ns.tprint(`Stasis Links: ${status.stasisLinks}`);
ns.tprint(`Caches Collected: ${status.cachesCollected}`);
```

## 🔧 RAM Optimization

The framework uses several techniques to minimize RAM usage:

1. **File-based API calls** - All `ns.dnet.*` calls use file-based communication
2. **Batching** - Operations are batched to reduce API call overhead
3. **Lazy loading** - Server details are cached and only refreshed when needed
4. **Worker threads** - Configurable thread counts based on available RAM
5. **Clean shutdown** - Resources are properly released on exit

**Base RAM usage**: ~1.6GB (manager) + ~0.8GB per worker

## 🛠️ Development

### Adding New Puzzle Solvers

1. Add the puzzle model ID to `KNOWN_MODELS` in `protocol.js`
2. Implement the solver in `solvers.js`
3. Add test cases for the new solver

Example:

```javascript
// In solvers.js
function solveNewPuzzle(details) {
    // Your solving logic here
    return answer;
}

// In puzzleCandidates()
case "NewPuzzleModel":
    return [solveNewPuzzle(details)];
```

### Adding New Features

1. Create a new module in the `darknet/` folder
2. Import required utilities from `protocol.js` and `utils.js`
3. Export your functions
4. Update the manager to use your new feature

### Testing

The framework includes basic error handling and logging. For testing:

```bash
# Run with debug logging
run darknet/darknet-manager.js --enable-logging

# Check logs
tail darknet-manager.log
```

## 🐛 Troubleshooting

### Common Issues

**"Darknet API not available"**
- Ensure you have the required SourceFile or BitNode
- Verify DarkscapeNavigator.exe exists on home
- Check that you're running the latest version of Bitburner

**"Insufficient RAM"**
- The manager needs ~1.6GB to start
- Workers need ~0.8GB each
- Free up RAM on home server before starting

**"No servers discovered"**
- Ensure you're in a location with Darknet access
- Check that you have DarkscapeNavigator.exe
- Wait for servers to spawn (may take time)

**"Authentication failed"**
- Some puzzle types may not be supported yet
- Check the puzzle model in the logs
- Consider adding support for the new puzzle type

### Debug Mode

Enable debug logging for detailed information:

```bash
run darknet/darknet-manager.js --enable-logging
```

This will show:
- Server discovery events
- Authentication attempts
- Cache collection
- Network operations
- Error details

## 📝 Changelog

### v2.0.0 (Current)
- ✅ **Complete rewrite** with proper `ns.dnet` API support
- ✅ **Comprehensive puzzle solvers** for all known models
- ✅ **Stasis network management**
- ✅ **Cache collection automation**
- ✅ **Server migration** support
- ✅ **Production-grade error handling**
- ✅ **RAM optimization** throughout
- ✅ **State persistence**
- ✅ **Monitoring and metrics**

### v1.0.0 (Previous)
- ❌ Used incorrect `ns.darknet` API namespace
- ❌ Assumed unsupported contract/service APIs
- ❌ Missing core Darknet functionality

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## 🙏 Acknowledgments

- Bitburner development team for the amazing game
- Community contributors for puzzle solving research
- All testers and bug reporters

---

**Maintained by:** Senior Automation Engineer (Bitburner Framework)
**Version:** 2.0.0
**Last Updated:** 2024
