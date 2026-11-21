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

export function siblingScript(ns, name) {
    const current = canonical(ns.getScriptName());
    return current.slice(0, current.lastIndexOf("/") + 1) + name;
}

export function defaultCorporationSupervisorConfig() {
    return { ...DEFAULTS };
}

export function readCorporationSupervisorConfig(ns, overrides = {}) {
    let config = defaultCorporationSupervisorConfig();
    try {
        const raw = ns.read(CONFIG_FILE);
        if (raw.trim()) config = validateConfig(JSON.parse(raw), config);
    } catch (error) {
        ns.tprint("[corp supervisor] WARNING: " + CONFIG_FILE + ": " + error.message + ". Using defaults.");
    }
    return validateConfig(overrides, config);
}

function validateConfig(saved, defaults) {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
        throw new Error(CONFIG_FILE + " must contain a JSON object");
    }
    const config = { ...defaults, ...saved };
    if (!["auto", "bn3", "self-funded"].includes(config.preset) ||
        !Object.hasOwn(FUNDING_FLAGS, config.funding) || !Object.hasOwn(GROWTH_FLAGS, config.growth) ||
        !["auto", "manual"].includes(config.supply) || !Number.isFinite(config.headroom) || config.headroom < 0) {
        throw new Error("Invalid corporation supervisor configuration");
    }
    return config;
}

export function corporationRamPlan(ns, headroom = DEFAULT_CORP_HEADROOM) {
    const script = siblingScript(ns, SCRIPT);
    const measured = ns.getScriptRam(script, "home");
    return planCorporationRam(script, measured, ns.ps("home"), headroom);
}

export function planCorporationRam(script, measured, processes, headroom) {
    // Every installation manages the same corporation and heartbeat on home.
    const worker = processes.find(process => process.filename.split("/").pop() === SCRIPT);
    const pid = worker?.pid ?? 0;
    const target = measured > 0 ? measured + headroom : 0;
    return { script, workerScript: worker && canonical(worker.filename), measured, pid, running: Boolean(worker?.args.includes("--apply")),
        dryRun: Boolean(worker && !worker.args.includes("--apply")), target, reserved: pid && target ? headroom : target };
}

/** Create one launch controller for the lifetime of its supervisor. */
export function createCorporationSupervisor() {
    const launch = createCorporationLauncher();
    return (ns, config) => launch(ns, config, corporationRamPlan(ns, config.headroom),
        () => ns.getServerMaxRam("home") - ns.getServerUsedRam("home"));
}

export function createCorporationLauncher() {
    let nextAttemptAt = 0;
    return (ns, config, plan, getFreeRam) => {
        if (plan.dryRun) return { ...plan, state: "dry-run" };
        if (plan.running && plan.workerScript !== plan.script) return { ...plan, state: "other-installation" };
        if (plan.running) return { ...plan, state: "running" };
        if (!plan.target) return { ...plan, state: "missing-script" };
        const now = Date.now();
        if (now < nextAttemptAt) return { ...plan, state: "backoff", nextAttemptAt };
        nextAttemptAt = now + RETRY_MS;
        const free = getFreeRam();
        if (free < plan.target) return { ...plan, state: "low-ram", free, nextAttemptAt };
        const args = ["--apply", "--preset", config.preset, "--ramp-office", "--office-care", "--products"];
        if (config.supply === "manual") args.push("--manual-supply");
        if (GROWTH_FLAGS[config.growth]) args.push(GROWTH_FLAGS[config.growth]);
        if (FUNDING_FLAGS[config.funding]) args.push(FUNDING_FLAGS[config.funding]);
        const pid = ns.exec(plan.script, "home", 1, ...args);
        return { ...plan, pid, state: pid ? "launched" : "exec-failed", free, nextAttemptAt };
    };
}

/** Run from the daemon's corporation-only mode or as an argument-free reset callback on home. */
export async function runCorporationSupervisor(ns, overrides = {}) {
    if (ns.getHostname() !== "home") {
        ns.tprint("[corp supervisor] Run on home.");
        return;
    }
    const supervisor = siblingScript(ns, "corp-supervisor.js");
    const existing = ns.ps("home").some(process => process.pid < ns.pid &&
        canonical(process.filename) === supervisor);
    if (existing) {
        ns.tprint("[corp supervisor] Another launcher is already running.");
        return;
    }

    let config;
    try {
        config = readCorporationSupervisorConfig(ns, overrides);
    } catch (error) {
        ns.tprint("[corp supervisor] " + error.message);
        return;
    }
    ns.tprint("[corp supervisor] " + config.preset + " preset, " + config.headroom.toFixed(2) + " GB headroom.");
    const supervise = createCorporationSupervisor();
    let lastState;
    for (;;) {
        const result = supervise(ns, config);
        const message = "[" + result.state + "] " + (result.workerScript ?? result.script) + " " + result.measured.toFixed(2) + " GB, target " +
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
    const flags = ns.flags(corporationOptionSchema);
    await runCorporationSupervisor(ns, corporationOverrides(flags));
}

export const corporationOptionSchema = [
    ["corp-funding", "config"],
    ["corp-headroom", -1],
];

export function corporationOverrides(options) {
    const overrides = {};
    if (options["corp-funding"] !== "config") overrides.funding = options["corp-funding"];
    if (options["corp-headroom"] !== -1) overrides.headroom = options["corp-headroom"];
    return overrides;
}

