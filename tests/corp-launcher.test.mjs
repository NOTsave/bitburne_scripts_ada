import test from 'node:test';
import assert from 'node:assert/strict';
import { createCorporationLauncher,planCorporationRam,corporationController,readCorporationSupervisorConfig,recordCorporationAttachment,corporationOverrides,runCorporationSupervisor } from '../corp-supervisor.js';
import {serverSnapshotCommand,corporationBudget,corporationEligible,shouldRunRamManager} from '../daemon.js';
import {corporationDaemonArgs} from '../autopilot.js';
import {formatTime} from '../helpers.js';
import {main as corporationMain} from '../corp.js';
const config=()=>readCorporationSupervisorConfig({read:()=>'{"scaling":true,"capital":"auto","preset":"auto"}'});
const worker={filename:'corp.js',pid:10,args:['--apply']};

test('full daemon and standalone elect one launcher even with a stale empty-worker plan',()=>{
 const processes=[{filename:'corp-supervisor.js',pid:2,args:[]},{filename:'daemon.js',pid:3,args:['--corp']}];let launched=0;
 const ns={pid:3,ps:()=>processes,getResetInfo:()=>({currentNode:3}),exec:(file,host,threads,...args)=>{processes.push({filename:file,pid:10,args});launched++;return 10;}};
 const stale=planCorporationRam('corp.js',900,[],32),a=createCorporationLauncher(),b=createCorporationLauncher();
 assert.equal(a({...ns,pid:2},config(),stale,()=>4096).state,'delegated');
 assert.equal(a(ns,config(),stale,()=>4096).state,'launched');
 assert.equal(b(ns,config(),stale,()=>4096).state,'running');assert.equal(launched,1);
 assert.equal(corporationController(processes,3).pid,3);
});

test('observer, other-installation and legacy Corporation processes block a second writer',()=>{
 for(const [process,state]of [[{filename:'corp.js',pid:8,args:[]},'dry-run'],[{filename:'other/corp.js',pid:8,args:['--apply']},'other-installation'],[{filename:'Corp/corp-hr.js',pid:8,args:[]},'legacy-controller']]){
  let launched=0;const ns={ps:()=>[process],exec:()=>launched++};
  assert.equal(createCorporationLauncher()(ns,config(),planCorporationRam('corp.js',900,[],32),()=>4096).state,state);assert.equal(launched,0);
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

test('argument-free callback attaches to the full daemon and never launches another manager',async()=>{
 let execs=0;const ns={getHostname:()=> 'home',read:()=>'{"launcher":"daemon"}',getScriptName:()=> 'corp-supervisor.js',
  ps:()=>[{filename:'daemon.js',pid:2,args:['--corp']},worker],tprint:()=>{},exec:()=>execs++};
 await runCorporationSupervisor(ns);assert.equal(execs,0);
 assert.deepEqual(corporationOverrides({'corp-funding':'chain','corp-headroom':32,'corp-launcher':'daemon'}),{funding:'chain',headroom:32,launcher:'daemon'});
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
