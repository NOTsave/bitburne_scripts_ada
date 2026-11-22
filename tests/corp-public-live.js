/** Read-only P4 audit. Does not change Corporation state. */
export async function main(ns) {
 const limit=Number(ns.args[0]??30),path='/Temp/corp-p5-audit.txt';
 if(!Number.isInteger(limit)||limit<1)throw Error('Use a positive settlement count');
 function snapshot(){const c=ns.corporation.getCorporation();return {timestamp:Date.now(),funds:c.funds,revenue:c.revenue,expenses:c.expenses,numShares:c.numShares,totalShares:c.totalShares,public:c.public,dividendRate:c.dividendRate,round:c.public?null:ns.corporation.getInvestmentOffer().round,sites:c.divisions.flatMap(d=>{const div=ns.corporation.getDivision(d);return div.cities.map(city=>{const o=ns.corporation.getOffice(d,city),w=ns.corporation.getWarehouse(d,city);return {division:d,city,employees:o.numEmployees,size:o.size,energy:o.avgEnergy,morale:o.avgMorale,jobs:o.employeeJobs,fill:w.sizeUsed/w.size,products:div.products.map(n=>{const p=ns.corporation.getProduct(d,city,n);return {name:n,progress:p.developmentProgress,produced:p.productionAmount,sold:p.actualSellAmount,stored:p.stored};})};});})};}
 const report={start:snapshot(),limit,samples:[],summary:null};let last=-1,pid=null;
 while(report.samples.length<limit){
  const h=JSON.parse(ns.read('/Temp/corp-status.txt')||'{}');
  if(h.timestamp>Date.now()-20000&&h.completedPhase==='START'&&h.cycles!==last&&h.lastSettlement?.productInputs){
   if(pid!==null&&h.pid!==pid){report.summary={error:'Controller changed during audit'};break;}
   pid=h.pid;last=h.cycles;const s=h.lastSettlement;
   const products=h.productStatus?.products??[];
   const inputs=[s.productInputs,...(s.agricultureInputs??[])];
   const buffered=inputs.length>=3&&inputs.every(site=>site.stocks.length&&site.stocks.every(m=>Number.isFinite(m.after)&&m.before>0&&m.after>0));
   report.samples.push({timestamp:h.timestamp,cycle:h.cycles,stage:h.stage,public:h.public,dividendRate:h.dividendRate,capitalPolicy:h.capitalPolicy,supplyStreak:h.supplyStreak,funds:s.funds,delta:s.fundsChange,revenue:s.revenue,expenses:s.expenses,careSpent:h.careSpent,teasBought:h.teasBought,buffered,inputs,products,researchBanks:h.researchBanks,scalingStatus:h.scalingStatus,blocker:h.blocker});
   await ns.write(path,JSON.stringify(report),'w');
  }
  await ns.sleep(100);
 }
 report.end=snapshot();report.summary??={settlements:report.samples.length,firstCycle:report.samples[0]?.cycle,lastCycle:report.samples.at(-1)?.cycle,maximumConsecutiveBufferedCycles:Math.max(...report.samples.map(s=>s.supplyStreak??0)),cashChange:report.end.funds-report.start.funds,bufferedSettlements:report.samples.filter(s=>s.buffered).length,allLiveProductsProducing:report.samples.every(s=>s.products.filter(p=>p.progress>=100).length>=2&&s.products.filter(p=>p.progress>=100).every(p=>p.produced>0)),maxCareSpent:Math.max(...report.samples.map(s=>s.careSpent??0)),maxTeas:Math.max(...report.samples.map(s=>s.teasBought??0)),blockers:[...new Set(report.samples.map(s=>s.blocker).filter(Boolean))],holdingsUnchanged:report.end.numShares===report.start.numShares&&report.end.totalShares===report.start.totalShares,roundUnchanged:report.end.round===report.start.round,steadySettlements:report.samples.filter(s=>s.stage==='STEADY'&&s.public).length,allDividendsZero:report.samples.every(s=>s.dividendRate===0),consecutive:report.samples.at(-1)?.cycle-report.samples[0]?.cycle+1===report.samples.length,endingMaximumWarehouseFill:Math.max(...report.end.sites.map(s=>s.fill))};
 await ns.write(path,JSON.stringify(report),'w');ns.tprint('[P5 audit] '+JSON.stringify(report.summary));
}
