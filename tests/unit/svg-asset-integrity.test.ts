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
 * Evaluates whether a cubic Bézier curve segment progresses monotonically forward in X without interior backtracking.
 *
 * @param {number} xs - Starting X coordinate.
 * @param {number} cp1x - First control point X coordinate.
 * @param {number} cp2x - Second control point X coordinate.
 * @param {number} xe - Ending X coordinate.
 * @returns {boolean} True if the X derivative B'(t) >= 0 across t in [0, 1].
 */
function isCubicMonotonicForwardX(xs: number, cp1x: number, cp2x: number, xe: number): boolean {
    if (xs > xe) return false;
    const a = 3 * (-xs + 3 * cp1x - 3 * cp2x + xe);
    const b = 6 * (xs - 2 * cp1x + cp2x);
    const c = 3 * (-xs + cp1x);
    if (c < 0 || a + b + c < 0) return false;
    const disc = b * b - 4 * a * c;
    if (disc > 0 && Math.abs(a) > 1e-9) {
        const tMin = -b / (2 * a);
        if (tMin > 0 && tMin < 1) {
            const minDeriv = a * tMin * tMin + b * tMin + c;
            if (minDeriv < -1e-6) return false;
        }
    }
    return true;
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
    const interior: number[] = [];
    const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
    const b = 6 * (p0 - 2 * p1 + p2);
    const c = 3 * (-p0 + p1);

    if (Math.abs(a) < 1e-9) {
        if (Math.abs(b) > 1e-9) {
            const t = -c / b;
            if (t > 0 && t < 1) interior.push(evaluateCubic(p0, p1, p2, p3, t));
        }
    } else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
            const sqrtDisc = Math.sqrt(disc);
            const t1 = (-b - sqrtDisc) / (2 * a);
            const t2 = (-b + sqrtDisc) / (2 * a);
            if (t1 > 0 && t1 < 1) interior.push(evaluateCubic(p0, p1, p2, p3, t1));
            if (t2 > 0 && t2 < 1) interior.push(evaluateCubic(p0, p1, p2, p3, t2));
        }
    }
    return [p0, ...interior, p3];
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
    const interior: number[] = [];
    const denom = p0 - 2 * p1 + p2;
    if (Math.abs(denom) > 1e-9) {
        const t = (p0 - p1) / denom;
        if (t > 0 && t < 1) {
            const oneMinusT = 1 - t;
            interior.push(oneMinusT * oneMinusT * p0 + 2 * oneMinusT * t * p1 + t * t * p2);
        }
    }
    return [p0, ...interior, p2];
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
    if (args.length === 0 || args.length % 2 !== 0) {
        throw new Error(
            `Invalid argument count (${args.length}) for command "${cmd}": expected positive multiple of 2`,
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
    if (args.length === 0) {
        throw new Error(
            `Invalid argument count (0) for command "${cmd}": expected at least 1 argument`,
        );
    }
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
    if (args.length === 0 || args.length % 6 !== 0) {
        throw new Error(
            `Invalid argument count (${args.length}) for cubic command "${cmd}": expected positive multiple of 6`,
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
        if (args.length === 0 || args.length % 4 !== 0) {
            throw new Error(
                `Invalid argument count (${args.length}) for quadratic command "${cmd}": expected positive multiple of 4`,
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
        if (args.length === 0 || args.length % 2 !== 0) {
            throw new Error(
                `Invalid argument count (${args.length}) for smooth quadratic command "${cmd}": expected positive multiple of 2`,
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
 * Validates that an SVG path string consists strictly of legal SVG commands, numbers, and separators.
 * Throws an error if any illegal token, stray character, or unconsumed input is encountered.
 *
 * @param {string} pathD - SVG path definition string.
 * @returns {void}
 */
function validateSvgPathSyntax(pathD: string): void {
    const trimmed = pathD.trim();
    if (!trimmed) {
        throw new Error("SVG path is empty");
    }
    const regex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    const firstMatch = regex.exec(pathD);
    if (!firstMatch) {
        throw new Error(`Invalid SVG path: no valid commands found in "${pathD}"`);
    }
    const leading = pathD.slice(0, firstMatch.index).replace(/[\s,]/g, "");
    if (leading.length > 0) {
        throw new Error(`Invalid leading token(s) "${leading}" in SVG path: "${pathD}"`);
    }

    const firstCmd = firstMatch[1];
    if (firstCmd !== "M" && firstCmd !== "m") {
        throw new Error(
            `Invalid SVG path: path must begin with a "moveto" command ("M" or "m"), but found "${firstCmd}" in "${pathD}"`,
        );
    }

    regex.lastIndex = 0;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex parsing loop
    while ((match = regex.exec(pathD)) !== null) {
        if (match.index > lastIndex) {
            const gap = pathD.slice(lastIndex, match.index).replace(/[\s,]/g, "");
            if (gap.length > 0) {
                throw new Error(
                    `Invalid token(s) "${gap}" before command "${match[1]}" in path: "${pathD}"`,
                );
            }
        }
        const cmd = match[1];
        const rawArgs = match[2];
        if (cmd !== "Z" && cmd !== "z") {
            const trimmedArgs = rawArgs.trim();
            if (trimmedArgs.length === 0) {
                throw new Error(
                    `Invalid SVG command "${cmd}": missing required arguments in path: "${pathD}"`,
                );
            }
        }
        const stripped = rawArgs
            .replace(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g, "")
            .replace(/[\s,]/g, "");
        if (stripped.length > 0) {
            throw new Error(
                `Invalid token(s) "${stripped}" in SVG command "${cmd}${rawArgs}" in path: "${pathD}"`,
            );
        }
        lastIndex = regex.lastIndex;
    }

    const trailing = pathD.slice(lastIndex).replace(/[\s,]/g, "");
    if (trailing.length > 0) {
        throw new Error(`Invalid trailing token(s) "${trailing}" in SVG path: "${pathD}"`);
    }
}

/**
 * Extracts all absolute and resolved relative numeric X and Y coordinate values from an SVG path string in a single pass.
 *
 * @param {string} pathD - SVG path definition string.
 * @returns {PathPoints} Object containing arrays of resolved X and Y coordinates.
 */
function extractPathPoints(pathD: string): PathPoints {
    validateSvgPathSyntax(pathD);
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
 * Parsed SVG viewBox rectangle.
 */
interface ViewBoxRect {
    minX: number;
    minY: number;
    width: number;
    height: number;
}

/**
 * Extracted presentation and geometry attributes for an inline SVG path element.
 */
interface InlinePathElement {
    d: string;
    strokeLinecap: string;
    strokeLinejoin: string;
}

/**
 * Result container for extracted inline SVG path data, viewBox geometry, and presentation attributes.
 */
interface InlinePathData {
    d: string;
    viewBox: ViewBoxRect;
    svgFill: string;
    svgClass: string;
    paths: InlinePathElement[];
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
 * Result container for extracted inline SVG circle data and viewBox geometry.
 */
interface InlineCircleData {
    circles: CircleAttributes[];
    viewBox: ViewBoxRect;
}

/**
 * Strips HTML and XML comment blocks from source markup to prevent commented-out elements from being matched as active geometry.
 * Uses an iterative loop until all comment delimiters are removed to prevent incomplete sanitization or nested comment bypasses.
 *
 * @param {string} source - Raw markup string.
 * @returns {string} Markup string with all comment blocks removed.
 */
function stripComments(source: string): string {
    let sanitized = source;
    while (sanitized.includes("<!--")) {
        const next = sanitized.replace(/<!--(?:(?!<!--)[\s\S])*?-->/g, "");
        if (next === sanitized) {
            break;
        }
        sanitized = next;
    }
    return sanitized;
}

/**
 * Helper to retrieve an inline SVG path string, viewBox, and presentation attributes from index.html markup.
 *
 * @param {string} html - Raw HTML source content.
 * @param {string} attrName - Target attribute name (e.g. 'data-pattern', 'data-wave').
 * @param {string} attrValue - Attribute value to match.
 * @returns {InlinePathData} The path 'd' string, parsed viewBox, and presentation attributes.
 */
function getInlinePath(html: string, attrName: string, attrValue: string): InlinePathData {
    const cleanHtml = stripComments(html);
    const regex = new RegExp(
        `${attrName}="${attrValue}"(?:(?!</svg>)[\\s\\S])*?<svg([^>]*)>([\\s\\S]*?)</svg>`,
        "i",
    );
    const match = cleanHtml.match(regex);
    expect(match, `Missing SVG for ${attrName}="${attrValue}"`).not.toBeNull();
    const svgAttrs = match ? match[1] : "";
    const svgInner = match ? match[2] : "";

    expect(
        svgAttrs,
        `Inline SVG for ${attrName}="${attrValue}" must not declare transform attributes`,
    ).not.toMatch(/\btransform\s*=/);

    const viewBoxMatch = svgAttrs.match(/\bviewBox="([^"]+)"/);
    expect(viewBoxMatch, `Missing viewBox in ${attrName}="${attrValue}"`).not.toBeNull();
    const viewBoxNumbers = (viewBoxMatch ? viewBoxMatch[1] : "").trim().split(/\s+/).map(Number);
    expect(viewBoxNumbers.length, `Invalid viewBox in ${attrName}="${attrValue}"`).toBe(4);
    expect(
        viewBoxNumbers,
        `Inline SVG viewBox must be "0 0 32 32" for ${attrName}="${attrValue}"`,
    ).toEqual([0, 0, 32, 32]);

    const fillMatch = svgAttrs.match(/\bfill="([^"]+)"/);
    expect(
        fillMatch ? fillMatch[1] : "",
        `Inline SVG for ${attrName}="${attrValue}" must declare fill="none"`,
    ).toBe("none");

    const classMatch = svgAttrs.match(/\bclass="([^"]+)"/);
    expect(
        classMatch ? classMatch[1] : "",
        `Inline SVG for ${attrName}="${attrValue}" must declare stroke-current class`,
    ).toContain("stroke-current");

    const pathMatches = [...svgInner.matchAll(/<path\b([^>]*)\/?>/g)];
    expect(
        pathMatches.length,
        `Missing <path> in SVG for ${attrName}="${attrValue}"`,
    ).toBeGreaterThan(0);

    const paths: InlinePathElement[] = [];
    for (const pm of pathMatches) {
        const attrs = pm[1];
        expect(
            attrs,
            `Inline <path> in ${attrName}="${attrValue}" must not declare transform attributes`,
        ).not.toMatch(/\btransform\s*=/);
        const dMatch = attrs.match(/\bd="([^"]+)"/);
        expect(
            dMatch,
            `Missing d attribute in <path> for ${attrName}="${attrValue}"`,
        ).not.toBeNull();
        const capMatch = attrs.match(/\bstroke-linecap="([^"]+)"/);
        const joinMatch = attrs.match(/\bstroke-linejoin="([^"]+)"/);
        expect(
            capMatch ? capMatch[1] : "",
            `Inline <path> in ${attrName}="${attrValue}" must declare stroke-linecap="round"`,
        ).toBe("round");
        expect(
            joinMatch ? joinMatch[1] : "",
            `Inline <path> in ${attrName}="${attrValue}" must declare stroke-linejoin="round"`,
        ).toBe("round");
        paths.push({
            d: dMatch ? dMatch[1].trim() : "",
            strokeLinecap: capMatch ? capMatch[1] : "",
            strokeLinejoin: joinMatch ? joinMatch[1] : "",
        });
    }

    return {
        d: paths.map((p) => p.d).join(" "),
        viewBox: {
            minX: viewBoxNumbers[0],
            minY: viewBoxNumbers[1],
            width: viewBoxNumbers[2],
            height: viewBoxNumbers[3],
        },
        svgFill: fillMatch ? fillMatch[1] : "",
        svgClass: classMatch ? classMatch[1] : "",
        paths,
    };
}

/**
 * Asserts that an SVG path spans a minimum vertical height within its viewport viewBox and does not clip outside.
 *
 * @param {string} pathD - Path definition string.
 * @param {ViewBoxRect} viewBox - Parsed SVG viewBox rectangle.
 * @param {number} minSpan - Expected minimum vertical span in units.
 * @param {string} label - Context label for descriptive assertion failures.
 * @returns {void}
 */
function assertMinimumHeightSpan(
    pathD: string,
    viewBox: ViewBoxRect,
    minSpan: number,
    label: string,
): void {
    expect(viewBox.minX, `${label} SVG viewBox minX must be 0`).toBe(0);
    expect(viewBox.minY, `${label} SVG viewBox minY must be 0`).toBe(0);
    expect(viewBox.width, `${label} SVG viewBox width must be 32 units`).toBe(32);
    expect(viewBox.height, `${label} SVG viewBox height must be 32 units`).toBe(32);

    const { xs, ys } = extractPathPoints(pathD);
    expect(ys.length, `No Y coordinates parsed for ${label}`).toBeGreaterThan(0);
    expect(xs.length, `No X coordinates parsed for ${label}`).toBeGreaterThan(0);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);

    // Half of the 2-unit stroke width with round caps/joins (extends 1 unit beyond centerline)
    const halfStroke = 1;

    expect(
        minY - halfStroke,
        `${label} stroke minY (${minY - halfStroke}) clips above viewBox minY (${viewBox.minY})`,
    ).toBeGreaterThanOrEqual(viewBox.minY);
    expect(
        maxY + halfStroke,
        `${label} stroke maxY (${maxY + halfStroke}) clips below viewBox maxY (${viewBox.minY + viewBox.height})`,
    ).toBeLessThanOrEqual(viewBox.minY + viewBox.height);
    expect(
        minX - halfStroke,
        `${label} stroke minX (${minX - halfStroke}) clips left of viewBox minX (${viewBox.minX})`,
    ).toBeGreaterThanOrEqual(viewBox.minX);
    expect(
        maxX + halfStroke,
        `${label} stroke maxX (${maxX + halfStroke}) clips right of viewBox maxX (${viewBox.minX + viewBox.width})`,
    ).toBeLessThanOrEqual(viewBox.minX + viewBox.width);

    const span = maxY - minY;
    const heightRatio = span / viewBox.height;
    const minRatio = minSpan / viewBox.height;
    expect(
        span,
        `${label} vertical span (${span} units, ${(heightRatio * 100).toFixed(1)}%) is less than ${minSpan} units (${(minRatio * 100).toFixed(1)}%) of viewBox height ${viewBox.height} (${minY} to ${maxY})`,
    ).toBeGreaterThanOrEqual(minSpan);
}

/**
 * Asserts that styles/components.css defines the standard 2-unit stroke width rule for all inline button SVGs
 * (.waveform-btn svg, .pattern-btn svg, .octave-btn svg), verifying that each selector resolves to 2
 * in cascade order and that no subsequent rule overrides the stroke width.
 *
 * @param {string} rootDir - Workspace root directory.
 * @param {string} [cssContentOverride] - Optional CSS content override for testing assertion behavior.
 * @returns {void}
 */
function assertStylesheetStrokeWidthParity(rootDir: string, cssContentOverride?: string): void {
    const cssContent =
        cssContentOverride !== undefined
            ? stripComments(cssContentOverride)
            : stripComments(readFileSync(resolve(rootDir, "styles/components.css"), "utf-8"));

    const requiredSelectors = [".waveform-btn svg", ".pattern-btn svg", ".octave-btn svg"];
    const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
    let match: RegExpExecArray | null;

    const declarationsPerSelector = new Map<string, string[]>();
    for (const sel of requiredSelectors) {
        declarationsPerSelector.set(sel, []);
    }

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex parsing loop
    while ((match = ruleRegex.exec(cssContent)) !== null) {
        const rawSelectors = match[1].split(",").map((s) => s.trim().replace(/\s+/g, " "));
        const declarations = match[2];
        const strokeWidthMatch = declarations.match(/\bstroke-width:\s*([^;]+)/);
        if (strokeWidthMatch) {
            const widthVal = strokeWidthMatch[1].trim();
            for (const target of requiredSelectors) {
                if (rawSelectors.some((s) => s === target || s.endsWith(` ${target}`))) {
                    declarationsPerSelector.get(target)?.push(widthVal);
                }
            }
        }
    }

    for (const target of requiredSelectors) {
        const widths = declarationsPerSelector.get(target) ?? [];
        expect(
            widths.length,
            `Missing stroke-width declaration in styles/components.css for selector "${target}"`,
        ).toBeGreaterThan(0);

        const effectiveWidth = Number.parseInt(widths[widths.length - 1], 10);
        expect(
            effectiveWidth,
            `Effective stroke-width for "${target}" in styles/components.css must be 2, but resolved to ${widths[widths.length - 1]}`,
        ).toBe(2);
    }
}

/**
 * Asserts parity between an inline HTML SVG path and its standalone SVG asset file across geometry and presentation attributes.
 *
 * @param {string} rootDir - Workspace root directory.
 * @param {InlinePathData} inlineData - Extracted inline path and presentation data.
 * @param {string} subfolder - Asset subfolder under public/images/ ('patterns' or 'waveforms').
 * @param {string} filename - Standalone file name.
 * @param {string} [rawContentOverride] - Optional standalone SVG file content override for testing.
 * @returns {void}
 */
function assertStandaloneParity(
    rootDir: string,
    inlineData: InlinePathData,
    subfolder: string,
    filename: string,
    rawContentOverride?: string,
): void {
    assertStylesheetStrokeWidthParity(rootDir);
    const filePath = resolve(rootDir, "public/images", subfolder, filename);
    const fileContent = stripComments(rawContentOverride ?? readFileSync(filePath, "utf-8"));
    const viewBoxMatch = fileContent.match(/viewBox="([^"]+)"/);
    expect(viewBoxMatch, `Standalone file ${filename} missing viewBox`).not.toBeNull();
    expect(
        viewBoxMatch ? viewBoxMatch[1].trim() : "",
        `Standalone file ${filename} viewBox must be "0 0 32 32"`,
    ).toBe("0 0 32 32");

    expect(
        inlineData.viewBox,
        `Inline viewBox for ${filename} must match standalone 0 0 32 32`,
    ).toEqual({ minX: 0, minY: 0, width: 32, height: 32 });

    const svgTagMatch = fileContent.match(/<svg\b([^>]*)>/);
    expect(svgTagMatch, `Standalone file ${filename} missing <svg> element`).not.toBeNull();
    const svgAttrs = svgTagMatch ? svgTagMatch[1] : "";
    expect(
        svgAttrs,
        `Standalone ${filename} <svg> must not declare transform attributes`,
    ).not.toMatch(/\btransform\s*=/);
    const svgFillMatch = svgAttrs.match(/\bfill="([^"]+)"/);
    expect(
        svgFillMatch ? svgFillMatch[1] : "",
        `Standalone ${filename} <svg> must declare fill="none"`,
    ).toBe("none");
    expect(inlineData.svgFill, `Inline SVG for ${filename} must declare fill="none"`).toBe("none");
    expect(
        inlineData.svgClass,
        `Inline SVG for ${filename} must declare stroke-current class for theming parity`,
    ).toContain("stroke-current");

    const pathMatches = [...fileContent.matchAll(/<path\b([^>]*)\/?>/g)];
    expect(
        pathMatches.length,
        `Standalone file ${filename} must contain at least one <path>`,
    ).toBeGreaterThan(0);

    expect(
        pathMatches.length,
        `Path element count mismatch between inline (${inlineData.paths.length}) and standalone (${pathMatches.length}) for ${filename}`,
    ).toBe(inlineData.paths.length);

    const standalonePath = pathMatches
        .map((m) => {
            const dMatch = m[1].match(/\bd="([^"]+)"/);
            expect(dMatch, `Standalone file ${filename} path missing d attribute`).not.toBeNull();
            return dMatch ? dMatch[1].trim() : "";
        })
        .join(" ");

    expect(inlineData.d, `Mismatch between inline HTML and standalone ${filename}`).toBe(
        standalonePath,
    );

    for (const [index, match] of pathMatches.entries()) {
        const attrs = match[1];
        expect(
            attrs,
            `Standalone ${filename} <path> must not declare transform attributes`,
        ).not.toMatch(/\btransform\s*=/);
        expect(attrs, `Standalone ${filename} <path> missing stroke="currentColor"`).toContain(
            'stroke="currentColor"',
        );
        expect(attrs, `Standalone ${filename} <path> missing stroke-width="2"`).toContain(
            'stroke-width="2"',
        );
        expect(attrs, `Standalone ${filename} <path> missing fill="none"`).toContain('fill="none"');
        expect(attrs, `Standalone ${filename} <path> missing stroke-linecap="round"`).toContain(
            'stroke-linecap="round"',
        );
        expect(attrs, `Standalone ${filename} <path> missing stroke-linejoin="round"`).toContain(
            'stroke-linejoin="round"',
        );

        const inlinePath = inlineData.paths[index];
        expect(
            inlinePath.strokeLinecap,
            `Inline ${filename} path ${index + 1} stroke-linecap must match standalone "round"`,
        ).toBe("round");
        expect(
            inlinePath.strokeLinejoin,
            `Inline ${filename} path ${index + 1} stroke-linejoin must match standalone "round"`,
        ).toBe("round");
    }

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
 * Collapses consecutive collinear line segments within a subpath to eliminate redundant intermediate waypoints.
 *
 * @param {CanonicalSegment[]} segments - Raw segments of a subpath.
 * @returns {CanonicalSegment[]} Normalized segments with consecutive collinear lines merged.
 */
function collapseCollinearSegments(segments: CanonicalSegment[]): CanonicalSegment[] {
    if (segments.length <= 1) return segments;
    const result: CanonicalSegment[] = [];

    for (const seg of segments) {
        if (result.length === 0) {
            result.push({ ...seg });
            continue;
        }

        const prev = result[result.length - 1];
        if (prev.type === "L" && seg.type === "L") {
            const dx1 = prev.xe - prev.xs;
            const dy1 = prev.ye - prev.ys;
            const dx2 = seg.xe - seg.xs;
            const dy2 = seg.ye - seg.ys;

            // Skip zero-length segment
            if (Math.abs(dx2) < 1e-9 && Math.abs(dy2) < 1e-9) {
                continue;
            }
            if (Math.abs(dx1) < 1e-9 && Math.abs(dy1) < 1e-9) {
                result[result.length - 1] = { ...seg };
                continue;
            }

            // Collinear if cross product is 0 and dot product > 0 (same direction)
            const cross = dx1 * dy2 - dy1 * dx2;
            const dot = dx1 * dx2 + dy1 * dy2;
            if (Math.abs(cross) < 1e-9 && dot > 0) {
                prev.xe = seg.xe;
                prev.ye = seg.ye;
                continue;
            }
        }
        result.push({ ...seg });
    }
    return result;
}

/**
 * Parses an SVG path definition into canonical subpaths with resolved absolute coordinates, expanded curves, and collapsed collinear segments.
 *
 * @param {string} pathD - Raw SVG path string.
 * @returns {CanonicalSubpath[]} Array of parsed and normalized canonical subpaths.
 */
function parseCanonicalSubpaths(pathD: string): CanonicalSubpath[] {
    validateSvgPathSyntax(pathD);
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
                if (args.length % 2 !== 0) {
                    throw new Error(
                        `Odd argument count (${args.length}) for command "M": ${args.join(" ")}`,
                    );
                }
                if (args.length >= 2) {
                    curX = args[0];
                    curY = args[1];
                    currentSubpath = { startX: curX, startY: curY, segments: [] };
                    subpaths.push(currentSubpath);
                    lastQuadCp = null;
                    for (let i = 2; i < args.length; i += 2) {
                        const endX = args[i];
                        const endY = args[i + 1];
                        currentSubpath.segments.push({
                            type: "L",
                            xs: curX,
                            ys: curY,
                            xe: endX,
                            ye: endY,
                        });
                        curX = endX;
                        curY = endY;
                    }
                }
                break;
            case "m":
                if (args.length % 2 !== 0) {
                    throw new Error(
                        `Odd argument count (${args.length}) for command "m": ${args.join(" ")}`,
                    );
                }
                if (args.length >= 2) {
                    curX += args[0];
                    curY += args[1];
                    currentSubpath = { startX: curX, startY: curY, segments: [] };
                    subpaths.push(currentSubpath);
                    lastQuadCp = null;
                    for (let i = 2; i < args.length; i += 2) {
                        const endX = curX + args[i];
                        const endY = curY + args[i + 1];
                        currentSubpath.segments.push({
                            type: "L",
                            xs: curX,
                            ys: curY,
                            xe: endX,
                            ye: endY,
                        });
                        curX = endX;
                        curY = endY;
                    }
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
                throw new Error(`Unhandled SVG command in parseCanonicalSubpaths: "${cmd}"`);
        }
    }

    for (const sp of subpaths) {
        sp.segments = collapseCollinearSegments(sp.segments);
    }
    return subpaths;
}

