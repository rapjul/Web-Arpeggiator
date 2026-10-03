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
    if (args.length % 2 !== 0) {
        throw new Error(
            `Odd argument count (${args.length}) for command "${cmd}": ${args.join(" ")}`,
        );
    }
    const isRelative = cmd === "m" || cmd === "l";
    for (let i = 0; i < args.length; i += 2) {
        cursor.x = isRelative ? cursor.x + args[i] : args[i];
        cursor.y = isRelative ? cursor.y + args[i + 1] : args[i + 1];
        points.xs.push(cursor.x);
        points.ys.push(cursor.y);
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
    if (args.length % 6 !== 0) {
        throw new Error(
            `Invalid argument count (${args.length}) for cubic command "${cmd}": expected multiple of 6`,
        );
    }
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
        if (args.length % 4 !== 0) {
            throw new Error(
                `Invalid argument count (${args.length}) for quadratic command "${cmd}": expected multiple of 4`,
            );
        }
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
        if (args.length % 2 !== 0) {
            throw new Error(
                `Invalid argument count (${args.length}) for smooth quadratic command "${cmd}": expected multiple of 2`,
            );
        }
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
        const numMatches = match[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
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
    const regex = new RegExp(
        `${attrName}="${attrValue}"(?:(?!</svg>)[\\s\\S])*?<path[^>]*\\bd="([^"]+)"`,
    );
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

/**
 * Represents a single normalized path segment with endpoints and optional Bézier control points.
 */
interface CanonicalSegment {
    type: "L" | "Q" | "C";
    xs: number;
    ys: number;
    xe: number;
    ye: number;
    cp1x?: number;
    cp1y?: number;
    cp2x?: number;
    cp2y?: number;
}

/**
 * Represents a contiguous subpath starting with an absolute M coordinate and containing segments.
 */
interface CanonicalSubpath {
    startX: number;
    startY: number;
    segments: CanonicalSegment[];
}

/**
 * Serializes a canonical subpath in its forward traversal direction.
 *
 * @param {CanonicalSubpath} subpath - The subpath structure to serialize.
 * @returns {string} The forward canonical SVG command string.
 */
function serializeSubpathForward(subpath: CanonicalSubpath): string {
    const parts: string[] = [`M ${subpath.startX} ${subpath.startY}`];
    for (const seg of subpath.segments) {
        if (seg.type === "L") {
            parts.push(`L ${seg.xe} ${seg.ye}`);
        } else if (seg.type === "Q") {
            parts.push(`Q ${seg.cp1x} ${seg.cp1y} ${seg.xe} ${seg.ye}`);
        } else if (seg.type === "C") {
            parts.push(`C ${seg.cp1x} ${seg.cp1y} ${seg.cp2x} ${seg.cp2y} ${seg.xe} ${seg.ye}`);
        }
    }
    return parts.join(" ");
}

/**
 * Serializes a canonical subpath in its mathematically reversed traversal direction.
 * Inverts Bézier control points to guarantee identical representation regardless of drawing order:
 * - Line: connects ending coordinates back to start coordinates.
 * - Quadratic Bézier: keeps single control point while swapping endpoints.
 * - Cubic Bézier: swaps first and second control points while swapping endpoints.
 *
 * @param {CanonicalSubpath} subpath - The subpath structure to serialize.
 * @returns {string} The reversed canonical SVG command string.
 */
function serializeSubpathReversed(subpath: CanonicalSubpath): string {
    if (subpath.segments.length === 0) {
        return `M ${subpath.startX} ${subpath.startY}`;
    }
    const lastSeg = subpath.segments[subpath.segments.length - 1];
    const parts: string[] = [`M ${lastSeg.xe} ${lastSeg.ye}`];
    for (let i = subpath.segments.length - 1; i >= 0; i--) {
        const seg = subpath.segments[i];
        if (seg.type === "L") {
            parts.push(`L ${seg.xs} ${seg.ys}`);
        } else if (seg.type === "Q") {
            parts.push(`Q ${seg.cp1x} ${seg.cp1y} ${seg.xs} ${seg.ys}`);
        } else if (seg.type === "C") {
            parts.push(`C ${seg.cp2x} ${seg.cp2y} ${seg.cp1x} ${seg.cp1y} ${seg.xs} ${seg.ys}`);
        }
    }
    return parts.join(" ");
}

/**
 * Canonicalizes an SVG path definition into absolute geometry commands for equivalence comparisons.
 * Resolves all relative commands (m, l, h, v, c, q, t) to absolute commands (M, L, C, Q),
 * normalizes horizontal/vertical lines (H, V) to canonical line segments (L),
 * expands smooth quadratic curves (T, t) to explicit quadratic Bézier commands (Q) with reflected control points,
 * and normalizes traversal direction so forward and reversed identical strokes yield identical keys.
 *
 * @param {string} pathD - Raw SVG path string.
 * @returns {string} Canonicalized path string with resolved absolute coordinates, expanded curves, and traversal normalization.
 */
function canonicalizeResolvedGeometry(pathD: string): string {
    const regex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
    let match: RegExpExecArray | null;
    const subpaths: CanonicalSubpath[] = [];
    let currentSubpath: CanonicalSubpath | null = null;
    let curX = 0;
    let curY = 0;
    let lastQuadCp: { x: number; y: number } | null = null;

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex parsing loop
    while ((match = regex.exec(pathD)) !== null) {
        const cmd = match[1];
        const numMatches = match[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
        const args = numMatches ? numMatches.map(Number) : [];

        switch (cmd) {
            case "M":
                for (let i = 0; i < args.length; i += 2) {
                    curX = args[i];
                    curY = args[i + 1];
                    currentSubpath = { startX: curX, startY: curY, segments: [] };
                    subpaths.push(currentSubpath);
                    lastQuadCp = null;
                }
                break;
            case "m":
                for (let i = 0; i < args.length; i += 2) {
                    curX += args[i];
                    curY += args[i + 1];
                    currentSubpath = { startX: curX, startY: curY, segments: [] };
                    subpaths.push(currentSubpath);
                    lastQuadCp = null;
                }
                break;
            case "L":
                for (let i = 0; i < args.length; i += 2) {
                    const endX = args[i];
                    const endY = args[i + 1];
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "L",
                        xs: curX,
                        ys: curY,
                        xe: endX,
                        ye: endY,
                    });
                    curX = endX;
                    curY = endY;
                    lastQuadCp = null;
                }
                break;
            case "l":
                for (let i = 0; i < args.length; i += 2) {
                    const endX = curX + args[i];
                    const endY = curY + args[i + 1];
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "L",
                        xs: curX,
                        ys: curY,
                        xe: endX,
                        ye: endY,
                    });
                    curX = endX;
                    curY = endY;
                    lastQuadCp = null;
                }
                break;
            case "H":
                for (let i = 0; i < args.length; i++) {
                    const endX = args[i];
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "L",
                        xs: curX,
                        ys: curY,
                        xe: endX,
                        ye: curY,
                    });
                    curX = endX;
                    lastQuadCp = null;
                }
                break;
            case "h":
                for (let i = 0; i < args.length; i++) {
                    const endX = curX + args[i];
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "L",
                        xs: curX,
                        ys: curY,
                        xe: endX,
                        ye: curY,
                    });
                    curX = endX;
                    lastQuadCp = null;
                }
                break;
            case "V":
                for (let i = 0; i < args.length; i++) {
                    const endY = args[i];
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "L",
                        xs: curX,
                        ys: curY,
                        xe: curX,
                        ye: endY,
                    });
                    curY = endY;
                    lastQuadCp = null;
                }
                break;
            case "v":
                for (let i = 0; i < args.length; i++) {
                    const endY = curY + args[i];
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "L",
                        xs: curX,
                        ys: curY,
                        xe: curX,
                        ye: endY,
                    });
                    curY = endY;
                    lastQuadCp = null;
                }
                break;
            case "C":
                for (let i = 0; i < args.length; i += 6) {
                    const c1x = args[i];
                    const c1y = args[i + 1];
                    const c2x = args[i + 2];
                    const c2y = args[i + 3];
                    const endX = args[i + 4];
                    const endY = args[i + 5];
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "C",
                        xs: curX,
                        ys: curY,
                        cp1x: c1x,
                        cp1y: c1y,
                        cp2x: c2x,
                        cp2y: c2y,
                        xe: endX,
                        ye: endY,
                    });
                    curX = endX;
                    curY = endY;
                    lastQuadCp = null;
                }
                break;
            case "c":
                for (let i = 0; i < args.length; i += 6) {
                    const c1x = curX + args[i];
                    const c1y = curY + args[i + 1];
                    const c2x = curX + args[i + 2];
                    const c2y = curY + args[i + 3];
                    const endX = curX + args[i + 4];
                    const endY = curY + args[i + 5];
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "C",
                        xs: curX,
                        ys: curY,
                        cp1x: c1x,
                        cp1y: c1y,
                        cp2x: c2x,
                        cp2y: c2y,
                        xe: endX,
                        ye: endY,
                    });
                    curX = endX;
                    curY = endY;
                    lastQuadCp = null;
                }
                break;
            case "Q":
                for (let i = 0; i < args.length; i += 4) {
                    const cpX = args[i];
                    const cpY = args[i + 1];
                    const endX = args[i + 2];
                    const endY = args[i + 3];
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "Q",
                        xs: curX,
                        ys: curY,
                        cp1x: cpX,
                        cp1y: cpY,
                        xe: endX,
                        ye: endY,
                    });
                    curX = endX;
                    curY = endY;
                    lastQuadCp = { x: cpX, y: cpY };
                }
                break;
            case "q":
                for (let i = 0; i < args.length; i += 4) {
                    const cpX = curX + args[i];
                    const cpY = curY + args[i + 1];
                    const endX = curX + args[i + 2];
                    const endY = curY + args[i + 3];
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "Q",
                        xs: curX,
                        ys: curY,
                        cp1x: cpX,
                        cp1y: cpY,
                        xe: endX,
                        ye: endY,
                    });
                    curX = endX;
                    curY = endY;
                    lastQuadCp = { x: cpX, y: cpY };
                }
                break;
            case "T":
                for (let i = 0; i < args.length; i += 2) {
                    const endX = args[i];
                    const endY = args[i + 1];
                    const cpX = lastQuadCp ? 2 * curX - lastQuadCp.x : curX;
                    const cpY = lastQuadCp ? 2 * curY - lastQuadCp.y : curY;
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "Q",
                        xs: curX,
                        ys: curY,
                        cp1x: cpX,
                        cp1y: cpY,
                        xe: endX,
                        ye: endY,
                    });
                    curX = endX;
                    curY = endY;
                    lastQuadCp = { x: cpX, y: cpY };
                }
                break;
            case "t":
                for (let i = 0; i < args.length; i += 2) {
                    const endX = curX + args[i];
                    const endY = curY + args[i + 1];
                    const cpX = lastQuadCp ? 2 * curX - lastQuadCp.x : curX;
                    const cpY = lastQuadCp ? 2 * curY - lastQuadCp.y : curY;
                    if (!currentSubpath) {
                        currentSubpath = { startX: curX, startY: curY, segments: [] };
                        subpaths.push(currentSubpath);
                    }
                    currentSubpath.segments.push({
                        type: "Q",
                        xs: curX,
                        ys: curY,
                        cp1x: cpX,
                        cp1y: cpY,
                        xe: endX,
                        ye: endY,
                    });
                    curX = endX;
                    curY = endY;
                    lastQuadCp = { x: cpX, y: cpY };
                }
                break;
            case "Z":
            case "z":
                if (
                    currentSubpath &&
                    (curX !== currentSubpath.startX || curY !== currentSubpath.startY)
                ) {
                    currentSubpath.segments.push({
                        type: "L",
                        xs: curX,
                        ys: curY,
                        xe: currentSubpath.startX,
                        ye: currentSubpath.startY,
                    });
                    curX = currentSubpath.startX;
                    curY = currentSubpath.startY;
                }
                lastQuadCp = null;
                break;
            default:
                throw new Error(`Unhandled SVG command in canonicalizeResolvedGeometry: "${cmd}"`);
        }
    }

    const canonicalSubpaths = subpaths.map((sp) => {
        const forward = serializeSubpathForward(sp);
        const reversed = serializeSubpathReversed(sp);
        return forward <= reversed ? forward : reversed;
    });

    canonicalSubpaths.sort();
    return canonicalSubpaths.join(" ");
}

