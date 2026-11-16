const SCRIPT = "corp.js";
const CONFIG_FILE = "corp-supervisor.config.txt";
export const DEFAULT_CORP_HEADROOM = 32;
const RETRY_MS = 30_000;
const POLL_MS = 2_000;
const DEFAULTS = { preset: "auto", headroom: DEFAULT_CORP_HEADROOM, funding: "off", growth: "off", supply: "auto" };
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
        !["auto", "manual"].includes(config.supply) || !Number.isFinite(config.headroom) || config.headroom < 0) {
        throw new Error("Invalid corporation supervisor configuration");
    }
    return config;
}

export function corporationRamPlan(ns, headroom = DEFAULT_CORP_HEADROOM) {
    const measured = ns.getScriptRam(SCRIPT, "home");
    const pid = ns.ps("home").find(process => canonical(process.filename) === SCRIPT)?.pid ?? 0;
    const target = measured > 0 ? measured + headroom : 0;
    return { measured, pid, running: pid !== 0, target, reserved: pid && target ? headroom : target };
}

/** Create one launch controller for the lifetime of its supervisor. */
export function createCorporationSupervisor() {
    let nextAttemptAt = 0;
    return (ns, config) => {
        const plan = corporationRamPlan(ns, config.headroom);
        if (plan.running) return { ...plan, state: "running" };
        if (!plan.target) return { ...plan, state: "missing-script" };
        const now = Date.now();
        if (now < nextAttemptAt) return { ...plan, state: "backoff", nextAttemptAt };
        nextAttemptAt = now + RETRY_MS;
        const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
        if (free < plan.target) return { ...plan, state: "low-ram", free, nextAttemptAt };
        const args = ["--apply", "--preset", config.preset, "--ramp-office", "--office-care", "--products"];
        if (config.supply === "manual") args.push("--manual-supply");
        if (GROWTH_FLAGS[config.growth]) args.push(GROWTH_FLAGS[config.growth]);
        if (FUNDING_FLAGS[config.funding]) args.push(FUNDING_FLAGS[config.funding]);
        const pid = ns.exec(SCRIPT, "home", 1, ...args);
        return { ...plan, pid, state: pid ? "launched" : "exec-failed", free, nextAttemptAt };
    };
}

/** Run from the daemon's corporation-only mode or as an argument-free reset callback on home. */
export async function runCorporationSupervisor(ns) {
    if (ns.getHostname() !== "home") {
        ns.tprint("[corp supervisor] Run on home.");
        return;
    }
    const existing = ns.ps("home").some(process => process.pid < ns.pid &&
        (canonical(process.filename) === "corp-supervisor.js" ||
            (canonical(process.filename) === "daemon.js" && process.args.includes("--corp-only"))));
    if (existing) {
        ns.tprint("[corp supervisor] Another launcher is already running.");
        return;
    }

    let config;
    try {
        config = readCorporationSupervisorConfig(ns);
    } catch (error) {
        ns.tprint("[corp supervisor] " + error.message);
        return;
    }
    ns.tprint("[corp supervisor] " + config.preset + " preset, " + config.headroom.toFixed(2) + " GB headroom.");
    const supervise = createCorporationSupervisor();
    let lastState;
    for (;;) {
        const result = supervise(ns, config);
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
    await runCorporationSupervisor(ns);
}