/**
 * Canonicalizes an SVG path definition into absolute geometry commands for equivalence comparisons.
 * Resolves all relative commands (m, l, h, v, c, q, t) to absolute commands (M, L, C, Q),
 * normalizes horizontal/vertical lines (H, V) to canonical line segments (L),
 * expands smooth quadratic curves (T, t) to explicit quadratic Bézier commands (Q) with reflected control points,
 * merges consecutive collinear line segments, and normalizes traversal direction so forward and reversed identical strokes yield identical keys.
 *
 * @param {string} pathD - Raw SVG path string.
 * @returns {string} Canonicalized path string with resolved absolute coordinates, expanded curves, and traversal normalization.
 */
function canonicalizeResolvedGeometry(pathD: string): string {
    const subpaths = parseCanonicalSubpaths(pathD);
    const canonicalSubpaths = subpaths.map((sp) => {
        const forward = serializeSubpathForward(sp);
        const reversed = serializeSubpathReversed(sp);
        return forward <= reversed ? forward : reversed;
    });

    canonicalSubpaths.sort();
    return canonicalSubpaths.join(" ");
}

/**
 * Canonicalizes a collection of circle elements into a deterministic sorted string representation.
 *
 * @param {CircleAttributes[]} circles - Array of circle attribute objects.
 * @returns {string} Deterministic geometry key for circle-based glyph visual equivalence checks.
 */
