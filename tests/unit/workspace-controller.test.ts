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
        targets: ["label"],
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
        const { controller, loadPresetInput, presetNameInput, resetTarget, settings, showToast } =
            createFixture();
        const initialStatus = controller.getStatus();

        presetNameInput.dispatchEvent(new Event("input", { bubbles: true }));
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
            past: [{ ...settings, bpm: 120 }],
            present: { ...settings, bpm: 135 },
            future: [],
        };
        store.loadLastSession.mockResolvedValueOnce({
            settings: { ...settings, bpm: 135 },
            history,
        });

        await expect(controller.restoreLastSession()).resolves.toBe(true);
        expect(loadAllSettings).toHaveBeenCalledWith({ ...settings, bpm: 135 });
        expect(onHistoryChange).toHaveBeenCalled();
        expect(controller.getStatus()).toMatchObject({ canUndo: true });
    });
});
