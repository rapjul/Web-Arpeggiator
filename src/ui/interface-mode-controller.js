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
 * @param {{dom: {appMain: HTMLElement|null, interfaceModeSelect: HTMLSelectElement|null}, documentRef: Document, storage: Pick<Storage, "getItem"|"setItem">, logger?: {warn: (...args: unknown[]) => void}}} dependencies - Injected UI and storage dependencies.
 * @returns {{initialize: () => void, setMode: (mode: unknown, options?: {persist?: boolean}) => "simple"|"full", getMode: () => "simple"|"full"}}
 */
export function createInterfaceModeController(dependencies) {
    const { dom, storage, logger = console } = dependencies;
    const { appMain, interfaceModeSelect } = dom;
    /** @type {"simple"|"full"} */
    let currentMode = DEFAULT_INTERFACE_MODE;
    let isInitialized = false;

    /**
     * Applies visibility state for advanced controls based on the selected mode.
     *
     * @param {"simple"|"full"} mode - Active presentation mode.
     * @returns {void}
     */
    function applyMode(mode) {
        if (!appMain) return;
        appMain.dataset.interfaceMode = mode;
        const advancedControls = appMain.querySelectorAll("[data-interface-advanced]");
        advancedControls.forEach((control) => {
            const element = /** @type {HTMLElement} */ (control);
            const hidden = mode === "simple";
            element.hidden = hidden;
            element.setAttribute("aria-hidden", String(hidden));
        });
        if (interfaceModeSelect) interfaceModeSelect.value = mode;
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
        currentMode = normalizedMode;
        applyMode(normalizedMode);
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
        interfaceModeSelect?.addEventListener("change", () => {
            setMode(interfaceModeSelect.value);
        });
    }

    return {
        initialize,
        setMode,
        getMode: () => currentMode,
    };
}
