/**
 * Accessible confirmation dialog for a file preset created by a newer app version.
 *
 * @module ui/future-preset-dialog-controller
 */

/**
 * Creates the controller that owns the newer-preset compatibility dialog.
 *
 * @param {{documentRoot?: Document, windowRoot?: Window, getReturnFocus: () => HTMLElement|null, onConfirm: (settings: Record<string, unknown>, fileName: string) => void}} options - Dialog dependencies.
 * @returns {{open: (settings: Record<string, unknown>, fileName: string) => void, close: () => void}} Dialog controls.
 */
export function createFuturePresetDialogController(options) {
    const { documentRoot = document, windowRoot = window, getReturnFocus, onConfirm } = options;
    const appMain = documentRoot.getElementById("app-main");
    const overlay = documentRoot.getElementById("future-preset-overlay");
    const dialog = documentRoot.getElementById("future-preset-dialog");
    const cancelButton = documentRoot.getElementById("future-preset-cancel");
    const confirmButton = documentRoot.getElementById("future-preset-confirm");
    /** @type {{settings: Record<string, unknown>, fileName: string}|null} */
    let pendingPreset = null;
    /** @type {HTMLElement|null} */
    let returnFocus = null;

    /** Closes the dialog without applying the pending imported settings. */
    function close() {
        pendingPreset = null;
        overlay?.classList.add("hidden");
        overlay?.classList.remove("flex");
        overlay?.setAttribute("aria-hidden", "true");
        appMain?.removeAttribute("inert");
        returnFocus?.focus();
        returnFocus = null;
    }

    /**
     * Opens the dialog for a future-version file import.
     *
     * @param {Record<string, unknown>} settings - Original imported settings.
     * @param {string} fileName - Source file name for persistence metadata.
     * @returns {void}
     */
    function open(settings, fileName) {
        pendingPreset = { settings: { ...settings }, fileName };
        returnFocus = getReturnFocus();
        overlay?.classList.remove("hidden");
        overlay?.classList.add("flex");
        overlay?.setAttribute("aria-hidden", "false");
        appMain?.setAttribute("inert", "");
        confirmButton?.focus();
    }

    /**
     * Keeps keyboard focus in the dialog while it is open.
     *
     * @param {KeyboardEvent} event - Dialog key event.
     * @returns {void}
     */
    function trapFocus(event) {
        if (event.key !== "Tab" || !dialog) return;
        const focusable = Array.from(
            /** @type {NodeListOf<HTMLButtonElement>} */ (
                dialog.querySelectorAll("button:not([disabled])")
            ),
        );
        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];
        if (!firstElement || !lastElement) return;
        if (event.shiftKey && documentRoot.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && documentRoot.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    cancelButton?.addEventListener("click", close);
    overlay?.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });
    dialog?.addEventListener("keydown", trapFocus);
    windowRoot.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || overlay?.getAttribute("aria-hidden") !== "false") return;
        event.preventDefault();
        close();
    });
    confirmButton?.addEventListener("click", () => {
        if (!pendingPreset) return;
        const { settings, fileName } = pendingPreset;
        close();
        onConfirm(settings, fileName);
    });

    return { open, close };
}
