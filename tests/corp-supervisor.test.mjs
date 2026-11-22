import test from "node:test";
import assert from "node:assert/strict";
import {readCorporationSupervisorConfig,createCorporationSupervisor,createCorporationConfigReader,effectiveCorporationHeadroom} from "../corp-supervisor.js";
test("scaling profile is explicit, validated, and preserves funding and supply modes",()=>{
 const ns={read:()=>JSON.stringify({scaling:true,funding:"chain",supply:"manual",growth:"campaign"})};
 const c=readCorporationSupervisorConfig(ns);assert.equal(c.scaling,true);assert.equal(c.headroom,32);
 let args;const run={getScriptRam:()=>950,ps:()=>[],getServerMaxRam:()=>2048,getServerUsedRam:()=>0,exec:(...a)=>{args=a;return 123;}};
 assert.equal(createCorporationSupervisor()(run,c).state,"launched");
 for(const a of ["--scale-production","--fund-chain","--manual-supply","--office-care"])assert.ok(args.includes(a));
 for(const a of ["--ipo","--equity","--fund"])assert.ok(!args.includes(a));
 assert.throws(()=>readCorporationSupervisorConfig({read:()=>'{"scaling":"yes"}'}),/Invalid/);
});
test("a low-RAM P4 launch backs off even after RAM is restored and adopts an existing manager",()=>{
 const c=readCorporationSupervisorConfig({read:()=>'{"scaling":true}'});let free=10,pid=0,execs=0;
 const ns={getScriptRam:()=>950,ps:()=>pid?[{filename:"corp.js",pid,args:["--apply"]}]:[],getServerMaxRam:()=>2048,getServerUsedRam:()=>2048-free,exec:()=>{execs++;return 7;}};
 const supervise=createCorporationSupervisor();assert.equal(supervise(ns,c).state,"low-ram");
 free=2048;assert.equal(supervise(ns,c).state,"backoff");assert.equal(execs,0);
 pid=20;assert.equal(supervise(ns,c).state,"running");assert.equal(execs,0);
});

test("supervisor enables automatic capital by default and supports an explicit maintenance hold",()=>{
 const c=readCorporationSupervisorConfig({read:()=>""});assert.equal(c.capital,"auto");
 let launched;const ns={getScriptRam:()=>900,ps:()=>[],getServerMaxRam:()=>2048,getServerUsedRam:()=>0,exec:(...args)=>{launched=args;return 1;}};
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

test('valid strategy reload restarts the same-install worker once, while headroom reload adopts it',()=>{
 let ps=[{filename:'corp.js',pid:10,args:['--apply']}],kills=0,execs=0;
 const ns={getScriptRam:()=>900,ps:()=>ps,getServerMaxRam:()=>4096,getServerUsedRam:()=>0,
  kill:pid=>{assert.equal(pid,10);kills++;ps=[];return true;},exec:(file,h,t,...args)=>{execs++;ps=[{filename:file,pid:11,args}];return 11;}};
 const supervise=createCorporationSupervisor(),c=readCorporationSupervisorConfig({read:()=>''});
 assert.equal(supervise(ns,c).state,'running');assert.equal(supervise(ns,{...c,headroom:64}).state,'running');
 assert.equal(supervise(ns,{...c,funding:'chain'}).state,'reconfiguring');assert.equal(kills,1);
 assert.equal(supervise(ns,{...c,funding:'chain'}).state,'launched');
 assert.equal(supervise(ns,{...c,funding:'chain'}).state,'running');assert.equal(execs,1);
});

test('short-lived workers back off 30/60/120/240/300 seconds and reset after healthy uptime',()=>{
 const real=Date.now;let now=1e6,ps=[],pid=1;Date.now=()=>now;
 try{
  const ns={getScriptRam:()=>900,ps:()=>ps,getServerMaxRam:()=>4096,getServerUsedRam:()=>0,
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
