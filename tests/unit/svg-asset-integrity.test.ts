/**
 * @file Unit tests validating SVG icon viewport height utilization, path uniqueness,
 * temporal progression, and markup-to-asset parity.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Coordinate points extracted from an SVG path command sequence.
 */
interface PathPoints {
    xs: number[];
    ys: number[];
}

/**
 * Evaluates a 1D cubic Bézier curve at parameter t.
 *
 * @param {number} p0 - Start point.
 * @param {number} p1 - First control point.
 * @param {number} p2 - Second control point.
 * @param {number} p3 - End point.
 * @param {number} t - Parameter in [0, 1].
 * @returns {number} Evaluated coordinate value.
 */
function evaluateCubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const oneMinusT = 1 - t;
    return (
        oneMinusT * oneMinusT * oneMinusT * p0 +
        3 * oneMinusT * oneMinusT * t * p1 +
        3 * oneMinusT * t * t * p2 +
        t * t * t * p3
    );
}

/**
 * Calculates rendered extrema (min and max boundary values) for a 1D cubic Bézier segment.
 *
 * @param {number} p0 - Start point.
 * @param {number} p1 - First control point.
 * @param {number} p2 - Second control point.
 * @param {number} p3 - End point.
 * @returns {number[]} Array containing boundary endpoints and any local stationary values.
 */
function getCubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
    const vals = [p0, p3];
    const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
    const b = 6 * (p0 - 2 * p1 + p2);
    const c = 3 * (-p0 + p1);

    if (Math.abs(a) < 1e-9) {
        if (Math.abs(b) > 1e-9) {
            const t = -c / b;
            if (t > 0 && t < 1) vals.push(evaluateCubic(p0, p1, p2, p3, t));
        }
    } else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
            const sqrtDisc = Math.sqrt(disc);
            const t1 = (-b - sqrtDisc) / (2 * a);
            const t2 = (-b + sqrtDisc) / (2 * a);
            if (t1 > 0 && t1 < 1) vals.push(evaluateCubic(p0, p1, p2, p3, t1));
            if (t2 > 0 && t2 < 1) vals.push(evaluateCubic(p0, p1, p2, p3, t2));
        }
    }
    return vals;
}

/**
 * Calculates rendered extrema for a 1D quadratic Bézier segment.
 *
 * @param {number} p0 - Start point.
 * @param {number} p1 - Control point.
 * @param {number} p2 - End point.
 * @returns {number[]} Array containing boundary endpoints and any local stationary values.
 */
function getQuadraticExtrema(p0: number, p1: number, p2: number): number[] {
    const vals = [p0, p2];
    const denom = p0 - 2 * p1 + p2;
    if (Math.abs(denom) > 1e-9) {
        const t = (p0 - p1) / denom;
        if (t > 0 && t < 1) {
            const oneMinusT = 1 - t;
            vals.push(oneMinusT * oneMinusT * p0 + 2 * oneMinusT * t * p1 + t * t * p2);
        }
    }
    return vals;
}

/**
 * State container for cursor tracking during path point extraction.
 */
interface CursorState {
    x: number;
    y: number;
    lastQuadCp: { x: number; y: number } | null;
}

/**
 * Dispatches move and line commands updating cursor state and recorded points.
 *
 * @param {string} cmd - Command letter.
 * @param {number[]} args - Command arguments.
 * @param {CursorState} cursor - Running cursor position.
 * @param {PathPoints} points - Accumulated point arrays.
 * @returns {void}
 */
function processMoveOrLine(
    cmd: string,
    args: number[],
    cursor: CursorState,
    points: PathPoints,
): void {
    cursor.lastQuadCp = null;
    const isRelative = cmd === "m" || cmd === "l";
    for (let i = 0; i < args.length; i += 2) {
        cursor.x = isRelative ? cursor.x + args[i] : args[i];
        points.xs.push(cursor.x);
        if (i + 1 < args.length) {
            cursor.y = isRelative ? cursor.y + args[i + 1] : args[i + 1];
            points.ys.push(cursor.y);
        }
    }
}

