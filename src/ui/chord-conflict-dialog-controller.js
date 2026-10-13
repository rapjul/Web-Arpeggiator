/**
 * Accessible chord/scale conflict decision dialog.
 *
 * @module ui/chord-conflict-dialog-controller
 */

/**
 * Creates a controller for the chord/scale conflict dialog.
 *
 * @param {{documentRef: Document, dom: {appMain: HTMLElement|null, overlay: HTMLElement|null, dialog: HTMLElement|null, requestedNotes: HTMLElement|null, adaptedNotes: HTMLElement|null, changedPitches: HTMLElement|null, keepButton: HTMLButtonElement|null, adaptButton: HTMLButtonElement|null, cancelButton: HTMLButtonElement|null}, isAnotherModalOpen?: () => boolean}} dependencies - Injected DOM references.
 * @returns {{open: (details: {chordName: string, root: string, requestedNotes: string[], adaptedNotes: string[], changedPitches: Array<{requested: string, adapted: string}>, onKeep: () => void, onAdapt: () => void, onCancel?: () => void}) => void, close: () => void, destroy: () => void, isOpen: () => boolean}}
 */
export function createChordConflictDialogController(dependencies) {
    const { documentRef, dom, isAnotherModalOpen } = dependencies;
    const {
        appMain,
        overlay,
        dialog,
        requestedNotes,
        adaptedNotes,
        changedPitches,
        keepButton,
        adaptButton,
        cancelButton,
    } = dom;
    let pending = null;
    let returnFocus = null;
    let isDestroyed = false;
    const listenerController = new AbortController();
    const listenerOptions = { signal: listenerController.signal };

    /** Hides the dialog, restores the application, and returns focus. */
    function dismiss() {
        overlay?.classList.add("hidden");
        overlay?.classList.remove("flex");
        overlay?.setAttribute("aria-hidden", "true");
        if (!isAnotherModalOpen?.()) {
            appMain?.removeAttribute("inert");
        }
        returnFocus?.focus();
        returnFocus = null;
    }

    function close() {
        const onCancel = pending?.onCancel;
        pending = null;
        dismiss();
        onCancel?.();
    }

    function choose(choice) {
        const current = pending;
        if (!current) return;
        pending = null;
        dismiss();
        if (choice === "keep") current.onKeep();
        else if (choice === "adapt") current.onAdapt();
        else current.onCancel?.();
    }

    function trapFocus(event) {
        if (event.key !== "Tab" || !dialog) return;
        const focusable = /** @type {HTMLElement[]} */ (
            Array.from(
                dialog.querySelectorAll("button:not([disabled]), [href], input:not([disabled])"),
            )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && documentRef.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && documentRef.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function handleDialogKeydown(event) {
        if (!pending) return;
        trapFocus(event);
        if (event.key === "Escape") {
            event.preventDefault();
            choose("cancel");
        }
        event.stopPropagation();
    }

    keepButton?.addEventListener("click", () => choose("keep"), listenerOptions);
    adaptButton?.addEventListener("click", () => choose("adapt"), listenerOptions);
    cancelButton?.addEventListener("click", () => choose("cancel"), listenerOptions);
    dialog?.addEventListener("keydown", handleDialogKeydown, listenerOptions);
    overlay?.addEventListener(
        "click",
        (event) => {
            if (event.target === overlay) choose("cancel");
        },
        listenerOptions,
    );

    /**
     * Writes the chord conflict details into the dialog, tolerating malformed arrays.
     *
     * @param {{chordName?: string, root?: string, requestedNotes?: unknown, adaptedNotes?: unknown, changedPitches?: unknown}} details - Conflict details.
     * @returns {void}
     */
    function renderDetails(details) {
        const asArray = (value) => (Array.isArray(value) ? value : []);
        const pitches = asArray(details.changedPitches);
        if (requestedNotes)
            requestedNotes.textContent = asArray(details.requestedNotes).join("  •  ");
        if (adaptedNotes) adaptedNotes.textContent = asArray(details.adaptedNotes).join("  •  ");
        if (changedPitches) {
            changedPitches.textContent = pitches
                .map(({ requested, adapted }) => `${requested} → ${adapted}`)
                .join(", ");
        }
        const title = dialog?.querySelector("[data-chord-conflict-title]");
        if (title)
            title.textContent = `${details.root || "C"} ${details.chordName || "Major"} does not fit the active scale`;
    }

    function open(details) {
        if (!details || typeof details !== "object") return;
        const hasRequiredDialogControls = Boolean(
            appMain && overlay && dialog && keepButton && adaptButton && cancelButton,
        );
        if (isDestroyed || !hasRequiredDialogControls) {
            details.onCancel?.();
            return;
        }
        if (pending) close();
        pending = details;
        returnFocus =
            documentRef.activeElement instanceof HTMLElement ? documentRef.activeElement : null;
        renderDetails(details);
        overlay?.classList.remove("hidden");
        overlay?.classList.add("flex");
        overlay?.setAttribute("aria-hidden", "false");
        appMain?.setAttribute("inert", "");
        adaptButton?.focus();
    }

    function destroy() {
        if (isDestroyed) return;
        isDestroyed = true;
        close();
        listenerController.abort();
    }

    return {
        open,
        close,
        destroy,
        isOpen: () =>
            overlay?.getAttribute("aria-hidden") === "false" &&
            !overlay?.classList.contains("hidden"),
    };
}
