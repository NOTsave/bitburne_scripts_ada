/** Read-only full-daemon / Corporation ownership and settled-supply audit. */
export async function main(ns){
 const limit=Number(ns.args[0]??30),path='/Temp/corp-p6-audit.txt';
 if(!Number.isInteger(limit)||limit<1)throw Error('Use a positive settlement count');
 const state=()=>{const ps=ns.ps('home'),h=JSON.parse(ns.read('/Temp/corp-status.txt')||'{}');
  return {timestamp:Date.now(),processes:ps.filter(p=>['daemon.js','autopilot.js','corp-supervisor.js','corp.js','corp-manager.js'].includes(p.filename)||/(^|\/)Corp\/corp-/.test(p.filename)),h};};
 const report={startedAt:Date.now(),limit,polls:0,maxWriters:0,samples:[],summary:null};let last=-1,owner=null;
 while(report.samples.length<limit){
  const s=state();report.polls++;
  const writers=s.processes.filter(p=>(p.filename.split('/').pop()==='corp.js'&&p.args.includes('--apply'))||p.filename.endsWith('corp-manager.js')||/(^|\/)Corp\/corp-/.test(p.filename));
  report.maxWriters=Math.max(report.maxWriters,writers.length);
  if(writers.length>1)throw Error('Multiple Corporation writers detected');
  const h=s.h;
  if(writers.length===1&&h.pid===writers[0].pid&&h.completedPhase==='START'&&h.cycles!==last&&h.lastSettlement?.productInputs){
   if(owner!==null&&owner!==h.pid)throw Error('Manager changed within settled audit');owner=h.pid;last=h.cycles;
   const inputs=[h.lastSettlement.productInputs,...h.lastSettlement.agricultureInputs];
   const buffered=inputs.length>=3&&inputs.every(site=>site.stocks.every(m=>m.before>0&&Number.isFinite(m.after)&&m.after>0));
   report.samples.push({timestamp:h.timestamp,pid:h.pid,cycle:h.cycles,stage:h.stage,funds:h.funds,revenue:h.revenue,expenses:h.expenses,
    shares:h.numShares,totalShares:h.totalShares,dividendRate:h.dividendRate,careSpent:h.careSpent,buffered,blocker:h.blocker,
    controllers:s.processes.filter(p=>p.filename!=='corp.js'),products:h.productStatus?.products});
   await ns.write(path,JSON.stringify(report),'w');
  }
  await ns.sleep(100);
 }
 const first=report.samples[0],lastSample=report.samples.at(-1);
 report.summary={settlements:report.samples.length,firstCycle:first.cycle,lastCycle:lastSample.cycle,consecutive:lastSample.cycle-first.cycle+1===limit,
  managerPid:owner,maxWriters:report.maxWriters,polls:report.polls,allSteady:report.samples.every(s=>s.stage==='STEADY'),
  allBuffered:report.samples.every(s=>s.buffered),blockers:[...new Set(report.samples.map(s=>s.blocker).filter(Boolean))],
  cashChange:lastSample.funds-first.funds,paidCare:Math.max(...report.samples.map(s=>s.careSpent??0)),
  sharesUnchanged:first.shares===lastSample.shares&&first.totalShares===lastSample.totalShares,
  controllerPids:[...new Set(report.samples.flatMap(s=>s.controllers.filter(p=>p.filename==='daemon.js').map(p=>p.pid)))]};
 report.journal=JSON.parse(ns.read('corp-launcher-state.txt')||'{}');
 report.endedAt=Date.now();await ns.write(path,JSON.stringify(report),'w');ns.tprint('[P6 audit] '+JSON.stringify(report.summary));
}
