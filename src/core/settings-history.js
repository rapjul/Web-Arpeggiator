/**
 * Immutable undo/redo history for serialized arpeggiator settings.
 *
 * @module settings-history
 */

export const MAX_HISTORY_ENTRIES = 100;

/**
 * Returns whether a value is a settings-like record.
 *
 * @param {unknown} value - Value to validate.
 * @returns {value is Record<string, unknown>} Whether the value is a plain record.
 */
function isSettingsRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Returns whether a persisted snapshot matches the live serialized-settings schema.
 *
 * @param {unknown} snapshot - Persisted snapshot to validate.
 * @param {unknown} schema - Live settings value that defines the expected shape.
 * @returns {boolean} Whether the snapshot is compatible with the live settings schema.
 */
function matchesSettingsSchema(snapshot, schema) {
    if (Array.isArray(schema)) {
        return (
            Array.isArray(snapshot) &&
            (schema.length === 0 ||
                snapshot.every((value) => matchesSettingsSchema(value, schema[0])))
        );
    }

    if (isSettingsRecord(schema)) {
        if (!isSettingsRecord(snapshot)) return false;
        const schemaKeys = Object.keys(schema);
        const snapshotKeys = Object.keys(snapshot);
        return (
            schemaKeys.length === snapshotKeys.length &&
            schemaKeys.every(
                (key) =>
                    Object.hasOwn(snapshot, key) &&
                    matchesSettingsSchema(snapshot[key], schema[key]),
            )
        );
    }

    if (typeof schema === "number") {
        return typeof snapshot === "number" && Number.isFinite(snapshot);
    }

    return typeof snapshot === typeof schema;
}

/**
 * Deep-clones a serializable settings record.
 *
 * @param {Record<string, unknown>} settings - Settings snapshot to clone.
 * @returns {Record<string, unknown>} Independent settings snapshot.
 */
function cloneSnapshot(settings) {
    if (typeof structuredClone === "function") {
        return structuredClone(settings);
    }

    return JSON.parse(JSON.stringify(settings));
}

/**
 * Compares serialized settings snapshots.
 *
 * @param {Record<string, unknown> | null} first - First snapshot.
 * @param {Record<string, unknown> | null} second - Second snapshot.
 * @returns {boolean} Whether the snapshots contain the same serialized settings.
 */
function snapshotsEqual(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
}

/**
 * Creates a bounded, serializable settings history controller.
 *
 * @param {{limit?: number}} [options={}] - History configuration.
 * @returns {{initialize: (settings: Record<string, unknown>) => void, restore: (state: unknown, fallback: Record<string, unknown>) => boolean, record: (settings: Record<string, unknown>) => boolean, recordCoalesced: (settings: Record<string, unknown>) => boolean, endTransaction: () => void, undo: () => Record<string, unknown> | null, redo: () => Record<string, unknown> | null, canUndo: () => boolean, canRedo: () => boolean, getCurrent: () => Record<string, unknown> | null, exportState: () => {past: Record<string, unknown>[], present: Record<string, unknown> | null, future: Record<string, unknown>[]}}} Settings history controller.
 */
