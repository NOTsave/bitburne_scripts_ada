# Bitburner Corporation operator guide

This guide covers the Corporation manager for **Bitburner 3.0.1**, using Netscript 2.0 on `home`.

## What the three files do

| File | Job |
| --- | --- |
| [`corp.js`](./corp.js) | Runs the in-game corporation. It reads the current company, plans changes, and, with `--apply`, manages staffing, supplies, sales, expansion, product development and authorized funding actions. |
| [`corp-supervisor.js`](./corp-supervisor.js) | Starts one instance of `corp.js` and relaunches it if it exits. It reads the saved profile, checks free RAM, and waits 30 seconds between launch attempts after a failed attempt or low-RAM check. It can run by itself or as an augmentation reset callback. |
| [`corp-daemon.patch`](./corp-daemon.patch) | A Git patch for the fork’s existing `daemon.js`. It adds a Corporation-only startup mode and an optional Corporation task in the full daemon. In the full daemon, it also reserves home RAM for the manager and lets the existing RAM-upgrade task run when eligible. |

```text
Standalone route      corp-supervisor.js ──────────┐
Daemon route          daemon.js --corp-only ──────┤
                                                   └─ one corp.js on home
                                                       ├─ ns.corporation
                                                       └─ /Temp/corp-status.txt
```

## Start, inspect, and stop

1. Put `corp.js` and `corp-supervisor.js` at the root of `home`. The `launcher: "standalone"` route needs only those two scripts. The selected full-daemon route also needs the fork’s daemon, helpers and usual dependencies. With no profile file it uses automatic formation and supply selection, 32 GB headroom, and private funding and discretionary upgrades turned off. P5 capital management is automatic by default once its operating gates pass.
2. For a dry run before starting a supervisor, run `run corp.js --once` in the Bitburner terminal. It observes one full market cycle if a corporation is running. With no corporation, it keeps checking and reports formation eligibility. For a fixed number of settled observations, use `run corp.js --cycles 3`. Run these diagnostics when the live manager and its supervisor are stopped, since the manager guards against duplicate instances of the same filename.
3. Start one supervisor. Use `run corp-supervisor.js` for a standalone setup or `run daemon.js --corp-only` if the patch is already applied in the game. The supervisor passes `--apply` and enables product management, office care and the office ramp.
4. Check `ps` for one `corp.js` process, `free` for home memory, and `cat /Temp/corp-status.txt` for the live report. Use `mem corp.js` to remeasure RAM after changing the script. The P7 build measured **876.80 GB** in the real 3.0.1 game on November 22, 2026. With 32 GB of headroom, the supervisor requires **908.80 GB free**.
5. To stop or update the manager, use `ps` to find the process IDs, then `kill PID` for the supervisor first and `corp.js` second. The manager sweeps live purchase rates across managed divisions and cities and disables Smart Supply on exit. It also clears stale purchase rates before normal planning after a restart. Sales, Market-TA, and exports stay enabled, following the design’s shutdown rule. On restart it rebuilds its decisions from the game, including the current round and existing products. Offer and pricing observation windows fill again.

### Personal Steam setup

The saved file `corp-supervisor.config.txt` on `home` uses this profile.

```json
{
  "preset": "auto",
  "headroom": 32,
  "funding": "chain",
  "growth": "campaign",
  "supply": "manual",
  "scaling": true,
  "capital": "auto",
  "launcher": "daemon"
}
```

