const SCRIPT = "corp.js";
const CONFIG_FILE = "corp-supervisor.config.txt";
const WORKER_OWNER_FILE = "/corp-worker-owner.txt";
const DAEMON_READY_FILE = "/Temp/corp-daemon-ready.txt";
const DAEMON_READY_TTL = 30_000;
export const DEFAULT_CORP_HEADROOM = 32;
const RETRY_MS = 30_000;
const POLL_MS = 2_000;
const DEFAULTS = { preset: "auto", headroom: DEFAULT_CORP_HEADROOM, headroomMode: "fixed", headroomFraction: 0.02, headroomMin: 8, headroomMax: 32, funding: "off", growth: "off", supply: "auto", scaling: false, capital: "auto", launcher: "standalone", takeover: false };
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
        !Number.isFinite(config.headroomMin) || config.headroomMin < 0 || !Number.isFinite(config.headroomMax) || config.headroomMax < config.headroomMin ||
        typeof config.takeover !== "boolean") {
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
export function corporationController(processes, readyDaemonPid){
 const candidates=processes.filter(p=>{
  const path=canonical(p.filename),file=path.split('/').pop();
  if(file==='corp-supervisor.js')return true;
  if(file!=='daemon.js'||p.pid!==readyDaemonPid)return false;
  const args=p.args??[];
  const corpScript=path.slice(0,path.lastIndexOf('/')+1)+SCRIPT;
  return !args.includes('--corp-only')&&!args.includes('--no-corp')&&
   !args.some((arg,index)=>arg==='--disable-script'&&canonical(String(args[index+1]))===corpScript);
 });
 return candidates.sort((a,b)=>Number(canonical(a.filename).split('/').pop()!=='daemon.js')-
  Number(canonical(b.filename).split('/').pop()!=='daemon.js')||a.pid-b.pid)[0]??null;
}

function daemonReadiness(ns, now) {
    const raw = ns.read?.(DAEMON_READY_FILE);
    if (!raw) return null;
    try {
        const claim = JSON.parse(raw);
        if (Number.isSafeInteger(claim?.pid) && claim.pid > 0 && Number.isFinite(claim.at) &&
            claim.at <= now && now - claim.at < DAEMON_READY_TTL) return claim;
    } catch {
        // A missing or unreadable claim grants no authority.
    }
    return null;
}

export function publishCorporationDaemonReady(ns, ready) {
    const now = Date.now();
    const claim = daemonReadiness(ns, now);
    if (!ready) {
        if (claim?.pid === ns.pid) ns.write(DAEMON_READY_FILE, "", "w");
        return;
    }
    if (claim?.pid === ns.pid && now - claim.at < DAEMON_READY_TTL / 3) return;
    if (claim && claim.pid !== ns.pid &&
        corporationController(ns.ps("home"), claim.pid)?.pid === claim.pid) return;
    ns.write(DAEMON_READY_FILE, JSON.stringify({ pid: ns.pid, at: now }), "w");
}
function managedWorkerLaunch(ns, plan, processes) {
    const raw = ns.read(WORKER_OWNER_FILE);
    if (!raw) return null;
    let launch;
    try { launch = JSON.parse(raw); }
    catch { return null; }
    if (launch?.pid !== plan.pid || launch.script !== plan.script ||
        !Array.isArray(launch.args) || typeof launch.token !== "string" || !launch.token.startsWith("--corp-worker-token=")) return null;
    const worker = processes.find(process => process.pid === plan.pid);
    return JSON.stringify(worker?.args) === JSON.stringify([...launch.args, launch.token]) ? launch : null;
}

export function createCorporationLauncher(){
 let nextAttemptAt=0,trackedPid=0,startedAt=0,failures=0;
 const crashDelay=()=>Math.min(300_000,RETRY_MS*2**Math.max(0,failures-1));
 return (ns,config,stale,getFreeRam)=>{
  const processes=ns.ps('home');
  const headroom=effectiveCorporationHeadroom(config,ns.getServerMaxRam?.('home')??0);
  let plan=planCorporationRam(stale.script??SCRIPT,stale.measured,processes,headroom);
  const owner=corporationController(processes,daemonReadiness(ns,Date.now())?.pid);
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
  const now=Date.now();
  if(plan.running){
   const launch=managedWorkerLaunch(ns,plan,processes);
   if(!launch && config.takeover!==true){
    trackedPid=0;
    return {...plan,state:'external-worker'};
   }
   if(launch && JSON.stringify(launch.args)===JSON.stringify(args)){
    if(trackedPid!==plan.pid){trackedPid=plan.pid;startedAt=now;}
    if(now-startedAt>=120_000)failures=0;
    return {...plan,state:'running',failures};
   }
   const replacementRam=ns.getScriptRam(plan.script,'home');
   plan=planCorporationRam(plan.script,replacementRam,processes,headroom);
   const worker=ns.getRunningScript(plan.pid);
   const free=getFreeRam();
   if(!plan.target || !worker || free+worker.ramUsage*worker.threads<plan.target){
    return {...plan,state:'restart-deferred',free};
   }
   if(!ns.kill(plan.pid))return {...plan,state:'restart-failed'};
   plan=planCorporationRam(plan.script,replacementRam,processes.filter(process=>process.pid!==plan.pid),headroom);
   trackedPid=0;nextAttemptAt=0;
  }
  if(trackedPid){
   failures=now-startedAt<120_000?failures+1:0;trackedPid=0;
   nextAttemptAt=Math.max(nextAttemptAt,now+(failures?crashDelay():RETRY_MS));
  }
  if(!plan.target)return {...plan,state:'missing-script'};
  if(now<nextAttemptAt)return {...plan,state:'backoff',nextAttemptAt,failures};
  nextAttemptAt=now+RETRY_MS;
  const free=getFreeRam();if(free<plan.target)return {...plan,state:'low-ram',free,nextAttemptAt,failures};
  const token='--corp-worker-token='+now+'-'+Math.random().toString(36).slice(2);
  const pid=ns.exec(plan.script,'home',1,...args,token);
  if(pid){
   ns.write(WORKER_OWNER_FILE,JSON.stringify({pid,script:plan.script,args,token}),'w');
   trackedPid=pid;startedAt=now;
  }else{failures++;nextAttemptAt=now+crashDelay();}
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
    const supervise=createCorporationSupervisor();
    let lastState, profileError, nextDaemonAttempt=0;
    for (;;) {
        let config;
        try {
            config = readConfig(ns);
            profileError = undefined;
        } catch (error) {
            if (profileError !== error.message) ns.tprint("[corp supervisor] Waiting for profile repair: " + error.message);
            profileError = error.message;
            await ns.sleep(POLL_MS);
            continue;
        }
        if(config.launcher==='daemon' && Date.now()>=nextDaemonAttempt){
            const script=siblingScript(ns,'daemon.js');
            const processes=ns.ps('home');
            const existing=processes.some(p=>canonical(p.filename)===script&&!(p.args??[]).includes('--corp-only'));
            const daemonPid=daemonReadiness(ns,Date.now())?.pid;
            if(!existing && (!daemonPid || corporationController(processes,daemonPid)?.pid!==daemonPid)){
                nextDaemonAttempt=Date.now()+RETRY_MS;
                const ram=ns.getScriptRam(script,'home');
                if(ram>0&&ns.getServerMaxRam('home')-ns.getServerUsedRam('home')>=ram){
                    const pid=ns.exec(script,'home',1,'--corp','--no-tail-windows');
                    if(pid)ns.tprint('[corp callback] Started full daemon PID '+pid);
                }
            }
        }
        const result = supervise(ns, config);
        if(result.state !== "delegated")recordCorporationAttachment(ns,result,ns.getResetInfo());
        const message = result.state === "delegated" ? "Standing by for launcher PID " + result.controllerPid :
            "[" + result.state + "] corp.js " + result.measured.toFixed(2) + " GB, target " +
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

