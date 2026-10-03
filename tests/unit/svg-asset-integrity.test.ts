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
 * Extracts all absolute and resolved relative numeric X and Y coordinate values from an SVG path string in a single pass.
 *
 * @param {string} pathD - SVG path definition string.
 * @returns {PathPoints} Object containing arrays of resolved X and Y coordinates.
 */
function extractPathPoints(pathD: string): PathPoints {
    const xs: number[] = [];
    const ys: number[] = [];
    const regex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
    let match: RegExpExecArray | null;
    let currentX = 0;
    let currentY = 0;

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex parsing loop
    while ((match = regex.exec(pathD)) !== null) {
        const cmd = match[1];
        const numMatches = match[2].match(/-?\d*\.?\d+/g);
        const args = numMatches ? numMatches.map(Number) : [];

        switch (cmd) {
            case "M":
            case "L": {
                for (let i = 0; i < args.length; i += 2) {
                    currentX = args[i];
                    xs.push(currentX);
                    if (i + 1 < args.length) {
                        currentY = args[i + 1];
                        ys.push(currentY);
                    }
                }
                break;
            }
            case "l": {
                for (let i = 0; i < args.length; i += 2) {
                    currentX += args[i];
                    xs.push(currentX);
                    if (i + 1 < args.length) {
                        currentY += args[i + 1];
                        ys.push(currentY);
                    }
                }
                break;
            }
            case "H": {
                for (const val of args) {
                    currentX = val;
                    xs.push(currentX);
                    ys.push(currentY);
                }
                break;
            }
            case "V": {
                for (const val of args) {
                    currentY = val;
                    xs.push(currentX);
                    ys.push(currentY);
                }
                break;
            }
            case "C": {
                for (let i = 0; i < args.length; i += 6) {
                    if (i + 1 < args.length) ys.push(args[i + 1]);
                    if (i + 3 < args.length) ys.push(args[i + 3]);
                    if (i + 4 < args.length) currentX = args[i + 4];
                    if (i + 5 < args.length) {
                        currentY = args[i + 5];
                        xs.push(currentX);
                        ys.push(currentY);
                    }
                }
                break;
            }
            case "Q": {
                for (let i = 0; i < args.length; i += 4) {
                    if (i + 1 < args.length) ys.push(args[i + 1]);
                    if (i + 2 < args.length) currentX = args[i + 2];
                    if (i + 3 < args.length) {
                        currentY = args[i + 3];
                        xs.push(currentX);
                        ys.push(currentY);
                    }
                }
                break;
            }
            case "T": {
                for (let i = 0; i < args.length; i += 2) {
                    currentX = args[i];
                    xs.push(currentX);
                    if (i + 1 < args.length) {
                        currentY = args[i + 1];
                        ys.push(currentY);
                    }
                }
                break;
            }
        }
    }

    return { xs, ys };
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
            assertMinimumHeightSpan(pathD, 22, `Pattern "${patternId}"`);
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
