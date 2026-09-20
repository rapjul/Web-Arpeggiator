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

    function applyMode(mode) {
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
        onModeApplied?.(mode);
    }

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