| Setting | Choices |
| --- | --- |
| `preset` | `auto` uses BN3 seed funding where eligible and self-funding outside BN3. `bn3` requires seed funding. `self-funded` requires $150b in player cash plus the configured player reserve. Every preset adopts an existing corporation. |
| `headroom` | Extra free home RAM in GB required for launch. Once the manager is running, the full daemon reserves only this extra amount for Corporation. The manager’s RAM is already in use. |
| `funding` | `off` evaluates offers without accepting them. `round1` authorizes Round 1. `chain` uses the chain projection for Rounds 1–2, then authorizes Round 3 under its regular gate. `all` authorizes the configured rounds. Round 4 needs a calibrated package. |
| `growth` | `off` skips discretionary upgrade ranking. `campaign` runs the targeted Tobacco advertising campaign. `ranked` enables the general bottleneck-based upgrade ranking. |
| `launcher` | `daemon` makes the argument-free callback attach to or start the full daemon; `standalone` directly supervises the worker. The selected Steam profile uses `daemon`. |
| `capital` | `auto` (default) enables guarded IPO, dividend policy and liquidity repair by new shares. `off` adds `--capital-off` for maintenance. Existing explicit `--ipo`, `--ipo-early`, `--equity` and `--dividend-rate` launch arguments remain available. |
| `scaling` | `true` adds `--scale-production`: guarded office scaling, continued demand upgrades, and automatic TA research after banking the full cost plus reserve. Defaults to `false` for an absent profile. It does not authorize IPO, equity, or another funding round. |
| `supply` | `manual` uses bounded purchase orders for shortages. `auto` can also use Smart Supply where the warehouse, imports, and budget qualify. |

Edit this file on `home` to change the profile. For standalone or Corporation-only supervision, restart the supervisor to load it. If `corp.js` is already running, the supervisor adopts that process with its original arguments. Restart the manager under supervision when you need the new arguments to take effect. Strategy amounts and division names live in the `CONFIG` object at the top of `corp.js`.

## How the manager works

It waits for market updates and reads the game’s upcoming phase through `nextState`. At the settled `START` it measures results and evaluates profitable expansion or financing. It sizes orders for `PURCHASE`, samples inputs before and after `PRODUCTION`, reconciles routes for `EXPORT`, and sets prices for `SALE`. Its plan and execution status are separate. A plan such as “Accept private funding round 3” means the gate passed. The active funding mode determines whether it can act.

- **Formation and agriculture.** The manager checks eligibility, starts or adopts the corporation, checks the required API unlocks, and establishes Agriculture in Sector-12. It supplies Water and Chemicals and sells Plants and Food. With the relevant operating flags it ramps the office and expands to Aevum and Tobacco as funds and operating conditions allow.
- **Tobacco.** The manager develops and prices products independently and can replace a weak product while keeping a proven seller. A product’s first managed price is market price, and a price probe backs off when inventory builds. Its Plants target includes products in development.
- **Exports and shortage fallback.** If Export is already owned, Sector-12 and Aevum share Tobacco’s remaining Plants deficit and available warehouse space. The next purchase tops up any shortfall after actual deliveries. The Round 3 package can buy the $20b unlock once Round 3 has settled and the price fits above the live reserve and an input allowance. In automatic mode, Tobacco waits for three qualifying export settlements before allowing Smart Supply with the leftovers policy. The existing Steam profile uses manual supply.
- **Funding and preservation.** The manager protects the greater of $5b, three cycles of operating expenses, or three days of current operating burn. It verifies each accepted round’s cash credit, share transfer and round advance. Round 3 budgets $36b for Export, demand upgrades, Agriculture boosts and research, with an offer benchmark of 0.5× settled valuation. Round 4 still samples quotes at 0.3× settled valuation while its package awaits calibration. Accepted rounds must cover their package and the reserve with actual cash and proceeds.
- **Public finances.** P5 capital actions are automatic by default, subject to the liquidity and operating gates below. The configured strategy deliberately ends private funding after Round 3 and uses a zero-share IPO. Dividends begin at zero for compounding. The policy can later pay 5% above $50b cash with sustained healthy operations, and returns to zero when those conditions fail. Optional share issuance repairs an actual reserve shortfall after cooldown; it does not sell CEO holdings. `--capital-off` pauses automatic capital actions. Dry-run mode leaves Corporation state untouched. Liquidation is limited to an explicit sale list and protects managed Agriculture and Tobacco.

## How to apply the daemon patch