function canonicalizeCircleGeometry(circles: CircleAttributes[]): string {
    const sorted = [...circles].sort((a, b) => {
        if (a.cx !== b.cx) return a.cx - b.cx;
        if (a.cy !== b.cy) return a.cy - b.cy;
        return a.r - b.r;
    });
    return sorted.map((c) => `circle(cx=${c.cx},cy=${c.cy},r=${c.r})`).join(" ");
}

/**
 * Extracts circle element attributes and viewBox geometry from an inline SVG pattern button in the HTML source.
 *
 * @param {string} html - Raw HTML source content.
 * @param {string} attrName - Attribute name matching the button (e.g. 'data-pattern').
 * @param {string} attrValue - Target attribute value (e.g. 'octaveCycle').
 * @returns {InlineCircleData} Parsed circle attributes and viewBox geometry.
 */
function getInlineCircles(html: string, attrName: string, attrValue: string): InlineCircleData {
    const cleanHtml = stripComments(html);
    const regex = new RegExp(
        `${attrName}="${attrValue}"(?:(?!</svg>)[\\s\\S])*?<svg([^>]*)>([\\s\\S]*?)</svg>`,
        "i",
    );
    const match = cleanHtml.match(regex);
    expect(match, `Missing SVG for ${attrName}="${attrValue}"`).not.toBeNull();
    const svgAttrs = match ? match[1] : "";
    expect(
        svgAttrs,
        `Inline circle SVG for ${attrName}="${attrValue}" must not declare transform attributes`,
    ).not.toMatch(/\btransform\s*=/);
    const viewBoxMatch = svgAttrs.match(/\bviewBox="([^"]+)"/);
    expect(viewBoxMatch, `Missing viewBox in ${attrName}="${attrValue}"`).not.toBeNull();
    const viewBoxNumbers = (viewBoxMatch ? viewBoxMatch[1] : "").trim().split(/\s+/).map(Number);
    expect(viewBoxNumbers.length, `Invalid viewBox in ${attrName}="${attrValue}"`).toBe(4);
    expect(
        viewBoxNumbers,
        `Inline circle SVG viewBox must be "0 0 32 32" for ${attrName}="${attrValue}"`,
    ).toEqual([0, 0, 32, 32]);

    const fillMatch = svgAttrs.match(/\bfill="([^"]+)"/);
    expect(
        fillMatch ? fillMatch[1] : "",
        `Inline circle SVG for ${attrName}="${attrValue}" must declare fill="none"`,
    ).toBe("none");

    const classMatch = svgAttrs.match(/\bclass="([^"]+)"/);
    expect(
        classMatch ? classMatch[1] : "",
        `Inline circle SVG for ${attrName}="${attrValue}" must declare stroke-current class`,
    ).toContain("stroke-current");

    const svgInner = match ? match[2] : "";
    const circles: CircleAttributes[] = [];
    const circleRegex = /<circle\b([^>]*)\/?>/g;
    let circleMatch: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex parsing loop
    while ((circleMatch = circleRegex.exec(svgInner)) !== null) {
        const attrs = circleMatch[1];
        expect(
            attrs,
            `Inline <circle> in ${attrName}="${attrValue}" must not declare transform attributes`,
        ).not.toMatch(/\btransform\s*=/);
        const cxMatch = attrs.match(/\bcx="([^"]+)"/);
        const cyMatch = attrs.match(/\bcy="([^"]+)"/);
        const rMatch = attrs.match(/\br="([^"]+)"/);
        const circleFillMatch = attrs.match(/\bfill="([^"]+)"/);
        expect(
            cxMatch && cyMatch && rMatch,
            `Malformed <circle> in ${attrName}="${attrValue}"`,
        ).toBeTruthy();
        expect(
            circleFillMatch ? circleFillMatch[1] : "",
            `Inline <circle> in ${attrName}="${attrValue}" must declare fill="var(--ui-accent-soft)"`,
        ).toBe("var(--ui-accent-soft)");
        circles.push({
            cx: Number(cxMatch ? cxMatch[1] : 0),
            cy: Number(cyMatch ? cyMatch[1] : 0),
            r: Number(rMatch ? rMatch[1] : 0),
        });
    }
    expect(
        circles.length,
        `No circle elements found for ${attrName}="${attrValue}"`,
    ).toBeGreaterThan(0);
    return {
        circles,
        viewBox: {
            minX: viewBoxNumbers[0],
            minY: viewBoxNumbers[1],
            width: viewBoxNumbers[2],
            height: viewBoxNumbers[3],
        },
    };
}

