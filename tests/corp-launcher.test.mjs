import test from 'node:test';
import assert from 'node:assert/strict';
import { createCorporationLauncher,planCorporationRam,corporationController,readCorporationSupervisorConfig,recordCorporationAttachment,corporationOverrides,runCorporationSupervisor,publishCorporationDaemonReady } from '../corp-supervisor.js';
import {serverSnapshotCommand,corporationBudget,corporationEligible,corporationReady,createCorporationResetReader,shouldRunRamManager} from '../daemon.js';
import {corporationDaemonArgs} from '../autopilot.js';
import {formatTime} from '../helpers.js';
import {main as corporationMain} from '../corp.js';
const config=()=>readCorporationSupervisorConfig({read:()=>'{"scaling":true,"capital":"auto","preset":"auto"}'});
const worker={filename:'corp.js',pid:10,args:['--apply']};

test('full daemon and standalone elect one launcher even with a stale empty-worker plan',()=>{
 const processes=[{filename:'corp-supervisor.js',pid:2,args:[]},{filename:'daemon.js',pid:3,args:['--corp']}];let launched=0;
 const files=new Map();
 const ns={pid:3,ps:()=>processes,read:path=>files.get(path)??'',write:(path,value)=>files.set(path,value),
  exec:(file,host,threads,...args)=>{processes.push({filename:file,pid:10,args});launched++;return 10;}};
 const stale=planCorporationRam('corp.js',900,[],32),a=createCorporationLauncher(),b=createCorporationLauncher();
 assert.equal(corporationController(processes).pid,2);
 publishCorporationDaemonReady(ns,true);
 assert.equal(a({...ns,pid:2},config(),stale,()=>4096).state,'delegated');
 assert.equal(a(ns,config(),stale,()=>4096).state,'launched');
 assert.equal(b(ns,config(),stale,()=>4096).state,'running');assert.equal(launched,1);
 assert.equal(corporationController(processes,3).pid,3);
});

test('takeover leaves other installations and legacy Corporation writers alone',()=>{
 for(const [process,state]of [[{filename:'other/corp.js',pid:8,args:['--apply']},'other-installation'],[{filename:'Corp/corp-hr.js',pid:8,args:[]},'legacy-controller']]){
  let launched=0,killed=0;const ns={ps:()=>[process],exec:()=>launched++,kill:()=>killed++};
  assert.equal(createCorporationLauncher()(ns,{...config(),takeover:true},planCorporationRam('corp.js',900,[],32),()=>4096).state,state);
  assert.equal(launched,0);assert.equal(killed,0);
 }
});

test('full daemon RAM planning adopts the existing PID and reserves measured RAM after its exit',()=>{
 let ps=[worker];const ns={ps:()=>ps};const c=config();
 let value=corporationBudget(ns,null,c,'corp.js',900,64,true,()=>4096);assert.equal(value.reserved,96);assert.equal(value.pid,10);
 ps=[];value=corporationBudget(ns,null,c,'corp.js',950,64,true,()=>4096);assert.equal(value.reserved,1046);
 assert.equal(shouldRunRamManager(true,false,982,512),true);assert.equal(shouldRunRamManager(false,false,982,512),false);
 assert.equal(corporationEligible({corp:false,'no-corp':false,'disable-script':[]},3,{},'corp.js'),true);
});

test('3.0.1 bulk metrics accept normal, cloud and non-hackable server snapshots without legacy getters',()=>{
 const servers={n00dles:{requiredHackingSkill:1,numOpenPortsRequired:0,serverGrowth:10,minDifficulty:1,moneyMax:1e6,maxRam:4},
  cloud:{requiredHackingSkill:1,numOpenPortsRequired:0,serverGrowth:0,minDifficulty:1,moneyMax:0,maxRam:64},hacknet:{maxRam:128}};
 const ns={args:Object.keys(servers),getServer:host=>servers[host]};
 for(const metric of ['getServerRequiredHackingLevel','getServerNumPortsRequired','getServerGrowth','getServerMinSecurityLevel','getServerMaxMoney','getServerMaxRam','getServer']){
  const values=Function('ns','return '+serverSnapshotCommand(metric))(ns);
  assert.equal(values.hacknet,metric==='getServer'?servers.hacknet:metric==='getServerMaxRam'?128:['getServerRequiredHackingLevel','getServerNumPortsRequired'].includes(metric)?Number.MAX_SAFE_INTEGER:0);
 }
});

const STOP = new Error('end of supervisor test');

