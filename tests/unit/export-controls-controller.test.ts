import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@core/settings-contract.js";
import { createExportControlsController } from "@ui/export-controls-controller.js";

const controllers: Array<ReturnType<typeof createExportControlsController>> = [];

function createFixture() {
    const loopCountInput = document.createElement("input");
    loopCountInput.value = "2";
    const modeTailInput = document.createElement("input");
    modeTailInput.type = "radio";
    modeTailInput.name = "offline-export-mode";
    modeTailInput.value = "tail";
    modeTailInput.checked = true;
    const modeSeamlessInput = document.createElement("input");
    modeSeamlessInput.type = "radio";
    modeSeamlessInput.name = "offline-export-mode";
    modeSeamlessInput.value = "seamless";
    const tailControl = document.createElement("div");
    const tailSecondsInput = document.createElement("input");
    tailSecondsInput.value = "2";
    const duration = document.createElement("output");
    const recordButton = document.createElement("button");
    const exportButton = document.createElement("button");
    const offlineExportButton = document.createElement("button");
    const midiButton = document.createElement("button");
    const toggleVisualizerButton = document.createElement("button");
    const visualizerModeSelect = document.createElement("select");
    visualizerModeSelect.innerHTML =
        '<option value="oscilloscope">Oscilloscope</option><option value="loopMap">Loop Map</option>';
    document.body.append(
        loopCountInput,
        modeTailInput,
        modeSeamlessInput,
        tailControl,
        tailSecondsInput,
        duration,
        recordButton,
        exportButton,
        offlineExportButton,
        midiButton,
        toggleVisualizerButton,
        visualizerModeSelect,
    );

    const settings = { ...DEFAULT_SETTINGS, baseNotes: ["C4", "E4", "G4"] };
    const recorder = {
        toggleRecording: vi.fn(async () => {}),
        exportRealtime: vi.fn(async () => {}),
        exportOffline: vi.fn(async () => {}),
    };
    const visualizer = { currentMode: "loopMap", toggle: vi.fn() };
    const startAudio = vi.fn(async () => {});
    const renderStaticLoop = vi.fn(async () => {});
    const showToast = vi.fn();
    const controller = createExportControlsController({
        dom: {
            loopCountInput,
            offlineExportModeInputs: document.querySelectorAll("input[name='offline-export-mode']"),
            offlineExportTailControl: tailControl,
            offlineExportTailSecondsInput: tailSecondsInput,
            offlineExportDuration: duration,
            recordButton,
            exportButton,
            offlineExportButton,
            offlineExportMidiButton: midiButton,
            toggleVisualizerButton,
            visualizerModeSelect,
        },
        getSettings: () => settings,
        getCurrentNotes: () => ({ notes: settings.baseNotes, octaveRange: 2, octaveShift: 0 }),
        getRecorderManager: () => recorder,
        getVisualizer: () => visualizer,
        startAudio,
        generateFilename: () => "arpeggio",
        showToast,
        renderStaticLoop,
        debounce: (callback) => callback,
        logger: { warn: vi.fn() },
    });
    controller.initialize();
    controllers.push(controller);

    return {
        controller,
        duration,
        loopCountInput,
        modeSeamlessInput,
        midiButton,
        offlineExportButton,
        recorder,
        recordButton,
        renderStaticLoop,
        showToast,
        startAudio,
        tailControl,
        tailSecondsInput,
        toggleVisualizerButton,
        visualizer,
    };
}

describe("export controls controller", () => {
    afterEach(() => {
        controllers.splice(0).forEach((controller) => {
            controller.destroy();
        });
        document.body.replaceChildren();
    });

    it("normalizes export inputs, updates duration, and controls tail visibility", () => {
        const {
            controller,
            duration,
            loopCountInput,
            modeSeamlessInput,
            tailControl,
            tailSecondsInput,
        } = createFixture();

        expect(duration.textContent).toContain("Pattern cycles");
        modeSeamlessInput.checked = true;
        modeSeamlessInput.dispatchEvent(new Event("change", { bubbles: true }));
        expect(tailControl.classList.contains("hidden")).toBe(true);
        expect(tailSecondsInput.disabled).toBe(true);

        loopCountInput.value = "999";
        loopCountInput.dispatchEvent(new Event("change", { bubbles: true }));
        expect(loopCountInput.value).toBe("100");
        expect(controller.updateEstimatedExportDuration).toBeTypeOf("function");
    });

    it("starts recording and rendering exports only after audio activation", async () => {
        const { offlineExportButton, recorder, recordButton, startAudio } = createFixture();

        recordButton.click();
        offlineExportButton.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(startAudio).toHaveBeenCalledTimes(2);
        expect(recorder.toggleRecording).toHaveBeenCalledOnce();
        expect(recorder.exportOffline).toHaveBeenCalledOnce();
    });

    it("exports MIDI from current pattern inputs and requests loop previews", async () => {
        const { midiButton, showToast, toggleVisualizerButton, visualizer } = createFixture();

        midiButton.click();
        toggleVisualizerButton.click();
        await Promise.resolve();

        expect(showToast).toHaveBeenCalledWith("Exported MIDI pattern file!", "success");
        expect(visualizer.toggle).toHaveBeenCalledOnce();
        const preview = createFixture();
        preview.controller.requestStaticLoopRender();
        expect(preview.renderStaticLoop).toHaveBeenCalledOnce();
        preview.controller.destroy();
    });
});