/**
 * Extracted coordinate attributes for an SVG circle element.
 */
interface CircleAttributes {
    cx: number;
    cy: number;
    r: number;
}

/**
 * Extracts circle element attributes from an inline SVG pattern button in the HTML source.
 *
 * @param {string} html - Raw HTML source content.
 * @param {string} attrName - Attribute name matching the button (e.g. 'data-pattern').
 * @param {string} attrValue - Target attribute value (e.g. 'octaveCycle').
 * @returns {CircleAttributes[]} Array of parsed circle attributes.
 */
function getInlineCircles(html: string, attrName: string, attrValue: string): CircleAttributes[] {
    const regex = new RegExp(
        `${attrName}="${attrValue}"(?:(?!</svg>)[\\s\\S])*?<svg[^>]*>([\\s\\S]*?)</svg>`,
        "i",
    );
    const match = html.match(regex);
    expect(match, `Missing SVG for ${attrName}="${attrValue}"`).not.toBeNull();
    const svgInner = match ? match[1] : "";
    const circles: CircleAttributes[] = [];
    const circleRegex = /<circle[^>]*\bcx="([^"]+)"[^>]*\bcy="([^"]+)"[^>]*\br="([^"]+)"/g;
    let circleMatch: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex parsing loop
    while ((circleMatch = circleRegex.exec(svgInner)) !== null) {
        circles.push({
            cx: Number(circleMatch[1]),
            cy: Number(circleMatch[2]),
            r: Number(circleMatch[3]),
        });
    }
    expect(
        circles.length,
        `No circle elements found for ${attrName}="${attrValue}"`,
    ).toBeGreaterThan(0);
    return circles;
}

