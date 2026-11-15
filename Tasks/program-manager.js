/** @param {NS} ns */
export async function main(ns) {
    const navigator = "DarkscapeNavigator.exe";
    const navigatorPrice = 50e6; // Bitburner 3.0.1 dark web price.
    const programNames = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];
    // The reserve file is local to home, so only consider the Navigator there.
    if (ns.getHostname() === "home" && !ns.args.includes("--skip-darkscape")) programNames.push(navigator);
    const keepRunning = ns.args.includes("-c");

    if (!keepRunning)
        ns.print('program-manager will run once. Run with argument "-c" to run continuously.');

    do {
        if (ns.hasTorRouter()) {
            for (const prog of programNames) {
                if (ns.fileExists(prog, "home")) continue;
                if (prog === navigator) {
                    const reserve = Math.max(0, Number(ns.read("reserve.txt") || 0));
                    if (!(ns.getServerMoneyAvailable("home") - reserve >= navigatorPrice)) continue;
                }
                if (ns.singularity.purchaseProgram(prog)) ns.toast(`Purchased ${prog}`, "success");
            }
        }
        if (!keepRunning || programNames.every(prog => ns.fileExists(prog, "home"))) return;
        await ns.sleep(2_000);
    } while (true);
}