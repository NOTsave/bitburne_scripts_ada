import test from "node:test";
import assert from "node:assert/strict";
import { main, reconcileManagedPurchases, reconcileWarehousePressure, deployRound3Package, officeJobTargets, careForManagedOffices, planProductionScaling, deployProductionScaling, reconcileResearchBanks, supplySampleHealthy, reconcilePublicFinances, equityIssueSize, updatePreservation, reconcileLiquidation } from "../corp.js";

const call = (_name, run) => run();
const phases = ["START", "PURCHASE", "PRODUCTION", "EXPORT", "SALE"];
const agriJobs = { Operations: 3, Engineer: 3, Business: 1, Management: 1, "Research & Development": 1 };
const tobaccoJobs = { Operations: 2, Engineer: 3, Business: 1, Management: 2, "Research & Development": 1 };
const clone = value => structuredClone(value);

function fixture({ funds = 100e9, adopted = false, publicCorp = false } = {}) {
    const corp = { funds, revenue: 100e3, expenses: 10e3, valuation: 40e9, public: publicCorp,
        nextState: "START", numShares: 550e6, totalShares: 1.5e9, investorShares: 950e6,
        issuedShares: 0, dividendRate: 0, dividendEarnings: 0, tributeModifier: 0.15,
        divisions: ["Agri", "Tobacco", "Unlisted"] };
    const divisions = {
        Agri: { name: "Agri", industry: "Agriculture", cities: ["Sector-12", "Aevum"], products: [],
            lastCycleRevenue: 40e3, lastCycleExpenses: 5e3, researchPoints: 100, numAdVerts: 5, maxProducts: 0 },
        Tobacco: { name: "Tobacco", industry: "Tobacco", cities: ["Sector-12"], products: ["P1", "P2"],
            lastCycleRevenue: 60e3, lastCycleExpenses: 5e3, researchPoints: 100, numAdVerts: 3, maxProducts: 2 },
        Unlisted: { name: "Unlisted", industry: "Agriculture", cities: ["Sector-12"], products: [] },
    };
    const warehouses = {}, offices = {}, materials = {}, products = {}, queuedJobs = {}, mutations = [], heartbeats = [], logs = [];
    const levels = { "Wilson Analytics": 1, "Project Insight": 0, "Smart Factories": 0 };
    const unlocked = new Set(["Office API", "Warehouse API", "Smart Supply"]);
    const key = (d, c) => d + "/" + c;
    const recipe = d => divisions[d].industry === "Agriculture" ? { Water: 0.5, Chemicals: 0.2 } : { Plants: 1 };
    const material = (d, c, name) => {
        const id = key(d,c) + "/" + name;
        return materials[id] ??= { name, stored: 20, buyAmount: 0, marketPrice: 100,
            productionAmount: recipe(d)[name] ? -recipe(d)[name] : ["Plants", "Food"].includes(name) ? 2 : 0,
            desiredSellAmount: "MAX", desiredSellPrice: "MP", actualSellAmount: 2,
            quality: 1, importAmount: 0, exports: [] };
    };
    function addCity(d, c, low = false) {
        if (!divisions[d].cities.includes(c)) divisions[d].cities.push(c);
        warehouses[key(d,c)] = { size: 100, sizeUsed: 12, smartSupplyEnabled: false };
        offices[key(d,c)] = { size: 9, numEmployees: 9, employeeJobs: clone(d === "Tobacco" ? tobaccoJobs : agriJobs),
            avgEnergy: low ? 80 : 100, avgMorale: low ? 80 : 100, maxEnergy: 100, maxMorale: 100, teaPending: false, partyMult: 1 };
        for (const name of divisions[d].products) products[key(d,c)+"/"+name] = {
            name, developmentProgress: 100, productionAmount: 0.5, actualSellAmount: 0.5,
            stored: 0, rating: 100, desiredSellAmount: "MAX", desiredSellPrice: "MP", size: 0.1 };
    }
    for (const d of Object.values(divisions)) for (const c of d.cities) addCity(d.name,c);
    if (adopted) { addCity("Agri", "Chongqing", true); addCity("Tobacco", "Aevum", true); }
    let round = 4, exitHandler, failure, stop;
    const api = {
        hasCorporation: () => true, getCorporation: () => clone(corp),
        getInvestmentOffer: () => ({ round, funds: 12e9, shares: 200e6 }),
        getDivision: d => clone(divisions[d]), hasUnlock: name => unlocked.has(name),
        getUnlockCost: name => name === "Export" ? 20e9 : 25e9,
        purchaseUnlock: name => { corp.funds -= api.getUnlockCost(name); unlocked.add(name); mutations.push([name]); },
        getConstants: () => ({ secondsPerMarketCycle: 10, teaCostPerEmployee: 500e3,
            officeInitialCost: 4e9, warehouseInitialCost: 5e9 }),
        hasWarehouse: (d,c) => Boolean(warehouses[key(d,c)]), getWarehouse: (d,c) => clone(warehouses[key(d,c)]),
        getOffice: (d,c) => clone(offices[key(d,c)]),
        getIndustryData: industry => ({ requiredMaterials: industry === "Agriculture" ? { Water: 0.5, Chemicals: 0.2 } : { Plants: 1 } }),
        getMaterial: (d,c,n) => clone(material(d,c,n)), getMaterialData: () => ({ size: 0.1 }),
        buyMaterial: (d,c,n,amount) => {
            if (failure?.(d,c,n,amount)) throw new Error("interrupted order");
            material(d,c,n).buyAmount = amount; mutations.push(["buy", d,c,n,amount]);
        },
        setSmartSupply: (d,c,value) => { warehouses[key(d,c)].smartSupplyEnabled = value; },
        setSmartSupplyOption: () => {},
        getUpgradeLevel: name => levels[name] ?? 0,
        getUpgradeLevelCost: name => name === "Wilson Analytics" ? 8e9 : name === "Project Insight" ? 5e9 : 1e9,
        levelUpgrade: name => { corp.funds -= api.getUpgradeLevelCost(name); levels[name] = (levels[name] ?? 0) + 1; mutations.push([name]); },
        getHireAdVertCost: () => 1.191016e9,
        hireAdVert: d => { corp.funds -= api.getHireAdVertCost(); divisions[d].numAdVerts++; mutations.push(["AdVert",d]); },
        getUpgradeWarehouseCost: () => 1e9,
        upgradeWarehouse: (d,c) => { corp.funds -= 1e9; warehouses[key(d,c)].size += 100; mutations.push(["warehouse",d,c]); },
        issueDividends: rate => { corp.dividendRate=rate; mutations.push(["dividends",rate]); },
        hasResearched: () => false, getResearchCost: () => 5e3,
        getProduct: (d,c,n) => clone(products[key(d,c)+"/"+n]),
        sellMaterial: (d,c,n,amount,price) => { Object.assign(material(d,c,n), { desiredSellAmount: amount, desiredSellPrice: price }); mutations.push(["sale",d,c,n]); },
        sellProduct: (d,c,n,amount,price) => { Object.assign(products[key(d,c)+"/"+n], { desiredSellAmount: amount, desiredSellPrice: price }); mutations.push(["product sale",d,c,n]); },
        exportMaterial: (d,c,to,city,n,amount) => { material(d,c,n).exports.push({ division: to, city, amount }); mutations.push(["export",d,c,to,city]); },
        cancelExportMaterial: (d,c,to,city,n) => { material(d,c,n).exports = material(d,c,n).exports.filter(r => r.division !== to || r.city !== city); },
        buyTea: (d,c) => { offices[key(d,c)].teaPending = true; corp.funds -= offices[key(d,c)].numEmployees * 500e3; mutations.push(["tea",d,c]); return true; },
        throwParty: (d,c,cost) => { offices[key(d,c)].partyMult = 1 + cost / 1e7; corp.funds -= cost * offices[key(d,c)].numEmployees; mutations.push(["party",d,c]); return 1.2; },
        setJobAssignment: (d,c,job,count) => {
            const pending = queuedJobs[key(d,c)] ??= clone(offices[key(d,c)].employeeJobs);
            const assigned = Object.entries(pending).reduce((sum,[role,n])=>sum+(role === "Unassigned" || role === job ? 0 : n),0);
            if (assigned + count > offices[key(d,c)].numEmployees) return false;
            pending[job] = count; mutations.push(["job",d,c,job,count]); return true;
        },
        nextUpdate: async () => {
            const completed = corp.nextState;
            if (completed === "START") {
                corp.funds += (corp.revenue - corp.expenses) * 10;
                for (const [id,jobs] of Object.entries(queuedJobs)) { offices[id].employeeJobs = clone(jobs); delete queuedJobs[id]; }
                // Tagged 3.0.1 upkeep: tea adds 2, Intern ratio controls decay/growth.
                for (const office of Object.values(offices)) {
                    if (!office.numEmployees) continue;
                    const perf = office.numEmployees < 9 ? 1.002 : 1 + 0.002 * Math.min(1/9, (office.employeeJobs.Intern ?? 0)/office.numEmployees - 1/9) * 9;
                    office.avgEnergy = Math.max(10,Math.min(office.maxEnergy,(office.avgEnergy-0.001)*perf+(office.teaPending ? 2 : 0)));
                    office.avgMorale = Math.max(10,Math.min(office.maxMorale,((office.avgMorale-0.001)*perf+(office.partyMult-1)*10)*office.partyMult));
                    office.teaPending=false;office.partyMult=1;
                }
            }
            if (completed === "PURCHASE") for (const [id, stock] of Object.entries(materials)) {
                if (!id.startsWith("Unlisted/")) { stock.stored += stock.buyAmount * 10; corp.funds -= stock.buyAmount * 10 * stock.marketPrice; }
            }
            if (completed === "PRODUCTION") for (const stock of Object.values(materials)) stock.stored = Math.max(0, stock.stored + stock.productionAmount * 10);
            if (completed === "SALE") for (const stock of Object.values(materials)) if (stock.productionAmount > 0) stock.stored = 0;
            corp.nextState = phases[(phases.indexOf(completed) + 1) % phases.length];
            return completed;
        },
    };
    const ns = { getResetInfo: () => ({currentNode:3,ownedSF:new Map()}),
        getBitNodeMultipliers: () => ({CorporationValuation:1}), corporation: api, pid: 1, args: [], getHostname: () => "home", getScriptName: () => "corp.js",
        ps: () => [{ pid: 1, filename: "corp.js" }], atExit: f => { exitHandler = f; },
        print: s => logs.push(s), tprint: s => logs.push(s),
        write: (_p,s) => heartbeats.push(JSON.parse(s)),
        sleep: async () => { if (stop?.()) throw new Error("STOP_FIXTURE"); } };
    async function run(args, until) {
        ns.args = args.includes("--capital-auto") ? args : [...args,"--capital-off"]; stop = until;
        try { await main(ns); }
        catch (error) { if (error.message !== "STOP_FIXTURE") throw error; }
    }
    const plan = () => ({ ...clone(corp), reserve: 5e9, stage: corp.public ? "STEADY" : "GROW", round,
        operatingRate: corp.revenue - corp.expenses, secondsPerMarketCycle: 10, satelliteSelling: true });
    return { ns, api, corp, divisions, warehouses, offices, materials, material, products, unlocked, levels,
        queuedJobs, mutations, heartbeats, logs, plan, addCity, run, setRound: value => { round=value; }, exit: () => exitHandler(), fail: f => { failure = f; } };
}

