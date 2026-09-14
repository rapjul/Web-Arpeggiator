/**
 * History, reset, and keyboard-shortcut UI coordination.
 *
 * Application state changes are injected so this controller owns DOM behavior
 * without reaching into the application entry point or browser globals.
 *
 * @module history-controller
 */

/**
 * @typedef {object} HistoryControllerDependencies
 * @property {{appMain?: HTMLElement|null, undoButton?: HTMLButtonElement|null, redoButton?: HTMLButtonElement|null, historyMenuButton?: HTMLButtonElement|null, historyMenu?: HTMLElement|null, historyMenuUndoButton?: HTMLButtonElement|null, historyMenuRedoButton?: HTMLButtonElement|null, resetDefaultsButton?: HTMLButtonElement|null, resetDefaultsDesktopButton?: HTMLButtonElement|null, resetDefaultsOverlay?: HTMLElement|null, resetDefaultsDialog?: HTMLElement|null, resetDefaultsCancelButton?: HTMLButtonElement|null, resetDefaultsConfirmButton?: HTMLButtonElement|null, presetNameInput?: HTMLInputElement|null}} dom
 * @property {Document} documentRef
 * @property {() => {canUndo: boolean, canRedo: boolean, isAtDefault: boolean}} getStatus
 * @property {() => void} onUndo
 * @property {() => void} onRedo
 * @property {() => void} onResetDefaults
 * @property {() => boolean} onEscapeReset
 */

/**
 * Connects history state transitions to their controls, menu, confirmation
 * dialog, focus behavior, and keyboard shortcuts.
 *
 * @param {HistoryControllerDependencies} dependencies - Injected UI and app behavior.
 * @returns {{initialize: () => void, updateControls: () => void, destroy: () => void}}
 */
