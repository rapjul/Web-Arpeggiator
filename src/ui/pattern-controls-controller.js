/**
 * Pattern, scale, octave, and gate control coordination.
 *
 * @module pattern-controls-controller
 */

import { setupKeyboardNavigation } from "@ui/a11y-navigation.js";

/**
 * @typedef {object} PatternControlsControllerDependencies
 * @property {{notesInput: HTMLInputElement, intervalSelect: HTMLSelectElement, gateSlider: HTMLInputElement, gateValue: HTMLElement|null, scaleQuantizeToggle: HTMLInputElement, scaleQuantizeToggleStatus: HTMLElement|null, scaleTypeSelect: HTMLSelectElement, scaleRootSelect: HTMLSelectElement, octaveShiftButtons: HTMLElement, octaveRangeButtons: HTMLElement, patternButtons: HTMLElement, randomizeNotesButton: HTMLElement|null, chordButtons: NodeListOf<Element>}} dom
 * @property {(notes: string[]) => string[]} normalizeNotes
 * @property {(notes: string[]) => void} setNotes
 * @property {(value: number) => void} setOctaveShift
 * @property {(value: number) => void} setOctaveRange
 * @property {() => void} onPatternChange
 * @property {() => void} onEstimatedDurationChange
 * @property {() => void} onStaticLoopChange
 * @property {(notes: string[]) => void} [onNotesSelected]
 * @property {() => void} [onClearActiveSoundStarter]
 * @property {(message: string, type?: "success"|"info"|"error") => void} [showToast]
 * @property {(root: string, scale: string) => string[]} [generateRandomNotes]
 * @property {(chordType: string, root: string) => string} [buildChordString]
 * @property {(chordType: string) => {name: string}} [resolveChordDefinition]
 * @property {(callback: () => void, wait: number) => () => void} debounce
 */