/**
 * Dispatches horizontal and vertical line commands.
 *
 * @param {string} cmd - Command letter (H, h, V, v).
 * @param {number[]} args - Command arguments.
 * @param {CursorState} cursor - Running cursor position.
 * @param {PathPoints} points - Accumulated point arrays.
 * @returns {void}
 */
function processHorizontalOrVertical(
    cmd: string,
    args: number[],
    cursor: CursorState,
    points: PathPoints,
): void {
    cursor.lastQuadCp = null;
    for (const val of args) {
        if (cmd === "H") cursor.x = val;
        else if (cmd === "h") cursor.x += val;
        else if (cmd === "V") cursor.y = val;
        else if (cmd === "v") cursor.y += val;

        points.xs.push(cursor.x);
        points.ys.push(cursor.y);
    }
}

/**
 * Dispatches cubic Bézier curve commands computing true rendered curve extrema.
 *
 * @param {string} cmd - Command letter (C, c).
 * @param {number[]} args - Command arguments (6 per segment).
 * @param {CursorState} cursor - Running cursor position.
 * @param {PathPoints} points - Accumulated point arrays.
 * @returns {void}
 */
function processCubicCurve(
    cmd: string,
    args: number[],
    cursor: CursorState,
    points: PathPoints,
): void {
    cursor.lastQuadCp = null;
    const isRelative = cmd === "c";
    for (let i = 0; i < args.length; i += 6) {
        const cp1X = isRelative ? cursor.x + args[i] : args[i];
        const cp1Y = isRelative ? cursor.y + args[i + 1] : args[i + 1];
        const cp2X = isRelative ? cursor.x + args[i + 2] : args[i + 2];
        const cp2Y = isRelative ? cursor.y + args[i + 3] : args[i + 3];
        const endX = isRelative ? cursor.x + args[i + 4] : args[i + 4];
        const endY = isRelative ? cursor.y + args[i + 5] : args[i + 5];

        points.xs.push(...getCubicExtrema(cursor.x, cp1X, cp2X, endX));
        points.ys.push(...getCubicExtrema(cursor.y, cp1Y, cp2Y, endY));

        cursor.x = endX;
        cursor.y = endY;
    }
}

/**
 * Dispatches quadratic Bézier curve commands computing true rendered curve extrema.
 *
 * @param {string} cmd - Command letter (Q, q, T, t).
 * @param {number[]} args - Command arguments.
 * @param {CursorState} cursor - Running cursor position.
 * @param {PathPoints} points - Accumulated point arrays.
 * @returns {void}
 */
function processQuadraticCurve(
    cmd: string,
    args: number[],
    cursor: CursorState,
    points: PathPoints,
): void {
    if (cmd === "Q" || cmd === "q") {
        const isRelative = cmd === "q";
        for (let i = 0; i < args.length; i += 4) {
            const cpX = isRelative ? cursor.x + args[i] : args[i];
            const cpY = isRelative ? cursor.y + args[i + 1] : args[i + 1];
            const endX = isRelative ? cursor.x + args[i + 2] : args[i + 2];
            const endY = isRelative ? cursor.y + args[i + 3] : args[i + 3];

            points.xs.push(...getQuadraticExtrema(cursor.x, cpX, endX));
            points.ys.push(...getQuadraticExtrema(cursor.y, cpY, endY));

            cursor.lastQuadCp = { x: cpX, y: cpY };
            cursor.x = endX;
            cursor.y = endY;
        }
    } else {
        // T / t smooth quadratic endpoint: reflect previous quadratic control point across cursor
        const isRelative = cmd === "t";
        for (let i = 0; i < args.length; i += 2) {
            const endX = isRelative ? cursor.x + args[i] : args[i];
            const endY = isRelative ? cursor.y + args[i + 1] : args[i + 1];
            const cpX = cursor.lastQuadCp ? 2 * cursor.x - cursor.lastQuadCp.x : cursor.x;
            const cpY = cursor.lastQuadCp ? 2 * cursor.y - cursor.lastQuadCp.y : cursor.y;

            points.xs.push(...getQuadraticExtrema(cursor.x, cpX, endX));
            points.ys.push(...getQuadraticExtrema(cursor.y, cpY, endY));

            cursor.lastQuadCp = { x: cpX, y: cpY };
            cursor.x = endX;
            cursor.y = endY;
        }
    }
}

