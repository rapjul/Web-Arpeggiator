/**
 * @file Unit tests for Virtual Keyboard controller, piano key rendering, and note triggering.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeKeyboardControls } from "@ui/keyboard-controller.js";

describe("Virtual Keyboard Controller", () => {
    type KeyboardControllerContext = Parameters<typeof initializeKeyboardControls>[0];
    type KeyboardControllerState = KeyboardControllerContext["state"];
    type KeyboardControllerDom = KeyboardControllerContext["dom"];
    type KeyboardControllerActions = KeyboardControllerContext["actions"];

    let keyboardVisual: HTMLElement;
    let keyboardToggle: HTMLInputElement;
    let keyboardToggleStatus: HTMLElement;
    let keyboardDescription: HTMLElement;
    let notesInput: HTMLInputElement;
    let mockState: KeyboardControllerState;
    let mockActions: KeyboardControllerActions;
    let mockDom: KeyboardControllerDom;

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
            } as unknown as KeyboardControllerState["activeSynth"],
        };

        mockActions = {
            onNoteAttack: vi.fn(),
            onNoteRelease: vi.fn(),
            startAudio: vi.fn(),
        };

        mockDom = {
            keyboardVisual,
            keyboardToggle,
            keyboardToggleStatus,
            keyboardDescription,
            notesInput,
        };
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    it("renders 2 octaves of piano keys in the visual container", () => {
        initializeKeyboardControls({
            state: mockState,
            dom: mockDom,
            actions: mockActions,
        });

        const whiteKeys = keyboardVisual.querySelectorAll(".key-white");
        const blackKeys = keyboardVisual.querySelectorAll(".key-black");

        expect(whiteKeys.length).toBeGreaterThanOrEqual(14);
        expect(blackKeys.length).toBeGreaterThanOrEqual(10);
    });

    it("triggers note attack and release on mousedown, mouseup, and mouseleave", () => {
        initializeKeyboardControls({
            state: mockState,
            dom: mockDom,
            actions: mockActions,
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
            state: mockState,
            dom: mockDom,
            actions: mockActions,
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
            state: mockState,
            dom: mockDom,
            actions: mockActions,
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
            state: mockState,
            dom: mockDom,
            actions: mockActions,
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

    it("handles keydown/keyup with Space/Enter and blur on virtual key elements", () => {
        initializeKeyboardControls({
            state: mockState,
            dom: mockDom,
            actions: mockActions,
        });

        const c4Key = keyboardVisual.querySelector('[data-note="C4"]') as HTMLElement;

        // Space keydown
        c4Key.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
        expect(mockActions.onNoteAttack).toHaveBeenCalledWith("C4");

        // Repeat Space keydown ignored
        c4Key.dispatchEvent(new KeyboardEvent("keydown", { key: " ", repeat: true }));

        // Space keyup
        c4Key.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
        expect(mockActions.onNoteRelease).toHaveBeenCalledWith("C4");

        // Enter keydown and blur
        c4Key.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(mockActions.onNoteAttack).toHaveBeenCalledWith("C4");

        c4Key.dispatchEvent(new Event("blur"));
        expect(mockActions.onNoteRelease).toHaveBeenCalledWith("C4");
    });

    it("toggles Add-to-Pattern mode and appends played notes to note input", () => {
        const keyboardModeAddBtn = document.createElement("button");
        keyboardModeAddBtn.id = "keyboard-mode-add";
        const statusSpan = document.createElement("span");
        statusSpan.className = "keyboard-mode-status";
        keyboardModeAddBtn.appendChild(statusSpan);
        document.body.appendChild(keyboardModeAddBtn);

        initializeKeyboardControls({
            state: mockState,
            dom: {
                ...mockDom,
                keyboardModeAddBtn,
            },
            actions: mockActions,
        });

        // Turn on Add to Pattern mode
        keyboardModeAddBtn.click();
        expect(statusSpan.textContent).toBe("Add to Pattern: On");

        // Play key
        notesInput.value = "C4";
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
        expect(notesInput.value).toBe("C4 D4");

        // Turn off Add to Pattern mode
        keyboardModeAddBtn.click();
        expect(statusSpan.textContent).toBe("Add to Pattern: Off");
    });

    it("ignores repeating keydown events and unmapped keys", () => {
        initializeKeyboardControls({
            state: mockState,
            dom: mockDom,
            actions: mockActions,
        });

        mockActions.onNoteAttack.mockClear();

        // Repeating keydown
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", repeat: true }));
        expect(mockActions.onNoteAttack).not.toHaveBeenCalled();

        // Unmapped key
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
        expect(mockActions.onNoteAttack).not.toHaveBeenCalled();
    });
});
