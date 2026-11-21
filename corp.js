/** Bitburner 3.0.1. Agriculture operations. Pass --apply to enable Corporation writes. */
const CONFIG = {
    name: "AutoCorp",
    preset: "auto",
    formationPresets: ["auto", "bn3", "self-funded"],
    selfFundCost: 150e9,
    playerReserve: 0,
    cashReserve: 5e9,
    reserveCycles: 3,
    reserveBurnDays: 3,
    preservationRecoverySettlements: 3,
    preservationRecoveryBuffer: 1.1,
    market: { dividendRate: 0, maximumDividendRate: 0.10, profitSettlements: 3,
        minimumSharePrice: 1, minimumCeoStake: 0.05, equityCashTarget: 0 },
    liquidation: { allow: [], protect: [] },
    heartbeatPath: "/Temp/corp-status.txt",
    heartbeatMs: 15_000,
    waitMs: 2_000,
    summaryCycles: 6,
    starter: { name: "Agri", industry: "Agriculture", aliases: [], city: "Sector-12" },
    product: { name: "Tobacco", industry: "Tobacco", aliases: [], city: "Sector-12" },
    round1City: "Aevum",
    selfFundExpansions: true,
    supplySettleCycles: 3,
    advertisingTarget: 5,
    tobaccoCampaign: { adVertsBeforeWilson: 2, adVertsAfterWilson: 3, wilsonLevel: 1, spendableFraction: 0.50 },
    tobacco: {
        jobs: { Operations: 2, Engineer: 3, Business: 1, Management: 2, "Research & Development": 1 },
        researchReserve: 10_000,
        investmentFraction: 0.05,
        investmentMinimum: 1e9,
        secondProductInvestmentMinimum: 250e6,
        investmentCap: 5e9,
        priceStart: 1,
        launchAdVerts: 1,
        minimumSellerRate: 0.01,
        priceMax: 3,
        priceStep: 0.05,
        minimumPriceStep: 0.001,
        failedProbeCooldown: 12,
        weakSalesFraction: 0.5,
        weakSettlements: 3,
        inputBufferCycles: 2,
        exportPlants: true,
        exportUnlockAfterRound: 4,
        exportSaleShare: 0.5,
        exportStockTolerance: 2e-5,
    },
    round1MinimumOffer: 12e9,
    fundingModel: { horizon: 100, valuationMultiplier: 1, chainMinimumOffer: 5e9, fairFraction: 0.95,
        shareFractions: [0.1, 0.35, 0.25, 0.2], multipliers: [3, 2, 2, 1.5] },
    dualProductFunding: {
        package: "Tobacco product continuity and working capital",
        sellingSettlements: 3,
        allocations: { "Two future product investments": 20e9, "Inputs and working cash": 4e9 },
    },
    round1ProfitProjectionSettlements: 5,
    round1SellingSamples: 3,
    round1ScaleUp: {
        package: "Tobacco production and sales scale-up",
        allocations: {
            "Tobacco design and marketing": 10e9,
            "Marketing and sales upgrades": 8e9,
            "Office and warehouse capacity": 10e9,
            "Inputs and working cash": 4e9,
        },
    },
    fundingRounds: [
        { package: "Aevum Agriculture satellite", cost: 18.25e9 },
        { package: "Tobacco launch", cost: 35e9 },
        {
            package: "Proven Tobacco capacity and sales",
            allocations: {
                "Constrained warehouses and productive offices": 10e9,
                "Demand and sales improvements": 8e9,
                "Production boosts": 8e9,
                "Research staffing and support": 6e9,
                "Next product design and marketing": 10e9,
                "Inputs and working cash": 6e9,
            },
        },
        {
            package: "Sustained capacity and product replacement",
            allocations: {
                "Constrained warehouses and productive offices": 16e9,
                "Demand and sales improvements": 12e9,
                "Production boosts and upgrades": 10e9,
                "Research staffing and support": 8e9,
                "Replacement product design and marketing": 10e9,
                "Inputs and working cash": 6e9,
            },
        },
    ],
    upgradeBudgetFraction: 0.10,
    upgradeSellThrough: 0.95,
    wilsonMinAdVerts: 5,
    officeCareBudget: 150e6,
    officeCareTarget: 95,
    officeCareTrigger: 85,
    starterProductionUnits: 20,
    purchaseBudget: 1e6,
    warehouseFill: 0.8,
    warehouseUpgradeAt: 0.8,
    valuationSamples: 10,
    fundingProfitCycles: 2,
    offerPlateauRange: 0.01,
    round1OfficeSize: 9,
    researchSeatBudget: 2e9,
    smartSupply: true,
    smartSupplyPurchaseBudget: 25e6,
    boosts: true,
    boostPurchaseBudget: 1e6,
    boostProfitSharePerCity: 0.25,
    boostedInputBufferCycles: 2,
    agricultureBufferCashThreshold: 10e9,
    agricultureHighCashInputCycles: 3,
    boostSpace: 0.35,
    boostWeights: { Hardware: 1, Robots: 1, "AI Cores": 1, "Real Estate": 5 },
    // Entries specify { material, targetDivision, targetIndustry, targetCity, unitsPerCycle }.
    exports: [],
    ipoShares: 0,
};

const PHASES = ["START", "PURCHASE", "PRODUCTION", "EXPORT", "SALE"];
const REQUIRED_UNLOCKS = ["Office API", "Warehouse API"];
const INPUTS = ["Water", "Chemicals"];
const OUTPUTS = ["Plants", "Food"];
const STARTER_JOBS = ["Operations", "Engineer", "Business"];
const BOOSTS = Object.keys(CONFIG.boostWeights);
const MARKET_TA_RESEARCH = ["Hi-Tech R&D Laboratory", "Market-TA.I", "Market-TA.II"];
const RAMP_JOBS = { Operations: 3, Engineer: 3, Business: 1, Management: 1, "Research & Development": 1 };