The current daemon patch targets the reviewed fork baseline `e40234d7c435b7280c3947dce94d28ced3ea9ef6` (daemon FNV-1a `6ba4d954`), which already includes the HUD/Corporation integration. Update the companion supervisor and helper files with it. Run this from that **local Git checkout** with `daemon.js` and `corp-daemon.patch`; the check must pass before applying.

```sh
git apply --check corp-daemon.patch
git apply corp-daemon.patch
```

If the check passes, sync the resulting `daemon.js` and both Corporation scripts to the root of `home`. A checkout that already contains the changes can use its existing `daemon.js`. In Bitburner, `run daemon.js --corp-only` starts just the Corporation supervisor. The full daemon’s `--corp` mode also runs its usual tasks and uses the existing Source-File and RAM-upgrade checks. In full mode, `--corp-headroom` sets the daemon’s headroom and `--corp-funding` overrides the profile to authorize all four rounds. Steam verification covered Corporation-only mode. P6 migrated the shared v3 call sites and verified full-daemon/Autopilot handoff. The real augmentation reattachment still awaits the next natural install.

For an intentional augmentation install using the game’s Singularity API, the argument-free callback file is `/corp-supervisor.js`. A normal install preserves the corporation. The callback reopens the profile and starts the manager when RAM permits. A cold start was rehearsed on Steam. The next natural augmentation install can verify the real callback.

## What to look at when something waits

| Symptom | Where to look |
| --- | --- |
| `missing-script` or `low-ram` | Confirm the files are at the root of `home`, then compare `free` with the supervisor’s launch target. The standalone supervisor waits for enough RAM. |
| `NO_CORP` or `BOOTSTRAP` | Read `blocker` and `actions` in the heartbeat for eligibility, cash, starter facilities or API unlocks. |
| Offer ready but still open | Compare `funding.ready`, `funding.coverageNeeded` and `funding.samples` with the active profile and the manager’s arguments in `ps`. Confirm a completed acceptance under `fundingResult` or in the terminal receipt. |
| Tobacco is short of Plants | Inspect `lastSettlement.productInputs` for the target, inventory before and after production, market orders, actual imports, and export settle count. Compare `productStatus.products` for production and sales. |
| `PRESERVE` | Compare company funds with the computed reserve and check settled revenue and expenses. The manager limits purchases to essential inputs and keeps sales running while it waits for recovery. |

The [design and verification notes](./corporation-automation-design.md) contain the longer implementation history and pending live acceptance checks.


## Regression checks

Run `node --test tests/corp-funding.test.mjs tests/corp-reconciliation.test.mjs tests/corp-supervisor.test.mjs tests/corp-launcher.test.mjs` from this folder. The current 61 checks cover funding handoffs, package priority and budgets, purchase cleanup, warehouse pressure, adopted cities, input and boost limits, staffing queues, export recovery, emergency cash handling, cold bootstrap, and IPO transition. These fixtures do not replace a live-save check. Remeasure `mem corp.js` after installing this build; the earlier RAM figures describe the earlier build.


## Live verification — November 19, 2026

The reviewed build is installed on the active Steam 3.0.1 save, with the previous in-game file retained as `corp-before-reconciliation.js`. Its content hash matched the local build (`a29b5151`, FNV-1a), and its normal 80% warehouse threshold was verified after testing. A five-settlement manual-supply run restored sales from empty inputs and ended with three profitable settlements. A native test killed the manager during PURCHASE after adding an outside-written Hardware rate and enabling Smart Supply. Every managed buy rate was zero afterward, Smart Supply was off, and sale settings were unchanged. A planted stale rate was also cleared on restart, followed by three settled observations.

One real warehouse upgrade was exercised through a temporary test copy with a 0.1% pressure threshold: capacity 100 to 200, cost $1.1449b. The installed manager retained 80% throughout. The selected standalone supervisor then relaunched the manager after a stop, with one supervisor and one manager remaining. The final recorded reading had about $23.74b cash, positive operating profit of about $5.24k/s, nine assigned staff in each Agriculture city, and Tobacco developing its first product. The ordinary saved profile self-funded these expansions; CEO holdings stayed 1b of 1.5b total shares, Round 1 remained open, and the manager had no blocker.