test("shutdown sweeps live orders in newly adopted cities, preserves earning orders and ignores unlisted divisions", async () => {
    const f = fixture(); f.corp.nextState = "PURCHASE";
    f.material("Agri", "Sector-12", "Water").stored = 0;
    await f.run(["--apply", "--products", "--manual-supply"], () => true);
    assert.ok(f.material("Agri", "Sector-12", "Water").buyAmount > 0);
    f.addCity("Agri", "Chongqing");
    f.material("Agri", "Chongqing", "Robots").buyAmount = 2;
    f.material("Tobacco", "Sector-12", "Plants").buyAmount = 3;
    f.warehouses["Tobacco/Sector-12"].smartSupplyEnabled = true;
    f.material("Unlisted", "Sector-12", "Water").buyAmount = 7;
    const route = { division: "Tobacco", city: "Sector-12", amount: "1" };
    f.material("Agri", "Aevum", "Plants").exports.push(route);
    const sale = clone(f.material("Agri", "Sector-12", "Plants"));
    f.exit();
    for (const [id, stock] of Object.entries(f.materials)) if (!id.startsWith("Unlisted/")) assert.equal(stock.buyAmount,0,id);
    assert.equal(f.warehouses["Tobacco/Sector-12"].smartSupplyEnabled,false);
    assert.equal(f.material("Unlisted", "Sector-12", "Water").buyAmount,7);
    assert.deepEqual(f.material("Agri", "Aevum", "Plants").exports,[route]);
    assert.equal(f.material("Agri", "Sector-12", "Plants").desiredSellAmount,sale.desiredSellAmount);
});

test("interrupted cleanup continues elsewhere and restart retries the retained live buy rate", async () => {
    const f = fixture({adopted:true});
    for (const d of ["Agri", "Tobacco"]) for (const c of f.divisions[d].cities) f.material(d,c,d === "Agri" ? "Water" : "Plants").buyAmount = 1;
    f.fail((d,c,n,amount) => d === "Agri" && c === "Sector-12" && n === "Water" && amount === 0);
    const first = reconcileManagedPurchases(f.ns,call);
    assert.equal(first.errors.length,1);
    assert.equal(f.material("Agri","Aevum","Water").buyAmount,0);
    assert.equal(f.material("Tobacco","Aevum","Plants").buyAmount,0);
    assert.equal(f.material("Agri","Sector-12","Water").buyAmount,1);
    f.fail(null); f.corp.nextState = "PRODUCTION";
    await f.run(["--apply", "--products", "--manual-supply"], () => true);
    assert.equal(f.material("Agri","Sector-12","Water").buyAmount,0);
    assert.equal(f.heartbeats.at(-1).blocker,null);
});

