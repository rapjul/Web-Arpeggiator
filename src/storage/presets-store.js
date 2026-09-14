/**
 * IndexedDB-backed preset store for Web Arpeggiator.
 *
 * The store keeps named user presets separately from the autosaved last session
 * so users can clear the preset library without losing the current workspace.
 *
 * @module storage/presets-store
 */

import { normalizeSettings } from "@core/settings-contract.js";

/** @typedef {import("../../types.d.ts").WebArpPresetMetadata} WebArpPresetMetadata */
/** @typedef {import("../../types.d.ts").WebArpPresetRecord} WebArpPresetRecord */

export const DB_NAME = "web-arpeggiator-presets";
export const DB_VERSION = 2;
export const STORE_NAME = "presetSnapshots";
export const LAST_SESSION_STORE_NAME = "lastSession";
export const LAST_SESSION_ID = "current";

let databasePromise = null;

/**
 * Clears a cached database-open attempt only when it is still the active one.
 * A failed IndexedDB open can be transient (for example, while browser storage
 * is being released). Keeping that rejected promise would make every later
 * preset and session operation fail until the page reloads.
 *
 * @param {Promise<IDBDatabase>} attempt - The open attempt that settled.
 * @returns {void}
 */
function clearCachedDatabaseAttempt(attempt) {
    if (databasePromise === attempt) {
        databasePromise = null;
    }
}

/**
 * Releases a cached connection after another browser context requests a
 * database version change. A later operation can then reopen the database.
 *
 * @param {IDBDatabase} database - Open IndexedDB database handle.
 * @param {Promise<IDBDatabase>} attempt - The successful open attempt.
 * @returns {void}
 */
function releaseDatabaseOnVersionChange(database, attempt) {
    if (typeof database.addEventListener !== "function") {
        return;
    }

    database.addEventListener("versionchange", () => {
        database.close();
        clearCachedDatabaseAttempt(attempt);
    });
}

/**
 * Creates a structured clone of preset settings for safe IndexedDB writes.
 *
 * @param {Record<string, unknown>} settings - Settings object collected from the app UI.
 * @returns {Record<string, unknown>} Deep-cloned settings snapshot.
 */
export function cloneSettings(settings) {
    if (typeof structuredClone === "function") {
        return structuredClone(settings);
    }

    return JSON.parse(JSON.stringify(settings));
}

/**
 * Checks whether a persisted value is a non-array object.
 *
 * @param {unknown} value - Candidate IndexedDB result.
 * @returns {value is Record<string, unknown>} Whether the value is a record.
 */
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates IndexedDB data before exposing it to application restoration.
 *
 * @param {unknown} value - Candidate preset record read from IndexedDB.
 * @returns {WebArpPresetRecord|null} A normalized record, or null when structurally invalid.
 */
function normalizeStoredPresetRecord(value) {
    if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        typeof value.savedAt !== "string" ||
        !isRecord(value.settings)
    ) {
        return null;
    }

    /** @type {WebArpPresetRecord} */
    const record = {
        id: value.id,
        savedAt: value.savedAt,
        settings: normalizeSettings(value.settings),
    };

    const name = value.name;
    const filename = value.filename;
    const source = value.source;
    const history = value.history;
    if (typeof name === "string") record.name = name;
    if (typeof filename === "string") record.filename = filename;
    if (filename === null) record.filename = null;
    if (typeof source === "string") record.source = source;
    if (isRecord(history)) record.history = history;
    if (history === null) record.history = null;

    return record;
}

/**
 * Converts an IndexedDB request into a Promise.
 *
 * @param {IDBRequest} request - IndexedDB request to observe.
 * @returns {Promise<*>} Resolves with `request.result`.
 */
export function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () =>
            reject(request.error || new Error("IndexedDB request failed")),
        );
    });
}

/**
 * Converts an IndexedDB transaction completion into a Promise.
 *
 * @param {IDBTransaction} transaction - Transaction to observe.
 * @returns {Promise<void>} Resolves when the transaction completes.
 */
export function transactionToPromise(transaction) {
    return new Promise((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve());
        transaction.addEventListener("error", () =>
            reject(transaction.error || new Error("IndexedDB transaction failed")),
        );
        transaction.addEventListener("abort", () =>
            reject(transaction.error || new Error("IndexedDB transaction aborted")),
        );
    });
}

/**
 * Opens or reuses the Web Arpeggiator preset database.
 *
 * @returns {Promise<IDBDatabase>} Open IndexedDB database handle.
 */
