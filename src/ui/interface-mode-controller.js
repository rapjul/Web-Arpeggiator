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
 * @param {{
 *   dom: {
 *     appMain: HTMLElement | null,
 *     interfaceModeControls?: HTMLElement | null,
 *     interfaceModeButtons?: HTMLButtonElement[] | NodeListOf<HTMLButtonElement> | null,
 *     interfaceModeSimpleBtn?: HTMLButtonElement | null,
 *     interfaceModeFullBtn?: HTMLButtonElement | null,
 *     interfaceModeSelect?: HTMLSelectElement | null
 *   },
 *   storage: Pick<Storage, "getItem" | "setItem">,
 *   onModeApplied?: (mode: "simple" | "full") => void,
 *   logger?: { warn: (...args: unknown[]) => void }
 * }} dependencies - Injected UI, storage, and transition dependencies.
 * @returns {{
 *   initialize: () => void,
 *   destroy: () => void,
 *   setMode: (mode: unknown, options?: { persist?: boolean }) => "simple" | "full",
 *   getMode: () => "simple" | "full"
 * }} Controller lifecycle and mode mutation interface.
 */
export function createInterfaceModeController(dependencies) {
    const { dom, storage, onModeApplied, logger = console } = dependencies;
    const { appMain, interfaceModeControls, interfaceModeButtons, interfaceModeSelect } = dom;
    /** @type {"simple"|"full"} */
    let currentMode = DEFAULT_INTERFACE_MODE;
    let isInitialized = false;
    let hasAppliedMode = false;
    /** @type {AbortController | null} */
    let abortController = null;

    /**
     * Resolves the list of mode buttons from the DOM options.
     *
     * @returns {HTMLButtonElement[]} Active segmented buttons.
     */
    function getButtons() {
        if (interfaceModeButtons && interfaceModeButtons.length > 0) {
            return Array.from(interfaceModeButtons);
        }
        if (interfaceModeControls) {
            return Array.from(
                interfaceModeControls.querySelectorAll("button[data-interface-mode]"),
            );
        }
        return [];
    }

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

        const buttons = getButtons();
        buttons.forEach((button) => {
            const buttonMode = button.getAttribute("data-interface-mode");
            const isSelected = buttonMode === mode;
            button.setAttribute("aria-checked", String(isSelected));
            button.tabIndex = isSelected ? 0 : -1;
            button.classList.toggle("active", isSelected);
            button.classList.toggle("bg-blue-600", isSelected);
            button.classList.toggle("text-white", isSelected);
            button.classList.toggle("shadow-sm", isSelected);
            button.classList.toggle("text-gray-300", !isSelected);
            button.classList.toggle("hover:text-white", !isSelected);
        });

        if (interfaceModeSelect) interfaceModeSelect.value = mode;
        if (notify) onModeApplied?.(mode);
    }

    /**
     * Sets, applies, and optionally persists the active presentation mode.
     *
     * @param {unknown} mode - Target interface mode.
     * @param {{persist?: boolean, notify?: boolean}} [options={}] - Persistence and notification configuration options.
     * @returns {"simple"|"full"} Normalized applied mode.
     */
    function setMode(mode, options = {}) {
        const normalizedMode = normalizeInterfaceMode(mode);
        const hasModeChanged = !hasAppliedMode || currentMode !== normalizedMode;
        currentMode = normalizedMode;
        // Only trigger transition callbacks if explicitly requested or if the mode actually changed,
        // avoiding redundant teardown side-effects during initial workspace hydration.
        const shouldNotify = options.notify !== undefined ? options.notify : hasModeChanged;
        applyMode(normalizedMode, shouldNotify);
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
     * Handles keyboard arrow navigation within the radiogroup container.
     *
     * @param {KeyboardEvent} event - Keydown event.
     * @returns {void}
     */
    function handleKeyDown(event) {
        const buttons = getButtons();
        if (buttons.length === 0) return;
        const ownerDocument =
            appMain?.ownerDocument || interfaceModeControls?.ownerDocument || document;
        const activeEl = ownerDocument.activeElement;
        const currentIndex = buttons.indexOf(/** @type {HTMLButtonElement} */ (activeEl));
        if (currentIndex === -1) return;

        let targetIndex = -1;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            targetIndex = (currentIndex + 1) % buttons.length;
            event.preventDefault();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            targetIndex = (currentIndex - 1 + buttons.length) % buttons.length;
            event.preventDefault();
        }

        if (targetIndex !== -1 && buttons[targetIndex]) {
            const targetBtn = buttons[targetIndex];
            targetBtn.focus();
            const mode = targetBtn.getAttribute("data-interface-mode");
            if (mode) setMode(mode);
        }
    }

    /**
     * Handles clicks on the segmented buttons or radiogroup container.
     *
     * @param {MouseEvent} event - Click event.
     * @returns {void}
     */
    function handleClick(event) {
        const target = /** @type {HTMLElement|null} */ (event.target);
        const button = target?.closest("button[data-interface-mode]");
        if (!button) return;
        const mode = button.getAttribute("data-interface-mode");
        if (mode) setMode(mode);
    }

    /**
     * Handles change events from the legacy interface mode dropdown selector.
     *
     * @returns {void}
     */
    function handleModeChange() {
        if (interfaceModeSelect) setMode(interfaceModeSelect.value);
    }

    /**
     * Initializes the controller, restores saved mode, and binds UI listeners.
     *
     * @returns {void}
     */
    function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        abortController = new AbortController();
        const { signal } = abortController;

        let savedMode = null;
        try {
            savedMode = storage.getItem(INTERFACE_MODE_STORAGE_KEY);
        } catch (error) {
            logger.warn("Could not read interface mode:", error);
        }
        setMode(normalizeInterfaceMode(savedMode), { persist: false, notify: false });

        if (interfaceModeControls) {
            interfaceModeControls.addEventListener("click", handleClick, { signal });
            interfaceModeControls.addEventListener("keydown", handleKeyDown, { signal });
        } else {
            const buttons = getButtons();
            buttons.forEach((btn) => {
                btn.addEventListener("click", handleClick, { signal });
                btn.addEventListener("keydown", handleKeyDown, { signal });
            });
        }

        interfaceModeSelect?.addEventListener("change", handleModeChange, { signal });
    }

    /**
     * Tears down the controller and removes DOM event listeners.
     *
     * @returns {void}
     */
    function destroy() {
        if (!isInitialized) return;
        abortController?.abort();
        abortController = null;
        isInitialized = false;
    }

    return {
        initialize,
        destroy,
        setMode,
        getMode: () => currentMode,
    };
}