test("all three pressured warehouses upgrade, then the next pass is idempotent", () => {
    const f = fixture();
    for (const [id,w] of Object.entries(f.warehouses)) if (!id.startsWith("Unlisted/")) w.sizeUsed=90;
    const result = reconcileWarehousePressure(f.ns,call,f.plan());
    assert.equal(result.length,3); assert.ok(result.every(r=>r.upgraded));
    assert.equal(f.corp.funds,97e9);
    assert.deepEqual(reconcileWarehousePressure(f.ns,call,f.plan()),[]);
    assert.equal(f.warehouses["Unlisted/Sector-12"].size,100);
});

test("warehouse deferrals use the same reserve rule and refresh cash between cities", () => {
    const f = fixture({funds:7.9e9});
    for (const [id,w] of Object.entries(f.warehouses)) if (!id.startsWith("Unlisted/")) w.sizeUsed=90;
    assert.ok(reconcileWarehousePressure(f.ns,call,f.plan()).every(r=>!r.upgraded && r.blocker));
    f.corp.funds=9e9;
    const mixed = reconcileWarehousePressure(f.ns,call,f.plan());
    assert.equal(mixed.filter(r=>r.upgraded).length,2); assert.equal(mixed.filter(r=>r.blocker).length,1);
    assert.equal(f.corp.funds,7e9);
});

test("approved package completes at its coverage boundary using fresh live state between steps", () => {
    const f = fixture({funds:41e9});
    assert.equal(deployRound3Package(f.ns,call,f.plan()),null);
    f.corp.nextState="PURCHASE";
    for (const name of ["Export","Wilson Analytics","AdVert","Project Insight"]) {
        assert.equal(deployRound3Package(f.ns,call,clone(f.plan()))?.name,name);
    }
    assert.equal(f.corp.funds,6.808984e9);
    assert.equal(deployRound3Package(f.ns,call,f.plan()),null);
});

test("whole loop prioritizes the approved package over a populated discretionary ranking", async () => {
    const f = fixture({funds:41e9});
    await f.run(["--apply","--products","--manual-supply","--fund-chain","--upgrades","--cycles","5"]);
    const capital = f.mutations.filter(([type])=>["Export","Wilson Analytics","AdVert","Project Insight","Smart Factories","FocusWires","Neural Accelerators"].includes(type));
    assert.deepEqual(capital.map(([type])=>type),["Export","Wilson Analytics","AdVert","Project Insight"]);
    assert.ok(f.heartbeats.some(h=>h.upgradePlan?.ranked.length>0));
    assert.equal(f.levels["Smart Factories"],0);
    assert.ok(f.corp.funds>=5e9);
    assert.ok(f.heartbeats.every(h=>!h.blocker),f.logs.join("\n"));
});

for (const publicCorp of [false,true]) test("phase loop covers adopted cities in " + (publicCorp ? "STEADY" : "GROW"), async () => {
    const f = fixture({adopted:true,publicCorp});
    for (const d of ["Agri","Tobacco"]) for (const c of f.divisions[d].cities) {
        f.offices[d+"/"+c].avgEnergy=80; f.offices[d+"/"+c].avgMorale=80;
        for (const n of Object.keys(d === "Agri" ? {Water:1,Chemicals:1} : {Plants:1})) f.material(d,c,n).stored=0;
    }
    for (const w of Object.values(f.warehouses)) w.sizeUsed=90;
    await f.run(["--apply","--products","--manual-supply","--office-care","--ramp-office","--cycles","6"]);
    for (const d of ["Agri","Tobacco"]) for (const c of f.divisions[d].cities) {
        assert.ok(f.mutations.some(([t,div,city])=>t==="warehouse" && div===d && city===c),d+"/"+c);
        assert.ok((f.offices[d+"/"+c].employeeJobs.Intern ?? 0)>=1,d+"/"+c);
        assert.ok(f.offices[d+"/"+c].avgEnergy>=80,d+"/"+c);
        assert.ok(f.mutations.some(([t,div,city,,rate])=>t==="buy" && div===d && city===c && rate>0),d+"/"+c);
    }
    assert.ok(f.heartbeats.every(h=>!h.blocker),f.logs.join("\n"));
    assert.ok(f.heartbeats.some(h=>h.lastFullCycle?.length===5));
    assert.ok(!f.mutations.some(([,d])=>d==="Unlisted"));
});


test("queued staffing recovery applies the same targets to every managed office", async () => {
    const f = fixture({adopted:true});
    for (const d of ["Agri","Tobacco"]) for (const c of f.divisions[d].cities) {
        f.offices[d+"/"+c].employeeJobs = { Operations:0, Engineer:0, Business:0, Management:0, "Research & Development":9 };
        f.queuedJobs[d+"/"+c] = { Operations:0, Engineer:9, Business:0, Management:0, "Research & Development":0 };
    }
    await f.run(["--apply","--products","--ramp-office","--manual-supply","--cycles","9"]);
    for (const d of ["Agri","Tobacco"]) for (const c of f.divisions[d].cities) {
        const lowCity=(d === "Agri" && c === "Chongqing") || (d === "Tobacco" && c === "Aevum");
        const expected=lowCity ? {Operations:2,Engineer:2,Business:1,Management:1,"Research & Development":1,Intern:2} :
            d === "Agri" ? {Operations:2,Engineer:3,Business:1,Management:1,"Research & Development":1,Intern:1} :
            {Operations:2,Engineer:2,Business:1,Management:2,"Research & Development":1,Intern:1};
        assert.deepEqual(f.offices[d+"/"+c].employeeJobs,expected,d+"/"+c);
    }
    assert.ok(f.heartbeats.some(h=>h.stage === "BOOTSTRAP"));
    assert.ok(f.heartbeats.some(h=>h.stage === "GROW"));
    assert.ok(f.heartbeats.every(h=>!h.blocker),f.logs.join("\n"));
});