/**
 * Binds pattern controls without taking ownership of application or audio
 * state.
 *
 * @param {PatternControlsControllerDependencies} dependencies - Injected UI and app behavior.
 * @returns {{initialize: () => void, destroy: () => void, getSelectedPatternDirection: () => string, setSelectedPatternDirection: (direction?: string) => void, updateScaleQuantizeUi: () => void, updateScaleQuantizeToggleText: () => void, updateButtonGroup: (container: HTMLElement, selectedValue: number, dataAttribute: string) => void}}
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
        onNotesSelected,
        onClearActiveSoundStarter,
        showToast,
        generateRandomNotes,
        buildChordString,
        resolveChordDefinition,
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
        patternButtons,
        randomizeNotesButton,
        chordButtons = [],
        scaleQuantizeToggleStatus,
    } = dom;
    let isInitialized = false;
    let lastActiveScaleType = "major";
    let lifecycleId = 0;
    /** @type {AbortController | null} */
    let listenerController = null;
    /** @type {Array<() => void>} */
    let keyboardNavigationCleanups = [];
    let pendingPatternChangeLifecycle = 0;
    const debouncedPatternChange = debounce(() => {
        if (isInitialized && pendingPatternChangeLifecycle === lifecycleId) onPatternChange();
    }, 50);

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

    /**
     * Returns the selected pattern direction, accepting both radio and legacy
     * button markup while the UI transitions between the two.
     *
     * @returns {string} Selected direction slug.
     */
    function getSelectedPatternDirection() {
        const checkedRadio = /** @type {HTMLInputElement|null} */ (
            patternButtons.querySelector("input[name='pattern-direction']:checked")
        );
        if (checkedRadio?.value) return checkedRadio.value;
        const selectedButton = patternButtons.querySelector(".pattern-btn.selected");
        return selectedButton?.getAttribute("data-pattern") || "up";
    }

    /**
     * Selects the requested pattern direction and synchronizes its visual
     * button and radio state.
     *
     * @param {string} [direction="up"] - Direction slug to select.
     * @returns {void}
     */
    function setSelectedPatternDirection(direction = "up") {
        const directionInputs = /** @type {NodeListOf<HTMLInputElement>} */ (
            patternButtons.querySelectorAll("input[name='pattern-direction']")
        );
        const radio = /** @type {HTMLInputElement|null} */ (
            Array.from(directionInputs).find(
                (input) => input.value === direction || input.dataset.pattern === direction,
            ) || null
        );
        const fallbackRadio = /** @type {HTMLInputElement|null} */ (
            patternButtons.querySelector("input[name='pattern-direction'][value='up']")
        );
        if (radio) radio.checked = true;
        else if (fallbackRadio) fallbackRadio.checked = true;

        const selectedButton =
            Array.from(patternButtons.querySelectorAll(".pattern-btn")).find(
                (button) => button.getAttribute("data-pattern") === direction,
            ) || patternButtons.querySelector('.pattern-btn[data-pattern="up"]');
        patternButtons.querySelectorAll(".pattern-btn, button").forEach((button) => {
            button.classList.toggle("selected", button === selectedButton);
        });
    }

    /**
     * Reflects a numeric setting in its radio/button group.
     *
     * @param {HTMLElement} container - Group containing the controls.
     * @param {number} selectedValue - Value to select.
     * @param {string} dataAttribute - Attribute containing button values.
     * @returns {void}
     */
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

    /** Updates the scale root emphasis and disabled state. */
    function updateScaleQuantizeUi() {
        const isEnabled = scaleQuantizeToggle.checked && scaleTypeSelect.value !== "chromatic";
        scaleRootSelect.classList.toggle("opacity-50", !isEnabled);
        scaleRootSelect.disabled = !isEnabled;
        scaleTypeSelect.disabled = false;
    }

    /** Updates the scale toggle's accessible state and status label. */
    function updateScaleQuantizeToggleText() {
        const isEnabled = scaleQuantizeToggle.checked && scaleTypeSelect.value !== "chromatic";
        scaleQuantizeToggle.setAttribute("aria-checked", String(isEnabled));
        if (!scaleQuantizeToggleStatus) return;
        scaleQuantizeToggleStatus.textContent = isEnabled ? "Enabled" : "Disabled";
        scaleQuantizeToggleStatus.classList.toggle("text-green-400", isEnabled);
        scaleQuantizeToggleStatus.classList.toggle("text-gray-400", !isEnabled);
    }

    /** Wires random-note and chord-starter actions through injected callbacks. */
    function initializePatternActions(options) {
        randomizeNotesButton?.addEventListener(
            "click",
            () => {
                if (!generateRandomNotes || !onNotesSelected) return;
                const isQuantized =
                    scaleQuantizeToggle.checked && scaleTypeSelect.value !== "chromatic";
                let root = scaleRootSelect.value;
                let scale = scaleTypeSelect.value;
                if (!isQuantized) {
                    const rootOptions = scaleRootSelect.options;
                    root =
                        rootOptions[Math.floor(Math.random() * rootOptions.length)]?.value || root;
                    scaleRootSelect.value = root;
                    scale = "chromatic";
                }
                onClearActiveSoundStarter?.();
                onNotesSelected(generateRandomNotes(root, scale));
                showToast?.(
                    scale === "chromatic"
                        ? `Randomized notes using ${root} Mode (Chromatic)!`
                        : `Randomized notes using ${root} ${scale.charAt(0).toUpperCase() + scale.slice(1)}!`,
                    "success",
                );
            },
            options,
        );

        chordButtons.forEach((button) => {
            button.addEventListener(
                "click",
                () => {
                    if (!buildChordString || !resolveChordDefinition || !onNotesSelected) return;
                    const chordType = button.getAttribute("data-chord") || "major";
                    const root = scaleRootSelect.value || "C";
                    onClearActiveSoundStarter?.();
                    onNotesSelected(buildChordString(chordType, root).split(" "));
                    showToast?.(
                        `Loaded ${root} ${resolveChordDefinition(chordType).name} chord!`,
                        "success",
                    );
                },
                options,
            );
        });
    }

    function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        lifecycleId += 1;
        listenerController = new AbortController();
        const options = { signal: listenerController.signal };
        keyboardNavigationCleanups = [
            setupKeyboardNavigation(patternButtons, "input[type='radio'], button.pattern-btn"),
            setupKeyboardNavigation(octaveShiftButtons, "input[type='radio'], button.octave-btn"),
            setupKeyboardNavigation(octaveRangeButtons, "input[type='radio'], button.octave-btn"),
        ];
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
                pendingPatternChangeLifecycle = lifecycleId;
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
                updateScaleQuantizeUi();
                updateScaleQuantizeToggleText();
                onPatternChange();
            },
            options,
        );
        scaleTypeSelect.addEventListener(
            "change",
            () => {
                scaleQuantizeToggle.checked = scaleTypeSelect.value !== "chromatic";
                if (scaleQuantizeToggle.checked) lastActiveScaleType = scaleTypeSelect.value;
                updateScaleQuantizeUi();
                updateScaleQuantizeToggleText();
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
        patternButtons.addEventListener(
            "change",
            (event) => {
                const target = /** @type {HTMLInputElement} */ (event.target);
                if (target?.name !== "pattern-direction") return;
                setSelectedPatternDirection(target.value);
                onPatternChange();
            },
            options,
        );
        patternButtons.addEventListener(
            "click",
            (event) => {
                if (patternButtons.querySelector("input[name='pattern-direction']")) return;
                if (!(event.target instanceof Element)) return;
                const target = event.target.closest(".pattern-btn, button, label");
                const button = target?.classList.contains("pattern-btn")
                    ? target
                    : target?.querySelector(".pattern-btn, [data-pattern]");
                const direction = button?.getAttribute("data-pattern");
                if (!direction) return;
                setSelectedPatternDirection(direction);
                onPatternChange();
            },
            options,
        );
        initializePatternActions(options);
    }

    function destroy() {
        listenerController?.abort();
        keyboardNavigationCleanups.forEach((cleanup) => {
            cleanup();
        });
        keyboardNavigationCleanups = [];
        listenerController = null;
        isInitialized = false;
        lifecycleId += 1;
    }
    return {
        initialize,
        destroy,
        getSelectedPatternDirection,
        setSelectedPatternDirection,
        updateScaleQuantizeUi,
        updateScaleQuantizeToggleText,
        updateButtonGroup,
    };
}
