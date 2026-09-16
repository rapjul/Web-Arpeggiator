import { createPatternControlsController } from "@ui/pattern-controls-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";

type PatternControlsDependencies = Parameters<typeof createPatternControlsController>[0];

interface PatternControlsFixture {
    controller: ReturnType<typeof createPatternControlsController>;
    flushDebouncedPatternChange: () => void;
    gateSlider: HTMLInputElement;
    gateValue: HTMLSpanElement;
    intervalSelect: HTMLSelectElement;
    notesInput: HTMLInputElement;
    normalizeNotes: ReturnType<typeof vi.fn>;
    onEstimatedDurationChange: ReturnType<typeof vi.fn>;
    onPatternChange: ReturnType<typeof vi.fn>;
    onStaticLoopChange: ReturnType<typeof vi.fn>;
    patternButtons: HTMLDivElement;
    octaveRangeButtons: HTMLDivElement;
    octaveShiftButtons: HTMLDivElement;
    scaleQuantizeToggle: HTMLInputElement;
    scaleQuantizeToggleStatus: HTMLSpanElement;
    scaleRootSelect: HTMLSelectElement;
    scaleTypeSelect: HTMLSelectElement;
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
        '<label class="pattern-btn" data-pattern="up"><input type="radio" name="pattern-direction" value="up"></label>',
        '<label class="pattern-btn" data-pattern="down"><input type="radio" name="pattern-direction" value="down"></label>',
    ].join("");
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
    );

    const queuedPatternChanges: Array<() => void> = [];
    const normalizeNotes = vi.fn((notes: string[]) => notes.map((note) => note.toUpperCase()));
    const setNotes = vi.fn();
    const setOctaveShift = vi.fn();
    const setOctaveRange = vi.fn();
    const onPatternChange = vi.fn();
    const onEstimatedDurationChange = vi.fn();
    const onStaticLoopChange = vi.fn();
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
            chordButtons: document.querySelectorAll(".chord-btn"),
        },
        normalizeNotes,
        setNotes,
        setOctaveShift,
        setOctaveRange,
        onPatternChange,
        onEstimatedDurationChange,
        onStaticLoopChange,
        debounce,
    };

    return {
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
        onEstimatedDurationChange,
        onPatternChange,
        onStaticLoopChange,
        octaveRangeButtons,
        octaveShiftButtons,
        patternButtons,
        scaleQuantizeToggle,
        scaleQuantizeToggleStatus,
        scaleRootSelect,
        scaleTypeSelect,
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
        expect(scaleTypeSelect.value).toBe("chromatic");

        scaleQuantizeToggle.checked = true;
        scaleQuantizeToggle.dispatchEvent(new Event("change"));
        expect(scaleTypeSelect.value).toBe("minor");

        scaleRootSelect.value = "D";
        scaleRootSelect.dispatchEvent(new Event("change"));
        expect(onPatternChange).toHaveBeenCalledTimes(4);
        expect(scaleQuantizeToggleStatus.textContent).toBe("Enabled");
        expect(scaleRootSelect.disabled).toBe(false);
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