/** @param {NS} ns */
export async function main(ns) {
    const call = (method, fn) => {
        try {
            return fn();
        } catch (error) {
            if (error?.name === "ScriptDeath") throw error;
            throw new Error(method + ": " + String(error));
        }
    };
    const apply = ns.args.includes("--apply");
    const presetIndex = ns.args.indexOf("--preset");
    const preset = presetIndex < 0 ? CONFIG.preset : ns.args[presetIndex + 1];
    if (!CONFIG.formationPresets.includes(preset)) {
        call("tprint", () => ns.tprint("Use --preset auto, bn3, or self-funded."));
        return;
    }
    const ramp = ns.args.includes("--ramp-office");
    const fundAll = ns.args.includes("--fund");
    const fundRound1 = ns.args.includes("--fund-round-1");
    const fundChain = ns.args.includes("--fund-chain");
    const tobaccoGrowth = ns.args.includes("--tobacco-growth");
    const upgrades = ns.args.includes("--upgrades");
    const officeCare = ns.args.includes("--office-care");
    const manualSupply = ns.args.includes("--manual-supply");
    const products = ns.args.includes("--products");
    const productTA = ns.args.includes("--product-ta");
    const roundOneAtCost = ns.args.includes("--round-1-at-cost");
    const readPlan = readyRound => inspect(ns, call, readyRound, products || !apply, preset);
    const ipoEarly = ns.args.includes("--ipo-early");
    const ipo = ipoEarly || ns.args.includes("--ipo");
    const equity = ns.args.includes("--equity");
    const liquidate = ns.args.includes("--liquidate");
    const bankResearch = ns.args.includes("--bank-research") || products;
    const researchTA = ns.args.includes("--research-ta") || bankResearch;
    const mode = apply ? "bootstrap" : "dry-run";
    const prefix = "[corp " + mode + "] ";
    const host = call("getHostname", () => ns.getHostname());
    if (host !== "home") {
        call("tprint", () => ns.tprint(prefix + "Run on home."));
        return;
    }
    const pid = ns.pid;
    const filename = call("getScriptName", () => ns.getScriptName()).replace(/^\//, "");
    const processes = call("ps", () => ns.ps("home"));
    if (processes.some(p => p.filename.split("/").pop() === filename.split("/").pop() && p.pid < pid)) {
        const message = prefix + "Another instance owns the heartbeat.";
        if (ns.args.includes("--once")) ns.tprint(message);
        else ns.print(message);
        return;
    }

    const once = ns.args.includes("--once");
    const cycleArg = ns.args.indexOf("--cycles");
    const cycleLimit = cycleArg < 0 ? 0 : Number(ns.args[cycleArg + 1]);
    if (cycleArg >= 0 && (!Number.isInteger(cycleLimit) || cycleLimit < 1 || once)) {
        call("tprint", () => ns.tprint(prefix + "Use --cycles with a positive integer, or use --once."));
        return;
    }
    const dividendIndex = ns.args.indexOf("--dividend-rate");
    const dividendRate = dividendIndex < 0 ? CONFIG.market.dividendRate : Number(ns.args[dividendIndex + 1]);
    if (!Number.isFinite(dividendRate) || dividendRate < 0 || dividendRate > CONFIG.market.maximumDividendRate) {
        call("tprint", () => ns.tprint(prefix + "Use --dividend-rate from 0 to " + CONFIG.market.maximumDividendRate + "."));
        return;
    }
    const financeOptions = { ipo, ipoEarly, equity, dividendRate };
    let observed = [];
    let completedPhase = null;
    let cycles = 0;
    let lastFullCycle = null;
    let lastHeartbeat = 0;
    let lastState;
    let lastReport = 0;
    let marketResearch = null;
    let productStatus = null;
    let productInputs = null;
    let agricultureInputs = [];
    let development = null;
    let preservation = { active: false, healthy: 0 };
    let financeResult = null;
    let liquidationStatus = null;
    const weakProducts = new Map();
    const productPriceStreaks = new Map();
    const managedOrders = apply ? createPurchaseOrders(ns, filename + ".orders.txt") : null;
    const supplyReadiness = new Map();
    if (apply) {
        call("atExit", () => ns.atExit(managedOrders.clear));
        managedOrders.clear();
    }
    let lastSettlement = null;
    let settlementCount = 0;
    let profitStreak = 0;
    let rampProfitStreak = 0;
    let beforePurchase = null;
    let materialPurchases = null;
    let production = null;
    const recoveringOffices = new Set();
    let careSpent = 0;
    let teasBought = 0;
    let carePending = false;
    let valuationWindow = [];
    let funding = null;
    const fundingResults = [];
    let upgradePlan = null;
    let upgradeResult = null;

    for (;;) {
        let plan;
        let settled = null;
        try {
            plan = readPlan(funding?.ready ? funding.round : null);
            preservation = updatePreservation(plan, preservation, completedPhase === "START" && plan.nextState === "PURCHASE");
            if (preservation.active || liquidate) {
                plan = { ...plan, stage: "PRESERVE", blocker: liquidate ? "Liquidation mode" : "Cash preservation",
                    actions: ["Limit purchases to essential inputs", "Keep sales running"] };
            }
            if (completedPhase === "PURCHASE") {
                const after = plan.nextState === "PRODUCTION" ? purchaseSnapshot(ns, call) : null;
                materialPurchases = measurePurchases(beforePurchase, after);
                production = after ? productionInputs(ns, call, after) : null;
                beforePurchase = null;
                productInputs = plan.nextState === "PRODUCTION" ? readTobaccoInputs(ns, call, plan.divisions) : null;
                if (productInputs) {
                    productInputs.exportSettlements = supplyReadiness.get(productInputs.division + "/" + productInputs.city)?.count ?? 0;
                }
                agricultureInputs = plan.nextState === "PRODUCTION" ? readAgricultureInputs(ns, call, plan.divisions) : [];
            }
            if (completedPhase === "PRODUCTION" && plan.nextState === "EXPORT" && production) {
                production.outputUnits = readMaterial(ns, call, production.division, "Plants").productionAmount * production.seconds;
                for (const input of production.inputs) {
                    input.remaining = readMaterial(ns, call, production.division, input.name).stored;
                }
            }
            if (completedPhase === "PRODUCTION" && plan.nextState === "EXPORT" && productInputs) {
                settleInputReadings(ns, call, productInputs);
            }
            if (completedPhase === "PRODUCTION" && plan.nextState === "EXPORT") {
                for (const site of agricultureInputs) settleInputReadings(ns, call, site);
            }
            if (completedPhase === "START" && plan.revenue !== null) {
                const fundsChange = lastSettlement ? plan.funds - lastSettlement.funds : null;
                const fullInterval = lastSettlement && cycles === lastSettlement.fullCycles + 1;
                const operatingFundsChange = lastSettlement ? plan.funds - (lastSettlement.fundsAfterFunding ?? lastSettlement.funds) : null;
                if (lastSettlement && !fullInterval) {
                    weakProducts.clear();
                    productPriceStreaks.clear();
                    supplyReadiness.clear();
                }
                const profitable = fullInterval && plan.revenue > plan.expenses && operatingFundsChange > 0;
                profitStreak = profitable ? profitStreak + 1 : 0;
                const office = starterOffice(ns, call);
                const ramped = hasRampStaff(office?.office);
                rampProfitStreak = profitable && lastSettlement.ramped && ramped ? rampProfitStreak + 1 : 0;
                const offer = plan.nextOffer;
                const growth = !plan.blocker && plan.stage !== "BOOTSTRAP" && plan.nextState === "PURCHASE"
                    ? inspectGrowth(ns, call, offer?.round, !apply || upgrades || tobaccoGrowth) : null;
                if (carePending || plan.cashExpansion || (lastSettlement && !fullInterval) ||
                    valuationWindow.at(-1)?.round !== offer?.round) {
                    valuationWindow = [];
                }
                if (!carePending && !plan.cashExpansion && offer && plan.nextState === "PURCHASE" && Number.isFinite(plan.valuation)) {
                    valuationWindow.push({ round: offer.round, valuation: plan.valuation, offerFunds: offer.funds,
                        tobaccoSelling: growth?.tobaccoSelling ?? false, twoTobaccoSellers: growth?.twoTobaccoSellers ?? false,
                        funds: plan.funds });
                    if (valuationWindow.length > CONFIG.valuationSamples) valuationWindow.shift();
                }
                carePending = false;
                funding = fundingDecision(plan, valuationWindow, profitStreak, rampProfitStreak, growth, fundChain);
                development = readDevelopment(ns, call, plan.divisions, development, Boolean(fullInterval),
                    plan.secondsPerMarketCycle);
                upgradePlan = growth && (!apply || upgrades || tobaccoGrowth)
                    ? rankUpgrades(ns, call, plan, growth, profitStreak, tobaccoGrowth, !apply || upgrades) : null;
                lastSettlement = { number: ++settlementCount, fullCycles: cycles, revenue: plan.revenue, expenses: plan.expenses,
                    funds: plan.funds, fundsChange, operatingFundsChange, profitStreak, ramped, rampProfitStreak, fundingReady: funding.ready,
                    materialPurchases, production, productInputs, agricultureInputs, treasury: plan.treasury, development,
                    office: office ? { jobs: office.office.employeeJobs, energy: office.office.avgEnergy,
                        morale: office.office.avgMorale } : null };
                materialPurchases = null;
                production = null;
                productInputs = null;
                agricultureInputs = [];
                const summary = prefix + formatSettlement(lastSettlement) + formatFunding(funding);
                call("print", () => ns.print(summary));
                if (cycleLimit) {
                    call("tprint", () => ns.tprint(summary));
                    const readings = formatProductivity(lastSettlement);
                    if (readings) call("tprint", () => ns.tprint(prefix + readings));
                }
            }
            if (apply && plan.stage === "PRESERVE") {
                const result = reconcilePublicFinances(ns, call, plan, financeOptions, profitStreak,
                    completedPhase === "START", true);
                if (result) financeResult = result;
                maintainEmergencySales(ns, call, plan, managedOrders);
                if (liquidate && completedPhase === "START" && plan.nextState === "PURCHASE") {
                    liquidationStatus = reconcileLiquidation(ns, call);
                }
            } else if (apply && plan.stage !== null) {
                const result = reconcilePublicFinances(ns, call, plan, financeOptions, profitStreak,
                    completedPhase === "START", false);
                const financed = Boolean(result);
                if (financed) {
                    financeResult = result;
                    plan = readPlan(null);
                }
                let funded = false;
                let upgraded = false;
                if (!financed && completedPhase === "START" && !plan.cashExpansion && funding?.ready && (fundAll || (fundRound1 && funding.round === 1) || (fundChain && funding.round <= 2))) {
                    const result = acceptFunding(ns, call, funding, fundChain);
                    fundingResults.push(result);
                    lastSettlement.fundsAfterFunding = result.after.funds;
                    funded = true;
                    funding = null;
                    valuationWindow = [];
                    upgradePlan = null;
                    call("tprint", () => ns.tprint(prefix + "Verified round " + result.round +
                        ": +$" + result.funds.toFixed(0) + ", " + result.shares + " shares transferred, next round " +
                        result.nextRound + "."));
                    plan = readPlan(null);
                }
                const stopping = cycleLimit ? settlementCount >= cycleLimit : once && cycles > 0 && completedPhase === "START";
                settled = stopping ? readSettlement(ns, call, Boolean(cycleLimit)) : null;
                if (settled) {
                    finishBootstrapOrders(ns, call, managedOrders, settled);
                } else if (!(cycleLimit && settlementCount >= cycleLimit)) {
                    if (!financed && !funded && (upgrades || tobaccoGrowth) && completedPhase === "START" && upgradePlan?.selected) {
                        upgradeResult = buyRankedUpgrade(ns, call, upgradePlan.selected);
                        upgraded = Boolean(upgradeResult);
                        if (upgraded) plan = readPlan(funding?.ready ? funding.round : null);
                    }
                    if (officeCare && settlementCount >= 2 && plan.nextState === "START" && !plan.blocker) {
                        const care = careForManagedOffices(ns, call, plan, recoveringOffices, products);
                        if (care.spent > 0) {
                            careSpent += care.spent;
                            teasBought += care.teas;
                            carePending = care.recovering;
                            if (carePending) {
                                valuationWindow = [];
                                funding = null;
                            }
                            plan = readPlan(funding?.ready ? funding.round : null);
                            call("print", () => ns.print(prefix + "Office care paid $" + care.spent.toFixed(0) +
                                " (" + care.teas + " tea orders, parties $" + care.party.toFixed(0) + ")."));
                        }
                    }
                    if (applyBootstrap(ns, call, managedOrders, plan, ramp, profitStreak >= 2, manualSupply, supplyReadiness, completedPhase, products, preset)) {
                        plan = readPlan(funding?.ready ? funding.round : null);
                    }
                    if (researchTA && completedPhase === "START" && !plan.blocker) {
                        const progress = advanceMarketResearch(ns, call, plan.reserve, bankResearch);
                        if (progress) {
                            const rate = marketResearch?.next === progress.next ?
                                Math.max(0, progress.points - marketResearch.points) : null;
                            marketResearch = { ...progress, gainedThisCycle: rate };
                            if (progress.purchased.length) {
                                call("tprint", () => ns.tprint(prefix + "Researched " + progress.purchased.join(", ") + "."));
                            }
                            if (progress.seatCost) plan = readPlan(funding?.ready ? funding.round : null);
                        }
                    }
                    if (products) {
                        productStatus = reconcileExpansion(ns, call, plan, completedPhase, productTA, weakProducts, managedOrders,
                            !financed && !funded && !upgraded, productStatus, supplyReadiness, manualSupply, profitStreak >= 2,
                            plan.round === 1 && (roundOneAtCost || fundChain), productPriceStreaks);
                    }
                }
            }
            if (plan.nextState === "PURCHASE" && !settled) beforePurchase = purchaseSnapshot(ns, call);
        } catch (error) {
            plan = { ...(plan ?? status(null)), blocker: error.message };
            settled = null;
        }
        const key = JSON.stringify([plan.stage, plan.blocker, plan.actions]);
        const now = Date.now();
        const changed = key !== lastState;
        const cycleFinished = cycles > lastReport;
        const heartbeat = {
            timestamp: now, pid, mode, preset, ...plan,
            completedPhase, cycles, lastFullCycle, settled, lastSettlement, funding, fundingResult: fundingResults.at(-1) ?? null, fundingResults,
            upgradePlan, upgradeResult, careSpent, teasBought, marketResearch, productStatus,
            preservation, development, financeResult, liquidationStatus,
        };

        if (changed) {
            call("print", () => ns.print(prefix + describe(plan)));
            lastState = key;
        }
        if ((completedPhase === "START" && plan.revenue !== null) || changed || now - lastHeartbeat >= CONFIG.heartbeatMs || settled || (cycleFinished && (once || cycles === 1))) {
            try {
                call("write heartbeat", () => ns.write(CONFIG.heartbeatPath, JSON.stringify(heartbeat) + "\n", "w"));
                lastHeartbeat = now;
            } catch (error) {
                if (changed || now - lastHeartbeat >= CONFIG.heartbeatMs) {
                    call("print", () => ns.print(prefix + error.message));
                    lastHeartbeat = now;
                }
                if (settled || (once && !apply && cycleFinished)) throw error;
            }
        }
        if (once && !apply && (!plan.nextState || plan.blocker)) {
            call("tprint", () => ns.tprint(prefix + describe(plan)));
            return;
        }
        if (cycleFinished) {
            lastReport = cycles;
            if (cycles === 1 || cycles % CONFIG.summaryCycles === 0 || once) {
                call("tprint", () => ns.tprint(prefix + "Cycle " + cycles + " " +
                    lastFullCycle.join(" → ") + ". " + describe(plan)));
            }
            if (once && !apply) return;
        }
        if (cycleLimit && settlementCount >= cycleLimit && !settled) return;
        if (settled) {
            call("tprint", () => ns.tprint(prefix + "Settled Agriculture receipts: $" + settled.receipts.toFixed(2) +
                ", expenses: $" + settled.expenses.toFixed(2) + ", corporate funds: $" + settled.funds.toFixed(2)));
            return;
        }

        await call("sleep", () => ns.sleep(plan.nextState ? 20 : CONFIG.waitMs));
        if (!plan.nextState) {
            observed = [];
            completedPhase = null;
            continue;
        }
        try {
            // The returned phase just finished. The next snapshot reads the upcoming phase separately.
            completedPhase = await ns.corporation.nextUpdate();
            if (completedPhase === PHASES[observed.length]) {
                observed.push(completedPhase);
            } else {
                observed = completedPhase === "START" ? ["START"] : [];
            }
            if (observed.length === PHASES.length) {
                lastFullCycle = observed;
                observed = [];
                cycles++;
            }
        } catch (error) {
            if (error?.name === "ScriptDeath") return;
            observed = [];
            completedPhase = null;
            call("print", () => ns.print(prefix + "nextUpdate: " + String(error)));
            await call("sleep", () => ns.sleep(CONFIG.waitMs));
        }
    }
}

function status(stage, blocker = null, details = {}) {
    return {
        stage, nextState: null, funds: null, revenue: null, expenses: null, operatingRate: null, reserve: null,
        nextOffer: null, blocker, actions: [], ...details,
    };
}

function inspect(ns, call, readyRound, manageExpansion = true, preset = CONFIG.preset) {
    if (!call("hasCorporation", () => ns.corporation.hasCorporation())) {
        const { selfFund, blocker } = formationPlan(ns, call, preset);
        if (blocker) return status("NO_CORP", blocker, { formation: { selfFund } });
        return status("NO_CORP", null, {
            formation: { selfFund },
            actions: ["Create " + CONFIG.name + (selfFund ? " with player cash" : " with BN3 seed funding")],
        });
    }

    const corp = call("getCorporation", () => ns.corporation.getCorporation());
    if (!PHASES.includes(corp.nextState)) throw new Error("Unknown phase " + corp.nextState);
    const details = {
        nextState: corp.nextState,
        funds: corp.funds,
        valuation: corp.valuation,
        revenue: corp.revenue,
        expenses: corp.expenses,
        numShares: corp.numShares,
        totalShares: corp.totalShares,
        public: corp.public,
        dividendRate: corp.dividendRate,
        dividendEarnings: corp.dividendEarnings,
        divisions: corp.divisions,
        operatingRate: corp.revenue - corp.expenses,
    };

    // A failed detail read still permits observing the corporation's market updates.
    try {
        const seconds = call("getConstants", () => ns.corporation.getConstants()).secondsPerMarketCycle;
        details.secondsPerMarketCycle = seconds;
        const offer = corp.public ? null : call("getInvestmentOffer", () => ns.corporation.getInvestmentOffer());
        details.treasury = treasurySnapshot(corp, seconds);
        details.reserve = details.treasury.reserve;
        details.round = offer?.round ?? null;
        details.nextOffer = Number.isFinite(offer?.funds) && offer.funds > 0 ? offer : null;
        return planCorporation(ns, call, corp, offer, details, readyRound, manageExpansion);
    } catch (error) {
        return status(corp.public ? "STEADY" : null, "Read failed: " + error.message, details);
    }
}

function formationPlan(ns, call, preset = CONFIG.preset) {
    let selfFund = preset === "self-funded";
    let eligibility = call("canCreateCorporation", () => ns.corporation.canCreateCorporation(selfFund));
    if (preset === "auto" && eligibility === "UseSeedMoneyOutsideBN3") {
        selfFund = true;
        eligibility = call("canCreateCorporation", () => ns.corporation.canCreateCorporation(true));
    }
    if (eligibility !== "Success") return { selfFund, blocker: eligibility };
    if (selfFund) {
        const cash = call("getServerMoneyAvailable", () => ns.getServerMoneyAvailable("home"));
        if (cash < CONFIG.selfFundCost + CONFIG.playerReserve) {
            return { selfFund, blocker: "Waiting for player cash" };
        }
    }
    return { selfFund, blocker: null };
}

function planCorporation(ns, call, corp, offer, details, readyRound, manageExpansion = true) {
    const starter = findDivision(ns, call, corp.divisions, CONFIG.starter);
    const missing = REQUIRED_UNLOCKS.filter(name => !call("hasUnlock " + name, () => ns.corporation.hasUnlock(name)));
    const setup = [];
    let setupCost = 0;
    for (const name of missing) {
        setup.push("Purchase " + name);
        setupCost += call("getUnlockCost " + name, () => ns.corporation.getUnlockCost(name));
    }
    if (!starter) {
        setup.push("Open " + CONFIG.starter.name + " (Agriculture)");
        setupCost += call("getIndustryData Agriculture", () => ns.corporation.getIndustryData("Agriculture")).startingCost;
    } else if (!starter.cities.includes(CONFIG.starter.city)) {
        const constants = call("getConstants", () => ns.corporation.getConstants());
        setup.push("Open starter office and warehouse in " + CONFIG.starter.city);
        setupCost += constants.officeInitialCost + constants.warehouseInitialCost;
    } else if (!missing.includes("Warehouse API") && !hasStarterWarehouse(ns, call, starter.name)) {
        setup.push("Purchase starter warehouse in " + CONFIG.starter.city);
        setupCost += call("getConstants", () => ns.corporation.getConstants()).warehouseInitialCost;
    } else if (!missing.length) {
        const city = CONFIG.starter.city;
        const office = call("getOffice " + starter.name, () => ns.corporation.getOffice(starter.name, city));
        const warehouse = call("getWarehouse " + starter.name, () => ns.corporation.getWarehouse(starter.name, city));
        if (office.numEmployees < 3) setup.push("Fill the starter office to three employees");
        const jobs = office.employeeJobs;
        if (!(jobs.Operations > 0 && jobs.Engineer > 0 && jobs.Business > 0)) {
            setup.push("Staff starter Operations, Engineer and Business");
        }
        for (const name of [...INPUTS, ...OUTPUTS]) {
            const material = call("getMaterial " + name, () => ns.corporation.getMaterial(starter.name, city, name));
            if (INPUTS.includes(name)) {
                if (!warehouse.smartSupplyEnabled && material.buyAmount <= 0 && material.stored <= 0) {
                    setup.push("Supply starter " + name);
                }
            } else if (!material.desiredSellAmount || Number(material.desiredSellAmount) === 0) {
                setup.push("Set starter sale order for " + name);
            }
        }
    }

    const stage = corp.public ? "STEADY" : setup.length ? "BOOTSTRAP" : "GROW";
    if (corp.funds < details.reserve) {
        const actions = ["Pause discretionary spending", "Review essential inputs and sell surplus"];
        if (corp.public && corp.dividendRate > 0) actions.push("Reduce dividends to zero");
        return status(stage, "Below corporate cash reserve", { ...details, actions });
    }
    const spendable = corp.funds - details.reserve;
    if (setup.length) {
        const blocker = spendable < setupCost ? "Waiting for the full starter package and reserve" : null;
        return status(stage, blocker, { ...details, actions: setup });
    }
    if (corp.public) {
        details.satelliteSelling = satelliteHasSales(ns, call, starter);
        const actions = ["Maintain supply, staffing, sales and research"];
        if (corp.dividendRate > 0) actions.push("Reduce dividends to the configured default of zero");
        return status("STEADY", null, { ...details, actions });
    }
    const satelliteSelling = satelliteHasSales(ns, call, starter);
    const cashExpansion = manageExpansion && CONFIG.selfFundExpansions
        ? planCashExpansion(ns, call, starter, corp.divisions, offer.round, spendable, details.operatingRate > 0, satelliteSelling) : null;
    details = { ...details, satelliteSelling, cashExpansion };
    if (cashExpansion) {
        return status("EXPAND", null, { ...details, actions: ["Self-fund " + cashExpansion] });
    }
    if (offer.round > CONFIG.fundingRounds.length && details.operatingRate > 0) {
        return status("IPO", null, { ...details, actions: ["Go public with " + CONFIG.ipoShares + " IPO shares"] });
    }
    if (readyRound === offer.round) {
        return status("INVEST", null, { ...details, actions: ["Accept private funding round " + offer.round] });
    }
    if (offer.round > 2) {
        const product = findDivision(ns, call, corp.divisions, CONFIG.product);
        if (!product) {
            const blocker = spendable < CONFIG.fundingRounds[1].cost ? "Waiting for the Tobacco launch budget and reserve" : null;
            return status("EXPAND", blocker, { ...details,
                actions: ["Launch " + CONFIG.product.name + " (" + CONFIG.product.industry + ")"] });
        }
        if (!product.products.length) {
            const city = CONFIG.product.city;
            const actions = [];
            if (!product.cities.includes(city)) actions.push("Open " + product.name + " office in " + city);
            if (!product.cities.includes(city) || !call("hasWarehouse", () => ns.corporation.hasWarehouse(product.name, city))) {
                actions.push("Purchase " + product.name + " warehouse in " + city);
            }
            actions.push("Staff and promote " + product.name + " in " + city, "Start the first Tobacco product");
            return status("EXPAND", null, { ...details, actions });
        }
        if (offer.round === 3 && !(product.lastCycleRevenue > 0)) {
            return status("EXPAND", null, { ...details, actions: ["Bring the first Tobacco product to market"] });
        }
    }
    if (offer.round > 1 && starter && !starter.cities.includes(CONFIG.round1City) &&
        spendable >= CONFIG.fundingRounds[0].cost) {
        return status("EXPAND", null, { ...details, actions: ["Open Agriculture satellite in " + CONFIG.round1City] });
    }
    return status("GROW", null, { ...details, actions: ["Maintain Agriculture and improve the next funding offer"] });
}

function satelliteHasSales(ns, call, agriculture) {
    const city = CONFIG.round1City;
    const corp = ns.corporation;
    return Boolean(agriculture?.cities.includes(city) &&
        call("hasWarehouse", () => corp.hasWarehouse(agriculture.name, city)) &&
        call("getOffice", () => corp.getOffice(agriculture.name, city)).numEmployees >= CONFIG.round1OfficeSize &&
        OUTPUTS.some(name => call("getMaterial " + name, () => corp.getMaterial(agriculture.name, city, name)).actualSellAmount > 0));
}

function planCashExpansion(ns, call, agriculture, divisions, round, spendable, profitable, satellite) {
    const corp = ns.corporation;
    if (round <= 2 && !satellite && agriculture &&
        (agriculture.cities.includes(CONFIG.round1City) ||
            (profitable && spendable >= CONFIG.fundingRounds[0].cost &&
                hasRampStaff(call("getOffice", () => corp.getOffice(agriculture.name, CONFIG.starter.city)))))) {
        return CONFIG.round1City;
    }
    if (round < 3 && satellite) {
        const product = findDivision(ns, call, divisions, CONFIG.product);
        if (product ? !(product.lastCycleRevenue > 0) : profitable && spendable >= CONFIG.fundingRounds[1].cost) {
            return CONFIG.product.name;
        }
    }
    return null;
}

function findDivision(ns, call, names, target) {
    const matches = [target.name, ...target.aliases].filter(name => names.includes(name));
    if (matches.length > 1) throw new Error("Ambiguous managed division for " + target.name);
    if (!matches.length) return null;
    const division = call("getDivision " + matches[0], () => ns.corporation.getDivision(matches[0]));
    if (division.industry !== target.industry) throw new Error("Unexpected industry for " + division.name);
    return division;
}

function applyBootstrap(ns, call, orders, plan, ramp = false, allowUpgrade = false, manualSupply = false,
    supplyReadiness = new Map(), completedPhase = null, manageTobacco = false, preset = CONFIG.preset) {
    if (plan.stage === "NO_CORP") {
        if (plan.blocker) return false;
        const { blocker, selfFund } = formationPlan(ns, call, preset);
        if (blocker) return false;
        call("createCorporation", () => ns.corporation.createCorporation(CONFIG.name, selfFund));
        if (!call("hasCorporation", () => ns.corporation.hasCorporation())) {
            throw new Error("Corporation creation did not complete");
        }
        return true;
    }
    if (plan.blocker?.startsWith("Read failed:")) return false;
    const corp = call("getCorporation", () => ns.corporation.getCorporation());
    const starter = findDivision(ns, call, corp.divisions, CONFIG.starter);
    if (corp.public && !starter) return false;

    if (!starter) {
        if (plan.blocker) return false;
        call("expandIndustry", () => ns.corporation.expandIndustry(CONFIG.starter.industry, CONFIG.starter.name));
        return true;
    }
    const missing = REQUIRED_UNLOCKS.find(name => !call("hasUnlock " + name, () => ns.corporation.hasUnlock(name)));
    if (missing) {
        if (plan.blocker || corp.public) return false;
        call("purchaseUnlock " + missing, () => ns.corporation.purchaseUnlock(missing));
        return true;
    }
    const city = CONFIG.starter.city;
    if (!starter.cities.includes(city)) {
        if (plan.blocker || corp.public) return false;
        call("expandCity", () => ns.corporation.expandCity(starter.name, city));
        return true;
    }
    if (!hasStarterWarehouse(ns, call, starter.name)) {
        if (plan.blocker || corp.public) return false;
        call("purchaseWarehouse", () => ns.corporation.purchaseWarehouse(starter.name, city));
        if (!hasStarterWarehouse(ns, call, starter.name)) throw new Error("Warehouse purchase did not complete");
        return true;
    }

    const office = call("getOffice", () => ns.corporation.getOffice(starter.name, city));
    if (corp.nextState === "START" && !plan.blocker) {
        if (ramp && allowUpgrade && office.size < CONFIG.round1OfficeSize) {
            const increase = CONFIG.round1OfficeSize - office.size;
            const cost = call("getOfficeSizeUpgradeCost", () =>
                ns.corporation.getOfficeSizeUpgradeCost(starter.name, city, increase));
            if (corp.funds - plan.reserve >= cost) {
                call("upgradeOfficeSize", () => ns.corporation.upgradeOfficeSize(starter.name, city, increase));
                if (call("getOffice", () => ns.corporation.getOffice(starter.name, city)).size < CONFIG.round1OfficeSize) {
                    throw new Error("Starter office upgrade did not complete");
                }
                // Hiring is reconciled from the new size on the next START.
                return true;
            }
        }
        if (ramp && office.size >= CONFIG.round1OfficeSize && office.numEmployees <= CONFIG.round1OfficeSize) {
            if (staffRampOffice(ns, call, starter.name, city, office)) return true;
        } else if (staffStarter(ns, call, starter.name, city, office)) {
            return true;
        }
    }

    const warehouse = call("getWarehouse", () => ns.corporation.getWarehouse(starter.name, city));
    const spendable = corp.funds - plan.reserve;
    const phase = corp.nextState;
    if (manageTobacco && CONFIG.tobacco.exportPlants && completedPhase === "START" &&
        phase === "PURCHASE" && !plan.blocker && plan.round > CONFIG.tobacco.exportUnlockAfterRound &&
        spendable >= CONFIG.purchaseBudget && !call("hasUnlock Export", () => ns.corporation.hasUnlock("Export"))) {
        const tobacco = findDivision(ns, call, corp.divisions, CONFIG.product);
        if (tobacco?.cities.includes(CONFIG.product.city) && tobacco.products.length > 0 &&
            call("hasWarehouse", () => ns.corporation.hasWarehouse(tobacco.name, CONFIG.product.city)) &&
            ensureOptionalUnlock(ns, call, "Export", spendable - CONFIG.purchaseBudget) !== null) return true;
    }
    if (phase === "PURCHASE" && office.employeeJobs.Operations && office.employeeJobs.Engineer) {
        const stable = supplyIsStable(ns, call, supplyReadiness, starter.name, city, office, warehouse, completedPhase);
        const fallback = manualSupply || !stable || plan.cashExpansion === CONFIG.round1City ||
            (plan.cashExpansion && !call("hasUnlock Smart Supply", () => ns.corporation.hasUnlock("Smart Supply")));
        return preparePurchases(ns, call, orders, starter, warehouse, spendable, plan.operatingRate > 0,
            hasRampStaff(office) && plan.satelliteSelling && allowUpgrade, fallback, city, boostBudgetForSite(plan), agricultureInputCycles(corp.funds, plan.satelliteSelling));
    }
    let changed = clearStarterPurchases(ns, call, orders, starter.name, warehouse);
    if (phase === "START" && plan.operatingRate > 0) {
        changed = upgradeCrowdedWarehouses(ns, call, starter, manageTobacco) || changed;
    }
    if (phase === "EXPORT" && (CONFIG.exports.length || (manageTobacco && CONFIG.tobacco.exportPlants))) {
        changed = reconcileExports(ns, call, starter, spendable, manageTobacco) || changed;
    }
    if (phase === "SALE") changed = priceStarterOutputs(ns, call, starter, warehouse) || changed;
    return changed;
}

// Only manage expansion sites that this controller supplies.
function upgradeCrowdedWarehouses(ns, call, starter, manageExpansion) {
    const corp = ns.corporation;
    const sites = [[starter, CONFIG.starter.city]];
    if (manageExpansion) {
        sites.push([starter, CONFIG.round1City]);
        const tobacco = findDivision(ns, call, corp.getCorporation().divisions, CONFIG.product);
        if (tobacco) sites.push([tobacco, CONFIG.product.city]);
    }
    const seconds = corp.getConstants().secondsPerMarketCycle;
    let changed = false;
    for (const [division, city] of sites) {
        if (!division.cities.includes(city) || !corp.hasWarehouse(division.name, city)) continue;
        const warehouse = corp.getWarehouse(division.name, city);
        if (warehouse.sizeUsed < warehouse.size * CONFIG.warehouseUpgradeAt) continue;
        const live = corp.getCorporation();
        const reserve = operatingReserve(live.expenses, seconds, live.revenue);
        const cost = corp.getUpgradeWarehouseCost(division.name, city, 1);
        if (live.nextState !== "START" || live.revenue <= live.expenses || !(cost > 0 && live.funds - reserve >= 3 * cost)) continue;
        corp.upgradeWarehouse(division.name, city, 1);
        changed = true;
    }
    return changed;
}

function hasStarterWarehouse(ns, call, division) {
    return call("hasWarehouse", () => ns.corporation.hasWarehouse(division, CONFIG.starter.city));
}

function staffStarter(ns, call, division, city, office) {
    const jobs = { ...office.employeeJobs };
    let vacancies = Math.min(3, office.size) - office.numEmployees;
    let changed = false;
    for (const job of STARTER_JOBS) {
        if (jobs[job] || vacancies <= 0) continue;
        if (!call("hireEmployee " + job, () => ns.corporation.hireEmployee(division, city, job))) {
            throw new Error("Could not hire starter " + job);
        }
        jobs[job] = 1;
        vacancies--;
        changed = true;
    }

    // Keep other jobs where possible. Free a seat before filling a missing required role.
    let unassigned = jobs.Unassigned;
    for (const job of STARTER_JOBS) {
        if (jobs[job]) continue;
        if (!unassigned) {
            const donor = Object.keys(jobs).find(role => role !== "Unassigned" &&
                jobs[role] > Number(STARTER_JOBS.includes(role)));
            if (!donor) continue;
            setStarterJob(ns, call, division, city, donor, --jobs[donor]);
            unassigned++;
        }
        setStarterJob(ns, call, division, city, job, 1);
        jobs[job] = 1;
        unassigned--;
        changed = true;
    }
    return changed;
}

function setStarterJob(ns, call, division, city, job, count) {
    if (!call("setJobAssignment " + job, () => ns.corporation.setJobAssignment(division, city, job, count))) {
        throw new Error("Could not queue starter assignment " + job);
    }
}

function readMaterial(ns, call, division, name, city = CONFIG.starter.city) {
    return call("getMaterial " + name, () => ns.corporation.getMaterial(division, city, name));
}

function supplyIsStable(ns, call, readiness, division, city, office, warehouse, completedPhase) {
    const factories = call("getUpgradeLevel Smart Factories", () => ns.corporation.getUpgradeLevel("Smart Factories"));
    const fingerprint = JSON.stringify([office.size, office.employeeJobs, warehouse.size, factories]);
    const key = division + "/" + city;
    const previous = readiness.get(key);
    const count = previous?.fingerprint === fingerprint ? previous.count + Number(completedPhase === "START") : 0;
    readiness.set(key, { fingerprint, count });
    return count >= CONFIG.supplySettleCycles;
}

function preparePurchases(ns, call, orders, division, warehouse, spendable, profitable, ramped, manualSupply = false,
    city = CONFIG.starter.city, boostBudget = CONFIG.boostPurchaseBudget, inputCycles = 0) {
    const { secondsPerMarketCycle: seconds } = call("getConstants", () => ns.corporation.getConstants());
    const industry = call("getIndustryData", () => ns.corporation.getIndustryData(division.industry));
    const inputs = INPUTS.map(name => readStock(ns, call, division.name, name, city));
    const room = Math.max(0, warehouse.size * CONFIG.warehouseFill - warehouse.sizeUsed);
    const inputDemand = inputs.map(input => {
        const consumption = -input.productionAmount * seconds;
        const seed = industry.requiredMaterials[input.name] * CONFIG.starterProductionUnits;
        const buffer = Math.max(inputCycles, ramped ? CONFIG.boostedInputBufferCycles : 1.1);
        return { ...input, quantity: Math.max(0, Math.max(seed, consumption * buffer) - input.stored) };
    });

    // The engine can fill available space with Smart Supply, so bound its maximum bill
    // using physical capacity and the highest input cost per unit of storage.
    const maxSmartCost = Math.max(0, warehouse.size - warehouse.sizeUsed) *
        Math.max(...inputs.map(input => input.marketPrice / input.size));
    const mature = division.lastCycleRevenue > 0 && inputs.every(input => input.productionAmount < 0);
    const healthy = !inputCycles && room > 0 && mature && measureOrder(inputDemand, "size") <= room &&
        maxSmartCost <= Math.min(spendable, CONFIG.smartSupplyPurchaseBudget);
    let smart = warehouse.smartSupplyEnabled;
    let changed = false;
    if (smart && (manualSupply || !CONFIG.smartSupply || !healthy)) {
        setSmartSupply(ns, call, division.name, false, city);
        smart = false;
        changed = true;
    } else if (!manualSupply && CONFIG.smartSupply && healthy && (profitable || call("hasUnlock Smart Supply", () => ns.corporation.hasUnlock("Smart Supply")))) {
        const cost = ensureOptionalUnlock(ns, call, "Smart Supply", spendable - maxSmartCost);
        if (cost !== null) {
            spendable -= cost;
            for (const name of INPUTS) {
                call("setSmartSupplyOption " + name, () =>
                    ns.corporation.setSmartSupplyOption(division.name, city, name, "leftovers"));
            }
            if (!smart) {
                setSmartSupply(ns, call, division.name, true, city);
                smart = true;
                changed = true;
            }
        }
    }

    const inputCost = smart ? maxSmartCost : measureOrder(inputDemand, "marketPrice");
    const inputSpace = measureOrder(inputDemand, "size");
    const inputScale = smart ? 1 : fitOrder(inputCost, inputSpace, Math.min(spendable, CONFIG.purchaseBudget), room);
    if (!smart) {
        changed = orders.write(division.name, city, inputDemand, input => input.quantity * inputScale / seconds) || changed;
    }
    const boosts = BOOSTS.map(name => readStock(ns, call, division.name, name, city));
    const boostUsed = boosts.reduce((total, stock) => total + stock.stored * stock.size, 0);
    const boostSpace = warehouse.size * CONFIG.boostSpace;
    const totalWeight = BOOSTS.reduce((total, name) => total + CONFIG.boostWeights[name], 0);
    const demand = boosts.map(stock => ({
        ...stock, quantity: Math.max(0, boostSpace * CONFIG.boostWeights[stock.name] / totalWeight / stock.size - stock.stored),
    }));
    const scale = CONFIG.boosts && ramped && profitable && division.lastCycleRevenue > division.lastCycleExpenses ? fitOrder(measureOrder(demand, "marketPrice"), measureOrder(demand, "size"),
        Math.min(boostBudget, spendable - inputCost * inputScale),
        Math.min(boostSpace - boostUsed, room - inputSpace * inputScale)) : 0;
    return orders.write(division.name, city, demand, stock => stock.quantity * scale / seconds) || changed;
}

function agricultureInputCycles(funds, satelliteSelling) {
    // Buy three cycles' worth to leave roughly two cycles on hand after production.
    return satelliteSelling && funds >= CONFIG.agricultureBufferCashThreshold ? CONFIG.agricultureHighCashInputCycles : 0;
}

function boostBudgetForSite(plan) {
    const profit = plan.operatingRate * plan.secondsPerMarketCycle;
    if (!Number.isFinite(profit)) return 0;
    return Math.max(0, Math.min(CONFIG.boostPurchaseBudget, profit * CONFIG.boostProfitSharePerCity));
}

function readStock(ns, call, division, name, city = CONFIG.starter.city) {
    const data = readMaterial(ns, call, division, name, city);
    const { size } = call("getMaterialData " + name, () => ns.corporation.getMaterialData(name));
    return { ...data, name, size };
}

function measureOrder(stocks, field) {
    return stocks.reduce((total, stock) => total + stock.quantity * stock[field], 0);
}

function fitOrder(cost, volume, budget, room) {
    if (budget <= 0 || room <= 0) return 0;
    return Math.min(1, cost > 0 ? budget / cost : 1, volume > 0 ? room / volume : 1);
}

function setSmartSupply(ns, call, division, enabled, city = CONFIG.starter.city) {
    call("setSmartSupply", () => ns.corporation.setSmartSupply(division, city, enabled));
    const live = call("getWarehouse", () => ns.corporation.getWarehouse(division, city));
    if (live.smartSupplyEnabled !== enabled) throw new Error("Smart Supply change did not complete");
}

// Return committed corporate cash, or null when the unlock remains unaffordable.
function ensureOptionalUnlock(ns, call, name, spendable) {
    if (call("hasUnlock " + name, () => ns.corporation.hasUnlock(name))) return 0;
    const cost = call("getUnlockCost " + name, () => ns.corporation.getUnlockCost(name));
    if (spendable < cost) return null;
    call("purchaseUnlock " + name, () => ns.corporation.purchaseUnlock(name));
    if (!call("hasUnlock " + name, () => ns.corporation.hasUnlock(name))) {
        throw new Error("Unlock did not complete: " + name);
    }
    return cost;
}

function clearStarterPurchases(ns, call, orders, division, warehouse = null, city = CONFIG.starter.city) {
    warehouse ??= call("getWarehouse", () => ns.corporation.getWarehouse(division, city));
    const names = warehouse.smartSupplyEnabled ? BOOSTS : [...INPUTS, ...BOOSTS];
    const stocks = names.map(name => ({ ...readMaterial(ns, call, division, name, city), name }));
    return orders.write(division, city, stocks, () => 0);
}

// Persist ownership before setting a rate. A stopped script leaves its buy rates active in game.
function createPurchaseOrders(ns, file) {
    const entries = new Map(JSON.parse(ns.read(file) || "[]"));
    const save = () => ns.write(file, JSON.stringify([...entries]), "w");

    function write(division, city, stocks, rateFor) {
        const changes = [];
        for (const stock of stocks) {
            const rate = rateFor(stock);
            if (Math.abs(stock.buyAmount - rate) < 1e-9) continue;
            const key = JSON.stringify([division, city, stock.name]);
            changes.push({ key, name: stock.name, rate });
            if (rate > 0) {
                // Either rate can be live if the batch is interrupted between material writes.
                const owned = entries.get(key) ?? [];
                entries.set(key, owned.includes(stock.buyAmount) ? [stock.buyAmount, rate] : [rate]);
            }
        }
        if (changes.some(change => change.rate > 0)) save();
        let retired = false;
        for (const { key, name, rate } of changes) {
            ns.corporation.buyMaterial(division, city, name, rate);
            if (rate === 0 && entries.delete(key)) retired = true;
        }
        if (retired) save();
        return changes.length > 0;
    }

    function clear() {
        if (!entries.size) return;
        const corp = ns.corporation;
        const divisions = corp.hasCorporation() ? corp.getCorporation().divisions : [];
        for (const [key, rates] of entries) {
            const [division, city, material] = JSON.parse(key);
            try {
                if (divisions.includes(division) && corp.getDivision(division).cities.includes(city) &&
                    corp.hasWarehouse(division, city) && rates.includes(corp.getMaterial(division, city, material).buyAmount)) {
                    corp.buyMaterial(division, city, material, 0);
                }
                entries.delete(key);
            } catch (error) {
                ns.print("Could not clear " + key + ": " + String(error));
            }
        }
        save();
    }
    return { write, clear };
}

function readSettlement(ns, call, allowZeroRevenue = false) {
    const corp = call("getCorporation", () => ns.corporation.getCorporation());
    const starter = findDivision(ns, call, corp.divisions, CONFIG.starter);
    if (!starter || (!allowZeroRevenue && !(starter.lastCycleRevenue > 0)) ||
        !call("hasUnlock Warehouse API", () => ns.corporation.hasUnlock("Warehouse API")) ||
        !hasStarterWarehouse(ns, call, starter.name)) return null;
    const { secondsPerMarketCycle: seconds } = call("getConstants", () => ns.corporation.getConstants());
    return {
        division: starter.name,
        receipts: starter.lastCycleRevenue * seconds,
        expenses: starter.lastCycleExpenses * seconds,
        funds: corp.funds,
    };
}

function formatSettlement(sample) {
    const amount = n => n.toFixed(2);
    return "START #" + sample.number + " revenue $" + amount(sample.revenue) + "/s, expenses $" +
        amount(sample.expenses) + "/s, funds $" + amount(sample.funds) +
        (sample.fundsChange === null ? "" : ", funds change $" + amount(sample.fundsChange)) +
        (sample.materialPurchases ? ", materials $" + amount(sample.materialPurchases.total / sample.materialPurchases.seconds) +
            "/s (inputs $" + amount(sample.materialPurchases.inputs / sample.materialPurchases.seconds) +
            ", boosts $" + amount(sample.materialPurchases.boosts / sample.materialPurchases.seconds) + ")" :
            ", materials unavailable") +
        formatRunway(sample.treasury) + formatDevelopment(sample.development) + formatSupplyInputs(sample.productInputs, "Tobacco") +
        (sample.agricultureInputs ?? []).map(site => formatSupplyInputs(site, site.division + "/" + site.city)).join("") +
        ", funding gate " + (sample.fundingReady ? "passed" : "waiting") +
        " (" + sample.profitStreak + " profitable cycles with rising cash excluding investment proceeds, " +
        sample.rampProfitStreak + " with nine-seat staffing)";
}

function finishBootstrapOrders(ns, call, orders, settlement) {
    const warehouse = call("getWarehouse", () => ns.corporation.getWarehouse(settlement.division, CONFIG.starter.city));
    settlement.smartSupply = warehouse.smartSupplyEnabled;
    settlement.warehouse = { occupied: warehouse.sizeUsed, capacity: warehouse.size };
    settlement.sales = OUTPUTS.map(name => {
        const stock = readMaterial(ns, call, settlement.division, name);
        return { name, order: stock.desiredSellAmount, price: stock.desiredSellPrice,
            unitsSoldPerSecond: stock.actualSellAmount, stored: stock.stored };
    });
    if (call("hasUnlock Office API", () => ns.corporation.hasUnlock("Office API"))) {
        const office = call("getOffice", () => ns.corporation.getOffice(settlement.division, CONFIG.starter.city));
        settlement.office = { employees: office.numEmployees, energy: office.avgEnergy, morale: office.avgMorale };
    }
    if (warehouse.smartSupplyEnabled) {
        setSmartSupply(ns, call, settlement.division, false);
        warehouse.smartSupplyEnabled = false;
    }
    clearStarterPurchases(ns, call, orders, settlement.division, warehouse);
}

function priceStarterOutputs(ns, call, division, warehouse, city = CONFIG.starter.city) {
    const ta1 = call("hasResearched Market-TA.I", () => ns.corporation.hasResearched(division.name, "Market-TA.I"));
    const ta2 = call("hasResearched Market-TA.II", () => ns.corporation.hasResearched(division.name, "Market-TA.II"));
    const { secondsPerMarketCycle: seconds } = call("getConstants", () => ns.corporation.getConstants());
    const crowded = warehouse.sizeUsed >= warehouse.size * CONFIG.warehouseFill;
    let changed = false;
    for (const name of OUTPUTS) {
        const stock = call("getMaterial " + name, () => ns.corporation.getMaterial(division.name, city, name));
        const output = Math.max(0, stock.productionAmount * seconds);
        const backlog = stock.stored > Math.max(1, output * 1.25);
        const clearing = crowded || backlog;
        const strongSales = output > 0 && stock.actualSellAmount >= stock.productionAmount * 0.95;
        let price = "MP";
        if (!ta2 && (!ta1 || clearing)) {
            if (crowded) price = "MP*0.85";
            else if (backlog) price = "MP*0.95";
            else if (strongSales) {
                const { baseMarkup } = call("getMaterialData " + name, () => ns.corporation.getMaterialData(name));
                // The game penalizes sales above market price plus quality / baseMarkup.
                const markup = Math.floor(stock.quality / baseMarkup * 0.9 * 1e6) / 1e6;
                if (Number.isFinite(markup) && markup > 0) price = "MP+" + markup.toFixed(6);
            }
        }
        // TA flags have setters but no material readback. Reapplying the desired flags is idempotent.
        if (ta1) call("setMaterialMarketTA1 " + name, () => ns.corporation.setMaterialMarketTA1(division.name, city, name, !ta2 && !clearing));
        if (ta2) call("setMaterialMarketTA2 " + name, () => ns.corporation.setMaterialMarketTA2(division.name, city, name, true));
        if (stock.desiredSellAmount === "MAX" && stock.desiredSellPrice === price) continue;
        call("sellMaterial " + name, () => ns.corporation.sellMaterial(division.name, city, name, "MAX", price));
        changed = true;
    }
    return changed;
}

function reconcileExports(ns, call, source, spendable, manageTobacco = false) {
    const sourceCity = CONFIG.starter.city;
    const orders = new Map();
    for (const route of CONFIG.exports) {
        const { material, targetDivision, targetCity, targetIndustry, unitsPerCycle } = route;
        if (!OUTPUTS.includes(material) || !(Number.isFinite(unitsPerCycle) && unitsPerCycle >= 0)
            || (source.name === targetDivision && sourceCity === targetCity)) {
            throw new Error("Invalid configured Agriculture export");
        }
        const key = JSON.stringify([sourceCity, material, targetDivision, targetCity]);
        if (orders.has(key)) throw new Error("Duplicate configured export: " + key);
        orders.set(key, { ...route, sourceCity });
    }
    const corp = call("getCorporation", () => ns.corporation.getCorporation());
    // Market top-ups cover shortfalls until an export has arrived.
    if (manageTobacco && CONFIG.tobacco.exportPlants && call("hasUnlock Export", () => ns.corporation.hasUnlock("Export"))) {
        const target = findDivision(ns, call, corp.divisions, CONFIG.product);
        if (target) {
            const targetCity = CONFIG.product.city;
            for (const city of new Set([sourceCity, CONFIG.round1City])) {
                if (!source.cities.includes(city) ||
                    !call("hasWarehouse", () => ns.corporation.hasWarehouse(source.name, city))) continue;
                const key = JSON.stringify([city, "Plants", target.name, targetCity]);
                if (!orders.has(key)) {
                    orders.set(key, { sourceCity: city, material: "Plants", targetDivision: target.name, targetCity,
                        targetIndustry: target.industry, automatic: true });
                }
            }
        }
    }
    const eligible = [];
    for (const route of orders.values()) {
        if (!corp.divisions.includes(route.targetDivision)) continue;
        const target = call("getDivision " + route.targetDivision, () => ns.corporation.getDivision(route.targetDivision));
        if (target.industry !== route.targetIndustry) throw new Error("Unexpected export target industry: " + target.name);
        if (!target.cities.includes(route.targetCity) ||
            !call("hasWarehouse " + target.name, () => ns.corporation.hasWarehouse(target.name, route.targetCity))) continue;
        const data = call("getIndustryData " + target.industry, () => ns.corporation.getIndustryData(target.industry));
        if (!data.requiredMaterials[route.material]) throw new Error("Export target does not consume " + route.material);
        eligible.push({ ...route, target, required: data.requiredMaterials[route.material] });
    }
    if (!eligible.length) return false;
    const { secondsPerMarketCycle: seconds } = call("getConstants", () => ns.corporation.getConstants());
    const sender = new Map();
    const receiver = new Map();
    const inbound = new Map();
    const plans = [];
    for (const route of eligible) {
        const { sourceCity: city, material, targetDivision, targetCity, unitsPerCycle, automatic, target, required } = route;
        const stockKey = JSON.stringify([city, material]);
        let stock = sender.get(stockKey);
        if (!stock) {
            const data = readStock(ns, call, source.name, material, city);
            stock = { ...data, available: data.stored };
            sender.set(stockKey, stock);
        }
        const targetKey = JSON.stringify([targetDivision, targetCity]);
        if (!receiver.has(targetKey)) {
            const target = call("getWarehouse " + targetDivision, () => ns.corporation.getWarehouse(targetDivision, targetCity));
            receiver.set(targetKey, Math.max(0, target.size * CONFIG.warehouseFill - target.sizeUsed));
        }
        const input = call("getMaterial " + targetDivision + " " + material, () =>
            ns.corporation.getMaterial(targetDivision, targetCity, material));
        const targetStock = automatic
            ? tobaccoInputTarget(ns, call, target, targetCity, required, input, seconds)
            : Math.max(unitsPerCycle, -input.productionAmount * seconds);
        const saleStock = automatic ? Math.max(0, stock.productionAmount) * seconds * CONFIG.tobacco.exportSaleShare : 0;
        const inputKey = JSON.stringify([targetDivision, targetCity, material]);
        const committed = inbound.get(inputKey) ?? 0;
        const units = Math.max(0, Math.min(automatic ? Infinity : unitsPerCycle, targetStock - input.stored - committed,
            stock.available - saleStock, receiver.get(targetKey) / stock.size));
        const rate = Math.floor(units / seconds * 1e6) / 1e6;
        stock.available -= rate * seconds;
        inbound.set(inputKey, committed + rate * seconds);
        receiver.set(targetKey, receiver.get(targetKey) - rate * seconds * stock.size);
        const existing = stock.exports.find(entry => entry.division === targetDivision && entry.city === targetCity);
        if (existing && Number(existing.amount) === rate) continue;
        if (existing || rate > 0) plans.push({ ...route, existing, rate });
    }
    if (!plans.length) return false;
    if (ensureOptionalUnlock(ns, call, "Export", spendable) === null) return false;
    for (const { sourceCity, material, targetDivision, targetCity, existing, rate } of plans) {
        if (existing) call("cancelExportMaterial " + material, () =>
            ns.corporation.cancelExportMaterial(source.name, sourceCity, targetDivision, targetCity, material));
        if (rate > 0) call("exportMaterial " + material, () =>
            ns.corporation.exportMaterial(source.name, sourceCity, targetDivision, targetCity, material, rate.toFixed(6)));
    }
    return true;
}

function starterOffice(ns, call) {
    const corp = call("getCorporation", () => ns.corporation.getCorporation());
    const division = findDivision(ns, call, corp.divisions, CONFIG.starter);
    const city = CONFIG.starter.city;
    if (!division?.cities.includes(city) || !call("hasUnlock Office API", () => ns.corporation.hasUnlock("Office API"))) return null;
    return { division: division.name, office: call("getOffice", () => ns.corporation.getOffice(division.name, city)) };
}

function hasRampStaff(office) {
    return office?.numEmployees === CONFIG.round1OfficeSize &&
        Object.entries(RAMP_JOBS).every(([role, count]) => office.employeeJobs[role] === count);
}

function staffRampOffice(ns, call, division, city, office, targets = RAMP_JOBS) {
    const seats = Object.values(targets).reduce((sum, count) => sum + count, 0);
    if (office.numEmployees > seats ||
        (office.numEmployees === seats && Object.entries(targets).every(([job, count]) => office.employeeJobs[job] === count))) return false;
    const jobs = { ...office.employeeJobs };
    let vacancies = seats - office.numEmployees;
    let changed = false;
    for (const [job, target] of Object.entries(targets)) {
        while (vacancies && (jobs[job] ?? 0) < target) {
            if (!call("hireEmployee " + job, () => ns.corporation.hireEmployee(division, city, job))) {
                throw new Error("Could not hire " + job);
            }
            jobs[job] = (jobs[job] ?? 0) + 1;
            vacancies--;
            changed = true;
        }
    }
    for (const [job, current] of Object.entries(jobs)) {
        if (job === "Unassigned" || current <= (targets[job] ?? 0)) continue;
        setStarterJob(ns, call, division, city, job, targets[job] ?? 0);
        changed = true;
    }
    for (const [job, target] of Object.entries(targets)) {
        if ((jobs[job] ?? 0) >= target) continue;
        setStarterJob(ns, call, division, city, job, target);
        changed = true;
    }
    return changed;
}

function purchaseSnapshot(ns, call) {
    const corp = call("getCorporation", () => ns.corporation.getCorporation());
    const division = findDivision(ns, call, corp.divisions, CONFIG.starter);
    if (!division?.cities.includes(CONFIG.starter.city) ||
        !call("hasUnlock Warehouse API", () => ns.corporation.hasUnlock("Warehouse API")) ||
        !hasStarterWarehouse(ns, call, division.name)) return null;
    const { secondsPerMarketCycle: seconds } = call("getConstants", () => ns.corporation.getConstants());
    const stocks = [...INPUTS, ...BOOSTS].map(name => {
        const data = readMaterial(ns, call, division.name, name);
        return { name, stored: data.stored, price: data.marketPrice, buyRate: data.buyAmount };
    });
    return { division: division.name, seconds, stocks };
}

function measurePurchases(before, after) {
    if (!before || !after || before.division !== after.division || before.seconds !== after.seconds ||
        before.stocks.some((stock, i) => after.stocks[i].price !== stock.price || after.stocks[i].stored < stock.stored)) return null;
    const items = before.stocks.map((stock, i) => {
        const quantity = after.stocks[i].stored - stock.stored;
        return { name: stock.name, quantity, spend: quantity * stock.price,
            orderRate: after.stocks[i].buyRate, receivedRate: quantity / before.seconds };
    });
    const sum = names => items.filter(item => names.includes(item.name)).reduce((total, item) => total + item.spend, 0);
    const inputs = sum(INPUTS);
    const boosts = sum(BOOSTS);
    return { seconds: before.seconds, inputs, boosts, total: inputs + boosts, items };
}

function productionInputs(ns, call, snapshot) {
    const data = call("getIndustryData", () => ns.corporation.getIndustryData(CONFIG.starter.industry));
    const inputs = snapshot.stocks.filter(stock => INPUTS.includes(stock.name)).map(stock => ({
        name: stock.name, before: stock.stored, unitsPerOutput: data.requiredMaterials[stock.name],
    }));
    return { division: snapshot.division, seconds: snapshot.seconds, inputs,
        inputCapacity: Math.min(...inputs.map(input => input.before / input.unitsPerOutput)) };
}

function formatProductivity(sample) {
    if (!sample.office && !sample.production) return "";
    const values = sample.office ?
        "Office " + sample.office.energy.toFixed(1) + " energy / " + sample.office.morale.toFixed(1) + " morale, " +
        Object.entries(sample.office.jobs).filter(([, count]) => count > 0).map(([job, count]) => job + " " + count).join(", ") :
        "Office data unavailable";
    const prod = sample.production;
    if (!prod) return values + ". PRODUCTION inventory unavailable.";
    const stock = prod.inputs.map(input => input.name + " " + input.before.toFixed(2) +
        (input.remaining === undefined ? "" : " → " + input.remaining.toFixed(2))).join(", ");
    return values + ". PRODUCTION " + stock + ", input capacity " + prod.inputCapacity.toFixed(2) +
        (prod.outputUnits === undefined ? "" : " output units, produced " + prod.outputUnits.toFixed(2)) + ".";
}

function careForManagedOffices(ns, call, plan, recovering, manageExpansion) {
    const corp = ns.corporation;
    const totals = { spent: 0, teas: 0, party: 0, recovering: false };
    if (!plan.divisions?.length || !call("hasUnlock Office API", () => corp.hasUnlock("Office API"))) return totals;
    const agri = findDivision(ns, call, plan.divisions, CONFIG.starter);
    const tobacco = manageExpansion ? findDivision(ns, call, plan.divisions, CONFIG.product) : null;
    const sites = [[agri, CONFIG.starter.city]];
    if (manageExpansion) sites.push([agri, CONFIG.round1City], [tobacco, CONFIG.product.city]);
    const { teaCostPerEmployee } = call("getConstants", () => corp.getConstants());
    const budget = Math.max(0, Math.min(CONFIG.officeCareBudget, plan.funds - plan.reserve));
    for (const [division, city] of sites) {
        if (!division?.cities.includes(city)) continue;
        const office = call("getOffice", () => corp.getOffice(division.name, city));
        if (!office.numEmployees) continue;
        const key = division.name + "/" + city;
        const targetEnergy = Math.min(office.maxEnergy, CONFIG.officeCareTarget);
        const targetMorale = Math.min(office.maxMorale, CONFIG.officeCareTarget);
        const low = Math.min(office.avgEnergy, office.avgMorale) < CONFIG.officeCareTrigger;
        if (low) recovering.add(key);
        if (office.avgEnergy >= targetEnergy - 1 && office.avgMorale >= targetMorale - 2) recovering.delete(key);
        if (!recovering.has(key)) continue;
        totals.recovering ||= low;
        const teaCost = office.numEmployees * teaCostPerEmployee;
        if (office.avgEnergy < targetEnergy - 1 && budget - totals.spent >= teaCost &&
            call("buyTea", () => corp.buyTea(division.name, city))) {
            totals.spent += teaCost;
            totals.teas++;
        }
        if (office.avgMorale < targetMorale - 2 && budget > totals.spent) {
            const perEmployee = Math.min((budget - totals.spent) / office.numEmployees,
                Math.ceil(1e7 * (targetMorale / Math.max(1, office.avgMorale) - 1)));
            if (call("throwParty", () => corp.throwParty(division.name, city, perEmployee)) > 1) {
                const cost = perEmployee * office.numEmployees;
                totals.party += cost;
                totals.spent += cost;
            }
        }
    }
    return totals;
}

function operatingReserve(expenses, seconds, revenue) {
    const burn = Math.max(0, expenses - revenue);
    return Math.max(CONFIG.cashReserve, Math.max(0, expenses) * seconds * CONFIG.reserveCycles,
        burn * 86_400 * CONFIG.reserveBurnDays);
}

function inspectGrowth(ns, call, round, rank) {
    if (!rank && !(round >= 1 && round <= CONFIG.fundingRounds.length)) return null;
    const names = call("getCorporation", () => ns.corporation.getCorporation()).divisions;
    const starter = findDivision(ns, call, names, CONFIG.starter);
    const tobacco = findDivision(ns, call, names, CONFIG.product);
    const sites = [];
    let facilities = 0;
    for (const name of names) {
        const division = name === starter?.name ? starter : name === tobacco?.name ? tobacco :
            call("getDivision " + name, () => ns.corporation.getDivision(name));
        facilities += division.cities.length;
        for (const city of division.cities) {
            facilities += Number(call("hasWarehouse", () => ns.corporation.hasWarehouse(name, city)));
        }
    }
    for (const division of [starter, tobacco].filter(Boolean)) {
        for (const city of division.cities) {
            if (!rank && division === starter && (round !== 2 || city !== CONFIG.round1City)) continue;
            if (!call("hasWarehouse", () => ns.corporation.hasWarehouse(division.name, city))) continue;
            const warehouse = call("getWarehouse", () => ns.corporation.getWarehouse(division.name, city));
            const office = call("getOffice", () => ns.corporation.getOffice(division.name, city));
            const outputs = division === starter
                ? OUTPUTS.map(name => call("getMaterial " + name, () => ns.corporation.getMaterial(division.name, city, name)))
                : division.products.map(name => call("getProduct " + name, () => ns.corporation.getProduct(division.name, city, name)))
                    .filter(product => product.developmentProgress >= 100);
            sites.push({
                city, division: division.name, agriculture: division === starter, office, outputs, adVerts: division.numAdVerts,
                fill: warehouse.sizeUsed / warehouse.size,
            });
        }
    }
    return {
        sites,
        facilities,
        satelliteSelling: sites.some(site => site.agriculture && site.city === CONFIG.round1City &&
            site.office.numEmployees >= CONFIG.round1OfficeSize && site.outputs.some(output => output.actualSellAmount > 0)),
        productSelling: sites.some(site => !site.agriculture && site.outputs.some(output => output.actualSellAmount > 0)),
        tobaccoExists: Boolean(tobacco),
        tobaccoDivision: tobacco,
        tobaccoEstablished: sites.some(site => !site.agriculture && site.outputs.length > 0),
        tobaccoSelling: tobacco?.lastCycleRevenue > 0 && sites.some(site => !site.agriculture &&
            site.outputs.some(output => output.actualSellAmount >= CONFIG.tobacco.minimumSellerRate)),
        twoTobaccoSellers: tobacco?.lastCycleRevenue > 0 && sites.some(site => !site.agriculture &&
            site.city === CONFIG.product.city && site.outputs.filter(output =>
                output.actualSellAmount >= CONFIG.tobacco.minimumSellerRate && output.productionAmount > 0 &&
                output.actualSellAmount >= output.productionAmount * CONFIG.upgradeSellThrough).length >= 2),
        productProfitable: Boolean(tobacco && tobacco.lastCycleRevenue > tobacco.lastCycleExpenses),
    };
}

function fundingPackageCost(rule) {
    return rule.cost ?? Object.values(rule.allocations).reduce((sum, cost) => sum + cost, 0);
}

function offerFloor(rule, funds, reserve) {
    const cost = fundingPackageCost(rule);
    return Math.max(0, cost + reserve - funds);
}

function fundingCoverage(rule, funds, reserve, operatingRate, seconds, first) {
    const coverageNeeded = Math.max(0, fundingPackageCost(rule) + reserve - funds);
    // Use the latest settled operating profit and the game's market-cycle duration.
    const projectedProfit = first && Number.isFinite(operatingRate) && Number.isFinite(seconds) && seconds > 0
        ? Math.max(0, operatingRate) * seconds * CONFIG.round1ProfitProjectionSettlements : 0;
    const floor = first ? CONFIG.round1MinimumOffer : offerFloor(rule, funds, reserve);
    const target = first ? Math.max(floor, coverageNeeded - projectedProfit) : floor;
    return { coverageNeeded, projectedProfit, floor, target };
}

function roundOfferFactor(round) {
    const index = round - 1;
    return CONFIG.fundingModel.shareFractions[index] * CONFIG.fundingModel.multipliers[index];
}

function privateCycleValuation(funds, assetGrowthRate, facilityFactor) {
    const gross = (10e9 + funds / 3 + Math.max(0, assetGrowthRate) * 315e3) * facilityFactor;
    return Math.max(10e9, Math.floor(gross / 1e6) * 1e6) * CONFIG.fundingModel.valuationMultiplier;
}

function modelFunding(plan, window, growth, round, target) {
    const factor = roundOfferFactor(round);
    const facilities = growth?.facilities ?? 0;
    const facilityFactor = Math.pow(1.1, facilities / 12);
    const scale = facilityFactor * CONFIG.fundingModel.valuationMultiplier;
    // The API exposes a smoothed valuation, so this residual is an implied rate.
    const observations = window.filter(sample => Number.isFinite(sample.valuation) && Number.isFinite(sample.funds));
    const rates = observations.map(sample => Math.max(0, (sample.valuation / scale - 10e9 - sample.funds / 3) / 315e3));
    const sorted = [...rates].sort((a, b) => a - b);
    const impliedAssetGrowth = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
    const impliedAssetTrend = offerTrend(rates.map(rate => ({ offerFunds: rate })));
    const historicalValues = observations.map(sample => sample.valuation).sort((a, b) => a - b);
    const historicalValuation = historicalValues.length ? historicalValues[Math.floor((historicalValues.length - 1) / 2)] : plan.valuation;
    // Later rounds use the game's settled valuation, which already includes the BitNode multiplier.
    const expectedValuation = round >= 3 || impliedAssetGrowth === null ? historicalValuation :
        Math.min(historicalValuation, privateCycleValuation(plan.funds, impliedAssetGrowth, facilityFactor));
    const expectedOffer = Number.isFinite(expectedValuation) ? expectedValuation * factor : null;
    const requiredValuation = target / factor;
    const normalizedRequirement = requiredValuation / scale - 10e9 - plan.funds / 3;
    const horizon = CONFIG.fundingModel.horizon;
    const growthSlope = impliedAssetTrend?.fit >= 0.8 ? impliedAssetTrend.slopePerCycle : 0;
    const operatingProfit = Math.max(0, plan.operatingRate ?? 0) * (plan.secondsPerMarketCycle ?? 0);
    const horizonOffer = impliedAssetGrowth === null ? null : privateCycleValuation(
        plan.funds + horizon * operatingProfit, impliedAssetGrowth + horizon * growthSlope, facilityFactor) * factor;
    return { factor, facilities, facilityFactor, impliedAssetGrowth, impliedAssetTrend, expectedOffer,
        expectedValuation, requiredValuation, requiredAssetGrowth: Math.max(0, normalizedRequirement / 315e3),
        horizon, horizonOffer };
}

function fundingChain(plan, offer, growth, model, rule = CONFIG.round1ScaleUp) {
    if (!plan.satelliteSelling || !growth?.tobaccoSelling || !Number.isFinite(model.expectedValuation) ||
        !Number.isFinite(plan.valuation)) return null;
    const nextFactor = roundOfferFactor(2);
    const base = Math.min(plan.valuation, model.expectedValuation);
    const cashEffect = offer.funds / 3 * model.facilityFactor * CONFIG.fundingModel.valuationMultiplier;
    const cashFundedValue = privateCycleValuation(plan.funds + offer.funds, model.impliedAssetGrowth ?? 0, model.facilityFactor);
    const predictedNextOffer = Math.min(base + cashEffect, cashFundedValue) * nextFactor;
    const combinedCash = plan.funds + offer.funds + predictedNextOffer;
    const required = fundingPackageCost(rule) + plan.reserve;
    const shortfall = Math.max(0, required - combinedCash);
    return { predictedNextOffer, combinedCash, required, shortfall,
        viable: offer.funds >= CONFIG.fundingModel.chainMinimumOffer && shortfall === 0 };
}

function fundingPackageForRound(round, satelliteSelling, tobaccoEstablished, leanPackage = false) {
    if ((round === 1 || round === 2) && satelliteSelling && leanPackage) return CONFIG.dualProductFunding;
    if (round === 1) return roundOnePackage(satelliteSelling, tobaccoEstablished);
    if (round === 2 && tobaccoEstablished) return CONFIG.round1ScaleUp;
    return CONFIG.fundingRounds[round - 1];
}

function roundOnePackage(satelliteSelling, tobaccoEstablished) {
    if (!satelliteSelling) return CONFIG.fundingRounds[0];
    return tobaccoEstablished ? CONFIG.round1ScaleUp : CONFIG.fundingRounds[1];
}

function fundingDecision(plan, samples, profitStreak, rampProfitStreak, growth, allowChain = false) {
    const offer = plan.nextOffer;
    const round = offer?.round;
    const first = round === 1;
    if (!(round >= 1 && round <= CONFIG.fundingRounds.length)) return { active: false, ready: false };
    let window = samples.filter(sample => sample.round === round);
    const postSales = first && growth?.tobaccoExists;
    if (postSales) {
        const lastBeforeSales = window.findLastIndex(sample => !sample.tobaccoSelling);
        window = window.slice(lastBeforeSales + 1);
    }
    const leanPackage = twoProductWindow(allowChain, growth, window);
    const rule = fundingPackageForRound(round, plan.satelliteSelling, growth?.tobaccoEstablished, leanPackage);
    const sampleTarget = postSales ? CONFIG.round1SellingSamples : CONFIG.valuationSamples;
    const { coverageNeeded, projectedProfit, floor: coverageFloor, target: coverageTarget } =
        fundingCoverage(rule, plan.funds, plan.reserve, plan.operatingRate, plan.secondsPerMarketCycle, first);
    const market = modelFunding(plan, window, growth, round, coverageTarget);
    const fairOffer = market.expectedOffer ?? offer.funds;
    const floor = first ? coverageFloor : Math.max(coverageFloor, fairOffer * CONFIG.fundingModel.fairFraction);
    const target = first ? coverageTarget : Math.max(coverageTarget, fairOffer);
    const model = market.requiredValuation === target / market.factor ? market : modelFunding(plan, window, growth, round, target);
    const trend = offerTrend(window);
    const fullWindow = window.length >= sampleTarget;
    const fullHistory = window.length >= CONFIG.valuationSamples;
    const quotes = window.map(sample => sample.offerFunds);
    const plateau = fullHistory && Math.max(...quotes) - Math.min(...quotes) <= offer.funds * CONFIG.offerPlateauRange;
    const preferred = offer.funds >= target;
    const credibleSlope = trend?.slopePerCycle > 0 && trend.fit >= 0.8;
    const estimatedCycles = preferred ? 0 : fullHistory && credibleSlope ?
        Math.ceil((target - offer.funds) / trend.slopePerCycle) : null;
    const slow = plateau || (estimatedCycles !== null && estimatedCycles > CONFIG.fundingModel.horizon);
    const chain = first && allowChain ? fundingChain(plan, offer, growth, model, rule) : null;
    const reason = preferred ? (first ? "coverage" : "preferred") :
        fullHistory && chain?.viable ? "chain" : !first && slow && offer.funds >= floor ? "fair-coverage" : null;
    let offerBlocker = first ? "Offer and projected profit do not cover the package and reserve" : "Waiting for an eligible offer";
    if (chain) {
        if (offer.funds < CONFIG.fundingModel.chainMinimumOffer) offerBlocker = "Waiting for the minimum chain quote";
        else if (!fullHistory) offerBlocker = "Collecting the full chain valuation window";
        else offerBlocker = "Projected Round 1 and Round 2 proceeds leave a coverage shortfall";
    } else if (first && offer.funds < floor) {
        offerBlocker = "Waiting for the Round 1 minimum quote";
    }
    const gates = [
        [!plan.cashExpansion, "Self-funded expansion takes priority"],
        [!plan.blocker && plan.stage !== "BOOTSTRAP" && plan.nextState === "PURCHASE", "Waiting for an operational settled START"],
        [offer.round === 1 ? rampProfitStreak >= CONFIG.fundingProfitCycles : profitStreak >= CONFIG.fundingProfitCycles,
            "Waiting for profitable cycles with rising funds" + (offer.round === 1 ? " at the nine-seat starter office" : "")],
        [offer.round !== 2 || growth?.satelliteSelling, "Waiting for sales from the nine-seat Aevum satellite"],
        [offer.round < 3 || growth?.productSelling, "Waiting for sales from a completed Tobacco product"],
        [offer.round !== 4 || growth?.productProfitable, "Waiting for profitable Tobacco operations"],
        [!postSales || growth.tobaccoSelling, "Waiting for settled Tobacco sales"],
        [fullWindow, postSales ? "Collecting offers after Tobacco sales" : "Collecting settled offers"],
        [reason, offerBlocker],
    ];
    const blocker = gates.find(([passes]) => !passes)?.[1] ?? null;
    return {
        active: true, round: offer.round, package: rule.package, packageCost: fundingPackageCost(rule),
        allocations: rule.allocations ?? null, leanPackage, coverageNeeded, projectedProfit, sampleTarget,
        samples: window.length, window, model, chain, fairOffer,
        ownershipBefore: plan.numShares / plan.totalShares,
        ownershipAfter: (plan.numShares - offer.shares) / plan.totalShares,
        offer: offer.funds, floor, target, trend, plateau, reason,
        estimatedCycles, estimatedGameSeconds: estimatedCycles === null || !Number.isFinite(plan.secondsPerMarketCycle)
            ? null : estimatedCycles * plan.secondsPerMarketCycle,
        blocker, ready: blocker === null,
    };
}

function twoProductWindow(allowChain, growth, window) {
    const samples = CONFIG.dualProductFunding.sellingSettlements;
    return allowChain && growth?.twoTobaccoSellers && window.length >= samples &&
        window.slice(-samples).every(sample => sample.twoTobaccoSellers);
}

function offerTrend(window) {
    const count = window.length;
    if (count < 2) return null;
    const quotes = window.map(sample => sample.offerFunds);
    if (!quotes.every(Number.isFinite)) return null;
    const meanOffer = quotes.reduce((total, offer) => total + offer, 0) / count;
    const meanCycle = (count - 1) / 2;
    let covariance = 0, cycleVariance = 0, offerVariance = 0;
    for (const [index, offer] of quotes.entries()) {
        const cycleDelta = index - meanCycle;
        const offerDelta = offer - meanOffer;
        covariance += cycleDelta * offerDelta;
        cycleVariance += cycleDelta ** 2;
        offerVariance += offerDelta ** 2;
    }
    return {
        slopePerCycle: covariance / cycleVariance,
        lastChange: quotes[count - 1] - quotes[count - 2],
        fit: offerVariance > 0 ? Math.min(1, covariance ** 2 / (cycleVariance * offerVariance)) : 0,
    };
}

function formatFunding(funding) {
    if (!funding.active) return "";
    let text = ", R" + funding.round + " " + funding.samples + "/" + funding.sampleTarget +
        " samples, offer $" + funding.offer.toFixed(0) + " / $" + funding.target.toFixed(0);
    if (funding.round === 1) {
        text += ", five-settlement projected profit $" + funding.projectedProfit.toFixed(0);
    }
    if (funding.model.horizonOffer !== null) {
        text += ", modeled $" + funding.model.horizonOffer.toFixed(0) + " in " + funding.model.horizon + " cycles";
    }
    if (funding.chain) {
        text += ", modeled R2 $" + funding.chain.predictedNextOffer.toFixed(0) +
            ", chain shortfall $" + funding.chain.shortfall.toFixed(0);
    }
    if (funding.trend) {
        const signed = amount => (amount > 0 ? "+$" : amount < 0 ? "-$" : "$") + Math.abs(amount).toFixed(0);
        text += ", slope " + signed(funding.trend.slopePerCycle) + "/cycle" +
            ", latest change " + signed(funding.trend.lastChange);
    }
    if (funding.estimatedCycles > 0) {
        text += ", projected target in ~" + funding.estimatedCycles + " cycles";
        if (funding.estimatedGameSeconds !== null) text += " (~" + (funding.estimatedGameSeconds / 3600).toFixed(1) + " game h)";
    }
    return text + (funding.blocker ? ", " + funding.blocker : ", ready (" + funding.reason + ")");
}

function acceptFunding(ns, call, decision, allowChain = false) {
    const before = call("getCorporation", () => ns.corporation.getCorporation());
    const offer = call("getInvestmentOffer", () => ns.corporation.getInvestmentOffer());
    const first = offer.round === 1 && decision.round === 1;
    const sales = before.public ? null : inspectGrowth(ns, call, offer.round, false);
    const starter = first ? findDivision(ns, call, before.divisions, CONFIG.starter) : null;
    const satellite = first ? satelliteHasSales(ns, call, starter) : Boolean(sales?.satelliteSelling);
    const leanPackage = twoProductWindow(allowChain, sales, decision.window ?? []);
    const rule = fundingPackageForRound(offer.round, satellite, sales?.tobaccoEstablished, leanPackage);
    const seconds = call("getConstants", () => ns.corporation.getConstants()).secondsPerMarketCycle;
    const reserve = operatingReserve(before.expenses, seconds, before.revenue);
    const { coverageNeeded, projectedProfit, floor, target } = rule
        ? fundingCoverage(rule, before.funds, reserve, before.revenue - before.expenses, seconds, first)
        : { coverageNeeded: Infinity, projectedProfit: 0, floor: Infinity, target: Infinity };
    const marketFloor = Math.max(floor, (decision.fairOffer ?? 0) * CONFIG.fundingModel.fairFraction);
    const preferred = offer.funds >= (first ? target : Math.max(target, decision.fairOffer ?? 0));
    // The accepted offer still has to fit actual cash and the market floor.
    const settleForFair = !first && decision.reason === "fair-coverage" && offer.funds === decision.offer && offer.funds >= marketFloor;
    const chain = first && decision.reason === "chain" && offer.funds === decision.offer &&
        fundingChain({ ...before, satelliteSelling: satellite, reserve }, offer, sales, decision.model, rule)?.viable;
    if (!decision.ready || before.public || before.nextState !== "PURCHASE" || offer.round !== decision.round ||
        !Number.isFinite(before.funds) || before.funds < reserve || !(before.revenue > before.expenses) || !Number.isFinite(offer.funds) ||
        !Number.isSafeInteger(offer.shares) || offer.shares <= 0 || (!preferred && !settleForFair && !chain) ||
        rule?.package !== decision.package ||
        (first && sales?.tobaccoExists && !sales.tobaccoSelling) ||
        (offer.round === 2 && !sales?.satelliteSelling) ||
        (offer.round >= 3 && !sales?.productSelling) ||
        (offer.round === 4 && !sales?.productProfitable)) {
        throw new Error("Round " + decision.round + " is no longer eligible");
    }
    const ok = call("acceptInvestmentOffer", () => ns.corporation.acceptInvestmentOffer());
    const after = call("getCorporation", () => ns.corporation.getCorporation());
    const next = call("getInvestmentOffer", () => ns.corporation.getInvestmentOffer());
    if (!ok || next.round !== offer.round + 1 || !cashMatches(after.funds, before.funds + offer.funds) ||
        before.numShares - after.numShares !== offer.shares || after.investorShares - before.investorShares !== offer.shares ||
        after.totalShares !== before.totalShares || after.issuedShares !== before.issuedShares) {
        throw new Error("Round " + offer.round + " result did not match quoted cash, ownership and next round. Inspect live data.");
    }
    return {
        round: offer.round, funds: offer.funds, shares: offer.shares, nextRound: next.round,
        package: rule.package, packageCost: fundingPackageCost(rule), allocations: rule.allocations ?? null,
        coverageNeeded, projectedProfit, ownershipBefore: before.numShares / before.totalShares, ownershipAfter: after.numShares / after.totalShares,
        before: { funds: before.funds, ceoShares: before.numShares, investorShares: before.investorShares },
        after: { funds: after.funds, ceoShares: after.numShares, investorShares: after.investorShares },
        totalShares: after.totalShares, issuedShares: after.issuedShares,
    };
}

function cashMatches(actual, expected) {
    return Number.isFinite(actual) && Number.isFinite(expected) &&
        Math.abs(actual - expected) <= Math.max(1, Math.abs(expected) * Number.EPSILON * 4);
}

function rankUpgrades(ns, call, plan, growth, profitStreak, prioritizeTobacco = false, general = true) {
    const budget = Math.max(0, plan.funds - plan.reserve) * CONFIG.upgradeBudgetFraction;
    const operated = growth.sites.filter(site => site.office.employeeJobs.Operations > 0 &&
        site.office.employeeJobs.Engineer > 0);
    const sellable = operated.flatMap(site => site.outputs).filter(output => output.productionAmount > 0);
    const pressure = operated.some(site => site.fill >= CONFIG.warehouseUpgradeAt);
    const hasBacklog = output => output.productionAmount > 0 && output.stored > 0 &&
        output.actualSellAmount < output.productionAmount * CONFIG.upgradeSellThrough;
    const salesSites = operated.filter(site => site.outputs.some(hasBacklog));
    const adVerts = Math.max(0, ...salesSites.map(site => site.adVerts));
    const soldThrough = sellable.length > 0 && sellable.every(output =>
        output.actualSellAmount >= output.productionAmount * CONFIG.upgradeSellThrough);
    const bottleneck = pressure ? "storage" : salesSites.length ? "sales" : soldThrough ? "production" : null;
    const options = {
        storage: [["Smart Storage", 0.10]],
        sales: [["ABC SalesBots", 0.01]],
        production: [["Smart Factories", 0.03], ["FocusWires", 0.02], ["Neural Accelerators", 0.02]],
    };
    // Give advertising leverage more weight as an already-active campaign grows.
    if (adVerts >= CONFIG.wilsonMinAdVerts) options.sales.push(["Wilson Analytics", 0.005 * adVerts]);
    const ranked = (options[bottleneck] ?? []).map(([name, weight]) => {
        const level = call("getUpgradeLevel " + name, () => ns.corporation.getUpgradeLevel(name));
        const cost = call("getUpgradeLevelCost " + name, () => ns.corporation.getUpgradeLevelCost(name));
        // Relative priority per dollar declines as levels and prices rise.
        return { name, level, cost, score: weight / (1 + level * weight) / cost, affordable: cost <= budget };
    }).filter(item => Number.isFinite(item.cost) && item.cost > 0).sort((a, b) => b.score - a.score);
    if (bottleneck === "production") {
        const campaign = operated.filter(site => site.adVerts < CONFIG.advertisingTarget &&
            site.outputs.some(output => output.productionAmount > 0))
            .sort((a, b) => Number(b.agriculture) - Number(a.agriculture) || a.adVerts - b.adVerts)[0];
        if (campaign) {
            const division = campaign.division;
            const advertCost = call("getHireAdVertCost", () => ns.corporation.getHireAdVertCost(division));
            const advert = { name: "AdVert", kind: "advert", division, level: campaign.adVerts,
                cost: advertCost, affordable: Number.isFinite(advertCost) && advertCost > 0 && advertCost <= budget };
            if (campaign.adVerts > 0) {
                const name = "Wilson Analytics";
                const level = call("getUpgradeLevel " + name, () => ns.corporation.getUpgradeLevel(name));
                const cost = call("getUpgradeLevelCost " + name, () => ns.corporation.getUpgradeLevelCost(name));
                if (level < campaign.adVerts && advert.affordable && Number.isFinite(cost) && cost > 0) {
                    ranked.unshift({ name, level, cost, affordable: cost <= budget });
                }
            }
            ranked.splice(ranked[0]?.name === "Wilson Analytics" ? 1 : 0, 0, advert);
        }
    }
    if (!general) ranked.length = 0;
    const division = growth.tobaccoDivision;
    const settings = CONFIG.tobaccoCampaign;
    const campaignStatus = prioritizeTobacco && division ? {
        adVerts: division.numAdVerts,
        wilsonLevel: call("getUpgradeLevel Wilson Analytics", () => ns.corporation.getUpgradeLevel("Wilson Analytics")),
    } : null;
    if (campaignStatus) {
        campaignStatus.complete = campaignStatus.adVerts >= settings.adVertsAfterWilson &&
            campaignStatus.wilsonLevel >= settings.wilsonLevel;
    }
    const campaign = campaignStatus ? rankTobaccoCampaign(ns, call, plan, growth, campaignStatus.wilsonLevel) : null;
    if (campaign) ranked.unshift(campaign);
    const pendingPackage = plan.stage === "EXPAND" ||
        (plan.nextOffer?.round === 2 && !growth.satelliteSelling) ||
        (plan.nextOffer?.round === 3 && !growth.productSelling);
    const blocker = !general && campaignStatus?.complete ? "Tobacco campaign complete" :
        profitStreak < CONFIG.fundingProfitCycles ? "Waiting for profitable cycles with rising funds" :
        pendingPackage ? "Preserving cash for the funded expansion" :
        !bottleneck && !campaign ? "No measured bottleneck" :
        !ranked.some(item => item.affordable) ? "Next level exceeds the upgrade budget" : null;
    return { bottleneck, budget, ranked, blocker, campaignStatus, selected: blocker ? null : ranked.find(item => item.affordable) };
}

function rankTobaccoCampaign(ns, call, plan, growth, level) {
    const division = growth.tobaccoDivision;
    if (!growth.tobaccoSelling || !(division?.products.length >= 2)) return null;
    const settings = CONFIG.tobaccoCampaign;
    const budget = Math.max(0, plan.funds - plan.reserve) * settings.spendableFraction;
    const corp = ns.corporation;
    const name = "Wilson Analytics";
    const advertTarget = level >= settings.wilsonLevel ? settings.adVertsAfterWilson : settings.adVertsBeforeWilson;
    if (division.numAdVerts < advertTarget) {
        const cost = call("getHireAdVertCost", () => corp.getHireAdVertCost(division.name));
        return { name: "AdVert", kind: "advert", division: division.name, level: division.numAdVerts,
            cost, campaign: true, affordable: Number.isFinite(cost) && cost > 0 && cost <= budget };
    }
    if (level >= settings.wilsonLevel) return null;
    const cost = call("getUpgradeLevelCost " + name, () => corp.getUpgradeLevelCost(name));
    return { name, level, cost, campaign: true, division: division.name,
        affordable: Number.isFinite(cost) && cost > 0 && cost <= budget };
}

function buyRankedUpgrade(ns, call, candidate) {
    const before = call("getCorporation", () => ns.corporation.getCorporation());
    const seconds = call("getConstants", () => ns.corporation.getConstants()).secondsPerMarketCycle;
    const advert = candidate.kind === "advert";
    const level = advert ? call("getDivision", () => ns.corporation.getDivision(candidate.division)).numAdVerts :
        call("getUpgradeLevel " + candidate.name, () => ns.corporation.getUpgradeLevel(candidate.name));
    const cost = advert ? call("getHireAdVertCost", () => ns.corporation.getHireAdVertCost(candidate.division)) :
        call("getUpgradeLevelCost " + candidate.name, () => ns.corporation.getUpgradeLevelCost(candidate.name));
    const fraction = candidate.campaign ? CONFIG.tobaccoCampaign.spendableFraction : CONFIG.upgradeBudgetFraction;
    const budget = Math.max(0, before.funds - operatingReserve(before.expenses, seconds, before.revenue)) * fraction;
    if (before.nextState !== "PURCHASE" || before.revenue <= before.expenses || level !== candidate.level ||
        !Number.isFinite(cost) || cost <= 0 || cost > budget) return null;
    if (advert) {
        call("hireAdVert", () => ns.corporation.hireAdVert(candidate.division));
    } else {
        call("levelUpgrade " + candidate.name, () => ns.corporation.levelUpgrade(candidate.name));
    }
    const after = call("getCorporation", () => ns.corporation.getCorporation());
    const nextLevel = advert ? call("getDivision", () => ns.corporation.getDivision(candidate.division)).numAdVerts :
        call("getUpgradeLevel " + candidate.name, () => ns.corporation.getUpgradeLevel(candidate.name));
    if (nextLevel !== level + 1 || !cashMatches(after.funds, before.funds - cost)) {
        throw new Error(candidate.name + " upgrade result did not match the quoted cost and level");
    }
    return { name: candidate.name, division: candidate.division ?? null, fromLevel: level, level: nextLevel, cost, campaign: Boolean(candidate.campaign) };
}

function advanceMarketResearch(ns, call, reserve, bankOnly = false) {
    const live = starterOffice(ns, call);
    if (!live) return null;
    const { division, office } = live;
    const city = CONFIG.starter.city;
    const role = "Research & Development";
    let data = call("getDivision", () => ns.corporation.getDivision(division));
    const pending = MARKET_TA_RESEARCH.filter(name =>
        !call("hasResearched " + name, () => ns.corporation.hasResearched(division, name)));
    const purchased = [];
    while (!bankOnly && pending.length) {
        const name = pending[0];
        const cost = call("getResearchCost " + name, () => ns.corporation.getResearchCost(division, name));
        if (data.researchPoints < cost) break;
        call("research " + name, () => ns.corporation.research(division, name));
        if (!call("hasResearched " + name, () => ns.corporation.hasResearched(division, name))) {
            throw new Error("Research did not complete: " + name);
        }
        purchased.push(pending.shift());
        data = call("getDivision", () => ns.corporation.getDivision(division));
    }

    let seatCost = 0;
    let staffing = office.employeeJobs[role] > 0 ? "active" : "waiting for a research seat";
    if ((bankOnly || pending.length) && !(office.employeeJobs[role] > 0) &&
        STARTER_JOBS.every(job => office.employeeJobs[job] > 0) && office.numEmployees === 3) {
        if (office.numEmployees >= office.size) {
            const quote = call("getOfficeSizeUpgradeCost", () =>
                ns.corporation.getOfficeSizeUpgradeCost(division, city, 1));
            const funds = call("getCorporation", () => ns.corporation.getCorporation()).funds;
            if (Number.isFinite(reserve) && quote <= CONFIG.researchSeatBudget && funds - reserve >= quote) {
                call("upgradeOfficeSize", () => ns.corporation.upgradeOfficeSize(division, city, 1));
                const actual = call("getOffice", () => ns.corporation.getOffice(division, city));
                if (actual.size !== office.size + 1) throw new Error("Research seat upgrade did not complete");
                seatCost = quote;
            }
        }
        if (seatCost || office.numEmployees < office.size) {
            if (!call("hireEmployee", () => ns.corporation.hireEmployee(division, city, role))) {
                throw new Error("Research hiring did not complete");
            }
            staffing = "active";
        }
    }
    const next = pending[0] ?? null;
    return { points: data.researchPoints, bankOnly, next, nextCost: next ?
        call("getResearchCost " + next, () => ns.corporation.getResearchCost(division, next)) : 0,
        purchased, staffing, seatCost, researchedTA2: next === null };
}

function reconcileExpansion(ns, call, plan, completedPhase, productTA, weakProducts, orders, allowCapital, previous,
    supplyReadiness = new Map(), manualSupply = false, profitable = false, holdProductPrice = false,
    priceStreaks = new Map()) {
    if (!call("hasCorporation", () => ns.corporation.hasCorporation())) return null;
    const corp = call("getCorporation", () => ns.corporation.getCorporation());
    if (REQUIRED_UNLOCKS.some(name => !call("hasUnlock " + name, () => ns.corporation.hasUnlock(name)))) return null;
    const round = corp.public ? CONFIG.fundingRounds.length + 1 :
        call("getInvestmentOffer", () => ns.corporation.getInvestmentOffer()).round;
    const agri = findDivision(ns, call, corp.divisions, CONFIG.starter);
    const tobacco = findDivision(ns, call, corp.divisions, CONFIG.product);
    const grow = allowCapital && completedPhase === "START" && plan.nextState === "PURCHASE" &&
        !plan.blocker && plan.stage !== "BOOTSTRAP" && Number.isFinite(plan.reserve);
    const spendable = Math.max(0, corp.funds - (plan.reserve ?? Infinity));
    if (!tobacco && (round >= 3 || plan.cashExpansion === CONFIG.product.name) && grow && spendable >= CONFIG.fundingRounds[1].cost) {
        call("expandIndustry Tobacco", () => ns.corporation.expandIndustry(CONFIG.product.industry, CONFIG.product.name));
        if (!call("getCorporation", () => ns.corporation.getCorporation()).divisions.includes(CONFIG.product.name)) {
            throw new Error("Tobacco launch did not complete");
        }
        return { division: CONFIG.product.name, action: "Launched Tobacco" };
    }

    const sites = [
        tobacco && { division: tobacco, city: CONFIG.product.city, jobs: CONFIG.tobacco.jobs },
        agri && (round >= 2 || plan.cashExpansion === CONFIG.round1City || agri.cities.includes(CONFIG.round1City)) &&
            { division: agri, city: CONFIG.round1City, jobs: RAMP_JOBS },
    ].filter(Boolean);
    const boostBudget = boostBudgetForSite(plan);
    const starterCommitted = (manualSupply ? CONFIG.purchaseBudget : CONFIG.smartSupplyPurchaseBudget) + boostBudget;
    let remaining = Math.max(0, spendable - starterCommitted);
    let grew = false;
    for (const site of sites) {
        const { division, city, jobs } = site;
        // Fund Tobacco first after Round 2. Still reconcile orders for existing satellites.
        const waitingForTobacco = division === agri && round >= 3 && (!tobacco || !tobacco.products.length);
        if (grow && !grew && !waitingForTobacco) {
            const initialBudget = division === agri && !agri.cities.includes(city) ? CONFIG.fundingRounds[0].cost : 0;
            if (spendable >= initialBudget && prepareExpansionOffice(ns, call, division, city, jobs, remaining)) {
                grew = true;
                remaining = Math.max(0, call("getCorporation", () => ns.corporation.getCorporation()).funds -
                    plan.reserve - starterCommitted);
            }
        }
        if (!division.cities.includes(city)) continue;
        if (!call("hasWarehouse", () => ns.corporation.hasWarehouse(division.name, city))) continue;
        const warehouse = call("getWarehouse", () => ns.corporation.getWarehouse(division.name, city));
        const budget = plan.nextState === "PURCHASE" ? Math.min(CONFIG.purchaseBudget, remaining) : 0;
        if (division !== agri) {
            remaining -= reconcileTobaccoSupply(ns, call, division, city, warehouse, plan.nextState,
                completedPhase, remaining, budget, orders, supplyReadiness, manualSupply);
            continue;
        }
        if (plan.nextState === "PURCHASE") {
            const office = call("getOffice", () => ns.corporation.getOffice(division.name, city));
            const stable = supplyIsStable(ns, call, supplyReadiness, division.name, city, office, warehouse, completedPhase);
            const smart = stable && plan.satelliteSelling && call("hasUnlock Smart Supply", () => ns.corporation.hasUnlock("Smart Supply"));
            preparePurchases(ns, call, orders, division, warehouse, remaining, plan.operatingRate > 0,
                stable && plan.satelliteSelling && profitable, manualSupply || !smart, city, boostBudget,
                agricultureInputCycles(plan.funds, plan.satelliteSelling));
            const committed = smart && !manualSupply ? CONFIG.smartSupplyPurchaseBudget : CONFIG.purchaseBudget;
            remaining = Math.max(0, remaining - committed - boostBudget);
        } else {
            clearStarterPurchases(ns, call, orders, division.name, warehouse, city);
        }
        if (plan.nextState === "SALE") priceStarterOutputs(ns, call, division, warehouse, city);
    }

    if (!tobacco) return previous;
    if (plan.nextState === "SALE") {
        priceTobacco(ns, call, tobacco, readTobaccoProducts(ns, call, tobacco), completedPhase === "EXPORT", holdProductPrice, priceStreaks);
    }
    if (completedPhase !== "START" || plan.nextState !== "PURCHASE") return previous;
    const products = readTobaccoProducts(ns, call, tobacco);
    const status = {
        division: tobacco.name, researchPoints: tobacco.researchPoints, researchReserve: CONFIG.tobacco.researchReserve,
        products: products.map(({ name, progress, sold, produced }) => ({ name, progress, sold, produced })),
        action: null, blocker: null,
    };
    const strong = updateRotationEvidence(products, weakProducts);
    if (!grow || grew) return status;
    const city = CONFIG.product.city;
    if (!tobacco.cities.includes(city) || !call("hasWarehouse", () => ns.corporation.hasWarehouse(tobacco.name, city))) return status;
    const office = call("getOffice", () => ns.corporation.getOffice(tobacco.name, city));
    if (!["Operations", "Engineer", "Business", "Management"].every(job => office.employeeJobs[job] > 0)) {
        return { ...status, blocker: "Waiting for development staffing" };
    }
    if (products.some(product => product.progress < 100)) return status;
    if (!products.length && tobacco.numAdVerts < CONFIG.tobacco.launchAdVerts) {
        const cost = call("getHireAdVertCost", () => ns.corporation.getHireAdVertCost(tobacco.name));
        if (remaining < cost + 2 * CONFIG.tobacco.investmentMinimum) {
            return { ...status, blocker: "Waiting for launch advertising and product funds" };
        }
        call("hireAdVert", () => ns.corporation.hireAdVert(tobacco.name));
        if (call("getDivision", () => ns.corporation.getDivision(tobacco.name)).numAdVerts !== tobacco.numAdVerts + 1) {
            throw new Error("Tobacco launch advertising did not complete");
        }
        return { ...status, action: "Purchased Tobacco launch advertising" };
    }
    const hasSeller = strong?.sold >= CONFIG.tobacco.minimumSellerRate;
    if (products.length && !hasSeller) return { ...status, blocker: "Waiting for sales from an existing Tobacco product" };
    if (productTA && hasSeller) {
        status.researched = researchTobaccoPricing(ns, call, tobacco);
        if (status.researched.length) {
            status.researchPoints = call("getDivision", () => ns.corporation.getDivision(tobacco.name)).researchPoints;
        }
    }
    const investment = tobaccoInvestment(remaining);
    const minimumInvestment = products.length === 1 && tobacco.maxProducts > 1 ?
        CONFIG.tobacco.secondProductInvestmentMinimum : CONFIG.tobacco.investmentMinimum;
    if (investment < minimumInvestment || 2 * investment > remaining) {
        return { ...status, blocker: "Waiting for design and marketing funds" };
    }
    let retired = null;
    if (products.length >= tobacco.maxProducts) {
        if (plan.treasury?.netBurn > 0) return { ...status, blocker: "Waiting for operating break-even before rotation" };
        retired = products.filter(product => product !== strong && hasSeller &&
            (weakProducts.get(product.name) ?? 0) >= CONFIG.tobacco.weakSettlements)
            .sort((a, b) => a.sold - b.sold || a.rating - b.rating)[0];
        if (!retired || products.length > tobacco.maxProducts) return status;
        call("discontinueProduct " + retired.name, () => ns.corporation.discontinueProduct(tobacco.name, retired.name));
        weakProducts.delete(retired.name);
        for (const item of retired.markets) priceStreaks.delete(JSON.stringify([tobacco.name, retired.name, item.city]));
        const live = call("getDivision", () => ns.corporation.getDivision(tobacco.name));
        if (live.products.includes(retired.name) || !live.products.includes(strong.name) || live.products.length >= live.maxProducts) {
            throw new Error("Product retirement did not preserve the selling line and free a slot");
        }
    }
    const stem = "Tobacco-" + Date.now();
    let name = stem;
    for (let suffix = 1; products.some(product => product.name === name); suffix++) name = stem + "-" + suffix;
    call("makeProduct " + name, () => ns.corporation.makeProduct(tobacco.name, city, name, investment, investment));
    if (!call("getDivision", () => ns.corporation.getDivision(tobacco.name)).products.includes(name)) {
        throw new Error("Product development did not start");
    }
    return { ...status, action: "Started " + name, started: name, retired: retired?.name ?? null,
        protectedSeller: hasSeller ? strong.name : null, design: investment, marketing: investment };
}

function prepareExpansionOffice(ns, call, division, city, jobs, spendable) {
    const corp = ns.corporation;
    const constants = call("getConstants", () => corp.getConstants());
    if (!division.cities.includes(city)) {
        if (spendable < constants.officeInitialCost + constants.warehouseInitialCost) return false;
        call("expandCity " + city, () => corp.expandCity(division.name, city));
        if (!call("getDivision", () => corp.getDivision(division.name)).cities.includes(city)) {
            throw new Error("Office expansion did not complete for " + city);
        }
        return true;
    }
    if (!call("hasWarehouse", () => corp.hasWarehouse(division.name, city))) {
        if (spendable < constants.warehouseInitialCost) return false;
        call("purchaseWarehouse " + city, () => corp.purchaseWarehouse(division.name, city));
        if (!call("hasWarehouse", () => corp.hasWarehouse(division.name, city))) throw new Error("Warehouse purchase did not complete for " + city);
        return true;
    }
    const office = call("getOffice", () => corp.getOffice(division.name, city));
    const seats = Object.values(jobs).reduce((sum, count) => sum + count, 0);
    if (office.size < seats) {
        const increase = seats - office.size;
        const cost = call("getOfficeSizeUpgradeCost", () => corp.getOfficeSizeUpgradeCost(division.name, city, increase));
        if (spendable < cost) return false;
        call("upgradeOfficeSize " + city, () => corp.upgradeOfficeSize(division.name, city, increase));
        if (call("getOffice", () => corp.getOffice(division.name, city)).size < seats) throw new Error("Office upgrade did not complete for " + city);
        return true;
    }
    return staffRampOffice(ns, call, division.name, city, office, jobs);
}

function reconcileTobaccoSupply(ns, call, division, city, warehouse, phase, completedPhase, spendable,
    budget, orders, readiness, manualSupply) {
    const corp = ns.corporation;
    const key = division.name + "/" + city;
    if (phase === "PURCHASE" && CONFIG.tobacco.exportPlants && call("hasUnlock Export", () => corp.hasUnlock("Export"))) {
        const plants = readStock(ns, call, division.name, "Plants", city);
        const { secondsPerMarketCycle: seconds } = call("getConstants", () => corp.getConstants());
        const { requiredMaterials } = call("getIndustryData", () => corp.getIndustryData(division.industry));
        const target = tobaccoInputTarget(ns, call, division, city, requiredMaterials.Plants, plants, seconds);
        const sufficient = plants.importAmount > 0 && plants.stored + CONFIG.tobacco.exportStockTolerance >= target;
        const previous = readiness.get(key);
        const office = call("getOffice", () => corp.getOffice(division.name, city));
        const finished = division.products.filter(name => call("getProduct " + name, () =>
            corp.getProduct(division.name, city, name)).developmentProgress >= 100);
        const factories = call("getUpgradeLevel Smart Factories", () => corp.getUpgradeLevel("Smart Factories"));
        const fingerprint = JSON.stringify([warehouse.size, office.employeeJobs, factories, division.products, finished]);
        const count = sufficient ? (previous?.fingerprint === fingerprint ? previous.count : 0) +
            Number(completedPhase === "START") : 0;
        readiness.set(key, { fingerprint, count });
        const maxCost = Math.max(0, warehouse.size - warehouse.sizeUsed) * plants.marketPrice / plants.size;
        if (!manualSupply && CONFIG.smartSupply && sufficient && count >= CONFIG.supplySettleCycles &&
            maxCost <= Math.min(spendable, CONFIG.smartSupplyPurchaseBudget) &&
            call("hasUnlock Smart Supply", () => corp.hasUnlock("Smart Supply"))) {
            call("setSmartSupplyOption Plants", () => corp.setSmartSupplyOption(division.name, city, "Plants", "leftovers"));
            if (!warehouse.smartSupplyEnabled) setSmartSupply(ns, call, division.name, true, city);
            return maxCost;
        }
    }
    if (warehouse.smartSupplyEnabled && (manualSupply || phase === "PURCHASE")) {
        setSmartSupply(ns, call, division.name, false, city);
        warehouse.smartSupplyEnabled = false;
    }
    return reconcileExpansionInputs(ns, call, division, city, warehouse, budget, orders, true);
}

function reconcileExpansionInputs(ns, call, division, city, warehouse, budget, orders, bufferProducts = false) {
    if (warehouse.smartSupplyEnabled) return 0;
    const corp = ns.corporation;
    const { requiredMaterials } = call("getIndustryData", () => corp.getIndustryData(division.industry));
    const { secondsPerMarketCycle: seconds } = call("getConstants", () => corp.getConstants());
    const inputs = Object.keys(requiredMaterials).map(name => {
        const material = call("getMaterial " + name, () => corp.getMaterial(division.name, city, name));
        const { size } = call("getMaterialData " + name, () => corp.getMaterialData(name));
        const target = bufferProducts
            ? tobaccoInputTarget(ns, call, division, city, requiredMaterials[name], material, seconds)
            : Math.max(requiredMaterials[name] * CONFIG.starterProductionUnits, -material.productionAmount * seconds * 1.1);
        const deficit = target - material.stored;
        const tolerance = bufferProducts ? CONFIG.tobacco.exportStockTolerance : 0;
        return { ...material, name, size, quantity: deficit > tolerance ? deficit : 0 };
    });
    const cost = measureOrder(inputs, "marketPrice");
    const room = Math.max(0, warehouse.size * CONFIG.warehouseFill - warehouse.sizeUsed);
    const scale = fitOrder(cost, measureOrder(inputs, "size"), budget, room);
    orders.write(division.name, city, inputs, input => input.quantity * scale / seconds);
    return cost * scale;
}

function tobaccoInputTarget(ns, call, division, city, required, material, seconds) {
    // Include developing products before their first production cycle.
    const lines = Math.max(1, division.products.length);
    const rates = division.products.map(name => call("getProduct " + name, () =>
        ns.corporation.getProduct(division.name, city, name)).productionAmount);
    const predicted = Math.max(0, ...rates) * lines * required * seconds;
    const recent = Math.max(0, -material.productionAmount) * seconds;
    return Math.max(required * CONFIG.starterProductionUnits * lines,
        Math.max(predicted, recent) * CONFIG.tobacco.inputBufferCycles);
}

function readTobaccoProducts(ns, call, division) {
    const corp = ns.corporation;
    const cities = division.cities.filter(city => call("hasWarehouse", () => corp.hasWarehouse(division.name, city)));
    return division.products.map(name => {
        const markets = cities.map(city => ({ city, ...call("getProduct " + name, () => corp.getProduct(division.name, city, name)) }));
        const first = markets[0] ?? call("getProduct " + name, () => corp.getProduct(division.name, CONFIG.product.city, name));
        return {
            name, markets, progress: first.developmentProgress, rating: first.rating,
            sold: markets.reduce((sum, item) => sum + item.actualSellAmount, 0),
            produced: markets.reduce((sum, item) => sum + item.productionAmount, 0),
            stored: markets.reduce((sum, item) => sum + item.stored, 0),
        };
    });
}

function nextTobaccoPrice(item, seconds, streaks, key, adjustExisting) {
    const match = /^MP\s*\*\s*(\d+(?:\.\d+)?)$/.exec(String(item.desiredSellPrice));
    const previous = match ? Number(match[1]) : CONFIG.tobacco.priceStart;
    const output = Math.max(0, item.productionAmount) * seconds;
    const carryover = Math.max(0, item.stored - output);
    const fullSale = output > 0 && item.actualSellAmount >= item.productionAmount * 0.95;
    const state = streaks.get(key) ?? { proven: 1, step: CONFIG.tobacco.priceStep, cooldown: 0 };
    const price = multiplier => multiplier > 1 ? "MP*" + multiplier.toFixed(4) : "MP";
    if (carryover > 0.01) {
        if (previous > state.proven) {
            state.step = Math.max(CONFIG.tobacco.minimumPriceStep, state.step / 2);
            state.cooldown = CONFIG.tobacco.failedProbeCooldown;
        }
        const fallback = previous > state.proven ? state.proven : 1;
        if (fallback < previous) state.cooldown = CONFIG.tobacco.failedProbeCooldown;
        state.proven = fallback;
        streaks.set(key, state);
        return price(fallback);
    }
    if (!adjustExisting || !fullSale) return price(previous);
    state.proven = previous;
    streaks.set(key, state);
    if (state.cooldown > 0) {
        state.cooldown--;
        return price(previous);
    }
    return price(Math.min(CONFIG.tobacco.priceMax, previous * (1 + state.step)));
}

function priceTobacco(ns, call, division, products, adjustExisting = true, holdAtCost = false, streaks = new Map()) {
    const corp = ns.corporation;
    const ta1 = call("hasResearched Market-TA.I", () => corp.hasResearched(division.name, "Market-TA.I"));
    const ta2 = call("hasResearched Market-TA.II", () => corp.hasResearched(division.name, "Market-TA.II"));
    const { secondsPerMarketCycle: seconds } = call("getConstants", () => corp.getConstants());
    for (const product of products.filter(item => item.progress >= 100)) {
        if (ta1) call("setProductMarketTA1 " + product.name, () => corp.setProductMarketTA1(division.name, product.name, !ta2));
        if (ta2) call("setProductMarketTA2 " + product.name, () => corp.setProductMarketTA2(division.name, product.name, true));
        for (const item of product.markets) {
            const key = JSON.stringify([division.name, product.name, item.city]);
            const managedOrder = item.desiredSellAmount === "MAX";
            const price = !ta1 && !ta2 && !holdAtCost && managedOrder ?
                nextTobaccoPrice(item, seconds, streaks, key, adjustExisting) : "MP";
            if (ta1 || ta2 || holdAtCost) streaks.delete(key);
            if (item.desiredSellAmount !== "MAX" || item.desiredSellPrice !== price) {
                call("sellProduct " + product.name, () => corp.sellProduct(division.name, item.city, product.name, "MAX", price, false));
            }
        }
    }
}

function updateRotationEvidence(products, streaks) {
    const complete = products.filter(product => product.progress >= 100)
        .sort((a, b) => b.sold - a.sold || b.rating - a.rating);
    const best = complete[0];
    for (const name of streaks.keys()) {
        if (!complete.some(product => product.name === name)) streaks.delete(name);
    }
    for (const product of complete) {
        const weak = best.sold >= CONFIG.tobacco.minimumSellerRate && product !== best && product.stored > 0 &&
            product.sold < best.sold * CONFIG.tobacco.weakSalesFraction && product.sold < product.produced * 0.95;
        streaks.set(product.name, weak ? (streaks.get(product.name) ?? 0) + 1 : 0);
    }
    return best;
}

function researchTobaccoPricing(ns, call, division) {
    const corp = ns.corporation;
    const pending = MARKET_TA_RESEARCH.filter(name => !call("hasResearched " + name, () => corp.hasResearched(division.name, name)));
    const total = pending.reduce((sum, name) =>
        sum + call("getResearchCost " + name, () => corp.getResearchCost(division.name, name)), 0);
    if (division.researchPoints < total + CONFIG.tobacco.researchReserve) return [];
    for (const name of pending) {
        call("research " + name, () => corp.research(division.name, name));
        if (!call("hasResearched " + name, () => corp.hasResearched(division.name, name))) {
            throw new Error("Research did not complete: " + name);
        }
    }
    return pending;
}

function tobaccoInvestment(spendable) {
    return Math.min(CONFIG.tobacco.investmentCap, Math.max(0, spendable) * CONFIG.tobacco.investmentFraction);
}

function treasurySnapshot(corp, seconds) {
    const netBurn = Math.max(0, corp.expenses - corp.revenue);
    const reserve = operatingReserve(corp.expenses, seconds, corp.revenue);
    const spendable = Math.max(0, corp.funds - reserve);
    const perProductBudget = tobaccoInvestment(spendable);
    const projectedProductSpend = perProductBudget >= CONFIG.tobacco.investmentMinimum ? 2 * perProductBudget : 0;
    return {
        netBurn, reserve, projectedProductSpend,
        runwaySeconds: netBurn > 0 ? Math.max(0, corp.funds) / netBurn : null,
        runwayAfterProductSeconds: netBurn > 0 ? Math.max(0, corp.funds - projectedProductSpend) / netBurn : null,
    };
}

function formatRunway(treasury) {
    if (!treasury) return "";
    if (!treasury.netBurn) return ", operating cash burn $0/s";
    const days = seconds => (seconds / 86_400).toFixed(2) + "d";
    return ", burn $" + treasury.netBurn.toFixed(2) + "/s, runway " + days(treasury.runwaySeconds) +
        " (" + days(treasury.runwayAfterProductSeconds) + " after a projected product investment)";
}

function readTobaccoInputs(ns, call, divisions) {
    if (!divisions?.length) return null;
    const corp = ns.corporation;
    const division = findDivision(ns, call, divisions, CONFIG.product);
    const city = CONFIG.product.city;
    if (!division?.cities.includes(city) || !call("hasUnlock Warehouse API", () => corp.hasUnlock("Warehouse API")) ||
        !call("hasWarehouse", () => corp.hasWarehouse(division.name, city))) return null;
    const { requiredMaterials } = call("getIndustryData", () => corp.getIndustryData(division.industry));
    const { secondsPerMarketCycle: seconds } = call("getConstants", () => corp.getConstants());
    const inputs = readProductionStocks(ns, call, division.name, city, Object.keys(requiredMaterials));
    for (const stock of inputs.stocks) {
        const material = readMaterial(ns, call, division.name, stock.name, city);
        stock.target = tobaccoInputTarget(ns, call, division, city, requiredMaterials[stock.name], material, seconds);
        stock.ordered = material.buyAmount * seconds;
        stock.lastImport = material.importAmount * seconds;
    }
    const warehouse = call("getWarehouse", () => corp.getWarehouse(division.name, city));
    return { ...inputs, smartSupply: warehouse.smartSupplyEnabled,
        exportUnlocked: call("hasUnlock Export", () => corp.hasUnlock("Export")) };
}

function readAgricultureInputs(ns, call, divisions) {
    if (!divisions?.length || !call("hasUnlock Warehouse API", () => ns.corporation.hasUnlock("Warehouse API"))) return [];
    const division = findDivision(ns, call, divisions, CONFIG.starter);
    return [CONFIG.starter.city, CONFIG.round1City]
        .filter(city => division?.cities.includes(city) &&
            call("hasWarehouse", () => ns.corporation.hasWarehouse(division.name, city)))
        .map(city => {
            const site = readProductionStocks(ns, call, division.name, city, INPUTS);
            if (call("hasUnlock Office API", () => ns.corporation.hasUnlock("Office API"))) {
                const office = call("getOffice", () => ns.corporation.getOffice(division.name, city));
                site.office = { size: office.size, employees: office.numEmployees, jobs: office.employeeJobs };
            }
            const plants = readMaterial(ns, call, division.name, "Plants", city);
            site.plants = { rate: plants.productionAmount, exports: plants.exports };
            site.boosts = BOOSTS.map(name => ({
                name, stored: readMaterial(ns, call, division.name, name, city).stored,
            }));
            return site;
        });
}

function readProductionStocks(ns, call, division, city, names) {
    return { division, city, stocks: names.map(name =>
        ({ name, before: readMaterial(ns, call, division, name, city).stored, after: null })) };
}

function settleInputReadings(ns, call, site) {
    for (const stock of site.stocks) {
        stock.after = readMaterial(ns, call, site.division, stock.name, site.city).stored;
    }
    if (site.plants) site.plants.rate = readMaterial(ns, call, site.division, "Plants", site.city).productionAmount;
}

function formatSupplyInputs(inputs, label) {
    if (!inputs) return "";
    return ", " + label + " inputs " + inputs.stocks.map(input => input.name + " " + input.before.toFixed(2) +
        (input.after === null ? "" : " → " + input.after.toFixed(2))).join(", ");
}

function readDevelopment(ns, call, divisions, previous, consecutive, seconds) {
    if (!divisions?.length) return null;
    const corp = ns.corporation;
    const division = findDivision(ns, call, divisions, CONFIG.product);
    const city = CONFIG.product.city;
    if (!division?.products.length || !division.cities.includes(city) ||
        !call("hasUnlock Warehouse API", () => corp.hasUnlock("Warehouse API"))) return null;
    const products = division.products.map(name => call("getProduct " + name, () => corp.getProduct(division.name, city, name)));
    const product = products.find(item => item.developmentProgress < 100) ??
        products.find(item => item.name === previous?.name && previous.progress < 100);
    if (!product) return null;
    const progress = product.developmentProgress;
    const delta = consecutive && previous?.name === product.name ? progress - previous.progress : null;
    const samples = delta === null || delta < 0 ? [] : [...previous.samples, delta].slice(-CONFIG.valuationSamples);
    const speed = samples.length ? samples.reduce((sum, amount) => sum + amount, 0) / samples.length : null;
    const cyclesRemaining = progress >= 100 ? 0 : speed > 0 ? Math.ceil((100 - progress) / speed) : null;
    let office = null;
    if (call("hasUnlock Office API", () => corp.hasUnlock("Office API"))) {
        const live = call("getOffice", () => corp.getOffice(division.name, city));
        office = { jobs: live.employeeJobs, morale: live.avgMorale, energy: live.avgEnergy };
    }
    return { name: product.name, city, progress, delta, speed, samples, cyclesRemaining, office,
        gameSecondsRemaining: cyclesRemaining === null ? null : cyclesRemaining * seconds };
}

function formatDevelopment(development) {
    if (!development) return "";
    const { name, progress, delta, speed, cyclesRemaining, office } = development;
    return ", " + name + " " + progress.toFixed(2) + "%" +
        (delta === null ? "" : " (" + delta.toFixed(3) + " pp last settlement, " + (speed ?? 0).toFixed(3) + " pp/settlement average)") +
        (cyclesRemaining === null ? "" : ", ~" + cyclesRemaining + " settlements remaining") +
        (office ? ", dev energy " + office.energy.toFixed(1) + ", morale " + office.morale.toFixed(1) : "");
}

function updatePreservation(plan, previous, settled) {
    if (!Number.isFinite(plan.reserve) || !Number.isFinite(plan.funds)) return previous;
    if (plan.funds <= plan.reserve) return { active: true, healthy: 0 };
    if (!previous.active) return previous;
    const healthy = plan.funds >= plan.reserve * CONFIG.preservationRecoveryBuffer && plan.operatingRate > 0;
    const count = healthy ? previous.healthy + Number(settled) : 0;
    return count >= CONFIG.preservationRecoverySettlements ? { active: false, healthy: 0 } : { active: true, healthy: count };
}

function reconcilePublicFinances(ns, call, plan, options, profitStreak, settled, preserving) {
    if (!Number.isFinite(plan.reserve)) return null;
    const corp = ns.corporation;
    const live = call("getCorporation", () => corp.getCorporation());
    const afterStart = settled && live.nextState === "PURCHASE";
    const seconds = call("getConstants", () => corp.getConstants()).secondsPerMarketCycle;
    const reserve = operatingReserve(live.expenses, seconds, live.revenue);
    const healthy = live.funds >= reserve * CONFIG.preservationRecoveryBuffer && live.revenue > live.expenses &&
        profitStreak >= CONFIG.market.profitSettlements && !preserving && !plan.cashExpansion && !plan.blocker;
    if (!live.public) {
        if (!afterStart || !options.ipo || !healthy) return null;
        const offer = call("getInvestmentOffer", () => corp.getInvestmentOffer());
        if (!options.ipoEarly && offer.round <= CONFIG.fundingRounds.length) return null;
        const shares = CONFIG.ipoShares;
        if (!Number.isSafeInteger(shares) || shares < 0 || shares > live.numShares ||
            (live.numShares - shares) / live.totalShares < CONFIG.market.minimumCeoStake || !(live.valuation > 0)) {
            throw new Error("IPO share count or valuation is outside the configured limits");
        }
        const ok = call("goPublic", () => corp.goPublic(shares));
        const after = call("getCorporation", () => corp.getCorporation());
        if (!ok || !after.public || after.numShares !== live.numShares - shares ||
            after.issuedShares !== live.issuedShares + shares || after.totalShares !== live.totalShares ||
            after.investorShares !== live.investorShares || !cashMatches(after.funds, live.funds + shares * after.sharePrice)) {
            throw new Error("IPO verification failed");
        }
        return { action: "IPO", shares, funds: after.funds - live.funds, ownership: after.numShares / after.totalShares };
    }

    const targetRate = healthy && afterStart ? options.dividendRate : 0;
    const cutRate = !healthy && (preserving || live.revenue <= live.expenses || live.funds < reserve * CONFIG.preservationRecoveryBuffer);
    if ((cutRate || afterStart) && live.dividendRate !== targetRate) {
        call("issueDividends", () => corp.issueDividends(targetRate));
        const after = call("getCorporation", () => corp.getCorporation());
        if (after.dividendRate !== targetRate) throw new Error("Dividend rate verification failed");
        return { action: "Set dividends", rate: after.dividendRate, playerEarningsPerSecond: after.dividendEarnings,
            ownership: after.numShares / after.totalShares };
    }
    if (!afterStart || !options.equity) return null;
    const target = Math.max(reserve * CONFIG.preservationRecoveryBuffer, CONFIG.market.equityCashTarget);
    const shares = equityIssueSize(live, target);
    if (!shares) return null;
    const proceeds = call("issueNewShares", () => corp.issueNewShares(shares));
    const after = call("getCorporation", () => corp.getCorporation());
    if (!(proceeds > 0) || !after.public || after.issueNewSharesCooldown <= 0 ||
        after.numShares !== live.numShares || after.totalShares !== live.totalShares + shares ||
        after.issuedShares + after.investorShares !== live.issuedShares + live.investorShares + shares ||
        after.numShares / after.totalShares < CONFIG.market.minimumCeoStake ||
        !cashMatches(after.funds, live.funds + proceeds)) {
        throw new Error("Corporate equity issuance verification failed");
    }
    return { action: "Issued corporate shares", shares, funds: proceeds, ownership: after.numShares / after.totalShares };
}

function equityIssueSize(corp, targetFunds) {
    const lot = 10e6;
    if (corp.funds >= targetFunds || corp.issueNewSharesCooldown > 0 ||
        !(corp.sharePrice >= CONFIG.market.minimumSharePrice) || !(corp.valuation > 0)) return 0;
    const ownershipLimit = Math.floor((corp.numShares / CONFIG.market.minimumCeoStake - corp.totalShares) / lot) * lot;
    const marketLimit = Math.floor(Math.round(corp.totalShares * 0.2) / lot) * lot;
    const limit = Math.min(ownershipLimit, marketLimit);
    if (limit < lot) return 0;
    const dilutedTotal = corp.totalShares + limit;
    const conservativePrice = Math.min(corp.sharePrice,
        corp.valuation * (0.5 + Math.sqrt(corp.numShares / dilutedTotal)) / dilutedTotal);
    if (conservativePrice < CONFIG.market.minimumSharePrice) return 0;
    return Math.min(limit, Math.ceil((targetFunds - corp.funds) / conservativePrice / lot) * lot);
}

function maintainEmergencySales(ns, call, plan, orders) {
    if (!plan.divisions?.length || !call("hasUnlock Warehouse API", () => ns.corporation.hasUnlock("Warehouse API"))) return;
    const corp = ns.corporation;
    const agri = findDivision(ns, call, plan.divisions, CONFIG.starter);
    const tobacco = findDivision(ns, call, plan.divisions, CONFIG.product);
    const managed = [
        [agri, CONFIG.starter.city], [agri, CONFIG.round1City], [tobacco, CONFIG.product.city],
    ];
    let budget = plan.nextState === "PURCHASE" ? Math.min(CONFIG.purchaseBudget, Math.max(0, plan.funds) * 0.01) : 0;
    for (const [division, city] of managed) {
        if (!division?.cities.includes(city) || !call("hasWarehouse", () => corp.hasWarehouse(division.name, city))) continue;
        const warehouse = call("getWarehouse", () => corp.getWarehouse(division.name, city));
        if (warehouse.smartSupplyEnabled) {
            setSmartSupply(ns, call, division.name, false, city);
            warehouse.smartSupplyEnabled = false;
        }
        const boosts = BOOSTS.map(name => readStock(ns, call, division.name, name, city));
        orders.write(division.name, city, boosts, () => 0);
        budget -= reconcileExpansionInputs(ns, call, division, city, warehouse, budget, orders);
        if (plan.nextState === "SALE" && division === agri) priceStarterOutputs(ns, call, division, warehouse, city);
    }
    if (plan.nextState === "SALE" && tobacco) {
        priceTobacco(ns, call, tobacco, readTobaccoProducts(ns, call, tobacco), false);
    }
}

function divisionRoutes(ns, call, divisions, materials) {
    const corp = ns.corporation;
    const routes = [];
    for (const division of divisions) {
        for (const city of division.cities) {
            if (!call("hasWarehouse", () => corp.hasWarehouse(division.name, city))) continue;
            for (const material of materials) {
                const stock = call("getMaterial " + material, () => corp.getMaterial(division.name, city, material));
                for (const route of stock.exports) routes.push({ from: division.name, material, ...route });
            }
        }
    }
    return routes;
}

function reconcileLiquidation(ns, call) {
    if (!call("hasCorporation", () => ns.corporation.hasCorporation())) return null;
    const corp = ns.corporation;
    const before = call("getCorporation", () => corp.getCorporation());
    if (before.nextState !== "PURCHASE") return null;
    const protectedNames = new Set([CONFIG.starter.name, ...CONFIG.starter.aliases,
        CONFIG.product.name, ...CONFIG.product.aliases, ...CONFIG.liquidation.protect]);
    const entry = CONFIG.liquidation.allow.find(item => before.divisions.includes(item.name) && !protectedNames.has(item.name));
    if (!entry) return { blocker: "No remaining unprotected divisions on the sale list" };
    if (!call("hasUnlock Warehouse API", () => corp.hasUnlock("Warehouse API"))) {
        return { blocker: "Warehouse API required to check supply links" };
    }
    const division = call("getDivision", () => corp.getDivision(entry.name));
    if (division.industry !== entry.industry) return { blocker: "Industry changed for " + entry.name };
    const constants = call("getConstants", () => corp.getConstants());
    const outgoing = divisionRoutes(ns, call, [division], constants.materialNames);
    for (const route of outgoing) {
        if (route.division === division.name || !before.divisions.includes(route.division)) continue;
        const warehouse = call("getWarehouse", () => corp.getWarehouse(route.division, route.city));
        const input = call("getMaterial", () => corp.getMaterial(route.division, route.city, route.material));
        const needed = Math.max(0, -input.productionAmount * constants.secondsPerMarketCycle);
        if (!warehouse.smartSupplyEnabled && (needed <= 0 || input.stored < needed ||
            input.buyAmount * constants.secondsPerMarketCycle < needed)) {
            return { blocker: "Prepare replacement " + route.material + " supply in " + route.division + "/" + route.city };
        }
    }

    let value = call("getIndustryData", () => corp.getIndustryData(division.industry)).startingCost;
    for (const city of division.cities) {
        if (city === "Sector-12") continue;
        value += constants.officeInitialCost;
        if (call("hasWarehouse", () => corp.hasWarehouse(division.name, city))) value += constants.warehouseInitialCost;
    }
    call("sellDivision " + division.name, () => corp.sellDivision(division.name));
    const after = call("getCorporation", () => corp.getCorporation());
    if (after.divisions.includes(division.name) || !cashMatches(after.funds, before.funds + value / 2)) {
        throw new Error("Division sale verification failed");
    }
    const survivors = after.divisions.map(name => call("getDivision", () => corp.getDivision(name)));
    if (divisionRoutes(ns, call, survivors, constants.materialNames).some(route => route.division === division.name)) {
        throw new Error("Export route remained after division sale");
    }
    return { action: "Sold division", division: division.name, funds: after.funds - before.funds };
}

function describe(plan) {
    return (plan.stage ?? "UNKNOWN") + (plan.blocker ? " — " + plan.blocker : "") +
        (plan.actions.length ? ". Plan: " + plan.actions.join(", ") : "");
}

