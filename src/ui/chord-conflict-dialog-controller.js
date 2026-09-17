/**
 * Accessible chord/scale conflict decision dialog.
 *
 * @module ui/chord-conflict-dialog-controller
 */

/**
 * Creates a controller for the chord/scale conflict dialog.
 *
 * @param {{documentRef: Document, dom: {overlay: HTMLElement|null, dialog: HTMLElement|null, requestedNotes: HTMLElement|null, adaptedNotes: HTMLElement|null, changedPitches: HTMLElement|null, keepButton: HTMLButtonElement|null, adaptButton: HTMLButtonElement|null, cancelButton: HTMLButtonElement|null}}} dependencies - Injected DOM references.
 * @returns {{open: (details: {chordName: string, root: string, requestedNotes: string[], adaptedNotes: string[], changedPitches: Array<{requested: string, adapted: string}>, onKeep: () => void, onAdapt: () => void, onCancel?: () => void}) => void, close: () => void, destroy: () => void}}
 */
export function createChordConflictDialogController({ documentRef, dom }) {
    const {
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

    function close() {
        const onCancel = pending?.onCancel;
        pending = null;
        overlay?.classList.add("hidden");
        overlay?.classList.remove("flex");
        overlay?.setAttribute("aria-hidden", "true");
        returnFocus?.focus();
        returnFocus = null;
        onCancel?.();
    }

    function choose(choice) {
        const current = pending;
        if (!current) return;
        pending = null;
        overlay?.classList.add("hidden");
        overlay?.classList.remove("flex");
        overlay?.setAttribute("aria-hidden", "true");
        returnFocus?.focus();
        returnFocus = null;
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

    function handleKeydown(event) {
        if (event.key === "Escape" && pending) {
            event.preventDefault();
            choose("cancel");
        }
    }

    keepButton?.addEventListener("click", () => choose("keep"));
    adaptButton?.addEventListener("click", () => choose("adapt"));
    cancelButton?.addEventListener("click", () => choose("cancel"));
    dialog?.addEventListener("keydown", trapFocus);
    documentRef.addEventListener("keydown", handleKeydown);
    overlay?.addEventListener("click", (event) => {
        if (event.target === overlay) choose("cancel");
    });

    function open(details) {
        pending = details;
        returnFocus =
            documentRef.activeElement instanceof HTMLElement ? documentRef.activeElement : null;
        if (requestedNotes) requestedNotes.textContent = details.requestedNotes.join("  •  ");
        if (adaptedNotes) adaptedNotes.textContent = details.adaptedNotes.join("  •  ");
        if (changedPitches) {
            changedPitches.textContent = details.changedPitches
                .map(({ requested, adapted }) => `${requested} → ${adapted}`)
                .join(", ");
        }
        const title = dialog?.querySelector("[data-chord-conflict-title]");
        if (title)
            title.textContent = `${details.root} ${details.chordName} does not fit the active scale`;
        overlay?.classList.remove("hidden");
        overlay?.classList.add("flex");
        overlay?.setAttribute("aria-hidden", "false");
        adaptButton?.focus();
    }

    function destroy() {
        documentRef.removeEventListener("keydown", handleKeydown);
        dialog?.removeEventListener("keydown", trapFocus);
        close();
    }

    return { open, close, destroy };
}
