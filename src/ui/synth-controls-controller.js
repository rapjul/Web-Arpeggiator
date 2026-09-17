/**
 * Synth selection, envelope, and synth-specific parameter control coordination.
 *
 * @module synth-controls-controller
 */

import { setupKeyboardNavigation } from "@ui/a11y-navigation.js";

/**
 * @typedef {object} SynthControlsControllerDependencies
 * @property {{synthTypeSelect: HTMLSelectElement, waveformButtons: HTMLElement, envAttackSlider: HTMLInputElement, envAttackValue: HTMLElement|null, envDecaySlider: HTMLInputElement, envDecayValue: HTMLElement|null, envSustainSlider: HTMLInputElement, envSustainValue: HTMLElement|null, envReleaseSlider: HTMLInputElement, envReleaseValue: HTMLElement|null, harmonicitySlider: HTMLInputElement, harmonicityValue: HTMLElement|null, modIndexSlider: HTMLInputElement, modIndexValue: HTMLElement|null, dutySlider: HTMLInputElement, dutyValue: HTMLElement|null, monoCutoffSlider: HTMLInputElement|null, monoCutoffValue: HTMLElement|null, monoOctavesSlider: HTMLInputElement|null, monoOctavesValue: HTMLElement|null, monoQSlider: HTMLInputElement|null, monoQValue: HTMLElement|null, duoHarmSlider: HTMLInputElement|null, duoHarmValue: HTMLElement|null, duoVibratoSlider: HTMLInputElement|null, duoVibratoValue: HTMLElement|null, pluckDampeningSlider: HTMLInputElement|null, pluckDampeningValue: HTMLElement|null, pluckResonanceSlider: HTMLInputElement|null, pluckResonanceValue: HTMLElement|null, pluckNoiseSlider: HTMLInputElement|null, pluckNoiseValue: HTMLElement|null, membranePitchDecaySlider: HTMLInputElement|null, membranePitchDecayValue: HTMLElement|null, membraneOctavesSlider: HTMLInputElement|null, membraneOctavesValue: HTMLElement|null}} dom
 * @property {(type: string) => void} onSynthTypeChange
 * @property {(waveform: string) => void} onWaveformChange
 * @property {() => void} onEnvelopeChange
 * @property {(value: number) => void} onHarmonicityChange
 * @property {(value: number) => void} onModIndexChange
 * @property {(value: number) => void} onDutyChange
 * @property {(value: number) => void} onMonoCutoffChange
 * @property {(value: number) => void} onMonoOctavesChange
 * @property {(value: number) => void} onMonoQChange
 * @property {(value: number) => void} onDuoHarmonicityChange
 * @property {(value: number) => void} onDuoVibratoChange
 * @property {(value: number) => void} onPluckDampeningChange
 * @property {(value: number) => void} onPluckResonanceChange
 * @property {(value: number) => void} onPluckNoiseChange
 * @property {(value: number) => void} onMembranePitchDecayChange
 * @property {(value: number) => void} onMembraneOctavesChange
 */

/**
 * Binds synthesis controls while leaving audio-engine ownership with the app.
 *
 * @param {SynthControlsControllerDependencies} dependencies - Injected UI and audio actions.
 * @returns {{initialize: () => void, destroy: () => void, updateWaveformButtons: (waveform: string) => void}}
 */
export function createSynthControlsController(dependencies) {
    const {
        dom,
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
    } = dependencies;
    const {
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
    } = dom;
    let isInitialized = false;
    /** @type {AbortController | null} */
    let listenerController = null;
    /** @type {(() => void) | null} */
    let keyboardNavigationCleanup = null;

    /**
     * Reflects the selected waveform in the waveform button group.
     *
     * @param {string} waveform - Active waveform name.
     * @returns {void}
     */
    function updateWaveformButtons(waveform) {
        waveformButtons.querySelectorAll("button").forEach((button) => {
            button.classList.toggle("selected", button.getAttribute("data-wave") === waveform);
        });
    }

    /**
     * Binds a numeric slider to an injected action and its optional value label.
     *
     * @param {HTMLInputElement|null} slider - Slider that emits the value.
     * @param {HTMLElement|null} valueLabel - Readout element for the value.
     * @param {number} decimals - Decimal precision for the readout.
     * @param {(value: number) => void} onChange - App-owned audio update.
     * @param {AddEventListenerOptions} options - Listener lifecycle options.
     * @returns {void}
     */
    function bindNumericControl(slider, valueLabel, decimals, onChange, options) {
        if (!slider) return;
        slider.addEventListener(
            "input",
            () => {
                const value = parseFloat(slider.value);
                if (valueLabel) valueLabel.textContent = value.toFixed(decimals);
                onChange(value);
            },
            options,
        );
    }

    function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        listenerController = new AbortController();
        const options = { signal: listenerController.signal };
        keyboardNavigationCleanup = setupKeyboardNavigation(waveformButtons, "button.waveform-btn");
        synthTypeSelect.addEventListener(
            "change",
            () => {
                onSynthTypeChange(synthTypeSelect.value);
            },
            options,
        );
        waveformButtons.addEventListener(
            "click",
            (event) => {
                if (!(event.target instanceof Element)) return;
                const button = event.target.closest("button.waveform-btn");
                if (!button) return;
                onWaveformChange(button.getAttribute("data-wave") || "sine");
            },
            options,
        );
        bindNumericControl(envAttackSlider, envAttackValue, 2, onEnvelopeChange, options);
        bindNumericControl(envDecaySlider, envDecayValue, 2, onEnvelopeChange, options);
        bindNumericControl(envSustainSlider, envSustainValue, 2, onEnvelopeChange, options);
        bindNumericControl(envReleaseSlider, envReleaseValue, 2, onEnvelopeChange, options);
        bindNumericControl(harmonicitySlider, harmonicityValue, 1, onHarmonicityChange, options);
        bindNumericControl(modIndexSlider, modIndexValue, 1, onModIndexChange, options);
        bindNumericControl(dutySlider, dutyValue, 2, onDutyChange, options);
        bindNumericControl(monoCutoffSlider, monoCutoffValue, 0, onMonoCutoffChange, options);
        bindNumericControl(monoOctavesSlider, monoOctavesValue, 1, onMonoOctavesChange, options);
        bindNumericControl(monoQSlider, monoQValue, 1, onMonoQChange, options);
        bindNumericControl(duoHarmSlider, duoHarmValue, 2, onDuoHarmonicityChange, options);
        bindNumericControl(duoVibratoSlider, duoVibratoValue, 2, onDuoVibratoChange, options);
        bindNumericControl(
            pluckDampeningSlider,
            pluckDampeningValue,
            0,
            onPluckDampeningChange,
            options,
        );
        bindNumericControl(
            pluckResonanceSlider,
            pluckResonanceValue,
            2,
            onPluckResonanceChange,
            options,
        );
        bindNumericControl(pluckNoiseSlider, pluckNoiseValue, 1, onPluckNoiseChange, options);
        bindNumericControl(
            membranePitchDecaySlider,
            membranePitchDecayValue,
            3,
            onMembranePitchDecayChange,
            options,
        );
        bindNumericControl(
            membraneOctavesSlider,
            membraneOctavesValue,
            1,
            onMembraneOctavesChange,
            options,
        );
    }

    function destroy() {
        listenerController?.abort();
        keyboardNavigationCleanup?.();
        keyboardNavigationCleanup = null;
        listenerController = null;
        isInitialized = false;
    }

    return { initialize, destroy, updateWaveformButtons };
}
