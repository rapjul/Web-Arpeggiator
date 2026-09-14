/**
 * Post-gain, filter, and effects control coordination.
 *
 * @module effects-controls-controller
 */

/**
 * @typedef {object} EffectsControlsControllerDependencies
 * @property {{postGainSlider: HTMLInputElement, postGainValue: HTMLElement|null, filterCutoffSlider: HTMLInputElement, filterCutoffValue: HTMLElement|null, filterResonanceSlider: HTMLInputElement, filterResonanceValue: HTMLElement|null, driveMixSlider: HTMLInputElement|null, driveMixValue: HTMLElement|null, chorusMixSlider: HTMLInputElement|null, chorusMixValue: HTMLElement|null, autoPanMixSlider: HTMLInputElement|null, autoPanMixValue: HTMLElement|null, delayMixSlider: HTMLInputElement, delayMixValue: HTMLElement|null, reverbMixSlider: HTMLInputElement, reverbMixValue: HTMLElement|null}} dom
 * @property {(db: number) => string|number} formatPostGain
 * @property {(value: number) => void} onPostGainChange
 * @property {(value: number) => void} onFilterCutoffChange
 * @property {(value: number) => void} onFilterResonanceChange
 * @property {(value: number) => void} onDriveMixChange
 * @property {(value: number) => void} onChorusMixChange
 * @property {(value: number) => void} onAutoPanMixChange
 * @property {(value: number) => void} onDelayMixChange
 * @property {(value: number) => void} onReverbMixChange
 */

/**
 * Binds audio effect controls while leaving audio graph ownership with the app.
 *
 * @param {EffectsControlsControllerDependencies} dependencies - Injected UI and audio actions.
 * @returns {{initialize: () => void, destroy: () => void}}
 */
export function createEffectsControlsController(dependencies) {
    const {
        dom,
        formatPostGain,
        onPostGainChange,
        onFilterCutoffChange,
        onFilterResonanceChange,
        onDriveMixChange,
        onChorusMixChange,
        onAutoPanMixChange,
        onDelayMixChange,
        onReverbMixChange,
    } = dependencies;
    const {
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
    } = dom;
    let isInitialized = false;
    /** @type {AbortController | null} */
    let listenerController = null;

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
        postGainSlider.addEventListener(
            "input",
            () => {
                const value = parseFloat(postGainSlider.value);
                if (postGainValue) postGainValue.textContent = String(formatPostGain(value));
                onPostGainChange(value);
            },
            options,
        );
        bindNumericControl(filterCutoffSlider, filterCutoffValue, 0, onFilterCutoffChange, options);
        bindNumericControl(
            filterResonanceSlider,
            filterResonanceValue,
            1,
            onFilterResonanceChange,
            options,
        );
        bindNumericControl(driveMixSlider, driveMixValue, 2, onDriveMixChange, options);
        bindNumericControl(chorusMixSlider, chorusMixValue, 2, onChorusMixChange, options);
        bindNumericControl(autoPanMixSlider, autoPanMixValue, 2, onAutoPanMixChange, options);
        bindNumericControl(delayMixSlider, delayMixValue, 2, onDelayMixChange, options);
        bindNumericControl(reverbMixSlider, reverbMixValue, 2, onReverbMixChange, options);
    }

    function destroy() {
        listenerController?.abort();
        listenerController = null;
        isInitialized = false;
    }

    return { initialize, destroy };
}
