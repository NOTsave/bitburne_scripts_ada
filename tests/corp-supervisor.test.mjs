import test from "node:test";
import assert from "node:assert/strict";
import {readCorporationSupervisorConfig,createCorporationSupervisor,createCorporationConfigReader,effectiveCorporationHeadroom} from "../corp-supervisor.js";
import {main as cleanup} from "../cleanup.js";
test("scaling profile is explicit, validated, and preserves funding and supply modes",()=>{
 const ns={read:()=>JSON.stringify({scaling:true,funding:"chain",supply:"manual",growth:"campaign"})};
 const c=readCorporationSupervisorConfig(ns);assert.equal(c.scaling,true);assert.equal(c.headroom,32);
 let args;const run={getScriptRam:()=>950,ps:()=>[],getServerMaxRam:()=>2048,getServerUsedRam:()=>0,write:()=>{},exec:(...a)=>{args=a;return 123;}};
 assert.equal(createCorporationSupervisor()(run,c).state,"launched");
 for(const a of ["--scale-production","--fund-chain","--manual-supply","--office-care"])assert.ok(args.includes(a));
 for(const a of ["--ipo","--equity","--fund"])assert.ok(!args.includes(a));
 assert.throws(()=>readCorporationSupervisorConfig({read:()=>'{"scaling":"yes"}'}),/Invalid/);
});
test("a low-RAM P4 launch backs off even after RAM is restored and detects an external manager",()=>{
 const c=readCorporationSupervisorConfig({read:()=>'{"scaling":true}'});let free=10,pid=0,execs=0;
 const ns={getScriptRam:()=>950,ps:()=>pid?[{filename:"corp.js",pid,args:["--apply"]}]:[],getServerMaxRam:()=>2048,getServerUsedRam:()=>2048-free,read:()=>"",exec:()=>{execs++;return 7;}};
 const supervise=createCorporationSupervisor();assert.equal(supervise(ns,c).state,"low-ram");
 free=2048;assert.equal(supervise(ns,c).state,"backoff");assert.equal(execs,0);
 pid=20;assert.equal(supervise(ns,c).state,"external-worker");assert.equal(execs,0);
});

test("supervisor enables automatic capital by default and supports an explicit maintenance hold",()=>{
 const c=readCorporationSupervisorConfig({read:()=>""});assert.equal(c.capital,"auto");
 let launched;const ns={getScriptRam:()=>900,ps:()=>[],getServerMaxRam:()=>2048,getServerUsedRam:()=>0,write:()=>{},exec:(...args)=>{launched=args;return 1;}};
 createCorporationSupervisor()(ns,c);assert.ok(!launched.includes("--capital-off"));
 createCorporationSupervisor()(ns,{...c,capital:"off"});assert.ok(launched.includes("--capital-off"));
 assert.throws(()=>readCorporationSupervisorConfig({read:()=>'{"capital":"yes"}'}),/Invalid/);
});


test('profile reload retains last valid settings, reapplies overrides, and recovers after repair',()=>{
 let raw='{"funding":"off"}',errors=0;const ns={read:()=>raw,print:()=>errors++};
 const read=createCorporationConfigReader({supply:'manual'});
 assert.equal(read(ns).funding,'off');raw='{"funding":"chain","supply":"auto"}';
 const valid=read(ns);assert.equal(valid.funding,'chain');assert.equal(valid.supply,'manual');
 raw='{';assert.equal(read(ns),valid);assert.equal(read(ns),valid);assert.equal(errors,1);
 raw='{"headroom":64}';assert.equal(read(ns).headroom,64);
 assert.throws(()=>createCorporationConfigReader()({read:()=>'{'}));
});

function workerFixture(processes = []) {
 const kills=[], files=new Map();
 let nextPid=20, otherRam=0, installedRam=900;
 const ns={getScriptRam:()=>installedRam,ps:()=>processes,getServerMaxRam:()=>1024,
  getServerUsedRam:()=>otherRam+processes.reduce((sum,process)=>sum+process.ramUsage*process.threads,0),
  getRunningScript:pid=>processes.find(process=>process.pid===pid)??null,
  read:path=>files.get(path)??'',write:(path,value)=>files.set(path,value),
  ls:(_host,filter)=>[...files.keys()].filter(path=>path.includes(filter)),rm:path=>files.delete(path),print:()=>{},
  kill:pid=>{kills.push(pid);processes.splice(0,1);return true;},
  exec:(filename,host,threads,...args)=>{
   const pid=nextPid++;processes.push({filename,pid,args,threads,ramUsage:installedRam});return pid;
  }};
 return {ns,kills,files,processes,setOtherRam:ram=>{otherRam=ram;},setInstalledRam:ram=>{installedRam=ram;}};
}

test('ownership survives cleanup and a new controller only restarts for strategy changes',async()=>{
 const {ns,kills,processes,files}=workerFixture(),c=readCorporationSupervisorConfig({read:()=>''});
 assert.equal(createCorporationSupervisor()(ns,c).state,'launched');
 files.set('/Temp/test-output.txt','temporary');
 await cleanup(ns);
 assert.equal(files.has('/Temp/test-output.txt'),false);
 const supervise=createCorporationSupervisor();
 assert.equal(supervise(ns,{...c,headroom:64}).state,'running');
 const next={...c,funding:'chain'};
 assert.equal(supervise(ns,next).state,'launched');
 assert.ok(processes[0].args.includes('--fund-chain'));
 assert.equal(supervise(ns,next).state,'running');
 assert.deepEqual(kills,[20]);
});

