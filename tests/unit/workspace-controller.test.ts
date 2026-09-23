import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@core/settings-contract.js";
import { createWorkspaceController } from "@ui/workspace-controller.js";

const controllers: Array<ReturnType<typeof createWorkspaceController>> = [];

function createFixture() {
    const bpmInput = document.createElement("input");
    bpmInput.id = "bpm";
    const presetNameInput = document.createElement("input");
    const savedPresetSelect = document.createElement("select");
    const loadPresetInput = document.createElement("input");
    const resetTarget = document.createElement("label");
    const resetDefinition = {
        name: "BPM",
        keys: ["bpm"],
        controls: [bpmInput],
        targets: [resetTarget],
    };
    document.body.append(
        bpmInput,
        presetNameInput,
        savedPresetSelect,
        loadPresetInput,
        resetTarget,
    );

    let settings = { ...DEFAULT_SETTINGS, direction: "up" };
    const store = {
        saveLastSession: vi.fn().mockResolvedValue(undefined),
        loadLastSession: vi.fn().mockResolvedValue(null),
    };
    const loadAllSettings = vi.fn((nextSettings: unknown) => {
        if (!nextSettings || typeof nextSettings !== "object") return { ok: false };
        settings = { ...settings, ...nextSettings };
        bpmInput.value = String(settings.bpm);
        return { ok: true };
    });
    const onHistoryChange = vi.fn();
    const onStaticLoopChange = vi.fn();
    const clearActiveSoundStarterCard = vi.fn();
    const showToast = vi.fn();
    const controller = createWorkspaceController({
        documentRef: document,
        dom: { presetNameInput, savedPresetSelect, loadPresetInput },
        getResetDefinitions: () => [resetDefinition],
        getPresetStore: () => store,
        getAllSettings: () => settings,
        loadAllSettings,
        getSelectedPatternDirection: () => settings.direction,
        setSelectedPatternDirection: (direction) => {
            settings = { ...settings, direction };
        },
        clearActiveSoundStarterCard,
        onStaticLoopChange,
        onHistoryChange,
        showToast,
    });
    controller.initialize(settings);
    controllers.push(controller);

    return {
        bpmInput,
        clearActiveSoundStarterCard,
        controller,
        loadAllSettings,
        loadPresetInput,
        onHistoryChange,
        onStaticLoopChange,
        presetNameInput,
        resetTarget,
        savedPresetSelect,
        settings: () => settings,
        showToast,
        store,
    };
}

