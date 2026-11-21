import test from "node:test";
import assert from "node:assert/strict";
import { main } from "../corp.js";

function fixture(nextState = "PURCHASE", funds = 100e9) {
    const divisions = {
        Agri: { name: "Agri", industry: "Agriculture", cities: ["Sector-12", "Aevum", "Volhaven"], products: [] },
        Tobacco: { name: "Tobacco", industry: "Tobacco", cities: ["Sector-12"], products: [] },
    };
    const corporation = { divisions: Object.keys(divisions), nextState, funds, revenue: 1000, expenses: 500,
        public: false, valuation: 40e9, numShares: 1e9, totalShares: 1e9 };
    const office = { size: 3, numEmployees: 3, employeeJobs: { Operations: 1, Engineer: 1, Business: 1 } };
    const warehouses = new Map();
    const materials = new Map();
    const files = new Map();
    let exit;
    for (const division of Object.values(divisions)) {
        for (const city of division.cities) warehouses.set(division.name + "/" + city,
            { size: 100, sizeUsed: nextState === "START" ? 85 : 0, smartSupplyEnabled: false });
    }
    function material(d, c, name) {
        const key = [d, c, name].join("/");
        if (!materials.has(key)) materials.set(key, { name, stored: 0, buyAmount: 0, productionAmount: 0,
            marketPrice: 100, actualSellAmount: 0, desiredSellAmount: "MAX", desiredSellPrice: "MP", exports: [] });
        return materials.get(key);
    }
    const api = {
        hasCorporation: () => true, getCorporation: () => ({ ...corporation }),
        getDivision: d => divisions[d], getInvestmentOffer: () => ({ round: 2, funds: 20e9, shares: 350e6 }),
        hasUnlock: name => ["Warehouse API", "Office API"].includes(name),
        getConstants: () => ({ secondsPerMarketCycle: 10 }), getOffice: () => office, getUpgradeLevel: () => 0,
        hasWarehouse: (d, c) => warehouses.has(d + "/" + c),
        getWarehouse: (d, c) => ({ ...warehouses.get(d + "/" + c) }),
        getMaterial: (d, c, n) => ({ ...material(d, c, n) }), getMaterialData: () => ({ size: 0.1 }),
        getIndustryData: industry => ({ requiredMaterials: industry === "Tobacco" ? { Plants: 1 } : { Water: 0.5, Chemicals: 0.2 } }),
        buyMaterial: (d, c, n, rate) => { material(d, c, n).buyAmount = rate; },
        getUpgradeWarehouseCost: () => 1e9,
        upgradeWarehouse: (d, c) => { warehouses.get(d + "/" + c).size += 100; corporation.funds -= 1e9; },
    };
    const stop = new Error("stop after first planning pass");
    const ns = { corporation: api, pid: 1, ps: () => [], getHostname: () => "home", getScriptName: () => "corp.js",
        read: file => files.get(file) ?? "", write: (file, data) => files.set(file, data), atExit: fn => { exit = fn; },
        tprint() {}, print() {}, sleep: async () => { throw stop; } };
    async function pass(...flags) {
        ns.args = ["--apply", "--manual-supply", ...flags];
        await assert.rejects(main(ns), error => error === stop);
        return JSON.parse(files.get("/Temp/corp-status.txt"));
    }
    return { api, corporation, warehouses, material, pass, exit: () => exit() };
}

test("an interruption between starter orders leaves the completed order recoverable at exit", async () => {
    const f = fixture();
    const buy = f.api.buyMaterial;
    f.api.buyMaterial = (d, c, name, rate) => {
        if (name === "Chemicals" && rate > 0) throw new Error("interrupted");
        buy(d, c, name, rate);
    };
    const water = f.material("Agri", "Sector-12", "Water");
    const plants = f.material("Agri", "Sector-12", "Plants");
    const route = { division: "Tobacco", city: "Sector-12", amount: "1" };
    plants.exports.push(route);
    assert.match((await f.pass()).blocker, /interrupted/);
    assert.equal(water.buyAmount, 1);
    f.exit();
    assert.equal(water.buyAmount, 0);
    assert.equal(plants.desiredSellAmount, "MAX");
    assert.deepEqual(plants.exports, [route]);
});

test("restart recovers previous manual orders across modes and respects a changed rate", async () => {
    const f = fixture();
    assert.equal((await f.pass("--products")).blocker, null);
    const water = f.material("Agri", "Aevum", "Water");
    const chemicals = f.material("Agri", "Aevum", "Chemicals");
    assert.ok(water.buyAmount > 0 && chemicals.buyAmount > 0);
    chemicals.buyAmount = 7;
    f.corporation.nextState = "PRODUCTION";
    await f.pass();
    assert.equal(water.buyAmount, 0);
    assert.equal(chemicals.buyAmount, 7);
});

test("crowding uses current cash, the 80% threshold and the active management scope", async () => {
    for (const [funds, expanded, sizes] of [
        [20e9, true, [200, 200, 100, 200]], [9e9, true, [200, 200, 100, 100]],
        [20e9, false, [200, 100, 100, 100]],
    ]) {
        const f = fixture("START", funds);
        await f.pass(...(expanded ? ["--products"] : []));
        assert.deepEqual([...f.warehouses.values()].map(w => w.size), sizes);
    }
    const f = fixture("START");
    f.warehouses.get("Agri/Aevum").sizeUsed = 79;
    f.warehouses.get("Tobacco/Sector-12").sizeUsed = 80;
    await f.pass("--products");
    assert.equal(f.warehouses.get("Agri/Aevum").size, 100);
    assert.equal(f.warehouses.get("Tobacco/Sector-12").size, 200);
});