The active save cannot yet exercise a positive Round 3 package purchase or active export delivery. Its Round 3 hold passed without spending; the positive coverage-bound package case and active-route recovery remain fixture-verified. The detailed live reports are in `tests/corp-live-results-2026-11-19.json`, and the native test source is `tests/corp-live-check.js`.

The subsequent on-screen Corporation overview showed $23.345b funds, $37.218k/s revenue, $30.939k/s expenses and $6.278k/s profit, with 1b CEO shares of 1.5b total. The manager remains active, so these figures continue changing.


## P4 operation — November 22, 2026

The selected standalone profile now enables `scaling: true`. Direct launches can use `--scale-production` with the existing operating flags. The configuration is backward compatible: profiles without the setting leave P4 scaling off. Restart both the supervisor and manager after changing the profile; an already-running manager keeps its original flags.

Office size ceilings are 9 before Round 3 is accepted, 12 afterward, and 18 for an already-public company. Existing larger offices are adopted without shrinking them. The controller buys at most one three-seat step per settlement, prioritizing Tobacco. It waits for 12 consecutive buffered production cycles, profitable cash growth, at least 90 energy and morale, full output usage, and warehouse utilization below 60%. Sales plus exports qualify only when actual leftover stock is small. The cost must fit 25% of cash left after the operating reserve and both replacement product budgets. The executor refreshes cash, costs, phase, health and size before spending. Purchased capacity and unfinished hiring reconcile after a restart; scaling never requires a second office purchase for that unfinished batch.

Interns replace paid tea and parties. A nine-person office uses two Interns during recovery and one once healthy; larger offices use the corresponding ratios. Research and Business positions remain staffed. This prevents the direct-cash office-care charges that were invisible in the ordinary revenue-minus-expenses figure. Paid care is disabled by the default Intern policy; its optional fallback has a global profit-based budget. Watch `careSpent`, `teasBought` and `lastSettlement.officeCareSpend`.

Post-Round-3 Agriculture boosts can use up to 40% of recent operating profit per city above $10b cash, subject to material, volume and $1m per-city order caps. A combined 80%-of-profit ceiling prevents additional cities from spending more than the corporation earns. Input orders retain priority. Warehouses still upgrade only at the canonical 80% trigger with reserve and cost headroom. There is no scheduled warehouse purchase merely because funding arrived.

After 12 consecutive backlog settlements with healthy buffered production, P4 can continue the established Tobacco campaign beyond its initial AdVert/Wilson targets. It compares the next live AdVert and Wilson quotes within the same scaling budget. A brief price probe cannot alone satisfy that backlog requirement. Full sell-through instead directs affordable spending toward production capacity.

`researchBanks` in the heartbeat reports each managed division's points, pending TA prerequisite chain, reserve, remaining gap, measured gain per settlement and estimated settlements remaining. The manager banks the entire remaining chain plus 10,000 points before buying it. With no prerequisites owned, the trigger is 85,000 points: Laboratory 5,000, TA.I 20,000, TA.II 50,000, plus reserve. Purchases verify the result and resume from actual research after an interruption. Research is checked even while a replacement product is developing; completed products receive TA at the next SALE after it is learned. No developer-menu research is used. [Tagged research costs](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/ResearchMap.ts)

For a read-only live check, install `tests/corp-scaling-live.js` as `/Temp/corp-scaling-live.js` on home and run it with a settlement count, for example `run /Temp/corp-scaling-live.js 30`. It records input stocks, product rates, cash, upkeep, ownership, research and controller continuity in `/Temp/corp-scaling-audit.txt`. The manager continues running after the observer exits.


## Final P4 live verification — November 22, 2026

The final installed manager and supervisor matched the local FNV-1a hashes `6b6693c2` and `ac0e9a85`. Manager RAM remains **871.80 GB**, with a **903.80 GB** launch target including 32 GB headroom. The saved auto/manual/campaign/chain profile now also has `scaling: true`. One supervisor (PID 24) and one manager (PID 25) remained running after the read-only audit finished.