/**
 * Extracts circle element attributes and file content from a standalone SVG file.
 *
 * @param {string} rootDir - Workspace root directory.
 * @param {string} subfolder - Asset subfolder under public/images/.
 * @param {string} filename - Standalone SVG file name.
 * @returns {{ circles: CircleAttributes[]; fileContent: string }} Extracted circle attributes and file content.
 */
function getStandaloneCircles(
    rootDir: string,
    subfolder: string,
    filename: string,
): { circles: CircleAttributes[]; fileContent: string } {
    const filePath = resolve(rootDir, "public/images", subfolder, filename);
    const fileContent = readFileSync(filePath, "utf-8");
    const circles: CircleAttributes[] = [];
    const circleRegex = /<circle[^>]*\bcx="([^"]+)"[^>]*\bcy="([^"]+)"[^>]*\br="([^"]+)"/g;
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex parsing loop
    while ((match = circleRegex.exec(fileContent)) !== null) {
        circles.push({
            cx: Number(match[1]),
            cy: Number(match[2]),
            r: Number(match[3]),
        });
    }
    expect(circles.length, `No circles found in ${filename}`).toBeGreaterThan(0);
    return { circles, fileContent };
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

    const MIN_PATTERN_HEIGHT_SPAN = 23; // >= 71.875% of 32px viewport
    const MIN_WAVEFORM_HEIGHT_SPAN = 24; // 75% of 32px viewport

    it("verifies all path-based pattern direction icons in index.html utilize at least 71% viewport height (>= 23 units)", () => {
        for (const patternId of patternIds) {
            const pathD = getInlinePath(htmlContent, "data-pattern", patternId);
            assertMinimumHeightSpan(pathD, MIN_PATTERN_HEIGHT_SPAN, `Pattern "${patternId}"`);
        }
    });

    it("verifies all waveform icons in index.html utilize at least 75% viewport height (>= 24 units)", () => {
        for (const waveId of waveformIds) {
            const pathD = getInlinePath(htmlContent, "data-wave", waveId);
            assertMinimumHeightSpan(pathD, MIN_WAVEFORM_HEIGHT_SPAN, `Waveform "${waveId}"`);
        }
    });

    it("verifies every pattern direction and waveform icon has a unique visual path with zero duplicates", () => {
        const seenPaths = new Map<string, string>();
        const allPathIcons: Array<{
            id: string;
            attr: "data-pattern" | "data-wave";
            label: string;
        }> = [
            ...patternIds.map((id) => ({
                id,
                attr: "data-pattern" as const,
                label: `Pattern "${id}"`,
            })),
            ...waveformIds.map((id) => ({
                id,
                attr: "data-wave" as const,
                label: `Waveform "${id}"`,
            })),
        ];

        for (const { id, attr, label } of allPathIcons) {
            const pathD = getInlinePath(htmlContent, attr, id);
            const canonicalPath = canonicalizeResolvedGeometry(pathD);
            const duplicateOf = seenPaths.get(canonicalPath);
            expect(
                duplicateOf,
                `${label} has duplicate visual geometry of "${duplicateOf}": ${pathD}`,
            ).toBeUndefined();
            seenPaths.set(canonicalPath, label);
        }
    });

    it("canonicalizes equivalent relative and absolute geometry to identical representations", () => {
        expect(canonicalizeResolvedGeometry("M4 28 L28 4")).toBe(
            canonicalizeResolvedGeometry("M4 28 l24 -24"),
        );
        expect(canonicalizeResolvedGeometry("M3 28 H7")).toBe(
            canonicalizeResolvedGeometry("M3 28 L7 28"),
        );
        expect(canonicalizeResolvedGeometry("M4 4 V28")).toBe(
            canonicalizeResolvedGeometry("M4 4 L4 28"),
        );
        expect(canonicalizeResolvedGeometry("M4 28 L28 4")).toBe(
            canonicalizeResolvedGeometry("M28 4 L4 28"),
        );
        expect(canonicalizeResolvedGeometry("M3 18 Q 7 13 11 17 T 16 4")).toBe(
            canonicalizeResolvedGeometry("M3 18 Q 7 13 11 17 Q 15 21 16 4"),
        );
        expect(() => canonicalizeResolvedGeometry("M0 0 S 5 5 10 10")).toThrow(
            'Unhandled SVG command in canonicalizeResolvedGeometry: "S"',
        );
    });

    it("verifies all pattern direction icons adhere to left-to-right temporal progression", () => {
        for (const patternId of patternIds) {
            const pathD = getInlinePath(htmlContent, "data-pattern", patternId);
            const { xs } = extractPathPoints(pathD);
            expect(xs.length, `Expected X points for "${patternId}"`).toBeGreaterThan(1);
            expect(
                xs[0],
                `Pattern "${patternId}" should start on left and progress right (start ${xs[0]}, end ${xs[xs.length - 1]})`,
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

    it("verifies parity and theming between inline circle-based octave patterns and standalone SVG files", () => {
        const octaveMap: Record<string, string> = {
            octaveCycle: "pattern-direction-octaveCycle.svg",
            octaveCycleReverse: "pattern-direction-octaveCycleReversed.svg",
            octaveCyclePingPong: "pattern-direction-octaveCyclePingPong.svg",
        };

        for (const [patternId, filename] of Object.entries(octaveMap)) {
            const inlineCircles = getInlineCircles(htmlContent, "data-pattern", patternId);
            const { circles: standaloneCircles, fileContent } = getStandaloneCircles(
                rootDir,
                "patterns",
                filename,
            );

            expect(
                inlineCircles.length,
                `Circle count mismatch between inline and standalone ${filename}`,
            ).toBe(standaloneCircles.length);

            for (let i = 0; i < inlineCircles.length; i++) {
                expect(inlineCircles[i], `Circle at index ${i} mismatch in ${filename}`).toEqual(
                    standaloneCircles[i],
                );
            }

            expect(
                fileContent,
                `Standalone ${filename} must include :root color fallback styling`,
            ).toContain(":root { color: #38bdf8; }");
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
