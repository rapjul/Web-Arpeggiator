/**
 * Manages the visual pattern-step indicator without owning application state.
 *
 * @module note-step-controller
 */

/**
 * @param {{container: HTMLElement|null, getNotes: () => string[]}} context - Bound DOM and state access.
 * @returns {{rebuild: () => void, highlight: (index: number) => void, clear: () => void}} Step indicator API.
 */
export function createNoteStepController({ container, getNotes }) {
    /** @type {HTMLElement[]} */
    let pips = [];

    function rebuild() {
        if (!container) return;

        container.replaceChildren();
        pips = getNotes().map((note) => {
            const pip = document.createElement("div");
            pip.className = "note-step-pip";
            pip.setAttribute("aria-label", note);
            container.appendChild(pip);
            return pip;
        });
    }

    /**
     * @param {number} index - Zero-based index of the playing base note.
     * @returns {void}
     */
    function highlight(index) {
        if (!Number.isInteger(index) || index < 0 || index >= pips.length) return;
        pips.forEach((pip, pipIndex) => {
            pip.classList.toggle("active", pipIndex === index);
        });
    }

    function clear() {
        pips.forEach((pip) => {
            pip.classList.remove("active");
        });
    }

    return { rebuild, highlight, clear };
}
