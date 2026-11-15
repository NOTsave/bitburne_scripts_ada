export const HOME = "home";
export const WORKER = "darknet/worker.js";
export const COLLECTOR = "darknet/collect.js";
export const BUNDLE = ["darknet/protocol.js", "darknet/solvers.js", WORKER, COLLECTOR];
export const REPORT_INTERVAL = 5_000;
export const SIGHTING_TTL = 3 * REPORT_INTERVAL;
export const JOB_TTL = 120_000;
export const RETRY_DELAY = 30_000;

export function sendReport(ns, port, report) {
    return ns.tryWritePort(port, {
        ...report,
        host: ns.getHostname(),
        pid: ns.pid,
        at: Date.now(),
    });
}