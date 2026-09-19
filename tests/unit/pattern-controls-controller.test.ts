import { createPatternControlsController } from "@ui/pattern-controls-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";

type PatternControlsDependencies = Parameters<typeof createPatternControlsController>[0];
type OpenChordConflict = NonNullable<PatternControlsDependencies["openChordConflict"]>;
type ChordConflictDetails = Parameters<OpenChordConflict>[0];

interface PatternControlsFixture {
    chordButton: HTMLButtonElement;
    controller: ReturnType<typeof createPatternControlsController>;
    flushDebouncedPatternChange: () => void;
    gateSlider: HTMLInputElement;
    gateValue: HTMLSpanElement;
    intervalSelect: HTMLSelectElement;
    notesInput: HTMLInputElement;
    normalizeNotes: ReturnType<typeof vi.fn>;
    onClearActiveSoundStarter: ReturnType<typeof vi.fn>;
    onEstimatedDurationChange: ReturnType<typeof vi.fn>;
    onPatternChange: ReturnType<typeof vi.fn>;
    onReshuffle: ReturnType<typeof vi.fn>;
    onStaticLoopChange: ReturnType<typeof vi.fn>;
    onNotesSelected: ReturnType<typeof vi.fn>;
    openChordConflict: ReturnType<typeof vi.fn>;
    patternButtons: HTMLDivElement;
    reshufflePatternButton: HTMLButtonElement;
    octaveRangeButtons: HTMLDivElement;
    octaveShiftButtons: HTMLDivElement;
    scaleQuantizeToggle: HTMLInputElement;
    scaleQuantizeToggleStatus: HTMLSpanElement;
    scaleRootSelect: HTMLSelectElement;
    scaleTypeSelect: HTMLSelectElement;
    resolveChordConflict: ReturnType<typeof vi.fn>;
    showToast: ReturnType<typeof vi.fn>;
    setNotes: ReturnType<typeof vi.fn>;
    setOctaveRange: ReturnType<typeof vi.fn>;
    setOctaveShift: ReturnType<typeof vi.fn>;
}

/**
 * Builds the pattern-control DOM and dependencies with controllable debounce work.
 */
