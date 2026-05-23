/**
 * IndexedDB-backed preset store for Web Arpeggiator.
 *
 * The store keeps named user presets separately from the autosaved last session
 * so users can clear the preset library without losing the current workspace.
 */
(() => {
    const DB_NAME = 'web-arpeggiator-presets';
    const DB_VERSION = 2;
    const STORE_NAME = 'presetSnapshots';
    const LAST_SESSION_STORE_NAME = 'lastSession';
    const LAST_SESSION_ID = 'current';

    let databasePromise = null;

    /**
     * Creates a structured clone of preset settings for safe IndexedDB writes.
     *
     * @param {object} settings - Settings object collected from the app UI.
     * @returns {object} Deep-cloned settings snapshot.
     */
    function cloneSettings(settings) {
        if (typeof structuredClone === 'function') {
            return structuredClone(settings);
        }

        return JSON.parse(JSON.stringify(settings));
    }

    /**
     * Converts an IndexedDB request into a Promise.
     *
     * @param {IDBRequest} request - IndexedDB request to observe.
     * @returns {Promise<*>} Resolves with `request.result`.
     */
    function requestToPromise(request) {
        return new Promise((resolve, reject) => {
            request.addEventListener('success', () => resolve(request.result));
            request.addEventListener('error', () => reject(request.error || new Error('IndexedDB request failed')));
        });
    }

    /**
     * Converts an IndexedDB transaction completion into a Promise.
     *
     * @param {IDBTransaction} transaction - Transaction to observe.
     * @returns {Promise<void>} Resolves when the transaction completes.
     */
    function transactionToPromise(transaction) {
        return new Promise((resolve, reject) => {
            transaction.addEventListener('complete', () => resolve());
            transaction.addEventListener('error', () => reject(transaction.error || new Error('IndexedDB transaction failed')));
            transaction.addEventListener('abort', () => reject(transaction.error || new Error('IndexedDB transaction aborted')));
        });
    }

    /**
     * Opens or reuses the Web Arpeggiator preset database.
     *
     * @returns {Promise<IDBDatabase>} Open IndexedDB database handle.
     */
    function openDatabase() {
        if (!('indexedDB' in window)) {
            return Promise.reject(new Error('IndexedDB is not supported in this browser.'));
        }

        if (!databasePromise) {
            databasePromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.addEventListener('upgradeneeded', () => {
                    const database = request.result;
                    if (!database.objectStoreNames.contains(STORE_NAME)) {
                        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                        store.createIndex('savedAt', 'savedAt', { unique: false });
                    }

                    if (!database.objectStoreNames.contains(LAST_SESSION_STORE_NAME)) {
                        database.createObjectStore(LAST_SESSION_STORE_NAME, { keyPath: 'id' });
                    }
                });

                request.addEventListener('success', () => {
                    resolve(request.result);
                });

                request.addEventListener('error', () => {
                    reject(request.error || new Error('Unable to open IndexedDB'));
                });
            });
        }

        return databasePromise;
    }

    /**
     * Saves a named preset snapshot.
     *
     * @param {object} settings - Preset settings to persist.
     * @param {object} [metadata={}] - Optional id, name, filename, and source data.
     * @returns {Promise<object>} Stored preset record.
     */
    async function save(settings, metadata = {}) {
        const settingsSnapshot = cloneSettings(settings);
        const now = new Date().toISOString();
        const database = await openDatabase();
        const record = {
            id: metadata.id || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            name: metadata.name || metadata.filename || `Preset ${now}`,
            savedAt: now,
            filename: metadata.filename || null,
            source: metadata.source || 'manual',
            settings: settingsSnapshot
        };

        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(record);
        await transactionToPromise(transaction);
        return record;
    }

    /**
     * Loads a preset by id.
     *
     * @param {string} id - Preset record id.
     * @returns {Promise<object|null>} Stored preset record or null.
     */
    async function get(id) {
        const database = await openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(id);
        const record = await requestToPromise(request);
        await transactionToPromise(transaction);
        return record || null;
    }

    /**
     * Loads the most recently saved named preset.
     *
     * @returns {Promise<object|null>} Newest preset record or null.
     */
    async function loadLatest() {
        const database = await openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('savedAt');
        const request = index.openCursor(null, 'prev');
        const cursor = await requestToPromise(request);
        await transactionToPromise(transaction);

        if (!cursor) {
            return null;
        }

        return cursor.value;
    }

    /**
     * Lists saved presets newest-first.
     *
     * @returns {Promise<object[]>} Sorted preset records.
     */
    async function list() {
        const database = await openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).getAll();
        const records = await requestToPromise(request);
        await transactionToPromise(transaction);
        return records.sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
    }

    /**
     * Deletes one saved preset.
     *
     * @param {string} id - Preset record id to remove.
     * @returns {Promise<void>} Resolves after deletion.
     */
    async function remove(id) {
        const database = await openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(id);
        await transactionToPromise(transaction);
    }

    /**
     * Clears all named presets while leaving last-session data intact.
     *
     * @returns {Promise<void>} Resolves after clearing the preset store.
     */
    async function clear() {
        const database = await openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
        await transactionToPromise(transaction);
    }

    /**
     * Saves the debounced current session snapshot.
     *
     * @param {object} settings - Current app settings.
     * @returns {Promise<object>} Stored last-session record.
     */
    async function saveLastSession(settings) {
        const settingsSnapshot = cloneSettings(settings);
        const database = await openDatabase();
        const record = {
            id: LAST_SESSION_ID,
            savedAt: new Date().toISOString(),
            settings: settingsSnapshot
        };

        const transaction = database.transaction(LAST_SESSION_STORE_NAME, 'readwrite');
        transaction.objectStore(LAST_SESSION_STORE_NAME).put(record);
        await transactionToPromise(transaction);
        return record;
    }

    /**
     * Loads the current last-session snapshot.
     *
     * @returns {Promise<object|null>} Last-session record or null.
     */
    async function loadLastSession() {
        const database = await openDatabase();
        const transaction = database.transaction(LAST_SESSION_STORE_NAME, 'readonly');
        const request = transaction.objectStore(LAST_SESSION_STORE_NAME).get(LAST_SESSION_ID);
        const record = await requestToPromise(request);
        await transactionToPromise(transaction);
        return record || null;
    }

    // Public storage API used by the single-file app and browser tests.
    window.WebArpPresetStore = {
        save,
        get,
        loadLatest,
        list,
        remove,
        clear,
        saveLastSession,
        loadLastSession,
        dbName: DB_NAME
    };
})();
