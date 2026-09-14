import { createSynthControlsController } from "@ui/synth-controls-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";

type SynthControlsDependencies = Parameters<typeof createSynthControlsController>[0];

interface SynthControlsFixture {
    controller: ReturnType<typeof createSynthControlsController>;
    envAttackSlider: HTMLInputElement;
    envAttackValue: HTMLSpanElement;
    harmonicitySlider: HTMLInputElement;
    harmonicityValue: HTMLSpanElement;
    membranePitchDecaySlider: HTMLInputElement;
    membranePitchDecayValue: HTMLSpanElement;
    monoCutoffSlider: HTMLInputElement;
    monoCutoffValue: HTMLSpanElement;
    onEnvelopeChange: ReturnType<typeof vi.fn>;
    onHarmonicityChange: ReturnType<typeof vi.fn>;
    onMembranePitchDecayChange: ReturnType<typeof vi.fn>;
    onMonoCutoffChange: ReturnType<typeof vi.fn>;
    onSynthTypeChange: ReturnType<typeof vi.fn>;
    onWaveformChange: ReturnType<typeof vi.fn>;
    synthParameterControls: Array<{
        expectedText: string;
        onChange: ReturnType<typeof vi.fn>;
        slider: HTMLInputElement;
        valueLabel: HTMLSpanElement;
    }>;
    synthTypeSelect: HTMLSelectElement;
    waveformButtons: HTMLDivElement;
}

/** Creates a range-style input with a deterministic test value. */
function createSlider(value: string): HTMLInputElement {
    const slider = document.createElement("input");
    slider.type = "number";
    slider.value = value;
    return slider;
}

/** Creates a label for a numeric control. */
function createValueLabel(): HTMLSpanElement {
    return document.createElement("span");
}