function createFixture(): PatternControlsFixture {
    const notesInput = document.createElement("input");
    notesInput.value = "C4 E4 G4";
    const intervalSelect = document.createElement("select");
    intervalSelect.innerHTML = '<option value="16n">16n</option>';
    const gateSlider = document.createElement("input");
    gateSlider.value = "0.8";
    const gateValue = document.createElement("span");
    const scaleQuantizeToggle = document.createElement("input");
    scaleQuantizeToggle.type = "checkbox";
    const scaleTypeSelect = document.createElement("select");
    scaleTypeSelect.innerHTML = [
        '<option value="major">Major</option>',
        '<option value="minor">Minor</option>',
        '<option value="chromatic">Chromatic</option>',
    ].join("");
    const scaleRootSelect = document.createElement("select");
    scaleRootSelect.innerHTML = '<option value="C">C</option><option value="D">D</option>';
    const scaleQuantizeToggleStatus = document.createElement("span");
    const patternButtons = document.createElement("div");
    patternButtons.innerHTML = [
        '<label class="pattern-btn" data-pattern="up"><input type="radio" name="pattern-direction" value="up" checked></label>',
        '<label class="pattern-btn" data-pattern="down"><input type="radio" name="pattern-direction" value="down"></label>',
        '<label class="pattern-btn" data-pattern="random"><input type="radio" name="pattern-direction" value="random"></label>',
    ].join("");
    const reshufflePatternButton = document.createElement("button");
    const chordButtonsContainer = document.createElement("div");
    chordButtonsContainer.innerHTML =
        '<button class="chord-btn" data-chord="minor" type="button">Minor</button>';
    const chordButton = chordButtonsContainer.querySelector<HTMLButtonElement>(".chord-btn");
    if (!chordButton) throw new Error("Expected chord button fixture.");
    const octaveShiftButtons = document.createElement("div");
    octaveShiftButtons.innerHTML =
        '<button class="octave-btn" data-shift="-1">-1</button><label class="octave-btn"><input type="radio" data-shift="1" value="1"></label>';
    const octaveRangeButtons = document.createElement("div");
    octaveRangeButtons.innerHTML =
        '<button class="octave-btn" data-range="3">3</button><input type="radio" data-range="2" value="2">';
    document.body.append(
        notesInput,
        intervalSelect,
        gateSlider,
        gateValue,
        scaleQuantizeToggle,
        scaleQuantizeToggleStatus,
        scaleTypeSelect,
        scaleRootSelect,
        octaveShiftButtons,
        octaveRangeButtons,
        patternButtons,
        reshufflePatternButton,
        chordButtonsContainer,
    );

    const queuedPatternChanges: Array<() => void> = [];
    const normalizeNotes = vi.fn((notes: string[]) => notes.map((note) => note.toUpperCase()));
    const setNotes = vi.fn();
    const setOctaveShift = vi.fn();
    const setOctaveRange = vi.fn();
    const onPatternChange = vi.fn();
    const onReshuffle = vi.fn();
    const onEstimatedDurationChange = vi.fn();
    const onStaticLoopChange = vi.fn();
    const onNotesSelected = vi.fn();
    const onClearActiveSoundStarter = vi.fn();
    const showToast = vi.fn();
    const resolveChordConflict = vi.fn(() => ({
        hasConflict: false,
        chordName: "Minor",
        root: "C",
        requestedNotes: ["C4", "D#4", "G4"],
        adaptedNotes: ["C4", "D4", "G4"],
        changedPitches: [],
    }));
    const openChordConflict = vi.fn();
    const debounce: PatternControlsDependencies["debounce"] = (callback) => () => {
        queuedPatternChanges.push(callback);
    };
    const dependencies: PatternControlsDependencies = {
        dom: {
            notesInput,
            intervalSelect,
            gateSlider,
            gateValue,
            scaleQuantizeToggle,
            scaleQuantizeToggleStatus,
            scaleTypeSelect,
            scaleRootSelect,
            octaveShiftButtons,
            octaveRangeButtons,
            patternButtons,
            randomizeNotesButton: null,
            reshufflePatternButton,
            chordButtons: chordButtonsContainer.querySelectorAll(".chord-btn"),
        },
        normalizeNotes,
        setNotes,
        setOctaveShift,
        setOctaveRange,
        onPatternChange,
        onReshuffle,
        onEstimatedDurationChange,
        onStaticLoopChange,
        onNotesSelected,
        onClearActiveSoundStarter,
        showToast,
        buildChordString: vi.fn(() => "C4 D#4 G4"),
        resolveChordDefinition: vi.fn(() => ({ name: "Minor" })),
        resolveChordConflict,
        openChordConflict,
        debounce,
    };

    return {
        chordButton,
        controller: createPatternControlsController(dependencies),
        flushDebouncedPatternChange: () => {
            queuedPatternChanges.splice(0).forEach((callback) => {
                callback();
            });
        },
        gateSlider,
        gateValue,
        intervalSelect,
        notesInput,
        normalizeNotes,
        onClearActiveSoundStarter,
        onEstimatedDurationChange,
        onPatternChange,
        onReshuffle,
        onStaticLoopChange,
        onNotesSelected,
        openChordConflict,
        octaveRangeButtons,
        octaveShiftButtons,
        patternButtons,
        reshufflePatternButton,
        scaleQuantizeToggle,
        scaleQuantizeToggleStatus,
        scaleRootSelect,
        scaleTypeSelect,
        resolveChordConflict,
        showToast,
        setNotes,
        setOctaveRange,
        setOctaveShift,
    };
}

