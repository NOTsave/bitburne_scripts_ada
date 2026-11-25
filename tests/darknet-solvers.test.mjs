import test from "node:test";
import assert from "node:assert/strict";
import { EURO_ZONE_COUNTRIES, TOP_PASS_WORDS } from "../darknet/password-lists.js";
import { puzzleAnswer, puzzleCandidates } from "../darknet/solvers.js";

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
