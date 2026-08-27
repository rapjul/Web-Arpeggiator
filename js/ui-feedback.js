/**
 * UI Feedback Module
 *
 * Manages user toast notifications and accessible screen reader live announcements.
 *
 * @module ui-feedback
 */

/**
 * Creates a toast and screen reader feedback controller.
 *
 * @param {object} [context={}] - Optional DOM element references.
 * @param {HTMLElement|null} [context.toastContainer=null] - Container element for stacking toasts.
 * @param {HTMLElement|null} [context.liveRegion=null] - ARIA live region for screen readers.
 * @param {(...args: any[]) => void} [context.logger] - Optional logger callback.
 * @returns {{showToast: (message: string, type?: 'info'|'success'|'error') => void, announce: (message: string) => void}} Feedback API.
 */
export function createToastManager(context = {}) {
    const {
        toastContainer = typeof document !== 'undefined' ? document.getElementById('toast-container') : null,
        liveRegion = typeof document !== 'undefined' ? document.getElementById('sr-announcements') : null,
        logger = () => {}
    } = context;

    /**
     * Announces a message to screen readers via the ARIA live region.
     *
     * @param {string} message - Announcement text.
     * @returns {void}
     */
    function announce(message) {
        if (!liveRegion) return;
        liveRegion.textContent = '';
        setTimeout(() => {
            if (liveRegion) liveRegion.textContent = message;
        }, 100);
    }

    /**
     * Displays a stacking toast notification message on screen.
     *
     * @param {string} message - Message text.
     * @param {'info'|'success'|'error'} [type='info'] - Notification type level.
     * @returns {void}
     */
    function showToast(message, type = 'info') {
        logger(`TOAST (${type}): ${message}`);

        if (typeof document === 'undefined' || !toastContainer) {
            return;
        }

        const toast = document.createElement('div');
        toast.textContent = message;
        toast.className = `toast-message toast-${type}`;

        toastContainer.appendChild(toast);

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        } else {
            toast.classList.add('show');
        }

        announce(message);

        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
        }, 3000);

        setTimeout(() => {
            toast.remove();
        }, 3300);
    }

    return {
        showToast,
        announce
    };
}