export function createSettingsHistory(options = {}) {
    const requestedLimit = Number(options.limit);
    const limit =
        Number.isInteger(requestedLimit) && requestedLimit > 0
            ? requestedLimit
            : MAX_HISTORY_ENTRIES;

    /** @type {Record<string, unknown>[]} */
    let past = [];
    /** @type {Record<string, unknown> | null} */
    let present = null;
    /** @type {Record<string, unknown>[]} */
    let future = [];
    let transactionActive = false;

    /**
     * Limits a stack to the newest configured entries.
     *
     * @param {Record<string, unknown>[]} snapshots - Snapshots to trim.
     * @returns {Record<string, unknown>[]} Bounded snapshot list.
     */
    function trimSnapshots(snapshots) {
        return snapshots.slice(-limit);
    }

    /**
     * Initializes history from a live settings snapshot.
     *
     * @param {Record<string, unknown>} settings - Current settings.
     * @returns {void}
     */
    function initialize(settings) {
        present = cloneSnapshot(settings);
        past = [];
        future = [];
        transactionActive = false;
    }

    /**
     * Records an atomic settings update.
     *
     * @param {Record<string, unknown>} settings - New current settings.
     * @returns {boolean} Whether the update changed history.
     */
    function record(settings) {
        if (!present) {
            initialize(settings);
            return false;
        }

        const next = cloneSnapshot(settings);
        transactionActive = false;
        if (snapshotsEqual(present, next)) return false;

        past = trimSnapshots([...past, present]);
        present = next;
        future = [];
        return true;
    }

    /**
     * Records a change that belongs to an active continuous input gesture.
     *
     * @param {Record<string, unknown>} settings - New current settings.
     * @returns {boolean} Whether the update changed history.
     */
    function recordCoalesced(settings) {
        if (!present) {
            initialize(settings);
            return false;
        }

        const next = cloneSnapshot(settings);
        if (snapshotsEqual(present, next)) return false;

        if (!transactionActive) {
            past = trimSnapshots([...past, present]);
            future = [];
            transactionActive = true;
        }
        present = next;
        return true;
    }

    /**
     * Marks a continuous input gesture as complete.
     *
     * @returns {void}
     */
    function endTransaction() {
        transactionActive = false;
    }

    /**
     * Restores persisted history only when it matches the persisted live settings.
     *
     * @param {unknown} state - Persisted history state.
     * @param {Record<string, unknown>} fallback - Live settings to use when state is invalid.
     * @returns {boolean} Whether persisted history was accepted.
     */
    function restore(state, fallback) {
        if (
            !isSettingsRecord(state) ||
            !isSettingsRecord(fallback) ||
            !matchesSettingsSchema(state.present, fallback)
        ) {
            initialize(fallback);
            return false;
        }

        const rawPast = Array.isArray(state.past) ? state.past : null;
        const rawFuture = Array.isArray(state.future) ? state.future : null;
        if (
            !rawPast ||
            !rawFuture ||
            !rawPast.every((snapshot) => matchesSettingsSchema(snapshot, fallback)) ||
            !rawFuture.every((snapshot) => matchesSettingsSchema(snapshot, fallback)) ||
            !snapshotsEqual(state.present, fallback)
        ) {
            initialize(fallback);
            return false;
        }

        past = trimSnapshots(rawPast.map(cloneSnapshot));
        present = cloneSnapshot(state.present);
        future = trimSnapshots(rawFuture.map(cloneSnapshot));
        transactionActive = false;
        return true;
    }

    /**
     * Restores the prior snapshot, if available.
     *
     * @returns {Record<string, unknown> | null} Snapshot to apply, or null.
     */
    function undo() {
        endTransaction();
        if (!present || past.length === 0) return null;

        const previous = past[past.length - 1];
        past = past.slice(0, -1);
        future = trimSnapshots([...future, present]);
        present = cloneSnapshot(previous);
        return cloneSnapshot(present);
    }

    /**
     * Restores the next snapshot, if available.
     *
     * @returns {Record<string, unknown> | null} Snapshot to apply, or null.
     */
    function redo() {
        endTransaction();
        if (!present || future.length === 0) return null;

        const next = future[future.length - 1];
        future = future.slice(0, -1);
        past = trimSnapshots([...past, present]);
        present = cloneSnapshot(next);
        return cloneSnapshot(present);
    }

    /**
     * Exports a detached state suitable for persistence.
     *
     * @returns {{past: Record<string, unknown>[], present: Record<string, unknown> | null, future: Record<string, unknown>[]}} Persistable history state.
     */
    function exportState() {
        return {
            past: past.map(cloneSnapshot),
            present: present ? cloneSnapshot(present) : null,
            future: future.map(cloneSnapshot),
        };
    }

    return {
        initialize,
        restore,
        record,
        recordCoalesced,
        endTransaction,
        undo,
        redo,
        canUndo: () => past.length > 0,
        canRedo: () => future.length > 0,
        getCurrent: () => (present ? cloneSnapshot(present) : null),
        exportState,
    };
}