The final-build audit sampled **30 consecutive settlements**, cycles 22–51. Every sampled production cycle retained input stock and every completed Tobacco product kept producing; the manager had 51 consecutive buffered cycles at the end of the audit. Funds rose **$25.482154m**, from **$26.777219b to $26.802701b**. Paid upkeep and tea orders were both zero. Holdings stayed **300m / 1.5b (20%)**, the corporation stayed private in Round 4, and there were no manager blockers. Ending warehouse utilization was at most **44.01%**.

Aevum Agriculture and the Tobacco development office both reached 12 employees in 12 seats, at 100 morale and energy; Sector-12 Agriculture retained nine. Each three-seat purchase cost **$5.180116b**, so the two deliberate capital purchases account for **$10.360232b** of treasury deployment. At the subsequent reading, all three completed products produced and sold **0.611206 units/s each**, Plants remained **41.66 of 60** after production, and the manager had observed **62 consecutive buffered cycles**. The next farm office step was held: its $5.180116b quote exceeded the $4.907778b scaling budget after reserves.

Research was **5,117.39 points in Agriculture** and **2,474.50 in Tobacco**, with 75,000 points of TA prerequisites plus the 10,000-point reserve still required in each division. Normal accumulation continues; live TA activation is pending sufficient research, with reserve and activation behavior covered by fixtures. Warehouse mutation evidence remains the prior real 100-to-200 test; current utilization does not justify another capacity purchase. This meets P4's sustained supply, existing live pressure-path evidence, and research-progress tracking acceptance checks without claiming a live TA purchase.

Selected native evidence is saved in `tests/corp-live-results-2026-11-22.json`; the full 30-sample audit remains `/Temp/corp-scaling-audit.txt` in the game. The earlier audit is preserved in `/Temp/corp-scaling-audit-initial.txt`.


## P5 capital policy

P5 is enabled by default in the local manager and supervisor. The supervisor's `capital: "off"` maintenance setting adds `--capital-off`; otherwise no capital opt-in flag is needed. Changing a profile requires restarting the supervisor and manager. The active game deployment is verified separately below.

The automatic IPO waits until private funding has reached the configured stopping point (Round 3 accepted), the approved Round 3 purchases have finished, cash is at least 110% of the live operating reserve, and there are 12 profitable settlements with rising cash and 12 consecutive buffered production cycles. The configured IPO quantity remains zero. The action verifies public status, cash, CEO holdings, total shares, issued shares and investor shares, then explicitly sets dividends to zero. Skipping Round 4 deliberately ends its remaining private offer.

Dividend policy compounds at 0% below $50b cash. Above that threshold, 12 healthy profitable and supplied settlements permit a 5% payout, within the configured 10% maximum. A cash shortfall, operating loss or preservation mode cuts dividends to zero immediately. An explicit `--dividend-rate` argument overrides the automatic payout selection while retaining safety cuts. Estimates use live CEO ownership; current ownership can change through financing.

Automatic new shares are optional liquidity repair. The manager waits for the issuance cooldown, a share price of at least $1, and a real deficit relative to the greater of 110% of the operating reserve and the configured equity cash target. It issues in 10m-share lots, respecting the game's 20% issuance bound and a retained CEO ownership floor of 5%. It verifies the cash credit, total-share increase, unchanged CEO share count, allocation to public/private investors and the new cooldown. With ample cash, it does nothing. Capital credits are excluded from the following operating-cash-growth observation.

Preservation stops growth and boost buys, disables Smart Supply, limits purchases to essential inputs, preserves earning orders, and requires three healthy settled STARTs to recover. Division sales remain limited to `CONFIG.liquidation.allow` and never include the protected managed divisions. Replacement input coverage is checked before selling an allowed supplier; proceeds and route cleanup are verified afterward. An empty sale list is a valid live hold, not a reason to create and discard a division for testing.

