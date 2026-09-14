/**
 * Pattern, scale, octave, and gate control coordination.
 *
 * @module pattern-controls-controller
 */

/**
 * @typedef {object} PatternControlsControllerDependencies
 * @property {{notesInput: HTMLInputElement, intervalSelect: HTMLSelectElement, gateSlider: HTMLInputElement, gateValue: HTMLElement|null, scaleQuantizeToggle: HTMLInputElement, scaleTypeSelect: HTMLSelectElement, scaleRootSelect: HTMLSelectElement, octaveShiftButtons: HTMLElement, octaveRangeButtons: HTMLElement}} dom
 * @property {(notes: string[]) => string[]} normalizeNotes
 * @property {(notes: string[]) => void} setNotes
 * @property {(value: number) => void} setOctaveShift
 * @property {(value: number) => void} setOctaveRange
 * @property {() => void} onPatternChange
 * @property {() => void} onEstimatedDurationChange
 * @property {() => void} onStaticLoopChange
 * @property {() => void} onScaleQuantizeUiChange
 * @property {() => void} onScaleQuantizeTextChange
 * @property {(callback: () => void, wait: number) => () => void} debounce
 */

/**
 * Binds pattern controls without taking ownership of application or audio
 * state.
 *
 * @param {PatternControlsControllerDependencies} dependencies - Injected UI and app behavior.
 * @returns {{initialize: () => void, destroy: () => void}}
 */
export function createPatternControlsController(dependencies) {
    const {
        dom,
        normalizeNotes,
        setNotes,
        setOctaveShift,
        setOctaveRange,
        onPatternChange,
        onEstimatedDurationChange,
        onStaticLoopChange,
        onScaleQuantizeUiChange,
        onScaleQuantizeTextChange,
        debounce,
    } = dependencies;
    const {
        notesInput,
        intervalSelect,
        gateSlider,
        gateValue,
        scaleQuantizeToggle,
        scaleTypeSelect,
        scaleRootSelect,
        octaveShiftButtons,
        octaveRangeButtons,
    } = dom;
    let isInitialized = false;
    let lastActiveScaleType = "major";
    /** @type {AbortController | null} */
    let listenerController = null;
    const debouncedPatternChange = debounce(onPatternChange, 50);

    /** @param {HTMLElement} container @param {number} selectedValue @param {string} dataAttribute */
    function updateButtonGroup(container, selectedValue, dataAttribute) {
        const radio = container.querySelector(
            `input[type="radio"][${dataAttribute}="${selectedValue}"], input[type="radio"][value="${selectedValue}"]`,
        );
        if (radio) /** @type {HTMLInputElement} */ (radio).checked = true;
        container.querySelectorAll(".octave-btn, button").forEach((button) => {
            const valueControl = button.matches(`[${dataAttribute}]`)
                ? button
                : button.querySelector(`[${dataAttribute}]`);
            button.classList.toggle(
                "selected",
                valueControl !== null &&
                    Number(valueControl.getAttribute(dataAttribute)) === selectedValue,
            );
        });
    }

    /** @param {HTMLElement} container @param {string} attribute @param {number} fallback */
    function handleOctaveChange(container, attribute, fallback) {
        return (event) => {
            const target = /** @type {HTMLInputElement} */ (event.target);
            if (target?.value === undefined) return;
            const value = parseInt(target.value, 10) || fallback;
            if (attribute === "data-shift") setOctaveShift(value);
            else setOctaveRange(value);
            updateButtonGroup(container, value, attribute);
            onPatternChange();
            onStaticLoopChange();
        };
    }

    /** @param {HTMLElement} container @param {string} attribute */
    function handleOctaveClick(container, attribute) {
        return (event) => {
            if (!(event.target instanceof Element)) return;
            const target = event.target.closest("button, label");
            const button =
                target?.tagName === "BUTTON" ? target : target?.querySelector(`[${attribute}]`);
            const value = button?.getAttribute(attribute);
            if (value === null || value === undefined) return;
            const parsed = parseInt(value, 10);
            if (attribute === "data-shift") setOctaveShift(parsed);
            else setOctaveRange(parsed);
            updateButtonGroup(container, parsed, attribute);
            onPatternChange();
            onStaticLoopChange();
        };
    }

    function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        listenerController = new AbortController();
        const options = { signal: listenerController.signal };
        notesInput.addEventListener(
            "change",
            () => {
                const raw = notesInput.value.trim().split(/\s+/).filter(Boolean);
                const normalized = normalizeNotes(raw);
                const nextNotes = normalized.length > 0 ? normalized : raw.length ? raw : ["C4"];
                if (normalized.length > 0) notesInput.value = normalized.join(" ");
                setNotes(nextNotes);
                onPatternChange();
            },
            options,
        );
        notesInput.addEventListener(
            "input",
            () => {
                const nextNotes = notesInput.value.trim().split(/\s+/).filter(Boolean);
                setNotes(nextNotes.length > 0 ? nextNotes : ["C4"]);
                onEstimatedDurationChange();
            },
            options,
        );
        intervalSelect.addEventListener("change", onPatternChange, options);
        gateSlider.addEventListener(
            "input",
            () => {
                if (gateValue) gateValue.textContent = parseFloat(gateSlider.value).toFixed(2);
                debouncedPatternChange();
            },
            options,
        );
        scaleQuantizeToggle.addEventListener(
            "change",
            () => {
                if (scaleQuantizeToggle.checked && scaleTypeSelect.value === "chromatic")
                    scaleTypeSelect.value = lastActiveScaleType;
                if (!scaleQuantizeToggle.checked) {
                    if (scaleTypeSelect.value !== "chromatic")
                        lastActiveScaleType = scaleTypeSelect.value;
                    scaleTypeSelect.value = "chromatic";
                }
                onScaleQuantizeUiChange();
                onScaleQuantizeTextChange();
                onPatternChange();
            },
            options,
        );
        scaleTypeSelect.addEventListener(
            "change",
            () => {
                scaleQuantizeToggle.checked = scaleTypeSelect.value !== "chromatic";
                if (scaleQuantizeToggle.checked) lastActiveScaleType = scaleTypeSelect.value;
                onScaleQuantizeUiChange();
                onScaleQuantizeTextChange();
                onPatternChange();
            },
            options,
        );
        scaleRootSelect.addEventListener("change", onPatternChange, options);
        octaveShiftButtons.addEventListener(
            "change",
            handleOctaveChange(octaveShiftButtons, "data-shift", 0),
            options,
        );
        octaveShiftButtons.addEventListener(
            "click",
            handleOctaveClick(octaveShiftButtons, "data-shift"),
            options,
        );
        octaveRangeButtons.addEventListener(
            "change",
            handleOctaveChange(octaveRangeButtons, "data-range", 1),
            options,
        );
        octaveRangeButtons.addEventListener(
            "click",
            handleOctaveClick(octaveRangeButtons, "data-range"),
            options,
        );
    }

    function destroy() {
        listenerController?.abort();
        listenerController = null;
        isInitialized = false;
    }
    return { initialize, destroy };
}
