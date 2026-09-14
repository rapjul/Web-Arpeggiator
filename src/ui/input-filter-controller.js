/**
 * Keyboard filtering for constrained text and numeric inputs.
 *
 * @module input-filter-controller
 */

/**
 * @typedef {object} InputFilterControllerDependencies
 * @property {{notesInput: HTMLInputElement, loopCountInput: HTMLInputElement}} dom
 * @property {(event: KeyboardEvent) => boolean} filterNoteInput
 * @property {(event: KeyboardEvent) => boolean} filterNumericInput
 */

/**
 * Binds the existing domain-level key filters without requiring inline markup
 * handlers or globals on `window`.
 *
 * @param {InputFilterControllerDependencies} dependencies - Input elements and pure key filters.
 * @returns {{initialize: () => void, destroy: () => void}}
 */
export function createInputFilterController(dependencies) {
    const { dom, filterNoteInput, filterNumericInput } = dependencies;
    const { notesInput, loopCountInput } = dom;
    let isInitialized = false;
    /** @type {AbortController | null} */
    let listenerController = null;

    /**
     * Applies a domain filter and ensures rejected browser keyboard events do
     * not modify their associated input.
     *
     * @param {(event: KeyboardEvent) => boolean} filter - Domain key filter.
     * @param {KeyboardEvent} event - Browser keyboard event.
     * @returns {void}
     */
    function applyFilter(filter, event) {
        if (!filter(event)) {
            event.preventDefault();
        }
    }

    /** Binds both input filters once. */
    function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        listenerController = new AbortController();
        const options = { signal: listenerController.signal };
        notesInput.addEventListener(
            "keydown",
            (event) => applyFilter(filterNoteInput, event),
            options,
        );
        loopCountInput.addEventListener(
            "keydown",
            (event) => applyFilter(filterNumericInput, event),
            options,
        );
    }

    /** Releases input listeners so the controller can be mounted again. */
    function destroy() {
        listenerController?.abort();
        listenerController = null;
        isInitialized = false;
    }

    return { initialize, destroy };
}
