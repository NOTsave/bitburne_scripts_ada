# Darknet v2 Framework

## ⚠️ IMPORTANT: Do NOT run these files directly!

**All v2 files are modules used by the root-level `darknet-manager.js`.**

The daemon automatically starts `darknet-manager.js` at the **root level** (NOT in this v2/ folder).

## 📁 File Structure

```
root/
├── darknet-manager.js          ← MAIN ENTRY POINT (run this or let daemon start it)
└── darknet/
    ├── v2/
    │   ├── protocol.js         ← v2 constants (imported by v2 files)
    │   ├── utils.js            ← v2 utilities  
    │   ├── explorer.js         ← Network exploration
    │   ├── collector.js        ← Resource collection
    │   ├── migration-explorer.js ← Server migration
    │   ├── phishing.js         ← Phishing attacks
    │   ├── stasis.js           ← Stasis link management
    │   └── stock-promoter.js   ← Stock volatility
    └── worker.js              ← Legacy worker (required by daemon)
```

## 🚫 COMMON MISTAKES

**❌ DON'T run these:**
- `run darknet/v2/darknet-manager.js` ❌ (This file was removed)
- `run darknet/darknet-manager.js` ❌ (Doesn't exist)
- Any v2/ file directly ❌

**✅ DO run this:**
- `run darknet-manager.js` ✅ (Root level) OR let daemon start it automatically

## 🔧 For Developers

If you need to test v2 modules individually:
1. Use the root-level `darknet-manager.js` with appropriate flags
2. Or create a test script at root level that imports from `darknet/v2/`

Example:
```javascript
// test-explorer.js (at root level)
import { explore } from './darknet/v2/explorer.js';
export async function main(ns) {
    await explore(ns);
}
```

## 📦 Exports

All v2 modules export their main function and can be imported:
- `import { main as explore } from './darknet/v2/explorer.js'`
- `import { main as phish } from './darknet/v2/phishing.js'`
- etc.

## 🎯 Architecture

The v2 framework uses **modular design**:
- Each module has a dedicated port for communication
- Worker scripts run independently
- All coordinate through the root-level manager

Port assignments:
- Explorer: 10151
- Phishing: 10152
- Stasis: 10153
- Migration: 10154
- Stock: 10155