test("preservation reconciles essential inputs across adopted cities and pauses boost spending", async () => {
    const f = fixture({funds:4.5e9,adopted:true}); f.corp.nextState="PURCHASE";
    for (const d of ["Agri","Tobacco"]) for (const c of f.divisions[d].cities) {
        f.material(d,c,d === "Agri" ? "Water" : "Plants").stored=0;
        f.material(d,c,"Robots").buyAmount=10;
        f.warehouses[d+"/"+c].smartSupplyEnabled=true;
    }
    await f.run(["--apply","--products"],()=>true);
    assert.equal(f.heartbeats.at(-1).stage,"PRESERVE");
    let total=0;
    for (const d of ["Agri","Tobacco"]) for (const c of f.divisions[d].cities) {
        assert.ok(f.material(d,c,d === "Agri" ? "Water" : "Plants").buyAmount>0,d+"/"+c);
        assert.equal(f.material(d,c,"Robots").buyAmount,0);
        assert.equal(f.warehouses[d+"/"+c].smartSupplyEnabled,false);
    }
    for (const [id,m] of Object.entries(f.materials)) if (!id.startsWith("Unlisted/")) total+=m.buyAmount*10*m.marketPrice;
    assert.ok(total<=1e6);
});

test("negative cash leaves earning orders intact and creates no purchase commitment", async () => {
    const f = fixture({funds:-1e9,adopted:true}); f.corp.nextState="PURCHASE";
    f.material("Agri","Sector-12","Water").buyAmount=20;
    await f.run(["--apply","--products"],()=>true);
    for (const [id,m] of Object.entries(f.materials)) if (!id.startsWith("Unlisted/")) assert.equal(m.buyAmount,0,id);
    assert.equal(f.heartbeats.at(-1).stage,"PRESERVE");
    assert.equal(f.material("Agri","Sector-12","Plants").desiredSellAmount,"MAX");
});

test("package spending still holds the live reserve and each allocation ceiling", () => {
    const f = fixture({funds:41e9}); f.corp.nextState="PURCHASE";
    assert.equal(deployRound3Package(f.ns,call,f.plan()).name,"Export");
    f.corp.funds=12e9;
    assert.equal(deployRound3Package(f.ns,call,f.plan()),null);
    assert.equal(f.levels["Wilson Analytics"],1);
    f.corp.funds=100e9;
    const quote=f.api.getUpgradeLevelCost;
    f.api.getUpgradeLevelCost=name=>name === "Wilson Analytics" ? 8.6e9 : quote(name);
    assert.equal(deployRound3Package(f.ns,call,f.plan()),null);
    assert.equal(f.levels["Wilson Analytics"],1);
});


test("input buffers and profit-based boost caps apply separately to every managed city", async () => {
    const f = fixture({adopted:true}); f.setRound(3);
    const boosts=["Hardware","Robots","AI Cores","Real Estate"];
    for (const c of f.divisions.Agri.cities) for (const n of boosts) f.material("Agri",c,n).marketPrice=1e7;
    await f.run(["--apply","--products","--ramp-office","--manual-supply"],()=>
        f.heartbeats.at(-1)?.completedPhase === "START" && f.heartbeats.at(-1)?.lastSettlement?.number >= 12);
    assert.ok(f.heartbeats.every(h=>!h.blocker),f.logs.join("\n"));
    for (const c of f.divisions.Agri.cities) {
        const spent=boosts.reduce((sum,n)=>{const m=f.material("Agri",c,n);return sum+m.buyAmount*10*m.marketPrice;},0);
        assert.ok(spent>0,c); assert.ok(spent<=225000+0.01,c+": "+spent);
        for (const n of ["Water","Chemicals"]) {
            const m=f.material("Agri",c,n);
            assert.ok(m.stored+m.buyAmount*10+1e-6>=-m.productionAmount*10*3,c+"/"+n);
        }
    }
    for (const c of f.divisions.Tobacco.cities) {
        const m=f.material("Tobacco",c,"Plants");
        assert.ok(m.stored+m.buyAmount*10>=40,c);
    }
});

test("an interrupted export replacement is rebuilt from live routes on restart", async () => {
    const f=fixture(); f.unlocked.add("Export"); f.corp.nextState="EXPORT";
    f.material("Tobacco","Sector-12","Plants").stored=0;
    const source=f.material("Agri","Sector-12","Plants");
    source.exports.push({division:"Tobacco",city:"Sector-12",amount:"0.1"});
    const unrelated={division:"Unlisted",city:"Sector-12",amount:"2"}; source.exports.push(unrelated);
    const create=f.api.exportMaterial; let fail=true;
    f.api.exportMaterial=(...args)=>{ if(fail){fail=false;throw Error("interrupted export creation");} create(...args); };
    await f.run(["--apply","--products","--manual-supply"],()=>true);
    assert.match(f.heartbeats.at(-1).blocker,/interrupted export creation/);
    assert.equal(source.exports.some(r=>r.division==="Tobacco"),false);
    await f.run(["--apply","--products","--manual-supply"],()=>true);
    const routes=source.exports.filter(r=>r.division==="Tobacco");
    assert.equal(routes.length,1); assert.equal(Number(routes[0].amount),1);
    assert.ok(source.exports.some(r=>r.division==="Unlisted" && r.amount===unrelated.amount));
    assert.equal(f.heartbeats.at(-1).blocker,null);
});


function coldFormation({node=3, cash=0, grants=false, eligibility=null}={}) {
    const f=fixture({funds:150e9}); let exists=false;
    f.corp.divisions=[]; f.corp.revenue=0; f.corp.expenses=0; f.setRound(1);
    f.divisions.Agri.cities=["Sector-12"];
    Object.assign(f.offices["Agri/Sector-12"],{size:3,numEmployees:0,employeeJobs:{Operations:0,Engineer:0,Business:0,Unassigned:0}});
    f.unlocked.clear();
    for(const n of ["Water","Chemicals","Plants","Food"]) Object.assign(f.material("Agri","Sector-12",n),{stored:0,desiredSellAmount:"0",actualSellAmount:0});
    f.api.hasCorporation=()=>exists;
    let playerCash=cash;
    f.ns.getResetInfo=()=>({currentNode:node,ownedSF:new Map()});
    f.ns.getServerMoneyAvailable=()=>playerCash;
    f.api.canCreateCorporation=selfFund=>eligibility ?? (node!==3 && !selfFund ? "UseSeedMoneyOutsideBN3" : "Success");
    f.api.createCorporation=(_name,selfFund)=>{
        assert.equal(selfFund,node!==3);exists=true;
        if(selfFund){assert.ok(playerCash>=150e9);playerCash-=150e9;}
        if(grants){f.unlocked.add("Office API");f.unlocked.add("Warehouse API");}
        Object.assign(f.corp,{numShares:1e9,totalShares:selfFund?1e9:1.5e9,investorShares:selfFund?0:500e6});
        f.mutations.push(["create",selfFund]); return true;
    };
    const industry=f.api.getIndustryData;
    f.api.getIndustryData=name=>({...industry(name),startingCost:40e9});
    f.api.getUnlockCost=name=>["Office API","Warehouse API"].includes(name) ? 50e9 : name === "Export" ? 20e9 : 25e9;
    f.api.expandIndustry=(industry,name)=>{assert.equal(industry,"Agriculture");f.corp.funds-=40e9;f.corp.divisions.push(name);f.mutations.push(["industry",name]);};
    f.api.hireEmployee=(d,c,job)=>{
        const office=f.offices[d+"/"+c]; if(office.numEmployees>=office.size)return false;
        office.numEmployees++;office.employeeJobs[job]=(office.employeeJobs[job]??0)+1;return true;
    };
    const advance=f.api.nextUpdate;
    f.api.nextUpdate=async()=>{
        if(f.corp.nextState==="START") {
            const office=f.offices["Agri/Sector-12"];
            f.corp.expenses=office.numEmployees*500;
            const selling=f.material("Agri","Sector-12","Plants").desiredSellAmount==="MAX";
            f.corp.revenue=selling && office.numEmployees===3 ? 6000 : 0;
            f.divisions.Agri.lastCycleRevenue=f.corp.revenue; f.divisions.Agri.lastCycleExpenses=f.corp.expenses;
            for(const n of ["Plants","Food"]) f.material("Agri","Sector-12",n).actualSellAmount=selling?2:0;
        }
        return advance();
    };
    return {...f, setCash:value=>{playerCash=value;}, playerCash:()=>playerCash};
}