/**
 * Extracts circle element attributes, viewBox geometry, and file content from a standalone SVG file.
 *
 * @param {string} rootDir - Workspace root directory.
 * @param {string} subfolder - Asset subfolder under public/images/.
 * @param {string} filename - Standalone SVG file name.
 * @param {string} [rawContentOverride] - Optional standalone SVG file content override for testing.
 * @returns {{ circles: CircleAttributes[]; fileContent: string; viewBox: ViewBoxRect }} Extracted circle attributes, file content, and viewBox.
 */
function getStandaloneCircles(
    rootDir: string,
    subfolder: string,
    filename: string,
    rawContentOverride?: string,
): { circles: CircleAttributes[]; fileContent: string; viewBox: ViewBoxRect } {
    const filePath = resolve(rootDir, "public/images", subfolder, filename);
    const fileContent = stripComments(rawContentOverride ?? readFileSync(filePath, "utf-8"));
    const viewBoxMatch = fileContent.match(/viewBox="([^"]+)"/);
    expect(viewBoxMatch, `Standalone file ${filename} missing viewBox`).not.toBeNull();
    const viewBoxNumbers = (viewBoxMatch ? viewBoxMatch[1] : "").trim().split(/\s+/).map(Number);
    expect(viewBoxNumbers.length, `Invalid viewBox in standalone ${filename}`).toBe(4);
    expect(viewBoxNumbers, `Standalone file ${filename} viewBox must be "0 0 32 32"`).toEqual([
        0, 0, 32, 32,
    ]);

    const svgTagMatch = fileContent.match(/<svg\b([^>]*)>/);
    expect(svgTagMatch, `Standalone file ${filename} missing <svg> element`).not.toBeNull();
    const svgAttrs = svgTagMatch ? svgTagMatch[1] : "";
    expect(
        svgAttrs,
        `Standalone ${filename} <svg> must not declare transform attributes`,
    ).not.toMatch(/\btransform\s*=/);
    const svgFillMatch = svgAttrs.match(/\bfill="([^"]+)"/);
    expect(
        svgFillMatch ? svgFillMatch[1] : "",
        `Standalone ${filename} <svg> must declare fill="none"`,
    ).toBe("none");

    const circles: CircleAttributes[] = [];
    const circleRegex = /<circle\b([^>]*)\/?>/g;
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex parsing loop
    while ((match = circleRegex.exec(fileContent)) !== null) {
        const attrs = match[1];
        expect(
            attrs,
            `Standalone ${filename} <circle> must not declare transform attributes`,
        ).not.toMatch(/\btransform\s*=/);
        const cxMatch = attrs.match(/\bcx="([^"]+)"/);
        const cyMatch = attrs.match(/\bcy="([^"]+)"/);
        const rMatch = attrs.match(/\br="([^"]+)"/);
        expect(cxMatch && cyMatch && rMatch, `Malformed <circle> in ${filename}`).toBeTruthy();
        expect(attrs, `Standalone ${filename} <circle> missing fill="currentColor"`).toContain(
            'fill="currentColor"',
        );
        circles.push({
            cx: Number(cxMatch ? cxMatch[1] : 0),
            cy: Number(cyMatch ? cyMatch[1] : 0),
            r: Number(rMatch ? rMatch[1] : 0),
        });
    }
    expect(circles.length, `No circles found in ${filename}`).toBeGreaterThan(0);
    return {
        circles,
        fileContent,
        viewBox: {
            minX: viewBoxNumbers[0],
            minY: viewBoxNumbers[1],
            width: viewBoxNumbers[2],
            height: viewBoxNumbers[3],
        },
    };
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
    const MIN_CIRCLE_PATTERN_HEIGHT_SPAN = 21; // >= 65.625% of 32px viewport

    it("verifies all path-based pattern direction icons in index.html utilize at least 71% viewport height (>= 23 units)", () => {
        for (const patternId of patternIds) {
            const { d: pathD, viewBox } = getInlinePath(htmlContent, "data-pattern", patternId);
            assertMinimumHeightSpan(
                pathD,
                viewBox,
                MIN_PATTERN_HEIGHT_SPAN,
                `Pattern "${patternId}"`,
            );
        }
    });

    it("verifies all circle-based octave pattern icons in index.html utilize at least 65% viewport height (>= 21 units)", () => {
        const octaveIds = ["octaveCycle", "octaveCycleReverse", "octaveCyclePingPong"];
        for (const id of octaveIds) {
            const { circles, viewBox } = getInlineCircles(htmlContent, "data-pattern", id);
            expect(viewBox.minX, `Octave "${id}" viewBox minX must be 0`).toBe(0);
            expect(viewBox.minY, `Octave "${id}" viewBox minY must be 0`).toBe(0);
            expect(viewBox.width, `Octave "${id}" viewBox width must be 32`).toBe(32);
            expect(viewBox.height, `Octave "${id}" viewBox height must be 32`).toBe(32);
            const minY = Math.min(...circles.map((c) => c.cy - c.r));
            const maxY = Math.max(...circles.map((c) => c.cy + c.r));
            const minX = Math.min(...circles.map((c) => c.cx - c.r));
            const maxX = Math.max(...circles.map((c) => c.cx + c.r));

            expect(
                minY,
                `Octave "${id}" circle geometry minY (${minY}) clips above viewBox minY (${viewBox.minY})`,
            ).toBeGreaterThanOrEqual(viewBox.minY);
            expect(
                maxY,
                `Octave "${id}" circle geometry maxY (${maxY}) clips below viewBox maxY (${viewBox.minY + viewBox.height})`,
            ).toBeLessThanOrEqual(viewBox.minY + viewBox.height);
            expect(
                minX,
                `Octave "${id}" circle geometry minX (${minX}) clips left of viewBox minX (${viewBox.minX})`,
            ).toBeGreaterThanOrEqual(viewBox.minX);
            expect(
                maxX,
                `Octave "${id}" circle geometry maxX (${maxX}) clips right of viewBox maxX (${viewBox.minX + viewBox.width})`,
            ).toBeLessThanOrEqual(viewBox.minX + viewBox.width);

            const span = maxY - minY;
            const heightRatio = span / viewBox.height;
            const minRatio = MIN_CIRCLE_PATTERN_HEIGHT_SPAN / viewBox.height;
            expect(
                span,
                `Octave "${id}" vertical span (${span} units, ${(heightRatio * 100).toFixed(1)}%) is less than ${MIN_CIRCLE_PATTERN_HEIGHT_SPAN} units (${(minRatio * 100).toFixed(1)}%) of viewBox height ${viewBox.height} (${minY} to ${maxY})`,
            ).toBeGreaterThanOrEqual(MIN_CIRCLE_PATTERN_HEIGHT_SPAN);
        }
    });

    it("verifies all waveform icons in index.html utilize at least 75% viewport height (>= 24 units)", () => {
        for (const waveId of waveformIds) {
            const { d: pathD, viewBox } = getInlinePath(htmlContent, "data-wave", waveId);
            assertMinimumHeightSpan(
                pathD,
                viewBox,
                MIN_WAVEFORM_HEIGHT_SPAN,
                `Waveform "${waveId}"`,
            );
        }
    });

    it("verifies every pattern direction and waveform icon has a unique visual representation with zero duplicates", () => {
        const seenRepresentations = new Map<string, string>();
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
            const { d: pathD } = getInlinePath(htmlContent, attr, id);
            const canonicalPath = canonicalizeResolvedGeometry(pathD);
            const duplicateOf = seenRepresentations.get(canonicalPath);
            expect(
                duplicateOf,
                `${label} has duplicate visual geometry of "${duplicateOf}": ${pathD}`,
            ).toBeUndefined();
            seenRepresentations.set(canonicalPath, label);
        }

        const octaveCircleIds = ["octaveCycle", "octaveCycleReverse", "octaveCyclePingPong"];
        for (const id of octaveCircleIds) {
            const { circles } = getInlineCircles(htmlContent, "data-pattern", id);
            const canonicalCircles = canonicalizeCircleGeometry(circles);
            const label = `Pattern "${id}" (circle-based)`;
            const duplicateOf = seenRepresentations.get(canonicalCircles);
            expect(
                duplicateOf,
                `${label} has duplicate visual geometry of "${duplicateOf}"`,
            ).toBeUndefined();
            seenRepresentations.set(canonicalCircles, label);
        }
    });

    it("canonicalizes equivalent relative and absolute geometry to identical representations", () => {
        expect(canonicalizeResolvedGeometry("M4 28 L28 4")).toBe(
            canonicalizeResolvedGeometry("M4 28 l24 -24"),
        );
        expect(canonicalizeResolvedGeometry("M4 28 28 4")).toBe(
            canonicalizeResolvedGeometry("M4 28 L28 4"),
        );
        expect(canonicalizeResolvedGeometry("m4 28 24 -24")).toBe(
            canonicalizeResolvedGeometry("M4 28 L28 4"),
        );
        expect(canonicalizeResolvedGeometry("M4 28 L16 16 L28 4")).toBe(
            canonicalizeResolvedGeometry("M4 28 L28 4"),
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
            'Unhandled SVG command in parseCanonicalSubpaths: "S"',
        );
    });

    it("strictly validates SVG path command syntax and rejects unconsumed input or invalid tokens", () => {
        expect(() => extractPathPoints("")).toThrow("SVG path is empty");
        expect(() => extractPathPoints("   ")).toThrow("SVG path is empty");
        expect(() => extractPathPoints("999")).toThrow(
            'Invalid SVG path: no valid commands found in "999"',
        );
        expect(() => extractPathPoints("invalid")).toThrow(
            'Invalid leading token(s) "in" in SVG path: "invalid"',
        );
        expect(() => extractPathPoints("X M4 28 L28 4")).toThrow(
            'Invalid leading token(s) "X" in SVG path',
        );
        expect(() => extractPathPoints("M4 28 X L28 4")).toThrow(
            'Invalid token(s) "X" in SVG command "M4 28 X " in path',
        );
        expect(() => extractPathPoints("M4 28 L28 4 Y")).toThrow(
            'Invalid token(s) "Y" in SVG command "L28 4 Y" in path',
        );
        expect(() => extractPathPoints("M4 28foo L28 4")).toThrow(
            'Invalid token(s) "foo" in SVG command "M4 28foo " in path',
        );

        expect(() => parseCanonicalSubpaths("M4 28 X L28 4")).toThrow(
            'Invalid token(s) "X" in SVG command "M4 28 X " in path',
        );
        expect(() => parseCanonicalSubpaths("X M4 28 L28 4")).toThrow(
            'Invalid leading token(s) "X" in SVG path',
        );
        expect(() => parseCanonicalSubpaths("M4 28 L28 4 Y")).toThrow(
            'Invalid token(s) "Y" in SVG command "L28 4 Y" in path',
        );

        expect(() => extractPathPoints("M4 28 L L28 4")).toThrow(
            'Invalid SVG command "L": missing required arguments in path: "M4 28 L L28 4"',
        );
        expect(() => extractPathPoints("M4 28 C L28 4")).toThrow(
            'Invalid SVG command "C": missing required arguments in path: "M4 28 C L28 4"',
        );
        expect(() => extractPathPoints("M4 28 Q L28 4")).toThrow(
            'Invalid SVG command "Q": missing required arguments in path: "M4 28 Q L28 4"',
        );
        expect(() => extractPathPoints("M4 28 H L28 4")).toThrow(
            'Invalid SVG command "H": missing required arguments in path: "M4 28 H L28 4"',
        );
        expect(() => extractPathPoints("M")).toThrow(
            'Invalid SVG command "M": missing required arguments in path: "M"',
        );
        expect(() => parseCanonicalSubpaths("M4 28 L L28 4")).toThrow(
            'Invalid SVG command "L": missing required arguments in path: "M4 28 L L28 4"',
        );

        expect(() => extractPathPoints("L4 28 L28 4")).toThrow(
            'Invalid SVG path: path must begin with a "moveto" command ("M" or "m"), but found "L" in "L4 28 L28 4"',
        );
        expect(() => extractPathPoints("C4 28 10 10 28 4")).toThrow(
            'Invalid SVG path: path must begin with a "moveto" command ("M" or "m"), but found "C" in "C4 28 10 10 28 4"',
        );
        expect(() => extractPathPoints("Q4 28 16 16 28 4")).toThrow(
            'Invalid SVG path: path must begin with a "moveto" command ("M" or "m"), but found "Q" in "Q4 28 16 16 28 4"',
        );
        expect(() => extractPathPoints("H28")).toThrow(
            'Invalid SVG path: path must begin with a "moveto" command ("M" or "m"), but found "H" in "H28"',
        );
        expect(() => extractPathPoints("V28")).toThrow(
            'Invalid SVG path: path must begin with a "moveto" command ("M" or "m"), but found "V" in "V28"',
        );
        expect(() => extractPathPoints("Z")).toThrow(
            'Invalid SVG path: path must begin with a "moveto" command ("M" or "m"), but found "Z" in "Z"',
        );
        expect(() => parseCanonicalSubpaths("L4 28 L28 4")).toThrow(
            'Invalid SVG path: path must begin with a "moveto" command ("M" or "m"), but found "L" in "L4 28 L28 4"',
        );
    });

    it("verifies transform attributes are rejected when parsing inline and standalone SVGs", () => {
        const mockInlineHtmlWithTransform = `
            <button data-pattern="testTransform">
                <svg viewBox="0 0 32 32" fill="none" class="stroke-current" transform="scale(2)">
                    <path d="M4 4 L28 28" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </button>
        `;
        expect(() =>
            getInlinePath(mockInlineHtmlWithTransform, "data-pattern", "testTransform"),
        ).toThrow(
            'Inline SVG for data-pattern="testTransform" must not declare transform attributes',
        );

        const mockInlinePathWithTransform = `
            <button data-pattern="testPathTransform">
                <svg viewBox="0 0 32 32" fill="none" class="stroke-current">
                    <path d="M4 4 L28 28" transform="rotate(45)" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </button>
        `;
        expect(() =>
            getInlinePath(mockInlinePathWithTransform, "data-pattern", "testPathTransform"),
        ).toThrow(
            'Inline <path> in data-pattern="testPathTransform" must not declare transform attributes',
        );

        const mockInlineCircleWithTransform = `
            <button data-pattern="testCircleTransform">
                <svg viewBox="0 0 32 32" fill="none" class="stroke-current">
                    <circle cx="16" cy="16" r="4" fill="var(--ui-accent-soft)" transform="translate(2, 2)" />
                </svg>
            </button>
        `;
        expect(() =>
            getInlineCircles(mockInlineCircleWithTransform, "data-pattern", "testCircleTransform"),
        ).toThrow(
            'Inline <circle> in data-pattern="testCircleTransform" must not declare transform attributes',
        );

        const mockInlineData: InlinePathData = {
            d: "M4 4 L28 28",
            viewBox: { minX: 0, minY: 0, width: 32, height: 32 },
            svgFill: "none",
            svgClass: "stroke-current",
            paths: [{ d: "M4 4 L28 28", strokeLinecap: "round", strokeLinejoin: "round" }],
        };
        const mockStandaloneSvgWithTransform = `<svg viewBox="0 0 32 32" transform="scale(2)" fill="none"><path d="M4 4 L28 28" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        expect(() =>
            assertStandaloneParity(
                rootDir,
                mockInlineData,
                "patterns",
                "test.svg",
                mockStandaloneSvgWithTransform,
            ),
        ).toThrow("Standalone test.svg <svg> must not declare transform attributes");

        const mockStandalonePathWithTransform = `<svg viewBox="0 0 32 32" fill="none"><path d="M4 4 L28 28" transform="rotate(45)" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        expect(() =>
            assertStandaloneParity(
                rootDir,
                mockInlineData,
                "patterns",
                "test.svg",
                mockStandalonePathWithTransform,
            ),
        ).toThrow("Standalone test.svg <path> must not declare transform attributes");

        const mockStandaloneCircleSvgWithTransform = `<svg viewBox="0 0 32 32" transform="translate(1, 1)" fill="none"><circle cx="16" cy="16" r="4" fill="currentColor"/></svg>`;
        expect(() =>
            getStandaloneCircles(
                rootDir,
                "patterns",
                "test.svg",
                mockStandaloneCircleSvgWithTransform,
            ),
        ).toThrow("Standalone test.svg <svg> must not declare transform attributes");

        const mockStandaloneCircleWithTransform = `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="4" transform="scale(1.5)" fill="currentColor"/></svg>`;
        expect(() =>
            getStandaloneCircles(
                rootDir,
                "patterns",
                "test.svg",
                mockStandaloneCircleWithTransform,
            ),
        ).toThrow("Standalone test.svg <circle> must not declare transform attributes");
    });

    it("ignores SVG markup enclosed inside HTML or XML comments", () => {
        const commentedHtml = `
            <!--
            <button data-pattern="commentedPattern">
                <svg viewBox="0 0 32 32" fill="none" class="stroke-current">
                    <path d="M4 4 L28 28" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </button>
            -->
        `;
        expect(() => getInlinePath(commentedHtml, "data-pattern", "commentedPattern")).toThrow(
            'Missing SVG for data-pattern="commentedPattern"',
        );
        expect(() => getInlineCircles(commentedHtml, "data-pattern", "commentedPattern")).toThrow(
            'Missing SVG for data-pattern="commentedPattern"',
        );

        const nestedCommentedHtml = `
            <!-- outer comment
                <!-- inner comment -->
                <button data-pattern="nestedCommentedPattern">
                    <svg viewBox="0 0 32 32" fill="none" class="stroke-current">
                        <path d="M4 4 L28 28" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
            -->
        `;
        expect(() =>
            getInlinePath(nestedCommentedHtml, "data-pattern", "nestedCommentedPattern"),
        ).toThrow('Missing SVG for data-pattern="nestedCommentedPattern"');
    });

    it("verifies stylesheet stroke-width parity across all icon selectors and rejects cascade overrides or missing declarations", () => {
        assertStylesheetStrokeWidthParity(rootDir);

        const cascadeOverrideCss = `
            .waveform-btn svg,
            .pattern-btn svg,
            .octave-btn svg {
                stroke-width: 2;
            }
            .pattern-btn svg {
                stroke-width: 4;
            }
        `;
        expect(() => assertStylesheetStrokeWidthParity(rootDir, cascadeOverrideCss)).toThrow(
            'Effective stroke-width for ".pattern-btn svg" in styles/components.css must be 2, but resolved to 4',
        );

        const missingSelectorCss = `
            .waveform-btn svg {
                stroke-width: 2;
            }
        `;
        expect(() => assertStylesheetStrokeWidthParity(rootDir, missingSelectorCss)).toThrow(
            'Missing stroke-width declaration in styles/components.css for selector ".pattern-btn svg"',
        );

        const wrongStrokeWidthCss = `
            .waveform-btn svg,
            .pattern-btn svg,
            .octave-btn svg {
                stroke-width: 3;
            }
        `;
        expect(() => assertStylesheetStrokeWidthParity(rootDir, wrongStrokeWidthCss)).toThrow(
            'Effective stroke-width for ".waveform-btn svg" in styles/components.css must be 2, but resolved to 3',
        );

        const collidingSelectorCss = `
            .waveform-btn svg,
            .icon-pattern-btn svg,
            .octave-btn svg {
                stroke-width: 2;
            }
        `;
        expect(() => assertStylesheetStrokeWidthParity(rootDir, collidingSelectorCss)).toThrow(
            'Missing stroke-width declaration in styles/components.css for selector ".pattern-btn svg"',
        );
    });

    it("verifies all pattern direction icons adhere to left-to-right temporal progression for each trajectory", () => {
        for (const patternId of patternIds) {
            const { d: pathD } = getInlinePath(htmlContent, "data-pattern", patternId);
            const subpaths = parseCanonicalSubpaths(pathD);
            expect(subpaths.length, `Expected subpaths for "${patternId}"`).toBeGreaterThan(0);
            let progressionTrajectoriesFound = 0;
            for (const [index, sp] of subpaths.entries()) {
                if (sp.segments.length === 0) continue;
                const startX = sp.startX;
                const endX = sp.segments[sp.segments.length - 1].xe;
                if (startX !== endX) {
                    progressionTrajectoriesFound++;
                    expect(
                        startX,
                        `Pattern "${patternId}" trajectory ${index + 1} must progress left-to-right (startX ${startX} should be < endX ${endX})`,
                    ).toBeLessThan(endX);

                    for (const [segIdx, seg] of sp.segments.entries()) {
                        expect(
                            seg.xe,
                            `Pattern "${patternId}" trajectory ${index + 1} segment ${segIdx + 1} backtracks (xs ${seg.xs} > xe ${seg.xe})`,
                        ).toBeGreaterThanOrEqual(seg.xs);

                        if (seg.type === "Q" && seg.cp1x !== undefined) {
                            expect(
                                seg.cp1x,
                                `Pattern "${patternId}" trajectory ${index + 1} quadratic curve ${segIdx + 1} control point X backtracks before startX (${seg.xs})`,
                            ).toBeGreaterThanOrEqual(seg.xs);
                            expect(
                                seg.cp1x,
                                `Pattern "${patternId}" trajectory ${index + 1} quadratic curve ${segIdx + 1} control point X overshoots endX (${seg.xe})`,
                            ).toBeLessThanOrEqual(seg.xe);
                        } else if (
                            seg.type === "C" &&
                            seg.cp1x !== undefined &&
                            seg.cp2x !== undefined
                        ) {
                            expect(
                                isCubicMonotonicForwardX(seg.xs, seg.cp1x, seg.cp2x, seg.xe),
                                `Pattern "${patternId}" trajectory ${index + 1} cubic curve ${segIdx + 1} backtracks in X`,
                            ).toBe(true);
                        }
                    }
                }
            }
            expect(
                progressionTrajectoriesFound,
                `Pattern "${patternId}" must have at least one progression trajectory`,
            ).toBeGreaterThan(0);
        }
    });

    it("detects and rejects temporal backtracking within progression trajectories", () => {
        const backtrackingSubpaths = parseCanonicalSubpaths("M3 16 L29 4 L10 28 L30 16");
        const sp = backtrackingSubpaths[0];
        expect(sp.startX).toBeLessThan(sp.segments[sp.segments.length - 1].xe);
        const segmentBacktracks = sp.segments.some((seg) => seg.xe < seg.xs);
        expect(segmentBacktracks).toBe(true);

        const loopingCubicSubpaths = parseCanonicalSubpaths("M3 16 C 35 16, 0 16, 29 16");
        const cubicSeg = loopingCubicSubpaths[0].segments[0];
        const isMonotonic = isCubicMonotonicForwardX(
            cubicSeg.xs,
            cubicSeg.cp1x ?? 0,
            cubicSeg.cp2x ?? 0,
            cubicSeg.xe,
        );
        expect(isMonotonic).toBe(false);
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
            const inlineData = getInlinePath(htmlContent, "data-pattern", patternId);
            assertStandaloneParity(rootDir, inlineData, "patterns", filename);
        }
    });

    it("verifies parity and theming between inline circle-based octave patterns and standalone SVG files", () => {
        const octaveMap: Record<string, string> = {
            octaveCycle: "pattern-direction-octaveCycle.svg",
            octaveCycleReverse: "pattern-direction-octaveCycleReversed.svg",
            octaveCyclePingPong: "pattern-direction-octaveCyclePingPong.svg",
        };

        for (const [patternId, filename] of Object.entries(octaveMap)) {
            const { circles: inlineCircles, viewBox: inlineViewBox } = getInlineCircles(
                htmlContent,
                "data-pattern",
                patternId,
            );
            const {
                circles: standaloneCircles,
                fileContent,
                viewBox: standaloneViewBox,
            } = getStandaloneCircles(rootDir, "patterns", filename);

            expect(inlineViewBox, `Inline viewBox for ${filename} must be 0 0 32 32`).toEqual({
                minX: 0,
                minY: 0,
                width: 32,
                height: 32,
            });
            expect(
                standaloneViewBox,
                `Standalone viewBox for ${filename} must be 0 0 32 32`,
            ).toEqual({ minX: 0, minY: 0, width: 32, height: 32 });

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
            const inlineData = getInlinePath(htmlContent, "data-wave", waveId);
            assertStandaloneParity(rootDir, inlineData, "waveforms", filename);
        }
    });
});