The controlled in-game emergency harness is `tests/corp-capital-live.js`. It requires the normal controllers to be stopped, checks the real dividend cut and purchase clamps for three live settlements, checks the empty liquidation list and equity hold, then restores supervision. It neither forces bankruptcy nor sells a division. This distinguishes controlled live behavior from natural insolvency and from the fixture-only positive liquidation and equity-issuance cases. The read-only `tests/corp-public-live.js` records the subsequent public steady-state window in `/Temp/corp-p5-audit.txt`.


## P5 live exit — November 22, 2026

The user explicitly approved installation, controller restart, the zero-share IPO ending Round 4, automatic dividend and optional liquidity-driven share issuance, and a controlled emergency check without division sales. The installed manager and supervisor matched local FNV-1a hashes **ffc7e3ba** and **a01bd2ee**. RAM remained **871.80 GB**, with **903.80 GB** required including headroom. The saved profile now has `capital: "auto"`; ordinary launch arguments need no IPO or equity opt-in flags.

The live manager verified `goPublic(0)` at **$27.436102b**. Cash, CEO holdings (**300m**), total shares (**1.5b**), investor holdings (**1.2b**) and issued shares (**0**) were preserved. Ownership remained **20%** and the initial dividend rate was explicitly verified at **0%**. The final private offer was deliberately ended after Round 3, which also closes P2 through its permitted early-IPO outcome.

The controlled live drill verified an actual **1% to 0% dividend cut**, disabling Smart Supply, clearing a stray boost purchase, three live settlements of essential-only supply with sales retained, and recovery after the third healthy START. It held optional equity at zero because treasury cash exceeded the liquidity target. Liquidation reported no unprotected eligible division; no division was sold. Cash rose from **$27.539873b** to **$27.543330b** during the check. The harness restored supervision without a competing Corporation writer. A terminal-wrapper syntax error prevented the first drill-launch command from executing; the corrected command completed successfully.

After restoration, the read-only audit observed **30 consecutive public STEADY settlements**, cycles 12–41. All retained input buffers, every completed Tobacco product kept producing, dividends stayed at zero, paid upkeep and tea orders stayed at zero, holdings were unchanged, and the manager had no blockers. Cash rose **$26.282606m**, from **$27.554553b to $27.580836b**. Ending warehouse utilization was at most **41.03%**.

The subsequent reading had **$27.630205b**, revenue **$146,457.71/s**, expenses **$57,916.16/s**, one supervisor (**PID 42**) and one manager (**PID 43**) in STEADY with **96** consecutive supplied and profitable cycles. All three products produced and sold **0.614253 units/s each**; Plants remained **41.57** after production against a 60-unit buffer. Automatic capital policy was active, with 0% compounding, a configured 5% payout above $50b when healthy, and optional liquidity-driven equity enabled.

P5's public STEADY, active dividend-policy and automatic-capital exit is met. The 5% threshold payout has not naturally triggered, positive equity issuance was unnecessary, and positive liquidation was excluded from the approved live drill. Their mutation and safety checks remain fixture-verified; live guard checks are recorded without claiming those mutations occurred. Natural insolvency was not induced. All **44 local Corporation checks pass**. P6 launcher migration and P7 natural formation/reset validation remain separate. [Tagged public-finance API](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Corporation.ts) · [Tagged capital actions](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Actions.ts)

Selected native evidence is in `tests/corp-p5-live-results-2026-11-22.json`. Full reports remain on home as `/Temp/corp-p5-ipo.txt`, `/Temp/corp-p5-emergency.txt` and `/Temp/corp-p5-audit.txt`. The standalone supervisor remains running.


## P6 launcher compatibility

The game files matched the reviewed fork branch before migration: daemon `6ba4d954`, Autopilot `6e6b0563`, helpers `17704cad`. The older publication checkout did not match the installed daemon and was left untouched. Current source is at the workspace root and synchronized into `bitburne_scripts_ada-review`; no commit or push is implied.