for(const grants of [false,true]) test("cold BN3 seed formation bootstraps with " + (grants?"native free APIs":"worst-case paid APIs"), async () => {
    const f=coldFormation({grants});
    await f.run(["--apply","--manual-supply","--cycles","12"]);
    assert.deepEqual(f.corp.divisions,["Agri"]); assert.equal(f.offices["Agri/Sector-12"].numEmployees,3);
    assert.ok(f.corp.revenue>f.corp.expenses); assert.ok(f.corp.funds>=5e9);
    assert.ok(grants ? f.corp.funds>100e9 : f.corp.funds<11e9);
    assert.equal(f.corp.numShares,1e9); assert.equal(f.corp.totalShares,1.5e9);
    assert.equal(f.corp.investorShares,500e6); assert.equal(f.playerCash(),0);
    assert.equal(f.mutations.filter(m=>m[0]==="create").length,1);
    assert.equal(f.mutations.filter(m=>["Office API","Warehouse API"].includes(m[0])).length,grants?0:2);
    assert.ok(!f.unlocked.has("Smart Supply")); assert.ok(!f.unlocked.has("Export"));
    assert.ok(f.heartbeats.some(h=>h.stage==="BOOTSTRAP")); assert.ok(f.heartbeats.some(h=>h.stage==="GROW"));
    assert.ok(f.heartbeats.every(h=>!h.blocker),f.logs.join("\n"));
    assert.ok(f.logs.some(l=>l.startsWith("[corp formation]")));
});

for(const preset of ["auto","self-funded"]) test(preset+" waits below $150b outside BN3, then creates once and bootstraps",async()=>{
    const f=coldFormation({node:4,cash:150e9-1});
    await f.run(["--apply","--preset",preset,"--once"],()=>true);
    assert.equal(f.mutations.length,0);assert.equal(f.heartbeats.at(-1).stage,"NO_CORP");
    assert.equal(f.heartbeats.at(-1).blocker,"Waiting for player cash");
    f.setCash(150e9);
    await f.run(["--apply","--preset",preset,"--manual-supply","--cycles","12"]);
    assert.equal(f.playerCash(),0);assert.equal(f.corp.numShares,1e9);
    assert.equal(f.corp.totalShares,1e9);assert.equal(f.corp.investorShares,0);
    assert.equal(f.mutations.filter(m=>m[0]==="create").length,1);
    assert.ok(f.corp.revenue>f.corp.expenses && f.corp.funds>=5e9);
    await f.run(["--apply","--preset",preset,"--once"],()=>true);
    assert.equal(f.mutations.filter(m=>m[0]==="create").length,1);
});

test("seed-only preset and disabled Corporation access never fall through to player-funded creation",async()=>{
    for(const eligibility of ["UseSeedMoneyOutsideBN3","NoSf3OrDisabled","DisabledBySoftCap"]){
        const f=coldFormation({node:4,cash:1e15,eligibility});
        await f.run(["--apply","--preset","bn3","--once"],()=>true);
        assert.equal(f.mutations.length,0);assert.equal(f.heartbeats.at(-1).blocker,eligibility);
    }
});

test("formation rechecks cash immediately before committing and observe mode cannot create",async()=>{
    const f=coldFormation({node:4,cash:150e9});let reads=0;
    f.ns.getServerMoneyAvailable=()=>++reads===1?150e9:150e9-1;
    await f.run(["--apply","--once"],()=>true);
    assert.equal(f.mutations.length,0);
    const observed=coldFormation({grants:true});
    await observed.run(["--once"],()=>true);assert.equal(observed.mutations.length,0);
});

test("private IPO transition becomes STEADY once and retains all managed city rules", async () => {
    const f=fixture({adopted:true}); f.setRound(5); f.corp.sharePrice=10; let ipos=0;
    f.api.goPublic=shares=>{ipos++;f.corp.public=true;f.corp.numShares-=shares;f.corp.issuedShares+=shares;f.corp.funds+=shares*f.corp.sharePrice;return true;};
    await f.run(["--apply","--products","--manual-supply","--ipo","--cycles","5"]);
    assert.equal(ipos,1);assert.equal(f.corp.public,true);
    assert.ok(f.heartbeats.some(h=>h.stage==="IPO"));assert.equal(f.heartbeats.at(-1).stage,"STEADY");
    assert.ok(f.heartbeats.every(h=>!h.blocker),f.logs.join("\n"));
    assert.ok(!f.mutations.some(([,d])=>d==="Unlisted"));
});


test("nine-person offices recover with two Interns and maintain with one without dropping R&D", () => {
    const low={avgEnergy:80,avgMorale:82,employeeJobs:{Intern:0}};
    assert.deepEqual(officeJobTargets(agriJobs,low),{Operations:2,Engineer:2,Business:1,Management:1,"Research & Development":1,Intern:2});
    assert.deepEqual(officeJobTargets(tobaccoJobs,low),{Operations:2,Engineer:2,Business:1,Management:1,"Research & Development":1,Intern:2});
    const high={avgEnergy:96,avgMorale:95,employeeJobs:{Intern:2}};
    assert.deepEqual(officeJobTargets(agriJobs,high),{Operations:2,Engineer:3,Business:1,Management:1,"Research & Development":1,Intern:1});
    const stable={avgEnergy:92,avgMorale:90,employeeJobs:{Intern:1}};
    assert.equal(officeJobTargets(agriJobs,stable).Intern,1);
    assert.equal(officeJobTargets(agriJobs,{...stable,avgEnergy:84}).Intern,2);
});

