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
    let mockStoreData: Map<string, any>;
    let mockSessionData: Map<string, any>;

    beforeEach(() => {
        mockStoreData = new Map();
        mockSessionData = new Map();

        const createMockRequest = (result: any) => {
            const listeners: Record<string, Function[]> = {};
            const req = {
                result,
                error: null,
                addEventListener: (event: string, fn: Function) => {
                    listeners[event] = listeners[event] || [];
                    listeners[event].push(fn);
                    if (event === "success") {
                        setTimeout(() => fn(), 0);
                    }
                },
            };
            return req;
        };

        const createMockTransaction = (storeName: string) => {
            const listeners: Record<string, Function[]> = {};
            const tx = {
                objectStore: (name: string) => {
                    const targetMap = name === "lastSession" ? mockSessionData : mockStoreData;
                    return {
                        put: (record: any) => {
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
                            openCursor: (_range: any, _direction: string) => {
                                const all = Array.from(targetMap.values()).sort((a, b) =>
                                    String(b.savedAt || "").localeCompare(String(a.savedAt || "")),
                                );
                                const cursor = all.length ? { value: all[0] } : null;
                                return createMockRequest(cursor);
                            },
                        }),
                    };
                },
                addEventListener: (event: string, fn: Function) => {
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
        (window as any).indexedDB = {
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
            const mockRequest: any = {
                error: new Error("IDB Error"),
                addEventListener: (event: string, cb: Function) => {
                    if (event === "error") setTimeout(cb, 0);
                },
            };

            await expect(requestToPromise(mockRequest)).rejects.toThrow("IDB Error");
        });

        it("rejects transactionToPromise when transaction fails or aborts", async () => {
            const mockTxError: any = {
                error: new Error("Tx Failed"),
                addEventListener: (event: string, cb: Function) => {
                    if (event === "error") setTimeout(cb, 0);
                },
            };

            await expect(transactionToPromise(mockTxError)).rejects.toThrow("Tx Failed");

            const mockTxAbort: any = {
                error: new Error("Tx Aborted"),
                addEventListener: (event: string, cb: Function) => {
                    if (event === "abort") setTimeout(cb, 0);
                },
            };

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
            const record = await save({ bpm: 120 }, { id: "to-remove", name: "Remove Me" });
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
});
