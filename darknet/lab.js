import { REPORT_INTERVAL, sendReport } from "./protocol.js";

const DIRECTIONS = [
    ["north", 0, -2, "south"], ["east", 2, 0, "west"],
    ["south", 0, 2, "north"], ["west", -2, 0, "east"],
];

function nextMove(position, visited, blocked, trail) {
    const [x, y] = position.coords;
    for (const [direction, dx, dy, reverse] of DIRECTIONS) {
        const destination = [x + dx, y + dy];
        if (position[direction] && !visited.has(destination.join(",")) &&
            !blocked.has(`${x},${y}/${direction}`)) {
            return { direction, reverse, destination, backtrack: false };
        }
    }
    const previous = trail.at(-1);
    if (previous && position[previous.reverse]) {
        return { direction: previous.reverse, destination: previous.origin, backtrack: true };
    }
    return null;
}

/** @param {NS} ns */
export async function main(ns) {
    const [reportPort, jobPort, offlineEpoch, id, target] = ns.args;
    if (!Number.isSafeInteger(reportPort) || reportPort < 1 ||
        !Number.isSafeInteger(jobPort) || jobPort < 1 || jobPort === reportPort ||
        !Number.isSafeInteger(offlineEpoch) || typeof id !== "string" || !id ||
        typeof target !== "string" || !target) {
        ns.tprint("darknet/lab.js needs an assigned Labyrinth job. Start darknet-manager.js on home or let Daemon start it.");
        return;
    }
    const assignments = ns.getPortHandle(jobPort);
    const visited = new Set();
    const blocked = new Set();
    const trail = [];
    let position;
    let radar;
    let steps = 0;
    let solved = false;
    const report = (status, done = false) => sendReport(ns, reportPort, {
        type: "lab", offlineEpoch, id, target, status, done, solved,
        coords: position?.coords, visited: visited.size, steps, radar,
    });
    const active = () => {
        const plan = assignments.peek();
        return plan?.offlineEpoch === offlineEpoch && Date.now() - plan.at < 2 * REPORT_INTERVAL &&
            plan.jobs.some(job => job.id === id && job.kind === "lab" && job.expires > Date.now());
    };

    let outcome = "Lab job ended";
    try {
        if (!active()) return;
        report("Starting Labyrinth navigation");
        position = await ns.dnet.labreport();
        if (position.success) {
            const view = await ns.dnet.labradar();
            if (view.success) radar = view.message;
        }
        let stalled = 0;
        while (active()) {
            if (!position.success) {
                outcome = position.message;
                break;
            }
            const origin = position.coords;
            visited.add(origin.join(","));
            report("Navigating Labyrinth");
            const movement = nextMove(position, visited, blocked, trail);
            if (!movement) {
                outcome = "No unexplored passage remains";
                break;
            }

            const result = await ns.dnet.authenticate(target, `go ${movement.direction}`);
            if (result.success) {
                solved = true;
                outcome = result.message;
                if (result.message.startsWith("You have successfully navigated")) {
                    steps++;
                    position = { coords: movement.destination };
                }
                break;
            }

            if (/charisma|charming/i.test(result.message)) {
                outcome = result.message;
                break;
            }
            position = await ns.dnet.labreport();
            if (!position.success) {
                outcome = position.message;
                break;
            }
            if (position.coords.join(",") === movement.destination.join(",")) {
                if (movement.backtrack) trail.pop();
                else trail.push({ origin, reverse: movement.reverse });
                steps++;
                stalled = 0;
            } else if (/^You cannot go that way/.test(result.message) && !movement.backtrack) {
                blocked.add(`${origin.join(",")}/${movement.direction}`);
            } else if (++stalled >= 3) {
                outcome = result.message;
                break;
            }
        }
    } catch (error) {
        outcome = String(error);
    }

    for (let reportRetry = 0; reportRetry < 5; reportRetry++) {
        if (report(outcome, true)) return;
        await ns.sleep(1_000);
    }
    ns.print(outcome);
}