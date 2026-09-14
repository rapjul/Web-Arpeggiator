import { createEffectsControlsController } from "@ui/effects-controls-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";

type EffectsControlsDependencies = Parameters<typeof createEffectsControlsController>[0];

interface EffectsControlsFixture {
    controller: ReturnType<typeof createEffectsControlsController>;
    effectControls: Array<{
        expectedText: string;
        onChange: ReturnType<typeof vi.fn>;
        slider: HTMLInputElement;
        valueLabel: HTMLSpanElement;
    }>;
    filterCutoffSlider: HTMLInputElement;
    filterCutoffValue: HTMLSpanElement;
    formatPostGain: ReturnType<typeof vi.fn>;
    onFilterCutoffChange: ReturnType<typeof vi.fn>;
    onPostGainChange: ReturnType<typeof vi.fn>;
    postGainSlider: HTMLInputElement;
    postGainValue: HTMLSpanElement;
}

/** Creates an input slider with a deterministic numeric value. */
function createSlider(value: string): HTMLInputElement {
    const slider = document.createElement("input");
    slider.type = "number";
    slider.value = value;
    return slider;
}

/** Builds all effect controls with callbacks that represent app-owned audio updates. */
function createFixture(): EffectsControlsFixture {
    const postGainSlider = createSlider("-12");
    const postGainValue = document.createElement("span");
    const filterCutoffSlider = createSlider("3200");
    const filterCutoffValue = document.createElement("span");
    const filterResonanceSlider = createSlider("1.5");
    const filterResonanceValue = document.createElement("span");
    const driveMixSlider = createSlider("0.25");
    const driveMixValue = document.createElement("span");
    const chorusMixSlider = createSlider("0.35");
    const chorusMixValue = document.createElement("span");
    const autoPanMixSlider = createSlider("0.45");
    const autoPanMixValue = document.createElement("span");
    const delayMixSlider = createSlider("0.50");
    const delayMixValue = document.createElement("span");
    const reverbMixSlider = createSlider("0.60");
    const reverbMixValue = document.createElement("span");
    document.body.append(
        postGainSlider,
        postGainValue,
        filterCutoffSlider,
        filterCutoffValue,
        filterResonanceSlider,
        filterResonanceValue,
        driveMixSlider,
        driveMixValue,
        chorusMixSlider,
        chorusMixValue,
        autoPanMixSlider,
        autoPanMixValue,
        delayMixSlider,
        delayMixValue,
        reverbMixSlider,
        reverbMixValue,
    );

    const formatPostGain = vi.fn((value: number) => Math.round((value + 60) * (100 / 60)));
    const onPostGainChange = vi.fn();
    const onFilterCutoffChange = vi.fn();
    const onFilterResonanceChange = vi.fn();
    const onDriveMixChange = vi.fn();
    const onChorusMixChange = vi.fn();
    const onAutoPanMixChange = vi.fn();
    const onDelayMixChange = vi.fn();
    const onReverbMixChange = vi.fn();
    const dependencies: EffectsControlsDependencies = {
        dom: {
            postGainSlider,
            postGainValue,
            filterCutoffSlider,
            filterCutoffValue,
            filterResonanceSlider,
            filterResonanceValue,
            driveMixSlider,
            driveMixValue,
            chorusMixSlider,
            chorusMixValue,
            autoPanMixSlider,
            autoPanMixValue,
            delayMixSlider,
            delayMixValue,
            reverbMixSlider,
            reverbMixValue,
        },
        formatPostGain,
        onPostGainChange,
        onFilterCutoffChange,
        onFilterResonanceChange,
        onDriveMixChange,
        onChorusMixChange,
        onAutoPanMixChange,
        onDelayMixChange,
        onReverbMixChange,
    };
    const effectControls = [
        {
            slider: filterCutoffSlider,
            valueLabel: filterCutoffValue,
            onChange: onFilterCutoffChange,
            expectedText: "3200",
        },
        {
            slider: filterResonanceSlider,
            valueLabel: filterResonanceValue,
            onChange: onFilterResonanceChange,
            expectedText: "1.5",
        },
        {
            slider: driveMixSlider,
            valueLabel: driveMixValue,
            onChange: onDriveMixChange,
            expectedText: "0.25",
        },
        {
            slider: chorusMixSlider,
            valueLabel: chorusMixValue,
            onChange: onChorusMixChange,
            expectedText: "0.35",
        },
        {
            slider: autoPanMixSlider,
            valueLabel: autoPanMixValue,
            onChange: onAutoPanMixChange,
            expectedText: "0.45",
        },
        {
            slider: delayMixSlider,
            valueLabel: delayMixValue,
            onChange: onDelayMixChange,
            expectedText: "0.50",
        },
        {
            slider: reverbMixSlider,
            valueLabel: reverbMixValue,
            onChange: onReverbMixChange,
            expectedText: "0.60",
        },
    ];

    return {
        controller: createEffectsControlsController(dependencies),
        effectControls,
        filterCutoffSlider,
        filterCutoffValue,
        formatPostGain,
        onFilterCutoffChange,
        onPostGainChange,
        postGainSlider,
        postGainValue,
    };
}

describe("effects controls controller", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    test("formats post gain through the injected conversion before updating audio", () => {
        const { controller, formatPostGain, onPostGainChange, postGainSlider, postGainValue } =
            createFixture();
        controller.initialize();

        postGainSlider.dispatchEvent(new Event("input"));

        expect(formatPostGain).toHaveBeenCalledWith(-12);
        expect(postGainValue.textContent).toBe("80");
        expect(onPostGainChange).toHaveBeenCalledWith(-12);
    });

    test("wires every filter and mix slider to its formatted app callback", () => {
        const { controller, effectControls } = createFixture();
        controller.initialize();

        effectControls.forEach(({ expectedText, onChange, slider, valueLabel }) => {
            slider.dispatchEvent(new Event("input"));
            expect(valueLabel.textContent).toBe(expectedText);
            expect(onChange).toHaveBeenCalledWith(Number(slider.value));
        });
    });

    test("removes bindings on teardown and avoids duplicate initialization", () => {
        const { controller, filterCutoffSlider, onFilterCutoffChange } = createFixture();
        controller.initialize();
        controller.initialize();

        filterCutoffSlider.dispatchEvent(new Event("input"));
        expect(onFilterCutoffChange).toHaveBeenCalledOnce();

        controller.destroy();
        filterCutoffSlider.dispatchEvent(new Event("input"));
        expect(onFilterCutoffChange).toHaveBeenCalledOnce();
    });
});
