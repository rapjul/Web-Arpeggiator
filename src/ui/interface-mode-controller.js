/**
 * Applies and persists the beginner-friendly or full control presentation.
 *
 * @module interface-mode-controller
 */

import { DEFAULT_INTERFACE_MODE, normalizeInterfaceMode } from "@core/interface-mode.js";

const INTERFACE_MODE_STORAGE_KEY = "webArpInterfaceMode";
const SIMPLE_PATTERN_DIRECTIONS = new Set(["up", "down", "upDown", "random"]);

/**
 * Creates the interface-mode controller.
 *
 * @param {{dom: {appMain: HTMLElement|null, interfaceModeSelect: HTMLSelectElement|null}, documentRef?: Document, storage: Pick<Storage, "getItem"|"setItem">, onModeApplied?: (mode: "simple"|"full") => void, logger?: {warn: (...args: unknown[]) => void}}} dependencies - Injected UI, storage, and transition dependencies.
 * @returns {{initialize: () => void, destroy: () => void, setMode: (mode: unknown, options?: {persist?: boolean}) => "simple"|"full", getMode: () => "simple"|"full"}}
 */
export function createInterfaceModeController(dependencies) {
    const { dom, documentRef = document, storage, onModeApplied, logger = console } = dependencies;
    const { appMain, interfaceModeSelect } = dom;
    /** @type {"simple"|"full"} */
    let currentMode = DEFAULT_INTERFACE_MODE;
    let isInitialized = false;
    let hasAppliedMode = false;

    /**
     * Keeps the four beginner-friendly directions prominent while retaining
     * access to every existing direction in an expandable group.
     *
     * @returns {void}
     */
    function preparePatternDirections() {
        if (!appMain) return;
        const patternButtons = appMain.querySelector("#pattern-buttons");
        if (!(patternButtons instanceof HTMLElement)) return;
        if (patternButtons.dataset.patternDirectionsPrepared === "true") return;

        const labels = Array.from(patternButtons.children).filter(
            (child) => child instanceof HTMLLabelElement,
        );
        const advancedLabels = labels.filter((label) => {
            const input = /** @type {HTMLInputElement|null} */ (
                label.querySelector("input[name='pattern-direction']")
            );
            return !SIMPLE_PATTERN_DIRECTIONS.has(input?.value || "");
        });
        if (advancedLabels.length === 0) return;

        const details = documentRef.createElement("details");
        details.id = "pattern-more-details";
        details.className = "pattern-more-directions";
        details.open = true;

        const summary = documentRef.createElement("summary");
        summary.className = "text-sm font-semibold text-blue-200";
        summary.textContent = "More pattern directions";

        const advancedFieldset = documentRef.createElement("fieldset");
        advancedFieldset.id = "pattern-more-buttons";
        advancedFieldset.className = "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4";
        advancedFieldset.setAttribute("aria-label", "Additional pattern directions");
        advancedLabels.forEach((label) => {
            advancedFieldset.append(label);
        });

        details.append(summary, advancedFieldset);
        patternButtons.append(details);
        patternButtons.dataset.patternDirectionsPrepared = "true";
    }

    /**
     * Applies the mode-specific state of the additional direction disclosure.
     *
     * @param {"simple"|"full"} mode - Active interface mode.
     * @returns {void}
     */
    function applyPatternDirectionMode(mode) {
        if (!appMain) return;
        const details = appMain.querySelector("#pattern-more-details");
        if (!(details instanceof HTMLDetailsElement)) return;
        const selected = /** @type {HTMLInputElement|null} */ (
            appMain.querySelector("#pattern-buttons input[name='pattern-direction']:checked")
        );
        details.open = mode === "full" || !SIMPLE_PATTERN_DIRECTIONS.has(selected?.value || "");
    }

    function applyMode(mode, notify) {
        if (!appMain) {
            if (interfaceModeSelect) interfaceModeSelect.value = mode;
            if (notify) onModeApplied?.(mode);
            return;
        }
        preparePatternDirections();
        appMain.dataset.interfaceMode = mode;
        const advancedControls = appMain.querySelectorAll("[data-interface-advanced]");
        advancedControls.forEach((control) => {
            const element = /** @type {HTMLElement} */ (control);
            const hidden = mode === "simple";
            element.hidden = hidden;
            element.setAttribute("aria-hidden", String(hidden));
        });
        appMain.querySelectorAll("[data-interface-simple-collapsible]").forEach((control) => {
            const details = /** @type {HTMLDetailsElement} */ (control);
            details.open = mode === "full";
        });
        applyPatternDirectionMode(mode);
        appMain.hidden = false;
        if (interfaceModeSelect) interfaceModeSelect.value = mode;
        if (notify) onModeApplied?.(mode);
    }

    function setMode(mode, options = {}) {
        const normalizedMode = normalizeInterfaceMode(mode);
        const hasModeChanged = !hasAppliedMode || currentMode !== normalizedMode;
        currentMode = normalizedMode;
        applyMode(normalizedMode, hasModeChanged);
        hasAppliedMode = true;
        if (options.persist === false) return normalizedMode;
        try {
            storage.setItem(INTERFACE_MODE_STORAGE_KEY, normalizedMode);
        } catch (error) {
            logger.warn("Could not save interface mode:", error);
        }
        return normalizedMode;
    }

    function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        let savedMode = null;
        try {
            savedMode = storage.getItem(INTERFACE_MODE_STORAGE_KEY);
        } catch (error) {
            logger.warn("Could not read interface mode:", error);
        }
        setMode(normalizeInterfaceMode(savedMode), { persist: false });
        interfaceModeSelect?.addEventListener("change", handleModeChange);
    }

    function handleModeChange() {
        if (interfaceModeSelect) setMode(interfaceModeSelect.value);
    }

    function destroy() {
        if (!isInitialized) return;
        interfaceModeSelect?.removeEventListener("change", handleModeChange);
        isInitialized = false;
    }

    return {
        initialize,
        destroy,
        setMode,
        getMode: () => currentMode,
    };
}
