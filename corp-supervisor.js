const SCRIPT = "corp.js";
const CONFIG_FILE = "corp-supervisor.config.txt";
export const DEFAULT_CORP_HEADROOM = 32;
const RETRY_MS = 30_000;
const POLL_MS = 2_000;
const DEFAULTS = { preset: "auto", headroom: DEFAULT_CORP_HEADROOM, headroomMode: "fixed", headroomFraction: 0.02, headroomMin: 8, headroomMax: 32, funding: "off", growth: "off", supply: "auto", scaling: false, capital: "auto", launcher: "standalone" };
const FUNDING_FLAGS = { off: null, round1: "--fund-round-1", chain: "--fund-chain", all: "--fund" };
const GROWTH_FLAGS = { off: null, campaign: "--tobacco-growth", ranked: "--upgrades" };

function canonical(filename) {
    return filename.replace(/^\//, "");
}

export function readCorporationSupervisorConfig(ns, overrides = {}) {
    const raw = ns.read(CONFIG_FILE);
    const saved = raw.trim() ? JSON.parse(raw) : {};
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
        throw new Error(CONFIG_FILE + " must contain a JSON object");
    }
    const config = { ...DEFAULTS, ...saved, ...overrides };
    if (!["auto", "bn3", "self-funded"].includes(config.preset) ||
        !Object.hasOwn(FUNDING_FLAGS, config.funding) || !Object.hasOwn(GROWTH_FLAGS, config.growth) ||
        !["auto", "manual"].includes(config.supply) || typeof config.scaling !== "boolean" || !["auto", "off"].includes(config.capital) || !["standalone", "daemon"].includes(config.launcher) || !Number.isFinite(config.headroom) || config.headroom < 0 || !["fixed", "proportional"].includes(config.headroomMode) ||
        !Number.isFinite(config.headroomFraction) || config.headroomFraction < 0 || config.headroomFraction > 1 ||
        !Number.isFinite(config.headroomMin) || config.headroomMin < 0 || !Number.isFinite(config.headroomMax) || config.headroomMax < config.headroomMin) {
        throw new Error("Invalid corporation supervisor configuration");
    }
    return config;
}


export function effectiveCorporationHeadroom(config, totalRam) {
 return config.headroomMode === 'proportional' ? Math.max(config.headroomMin,Math.min(config.headroomMax,totalRam*config.headroomFraction)) : config.headroom;
}
export function createCorporationConfigReader(overrides={}) {
 let previous,valid;
 return ns=>{
  const raw=ns.read(CONFIG_FILE);
  if(raw===previous && valid)return valid;
  previous=raw;
  try{valid=readCorporationSupervisorConfig({read:()=>raw},overrides);}
  catch(error){if(!valid)throw error;ns.print('[corp supervisor] Keeping last valid profile: '+error.message);}
  return valid;
 };
}

