/**
 * @file Unit tests for Virtual Keyboard controller, piano key rendering, and note triggering.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeKeyboardControls } from "@ui/keyboard-controller.js";

describe("Virtual Keyboard Controller", () => {
    let keyboardVisual: HTMLElement;
    let keyboardToggle: HTMLInputElement;
    let keyboardToggleStatus: HTMLElement;
    let keyboardDescription: HTMLElement;
    let notesInput: HTMLInputElement;
    let mockState: Record<string, any>;
    let mockActions: Record<string, any>;

    beforeEach(() => {
        keyboardVisual = document.createElement("div");
        document.body.appendChild(keyboardVisual);

        keyboardToggle = document.createElement("input");
        keyboardToggle.type = "checkbox";
        keyboardToggle.checked = true;

        keyboardToggleStatus = document.createElement("span");
        keyboardToggleStatus.textContent = "On";

        keyboardDescription = document.createElement("p");

        notesInput = document.createElement("input");
        notesInput.id = "notes";
        notesInput.value = "C4";
        document.body.appendChild(notesInput);

        mockState = {
            activeNote: null,
            isPlaying: false,
            isAudioContextStarted: true,
            activeSynth: {
                triggerAttack: vi.fn(),
                triggerRelease: vi.fn(),
                triggerAttackRelease: vi.fn(),
            },
        };

        mockActions = {
            onNoteAttack: vi.fn(),
            onNoteRelease: vi.fn(),
            startAudio: vi.fn(),
        };
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    it("renders 2 octaves of piano keys in the visual container", () => {
        initializeKeyboardControls({
            state: mockState as any,
            dom: {
                keyboardVisual,
                keyboardToggle,
                keyboardToggleStatus,
                keyboardDescription,
                notesInput,
            } as any,
            actions: mockActions as any,
        });

        const whiteKeys = keyboardVisual.querySelectorAll(".key-white");
        const blackKeys = keyboardVisual.querySelectorAll(".key-black");

        expect(whiteKeys.length).toBeGreaterThanOrEqual(14);
        expect(blackKeys.length).toBeGreaterThanOrEqual(10);
    });

    it("triggers note attack and release on mousedown, mouseup, and mouseleave", () => {
        initializeKeyboardControls({
            state: mockState as any,
            dom: {
                keyboardVisual,
                keyboardToggle,
                keyboardToggleStatus,
                keyboardDescription,
                notesInput,
            } as any,
            actions: mockActions as any,
        });

        const c4Key = keyboardVisual.querySelector('[data-note="C4"]') as HTMLElement;
        expect(c4Key).not.toBeNull();

        c4Key.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(mockActions.onNoteAttack).toHaveBeenCalledWith("C4");
        expect(c4Key.classList.contains("active")).toBe(true);

        // Triggering another note while C4 is active
        const e4Key = keyboardVisual.querySelector('[data-note="E4"]') as HTMLElement;
        e4Key.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(mockActions.onNoteAttack).toHaveBeenCalledWith("E4");
        expect(c4Key.classList.contains("active")).toBe(false);
        expect(e4Key.classList.contains("active")).toBe(true);

        // Mouseleave releases key
        e4Key.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        expect(mockActions.onNoteRelease).toHaveBeenCalledWith("E4");
        expect(e4Key.classList.contains("active")).toBe(false);
    });

    it("handles touch events on virtual keys", () => {
        initializeKeyboardControls({
            state: mockState as any,
            dom: {
                keyboardVisual,
                keyboardToggle,
                keyboardToggleStatus,
                keyboardDescription,
                notesInput,
            } as any,
            actions: mockActions as any,
        });

        const e4Key = keyboardVisual.querySelector('[data-note="E4"]') as HTMLElement;
        expect(e4Key).not.toBeNull();

        e4Key.dispatchEvent(new Event("touchstart", { bubbles: true }));
        expect(mockActions.onNoteAttack).toHaveBeenCalledWith("E4");

        e4Key.dispatchEvent(new Event("touchend", { bubbles: true }));
        expect(mockActions.onNoteRelease).toHaveBeenCalledWith("E4");
    });

    it("triggers notes via computer keyboard events and ignores events from input targets", () => {
        initializeKeyboardControls({
            state: mockState as any,
            dom: {
                keyboardVisual,
                keyboardToggle,
                keyboardToggleStatus,
                keyboardDescription,
                notesInput,
            } as any,
            actions: mockActions as any,
        });

        // Keydown from window
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "z" }));
        expect(mockActions.onNoteAttack).toHaveBeenCalledWith("C4");

        window.dispatchEvent(new KeyboardEvent("keyup", { key: "z" }));
        expect(mockActions.onNoteRelease).toHaveBeenCalledWith("C4");

        // Keydown from inside input should be ignored
        notesInput.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
        expect(mockActions.onNoteAttack).not.toHaveBeenCalledWith("D4");
    });

    it("toggles keyboard enabled/disabled states and updates DOM accessibility attributes", () => {
        const controls = initializeKeyboardControls({
            state: mockState as any,
            dom: {
                keyboardVisual,
                keyboardToggle,
                keyboardToggleStatus,
                keyboardDescription,
                notesInput,
            } as any,
            actions: mockActions as any,
        });

        // Simulate active playing note while disabling
        mockState.activeNote = "C4";
        keyboardToggle.checked = false;
        keyboardToggle.dispatchEvent(new Event("change"));

        expect(keyboardToggleStatus.textContent).toBe("Off");
        expect(mockState.activeNote).toBeNull();
        expect(mockActions.onNoteRelease).toHaveBeenCalled();

        // Re-enable
        keyboardToggle.checked = true;
        keyboardToggle.dispatchEvent(new Event("change"));
        expect(keyboardToggleStatus.textContent).toBe("On");

        expect(() => controls.updateKeyboardControlUi()).not.toThrow();
    });
});