function supervisorFixture(profile, daemons = []) {
 const processes=[{filename:'corp-supervisor.js',pid:1,args:[]},...daemons];
 const files=new Map([['corp-supervisor.config.txt',profile]]);
 const logs=[], launches=[];
 const ns={pid:1,getHostname:()=> 'home',read:path=>files.get(path)??'',getScriptName:()=> 'corp-supervisor.js',
  getScriptRam:()=> 100,getServerMaxRam:()=> 2048,getServerUsedRam:()=> 0,
  getResetInfo:()=>({currentNode:3,lastNodeReset:1,lastAugReset:1}),
  ps:()=>processes,tprint:line=>logs.push(line),print:line=>logs.push(line),write:(path,value)=>files.set(path,value),
  exec(file,host,threads,...args){launches.push(file);processes.push({filename:file,pid:10,args});return 10;},
  sleep:async()=>{throw STOP;}};
 return {ns,processes,files,logs,launches};
}

test('standalone startup waits for a valid profile and retains explicit overrides',async()=>{
 const {ns,files,logs,launches,processes}=supervisorFixture('{');
 let polls=0;
 ns.sleep=async()=>{
  if(++polls===1){
   assert.deepEqual(launches,[]);
   files.set('corp-supervisor.config.txt','{"capital":"off"}');
  }else throw STOP;
 };
 await assert.rejects(runCorporationSupervisor(ns,{funding:'chain'}),error=>error===STOP);
 assert.match(logs[0],/Waiting for profile repair/);
 assert.deepEqual(launches,['corp.js']);
 assert.ok(processes.at(-1).args.includes('--capital-off'));
 assert.ok(processes.at(-1).args.includes('--fund-chain'));
});

test('daemon-mode callback supervises without replacing a disabled or unready daemon',async()=>{
 for(const args of [['--no-corp'],['--disable-script','corp.js'],[]]){
  const {ns,launches,processes}=supervisorFixture('{"launcher":"daemon"}',[{filename:'daemon.js',pid:2,args}]);
  if(args.length)publishCorporationDaemonReady({...ns,pid:2},true);
  await assert.rejects(runCorporationSupervisor(ns),error=>error===STOP);
  assert.deepEqual(launches,['corp.js']);
  assert.equal(processes[1].pid,2);
 }
 assert.deepEqual(corporationOverrides({'corp-funding':'chain','corp-headroom':32,'corp-launcher':'daemon'}),{funding:'chain',headroom:32,headroomMode:'fixed',launcher:'daemon'});
});

test('supervisor waits through handoff and resumes without duplicating a live worker',async t=>{
 let now=100_000,polls=0;
 t.mock.method(Date,'now',()=>now);
 const {ns,launches,logs,processes}=supervisorFixture('{}',[{filename:'daemon.js',pid:2,args:[]}]);
 ns.sleep=async()=>{
  if(++polls===1){
   assert.deepEqual(launches,['corp.js']);
   publishCorporationDaemonReady({...ns,pid:2},true);
  }else if(polls===2){
   assert.match(logs.at(-1),/Standing by for launcher PID 2/);
   now+=30_000;
  }else if(polls===3){
   assert.match(logs.at(-1),/\[running\]/);
   processes.pop();
   now+=30_000;
  }else if(polls===4){
   assert.deepEqual(launches,['corp.js']);
   assert.match(logs.at(-1),/\[backoff\]/);
   now+=30_000;
  }else throw STOP;
 };
 await assert.rejects(runCorporationSupervisor(ns),error=>error===STOP);
 assert.deepEqual(launches,['corp.js','corp.js']);
});

test('reset info retries after low RAM and uses actual BN3 identity and start time',async t=>{
 let now=1_000_000,attempts=0;
 t.mock.method(Date,'now',()=>now);
 const actual={currentNode:3,lastNodeReset:500_000,lastAugReset:999_999};
 const readReset=createCorporationResetReader(async()=>{
  if(++attempts===1)throw new Error('low RAM');
  if(attempts===2)return {currentNode:3};
  return actual;
 });
 assert.equal(await readReset(),undefined);
 assert.equal(await readReset(),undefined);
 assert.equal(attempts,1);
 now+=30_000;
 assert.equal(await readReset(),undefined);
 now+=30_000;
 assert.equal(await readReset(),actual);
 assert.equal(corporationEligible({corp:false,'disable-script':[]},actual.currentNode,{},'corp.js'),true);
 assert.equal(corporationReady(false,32,actual.lastNodeReset),false);
 now=1_100_000;
 assert.equal(corporationReady(false,32,actual.lastNodeReset),true);
 assert.equal(await readReset(),actual);
 assert.equal(attempts,3);
});

test('Autopilot preserves enable and opt-out arguments without mutating existing looping-mode flags',()=>{
 const original=['--looping-mode','--corp'];const off=corporationDaemonArgs(original,{'no-corp':true});
 assert.deepEqual(original,['--looping-mode','--corp']);assert.ok(off.includes('--no-corp'));assert.ok(!off.includes('--corp'));
 const on=corporationDaemonArgs(off,{corp:true});assert.ok(on.includes('--corp'));assert.ok(!on.includes('--no-corp'));
});