The installed daemon used a newer supervisor interface than the previous standalone supervisor exported. P6 restores those exports while retaining P4 scaling and P5 capital policy. The full daemon and standalone callback now elect a launcher with full-daemon priority and refresh the process list immediately before launching. A stale plan cannot start another worker. A running observer, another installation, multiple workers or a known legacy `corp-manager.js` / `Corp/corp-*.js` controller causes a hold. The manager also refuses a lower-PID same-name copy in another folder or a legacy writer before registering cleanup. The full daemon does not launch Corporation scripts through its ordinary helper queue when its Corporation controller is enabled.

The `APIBreakInfo-3.0.0.txt` review found non-hackable-host calls in daemon and Autopilot. Bulk metrics now read server snapshots with safe defaults; live money/security reads also avoid applying normal-server-only getters to non-hackable hosts. Autopilot uses snapshots for income-target requirements and minimum security. Migrated temporary queries use daemon/Autopilot-specific filenames so other helpers cannot replace their code or data. The shared time-format helper now calls `ns.format.time`. Home-money reads are valid in the tagged API, the world-daemon lookup already checks server existence, and the flagged work-task paths do not read the removed completion property. Those reviewed call sites were not blindly rewritten. The hash-sale RAM floor was updated for the v3 per-function Hacknet cost. [3.0.1 Netscript implementation](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts)

The selected `corp-supervisor.config.txt` profile has `launcher: "daemon"` and keeps its auto formation, manual supply, campaign, chain funding, P4 scaling and P5 automatic capital settings. Running `corp-supervisor.js` without arguments now attaches to an existing full daemon or starts it with Corporation enabled. Explicit `daemon.js --corp-only` still selects standalone supervision. Autopilot relays `--corp` and `--no-corp` when relaunching daemon, including through its existing augmentation callback. The saved Autopilot configuration retains `corp: true`; temporary test-only install/destruction holds are removed afterward.

`corp-launcher-state.txt` is a persistent attachment journal. It validates one current writer and a matching fresh heartbeat, then records controller PID, manager PID, stage and the game's augmentation/BitNode reset timestamps. It distinguishes controller reattachment from actual augmentation or BitNode reattachment. Corrupt/stale journal data cannot authorize a writer or block normal supervision. It does not replace live game state as strategy authority.

Use the argument-free callback `corp-supervisor.js` when invoking an installation through the Corporation route; the selected profile reopens full daemon. Autopilot's existing ascend path continues to use Autopilot itself as callback, with persisted Corporation enablement. No augmentation or BitNode reset is performed just to validate this milestone. A true `augmentation-reattachment` receipt is pending the next natural install and must not be confused with today's restart rehearsal.


## P6 live supervision verification — November 22, 2026

All five installed files matched local source hashes: manager **5c764103**, supervisor **227830e6**, daemon **2119b225**, Autopilot **79e48d14**, helpers **77b033dc**. Measured RAM was **871.80 GB** for the manager, **4.35 GB** for the callback/standalone supervisor, **6.55 GB** for the full daemon, and **2.70 GB** for Autopilot. Manager reservation remains **903.80 GB** with 32 GB headroom. All **54 local checks** pass; Git whitespace and daemon-patch checks pass.

The full daemon first adopted existing manager **PID 43** without a restart. A controlled Autopilot run used install and BitNode-destruction holds, then relaunched the daemon as **PID 14624** while the manager remained PID 43. Its captured logs contained no errors. The argument-free Corporation callback attached to daemon PID 14624 and returned without launching a worker. Autopilot was stopped after the check, and its temporary test holds were removed; its persistent profile now contains only `[["corp",true]]`. Full daemon remains selected and running.

Stopping the manager once caused the full daemon to launch **PID 24948** from the migrated file. A read-only audit then observed **30 consecutive STEADY settlements**, cycles **16–45**, and **260 process polls** with a maximum of **one Corporation writer**. All input buffers survived, manager blockers were empty, paid office care was zero, and ownership stayed **300m of 1.5b (20%)**. Cash increased **$27.729306m**, from **$23.724891b to $23.752620b** during the audited window.