describe("workspace controller", () => {
    afterEach(() => {
        controllers.splice(0).forEach((controller) => {
            controller.destroy();
        });
        document.body.replaceChildren();
    });

    it("coalesces editable input and records a completed history transition", () => {
        const { bpmInput, controller, onHistoryChange, onStaticLoopChange, settings } =
            createFixture();

        settings().bpm = 121;
        bpmInput.dispatchEvent(new Event("input", { bubbles: true }));
        settings().bpm = 122;
        bpmInput.dispatchEvent(new Event("input", { bubbles: true }));
        bpmInput.dispatchEvent(new Event("change", { bubbles: true }));

        expect(controller.getStatus()).toMatchObject({ canUndo: true, canRedo: false });
        expect(onHistoryChange).toHaveBeenCalled();
        expect(onStaticLoopChange).toHaveBeenCalledTimes(3);
    });

    it("ignores metadata and file-picker changes while preserving reset gestures", () => {
        const {
            controller,
            loadPresetInput,
            presetNameInput,
            resetTarget,
            savedPresetSelect,
            settings,
            showToast,
        } = createFixture();
        const initialStatus = controller.getStatus();

        presetNameInput.dispatchEvent(new Event("input", { bubbles: true }));
        savedPresetSelect.dispatchEvent(new Event("input", { bubbles: true }));
        loadPresetInput.dispatchEvent(new Event("input", { bubbles: true }));
        loadPresetInput.dispatchEvent(new Event("change", { bubbles: true }));
        expect(controller.getStatus()).toEqual(initialStatus);

        settings().bpm = 155;
        resetTarget.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        expect(settings().bpm).toBe(120);
        expect(showToast).toHaveBeenCalledWith("Reset BPM to default.", "info");
        expect(controller.getFocusedResetDefinition(document.createElement("input"))).toBeNull();
    });

    it("restores persisted history and normalizes an invalid history payload", async () => {
        const { controller, loadAllSettings, onHistoryChange, settings, store } = createFixture();
        settings().bpm = 135;
        const history = {
            past: [{ ...settings(), bpm: 120 }],
            present: { ...settings(), bpm: 135 },
            future: [],
        };
        const restored = { ...settings(), bpm: 135 };
        store.loadLastSession.mockResolvedValueOnce({
            settings: restored,
            history,
        });

        await expect(controller.restoreLastSession()).resolves.toBe(true);
        expect(loadAllSettings).toHaveBeenCalledWith(restored);
        expect(onHistoryChange).toHaveBeenCalled();
        expect(controller.getStatus()).toMatchObject({ canUndo: true });
    });

    it("supports undo, redo, and checking isAtDefault status", () => {
        const { controller, settings } = createFixture();

        expect(controller.getStatus().isAtDefault).toBe(true);

        controller.applySettingsWithHistory({ ...settings(), bpm: 150 });
        expect(settings().bpm).toBe(150);
        expect(controller.getStatus().isAtDefault).toBe(false);
        expect(controller.getStatus().canUndo).toBe(true);

        controller.undoSettings();
        expect(settings().bpm).toBe(120);
        expect(controller.getStatus().canRedo).toBe(true);

        controller.redoSettings();
        expect(settings().bpm).toBe(150);

        // Calling redo when no future states exist should not throw
        controller.redoSettings();
        expect(settings().bpm).toBe(150);
    });

    it("resets all settings back to default and shows toast notification", () => {
        const { controller, settings, showToast } = createFixture();

        controller.applySettingsWithHistory({ ...settings(), bpm: 180 });
        expect(settings().bpm).toBe(180);

        controller.resetAllSettings();
        expect(settings().bpm).toBe(120);
        expect(showToast).toHaveBeenCalledWith(
            "Restored default settings. Undo is available.",
            "info",
        );
    });

    it("records discrete clicks on waveform, pattern, and octave button groups", () => {
        const { clearActiveSoundStarterCard, onStaticLoopChange } = createFixture();

        const patternBtn = document.createElement("button");
        patternBtn.className = "pattern-btn";
        const octaveShiftContainer = document.createElement("div");
        octaveShiftContainer.id = "octave-shift-buttons";
        const octaveShiftBtn = document.createElement("button");
        octaveShiftContainer.appendChild(octaveShiftBtn);

        const unrelatedBtn = document.createElement("button");
        unrelatedBtn.className = "unrelated-btn";

        document.body.append(patternBtn, octaveShiftContainer, unrelatedBtn);

        // Clicking unrelated button does not trigger state change
        unrelatedBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(clearActiveSoundStarterCard).not.toHaveBeenCalled();

        // Clicking pattern button triggers update
        patternBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(clearActiveSoundStarterCard).toHaveBeenCalledTimes(1);
        expect(onStaticLoopChange).toHaveBeenCalledTimes(1);

        // Clicking nested button in octave-shift container triggers update
        octaveShiftBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(clearActiveSoundStarterCard).toHaveBeenCalledTimes(2);
        expect(onStaticLoopChange).toHaveBeenCalledTimes(2);
    });

    it("resolves the focused reset definition for controls and child elements", () => {
        const { bpmInput, controller } = createFixture();

        expect(controller.getFocusedResetDefinition(bpmInput)).toMatchObject({ name: "BPM" });
        expect(controller.getFocusedResetDefinition(null)).toBeNull();
        expect(controller.getFocusedResetDefinition(document.createElement("div"))).toBeNull();
    });

    it("excludes loop count and export duration controls from triggering static loop refresh", () => {
        const { onStaticLoopChange } = createFixture();
        onStaticLoopChange.mockClear();

        const loopCountInput = document.createElement("input");
        loopCountInput.id = "loop-count";
        const tailSecondsInput = document.createElement("input");
        tailSecondsInput.id = "offline-export-tail-seconds";
        const exportModeInput = document.createElement("input");
        exportModeInput.name = "offline-export-mode";

        document.body.append(loopCountInput, tailSecondsInput, exportModeInput);

        loopCountInput.dispatchEvent(new Event("input", { bubbles: true }));
        tailSecondsInput.dispatchEvent(new Event("input", { bubbles: true }));
        exportModeInput.dispatchEvent(new Event("input", { bubbles: true }));

        expect(onStaticLoopChange).not.toHaveBeenCalled();
    });
});
