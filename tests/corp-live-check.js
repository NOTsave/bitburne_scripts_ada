/** Temporary live-save verification. Run only after installing the reviewed corp.js. */
import { deployRound3Package } from "/corp.js";
import { reconcileWarehousePressure } from "/Temp/corp-pressure-build.js";

export async function main(ns) {
    const mode=String(ns.args[0]??"snapshot");
    const call=(_name,run)=>run();
    const inputs=["Water","Chemicals","Plants","Hardware","Robots","AI Cores","Real Estate"];
    const read=()=>{
        const c=ns.corporation.getCorporation();
        const sites=c.divisions.filter(n=>["Agri","Tobacco"].includes(n)).flatMap(d=>
            ns.corporation.getDivision(d).cities.filter(city=>ns.corporation.hasWarehouse(d,city)).map(city=>({
                division:d,city,warehouse:ns.corporation.getWarehouse(d,city),
                office:ns.corporation.getOffice(d,city),
                materials:[...inputs,"Food"].map(name=>{const m=ns.corporation.getMaterial(d,city,name);return {
                    name,buy:m.buyAmount,stored:m.stored,sell:m.desiredSellAmount,price:m.desiredSellPrice,
                    sold:m.actualSellAmount,produced:m.productionAmount,exports:m.exports};}),
            })));
        return {time:Date.now(),corp:c,ram:ns.getScriptRam("corp.js"),sites};
    };
    const waitFor=async(predicate,limit=20000)=>{
        const deadline=Date.now()+limit;
        while(!predicate()){if(Date.now()>deadline)throw Error("Live check timed out");await ns.sleep(20);}
    };
    const require=(ok,why)=>{if(!ok)throw Error(why);};
    const report={mode,before:read(),checks:[]};
    if(mode==="shutdown-restart") {
        require(!ns.ps("home").some(p=>p.filename==="corp-supervisor.js"),"Pause the supervisor before this bounded test");
        let owner=ns.ps("home").find(p=>p.filename==="corp.js");
        if(!owner){const pid=ns.exec("corp.js","home",1,"--apply","--manual-supply");require(pid>0,"Manager launch failed");owner={pid};}
        await waitFor(()=>ns.corporation.getCorporation().nextState==="PURCHASE");
        await ns.sleep(100);
        // Write a strategy-owned rate outside the manager, then stop before another purchase update.
        ns.corporation.buyMaterial("Agri","Sector-12","Hardware",0.001);
        if(ns.corporation.hasUnlock("Smart Supply"))ns.corporation.setSmartSupply("Agri","Sector-12",true);
        report.atStop=read();
        require(ns.kill(owner.pid),"Could not stop the manager");
        await ns.sleep(100);
        report.afterStop=read();
        for(const site of report.afterStop.sites){
            require(!site.warehouse.smartSupplyEnabled,"Smart Supply survived shutdown");
            require(site.materials.every(m=>m.buy===0),"A purchase rate survived shutdown");
            const before=report.atStop.sites.find(s=>s.division===site.division&&s.city===site.city);
            for(const m of site.materials){const old=before.materials.find(b=>b.name===m.name);
                require(m.sell===old.sell&&m.price===old.price&&JSON.stringify(m.exports)===JSON.stringify(old.exports),"Earning orders changed on shutdown");}
        }
        report.checks.push("live purchase cleanup", "Smart Supply disabled", "earning orders preserved");
        ns.corporation.buyMaterial("Agri","Sector-12","Hardware",0.002);
        const pid=ns.exec("corp.js","home",1,"--apply","--manual-supply","--cycles",3);
        require(pid>0,"Restart failed");report.restartPid=pid;
        await ns.sleep(250);
        require(ns.corporation.getMaterial("Agri","Sector-12","Hardware").buyAmount===0,"Restart left the stale boost rate active");
        report.checks.push("startup stale-order recovery");
        await waitFor(()=>!ns.isRunning(pid),50000);
        report.settlement=JSON.parse(ns.read("/Temp/corp-status.txt"));
        require(report.settlement.lastSettlement?.number>=3,"Restart did not settle three observations");
        require(!report.settlement.blocker,"Restart has a blocker: "+report.settlement.blocker);
        report.checks.push("three settled restart observations");
    } else if(mode==="supervised-restart") {
        const controllers=ns.ps("home");
        require(controllers.filter(p=>p.filename==="corp-supervisor.js").length===1,"Expected one supervisor");
        const owner=controllers.find(p=>p.filename==="corp.js");require(owner,"No supervised manager");
        report.oldPid=owner.pid;
        require(ns.kill(owner.pid),"Could not stop supervised manager");
        let replacement;
        await waitFor(()=>{replacement=ns.ps("home").find(p=>p.filename==="corp.js"&&p.pid!==owner.pid);return Boolean(replacement);},45000);
        report.restartPid=replacement.pid;
        require(ns.ps("home").filter(p=>p.filename==="corp.js").length===1,"Duplicate managers after relaunch");
        await waitFor(()=>{
            const text=ns.read("/Temp/corp-status.txt");if(!text)return false;
            const h=JSON.parse(text);return h.pid===replacement.pid&&h.lastSettlement?.number>=3;
        },50000);
        report.settlement=JSON.parse(ns.read("/Temp/corp-status.txt"));
        require(!report.settlement.blocker,"Supervised restart has a blocker");
        require(ns.corporation.getCorporation().numShares===report.before.corp.numShares,"Unexpected share transfer during restart test");
        report.checks.push("supervisor relaunched the manager", "exactly one Corporation writer", "three supervised settled observations", "CEO holdings preserved");
    } else if(mode==="pressure") {
        require(!ns.ps("home").some(p=>["corp.js","corp-supervisor.js"].includes(p.filename)),"Stop controllers before the one-step pressure check");
        const preparePid=ns.exec("corp.js","home",1,"--apply","--manual-supply","--cycles",4);
        require(preparePid>0,"Pressure preparation failed to launch");
        await waitFor(()=>!ns.isRunning(preparePid),60000);
        await waitFor(()=>ns.corporation.getCorporation().nextState==="START");
        const c=ns.corporation.getCorporation();
        report.atUpgrade=read();
        report.result=reconcileWarehousePressure(ns,call,{nextState:c.nextState},true);
        require(report.result.some(r=>r.upgraded),"Temporary pressure threshold did not produce a funded upgrade");
        report.checks.push("real warehouse upgrade through shared pressure handler");
    } else if(mode==="package-hold") {
        const c=ns.corporation.getCorporation();
        require(ns.corporation.getInvestmentOffer().round<4,"This hold test expects a pre-Round-3 corporation");
        require(deployRound3Package(ns,call,{secondsPerMarketCycle:10})===null,"Package deployed before Round 3");
        require(ns.corporation.getCorporation().funds===c.funds,"Package hold spent funds");
        report.checks.push("Round 3 package correctly held on Round 1 save");
    }
    report.after=read();
    ns.write("/Temp/corp-live-"+mode+".txt",JSON.stringify(report),"w");
    ns.tprint("LIVE-CHECK "+JSON.stringify({mode,checks:report.checks,funds:report.after.corp.funds,
        revenue:report.after.corp.revenue,expenses:report.after.corp.expenses,ram:report.after.ram,result:report.result,
        settlement:report.settlement?.lastSettlement,sites:report.after.sites}));
}
