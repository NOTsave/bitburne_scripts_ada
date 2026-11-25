import test from "node:test";
import assert from "node:assert/strict";
import { EURO_ZONE_COUNTRIES, TOP_PASS_WORDS } from "../darknet/password-lists.js";
import { puzzleAnswer, puzzleCandidates } from "../darknet/solvers.js";
import { deploy } from "../darknet/worker.js";

const puzzle = (modelId, passwordFormat, passwordLength, data = "") =>
    ({ modelId, passwordFormat, passwordLength, data });

test("the two Bitburner dictionaries retain their exact sizes and filter by the clue format", () => {
    assert.equal(new Set(EURO_ZONE_COUNTRIES).size, 27);
    assert.equal(new Set(TOP_PASS_WORDS).size, 93);
    const countries = puzzleCandidates(puzzle("EuroZone Free", "ASCII", 14));
    assert.deepEqual(countries, ["Czech Republic"]);
    const numbers = puzzleCandidates(puzzle("TopPass", "numeric", 6));
    assert.ok(numbers.includes("123456"));
    assert.ok(numbers.length > 1);
    assert.ok(numbers.every(value => /^\d{6}$/.test(value)));
    assert.ok(puzzleCandidates(puzzle("TopPass", "alphabetic", 6)).includes("qwerty"));
    assert.deepEqual(puzzleCandidates(puzzle("Unknown model", "numeric", 6)), []);
});

test("PrimeTime extracts the largest factor from generated-size numeric clues", () => {
    assert.equal(puzzleAnswer(puzzle("PrimeTime 2", "numeric", 4, String(1471 * 2 * 13 * 29))), "1471");
    assert.equal(puzzleAnswer(puzzle("PrimeTime 2", "numeric", 4, String(9859 * 97 ** 6))), "9859");
    assert.equal(puzzleAnswer(puzzle("PrimeTime 2", "numeric", 4, "9007199254740993")), undefined);
    assert.equal(puzzleAnswer(puzzle("PrimeTime 2", "numeric", 4, "1")), undefined);
});

test("OrdoXenos preserves ciphertext bytes and rejects malformed masks or format mismatches", () => {
    const answer = "aB9";
    const masks = [30, 1, 5];
    const ciphertext = masks.map((mask, index) => String.fromCharCode(answer.charCodeAt(index) ^ mask)).join("");
    const data = [ciphertext, masks.map(mask => mask.toString(2).padStart(8, "0")).join(" ")].join(";");

    assert.equal(puzzleAnswer(puzzle("OrdoXenos", "alphanumeric", 3, data)), answer);
    assert.equal(puzzleAnswer(puzzle("OrdoXenos", "alphabetic", 3, data)), undefined);
    assert.equal(puzzleAnswer(puzzle("OrdoXenos", "alphanumeric", 3, ciphertext + ";00011110 00000001")), undefined);
    assert.equal(puzzleAnswer(puzzle("OrdoXenos", "alphanumeric", 3, data + ";extra")), undefined);
});


const accountPuzzle = (length, difficulty) => ({
    ...puzzle("AccountsManager_4.2", "numeric", length),
    passwordHint: "The password is a number between 0 and " + 10 ** length,
    difficulty,
});

test("AccountsManager candidates include only the game's advertised digits and possible values", () => {
    assert.deepEqual(puzzleCandidates(accountPuzzle(1)), ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    assert.deepEqual(puzzleCandidates(accountPuzzle(2, 1)), ["10", "11", "12", "13"]);
    assert.deepEqual(puzzleCandidates(accountPuzzle(3, 30)),
        ["100", "101", "102", "103", "104", "105", "106", "107", "108", "109"]);
    assert.deepEqual(puzzleCandidates(accountPuzzle(3, 4)), []);
    assert.deepEqual(puzzleCandidates({ ...accountPuzzle(2, 4), passwordHint: "Unexpected" }), []);
});

test("a worker can deploy to an adjacent two-digit AccountsManager server", async () => {
    const checked = [];
    const target = "light:inc";
    const workerArgs = [10150, 10151, 1, 18];
    const ns = {
        getHostname: () => "neighbor",
        getScriptRam: () => 9.45,
        getServerMaxRam: () => 16,
        getServerUsedRam: () => 0,
        scp(_files, host, from) {
            assert.equal(host, target);
            assert.equal(from, "neighbor");
            return true;
        },
        exec(script, host, options, ...args) {
            assert.equal(script, "darknet/worker.js");
            assert.equal(host, target);
            assert.deepEqual(options, { threads: 1, preventDuplicates: true });
            assert.deepEqual(args, workerArgs);
            return 42;
        },
        dnet: {
            getServerDetails: () => ({
                ...accountPuzzle(2, 4), isOnline: true, isConnectedToCurrentServer: true, hasSession: false,
            }),
            async authenticate(host, candidate) {
                assert.equal(host, target);
                checked.push(candidate);
                return candidate === "23" ? { success: true, code: 200 } : { success: false, code: 401 };
            },
        },
    };

    assert.equal(await deploy(ns, target, workerArgs), "worker launched");
    assert.equal(checked[0], "10");
    assert.equal(checked.at(-1), "23");
});