test('manual workers survive strategy reload until takeover is explicitly enabled',()=>{
 const manual={filename:'corp.js',pid:10,args:['--apply'],ramUsage:900,threads:1};
 const {ns,kills,processes}=workerFixture([manual]);
 const supervise=createCorporationSupervisor();
 const c=readCorporationSupervisorConfig({read:()=>''});
 const next={...c,funding:'chain'};
 assert.equal(supervise(ns,c).state,'external-worker');
 assert.equal(supervise(ns,next).state,'external-worker');
 assert.deepEqual(processes,[manual]);
 assert.deepEqual(kills,[]);
 assert.throws(()=>readCorporationSupervisorConfig({read:()=> '{"takeover":"true"}'}),/Invalid/);
 const takeover={...next,takeover:true};
 assert.equal(supervise(ns,takeover).state,'launched');
 assert.equal(supervise(ns,next).state,'running');
 assert.deepEqual(kills,[10]);
});

test('strategy reload and takeover wait for a runnable replacement before stopping the current worker',()=>{
 const c=readCorporationSupervisorConfig({read:()=>''});
 for(const takeover of [false,true]){
  const manual={filename:'corp.js',pid:10,args:['--apply'],ramUsage:450,threads:2};
  const fixture=workerFixture(takeover?[manual]:[]), {ns,kills,processes}=fixture;
  const supervise=createCorporationSupervisor();
  if(!takeover)assert.equal(supervise(ns,c).state,'launched');
  const originalPid=processes[0].pid;
  const next={...c,funding:'chain',takeover};
  fixture.setInstalledRam(0);
  assert.equal(supervise(ns,next).state,'restart-deferred');
  fixture.setInstalledRam(920);
  fixture.setOtherRam(80);
  const deferred=supervise(ns,next);
  assert.equal(deferred.state,'restart-deferred');
  assert.equal(deferred.target,952);
  assert.equal(processes[0].pid,originalPid);
  assert.deepEqual(kills,[]);
  fixture.setOtherRam(72);
  assert.equal(supervise(ns,next).state,'launched');
  assert.equal(processes.length,1);
  assert.ok(processes[0].args.includes('--fund-chain'));
  assert.deepEqual(kills,[originalPid]);
 }
});

test('missing, corrupt, or mismatched ownership never grants restart authority',()=>{
 const c=readCorporationSupervisorConfig({read:()=>''});
 for(const reason of ['missing','corrupt','different token','different args']){
  const {ns,kills,files,processes}=workerFixture();
  assert.equal(createCorporationSupervisor()(ns,c).state,'launched');
  const [path]=files.keys(), args=processes[0].args;
  if(reason==='missing')files.delete(path);
  if(reason==='corrupt')files.set(path,'{');
  if(reason==='different token')args[args.length-1]='--corp-worker-token=old';
  if(reason==='different args')args[2]='bn3';
  const result=createCorporationSupervisor()(ns,{...c,funding:'chain'});
  assert.equal(result.state,'external-worker',reason);
  assert.deepEqual(kills,[]);
 }
});

test('short-lived workers back off 30/60/120/240/300 seconds and reset after healthy uptime',()=>{
 const real=Date.now;let now=1e6,ps=[],pid=1,ownership='';Date.now=()=>now;
 try{
  const ns={getScriptRam:()=>900,ps:()=>ps,getServerMaxRam:()=>4096,getServerUsedRam:()=>0,
   read:()=>ownership,write:(_path,value)=>{ownership=value;},
   exec:(file,h,t,...args)=>{ps=[{filename:file,pid:pid++,args}];return ps[0].pid;}};
  const supervise=createCorporationSupervisor(),c=readCorporationSupervisorConfig({read:()=>''});
  assert.equal(supervise(ns,c).state,'launched');
  for(const delay of [30000,60000,120000,240000,300000]){
   now+=1000;ps=[];const hold=supervise(ns,c);assert.equal(hold.state,'backoff');assert.equal(hold.nextAttemptAt-now,delay);
   now=hold.nextAttemptAt-1;assert.equal(supervise(ns,c).state,'backoff');now++;
   assert.equal(supervise(ns,c).state,'launched');
  }
  now+=120000;assert.equal(supervise(ns,c).failures,0);ps=[];now++;
  const hold=supervise(ns,c);assert.equal(hold.nextAttemptAt-now,30000);
 }finally{Date.now=real;}
});

test('failed exec retries also escalate without affecting low-RAM cooldown',()=>{
 const real=Date.now;let now=1e6;Date.now=()=>now;
 try{
  const ns={getScriptRam:()=>900,ps:()=>[],getServerMaxRam:()=>4096,getServerUsedRam:()=>0,exec:()=>0};
  const supervise=createCorporationSupervisor(),c=readCorporationSupervisorConfig({read:()=>''});
  for(const delay of [30000,60000,120000,240000,300000]){
   const r=supervise(ns,c);assert.equal(r.state,'exec-failed');assert.equal(r.nextAttemptAt-now,delay);now=r.nextAttemptAt;
  }
 }finally{Date.now=real;}
});

test('proportional headroom is opt-in and respects lower and upper limits',()=>{
 const c=readCorporationSupervisorConfig({read:()=>'{"headroomMode":"proportional","headroomFraction":0.02,"headroomMin":8,"headroomMax":32}'});
 assert.equal(effectiveCorporationHeadroom(c,256),8);assert.equal(effectiveCorporationHeadroom(c,1024),20.48);
 assert.equal(effectiveCorporationHeadroom(c,4096),32);
 assert.equal(effectiveCorporationHeadroom({...c,headroomMode:'fixed',headroom:64},256),64);
 assert.throws(()=>readCorporationSupervisorConfig({read:()=>'{"headroomMax":1}'}),/Invalid/);
});