export function siblingScript(ns, name) {
 const current=canonical(ns.getScriptName?.()??'corp-supervisor.js');
 return current.slice(0,current.lastIndexOf('/')+1)+name;
}
export function defaultCorporationSupervisorConfig(){return {...DEFAULTS};}
export const corporationOptionSchema=[["corp-funding","config"],["corp-headroom",-1],["corp-launcher","config"]];
export function corporationOverrides(flags){
 const result={};
 if(flags['corp-funding']!==undefined&&flags['corp-funding']!=='config')result.funding=flags['corp-funding'];
 if(flags['corp-headroom']!==undefined&&flags['corp-headroom']!==-1){result.headroom=flags['corp-headroom'];result.headroomMode='fixed';}
 if(flags['corp-launcher']!==undefined&&flags['corp-launcher']!=='config')result.launcher=flags['corp-launcher'];
 return result;
}
export function corporationWriterKind(filename){
 const name=canonical(filename);
 if(name.split('/').pop()==='corp.js')return 'manager';
 if(name.split('/').pop()==='corp-manager.js'||/(^|\/)Corp\/corp-[^/]+\.js$/i.test(name))return 'legacy';
 return null;
}
export function planCorporationRam(script,measured,processes,headroom){
 const observers=processes.filter(p=>corporationWriterKind(p.filename)==='manager'&&!(p.args??[]).includes('--apply'));
 const workers=processes.filter(p=>corporationWriterKind(p.filename)==='manager'&&(p.args??[]).includes('--apply')).sort((a,b)=>a.pid-b.pid);
 const legacy=processes.filter(p=>corporationWriterKind(p.filename)==='legacy');
 const worker=workers[0],pid=worker?.pid??0,target=measured>0?measured+headroom:0;
 return {script:canonical(script),workerScript:worker&&canonical(worker.filename),measured,pid,
  running:Boolean(worker&&(worker.args??[]).includes('--apply')),dryRun:false,observers:observers.map(p=>p.pid),
  writerCount:workers.filter(p=>(p.args??[]).includes('--apply')).length+legacy.length,legacy:legacy.map(p=>p.pid),
  target,reserved:pid&&target?headroom:target};
}
export function corporationRamPlan(ns,headroom=DEFAULT_CORP_HEADROOM){
 const script=siblingScript(ns,SCRIPT);return planCorporationRam(script,ns.getScriptRam(script,'home'),ns.ps('home'),headroom);
}
export function corporationController(processes,node){
 const candidates=processes.filter(p=>{
  const file=canonical(p.filename).split('/').pop(),args=p.args??[];
  return file==='corp-supervisor.js'||(file==='daemon.js'&&!args.includes('--corp-only')&&!args.includes('--no-corp')&&
   !(args.some((a,i)=>a==='--disable-script'&&String(args[i+1]).split('/').pop()==='corp.js'))&&(node===3||args.includes('--corp')));
 });
 return candidates.sort((a,b)=>Number(canonical(a.filename).split('/').pop()!=='daemon.js')-
  Number(canonical(b.filename).split('/').pop()!=='daemon.js')||a.pid-b.pid)[0]??null;
}
export function createCorporationLauncher(){
 let nextAttemptAt=0,trackedPid=0,startedAt=0,failures=0,previousArgs=null,pendingRestart=false;
 const crashDelay=()=>Math.min(300_000,RETRY_MS*2**Math.max(0,failures-1));
 return (ns,config,stale,getFreeRam)=>{
  const processes=ns.ps('home');
  const headroom=effectiveCorporationHeadroom(config,ns.getServerMaxRam?.('home')??0);
  const plan=planCorporationRam(stale.script??SCRIPT,stale.measured,processes,headroom);
  const owner=corporationController(processes,ns.getResetInfo?.().currentNode??0);
  if(owner&&ns.pid&&owner.pid!==ns.pid)return {...plan,state:'delegated',controllerPid:owner.pid};
  if(plan.legacy.length)return {...plan,state:'legacy-controller'};
  if(plan.writerCount>1)return {...plan,state:'multiple-writers'};

  if(plan.running&&plan.workerScript!==plan.script)return {...plan,state:'other-installation'};
  const args=['--apply','--preset',config.preset,'--ramp-office','--office-care','--products'];
  if(config.capital==='off')args.push('--capital-off');
  if(config.scaling)args.push('--scale-production');
  if(config.supply==='manual')args.push('--manual-supply');
  if(GROWTH_FLAGS[config.growth])args.push(GROWTH_FLAGS[config.growth]);
  if(FUNDING_FLAGS[config.funding])args.push(FUNDING_FLAGS[config.funding]);
  const now=Date.now(),signature=JSON.stringify(args);
  if(previousArgs!==null && previousArgs!==signature)pendingRestart=true;
  previousArgs=signature;
  if(plan.running){
   if(pendingRestart){
    if(!ns.kill(plan.pid))return {...plan,state:'restart-failed'};
    pendingRestart=false;trackedPid=0;nextAttemptAt=0;
    return {...plan,state:'reconfiguring'};
   }
   if(trackedPid!==plan.pid){trackedPid=plan.pid;startedAt=now;}
   if(now-startedAt>=120_000)failures=0;
   return {...plan,state:'running',failures};
  }
  if(trackedPid){
   failures=now-startedAt<120_000?failures+1:0;trackedPid=0;
   nextAttemptAt=Math.max(nextAttemptAt,now+(failures?crashDelay():RETRY_MS));
  }
  if(!plan.target)return {...plan,state:'missing-script'};
  if(now<nextAttemptAt)return {...plan,state:'backoff',nextAttemptAt,failures};
  nextAttemptAt=now+RETRY_MS;
  const free=getFreeRam();if(free<plan.target)return {...plan,state:'low-ram',free,nextAttemptAt,failures};
  const pid=ns.exec(plan.script,'home',1,...args);
  if(pid){trackedPid=pid;startedAt=now;pendingRestart=false;}else{failures++;nextAttemptAt=now+crashDelay();}
  return {...plan,pid,state:pid?'launched':'exec-failed',free,nextAttemptAt,failures};
 };
}
export function createCorporationSupervisor(){
 const launch=createCorporationLauncher();return(ns,config)=>launch(ns,config,corporationRamPlan(ns,config.headroom),
  ()=>ns.getServerMaxRam('home')-ns.getServerUsedRam('home'));
}
export function recordCorporationAttachment(ns,plan,reset){
 if(!plan?.pid)return null;
 const workers=ns.ps('home').filter(p=>corporationWriterKind(p.filename)==='legacy'||
  (corporationWriterKind(p.filename)==='manager'&&(p.args??[]).includes('--apply')));
 const parse=raw=>{try{const value=JSON.parse(raw||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}};
 const h=parse(ns.read('/Temp/corp-status.txt'));
 if(workers.length!==1||workers[0].pid!==plan.pid||h.pid!==plan.pid||!Number.isFinite(h.timestamp)||h.timestamp<reset.lastAugReset||h.blocker)return null;
 const path='corp-launcher-state.txt',old=parse(ns.read(path));
 const key=[reset.lastNodeReset,reset.lastAugReset,ns.pid,plan.pid].join(':');if(old.key===key)return old;
 const event=old.lastNodeReset&&old.lastNodeReset!==reset.lastNodeReset?'bitnode-reattachment':
  old.lastAugReset&&old.lastAugReset!==reset.lastAugReset?'augmentation-reattachment':old.key?'controller-reattachment':'initial-attachment';
 const item={timestamp:Date.now(),event,currentNode:reset.currentNode,lastNodeReset:reset.lastNodeReset,lastAugReset:reset.lastAugReset,
  controllerPid:ns.pid,controllerScript:ns.getScriptName(),workerPid:plan.pid,writerCount:workers.length,stage:h.stage};
 const value={...item,key,history:[...(Array.isArray(old.history)?old.history:[]),item].slice(-8)};ns.write(path,JSON.stringify(value),'w');return value;
}
/** Run from the daemon's corporation-only mode or as an argument-free reset callback on home. */
export async function runCorporationSupervisor(ns, overrides = {}) {
    if (ns.getHostname() !== "home") {
        ns.tprint("[corp supervisor] Run on home.");
        return;
    }
    const readConfig=createCorporationConfigReader(overrides);
    let config;
    try {config=readConfig(ns);}catch(error){ns.tprint('[corp supervisor] '+error.message);return;}
    const supervise=createCorporationSupervisor();
    let lastState,nextDaemonAttempt=0;
    for (;;) {
        config=readConfig(ns);
        if(config.launcher==='daemon'){
            const script=siblingScript(ns,'daemon.js');
            const existing=ns.ps('home').find(p=>canonical(p.filename)===script&&!(p.args??[]).includes('--corp-only'));
            if(existing){ns.tprint('[corp callback] Attached to full daemon PID '+existing.pid);return;}
            if(Date.now()>=nextDaemonAttempt){
                nextDaemonAttempt=Date.now()+RETRY_MS;
                const ram=ns.getScriptRam(script,'home');
                if(ram>0&&ns.getServerMaxRam('home')-ns.getServerUsedRam('home')>=ram){
                    const pid=ns.exec(script,'home',1,'--corp','--no-tail-windows');
                    if(pid){ns.tprint('[corp callback] Started full daemon PID '+pid);return;}
                }
            }
            await ns.sleep(POLL_MS);continue;
        }
        const result = supervise(ns, config);
        if(result.state === "delegated"){ns.tprint("[corp supervisor] Delegated to launcher PID "+result.controllerPid);return;}
        recordCorporationAttachment(ns,result,ns.getResetInfo());
        const message = "[" + result.state + "] corp.js " + result.measured.toFixed(2) + " GB, target " +
            result.target.toFixed(2) + " GB" + (result.pid ? ", PID " + result.pid : "") +
            (result.free === undefined ? "" : ", free " + result.free.toFixed(2) + " GB");
        if (message !== lastState) {
            if (result.state === "backoff") ns.print("[corp supervisor] " + message);
            else ns.tprint("[corp supervisor] " + message);
            lastState = message;
        }
        await ns.sleep(POLL_MS);
    }
}

/** @param {NS} ns */
export async function main(ns) {
    const flags=ns.flags(corporationOptionSchema);
    await runCorporationSupervisor(ns,corporationOverrides(flags));
}

