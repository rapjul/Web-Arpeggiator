/**
 * Keyboard input filtering domain helpers for note and numeric fields.
 *
 * @module core/input-filters
 */

/**
 * Filters keydown events for the musical notes input.
 * Allows: A-G, a-g, 0-9, #, b, Space, Backspace, Tab, Arrows, Delete, Ctrl/Cmd+A/C/V/X.
 *
 * @param {KeyboardEvent} event - The keyboard event to validate and filter.
 * @returns {boolean} True if the key is permitted, false otherwise.
 */
export function filterNoteInput(event) {
    const key = event.key;
    const keyCode = event.keyCode;

    // Allow letters A-G (and a-g)
    if (keyCode >= 65 && keyCode <= 71) {
        return true;
    }

    // Allow numbers 0-9 (prevent shifted symbols on top row)
    if (keyCode >= 48 && keyCode <= 57 && !event.shiftKey) {
        return true;
    }

    // Allow Space, #, b
    if (key === " " || key === "#" || key === "b") {
        return true;
    }

    // Allow standard navigation and control keys (Backspace, Tab, Left/Up/Right/Down, Delete)
    if ([8, 9, 37, 38, 39, 40, 46].includes(keyCode)) {
        return true;
    }

    // Allow Ctrl/Cmd + A, C, V, X shortcuts
    if ((event.ctrlKey || event.metaKey) && [65, 67, 86, 88].includes(keyCode)) {
        return true;
    }

    // Block all other keys
    if (typeof event.preventDefault === "function") {
        event.preventDefault();
    }
    return false;
}

/**
 * Filters keydown events for numeric inputs to allow only digits and control keys.
 *
 * @param {KeyboardEvent} event - The keyboard event to validate and filter.
 * @returns {boolean} True if the key is permitted, false otherwise.
 */
export function filterNumericInput(event) {
    const keyCode = event.keyCode;

    if (
        (keyCode >= 48 && keyCode <= 57 && !event.shiftKey) ||
        (keyCode >= 96 && keyCode <= 105) ||
        [8, 9, 37, 38, 39, 40, 46].includes(keyCode) ||
        ((event.ctrlKey || event.metaKey) && [65, 67, 86, 88].includes(keyCode))
    ) {
        return true;
    }

    if (typeof event.preventDefault === "function") {
        event.preventDefault();
    }
    return false;
}
