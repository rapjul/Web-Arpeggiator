import { createPatternControlsController } from "@ui/pattern-controls-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";

type PatternControlsDependencies = Parameters<typeof createPatternControlsController>[0];
type OpenChordConflict = NonNullable<PatternControlsDependencies["openChordConflict"]>;
type ChordConflictDetails = Parameters<OpenChordConflict>[0];

interface PatternControlsFixture {
    buildChordString: ReturnType<typeof vi.fn>;
    chordButton: HTMLButtonElement;
    controller: ReturnType<typeof createPatternControlsController>;
    debounceCancel: ReturnType<typeof vi.fn>;
    dependencies: PatternControlsDependencies;
    flushDebouncedPatternChange: () => void;
    gateSlider: HTMLInputElement;
    gateValue: HTMLSpanElement;
    generateRandomNotes: ReturnType<typeof vi.fn>;
    intervalSelect: HTMLSelectElement;
    normalizeNotes: ReturnType<typeof vi.fn>;
    notesInput: HTMLInputElement;
    octaveRangeButtons: HTMLDivElement;
    octaveShiftButtons: HTMLDivElement;
    onClearActiveSoundStarter: ReturnType<typeof vi.fn>;
    onEstimatedDurationChange: ReturnType<typeof vi.fn>;
    onNotesSelected: ReturnType<typeof vi.fn>;
    onPatternChange: ReturnType<typeof vi.fn>;
    onReshuffle: ReturnType<typeof vi.fn>;
    onStaticLoopChange: ReturnType<typeof vi.fn>;
    openChordConflict: ReturnType<typeof vi.fn>;
    patternButtons: HTMLDivElement;
    randomizeNotesButton: HTMLButtonElement;
    reshufflePatternButton: HTMLButtonElement;
    resolveChordConflict: ReturnType<typeof vi.fn>;
    resolveChordDefinition: ReturnType<typeof vi.fn>;
    scaleQuantizeToggle: HTMLInputElement;
    scaleQuantizeToggleStatus: HTMLSpanElement;
    scaleRootSelect: HTMLSelectElement;
    scaleTypeSelect: HTMLSelectElement;
    setNotes: ReturnType<typeof vi.fn>;
    setOctaveRange: ReturnType<typeof vi.fn>;
    setOctaveShift: ReturnType<typeof vi.fn>;
    showToast: ReturnType<typeof vi.fn>;
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
        '<label class="pattern-btn" data-pattern="randomCycle"><input type="radio" name="pattern-direction" value="randomCycle"></label>',
        '<label class="pattern-btn" data-pattern="randomWalk"><input type="radio" name="pattern-direction" value="randomWalk"></label>',
        '<label class="pattern-btn" data-pattern="randomWalkDrunk"><input type="radio" name="pattern-direction" value="randomWalkDrunk"></label>',
    ].join("");
    const reshufflePatternButton = document.createElement("button");
    const randomizeNotesButton = document.createElement("button");
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
        randomizeNotesButton,
        chordButtonsContainer,
    );

    const queuedPatternChanges: Array<() => void> = [];
    const normalizeNotes = vi.fn((notes: string[]) => notes.map((note) => note.toUpperCase()));
    const setNotes = vi.fn();
    const setOctaveShift = vi.fn();
    const setOctaveRange = vi.fn();
    const onPatternChange = vi.fn();
    const onEstimatedDurationChange = vi.fn();
    const onReshuffle = vi.fn();
    const onStaticLoopChange = vi.fn();
    const onNotesSelected = vi.fn();
    const onClearActiveSoundStarter = vi.fn();
    const showToast = vi.fn();
    const generateRandomNotes = vi.fn(() => ["C4", "Eb4", "G4", "Bb4"]);
    const buildChordString = vi.fn(() => "C4 D#4 G4");
    const resolveChordDefinition = vi.fn(() => ({ name: "Minor" }));
    const resolveChordConflict = vi.fn(() => ({
        hasConflict: false,
        chordName: "Minor",
        root: "C",
        requestedNotes: ["C4", "D#4", "G4"],
        adaptedNotes: ["C4", "D4", "G4"],
        changedPitches: [],
    }));
    const openChordConflict = vi.fn();
    const debounceCancel = vi.fn();
    const debounce: PatternControlsDependencies["debounce"] = (callback) => {
        const debounced = () => {
            queuedPatternChanges.push(callback);
        };
        debounced.cancel = debounceCancel;
        return debounced;
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
            randomizeNotesButton,
            reshufflePatternButton,
            chordButtons: chordButtonsContainer.querySelectorAll(".chord-btn"),
        },
        normalizeNotes,
        setNotes,
        setOctaveShift,
        setOctaveRange,
        onPatternChange,
        onEstimatedDurationChange,
        onStaticLoopChange,
        onReshuffle,
        onNotesSelected,
        onClearActiveSoundStarter,
        showToast,
        generateRandomNotes,
        buildChordString,
        resolveChordDefinition,
        resolveChordConflict,
        openChordConflict,
        debounce,
    };

    return {
        buildChordString,
        chordButton,
        controller: createPatternControlsController(dependencies),
        debounceCancel,
        dependencies,
        flushDebouncedPatternChange: () => {
            queuedPatternChanges.splice(0).forEach((callback) => {
                callback();
            });
        },
        gateSlider,
        gateValue,
        generateRandomNotes,
        intervalSelect,
        normalizeNotes,
        notesInput,
        octaveRangeButtons,
        octaveShiftButtons,
        onClearActiveSoundStarter,
        onEstimatedDurationChange,
        onNotesSelected,
        onPatternChange,
        onReshuffle,
        onStaticLoopChange,
        openChordConflict,
        patternButtons,
        randomizeNotesButton,
        reshufflePatternButton,
        resolveChordConflict,
        resolveChordDefinition,
        scaleQuantizeToggle,
        scaleQuantizeToggleStatus,
        scaleRootSelect,
        scaleTypeSelect,
        setNotes,
        setOctaveRange,
        setOctaveShift,
        showToast,
    };
}