test("upkeep does not spend treasury cash at low or negative operating profit", () => {
    for(const revenue of [0,9900,10100]) {
        const f=fixture();f.corp.revenue=revenue;f.corp.expenses=10000;
        for(const office of Object.values(f.offices)){office.avgEnergy=20;office.avgMorale=20;}
        const cash=f.corp.funds;
        const care=careForManagedOffices(f.ns,call,f.plan(),new Set(),true);
        assert.equal(care.spent,0);assert.equal(f.corp.funds,cash);
        assert.ok(care.budget<=Math.max(0,revenue-10000));
        assert.equal(care.internAssignments.length,3);
        assert.ok(!f.mutations.some(([type])=>["tea","party"].includes(type)));
    }
});

test("200 settled cycles restore office health without recurring paid upkeep or a cash leak", async () => {
    const f=fixture();
    for(const office of Object.values(f.offices)){office.avgEnergy=80;office.avgMorale=80;}
    const cash=f.corp.funds;
    await f.run(["--apply","--products","--manual-supply","--ramp-office","--office-care","--cycles","200"]);
    assert.equal(f.heartbeats.at(-1).careSpent,0);
    assert.ok(f.corp.funds>cash);
    for(const d of ["Agri","Tobacco"])for(const c of f.divisions[d].cities){
        const office=f.offices[d+"/"+c];
        assert.ok(office.avgEnergy>=94 && office.avgMorale>=94,d+"/"+c);
        assert.equal(office.employeeJobs.Intern,1);
        assert.equal(office.employeeJobs["Research & Development"],1);
        assert.equal(Object.values(office.employeeJobs).reduce((a,b)=>a+b,0),9);
    }
    assert.ok(f.heartbeats.every(h=>!h.blocker),f.logs.join("\n"));
    assert.ok(!f.mutations.some(([type])=>["tea","party"].includes(type)));
});

function scalingFixture(options={}) {
    const f=fixture({funds:40e9,...options}); f.ns.args=["--scale-production"];f.corp.nextState="PURCHASE";
    f.api.getOfficeSizeUpgradeCost=(_d,_c,n)=>2e9*n;
    f.api.upgradeOfficeSize=(d,c,n)=>{f.corp.funds-=f.api.getOfficeSizeUpgradeCost(d,c,n);f.offices[d+"/"+c].size+=n;f.mutations.push(["office",d,c,n]);};
    f.api.hireEmployee=(d,c,job)=>{const o=f.offices[d+"/"+c];if(o.numEmployees>=o.size)return false;o.numEmployees++;o.employeeJobs[job]=(o.employeeJobs[job]??0)+1;return true;};
    return f;
}
const stableScaling={supplyStreak:12,demandStreak:0,profitStreak:12};

test("P4 waits for sustained inputs and healthy offices, and has stage-specific ceilings",()=>{
    const f=scalingFixture();
    assert.equal(planProductionScaling(f.ns,call,f.plan(),{...stableScaling,supplyStreak:11}).selected,null);
    for(const o of Object.values(f.offices)){o.avgEnergy=80;o.avgMorale=80;}
    assert.equal(planProductionScaling(f.ns,call,f.plan(),stableScaling).selected,null);
    for(const o of Object.values(f.offices)){o.avgEnergy=100;o.avgMorale=100;}
    f.setRound(3);let p=planProductionScaling(f.ns,call,f.plan(),stableScaling);assert.equal(p.ceiling,9);assert.equal(p.selected,null);
    f.setRound(4);p=planProductionScaling(f.ns,call,f.plan(),stableScaling);assert.equal(p.ceiling,12);assert.equal(p.selected.kind,"office");
    f.corp.public=true;assert.equal(planProductionScaling(f.ns,call,f.plan(),stableScaling).ceiling,18);
});

test("P4 buys one office step, preserves replacement cash, and retains Intern and research roles",()=>{
    const f=scalingFixture();const p=planProductionScaling(f.ns,call,f.plan(),stableScaling);
    const action=deployProductionScaling(f.ns,call,f.plan(),p.selected);
    assert.equal(action.size,12);assert.equal(f.corp.funds,34e9);assert.ok(f.corp.funds>=p.reserve+p.replacementReserve);
    const office=f.offices["Tobacco/Sector-12"];assert.equal(office.numEmployees,12);
    const queued=f.queuedJobs["Tobacco/Sector-12"]??office.employeeJobs;
    assert.equal(queued.Intern,2);assert.equal(queued["Research & Development"],2);
    assert.equal(Object.values(queued).reduce((a,b)=>a+b,0),12);
    assert.equal(deployProductionScaling(f.ns,call,f.plan(),p.selected),null);
});

test("P4 rechecks cost, cash, phase and warehouse headroom before a capital action",()=>{
    for(const mutation of [f=>f.corp.funds=7e9,f=>f.api.getOfficeSizeUpgradeCost=()=>50e9,
        f=>f.corp.nextState="PRODUCTION",f=>f.warehouses["Tobacco/Sector-12"].sizeUsed=70]) {
        const f=scalingFixture();const p=planProductionScaling(f.ns,call,f.plan(),stableScaling);mutation(f);
        const cash=f.corp.funds;assert.equal(deployProductionScaling(f.ns,call,f.plan(),p.selected),null);assert.equal(f.corp.funds,cash);
    }
});

test("an interrupted P4 hire resumes from purchased office capacity without another office purchase",async()=>{
    const f=scalingFixture();const p=planProductionScaling(f.ns,call,f.plan(),stableScaling);
    const hire=f.api.hireEmployee;let calls=0;
    f.api.hireEmployee=(...args)=>{if(++calls===2)throw Error("interrupted hire");return hire(...args);};
    assert.throws(()=>deployProductionScaling(f.ns,call,f.plan(),p.selected),/interrupted hire/);
    assert.equal(f.offices["Tobacco/Sector-12"].numEmployees,10);f.api.hireEmployee=hire;f.corp.nextState="START";
    await f.run(["--apply","--products","--ramp-office","--office-care","--manual-supply","--scale-production","--cycles","4"]);
    assert.equal(f.offices["Tobacco/Sector-12"].numEmployees,12);
    assert.equal(f.mutations.filter(([type])=>type==="office").length,1);
    assert.ok(f.heartbeats.every(h=>!h.blocker),f.logs.join("\n"));
});

test("persistent demand limits continue the completed campaign before expanding production",()=>{
    const f=scalingFixture();f.divisions.Tobacco.numAdVerts=4;f.levels["Wilson Analytics"]=2;
    for(const product of Object.values(f.products)){product.stored=100;product.actualSellAmount=0.1;}
    const p=planProductionScaling(f.ns,call,f.plan(),{...stableScaling,demandStreak:12});
    assert.equal(p.selected.name,"AdVert");assert.equal(p.selected.division,"Tobacco");
    const action=deployProductionScaling(f.ns,call,f.plan(),p.selected);assert.equal(action.name,"AdVert");
    assert.equal(f.divisions.Tobacco.numAdVerts,5);assert.equal(f.mutations.some(([type])=>type==="office"),false);
});

