/**
 * @file Unit tests for keyboard note and numeric input filtering domain helpers.
 */

import { describe, expect, it } from "vitest";
import { filterNoteInput, filterNumericInput } from "@core/input-filters.js";

describe("Input Filters Domain Module", () => {
    /**
     * Helper to create a mock KeyboardEvent.
     *
     * @param {object} options - Event parameters.
     * @param {string} options.key - Character string representation.
     * @param {number} options.keyCode - Integer keycode.
     * @param {boolean} [options.shiftKey=false] - Shift modifier state.
     * @param {boolean} [options.ctrlKey=false] - Control modifier state.
     * @param {boolean} [options.metaKey=false] - Meta/Command modifier state.
     * @returns {{ event: KeyboardEvent, isPrevented: boolean }} Mock event and prevented flag.
     */
    function createMockKeyEvent(options: {
        key: string;
        keyCode: number;
        shiftKey?: boolean;
        ctrlKey?: boolean;
        metaKey?: boolean;
    }) {
        let prevented = false;
        const event = {
            key: options.key,
            keyCode: options.keyCode,
            shiftKey: Boolean(options.shiftKey),
            ctrlKey: Boolean(options.ctrlKey),
            metaKey: Boolean(options.metaKey),
            preventDefault: () => {
                prevented = true;
            },
        } as unknown as KeyboardEvent;

        return {
            event,
            get isPrevented() {
                return prevented;
            },
        };
    }

    describe("filterNoteInput", () => {
        it("allows musical note letters A through G (keyCodes 65–71)", () => {
            for (let code = 65; code <= 71; code++) {
                const mock = createMockKeyEvent({
                    key: String.fromCharCode(code),
                    keyCode: code,
                });
                expect(filterNoteInput(mock.event)).toBe(true);
                expect(mock.isPrevented).toBe(false);
            }
        });

        it("allows numbers 0 through 9 when unshifted (keyCodes 48–57)", () => {
            for (let digit = 0; digit <= 9; digit++) {
                const code = 48 + digit;
                const mock = createMockKeyEvent({
                    key: String(digit),
                    keyCode: code,
                    shiftKey: false,
                });
                expect(filterNoteInput(mock.event)).toBe(true);
                expect(mock.isPrevented).toBe(false);
            }
        });

        it("blocks shifted number keys (e.g. symbols !@#$%)", () => {
            const mock = createMockKeyEvent({
                key: "@",
                keyCode: 50,
                shiftKey: true,
            });
            expect(filterNoteInput(mock.event)).toBe(false);
            expect(mock.isPrevented).toBe(true);
        });

        it("allows space, hash (#), and flat (b) characters", () => {
            const allowedKeys = [
                { key: " ", keyCode: 32 },
                { key: "#", keyCode: 51, shiftKey: true },
                { key: "b", keyCode: 66 },
            ];

            for (const { key, keyCode, shiftKey } of allowedKeys) {
                const mock = createMockKeyEvent({ key, keyCode, shiftKey });
                expect(filterNoteInput(mock.event)).toBe(true);
                expect(mock.isPrevented).toBe(false);
            }
        });

        it("allows standard navigation and control keys (Backspace, Tab, Arrows, Delete)", () => {
            const controlCodes = [8, 9, 37, 38, 39, 40, 46];
            for (const code of controlCodes) {
                const mock = createMockKeyEvent({ key: "ControlKey", keyCode: code });
                expect(filterNoteInput(mock.event)).toBe(true);
                expect(mock.isPrevented).toBe(false);
            }
        });

        it("allows Ctrl/Cmd shortcut combinations (A, C, V, X)", () => {
            const shortcutKeyCodes = [65, 67, 86, 88]; // A, C, V, X
            for (const code of shortcutKeyCodes) {
                // Test with ctrlKey
                const ctrlMock = createMockKeyEvent({ key: "x", keyCode: code, ctrlKey: true });
                expect(filterNoteInput(ctrlMock.event)).toBe(true);
                expect(ctrlMock.isPrevented).toBe(false);

                // Test with metaKey (Cmd on Mac)
                const metaMock = createMockKeyEvent({ key: "x", keyCode: code, metaKey: true });
                expect(filterNoteInput(metaMock.event)).toBe(true);
                expect(metaMock.isPrevented).toBe(false);
            }
        });

        it("blocks disallowed characters (e.g., H, Z, special symbols)", () => {
            const disallowedKeys = [
                { key: "H", keyCode: 72 },
                { key: "z", keyCode: 90 },
                { key: ";", keyCode: 186 },
                { key: "/", keyCode: 191 },
            ];

            for (const { key, keyCode } of disallowedKeys) {
                const mock = createMockKeyEvent({ key, keyCode });
                expect(filterNoteInput(mock.event)).toBe(false);
                expect(mock.isPrevented).toBe(true);
            }
        });

        it("handles events without preventDefault gracefully", () => {
            const eventWithoutPreventDefault = {
                key: "z",
                keyCode: 90,
            } as KeyboardEvent;

            expect(filterNoteInput(eventWithoutPreventDefault)).toBe(false);
        });
    });

    describe("filterNumericInput", () => {
        it("allows standard digits 0–9 without shift", () => {
            for (let digit = 0; digit <= 9; digit++) {
                const code = 48 + digit;
                const mock = createMockKeyEvent({
                    key: String(digit),
                    keyCode: code,
                    shiftKey: false,
                });
                expect(filterNumericInput(mock.event)).toBe(true);
                expect(mock.isPrevented).toBe(false);
            }
        });

        it("allows numpad digits 0–9 (keyCodes 96–105)", () => {
            for (let code = 96; code <= 105; code++) {
                const mock = createMockKeyEvent({
                    key: String(code - 96),
                    keyCode: code,
                });
                expect(filterNumericInput(mock.event)).toBe(true);
                expect(mock.isPrevented).toBe(false);
            }
        });

        it("allows control and navigation keys", () => {
            const controlCodes = [8, 9, 37, 38, 39, 40, 46];
            for (const code of controlCodes) {
                const mock = createMockKeyEvent({ key: "ControlKey", keyCode: code });
                expect(filterNumericInput(mock.event)).toBe(true);
                expect(mock.isPrevented).toBe(false);
            }
        });

        it("allows clipboard shortcuts (Ctrl/Cmd + A, C, V, X)", () => {
            const shortcutCodes = [65, 67, 86, 88];
            for (const code of shortcutCodes) {
                const mock = createMockKeyEvent({
                    key: "k",
                    keyCode: code,
                    ctrlKey: true,
                });
                expect(filterNumericInput(mock.event)).toBe(true);
                expect(mock.isPrevented).toBe(false);
            }
        });

        it("blocks alphabet letters and punctuation", () => {
            const disallowed = [
                { key: "a", keyCode: 65 },
                { key: "e", keyCode: 69 },
                { key: "-", keyCode: 189 },
                { key: ".", keyCode: 190 },
            ];

            for (const { key, keyCode } of disallowed) {
                const mock = createMockKeyEvent({ key, keyCode });
                expect(filterNumericInput(mock.event)).toBe(false);
                expect(mock.isPrevented).toBe(true);
            }
        });

        it("handles numeric event without preventDefault safely", () => {
            const eventWithoutPreventDefault = {
                key: "a",
                keyCode: 65,
            } as KeyboardEvent;

            expect(filterNumericInput(eventWithoutPreventDefault)).toBe(false);
        });
    });
});