/** Builds a complete synthesis-control fixture with app callbacks as spies. */
function createFixture(): SynthControlsFixture {
    const synthTypeSelect = document.createElement("select");
    synthTypeSelect.innerHTML =
        '<option value="synth">Synth</option><option value="fm">FM</option>';
    const waveformButtons = document.createElement("div");
    waveformButtons.innerHTML =
        '<button class="waveform-btn" data-wave="square"><span>Square</span></button>';
    const envAttackSlider = createSlider("0.42");
    const envAttackValue = createValueLabel();
    const envDecaySlider = createSlider("0.20");
    const envDecayValue = createValueLabel();
    const envSustainSlider = createSlider("0.75");
    const envSustainValue = createValueLabel();
    const envReleaseSlider = createSlider("0.50");
    const envReleaseValue = createValueLabel();
    const harmonicitySlider = createSlider("2.5");
    const harmonicityValue = createValueLabel();
    const modIndexSlider = createSlider("4.0");
    const modIndexValue = createValueLabel();
    const dutySlider = createSlider("0.25");
    const dutyValue = createValueLabel();
    const monoCutoffSlider = createSlider("750");
    const monoCutoffValue = createValueLabel();
    const monoOctavesSlider = createSlider("3.5");
    const monoOctavesValue = createValueLabel();
    const monoQSlider = createSlider("1.5");
    const monoQValue = createValueLabel();
    const duoHarmSlider = createSlider("1.25");
    const duoHarmValue = createValueLabel();
    const duoVibratoSlider = createSlider("0.25");
    const duoVibratoValue = createValueLabel();
    const pluckDampeningSlider = createSlider("4200");
    const pluckDampeningValue = createValueLabel();
    const pluckResonanceSlider = createSlider("0.85");
    const pluckResonanceValue = createValueLabel();
    const pluckNoiseSlider = createSlider("1.5");
    const pluckNoiseValue = createValueLabel();
    const membranePitchDecaySlider = createSlider("0.125");
    const membranePitchDecayValue = createValueLabel();
    const membraneOctavesSlider = createSlider("6.5");
    const membraneOctavesValue = createValueLabel();
    document.body.append(
        synthTypeSelect,
        waveformButtons,
        envAttackSlider,
        envAttackValue,
        envDecaySlider,
        envDecayValue,
        envSustainSlider,
        envSustainValue,
        envReleaseSlider,
        envReleaseValue,
        harmonicitySlider,
        harmonicityValue,
        modIndexSlider,
        modIndexValue,
        dutySlider,
        dutyValue,
        monoCutoffSlider,
        monoCutoffValue,
        monoOctavesSlider,
        monoOctavesValue,
        monoQSlider,
        monoQValue,
        duoHarmSlider,
        duoHarmValue,
        duoVibratoSlider,
        duoVibratoValue,
        pluckDampeningSlider,
        pluckDampeningValue,
        pluckResonanceSlider,
        pluckResonanceValue,
        pluckNoiseSlider,
        pluckNoiseValue,
        membranePitchDecaySlider,
        membranePitchDecayValue,
        membraneOctavesSlider,
        membraneOctavesValue,
    );

    const onSynthTypeChange = vi.fn();
    const onWaveformChange = vi.fn();
    const onEnvelopeChange = vi.fn();
    const onHarmonicityChange = vi.fn();
    const onModIndexChange = vi.fn();
    const onDutyChange = vi.fn();
    const onMonoCutoffChange = vi.fn();
    const onMonoOctavesChange = vi.fn();
    const onMonoQChange = vi.fn();
    const onDuoHarmonicityChange = vi.fn();
    const onDuoVibratoChange = vi.fn();
    const onPluckDampeningChange = vi.fn();
    const onPluckResonanceChange = vi.fn();
    const onPluckNoiseChange = vi.fn();
    const onMembranePitchDecayChange = vi.fn();
    const onMembraneOctavesChange = vi.fn();
    const dependencies: SynthControlsDependencies = {
        dom: {
            synthTypeSelect,
            waveformButtons,
            envAttackSlider,
            envAttackValue,
            envDecaySlider,
            envDecayValue,
            envSustainSlider,
            envSustainValue,
            envReleaseSlider,
            envReleaseValue,
            harmonicitySlider,
            harmonicityValue,
            modIndexSlider,
            modIndexValue,
            dutySlider,
            dutyValue,
            monoCutoffSlider,
            monoCutoffValue,
            monoOctavesSlider,
            monoOctavesValue,
            monoQSlider,
            monoQValue,
            duoHarmSlider,
            duoHarmValue,
            duoVibratoSlider,
            duoVibratoValue,
            pluckDampeningSlider,
            pluckDampeningValue,
            pluckResonanceSlider,
            pluckResonanceValue,
            pluckNoiseSlider,
            pluckNoiseValue,
            membranePitchDecaySlider,
            membranePitchDecayValue,
            membraneOctavesSlider,
            membraneOctavesValue,
        },
        onSynthTypeChange,
        onWaveformChange,
        onEnvelopeChange,
        onHarmonicityChange,
        onModIndexChange,
        onDutyChange,
        onMonoCutoffChange,
        onMonoOctavesChange,
        onMonoQChange,
        onDuoHarmonicityChange,
        onDuoVibratoChange,
        onPluckDampeningChange,
        onPluckResonanceChange,
        onPluckNoiseChange,
        onMembranePitchDecayChange,
        onMembraneOctavesChange,
    };
    const synthParameterControls = [
        {
            slider: harmonicitySlider,
            valueLabel: harmonicityValue,
            onChange: onHarmonicityChange,
            expectedText: "2.5",
        },
        {
            slider: modIndexSlider,
            valueLabel: modIndexValue,
            onChange: onModIndexChange,
            expectedText: "4.0",
        },
        {
            slider: dutySlider,
            valueLabel: dutyValue,
            onChange: onDutyChange,
            expectedText: "0.25",
        },
        {
            slider: monoCutoffSlider,
            valueLabel: monoCutoffValue,
            onChange: onMonoCutoffChange,
            expectedText: "750",
        },
        {
            slider: monoOctavesSlider,
            valueLabel: monoOctavesValue,
            onChange: onMonoOctavesChange,
            expectedText: "3.5",
        },
        {
            slider: monoQSlider,
            valueLabel: monoQValue,
            onChange: onMonoQChange,
            expectedText: "1.5",
        },
        {
            slider: duoHarmSlider,
            valueLabel: duoHarmValue,
            onChange: onDuoHarmonicityChange,
            expectedText: "1.25",
        },
        {
            slider: duoVibratoSlider,
            valueLabel: duoVibratoValue,
            onChange: onDuoVibratoChange,
            expectedText: "0.25",
        },
        {
            slider: pluckDampeningSlider,
            valueLabel: pluckDampeningValue,
            onChange: onPluckDampeningChange,
            expectedText: "4200",
        },
        {
            slider: pluckResonanceSlider,
            valueLabel: pluckResonanceValue,
            onChange: onPluckResonanceChange,
            expectedText: "0.85",
        },
        {
            slider: pluckNoiseSlider,
            valueLabel: pluckNoiseValue,
            onChange: onPluckNoiseChange,
            expectedText: "1.5",
        },
        {
            slider: membranePitchDecaySlider,
            valueLabel: membranePitchDecayValue,
            onChange: onMembranePitchDecayChange,
            expectedText: "0.125",
        },
        {
            slider: membraneOctavesSlider,
            valueLabel: membraneOctavesValue,
            onChange: onMembraneOctavesChange,
            expectedText: "6.5",
        },
    ];

    return {
        controller: createSynthControlsController(dependencies),
        envAttackSlider,
        envAttackValue,
        harmonicitySlider,
        harmonicityValue,
        membranePitchDecaySlider,
        membranePitchDecayValue,
        monoCutoffSlider,
        monoCutoffValue,
        onEnvelopeChange,
        onHarmonicityChange,
        onMembranePitchDecayChange,
        onMonoCutoffChange,
        onSynthTypeChange,
        onWaveformChange,
        synthParameterControls,
        synthTypeSelect,
        waveformButtons,
    };
}

