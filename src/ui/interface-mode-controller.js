/**
 * Applies and persists the beginner-friendly or full control presentation.
 *
 * @module interface-mode-controller
 */

import { DEFAULT_INTERFACE_MODE, normalizeInterfaceMode } from "@core/interface-mode.js";

const INTERFACE_MODE_STORAGE_KEY = "webArpInterfaceMode";

/**
 * Creates the interface-mode controller.
 *
 * @param {{dom: {appMain: HTMLElement|null, interfaceModeSelect: HTMLSelectElement|null}, storage: Pick<Storage, "getItem"|"setItem">, onModeApplied?: (mode: "simple"|"full") => void, logger?: {warn: (...args: unknown[]) => void}}} dependencies - Injected UI, storage, and transition dependencies.
 * @returns {{initialize: () => void, destroy: () => void, setMode: (mode: unknown, options?: {persist?: boolean}) => "simple"|"full", getMode: () => "simple"|"full"}}
 */
export function createInterfaceModeController(dependencies) {
    const { dom, storage, onModeApplied, logger = console } = dependencies;
    const { appMain, interfaceModeSelect } = dom;
    /** @type {"simple"|"full"} */
    let currentMode = DEFAULT_INTERFACE_MODE;
    let isInitialized = false;
    let hasAppliedMode = false;

    /**
     * Applies visibility state for advanced controls based on the selected mode.
     *
     * @param {"simple"|"full"} mode - Active presentation mode.
     * @param {boolean} notify - Whether to invoke the transition callback.
     * @returns {void}
     */
    function applyMode(mode, notify) {
        if (appMain) {
            appMain.dataset.interfaceMode = mode;
            const advancedControls = appMain.querySelectorAll("[data-interface-advanced]");
            advancedControls.forEach((control) => {
                const element = /** @type {HTMLElement} */ (control);
                const hidden = mode === "simple";
                element.hidden = hidden;
                element.setAttribute("aria-hidden", String(hidden));
            });
            appMain.hidden = false;
        }
        if (interfaceModeSelect) interfaceModeSelect.value = mode;
        if (notify) onModeApplied?.(mode);
    }

    /**
     * Sets, applies, and optionally persists the active presentation mode.
     *
     * @param {unknown} mode - Target interface mode.
     * @param {{persist?: boolean}} [options={}] - Persistence configuration options.
     * @returns {"simple"|"full"} Normalized applied mode.
     */
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

    /**
     * Initializes the controller, restores saved mode, and binds UI listeners.
     *
     * @returns {void}
     */
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

    /**
     * Handles change events from the interface mode dropdown selector.
     *
     * @returns {void}
     */
    function handleModeChange() {
        if (interfaceModeSelect) setMode(interfaceModeSelect.value);
    }

    /**
     * Tears down the controller and removes DOM event listeners.
     *
     * @returns {void}
     */
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
