/**
 * Accessibility and keyboard arrow navigation helpers for button and radio groups.
 *
 * @module ui/a11y-navigation
 */

/**
 * Attaches keyboard arrow-key navigation to a container with focusable buttons or radio inputs.
 * Supports Left/Right and Up/Down arrow keys with circular wrapping.
 *
 * @param {HTMLElement|null} container - The container element holding the focusable buttons.
 * @param {string} buttonSelector - CSS selector identifying focusable elements in the group.
 * @returns {void}
 */
export function setupKeyboardNavigation(container, buttonSelector) {
    if (!container || typeof container.addEventListener !== "function") {
        return;
    }

    container.addEventListener("keydown", (event) => {
        const buttons = /** @type {HTMLElement[]} */ (
            Array.from(container.querySelectorAll(buttonSelector))
        );
        if (buttons.length === 0) {
            return;
        }

        const activeEl = /** @type {HTMLElement | null} */ (document.activeElement);
        const index = activeEl ? buttons.indexOf(activeEl) : -1;

        if (index === -1) {
            return;
        }

        let nextIndex = index;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            nextIndex = (index + 1) % buttons.length;
            if (typeof event.preventDefault === "function") {
                event.preventDefault();
            }
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            nextIndex = (index - 1 + buttons.length) % buttons.length;
            if (typeof event.preventDefault === "function") {
                event.preventDefault();
            }
        }

        if (
            nextIndex !== index &&
            buttons[nextIndex] &&
            typeof buttons[nextIndex].focus === "function"
        ) {
            buttons[nextIndex].focus();
        }
    });
}