export function createHistoryController(dependencies) {
    const { dom, documentRef, getStatus, onUndo, onRedo, onResetDefaults, onEscapeReset } =
        dependencies;
    const {
        appMain,
        historyMenu,
        historyMenuButton,
        historyMenuRedoButton,
        historyMenuUndoButton,
        presetNameInput,
        redoButton,
        resetDefaultsButton,
        resetDefaultsCancelButton,
        resetDefaultsConfirmButton,
        resetDefaultsDesktopButton,
        resetDefaultsDialog,
        resetDefaultsOverlay,
        undoButton,
    } = dom;
    let isInitialized = false;
    /** @type {AbortController | null} */
    let listenerController = null;
    /** @type {HTMLElement | null} */
    let resetDialogReturnFocus = null;

    /**
     * Reflects injected history availability in every relevant action.
     *
     * @returns {void}
     */
    function updateControls() {
        const { canRedo, canUndo, isAtDefault } = getStatus();
        if (undoButton) undoButton.disabled = !canUndo;
        if (redoButton) redoButton.disabled = !canRedo;
        if (historyMenuUndoButton) historyMenuUndoButton.disabled = !canUndo;
        if (historyMenuRedoButton) historyMenuRedoButton.disabled = !canRedo;
        if (resetDefaultsButton) resetDefaultsButton.disabled = isAtDefault;
        if (resetDefaultsDesktopButton) resetDefaultsDesktopButton.disabled = isAtDefault;
    }

    /**
     * Sets menu visibility, restores its accessibility state, and focuses the
     * first available item when opening.
     *
     * @param {boolean} isOpen - Whether the menu should be shown.
     * @returns {void}
     */
    function setHistoryMenuOpen(isOpen) {
        if (!historyMenu || !historyMenuButton) return;
        historyMenu.classList.toggle("hidden", !isOpen);
        historyMenuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
        if (!isOpen) return;
        const firstAction = [
            historyMenuUndoButton,
            historyMenuRedoButton,
            resetDefaultsButton,
        ].find((button) => button && !button.disabled);
        firstAction?.focus();
    }

    /**
     * Opens the default-reset confirmation dialog and makes app content inert.
     *
     * @returns {void}
     */
    function openResetDefaultsDialog() {
        if (!resetDefaultsOverlay) return;
        const activeElement = /** @type {HTMLElement | null} */ (documentRef.activeElement);
        setHistoryMenuOpen(false);
        resetDialogReturnFocus =
            activeElement === resetDefaultsButton ? historyMenuButton : activeElement;
        resetDefaultsOverlay.classList.remove("hidden");
        resetDefaultsOverlay.classList.add("flex");
        resetDefaultsOverlay.setAttribute("aria-hidden", "false");
        appMain?.setAttribute("inert", "");
        resetDefaultsConfirmButton?.focus();
    }

    /**
     * Closes the default-reset confirmation dialog and restores focus.
     *
     * @returns {void}
     */
    function closeResetDefaultsDialog() {
        if (!resetDefaultsOverlay) return;
        resetDefaultsOverlay.classList.add("hidden");
        resetDefaultsOverlay.classList.remove("flex");
        resetDefaultsOverlay.setAttribute("aria-hidden", "true");
        appMain?.removeAttribute("inert");
        resetDialogReturnFocus?.focus();
        resetDialogReturnFocus = null;
    }

    /**
     * Retains keyboard focus inside the reset confirmation dialog.
     *
     * @param {KeyboardEvent} event - Dialog keyboard event.
     * @returns {void}
     */
    function trapResetDialogFocus(event) {
        if (event.key !== "Tab" || !resetDefaultsDialog) return;
        const focusable = Array.from(
            /** @type {NodeListOf<HTMLButtonElement>} */ (
                resetDefaultsDialog.querySelectorAll("button:not([disabled])")
            ),
        );
        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];
        if (!firstElement || !lastElement) return;
        if (event.shiftKey && documentRef.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && documentRef.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    /**
     * Runs an undo or redo invoked from the mobile menu and returns focus to
     * its trigger.
     *
     * @param {() => void} action - History state transition.
     * @returns {void}
     */
    function runMenuAction(action) {
        action();
        setHistoryMenuOpen(false);
        historyMenuButton?.focus();
    }

    /**
     * Processes application-wide history and reset keyboard interactions.
     *
     * @param {KeyboardEvent} event - Capturing keyboard event.
     * @returns {void}
     */
    function handleWindowKeydown(event) {
        const resetDialogOpen = resetDefaultsOverlay?.getAttribute("aria-hidden") === "false";
        if (event.key === "Escape" && resetDialogOpen) {
            event.preventDefault();
            closeResetDefaultsDialog();
            return;
        }

        const historyMenuOpen = historyMenuButton?.getAttribute("aria-expanded") === "true";
        if (event.key === "Escape" && historyMenuOpen) {
            event.preventDefault();
            setHistoryMenuOpen(false);
            historyMenuButton?.focus();
            return;
        }

        const usesModifier = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        const isUndo = usesModifier && !event.shiftKey && key === "z";
        const isRedo = usesModifier && ((event.shiftKey && key === "z") || key === "y");
        if ((isUndo || isRedo) && event.target === presetNameInput) return;
        if (isUndo || isRedo) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (isUndo) onUndo();
            else onRedo();
            return;
        }

        if (event.key === "Escape" && onEscapeReset()) {
            event.preventDefault();
        }
    }

    /**
     * Binds the history UI once the application defaults are available.
     *
     * @returns {void}
     */
    function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        listenerController = new AbortController();
        const listenerOptions = { signal: listenerController.signal };
        undoButton?.addEventListener("click", onUndo, listenerOptions);
        redoButton?.addEventListener("click", onRedo, listenerOptions);
        historyMenuUndoButton?.addEventListener(
            "click",
            () => runMenuAction(onUndo),
            listenerOptions,
        );
        historyMenuRedoButton?.addEventListener(
            "click",
            () => runMenuAction(onRedo),
            listenerOptions,
        );
        historyMenuButton?.addEventListener(
            "click",
            () => {
                const isOpen = historyMenuButton.getAttribute("aria-expanded") === "true";
                setHistoryMenuOpen(!isOpen);
            },
            listenerOptions,
        );
        resetDefaultsButton?.addEventListener("click", openResetDefaultsDialog, listenerOptions);
        resetDefaultsDesktopButton?.addEventListener(
            "click",
            openResetDefaultsDialog,
            listenerOptions,
        );
        resetDefaultsCancelButton?.addEventListener(
            "click",
            closeResetDefaultsDialog,
            listenerOptions,
        );
        resetDefaultsConfirmButton?.addEventListener(
            "click",
            () => {
                closeResetDefaultsDialog();
                onResetDefaults();
            },
            listenerOptions,
        );
        resetDefaultsOverlay?.addEventListener(
            "click",
            (event) => {
                if (event.target === resetDefaultsOverlay) closeResetDefaultsDialog();
            },
            listenerOptions,
        );
        resetDefaultsDialog?.addEventListener("keydown", trapResetDialogFocus, listenerOptions);
        documentRef.addEventListener(
            "click",
            (event) => {
                if (!(event.target instanceof Element)) return;
                if (event.target.closest("#history-menu, #history-menu-button")) return;
                setHistoryMenuOpen(false);
            },
            listenerOptions,
        );
        documentRef.defaultView?.addEventListener("keydown", handleWindowKeydown, {
            capture: true,
            signal: listenerController.signal,
        });
        updateControls();
    }

    /**
     * Releases listeners when the controller is no longer mounted.
     *
     * @returns {void}
     */
    function destroy() {
        listenerController?.abort();
        listenerController = null;
        isInitialized = false;
    }

    return { initialize, updateControls, destroy };
}
