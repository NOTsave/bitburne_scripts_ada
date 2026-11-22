import test from "node:test";
import assert from "node:assert/strict";
import { acceptPlannedFunding, deployRound3Package, fundingDecision } from "../corp.js";

const chain = { fundAll: false, fundRound1: false, fundChain: true };
const call = (_method, run) => run();

function createFixture() {
    const corp = {
        funds: 16.1e9, valuation: 21.15e9 / 0.7, revenue: 85e3, expenses: 45e3,
        nextState: "PURCHASE", public: false, numShares: 900e6,
        totalShares: 1.5e9, investorShares: 600e6, issuedShares: 0, divisions: ["Agri", "Tobacco"],
    };
    const divisions = {
        Agri: { name: "Agri", industry: "Agriculture", cities: ["Sector-12", "Aevum"] },
        Tobacco: {
            name: "Tobacco", industry: "Tobacco", cities: ["Sector-12"],
            products: ["P1", "P2"], numAdVerts: 3, lastCycleRevenue: 30e3, lastCycleExpenses: 15e3,
        },
    };
    const quotes = [
        { round: 2, funds: 21.15e9, shares: 350e6 },
        { round: 3, funds: 20e9, shares: 250e6 },
        { round: 4, funds: 12.6e9, shares: 200e6 },
    ];
    const sales = { developmentProgress: 100, actualSellAmount: 0.6, productionAmount: 0.6 };
    const levels = { "Wilson Analytics": 1, "Project Insight": 0 };
    const prices = { "Wilson Analytics": 8e9, "Project Insight": 5e9 };
    let exportUnlocked = false;
    let roundIndex = 0;
    const purchases = [];
    const api = {
        getCorporation: () => ({ ...corp }),
        getInvestmentOffer: () => ({ ...quotes[roundIndex] }),
        getDivision: name => divisions[name],
        getConstants: () => ({ secondsPerMarketCycle: 10 }),
        hasWarehouse: () => true,
        getWarehouse: () => ({ size: 100, sizeUsed: 12 }),
        getOffice: () => ({ numEmployees: 9 }),
        getProduct: () => sales,
        getMaterial: () => sales,
        hasUnlock: name => name === "Export" && exportUnlocked,
        getUnlockCost: () => 20e9,
        purchaseUnlock: () => {
            corp.funds -= 20e9;
            exportUnlocked = true;
            purchases.push("Export");
        },
        getUpgradeLevel: name => levels[name],
        getUpgradeLevelCost: name => prices[name],
        levelUpgrade: name => {
            corp.funds -= prices[name];
            levels[name]++;
            purchases.push(name);
        },
        getHireAdVertCost: () => 1.191016e9,
        hireAdVert: () => {
            corp.funds -= 1.191016e9;
            divisions.Tobacco.numAdVerts++;
            purchases.push("AdVert");
        },
        acceptInvestmentOffer: () => {
            const { funds, shares } = quotes[roundIndex++];
            corp.funds += funds;
            corp.numShares -= shares;
            corp.investorShares += shares;
            if (roundIndex < quotes.length) {
                const factor = quotes[roundIndex].round === 3 ? 0.5 : 0.3;
                corp.valuation = quotes[roundIndex].funds / factor;
            }
            return true;
        },
    };
    const plan = () => ({
        ...corp, stage: "GROW", reserve: 5e9, secondsPerMarketCycle: 10,
        nextOffer: api.getInvestmentOffer(), round: api.getInvestmentOffer().round,
        satelliteSelling: true, operatingRate: corp.revenue - corp.expenses,
    });
    const growth = {
        facilities: 6, satelliteSelling: true, tobaccoExists: true, tobaccoEstablished: true,
        tobaccoSelling: true, productSelling: true, productProfitable: true,
    };
    const samples = () => Array.from({ length: 10 }, () => ({
        round: api.getInvestmentOffer().round, funds: corp.funds, valuation: corp.valuation,
        offerFunds: api.getInvestmentOffer().funds, tobaccoSelling: true,
    }));
    return { ns: { corporation: api }, corp, plan, growth, samples, purchases };
}

test("chain mode accepts Round 2 and next plans Round 3 with a fresh window", () => {
    const { ns, plan, growth, samples } = createFixture();
    const decide = quotes => fundingDecision(plan(), quotes, 3, 3, growth, true);
    const previousWindow = samples();
    const round2 = acceptPlannedFunding(ns, call, plan(), decide(previousWindow), chain);
    assert.equal(round2.nextRound, 3);
    assert.equal(round2.shares, 350e6);
    assert.equal(round2.after.funds, round2.before.funds + round2.funds);

    const firstRound3Plan = decide([...previousWindow, ...samples().slice(0, 1)]);
    assert.equal(firstRound3Plan.round, 3);
    assert.equal(firstRound3Plan.packageCost, 36e9);
    assert.equal(firstRound3Plan.samples, 1);
    assert.equal(firstRound3Plan.ready, false);
    assert.equal(acceptPlannedFunding(ns, call, plan(), firstRound3Plan, chain), null);

    const round3 = acceptPlannedFunding(ns, call, plan(), decide(samples()), chain);
    assert.equal(round3.round, 3);
    assert.equal(round3.nextRound, 4);
    assert.equal(round3.after.funds, round3.before.funds + 20e9);
    assert.equal(round3.after.ceoShares, 300e6);
    assert.equal(round3.totalShares, 1.5e9);

    const round4 = decide(samples());
    assert.equal(round4.round, 4);
    assert.ok(Math.abs(round4.model.factor - 0.3) < 1e-9);
    assert.equal(round4.packageCost, null);
    assert.equal(round4.ready, false);
    assert.match(round4.blocker, /awaits package calibration/);
    assert.equal(acceptPlannedFunding(ns, call, plan(), round4, { ...chain, fundAll: true }), null);
});

test("post-Round-3 deployment is bounded and resumes from live unlocks and levels", () => {
    const { ns, corp, plan, growth, samples, purchases } = createFixture();
    const accept = () => acceptPlannedFunding(ns, call, plan(),
        fundingDecision(plan(), samples(), 3, 3, growth, true), chain);
    assert.equal(deployRound3Package(ns, call, plan()), null);
    accept();
    assert.equal(deployRound3Package(ns, call, plan()), null);
    accept();

    const fundedCash = corp.funds;
    corp.funds = 24e9;
    assert.equal(deployRound3Package(ns, call, plan()), null);
    assert.deepEqual(purchases, []);
    corp.funds = fundedCash;

    const steps = ["Export", "Wilson Analytics", "AdVert", "Project Insight"];
    for (const name of steps) assert.equal(deployRound3Package(ns, call, plan()).name, name);
    assert.equal(deployRound3Package(ns, call, plan()), null);
    assert.deepEqual(purchases, steps);
    assert.equal(corp.funds, fundedCash - 34.191016e9);
});