export function openDatabase() {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
        return Promise.reject(new Error("IndexedDB is not supported in this browser."));
    }

    if (!databasePromise) {
        const openAttempt = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.addEventListener("upgradeneeded", () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, {
                        keyPath: "id",
                    });
                    store.createIndex("savedAt", "savedAt", {
                        unique: false,
                    });
                }

                if (!database.objectStoreNames.contains(LAST_SESSION_STORE_NAME)) {
                    database.createObjectStore(LAST_SESSION_STORE_NAME, {
                        keyPath: "id",
                    });
                }
            });

            request.addEventListener("success", () => {
                resolve(request.result);
            });

            request.addEventListener("error", () => {
                reject(request.error || new Error("Unable to open IndexedDB"));
            });
        });

        databasePromise = openAttempt;
        openAttempt.then(
            (database) => {
                releaseDatabaseOnVersionChange(database, openAttempt);
            },
            () => {
                clearCachedDatabaseAttempt(openAttempt);
            },
        );
    }

    return databasePromise;
}

/**
 * Saves a named preset snapshot.
 *
 * @param {unknown} settings - Preset settings to persist.
 * @param {WebArpPresetMetadata} [metadata={}] - Optional id, name, filename, and source data.
 * @returns {Promise<WebArpPresetRecord>} Stored preset record.
 */
export async function save(settings, metadata = {}) {
    const settingsSnapshot = cloneSettings(normalizeSettings(settings));
    const now = new Date().toISOString();
    const database = await openDatabase();
    const record = {
        id: metadata.id || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        name: metadata.name || metadata.filename || `Preset ${now}`,
        savedAt: now,
        filename: metadata.filename || null,
        source: metadata.source || "manual",
        settings: settingsSnapshot,
    };

    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    await transactionToPromise(transaction);
    return record;
}

/**
 * Loads a preset by id.
 *
 * @param {string} id - Preset record id.
 * @returns {Promise<WebArpPresetRecord|null>} Stored preset record or null.
 */
export async function get(id) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);
    const record = await requestToPromise(request);
    await transactionToPromise(transaction);
    return normalizeStoredPresetRecord(record);
}

/**
 * Loads the most recently saved named preset.
 *
 * @returns {Promise<WebArpPresetRecord|null>} Newest preset record or null.
 */
export async function loadLatest() {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("savedAt");
    const request = index.openCursor(null, "prev");
    const cursor = await requestToPromise(request);
    await transactionToPromise(transaction);

    if (!cursor) {
        return null;
    }

    return normalizeStoredPresetRecord(cursor.value);
}

/**
 * Lists saved presets newest-first.
 *
 * @returns {Promise<WebArpPresetRecord[]>} Sorted preset records.
 */
export async function list() {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    const records = await requestToPromise(request);
    await transactionToPromise(transaction);
    const normalizedRecords = Array.isArray(records)
        ? records
              .map((record) => normalizeStoredPresetRecord(record))
              .filter((record) => record !== null)
        : [];
    return normalizedRecords.sort((a, b) =>
        String(b.savedAt || "").localeCompare(String(a.savedAt || "")),
    );
}

/**
 * Deletes one saved preset.
 *
 * @param {string} id - Preset record id to remove.
 * @returns {Promise<void>} Resolves after deletion.
 */
export async function remove(id) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionToPromise(transaction);
}

/**
 * Clears all named presets while leaving last-session data intact.
 *
 * @returns {Promise<void>} Resolves after clearing the preset store.
 */
export async function clear() {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionToPromise(transaction);
}

/**
 * Saves the debounced current session snapshot.
 *
 * @param {unknown} settings - Current app settings.
 * @param {unknown} [history=null] - Optional undo/redo history state.
 * @returns {Promise<WebArpPresetRecord>} Stored last-session record.
 */
export async function saveLastSession(settings, history = null) {
    const settingsSnapshot = cloneSettings(normalizeSettings(settings));
    const database = await openDatabase();
    const record = {
        id: LAST_SESSION_ID,
        savedAt: new Date().toISOString(),
        settings: settingsSnapshot,
        history: isRecord(history) ? cloneSettings(history) : null,
    };

    const transaction = database.transaction(LAST_SESSION_STORE_NAME, "readwrite");
    transaction.objectStore(LAST_SESSION_STORE_NAME).put(record);
    await transactionToPromise(transaction);
    return record;
}

/**
 * Loads the current last-session snapshot.
 *
 * @returns {Promise<WebArpPresetRecord|null>} Last-session record or null.
 */
export async function loadLastSession() {
    const database = await openDatabase();
    const transaction = database.transaction(LAST_SESSION_STORE_NAME, "readonly");
    const request = transaction.objectStore(LAST_SESSION_STORE_NAME).get(LAST_SESSION_ID);
    const record = await requestToPromise(request);
    await transactionToPromise(transaction);
    return normalizeStoredPresetRecord(record);
}

// Public storage API used by the single-file app and browser tests.
if (typeof window !== "undefined") {
    window.WebArpPresetStore = {
        save,
        get,
        loadLatest,
        list,
        remove,
        clear,
        saveLastSession,
        loadLastSession,
        dbName: DB_NAME,
    };
}