function researchFixture() {
    const f=fixture();f.corp.nextState="PURCHASE";const learned=new Set();
    const costs={"Hi-Tech R&D Laboratory":5000,"Market-TA.I":20000,"Market-TA.II":50000};
    f.api.hasResearched=(d,n)=>learned.has(d+"/"+n);f.api.getResearchCost=(_d,n)=>costs[n];
    f.api.research=(d,n)=>{f.divisions[d].researchPoints-=costs[n];learned.add(d+"/"+n);f.mutations.push(["research",d,n]);};
    f.api.setMaterialMarketTA1=()=>{};f.api.setMaterialMarketTA2=()=>{};
    f.api.setProductMarketTA1=()=>{};f.api.setProductMarketTA2=(d,n,on)=>f.mutations.push(["product TA2",d,n,on]);
    return f;
}

test("P4 research banks the whole TA chain plus reserve and recovers after an interrupted purchase",()=>{
    const f=researchFixture();f.divisions.Tobacco.researchPoints=84999;
    let p=reconcileResearchBanks(f.ns,call,true);assert.equal(f.mutations.length,0);assert.equal(p.find(x=>x.division==="Tobacco").gap,1);
    f.divisions.Tobacco.researchPoints=85000;const research=f.api.research;
    f.api.research=(d,n)=>{if(n==="Market-TA.I")throw Error("interrupted research");research(d,n);};
    assert.throws(()=>reconcileResearchBanks(f.ns,call,true),/interrupted research/);
    assert.equal(f.divisions.Tobacco.researchPoints,80000);
    f.api.research=research;p=reconcileResearchBanks(f.ns,call,true);
    const tobacco=p.find(x=>x.division==="Tobacco");assert.equal(tobacco.ready,true);assert.equal(tobacco.points,10000);
    assert.equal(f.mutations.filter(([type,d,n])=>type==="research"&&d==="Tobacco"&&n==="Hi-Tech R&D Laboratory").length,1);
    f.divisions.Tobacco.researchPoints+=0.5;p=reconcileResearchBanks(f.ns,call,true,p);
    assert.equal(p.find(x=>x.division==="Tobacco").gainedPerSettlement,0.5);
});

test("P4 can research during development and activates TA on the surviving live seller",async()=>{
    const f=researchFixture();f.divisions.Tobacco.researchPoints=85000;
    f.products["Tobacco/Sector-12/P2"].developmentProgress=50;
    await f.run(["--apply","--products","--manual-supply","--scale-production","--cycles","4"]);
    assert.equal(f.api.hasResearched("Tobacco","Market-TA.II"),true);
    assert.ok(f.mutations.some(([type,d,n,on])=>type==="product TA2"&&d==="Tobacco"&&n==="P1"&&on));
    assert.equal(f.api.getInvestmentOffer().round,4);assert.equal(f.corp.public,false);
    assert.ok(f.heartbeats.every(h=>!h.blocker),f.logs.join("\n"));
});

test("sustained-supply evidence rejects empty, missing, exhausted and thin production buffers",()=>{
    const make=after=>({productInputs:{stocks:[{before:20,after}]},agricultureInputs:[{stocks:[{before:20,after:10}]}]});
    assert.equal(supplySampleHealthy(make(10)),true);
    for(const after of [0,1,null,NaN])assert.equal(supplySampleHealthy(make(after)),false);
    assert.equal(supplySampleHealthy({productInputs:null,agricultureInputs:[]}),false);
});

test("post-round boost spending is bounded across three managed Agriculture cities",async()=>{
    const f=fixture({adopted:true});
    for(const c of f.divisions.Agri.cities)for(const n of ["Hardware","Robots","AI Cores","Real Estate"])f.material("Agri",c,n).marketPrice=1e9;
    await f.run(["--apply","--products","--manual-supply","--ramp-office"],()=>f.heartbeats.at(-1)?.completedPhase==="START"&&f.heartbeats.at(-1)?.lastSettlement?.number>=12);
    let spend=0;for(const c of f.divisions.Agri.cities)for(const n of ["Hardware","Robots","AI Cores","Real Estate"]){const m=f.material("Agri",c,n);spend+=m.buyAmount*10*m.marketPrice;}
    assert.ok(spend>0);assert.ok(spend<=900000*0.8+0.01,String(spend));
});

test("P4 counts sold and exported farm output only when actual leftover inventory is small",()=>{
 const f=scalingFixture();f.warehouses["Tobacco/Sector-12"].sizeUsed=70;
 const plants=f.material("Agri","Sector-12","Plants");plants.actualSellAmount=1;plants.productionAmount=2;plants.stored=0;plants.exports=[{division:"Tobacco",city:"Sector-12",amount:"1"}];
 let p=planProductionScaling(f.ns,call,f.plan(),stableScaling);
 assert.equal(p.selected.division,"Agri");assert.equal(p.selected.city,"Sector-12");
 plants.stored=50;p=planProductionScaling(f.ns,call,f.plan(),stableScaling);
 assert.equal(p.sites.find(s=>s.division==="Agri"&&s.city==="Sector-12").soldThrough,false);
});

test("P4 dry-run reports research and scaling holds without placing orders or spending",async()=>{
 const f=researchFixture();f.divisions.Tobacco.researchPoints=85000;
 await f.run(["--products","--scale-production","--cycles","4"]);
 assert.equal(f.mutations.length,0);assert.ok(f.heartbeats.at(-1).researchBanks.length>=2);
 assert.ok(f.heartbeats.at(-1).scalingStatus);assert.equal(f.divisions.Tobacco.researchPoints,85000);
});
test("P4 leaves sub-nine-person offices to the bootstrap ramp",()=>{
 const f=scalingFixture();for(const o of Object.values(f.offices)){o.size=3;o.numEmployees=3;}
 assert.equal(planProductionScaling(f.ns,call,f.plan(),stableScaling).selected,null);
});

function capitalFixture(options={}) {
 const f=fixture(options);f.levels["Wilson Analytics"]=2;f.levels["Project Insight"]=1;f.unlocked.add("Export");f.divisions.Tobacco.numAdVerts=4;f.corp.nextState="PURCHASE";f.corp.sharePrice=20;f.corp.issueNewSharesCooldown=0;
 f.api.goPublic=shares=>{if(f.corp.public)throw Error("already public");f.corp.public=true;f.corp.numShares-=shares;f.corp.issuedShares+=shares;f.corp.funds+=shares*f.corp.sharePrice;f.mutations.push(["IPO",shares]);return true;};
 f.api.issueNewShares=shares=>{if(f.corp.issueNewSharesCooldown>0)throw Error("cooldown");const profit=shares*f.corp.sharePrice;f.corp.funds+=profit;f.corp.totalShares+=shares;f.corp.issuedShares+=shares;f.corp.issueNewSharesCooldown=3600;f.mutations.push(["equity",shares]);return profit;};
 return f;
}
const autoFinance={automatic:true,ipo:true,ipoEarly:false,equity:true,dividendRate:0,explicitDividend:false,supplyStreak:12};