describe("pattern controls controller", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    test("normalizes submitted notes and retains a safe fallback while editing", () => {
        const {
            controller,
            normalizeNotes,
            notesInput,
            onEstimatedDurationChange,
            onPatternChange,
            setNotes,
        } = createFixture();
        controller.initialize();

        notesInput.value = "c4 eb4";
        notesInput.dispatchEvent(new Event("change"));
        expect(normalizeNotes).toHaveBeenCalledWith(["c4", "eb4"]);
        expect(notesInput.value).toBe("C4 EB4");
        expect(setNotes).toHaveBeenLastCalledWith(["C4", "EB4"]);
        expect(onPatternChange).toHaveBeenCalledOnce();

        notesInput.value = "";
        notesInput.dispatchEvent(new Event("input"));
        expect(setNotes).toHaveBeenLastCalledWith(["C4"]);
        expect(onEstimatedDurationChange).toHaveBeenCalledOnce();
    });

    test("coordinates scale mode selection and dependent pattern updates", () => {
        const {
            controller,
            onPatternChange,
            scaleQuantizeToggle,
            scaleQuantizeToggleStatus,
            scaleRootSelect,
            scaleTypeSelect,
        } = createFixture();
        controller.initialize();

        scaleTypeSelect.value = "minor";
        scaleTypeSelect.dispatchEvent(new Event("change"));
        expect(scaleQuantizeToggle.checked).toBe(true);

        scaleQuantizeToggle.checked = false;
        scaleQuantizeToggle.dispatchEvent(new Event("change"));
        expect(scaleTypeSelect.value).toBe("minor");
        expect(scaleRootSelect.disabled).toBe(false);

        scaleQuantizeToggle.checked = true;
        scaleQuantizeToggle.dispatchEvent(new Event("change"));
        expect(scaleTypeSelect.value).toBe("minor");

        scaleRootSelect.value = "D";
        scaleRootSelect.dispatchEvent(new Event("change"));
        expect(onPatternChange).toHaveBeenCalledTimes(4);
        expect(scaleQuantizeToggleStatus.textContent).toBe("Enabled");
        expect(scaleRootSelect.disabled).toBe(false);
    });

    test("remembers a restored scale while quantization is disabled", () => {
        const { controller, scaleQuantizeToggle, scaleTypeSelect } = createFixture();
        controller.initialize();

        scaleTypeSelect.value = "minor";
        scaleQuantizeToggle.checked = false;
        controller.updateScaleQuantizeUi();
        scaleTypeSelect.value = "chromatic";
        scaleTypeSelect.dispatchEvent(new Event("change"));
        scaleQuantizeToggle.checked = true;
        scaleQuantizeToggle.dispatchEvent(new Event("change"));

        expect(scaleTypeSelect.value).toBe("minor");
        expect(scaleQuantizeToggle.checked).toBe(true);
    });

    test("applies compatible chords immediately", () => {
        const {
            chordButton,
            controller,
            onClearActiveSoundStarter,
            onNotesSelected,
            openChordConflict,
            showToast,
        } = createFixture();
        controller.initialize();

        chordButton.click();

        expect(openChordConflict).not.toHaveBeenCalled();
        expect(onClearActiveSoundStarter).toHaveBeenCalledOnce();
        expect(onNotesSelected).toHaveBeenCalledWith(["C4", "D#4", "G4"]);
        expect(showToast).toHaveBeenCalledWith("Loaded C Minor chord!", "success");
    });

    test("keeps, adapts, or cancels conflicting chords without leaking state", () => {
        const {
            chordButton,
            controller,
            onNotesSelected,
            openChordConflict,
            resolveChordConflict,
            scaleQuantizeToggle,
            scaleTypeSelect,
        } = createFixture();
        scaleTypeSelect.value = "major";
        scaleQuantizeToggle.checked = true;
        resolveChordConflict.mockReturnValue({
            hasConflict: true,
            chordName: "Minor",
            root: "C",
            requestedNotes: ["C4", "D#4", "G4"],
            adaptedNotes: ["C4", "D4", "G4"],
            changedPitches: [{ requested: "D#4", adapted: "D4" }],
        });
        controller.initialize();

        chordButton.click();
        const cancelDetails = openChordConflict.mock.calls.at(-1)?.[0] as ChordConflictDetails;
        cancelDetails.onCancel?.();
        expect(onNotesSelected).not.toHaveBeenCalled();
        expect(scaleQuantizeToggle.checked).toBe(true);

        chordButton.click();
        const adaptDetails = openChordConflict.mock.calls.at(-1)?.[0] as ChordConflictDetails;
        adaptDetails.onAdapt();
        expect(onNotesSelected).toHaveBeenLastCalledWith(["C4", "D4", "G4"]);
        expect(scaleQuantizeToggle.checked).toBe(true);

        chordButton.click();
        const keepDetails = openChordConflict.mock.calls.at(-1)?.[0] as ChordConflictDetails;
        keepDetails.onKeep();
        expect(onNotesSelected).toHaveBeenLastCalledWith(["C4", "D#4", "G4"]);
        expect(scaleQuantizeToggle.checked).toBe(false);
        expect(scaleTypeSelect.value).toBe("major");
    });

    test("enables reshuffling only for stochastic directions", () => {
        const { controller, onReshuffle, patternButtons, reshufflePatternButton } = createFixture();
        controller.initialize();
        expect(reshufflePatternButton.disabled).toBe(true);

        const random = patternButtons.querySelector<HTMLInputElement>('input[value="random"]');
        if (random) random.checked = true;
        random?.dispatchEvent(new Event("change", { bubbles: true }));
        expect(reshufflePatternButton.disabled).toBe(false);
        reshufflePatternButton.click();
        expect(onReshuffle).toHaveBeenCalledOnce();
    });

    test("updates octave controls and applies gate changes through the debounce boundary", () => {
        const {
            controller,
            flushDebouncedPatternChange,
            gateSlider,
            gateValue,
            onPatternChange,
            onStaticLoopChange,
            octaveRangeButtons,
            octaveShiftButtons,
            setOctaveRange,
            setOctaveShift,
        } = createFixture();
        controller.initialize();

        octaveShiftButtons
            .querySelector("button")
            ?.dispatchEvent(new Event("click", { bubbles: true }));
        const shiftInput = octaveShiftButtons.querySelector("input");
        shiftInput?.dispatchEvent(new Event("change", { bubbles: true }));
        const rangeInput = octaveRangeButtons.querySelector("input");
        rangeInput?.dispatchEvent(new Event("change", { bubbles: true }));
        expect(setOctaveShift).toHaveBeenCalledWith(-1);
        expect(setOctaveShift).toHaveBeenLastCalledWith(1);
        expect(setOctaveRange).toHaveBeenCalledWith(2);
        expect(onPatternChange).toHaveBeenCalledTimes(3);
        expect(onStaticLoopChange).toHaveBeenCalledTimes(3);
        expect(octaveShiftButtons.querySelector("label")?.classList.contains("selected")).toBe(
            true,
        );
        expect(octaveRangeButtons.querySelector("input")?.checked).toBe(true);

        gateSlider.value = "0.75";
        gateSlider.dispatchEvent(new Event("input"));
        expect(gateValue.textContent).toBe("0.75");
        expect(onPatternChange).toHaveBeenCalledTimes(3);
        flushDebouncedPatternChange();
        expect(onPatternChange).toHaveBeenCalledTimes(4);
    });

    test("removes bindings on teardown and avoids duplicate initialization", () => {
        const { controller, intervalSelect, onPatternChange } = createFixture();
        controller.initialize();
        controller.initialize();

        intervalSelect.dispatchEvent(new Event("change"));
        expect(onPatternChange).toHaveBeenCalledOnce();

        controller.destroy();
        intervalSelect.dispatchEvent(new Event("change"));
        expect(onPatternChange).toHaveBeenCalledOnce();
    });

    test("suppresses queued gate changes after teardown, including reinitialization", () => {
        const { controller, flushDebouncedPatternChange, gateSlider, onPatternChange } =
            createFixture();
        controller.initialize();

        gateSlider.dispatchEvent(new Event("input"));
        controller.destroy();
        flushDebouncedPatternChange();
        expect(onPatternChange).not.toHaveBeenCalled();

        controller.initialize();
        flushDebouncedPatternChange();
        expect(onPatternChange).not.toHaveBeenCalled();
    });

    test("selects pattern directions and keeps radio and button state synchronized", () => {
        const { controller, onPatternChange, patternButtons } = createFixture();
        controller.initialize();

        controller.setSelectedPatternDirection("down");
        expect(controller.getSelectedPatternDirection()).toBe("down");
        expect(patternButtons.querySelector<HTMLInputElement>("input[value='down']")?.checked).toBe(
            true,
        );
        expect(
            patternButtons.querySelector("[data-pattern='down']")?.classList.contains("selected"),
        ).toBe(true);

        patternButtons
            .querySelector("input[value='up']")
            ?.dispatchEvent(new Event("change", { bubbles: true }));
        expect(controller.getSelectedPatternDirection()).toBe("up");
        expect(onPatternChange).toHaveBeenCalledOnce();
    });

    test("does not rebuild twice when radio markup handles the click", () => {
        const { controller, onPatternChange, patternButtons } = createFixture();
        controller.initialize();

        patternButtons.querySelector<HTMLInputElement>("input[value='down']")?.click();

        expect(onPatternChange).toHaveBeenCalledOnce();
        expect(controller.getSelectedPatternDirection()).toBe("down");
    });

    test("falls back safely for malformed pattern directions", () => {
        const { controller, patternButtons } = createFixture();
        controller.initialize();

        expect(() => controller.setSelectedPatternDirection('down"]')).not.toThrow();
        expect(controller.getSelectedPatternDirection()).toBe("up");
        expect(patternButtons.querySelector("input[value='up']")?.checked).toBe(true);
    });
});