The later snapshot had one full daemon (PID 14624), one manager (PID 24948), no standalone supervisor, no running Autopilot and no daemon errors. The manager was in STEADY after **154** supplied and profitable cycles, with **$23.856591b**, **$155,240.92/s** revenue and **$60,770.55/s** expenses. All three completed Tobacco lines produced and sold **0.619396 units/s each**, with **41.42 Plants** remaining after production. P5 automatic capital policy stayed active at 0% dividends.

The reset timestamps were unchanged: augmentation **1795284330242**, BitNode **1794779647522**. The journal correctly recorded controller reattachment, not augmentation reattachment. Full-daemon supervision and restart/callback rehearsal are verified; the real augmentation-reattachment acceptance item is still pending the next natural install. No reset was forced.

Selected evidence is saved in `tests/corp-p6-live-results-2026-11-22.json`; the full native reports remain `/Temp/corp-p6-before-restart.txt`, `/Temp/corp-p6-autopilot.txt`, `/Temp/corp-p6-audit.txt`, and the persistent `corp-launcher-state.txt`. The source and notes are synchronized into the reviewed fork checkout; no GitHub push was performed as part of P6.


## P7 formation and BitNode behavior — November 22, 2026

The saved auto preset is evaluated against the current game's formation eligibility on every new start, not the previous corporation or profile history. In BN3 it requests seed funding without waiting for player cash. Outside BN3, only the explicit UseSeedMoneyOutsideBN3 result selects self-funding; unavailable Corporation access and softcap restrictions remain holds. Self-funding waits for $150b plus CONFIG.playerReserve and rechecks the balance immediately before creation. Every preset adopts an existing corporation.

BN3 formation gives the CEO 1b shares and the seed investors 500m, for 1.5b total. Self-funded formation starts with 1b CEO shares and no seed investors. BN3 grants Office API and Warehouse API for free; active Source-File 3 level 3 also grants them outside BN3. Both paths start with $150b corporate funds. The manager reads unlock ownership before buying anything. Its formation log prints actual funds, capitalization, and API grants. [3.0.1 formation source](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectCorporationMethods.ts)

The heartbeat includes currentNode, valuationMultiplier and valuationSource. Funding projections read the live CorporationValuation multiplier, with a tagged 3.0.1 fallback when Source-File 5 is unavailable. BN10 uses 0.5. The multiplier applies to inferred growth, the Round-1 cash credit's projected valuation effect, and horizon forecasts; later-round live quotes already include it and are not halved again. BN12's fallback uses the active source-file level, including overrides. CONFIG.fundingModel.valuationMultiplierOverride is normally null. [3.0.1 BitNode multipliers](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx)

The 61 checks include seed-funded cold formation with native free APIs, a worst-case paid-API budget, both self-funding presets at $150b minus $1 and at $150b, disabled eligibility, a last-moment cash loss, observe-only behavior, restart adoption, and BN10 forecasts. Those are fixtures. P7's live exit remains pending a naturally corporation-free BN3 and an eligible non-BN3 save. An augmentation install normally preserves a corporation and does not by itself create that opportunity. Keep the auto profile selected and let the existing RAM manager reach the measured reservation; do not reset or discard an existing corporation solely to test formation.

The installed manager hash **4aa76b28** matched local source. Full daemon PID **4** restarted the worker from PID **8** to **27106**. At the final readback, cycle **185**, exactly one worker and no standalone supervisor were present; the node was **3**, valuation multiplier **1** from the live API, stage **IPO**, with no blocker. Reset timestamps remained unchanged. Before restart the corporation had **$47.920638b**, Agriculture and Tobacco, and **1b / 1.5b** CEO shares. The existing automatic funding policy subsequently verified R1 **$8.638470b / 100m shares**, R2 **$21.853790b / 350m**, and R3 **$19.632050b / 250m**, advancing to Round 4. These are adoption/funding observations, not fresh-formation evidence. The structured receipt is in tests/corp-p7-live-results-2026-11-22.json.