test('attachment journal distinguishes a natural augmentation reset and rejects stale or duplicate heartbeat owners',()=>{
 let file='',h={pid:10,timestamp:200,stage:'STEADY',blocker:null},processes=[worker];
 const ns={pid:2,getScriptName:()=> 'daemon.js',ps:()=>processes,read:path=>path==='corp-launcher-state.txt'?file:JSON.stringify(h),write:(_p,text)=>file=text};
 let value=recordCorporationAttachment(ns,{pid:10},{currentNode:3,lastNodeReset:1,lastAugReset:100});assert.equal(value.event,'initial-attachment');
 value=recordCorporationAttachment(ns,{pid:10},{currentNode:3,lastNodeReset:1,lastAugReset:150});assert.equal(value.event,'augmentation-reattachment');
 assert.equal(value.writerCount,1);assert.equal(value.history.length,2);
 assert.equal(recordCorporationAttachment(ns,{pid:10},{currentNode:3,lastNodeReset:1,lastAugReset:300}),null);
 processes.push({...worker,pid:11,filename:'other/corp.js'});assert.equal(recordCorporationAttachment(ns,{pid:10},{currentNode:3,lastNodeReset:1,lastAugReset:150}),null);
});

test('manager refuses a lower-PID alias or a legacy writer before registering purchase cleanup',async()=>{
 for(const other of [{filename:'other/corp.js',pid:1,args:['--apply']},{filename:'Corp/corp-research.js',pid:3,args:[]}]){
  let cleaned=false;const logs=[];const ns={pid:2,args:['--apply'],getHostname:()=> 'home',getScriptName:()=> 'corp.js',
   ps:()=>[other,{filename:'corp.js',pid:2,args:['--apply']}],print:s=>logs.push(s),atExit:()=>{cleaned=true;},corporation:new Proxy({},{get(){throw Error('Second writer reached Corporation API');}})};
  await corporationMain(ns);assert.equal(cleaned,false);assert.ok(logs.length>0);
 }
});

test('v3 helper time formatting calls the format namespace',()=>{
 const ns={getPlayer:()=>({}),ui:{getGameInfo:()=>({versionNumber:44})},format:{time:(ms,precision)=>[ms,precision]}};
 assert.deepEqual(formatTime(ns,1000,true),[1000,true]);
});

test('a corrupt attachment journal cannot prevent the elected launcher from recording live ownership',()=>{
 let file='broken';const ns={pid:2,getScriptName:()=> 'daemon.js',ps:()=>[worker],
  read:p=>p==='corp-launcher-state.txt'?file:JSON.stringify({pid:10,timestamp:200,stage:'STEADY'}),write:(_p,value)=>file=value};
 assert.equal(recordCorporationAttachment(ns,{pid:10},{currentNode:3,lastAugReset:100,lastNodeReset:1}).writerCount,1);
});


test('an earlier observer does not block launch or adoption and reserves full worker RAM',()=>{
 const observer={filename:'corp.js',pid:1,args:[]},ps=[observer];let execs=0,ownership='';
 const ns={ps:()=>ps,read:()=>ownership,write:(_path,value)=>{ownership=value;},
  exec:(file,host,threads,...args)=>{execs++;ps.push({filename:file,pid:5,args});return 5;}};
 const stale=planCorporationRam('corp.js',900,ps,32);
 assert.equal(stale.pid,0);assert.equal(stale.reserved,932);assert.deepEqual(stale.observers,[1]);
 const launch=createCorporationLauncher();assert.equal(launch(ns,config(),stale,()=>1000).state,'launched');
 const adopted=launch(ns,config(),stale,()=>1000);assert.equal(adopted.pid,5);assert.equal(adopted.state,'running');assert.equal(execs,1);
});

test('observer and writer use separate heartbeats while active writer ignores lower observer PID',async()=>{
 for(const apply of [false,true]){
  const paths=[],args=apply?['--apply','--capital-off']:[];
  const ns={pid:2,args,getHostname:()=> 'home',getScriptName:()=> 'corp.js',ps:()=>[{filename:'corp.js',pid:1,args:apply?[]:['--apply']}],
   getResetInfo:()=>({currentNode:3}),getBitNodeMultipliers:()=>({CorporationValuation:1}),
   corporation:{hasCorporation:()=>false,canCreateCorporation:()=> 'NoSf3OrDisabled'},atExit:()=>{},
   print:()=>{},tprint:()=>{},write:(path)=>paths.push(path),sleep:async()=>{throw Error('STOP');}};
  await assert.rejects(corporationMain(ns),/STOP/);
  assert.deepEqual(paths,[apply?'/Temp/corp-status.txt':'/Temp/corp-observer-2.txt']);
 }
});