/**
 * Extracts all absolute and resolved relative numeric X and Y coordinate values from an SVG path string in a single pass.
 *
 * @param {string} pathD - SVG path definition string.
 * @returns {PathPoints} Object containing arrays of resolved X and Y coordinates.
 */
function extractPathPoints(pathD: string): PathPoints {
    const points: PathPoints = { xs: [], ys: [] };
    const cursor: CursorState = { x: 0, y: 0, lastQuadCp: null };
    const regex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
    let match: RegExpExecArray | null;

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex parsing loop
    while ((match = regex.exec(pathD)) !== null) {
        const cmd = match[1];
        const numMatches = match[2].match(/-?\d*\.?\d+/g);
        const args = numMatches ? numMatches.map(Number) : [];

        switch (cmd) {
            case "M":
            case "m":
            case "L":
            case "l":
                processMoveOrLine(cmd, args, cursor, points);
                break;
            case "H":
            case "h":
            case "V":
            case "v":
                processHorizontalOrVertical(cmd, args, cursor, points);
                break;
            case "C":
            case "c":
                processCubicCurve(cmd, args, cursor, points);
                break;
            case "Q":
            case "q":
            case "T":
            case "t":
                processQuadraticCurve(cmd, args, cursor, points);
                break;
            case "Z":
            case "z":
                cursor.lastQuadCp = null;
                break;
            default:
                throw new Error(`Unsupported SVG command "${cmd}" in path: ${pathD}`);
        }
    }

    return points;
}

/**
 * Helper to retrieve an inline SVG path string from index.html markup for a given element attribute.
 *
 * @param {string} html - Raw HTML source content.
 * @param {string} attrName - Target attribute name (e.g. 'data-pattern', 'data-wave').
 * @param {string} attrValue - Attribute value to match.
 * @returns {string} The path 'd' attribute string.
 */
function getInlinePath(html: string, attrName: string, attrValue: string): string {
    const regex = new RegExp(`${attrName}="${attrValue}"[\\s\\S]*?<path\\s+d="([^"]+)"`);
    const match = html.match(regex);
    expect(match, `Missing SVG path for ${attrName}="${attrValue}"`).not.toBeNull();
    return match ? match[1].trim() : "";
}

/**
 * Asserts that an SVG path spans a minimum vertical height within its viewport.
 *
 * @param {string} pathD - Path definition string.
 * @param {number} minSpan - Expected minimum vertical span in units.
 * @param {string} label - Context label for descriptive assertion failures.
 * @returns {void}
 */
function assertMinimumHeightSpan(pathD: string, minSpan: number, label: string): void {
    const { ys } = extractPathPoints(pathD);
    expect(ys.length, `No Y coordinates parsed for ${label}`).toBeGreaterThan(0);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = maxY - minY;
    expect(
        span,
        `${label} vertical span (${span}) is less than ${minSpan} units (${minY} to ${maxY})`,
    ).toBeGreaterThanOrEqual(minSpan);
}

/**
 * Asserts parity between an inline HTML SVG path and its standalone SVG asset file.
 *
 * @param {string} rootDir - Workspace root directory.
 * @param {string} inlinePath - Extracted inline path definition.
 * @param {string} subfolder - Asset subfolder under public/images/ ('patterns' or 'waveforms').
 * @param {string} filename - Standalone file name.
 * @returns {void}
 */
function assertStandaloneParity(
    rootDir: string,
    inlinePath: string,
    subfolder: string,
    filename: string,
): void {
    const filePath = resolve(rootDir, "public/images", subfolder, filename);
    const fileContent = readFileSync(filePath, "utf-8");
    const fileMatch = fileContent.match(/<path[^>]*\bd="([^"]+)"/);
    expect(fileMatch, `Standalone file ${filename} missing <path>`).not.toBeNull();
    const standalonePath = fileMatch ? fileMatch[1].trim() : "";

    expect(inlinePath, `Mismatch between inline HTML and standalone ${filename}`).toBe(
        standalonePath,
    );
    expect(
        fileContent,
        `Standalone ${filename} must include :root color fallback styling`,
    ).toContain(":root { color: #38bdf8; }");
}