test("automatic IPO holds private rounds, liquidity, profit and supply gates then verifies once",()=>{
 const f=capitalFixture({funds:20e9});f.setRound(3);
 assert.equal(reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,false),null);
 f.setRound(4);
 assert.equal(reconcilePublicFinances(f.ns,call,f.plan(),{...autoFinance,supplyStreak:11},12,true,false),null);
 assert.equal(reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,11,true,false),null);
 f.corp.funds=5.1e9;assert.equal(reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,false),null);
 f.corp.funds=20e9;const result=reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,false);
 assert.equal(result.action,"IPO");assert.equal(result.shares,0);assert.equal(result.skippedPrivateRounds,1);
 assert.equal(result.before.numShares,result.after.numShares);assert.equal(f.corp.dividendRate,0);
 assert.equal(reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,false),null);
 assert.equal(f.mutations.filter(([type])=>type==="IPO").length,1);
});

test("automatic dividend policy compounds, pays above its cash gate, and cuts immediately in preservation",()=>{
 const f=capitalFixture({funds:20e9,publicCorp:true});
 assert.equal(reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,false),null);
 f.corp.funds=55e9;let result=reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,false);
 assert.equal(result.rate,0.05);assert.equal(f.corp.dividendRate,0.05);
 f.corp.nextState="SALE";result=reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,false,true);
 assert.equal(result.rate,0);assert.equal(f.corp.dividendRate,0);
 f.corp.nextState="PURCHASE";f.corp.funds=20e9;
 result=reconcilePublicFinances(f.ns,call,f.plan(),{...autoFinance,explicitDividend:true,dividendRate:0.02},12,true,false);
 assert.equal(result.rate,0.02);
});

test("automatic equity only repairs low liquidity and verifies cooldown, cash and dilution once",()=>{
 const f=capitalFixture({funds:20e9,publicCorp:true});
 assert.equal(reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,false),null);
 f.corp.funds=4.9e9;f.corp.issueNewSharesCooldown=60;
 assert.equal(reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,true),null);
 f.corp.issueNewSharesCooldown=0;const ceo=f.corp.numShares,total=f.corp.totalShares;
 const result=reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,true);
 assert.equal(result.action,"Issued corporate shares");assert.ok(result.shares>0);assert.equal(result.shares%1e7,0);
 assert.equal(f.corp.numShares,ceo);assert.equal(f.corp.totalShares,total+result.shares);assert.ok(f.corp.funds>=5.5e9);
 assert.equal(reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,true),null);
 assert.equal(f.mutations.filter(([type])=>type==="equity").length,1);
});

test("equity guards respect minimum price and retained ownership",()=>{
 const f=capitalFixture({funds:1e9,publicCorp:true});
 assert.ok(equityIssueSize(f.corp,5.5e9)>0);
 f.corp.sharePrice=0.5;assert.equal(equityIssueSize(f.corp,5.5e9),0);
 f.corp.sharePrice=20;f.corp.numShares=f.corp.totalShares*0.05;
 assert.equal(equityIssueSize(f.corp,5.5e9),0);
});

test("preservation requires three fresh healthy settlements and blocks core division liquidation",()=>{
 let p={funds:4.9e9,reserve:5e9,operatingRate:1};let state=updatePreservation(p,{active:false,healthy:0},true);
 assert.equal(state.active,true);p.funds=6e9;
 for(let i=0;i<20;i++)state=updatePreservation(p,state,false);
 assert.equal(state.healthy,0);
 state=updatePreservation(p,state,true);state=updatePreservation(p,state,true);assert.equal(state.active,true);
 state=updatePreservation(p,state,true);assert.equal(state.active,false);
 const f=capitalFixture();assert.match(reconcileLiquidation(f.ns,call).blocker,/No remaining unprotected/);
 assert.deepEqual(f.corp.divisions,["Agri","Tobacco","Unlisted"]);
});

test("default capital policy transitions to STEADY after sustained live supplies and survives restart",async()=>{
 const f=capitalFixture({funds:20e9});
 // --capital-auto is only a fixture selector; the production default is already automatic.
 await f.run(["--capital-auto","--apply","--products","--ramp-office","--office-care","--manual-supply","--cycles","20"]);
 assert.equal(f.corp.public,true);assert.equal(f.corp.numShares,550e6);
 assert.equal(f.mutations.filter(([type])=>type==="IPO").length,1);
 assert.equal(f.heartbeats.at(-1).stage,"STEADY");
 assert.ok(f.heartbeats.some(h=>h.financeResults.some(r=>r.action==="IPO")));
 await f.run(["--capital-auto","--apply","--products","--manual-supply","--cycles","4"]);
 assert.equal(f.mutations.filter(([type])=>type==="IPO").length,1);
 assert.ok(f.heartbeats.every(h=>!h.blocker),f.logs.join("\n"));
});

test("automatic IPO cannot bypass an unfinished coverage-approved capital package",()=>{
 const f=capitalFixture({funds:20e9});f.unlocked.delete("Export");
 assert.equal(reconcilePublicFinances(f.ns,call,f.plan(),autoFinance,12,true,false),null);
 assert.equal(f.corp.public,false);
});

test("liquidation checks replacement input supply and protects managed divisions even on a sale list",()=>{
 const f=capitalFixture();const constants=f.api.getConstants;
 f.api.getConstants=()=>({...constants(),materialNames:["Plants"]});
 const industry=f.api.getIndustryData;f.api.getIndustryData=n=>({...industry(n),startingCost:4e9});
 const input=f.material("Tobacco","Sector-12","Plants");input.productionAmount=-2;input.stored=20;input.buyAmount=0;
 f.material("Unlisted","Sector-12","Plants").exports=[{division:"Tobacco",city:"Sector-12",amount:"2"}];
 const settings={allow:[{name:"Agri",industry:"Agriculture"},{name:"Unlisted",industry:"Agriculture"}],protect:[]};
 assert.match(reconcileLiquidation(f.ns,call,settings).blocker,/replacement/);
 input.buyAmount=2;const cash=f.corp.funds;
 f.api.sellDivision=d=>{assert.equal(d,"Unlisted");f.corp.divisions=f.corp.divisions.filter(n=>n!==d);f.corp.funds+=2e9;};
 const result=reconcileLiquidation(f.ns,call,settings);assert.equal(result.action,"Sold division");
 assert.equal(f.corp.funds,cash+2e9);assert.ok(f.corp.divisions.includes("Agri"));
 assert.match(reconcileLiquidation(f.ns,call,settings).blocker,/No remaining unprotected/);
});
