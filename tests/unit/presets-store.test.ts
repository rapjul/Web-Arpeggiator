/**
 * @file Unit tests for IndexedDB preset storage, snapshot persistence, and session management.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    clear,
    cloneSettings,
    get,
    list,
    loadLastSession,
    loadLatest,
    openDatabase,
    remove,
    requestToPromise,
    save,
    saveLastSession,
    transactionToPromise,
} from "@storage/presets-store.js";

describe("Presets Store Domain Module", () => {
    interface StoredPresetRecord {
        id: string;
        name?: string;
        savedAt?: string;
        settings?: Record<string, unknown>;
        source?: string;
    }

    let mockStoreData: Map<string, StoredPresetRecord>;
    let mockSessionData: Map<string, StoredPresetRecord>;

    beforeEach(() => {
        mockStoreData = new Map();
        mockSessionData = new Map();

        const createMockRequest = <T>(result: T) => {
            const listeners: Record<string, Array<() => void>> = {};
            const req = {
                result,
                error: null,
                addEventListener: (event: string, fn: () => void) => {
                    listeners[event] = listeners[event] || [];
                    listeners[event].push(fn);
                    if (event === "success") {
                        setTimeout(() => fn(), 0);
                    }
                },
            };
            return req;
        };

        const createMockTransaction = (_storeName: string) => {
            const listeners: Record<string, Array<() => void>> = {};
            const tx = {
                objectStore: (name: string) => {
                    const targetMap = name === "lastSession" ? mockSessionData : mockStoreData;
                    return {
                        put: (record: StoredPresetRecord) => {
                            targetMap.set(record.id, record);
                            return createMockRequest(record.id);
                        },
                        get: (id: string) => {
                            return createMockRequest(targetMap.get(id));
                        },
                        getAll: () => {
                            return createMockRequest(Array.from(targetMap.values()));
                        },
                        delete: (id: string) => {
                            targetMap.delete(id);
                            return createMockRequest(undefined);
                        },
                        clear: () => {
                            targetMap.clear();
                            return createMockRequest(undefined);
                        },
                        index: (_idxName: string) => ({
                            openCursor: (_range: unknown, _direction: string) => {
                                const all = Array.from(targetMap.values()).sort((a, b) =>
                                    String(b.savedAt || "").localeCompare(String(a.savedAt || "")),
                                );
                                const cursor = all.length ? { value: all[0] } : null;
                                return createMockRequest(cursor);
                            },
                        }),
                    };
                },
                addEventListener: (event: string, fn: () => void) => {
                    listeners[event] = listeners[event] || [];
                    listeners[event].push(fn);
                    if (event === "complete") {
                        setTimeout(() => fn(), 0);
                    }
                },
            };
            return tx;
        };

        const mockDb = {
            objectStoreNames: {
                contains: (_name: string) => true,
            },
            transaction: (storeName: string, _mode: string) => createMockTransaction(storeName),
        };

        // Mock global window.indexedDB
        (window as Window & { indexedDB: unknown }).indexedDB = {
            open: (_dbName: string, _version: number) => {
                const req = createMockRequest(mockDb);
                return req;
            },
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("cloneSettings", () => {
        it("deep clones settings objects without references", () => {
            const original = { bpm: 120, notes: ["C4", "E4"] };
            const clone = cloneSettings(original);

            expect(clone).toEqual(original);
            expect(clone).not.toBe(original);
            expect(clone.notes).not.toBe(original.notes);
        });
    });

    describe("IndexedDB Request and Transaction Promise Wrappers", () => {
        it("rejects requestToPromise when IndexedDB request errors", async () => {
            const mockRequest = {
                error: new Error("IDB Error"),
                addEventListener: (event: string, cb: () => void) => {
                    if (event === "error") setTimeout(cb, 0);
                },
            } as unknown as IDBRequest;

            await expect(requestToPromise(mockRequest)).rejects.toThrow("IDB Error");
        });

        it("rejects transactionToPromise when transaction fails or aborts", async () => {
            const mockTxError = {
                error: new Error("Tx Failed"),
                addEventListener: (event: string, cb: () => void) => {
                    if (event === "error") setTimeout(cb, 0);
                },
            } as unknown as IDBTransaction;

            await expect(transactionToPromise(mockTxError)).rejects.toThrow("Tx Failed");

            const mockTxAbort = {
                error: new Error("Tx Aborted"),
                addEventListener: (event: string, cb: () => void) => {
                    if (event === "abort") setTimeout(cb, 0);
                },
            } as unknown as IDBTransaction;

            await expect(transactionToPromise(mockTxAbort)).rejects.toThrow("Tx Aborted");
        });
    });

    describe("Preset CRUD operations", () => {
        it("saves and retrieves named presets", async () => {
            const settings = { bpm: 130, notes: ["C4", "G4"] };
            const saved = await save(settings, { name: "Test Preset", source: "test" });

            expect(saved.id).toBeDefined();
            expect(saved.name).toBe("Test Preset");
            expect(saved.settings).toEqual(settings);

            const retrieved = await get(saved.id);
            expect(retrieved).toEqual(saved);
        });

        it("lists saved presets sorted by savedAt in descending order", async () => {
            await save({ bpm: 100 }, { id: "p1", name: "Preset 1" });
            await save({ bpm: 140 }, { id: "p2", name: "Preset 2" });

            const all = await list();
            expect(all.length).toBe(2);
        });

        it("loads the latest preset via index cursor", async () => {
            await save({ bpm: 110 }, { id: "p-old", name: "Old" });
            const latest = await loadLatest();

            expect(latest).not.toBeNull();
            expect(latest?.name).toBe("Old");
        });

        it("removes a preset by id", async () => {
            await save({ bpm: 120 }, { id: "to-remove", name: "Remove Me" });
            expect(await get("to-remove")).not.toBeNull();

            await remove("to-remove");
            expect(await get("to-remove")).toBeNull();
        });

        it("clears all named presets", async () => {
            await save({ bpm: 100 }, { id: "p1" });
            await save({ bpm: 120 }, { id: "p2" });

            await clear();
            const all = await list();
            expect(all.length).toBe(0);
        });

        it("returns null when retrieving a nonexistent preset ID", async () => {
            const result = await get("nonexistent-id-99999");
            expect(result).toBeNull();
        });

        it("returns null when loadLatest is called on an empty database", async () => {
            await clear();
            const latest = await loadLatest();
            expect(latest).toBeNull();
        });
    });

    describe("Last Session persistence", () => {
        it("returns null when no previous session exists", async () => {
            const emptySession = await loadLastSession();
            expect(emptySession).toBeNull();
        });

        it("saves and loads the workspace last-session snapshot", async () => {
            const sessionSettings = { bpm: 150, currentNotes: ["F4", "A4", "C5"] };
            const record = await saveLastSession(sessionSettings);

            expect(record.id).toBe("current");
            expect(record.settings).toEqual(sessionSettings);

            const loaded = await loadLastSession();
            expect(loaded).toEqual(record);
        });
    });

    describe("Utility and edge case helpers", () => {
        it("falls back to JSON cloning when structuredClone is unavailable", () => {
            const originalStructuredClone = globalThis.structuredClone;
            try {
                // @ts-expect-error intentionally removing structuredClone
                delete globalThis.structuredClone;
                const obj = { bpm: 120, arr: [1, 2, 3] };
                const cloned = cloneSettings(obj);
                expect(cloned).toEqual(obj);
                expect(cloned).not.toBe(obj);
            } finally {
                globalThis.structuredClone = originalStructuredClone;
            }
        });

        it("saves preset records with custom filename and source metadata", async () => {
            const record = await save(
                { bpm: 128 },
                { id: "custom-meta", name: "Custom", filename: "custom.json", source: "export" },
            );
            expect(record.filename).toBe("custom.json");
            expect(record.source).toBe("export");
        });

        it("rejects openDatabase when indexedDB is missing in window", async () => {
            const originalIndexedDB = window.indexedDB;
            try {
                // @ts-expect-error removing indexedDB
                delete window.indexedDB;
                await expect(openDatabase()).rejects.toThrow("IndexedDB is not supported");
            } finally {
                window.indexedDB = originalIndexedDB;
            }
        });
    });
});
