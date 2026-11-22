/** Read-only native-game cash and office audit. */
export async function main(ns) {
    const limit=Number(ns.args[0]??100);
    if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Use 1-1000 observations');
    const read=()=>{
        const c=ns.corporation.getCorporation();
        const text=ns.read('/Temp/corp-status.txt');const h=text?JSON.parse(text):{};
        return {time:Date.now(),funds:c.funds,revenue:c.revenue,expenses:c.expenses,pid:h.pid,
            careSpent:h.careSpent,teaOrders:h.teasBought,cycle:h.cycles,
            shares:c.numShares,round:h.round,blocker:h.blocker,
            offices:c.divisions.filter(d=>['Agri','Tobacco'].includes(d)).flatMap(d=>
                ns.corporation.getDivision(d).cities.map(city=>{const o=ns.corporation.getOffice(d,city);return {
                    division:d,city,energy:o.avgEnergy,morale:o.avgMorale,employees:o.numEmployees,
                    interns:o.employeeJobs.Intern,research:o.employeeJobs['Research & Development']};}))};
    };
    const report={start:read(),samples:[]};
    while(report.samples.length<limit){
        const completed=await ns.corporation.nextUpdate();
        if(completed!=='START')continue;
        await ns.sleep(30);
        const sample=read();
        sample.delta=sample.funds-(report.samples.at(-1)?.funds??report.start.funds);
        report.samples.push(sample);
        if(report.samples.length%10===0)await ns.write('/Temp/corp-upkeep-audit.txt',JSON.stringify(report),'w');
    }
    report.end=read();
    report.summary={observations:limit,cashChange:report.end.funds-report.start.funds,
        upkeepChange:report.end.careSpent-report.start.careSpent,
        negativeIntervals:report.samples.slice(1).filter(s=>s.delta<0).length,
        minDelta:Math.min(...report.samples.slice(1).map(s=>s.delta)),
        healthyOffices:report.end.offices.every(o=>o.interns>=1&&o.research>=1),
        sameController:report.samples.every(s=>s.pid===report.start.pid),
        blockers:report.samples.filter(s=>s.blocker).length};
    await ns.write('/Temp/corp-upkeep-audit.txt',JSON.stringify(report),'w');
    ns.tprint('UPKEEP-AUDIT '+JSON.stringify(report.summary));
}