describe("synth controls controller", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    test("delegates synth selection and nested waveform button clicks", () => {
        const {
            controller,
            onSynthTypeChange,
            onWaveformChange,
            synthTypeSelect,
            waveformButtons,
        } = createFixture();
        controller.initialize();

        synthTypeSelect.value = "fm";
        synthTypeSelect.dispatchEvent(new Event("change"));
        waveformButtons.querySelector("span")?.dispatchEvent(new Event("click", { bubbles: true }));

        expect(onSynthTypeChange).toHaveBeenCalledWith("fm");
        expect(onWaveformChange).toHaveBeenCalledWith("square");
    });

    test("formats envelope and synth-specific values before calling app actions", () => {
        const {
            controller,
            envAttackSlider,
            envAttackValue,
            harmonicitySlider,
            harmonicityValue,
            membranePitchDecaySlider,
            membranePitchDecayValue,
            monoCutoffSlider,
            monoCutoffValue,
            onEnvelopeChange,
            onHarmonicityChange,
            onMembranePitchDecayChange,
            onMonoCutoffChange,
        } = createFixture();
        controller.initialize();

        envAttackSlider.dispatchEvent(new Event("input"));
        harmonicitySlider.dispatchEvent(new Event("input"));
        monoCutoffSlider.dispatchEvent(new Event("input"));
        membranePitchDecaySlider.dispatchEvent(new Event("input"));

        expect(envAttackValue.textContent).toBe("0.42");
        expect(onEnvelopeChange).toHaveBeenCalledOnce();
        expect(harmonicityValue.textContent).toBe("2.5");
        expect(onHarmonicityChange).toHaveBeenCalledWith(2.5);
        expect(monoCutoffValue.textContent).toBe("750");
        expect(onMonoCutoffChange).toHaveBeenCalledWith(750);
        expect(membranePitchDecayValue.textContent).toBe("0.125");
        expect(onMembranePitchDecayChange).toHaveBeenCalledWith(0.125);
    });

    test("wires every synth-specific slider to its matching formatted callback", () => {
        const { controller, synthParameterControls } = createFixture();
        controller.initialize();

        synthParameterControls.forEach(({ expectedText, onChange, slider, valueLabel }) => {
            slider.dispatchEvent(new Event("input"));
            expect(valueLabel.textContent).toBe(expectedText);
            expect(onChange).toHaveBeenCalledWith(Number(slider.value));
        });
    });

    test("removes bindings on teardown and avoids duplicate initialization", () => {
        const { controller, envAttackSlider, onEnvelopeChange } = createFixture();
        controller.initialize();
        controller.initialize();

        envAttackSlider.dispatchEvent(new Event("input"));
        expect(onEnvelopeChange).toHaveBeenCalledOnce();

        controller.destroy();
        envAttackSlider.dispatchEvent(new Event("input"));
        expect(onEnvelopeChange).toHaveBeenCalledOnce();
    });
});
