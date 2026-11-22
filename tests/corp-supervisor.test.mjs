import test from "node:test";
import assert from "node:assert/strict";
import {readCorporationSupervisorConfig,createCorporationSupervisor} from "../corp-supervisor.js";
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
