export const WORKER_VERSION = 12;
export const HOME = "home";
export const WORKER = "darknet/worker.js";
export const COLLECTOR = "darknet/collect.js";
export const STASIS = "darknet/stasis.js";
export const MIGRATION = "darknet/migrate.js";
export const LAB = "darknet/lab.js";
export const BUNDLE = ["darknet/protocol.js", "darknet/solvers.js", WORKER, COLLECTOR, STASIS, MIGRATION, LAB];
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