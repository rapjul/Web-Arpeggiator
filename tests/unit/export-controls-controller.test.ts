import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@core/settings-contract.js";
import { exportMidiFile } from "@core/midi-export.js";
import { createExportControlsController } from "@ui/export-controls-controller.js";

vi.mock("@core/midi-export.js", () => ({ exportMidiFile: vi.fn() }));

const controllers: Array<ReturnType<typeof createExportControlsController>> = [];

function createFixture(
    options: {
        getInterfaceMode?: () => string;
        visualizer?: { currentMode: string; isVisualizerOn?: boolean; toggle: () => void };
        initialAdvancedActionGeneration?: number;
    } = {},
) {
    document.body.replaceChildren();
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
    const tailSecondsLabel = document.createElement("label");
    tailSecondsLabel.setAttribute("for", "offline-export-tail-seconds");
    tailSecondsLabel.setAttribute("title", "Double-click to reset");
    tailSecondsLabel.textContent = "Effects Tail:";
    const tailModeSelect = document.createElement("select");
    tailModeSelect.innerHTML =
        '<option value="auto">Auto</option><option value="custom">Custom</option>';
    tailModeSelect.value = "auto";
    const tailSecondsInput = document.createElement("input");
    tailSecondsInput.id = "offline-export-tail-seconds";
    tailSecondsInput.value = "2";
    tailControl.append(tailSecondsLabel, tailModeSelect, tailSecondsInput);
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
    const visualizer = options.visualizer ?? {
        currentMode: "loopMap",
        isVisualizerOn: true,
        toggle: vi.fn(),
    };
    const startAudio = vi.fn(async () => {});
    const renderStaticLoop = vi.fn(async () => {});
    const showToast = vi.fn();
    const logger = { error: vi.fn(), warn: vi.fn() };
    const controller = createExportControlsController({
        dom: {
            loopCountInput,
            offlineExportModeInputs: document.querySelectorAll("input[name='offline-export-mode']"),
            offlineExportTailControl: tailControl,
            offlineExportTailModeSelect: tailModeSelect,
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
        getRecorderManager: () => recorder,
        getVisualizer: () => visualizer,
        getInterfaceMode: options.getInterfaceMode ?? (() => "full"),
        startAudio,
        generateFilename: () => "arpeggio",
        showToast,
        renderStaticLoop,
        debounce: (callback) => callback,
        initialAdvancedActionGeneration: options.initialAdvancedActionGeneration,
        logger,
    });
    controller.initialize();
    controllers.push(controller);

    return {
        controller,
        duration,
        exportButton,
        loopCountInput,
        logger,
        modeSeamlessInput,
        modeTailInput,
        midiButton,
        offlineExportButton,
        recorder,
        recordButton,
        renderStaticLoop,
        settings,
        showToast,
        startAudio,
        tailControl,
        tailModeSelect,
        tailSecondsInput,
        tailSecondsLabel,
        toggleVisualizerButton,
        visualizer,
        visualizerModeSelect,
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
            modeTailInput,
            modeSeamlessInput,
            tailControl,
            tailModeSelect,
            tailSecondsInput,
            tailSecondsLabel,
        } = createFixture();

        expect(duration.textContent).toContain("Pattern cycles");
        modeSeamlessInput.checked = true;
        modeSeamlessInput.dispatchEvent(new Event("change", { bubbles: true }));
        expect(tailControl.classList.contains("hidden")).toBe(true);
        expect(tailSecondsInput.disabled).toBe(true);
        expect(tailSecondsLabel.classList.contains("setting-target-disabled")).toBe(true);

        modeSeamlessInput.checked = false;
        modeTailInput.checked = true;
        modeTailInput.dispatchEvent(new Event("change", { bubbles: true }));
        expect(tailModeSelect.disabled).toBe(false);
        expect(tailSecondsInput.disabled).toBe(true);
        expect(tailSecondsLabel.classList.contains("setting-target-disabled")).toBe(true);
        expect(tailSecondsLabel.hasAttribute("title")).toBe(false);

        tailModeSelect.value = "custom";
        tailModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        expect(tailSecondsInput.disabled).toBe(false);
        expect(tailSecondsLabel.classList.contains("setting-target-disabled")).toBe(false);
        expect(tailSecondsLabel.getAttribute("title")).toBe("Double-click to reset");

        loopCountInput.value = "999";
        loopCountInput.dispatchEvent(new Event("change", { bubbles: true }));
        expect(loopCountInput.value).toBe("100");
        expect(controller.updateEstimatedExportDuration).toBeTypeOf("function");
    });

    it("includes a swung terminal release in the tail-duration estimate", () => {
        const { controller, duration, settings } = createFixture();
        Object.assign(settings, {
            swing: 1,
            gateRatio: 1,
            loopCount: 1,
            octaveRange: 1,
            offlineExportMode: "tail",
            offlineExportTailMode: "custom",
            offlineExportTailSeconds: 0,
        });

        controller.updateEstimatedExportDuration();

        expect(duration.textContent).toContain("Export duration: ~0.5 seconds");
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

    it("preserves the terminal MIDI gate when compiling from the export controls", () => {
        const { midiButton, settings } = createFixture();
        Object.assign(settings, {
            baseNotes: ["C4", "E4", "G4"],
            interval: "16n",
            gateRatio: 1,
            swing: 1,
            loopCount: 1,
            octaveRange: 1,
        });
        vi.mocked(exportMidiFile).mockClear();

        midiButton.click();

        expect(exportMidiFile).toHaveBeenCalledWith(
            expect.objectContaining({
                timeline: expect.objectContaining({
                    events: expect.arrayContaining([
                        expect.objectContaining({
                            pitch: "G4",
                            startTick: 400,
                            durationTicks: 120,
                        }),
                    ]),
                }),
            }),
            "arpeggio.mid",
        );
    });

    it("reports export action failures without unhandled rejections", async () => {
        const { logger, recorder, recordButton } = createFixture();
        recorder.toggleRecording.mockRejectedValueOnce(new Error("recorder failed"));

        recordButton.click();
        await vi.waitFor(() => {
            expect(logger.warn).toHaveBeenCalledWith(
                "AudioContext failed to start on record click:",
                expect.any(Error),
            );
        });
    });

    it("reports synchronous MIDI export failures", () => {
        const { logger, midiButton, showToast } = createFixture();
        const error = new Error("MIDI download failed");
        vi.mocked(exportMidiFile).mockImplementationOnce(() => {
            throw error;
        });

        midiButton.click();

        expect(logger.error).toHaveBeenCalledWith("Failed to export MIDI pattern:", error);
        expect(showToast).toHaveBeenCalledWith("Failed to export MIDI pattern.", "error");
    });

    it("aborts action and warns when startAudio fails in startAndRun", async () => {
        const { logger, recorder, recordButton, startAudio } = createFixture();
        startAudio.mockRejectedValueOnce(new Error("AudioContext denied"));

        recordButton.click();
        await vi.waitFor(() => {
            expect(logger.warn).toHaveBeenCalledWith(
                "AudioContext failed to start on record click:",
                expect.any(Error),
            );
            expect(recorder.toggleRecording).not.toHaveBeenCalled();
        });
    });

    it("triggers realtime export, offline export, and visualizer controls on interaction", async () => {
        const {
            exportButton,
            offlineExportButton,
            recorder,
            renderStaticLoop,
            toggleVisualizerButton,
            visualizer,
            visualizerModeSelect,
        } = createFixture();

        exportButton.click();
        await vi.waitFor(() => {
            expect(recorder.exportRealtime).toHaveBeenCalledOnce();
        });

        offlineExportButton.click();
        await vi.waitFor(() => {
            expect(recorder.exportOffline).toHaveBeenCalledOnce();
        });

        toggleVisualizerButton.click();
        expect(visualizer.toggle).toHaveBeenCalledOnce();

        visualizerModeSelect.value = "loopMap";
        visualizerModeSelect.dispatchEvent(new Event("change"));
        expect(renderStaticLoop).toHaveBeenCalledOnce();
    });

    it("cancels queued record action if interface mode switches to simple while startAudio is pending", async () => {
        let currentMode = "full";
        let resolveStartAudio: (() => void) | undefined;
        const startAudioPromise = new Promise<void>((resolve) => {
            resolveStartAudio = resolve;
        });
        const { recordButton, recorder, startAudio } = createFixture({
            getInterfaceMode: () => currentMode,
        });
        startAudio.mockImplementationOnce(() => startAudioPromise);

        recordButton.click();
        expect(startAudio).toHaveBeenCalledOnce();
        expect(recorder.toggleRecording).not.toHaveBeenCalled();

        // Switch to simple mode while startAudio is still pending
        currentMode = "simple";
        resolveStartAudio?.();

        await vi.waitFor(() => {
            expect(startAudio).toHaveReturned();
        });
        expect(recorder.toggleRecording).not.toHaveBeenCalled();
    });

    it("cancels queued export action if interface mode switches to simple while startAudio is pending", async () => {
        let currentMode = "full";
        let resolveStartAudio: (() => void) | undefined;
        const startAudioPromise = new Promise<void>((resolve) => {
            resolveStartAudio = resolve;
        });
        const { exportButton, recorder, startAudio } = createFixture({
            getInterfaceMode: () => currentMode,
        });
        startAudio.mockImplementationOnce(() => startAudioPromise);

        exportButton.click();
        expect(startAudio).toHaveBeenCalledOnce();
        expect(recorder.exportRealtime).not.toHaveBeenCalled();

        // Switch to simple mode while startAudio is still pending
        currentMode = "simple";
        resolveStartAudio?.();

        await vi.waitFor(() => {
            expect(startAudio).toHaveReturned();
        });
        expect(recorder.exportRealtime).not.toHaveBeenCalled();
    });

    it("allows offline export action to proceed in simple mode", async () => {
        const { offlineExportButton, recorder, startAudio } = createFixture({
            getInterfaceMode: () => "simple",
        });

        offlineExportButton.click();
        await vi.waitFor(() => {
            expect(startAudio).toHaveBeenCalledOnce();
            expect(recorder.exportOffline).toHaveBeenCalledOnce();
        });
    });

    it("discards a queued record request when the controller is destroyed", async () => {
        let resolveAudio: (() => void) | undefined;
        const audioStartup = new Promise<void>((resolve) => {
            resolveAudio = resolve;
        });
        const { controller, recordButton, recorder, startAudio } = createFixture();
        startAudio.mockImplementationOnce(() => audioStartup);

        recordButton.click();
        expect(startAudio).toHaveBeenCalledOnce();
        controller.destroy();
        resolveAudio?.();
        await Promise.resolve();
        await Promise.resolve();

        expect(recorder.toggleRecording).not.toHaveBeenCalled();
    });

    it("cancels queued record action when switching to simple and returning to full before audio startup resolves", async () => {
        let currentMode = "full";
        let resolveStartAudio: (() => void) | undefined;
        const startAudioPromise = new Promise<void>((resolve) => {
            resolveStartAudio = resolve;
        });
        const { controller, recordButton, recorder, startAudio } = createFixture({
            getInterfaceMode: () => currentMode,
        });
        startAudio.mockImplementationOnce(() => startAudioPromise);

        recordButton.click();
        expect(startAudio).toHaveBeenCalledOnce();
        expect(recorder.toggleRecording).not.toHaveBeenCalled();

        // Switch to simple mode (invalidating pending advanced actions) and then return to full mode
        controller.cancelPendingAdvancedActions();
        currentMode = "simple";
        currentMode = "full";

        resolveStartAudio?.();
        await vi.waitFor(() => {
            expect(startAudio).toHaveReturned();
        });

        // The stale queued record action must not resurrect despite full mode being restored
        expect(recorder.toggleRecording).not.toHaveBeenCalled();
    });

    it("cancels queued realtime export when switching to simple and returning to full before audio startup resolves", async () => {
        let currentMode = "full";
        let resolveStartAudio: (() => void) | undefined;
        const startAudioPromise = new Promise<void>((resolve) => {
            resolveStartAudio = resolve;
        });
        const { controller, exportButton, recorder, startAudio } = createFixture({
            getInterfaceMode: () => currentMode,
        });
        startAudio.mockImplementationOnce(() => startAudioPromise);

        exportButton.click();
        expect(startAudio).toHaveBeenCalledOnce();
        expect(recorder.exportRealtime).not.toHaveBeenCalled();

        // Switch to simple mode and back to full
        controller.cancelPendingAdvancedActions();
        currentMode = "simple";
        currentMode = "full";

        resolveStartAudio?.();
        await vi.waitFor(() => {
            expect(startAudio).toHaveReturned();
        });

        expect(recorder.exportRealtime).not.toHaveBeenCalled();
    });

    it("allows offline export to proceed after switching to simple and returning to full while audio startup is pending", async () => {
        let currentMode = "full";
        let resolveStartAudio: (() => void) | undefined;
        const startAudioPromise = new Promise<void>((resolve) => {
            resolveStartAudio = resolve;
        });
        const { controller, offlineExportButton, recorder, startAudio } = createFixture({
            getInterfaceMode: () => currentMode,
        });
        startAudio.mockImplementationOnce(() => startAudioPromise);

        offlineExportButton.click();
        expect(startAudio).toHaveBeenCalledOnce();
        expect(recorder.exportOffline).not.toHaveBeenCalled();

        controller.cancelPendingAdvancedActions();
        currentMode = "simple";
        currentMode = "full";

        resolveStartAudio?.();
        await vi.waitFor(() => {
            expect(startAudio).toHaveReturned();
        });

        expect(recorder.exportOffline).toHaveBeenCalledOnce();
    });

    it("executes only the latest record action when user toggles mode and re-requests recording", async () => {
        let currentMode = "full";
        let resolveFirstAudio: (() => void) | undefined;
        const firstAudioPromise = new Promise<void>((resolve) => {
            resolveFirstAudio = resolve;
        });
        const { controller, recordButton, recorder, startAudio } = createFixture({
            getInterfaceMode: () => currentMode,
        });
        startAudio.mockImplementationOnce(() => firstAudioPromise);

        // Click record the first time
        recordButton.click();
        expect(startAudio).toHaveBeenCalledTimes(1);

        // Toggle to simple and back to full
        controller.cancelPendingAdvancedActions();
        currentMode = "simple";
        currentMode = "full";

        // Second click after restoring full mode
        startAudio.mockImplementationOnce(async () => {});
        recordButton.click();

        // Resolve first audio promise
        resolveFirstAudio?.();
        await vi.waitFor(() => {
            expect(recorder.toggleRecording).toHaveBeenCalledOnce();
        });
    });

    it("cancels queued record action if startAudio rejects with error and logs warning", async () => {
        const audioError = new Error("AudioContext permission denied");
        const { recordButton, recorder, startAudio, logger } = createFixture();
        startAudio.mockRejectedValueOnce(audioError);

        recordButton.click();
        await vi.waitFor(() => {
            expect(logger.warn).toHaveBeenCalledWith(
                "AudioContext failed to start on record click:",
                audioError,
            );
        });

        expect(recorder.toggleRecording).not.toHaveBeenCalled();
    });

    it("handles multiple consecutive cancelPendingAdvancedActions calls without throwing and tracks generation", () => {
        const { controller } = createFixture();

        for (let i = 0; i < 10; i++) {
            expect(() => controller.cancelPendingAdvancedActions()).not.toThrow();
        }
        // Controller initialize() increments once from 0 to 1, then 10 calls increment to 11
        expect(controller.getAdvancedActionGeneration()).toBe(11);
    });

    it("increments action generation on cancelPendingAdvancedActions and rolls over to 1 at MAX_SAFE_INTEGER", () => {
        const { controller } = createFixture({
            initialAdvancedActionGeneration: Number.MAX_SAFE_INTEGER,
        });

        // initialize() called during createFixture rolls over Number.MAX_SAFE_INTEGER to 1
        expect(controller.getAdvancedActionGeneration()).toBe(1);
    });

    it("self-heals action generation to 1 if counter is non-integer or negative", () => {
        const { controller } = createFixture({
            initialAdvancedActionGeneration: -5,
        });

        // initialize() called during createFixture self-heals -5 to 1
        expect(controller.getAdvancedActionGeneration()).toBe(1);
    });

    it("does not trigger renderStaticLoop when in simple mode", () => {
        const { controller, renderStaticLoop } = createFixture({
            getInterfaceMode: () => "simple",
            visualizer: { currentMode: "loopMap", isVisualizerOn: true, toggle: vi.fn() },
        });

        controller.requestStaticLoopRender();
        expect(renderStaticLoop).not.toHaveBeenCalled();
    });

    it("does not trigger renderStaticLoop when visualizer is off", () => {
        const { controller, renderStaticLoop } = createFixture({
            getInterfaceMode: () => "full",
            visualizer: { currentMode: "loopMap", isVisualizerOn: false, toggle: vi.fn() },
        });

        controller.requestStaticLoopRender();
        expect(renderStaticLoop).not.toHaveBeenCalled();
    });

    it("triggers renderStaticLoop when in full mode with active loop map visualizer", () => {
        const { controller, renderStaticLoop } = createFixture({
            getInterfaceMode: () => "full",
            visualizer: { currentMode: "loopMap", isVisualizerOn: true, toggle: vi.fn() },
        });

        controller.requestStaticLoopRender();
        expect(renderStaticLoop).toHaveBeenCalledOnce();
    });
});