describe("pattern controls controller", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    test("normalizes committed notes and rebuilds the pattern while editing", () => {
        const {
            controller,
            flushDebouncedPatternChange,
            normalizeNotes,
            notesInput,
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
        expect(onPatternChange).toHaveBeenCalledOnce();
        flushDebouncedPatternChange();
        expect(onPatternChange).toHaveBeenCalledTimes(2);
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

    test("adapts a conflicting chord when the optional dialog callback is unavailable", () => {
        const fixture = createFixture();
        fixture.scaleTypeSelect.value = "major";
        fixture.scaleQuantizeToggle.checked = true;
        fixture.resolveChordConflict.mockReturnValue({
            hasConflict: true,
            chordName: "Minor",
            root: "C",
            requestedNotes: ["C4", "D#4", "G4"],
            adaptedNotes: ["C4", "D4", "G4"],
            changedPitches: [{ requested: "D#4", adapted: "D4" }],
        });
        const { openChordConflict: _unusedDialog, ...dependenciesWithoutDialog } =
            fixture.dependencies;
        const controller = createPatternControlsController(dependenciesWithoutDialog);
        controller.initialize();

        fixture.chordButton.click();

        expect(fixture.onNotesSelected).toHaveBeenCalledWith(["C4", "D4", "G4"]);
        expect(fixture.scaleQuantizeToggle.checked).toBe(true);
        expect(fixture.showToast).toHaveBeenCalledWith(
            "Loaded an adapted C Minor chord.",
            "success",
        );
        controller.destroy();
        fixture.controller.destroy();
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

        // Click on the button is guarded because the container has radio inputs
        octaveShiftButtons
            .querySelector("button")
            ?.dispatchEvent(new Event("click", { bubbles: true }));
        expect(setOctaveShift).not.toHaveBeenCalled();

        // Only the radio change handler fires
        const shiftInput = octaveShiftButtons.querySelector("input");
        shiftInput?.dispatchEvent(new Event("change", { bubbles: true }));
        const rangeInput = octaveRangeButtons.querySelector("input");
        rangeInput?.dispatchEvent(new Event("change", { bubbles: true }));
        expect(setOctaveShift).toHaveBeenCalledWith(1);
        expect(setOctaveRange).toHaveBeenCalledWith(2);
        expect(onPatternChange).toHaveBeenCalledTimes(2);
        expect(onStaticLoopChange).toHaveBeenCalledTimes(2);
        expect(octaveShiftButtons.querySelector("label")?.classList.contains("selected")).toBe(
            true,
        );
        expect(octaveRangeButtons.querySelector("input")?.checked).toBe(true);

        gateSlider.value = "0.75";
        gateSlider.dispatchEvent(new Event("input"));
        expect(gateValue.textContent).toBe("0.75");
        expect(onPatternChange).toHaveBeenCalledTimes(2);
        flushDebouncedPatternChange();
        expect(onPatternChange).toHaveBeenCalledTimes(3);
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

    test("cancels debounced rebuild when a committed change arrives after input", () => {
        const {
            controller,
            debounceCancel,
            flushDebouncedPatternChange,
            notesInput,
            onPatternChange,
        } = createFixture();
        controller.initialize();

        // Simulate input → change sequence as dispatched by onNotesSelected
        notesInput.value = "D4 F4 A4";
        notesInput.dispatchEvent(new Event("input", { bubbles: true }));
        notesInput.dispatchEvent(new Event("change", { bubbles: true }));

        expect(debounceCancel).toHaveBeenCalledTimes(1);
        expect(onPatternChange).toHaveBeenCalledOnce();

        // Flushing queued debounced callbacks should not produce a second rebuild
        flushDebouncedPatternChange();
        expect(onPatternChange).toHaveBeenCalledOnce();
    });

    test("destroy cancels any pending debounced pattern change timer", () => {
        const { controller, debounceCancel } = createFixture();
        controller.initialize();
        controller.destroy();

        expect(debounceCancel).toHaveBeenCalledTimes(1);
    });

    test("enables reshuffle button for all stochastic directions and disables for deterministic ones", () => {
        const { controller, reshufflePatternButton } = createFixture();
        controller.initialize();

        controller.setSelectedPatternDirection("up");
        expect(reshufflePatternButton.disabled).toBe(true);

        controller.setSelectedPatternDirection("random");
        expect(reshufflePatternButton.disabled).toBe(false);

        controller.setSelectedPatternDirection("randomCycle");
        expect(reshufflePatternButton.disabled).toBe(false);

        controller.setSelectedPatternDirection("randomWalk");
        expect(reshufflePatternButton.disabled).toBe(false);

        controller.setSelectedPatternDirection("randomWalkDrunk");
        expect(reshufflePatternButton.disabled).toBe(false);

        controller.setSelectedPatternDirection("down");
        expect(reshufflePatternButton.disabled).toBe(true);
    });

    test("generates random notes and updates UI based on scale quantization mode", () => {
        const {
            controller,
            generateRandomNotes,
            onClearActiveSoundStarter,
            onNotesSelected,
            randomizeNotesButton,
            scaleQuantizeToggle,
            scaleRootSelect,
            scaleTypeSelect,
            showToast,
        } = createFixture();
        controller.initialize();

        // 1. Quantized mode (Minor)
        scaleQuantizeToggle.checked = true;
        scaleTypeSelect.value = "minor";
        scaleRootSelect.value = "C";

        randomizeNotesButton.click();
        expect(generateRandomNotes).toHaveBeenCalledWith("C", "minor");
        expect(onClearActiveSoundStarter).toHaveBeenCalled();
        expect(onNotesSelected).toHaveBeenCalledWith(["C4", "Eb4", "G4", "Bb4"]);
        expect(showToast).toHaveBeenCalledWith("Randomized notes using C Minor!", "success");

        // 2. Unquantized mode (Chromatic)
        scaleQuantizeToggle.checked = false;
        scaleTypeSelect.value = "chromatic";
        randomizeNotesButton.click();
        expect(generateRandomNotes).toHaveBeenCalledWith(expect.any(String), "chromatic");
        expect(showToast).toHaveBeenCalledWith(
            expect.stringContaining("Randomized notes using"),
            "success",
        );
    });

    test("builds and selects chords when chord buttons are clicked", () => {
        const {
            buildChordString,
            chordButton,
            controller,
            onClearActiveSoundStarter,
            onNotesSelected,
            resolveChordDefinition,
            scaleRootSelect,
            showToast,
        } = createFixture();
        controller.initialize();

        scaleRootSelect.value = "D";
        chordButton.click();

        expect(buildChordString).toHaveBeenCalledWith("minor", "D");
        expect(resolveChordDefinition).toHaveBeenCalledWith("minor");
        expect(onClearActiveSoundStarter).toHaveBeenCalled();
        expect(onNotesSelected).toHaveBeenCalledWith(["C4", "D#4", "G4"]);
        expect(showToast).toHaveBeenCalledWith("Loaded D Minor chord!", "success");
    });

    test("handles button-only clicks for pattern direction without radio inputs", () => {
        const { controller, onPatternChange, patternButtons } = createFixture();
        // Replace container children with button-only markup
        patternButtons.innerHTML = `
            <button class="pattern-btn" data-pattern="up">Up</button>
            <button class="pattern-btn" data-pattern="down">Down</button>
            <div class="empty-target">No pattern</div>
        `;
        controller.initialize();

        const downBtn = patternButtons.querySelector<HTMLButtonElement>('[data-pattern="down"]');
        downBtn?.click();

        expect(controller.getSelectedPatternDirection()).toBe("down");
        expect(downBtn?.classList.contains("selected")).toBe(true);
        expect(onPatternChange).toHaveBeenCalledOnce();

        // Clicking element with no data-pattern does nothing
        const emptyDiv = patternButtons.querySelector(".empty-target");
        emptyDiv?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(onPatternChange).toHaveBeenCalledOnce();
    });

    test("handles button-only clicks for octave controls without radio inputs", () => {
        const {
            controller,
            octaveRangeButtons,
            octaveShiftButtons,
            onPatternChange,
            onStaticLoopChange,
            setOctaveRange,
            setOctaveShift,
        } = createFixture();
        // Replace with button-only markup
        octaveShiftButtons.innerHTML = `
            <button class="octave-btn" data-shift="-2">-2</button>
            <button class="octave-btn" data-shift="2">2</button>
        `;
        octaveRangeButtons.innerHTML = `
            <button class="octave-btn" data-range="1">1</button>
            <button class="octave-btn" data-range="4">4</button>
        `;
        controller.initialize();

        const shiftBtn = octaveShiftButtons.querySelector<HTMLButtonElement>('[data-shift="2"]');
        shiftBtn?.click();
        expect(setOctaveShift).toHaveBeenCalledWith(2);
        expect(shiftBtn?.classList.contains("selected")).toBe(true);
        expect(onPatternChange).toHaveBeenCalledTimes(1);
        expect(onStaticLoopChange).toHaveBeenCalledTimes(1);

        const rangeBtn = octaveRangeButtons.querySelector<HTMLButtonElement>('[data-range="4"]');
        rangeBtn?.click();
        expect(setOctaveRange).toHaveBeenCalledWith(4);
        expect(rangeBtn?.classList.contains("selected")).toBe(true);
        expect(onPatternChange).toHaveBeenCalledTimes(2);
        expect(onStaticLoopChange).toHaveBeenCalledTimes(2);
    });

    test("falls back to C4 when notesInput change has whitespace only", () => {
        const { controller, normalizeNotes, notesInput, onPatternChange, setNotes } =
            createFixture();
        controller.initialize();

        normalizeNotes.mockReturnValueOnce([]);
        notesInput.value = "   ";
        notesInput.dispatchEvent(new Event("change"));

        expect(setNotes).toHaveBeenCalledWith(["C4"]);
        expect(onPatternChange).toHaveBeenCalledOnce();
    });
});
