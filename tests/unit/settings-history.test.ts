import { describe, expect, it } from "vitest";
import { MAX_HISTORY_ENTRIES, createSettingsHistory } from "@core/settings-history.js";

describe("Settings History", () => {
    const first = { bpm: 120, baseNotes: ["C4", "E4", "G4"] };
    const second = { bpm: 130, baseNotes: ["C4", "E4", "G4"] };
    const third = { bpm: 140, baseNotes: ["C4", "E4", "G4"] };

    it("records undo and redo snapshots without retaining mutable references", () => {
        const history = createSettingsHistory();
        history.initialize(first);
        history.record(second);
        history.record(third);

        const undone = history.undo();
        expect(undone).toEqual(second);
        if (undone) undone.bpm = 1;
        expect(history.getCurrent()).toEqual(second);

        expect(history.undo()).toEqual(first);
        expect(history.redo()).toEqual(second);
        expect(history.redo()).toEqual(third);
    });

    it("suppresses duplicate snapshots and clears redo after a new change", () => {
        const history = createSettingsHistory();
        history.initialize(first);
        expect(history.record(first)).toBe(false);
        expect(history.record(second)).toBe(true);
        expect(history.undo()).toEqual(first);
        expect(history.canRedo()).toBe(true);

        history.record(third);
        expect(history.canRedo()).toBe(false);
        expect(history.redo()).toBeNull();
    });

    it("coalesces a continuous input gesture into one undo entry", () => {
        const history = createSettingsHistory();
        history.initialize(first);
        history.recordCoalesced({ ...first, bpm: 121 });
        history.recordCoalesced({ ...first, bpm: 122 });
        history.recordCoalesced(second);
        history.endTransaction();

        expect(history.undo()).toEqual(first);
        expect(history.canUndo()).toBe(false);
        expect(history.redo()).toEqual(second);
    });

    it("evicts the oldest snapshots beyond its configured capacity", () => {
        const history = createSettingsHistory({ limit: 2 });
        history.initialize({ bpm: 100 });
        history.record({ bpm: 101 });
        history.record({ bpm: 102 });
        history.record({ bpm: 103 });

        expect(history.undo()).toEqual({ bpm: 102 });
        expect(history.undo()).toEqual({ bpm: 101 });
        expect(history.undo()).toBeNull();
    });

    it("keeps exactly one hundred prior settings at the default capacity", () => {
        const history = createSettingsHistory();
        history.initialize({ step: 0 });
        for (let step = 1; step <= MAX_HISTORY_ENTRIES + 1; step += 1) {
            history.record({ step });
        }

        expect(history.exportState().past).toHaveLength(MAX_HISTORY_ENTRIES);
        expect(history.undo()).toEqual({ step: MAX_HISTORY_ENTRIES });
    });

    it("imports matching persisted history and rejects malformed or mismatched state", () => {
        const source = createSettingsHistory();
        source.initialize(first);
        source.record(second);
        const saved = source.exportState();

        const restored = createSettingsHistory();
        expect(restored.restore(saved, second)).toBe(true);
        expect(restored.undo()).toEqual(first);

        expect(restored.restore({ past: [], present: { bpm: 1 }, future: [] }, second)).toBe(false);
        expect(restored.getCurrent()).toEqual(second);
        expect(restored.restore(null, first)).toBe(false);
        expect(restored.getCurrent()).toEqual(first);
    });
});
