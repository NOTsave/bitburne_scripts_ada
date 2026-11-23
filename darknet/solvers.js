/**
 * Darknet Puzzle Solvers
 * 
 * Comprehensive puzzle solving algorithms for Bitburner Darknet servers.
 * Based on community research and reverse-engineering of game mechanics.
 * 
 * @author Senior Automation Engineer (Bitburner Framework)
 * @version 1.0.0
 */

// ============================================================================
// KNOWN PUZZLE MODELS AND THEIR SOLUTIONS
// ============================================================================

/**
 * FreshInstall_1.0 - Default credentials based on format and length
 * These are the most common default passwords in the Darknet
 */
const FRESH_INSTALL_ANSWERS = {
    "alphabetic:5": "admin",
    "alphabetic:8": "password",
    "numeric:4": "0000",
    "numeric:5": "12345",
};

/**
 * Laika4 - Dog name puzzles
 * Common dog names for different password lengths
 */
const LAIKA_NAMES = {
    3: ["max"],
    4: ["fido", "spot"],
    5: ["rover"],
};

/**
 * DeskMemo_3.1 - Password hint parser
 * Extracts numbers from common hint patterns
 */
const DESK_MEMO_HINT = /^(?:The password is|The PIN is|Remember to use|It's set to|The key is|The secret is) (\d{1,3})$/;

// ============================================================================
// PUZZLE SOLVERS
// ============================================================================

/**
 * Solves OctantVoxel base conversion puzzles
 * 
 * Format: "radix,whole.fraction" where:
 * - radix: base (2-17.6)
 * - whole: digits in that base
 * - fraction: optional fractional part
 * 
 * @param {string} clue - The puzzle clue
 * @returns {string|undefined} - The decimal answer or undefined
 */
function solveOctantVoxel(clue) {
    const fields = /^\s*(\d+(?:\.\d+)?),\s*([0-9A-Z]+)(?:\.([0-9A-Z]+))?\s*$/i.exec(clue);
    if (!fields) return undefined;

    const [, baseText, whole, fraction = ""] = fields;
    const radix = Number(baseText);
    if (radix < 2 || radix > 17.6) return undefined;

    const glyphs = whole + fraction;
    let decimal = 0;
    
    for (let position = 0; position < glyphs.length; position++) {
        const digit = Number.parseInt(glyphs[position], 36);
        if (digit >= radix) return undefined;
        decimal += digit * radix ** (whole.length - position - 1);
    }

    // The game stops emitting fractional digits once the remainder is below 0.0001
    const rounded = Math.round(decimal);
    if (Number.isSafeInteger(rounded) && Math.abs(decimal - rounded) < 0.001) {
        return String(rounded);
    }
    return undefined;
}

/**
 * Solves CloudBlare(tm) puzzles by extracting digits from string
 * 
 * @param {string} data - The input data
 * @returns {string} - Digits only
 */
function solveCloudBlare(data) {
    return data.replace(/[^0-9]/g, "");
}

/**
 * Solves BellaCuore Roman numeral puzzles
 * 
 * @param {string} digits - Roman numerals
 * @returns {number} - Decimal value
 */
function solveBellaCuore(digits) {
    if (digits === "NULLA") return 0;
    
    const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let decimal = 0;
    
    for (let index = 0; index < digits.length; index++) {
        const value = values[digits[index]];
        const nextValue = values[digits[index + 1]] || 0;
        decimal += value < nextValue ? -value : value;
    }
    
    return decimal;
}

/**
 * Solves 110100100 binary byte puzzles
 * 
 * @param {string} data - Space-separated binary bytes
 * @param {string} passwordFormat - Expected format
 * @param {number} passwordLength - Expected length
 * @returns {string|undefined} - ASCII string if valid
 */
function solveBinaryBytes(data, passwordFormat, passwordLength) {
    const bytes = data.trim().split(/\s+/);
    if (bytes.length !== passwordLength) return undefined;
    
    if (!bytes.every(byte => /^[01]{8}$/.test(byte))) {
        return undefined;
    }
    
    const answer = bytes.map(byte => String.fromCharCode(Number.parseInt(byte, 2))).join("");
    if (!/^[0-9A-Za-z]+$/.test(answer)) return undefined;
    
    const format = /^\d+$/.test(answer) ? "numeric" : 
                   /^[A-Za-z]+$/.test(answer) ? "alphabetic" : 
                   "alphanumeric";
    
    return format === passwordFormat ? answer : undefined;
}

/**
 * Solves PHP 5.4 digit permutation puzzles
 * Generates all permutations of digits for password
 * 
 * @param {string} data - Input digits
 * @param {number} passwordLength - Required length
 * @returns {string[]} - All valid permutations
 */
function solvePHP54(data, passwordLength) {
    const digits = data.trim();
    if (!/^\d{1,3}$/.test(digits) || digits.length !== passwordLength) {
        return [];
    }

    let orders = new Set([""]);
    for (const digit of digits) {
        const next = new Set();
        for (const order of orders) {
            for (let index = 0; index <= order.length; index++) {
                next.add(order.slice(0, index) + digit + order.slice(index));
            }
        }
        orders = next;
    }
    
    return [...orders].filter(order => order === "0" || !order.startsWith("0")).sort();
}

/**
 * Solves AccountsManager_4.2 single digit puzzles
 * 
 * @returns {string[]} - Digits 0-9
 */
function solveAccountsManager42() {
    return "0123456789".split("");
}

// ============================================================================
// MAIN SOLVER FUNCTIONS
// ============================================================================

/**
 * Solves a single puzzle type with known answer
 * 
 * @param {Object} details - Server details from ns.dnet.getServerDetails()
 * @returns {string|undefined} - The answer or undefined
 */
function singlePuzzleAnswer(details) {
    switch (details.modelId) {
        case "ZeroLogon":
            // Empty password
            return "";

        case "FreshInstall_1.0":
            // Default credentials based on format and length
            return FRESH_INSTALL_ANSWERS[`${details.passwordFormat}:${details.passwordLength}`];

        case "DeskMemo_3.1":
            if (typeof details.passwordHint !== 'string') return undefined;
            const answer = DESK_MEMO_HINT.exec(details.passwordHint)?.[1];
            return answer && answer.length === details.passwordLength ? answer : undefined;

        case "BellaCuore":
            if (details.passwordFormat !== "numeric" || typeof details.data !== "string") {
                return undefined;
            }
            const digits = details.data.trim().toUpperCase();
            // Also handles range clues like "IX,XX" - but we only handle single values
            if (digits !== "NULLA" && 
                (!digits || !/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(digits))) {
                return undefined;
            }
            const answer = String(solveBellaCuore(digits));
            return answer.length === details.passwordLength ? answer : undefined;

        case "110100100":
            if (typeof details.data !== "string") return undefined;
            return solveBinaryBytes(details.data, details.passwordFormat, details.passwordLength);

        case "CloudBlare(tm)":
        case "OctantVoxel":
            if (typeof details.data !== "string" || details.passwordFormat !== "numeric") {
                return undefined;
            }
            const answer = details.modelId === "CloudBlare(tm)"
                ? solveCloudBlare(details.data)
                : solveOctantVoxel(details.data);
            return answer && answer.length === details.passwordLength ? answer : undefined;

        default:
            return undefined;
    }
}

/**
 * Generates all possible answers for a puzzle
 * Used when single answer isn't sufficient
 * 
 * @param {Object} details - Server details
 * @returns {string[]} - Array of possible answers
 */
export function puzzleCandidates(details) {
    if (!details || !details.modelId) return [];

    switch (details.modelId) {
        case "PHP 5.4":
            return solvePHP54(details.data, details.passwordLength);

        case "AccountsManager_4.2":
            if (details.passwordFormat !== "numeric" || 
                details.passwordLength !== 1 ||
                details.passwordHint !== "The password is a number between 0 and 10") {
                return [];
            }
            return solveAccountsManager42();

        case "Laika4":
            return details.passwordFormat === "alphabetic" 
                ? (LAIKA_NAMES[details.passwordLength] ?? [])
                : [];

        default:
            const answer = singlePuzzleAnswer(details);
            return answer === undefined ? [] : [answer];
    }
}

/**
 * Gets the single best answer for a puzzle
 * 
 * @param {Object} details - Server details
 * @returns {string|undefined} - The answer or undefined
 */
export function puzzleAnswer(details) {
    const choices = puzzleCandidates(details);
    return choices.length === 1 ? choices[0] : undefined;
}

/**
 * Checks if a puzzle type can be solved
 * 
 * @param {Object} details - Server details
 * @returns {boolean} - True if solvable
 */
export function isSupported(details) {
    return puzzleCandidates(details).length > 0;
}

/**
 * Gets the priority of a puzzle type for solving order
 * Lower numbers = higher priority
 * 
 * @param {string} modelId - The model ID
 * @returns {number} - Priority (0-10)
 */
export function getPuzzlePriority(modelId) {
    const priorities = {
        "ZeroLogon": 0,
        "FreshInstall_1.0": 1,
        "DeskMemo_3.1": 2,
        "BellaCuore": 3,
        "110100100": 4,
        "CloudBlare(tm)": 5,
        "OctantVoxel": 6,
        "PHP 5.4": 7,
        "AccountsManager_4.2": 8,
        "Laika4": 9
    };
    return priorities[modelId] ?? 10;
}

/**
 * Validates that an answer meets the requirements
 * 
 * @param {string} answer - The proposed answer
 * @param {string} passwordFormat - Expected format
 * @param {number} passwordLength - Expected length
 * @returns {boolean} - True if valid
 */
export function validateAnswer(answer, passwordFormat, passwordLength) {
    if (!answer || answer.length !== passwordLength) return false;

    switch (passwordFormat) {
        case "numeric":
            return /^\d+$/.test(answer);
        case "alphabetic":
            return /^[A-Za-z]+$/.test(answer);
        case "alphanumeric":
            return /^[0-9A-Za-z]+$/.test(answer);
        default:
            return true; // Unknown format, accept anything
    }
}
