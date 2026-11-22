import { reconcilePublicFinances, maintainEmergencySales, reconcileLiquidation, reconcileManagedPurchases, equityIssueSize, updatePreservation } from '/corp.js';
/** Controlled live emergency-mode check. Does not spend down treasury or sell divisions. */
export async function main(ns) {
 const call=(_name,run)=>run(),api=ns.corporation,path='/Temp/corp-p5-emergency.txt';
 if(ns.ps('home').some(p=>['corp.js','corp-supervisor.js'].includes(p.filename)))throw Error('Stop the existing Corporation controllers first');
 const report={before:api.getCorporation(),ipoHeartbeat:JSON.parse(ns.read('/Temp/corp-status.txt')||'{}'),checks:[],settlements:[],error:null};
 let cleanupDone=false;
 ns.atExit(()=>{if(!cleanupDone)reconcileManagedPurchases(ns,call);});
 const plan=()=>{const c=api.getCorporation();return {...c,stage:'PRESERVE',reserve:5e9,operatingRate:c.revenue-c.expenses};};
 try {
  if(!report.before.public)throw Error('IPO must complete before the emergency drill');
  // Set a small payout, then exercise the real emergency dividend cut synchronously.
  api.issueDividends(0.01);
  report.cut=reconcilePublicFinances(ns,call,plan(),{automatic:true,equity:true,dividendRate:0,supplyStreak:0},0,false,true);
  if(report.cut?.rate!==0||api.getCorporation().dividendRate!==0)throw Error('Dividend cut did not verify');
  report.checks.push('Live 1% to 0% emergency dividend cut');
  if(api.hasUnlock('Smart Supply'))api.setSmartSupply('Agri','Sector-12',true);
  api.buyMaterial('Agri','Sector-12','Hardware',0.000001);
  maintainEmergencySales(ns,call,plan());
  if(api.getWarehouse('Agri','Sector-12').smartSupplyEnabled||api.getMaterial('Agri','Sector-12','Hardware').buyAmount!==0)throw Error('Emergency purchase clamp failed');
  report.checks.push('Live Smart Supply disabled and discretionary buy cleared');
  report.liquidation=reconcileLiquidation(ns,call);
  let recovery={active:true,healthy:0},seen=0;
  while(seen<3){
   const p=plan();maintainEmergencySales(ns,call,p);
   if(p.nextState==='PURCHASE')report.liquidation=reconcileLiquidation(ns,call);
   const phase=await api.nextUpdate();
   if(phase==='START'){
    seen++;const c=api.getCorporation();
    recovery=updatePreservation({...c,reserve:5e9,operatingRate:c.revenue-c.expenses},recovery,true);
    report.settlements.push({funds:c.funds,revenue:c.revenue,expenses:c.expenses,dividendRate:c.dividendRate,recovery:{...recovery}});
   }
   await ns.sleep(20);
  }
  if(recovery.active)throw Error('Three-settlement preservation recovery failed');
  report.checks.push('Three live settlements of essential-only inputs with earning orders retained','Recovery after three healthy settled STARTs');
  if(!report.liquidation?.blocker?.includes('No remaining unprotected'))throw Error('Liquidation guard did not report the empty sale list');
  report.checks.push('Liquidation held with no unprotected eligible divisions');
  const c=api.getCorporation();report.equitySize=equityIssueSize(c,5.5e9);
  if(report.equitySize!==0)throw Error('Unexpected equity request with ample cash');
  report.checks.push('Optional issuance held on actual healthy treasury');
  report.after=c;
  if(c.numShares!==report.before.numShares||c.totalShares!==report.before.totalShares||c.dividendRate!==0)throw Error('Emergency drill changed ownership or final dividend rate');
 }catch(e){report.error=String(e);ns.tprint('[P5 emergency error] '+report.error);}
 finally{
  reconcileManagedPurchases(ns,call);cleanupDone=true;
  await ns.write(path,JSON.stringify(report),'w');
  report.supervisorPid=ns.exec('corp-supervisor.js','home',1);
  await ns.write(path,JSON.stringify(report),'w');
  ns.tprint('[P5 emergency] '+JSON.stringify({checks:report.checks,error:report.error,cut:report.cut,liquidation:report.liquidation,equitySize:report.equitySize,supervisorPid:report.supervisorPid}));
 }
}
