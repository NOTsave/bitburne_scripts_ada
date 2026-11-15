/** @param {NS} ns */
export async function main(ns) {
    const keepRunning = ns.args.includes("-c");
    if (ns.hasTorRouter()) return ns.print("Player already has Tor");
    if (!keepRunning)
        ns.print('tor-manager will run once. Run with argument "-c" to run continuously.');

    do {
        if (ns.singularity.purchaseTor() || ns.hasTorRouter()) {
            ns.toast("Purchased the Tor router!", "success");
            return;
        }
        if (keepRunning) await ns.sleep(2_000);
    } while (keepRunning);
}