describe("SVG Asset Integrity & Viewport Height Utilization", () => {
    const rootDir = resolve(__dirname, "../../");
    const htmlContent = readFileSync(resolve(rootDir, "index.html"), "utf-8");

    const patternIds = [
        "up",
        "down",
        "upDown",
        "downUp",
        "upDownRepeat",
        "downUpRepeat",
        "random",
        "randomCycle",
        "randomWalk",
        "randomWalkDrunk",
    ];

    const waveformIds = ["sine", "sawtooth", "triangle", "square", "pulse"];

    it("verifies all path-based pattern direction icons in index.html utilize at least 70% viewport height", () => {
        for (const patternId of patternIds) {
            const pathD = getInlinePath(htmlContent, "data-pattern", patternId);
            assertMinimumHeightSpan(pathD, 23, `Pattern "${patternId}"`);
        }
    });

    it("verifies all waveform icons in index.html utilize at least 70% viewport height", () => {
        for (const waveId of waveformIds) {
            const pathD = getInlinePath(htmlContent, "data-wave", waveId);
            assertMinimumHeightSpan(pathD, 24, `Waveform "${waveId}"`);
        }
    });

    it("verifies every pattern direction icon has a unique visual path with zero duplicates", () => {
        const seenPaths = new Map<string, string>();

        for (const patternId of patternIds) {
            const pathD = getInlinePath(htmlContent, "data-pattern", patternId);
            const duplicateOf = seenPaths.get(pathD);
            expect(
                duplicateOf,
                `Pattern "${patternId}" has duplicate path of "${duplicateOf}": ${pathD}`,
            ).toBeUndefined();
            seenPaths.set(pathD, patternId);
        }
    });

    it("verifies linear pattern icons adhere to left-to-right temporal progression", () => {
        for (const dir of ["down", "downUp"]) {
            const pathD = getInlinePath(htmlContent, "data-pattern", dir);
            const { xs } = extractPathPoints(pathD);
            expect(xs.length, `Expected X points for "${dir}"`).toBeGreaterThan(1);
            expect(
                xs[0],
                `Linear pattern "${dir}" should start on left and progress right`,
            ).toBeLessThan(xs[xs.length - 1]);
        }
    });

    it("verifies parity between inline HTML paths and standalone pattern SVG files", () => {
        const patternFileMap: Record<string, string> = {
            up: "pattern-direction-up.svg",
            down: "pattern-direction-down.svg",
            upDown: "pattern-direction-upDown.svg",
            downUp: "pattern-direction-downUp.svg",
            upDownRepeat: "pattern-direction-upDownRepeated.svg",
            downUpRepeat: "pattern-direction-downUpRepeated.svg",
            random: "pattern-direction-random.svg",
            randomCycle: "pattern-direction-randomCycle.svg",
            randomWalk: "pattern-direction-randomWalk.svg",
            randomWalkDrunk: "pattern-direction-randomWalkDrunkard.svg",
        };

        for (const [patternId, filename] of Object.entries(patternFileMap)) {
            const inlinePath = getInlinePath(htmlContent, "data-pattern", patternId);
            assertStandaloneParity(rootDir, inlinePath, "patterns", filename);
        }
    });

    it("verifies parity between inline HTML paths and standalone waveform SVG files", () => {
        const waveFileMap: Record<string, string> = {
            sine: "waveform-sine.svg",
            sawtooth: "waveform-sawtooth.svg",
            triangle: "waveform-triangle.svg",
            square: "waveform-square.svg",
            pulse: "waveform-pulse.svg",
        };

        for (const [waveId, filename] of Object.entries(waveFileMap)) {
            const inlinePath = getInlinePath(htmlContent, "data-wave", waveId);
            assertStandaloneParity(rootDir, inlinePath, "waveforms", filename);
        }
    });
});
