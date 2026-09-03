/**
 * Workspace session persistence and auto-save scheduling.
 *
 * @module storage/session-manager
 */

/**
 * Creates a debounced version of a callback function.
 *
 * @template {(...args: any[]) => any} T
 * @param {T} func - Callback function to debounce.
 * @param {number} wait - Delay duration in milliseconds.
 * @returns {T} Debounced wrapper function.
 */
export function debounce(func, wait) {
    let timeoutId;
    return /** @type {any} */ (
        function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, wait);
        }
    );
}

/**
 * Creates a session manager to coordinate auto-saving and restoring workspace state from IndexedDB.
 *
 * @param {object} options - Configuration options for session management.
 * @param {() => any} options.getPresetStore - Accessor for WebArpPresetStore instance.
 * @param {() => Record<string, unknown>} options.getSettings - Accessor for serialized settings snapshot.
 * @param {() => Record<string, unknown> | null} [options.getHistoryState] - Accessor for undo/redo history state.
 * @param {(settings: Record<string, unknown>, history: Record<string, unknown> | null) => void} options.onRestore - Callback when a previous session is restored.
 * @param {(updates: Record<string, unknown>) => void} [options.updateTestState] - Callback to report test state mirror updates.
 * @param {number} [options.delayMs=2000] - Auto-save debounce delay in milliseconds.
 * @returns {object} Session manager controller.
 */
export function createSessionManager(options) {
    const {
        getPresetStore,
        getSettings,
        getHistoryState,
        onRestore,
        updateTestState,
        delayMs = 2000,
    } = options;

    let saveTimer = null;
    let isRestoring = false;

    /**
     * Saves the current settings as the active workspace session.
     *
     * @returns {Promise<void>}
     */
    async function saveNow() {
        const store = getPresetStore();
        if (!store || isRestoring) {
            return;
        }
        try {
            const settings = getSettings();
            const history = typeof getHistoryState === "function" ? getHistoryState() : null;
            const record = await store.saveLastSession(settings, history);
            if (updateTestState && record) {
                updateTestState({
                    lastSessionId: record.id,
                    lastSessionSavedAt: record.savedAt,
                });
            }
        } catch (error) {
            console.warn("Failed to persist workspace session:", error);
        }
    }

    /**
     * Schedules a debounced session save after the configured delay.
     *
     * @returns {void}
     */
    function scheduleSave() {
        if (isRestoring) {
            return;
        }
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(() => {
            saveNow();
        }, delayMs);
    }

    /**
     * Cancels any pending scheduled session save.
     *
     * @returns {void}
     */
    function cancelScheduledSave() {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
    }

    /**
     * Restores the most recently saved workspace session from the preset store.
     *
     * @returns {Promise<boolean>} True if a session was restored, false otherwise.
     */
    async function restoreSession() {
        const store = getPresetStore();
        if (!store) {
            if (updateTestState) {
                updateTestState({ lastSessionRestoreFinished: true });
            }
            return false;
        }

        try {
            const record = await store.loadLastSession();
            if (record?.settings) {
                isRestoring = true;
                onRestore(record.settings, record.history || null);
                isRestoring = false;
                if (updateTestState) {
                    updateTestState({ lastSessionRestoreFinished: true });
                }
                return true;
            }
        } catch (error) {
            console.warn("Failed to restore workspace session:", error);
        } finally {
            isRestoring = false;
            if (updateTestState) {
                updateTestState({ lastSessionRestoreFinished: true });
            }
        }
        return false;
    }

    return {
        saveNow,
        scheduleSave,
        cancelScheduledSave,
        restoreSession,
        getIsRestoring: () => isRestoring,
    };
}
