import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioRuntimeController } from "@audio/runtime-controller.js";

const controllers: Array<ReturnType<typeof createAudioRuntimeController>> = [];

function createFixture() {
    let contextState = "suspended";
    const rawContext = new EventTarget();
    const tone = {
        getContext: () => ({ state: contextState, rawContext }),
        start: vi.fn(async () => {
            contextState = "running";
        }),
    };
    const engine = {
        activeSynth: {},
        analyser: {},
        meter: {},
        peakAnalyser: {},
        reverb: {},
        synths: {},
        currentWaveform: "sine",
        createOfflineChain: vi.fn(),
        dispose: vi.fn(),
    };
    const pattern = {
        getPattern: vi.fn(() => null),
        dispose: vi.fn(),
    };
    const visualizer = {
        destroy: vi.fn(),
        startUiLoop: vi.fn(),
        stopUiLoop: vi.fn(),
    };
    const recorder = { isRecording: false, recordingStartTime: 0 };
    const createAudioEngine = vi.fn(() => engine);
    const createPatternController = vi.fn(() => pattern);
    const createRecorderManager = vi.fn(() => recorder);
    const createVisualizer = vi.fn(() => visualizer);
    const modules = [
        tone,
        { createAudioEngine },
        { createPatternController },
        { createRecorderManager },
        { createVisualizer },
    ] as [object, object, object, object, object];
    const loadModules = vi.fn(async () => modules);
    const state = {
        isPlaying: false,
        isAudioContextStarted: false,
        activeNote: null,
        currentWaveform: "sine",
    };
    const loadAllSettings = vi.fn(() => ({ ok: true }));
    const controller = createAudioRuntimeController({
        dom: {
            audioEngine: {},
            visualizer: { recordButton: document.createElement("button") },
            recorder: {},
        },
        state,
        getAllSettings: () => ({ bpm: 120 }),
        loadAllSettings,
        showToast: vi.fn(),
        generateFilename: () => "export",
        formatTime: () => "00:00.0",
        startAudio: vi.fn(async () => {}),
        startPlayback: vi.fn(async () => {}),
        onPatternStep: vi.fn(),
        onPatternChange: vi.fn(),
        loadModules,
    });
    controllers.push(controller);

    return {
        contextState: () => contextState,
        controller,
        createAudioEngine,
        createPatternController,
        createRecorderManager,
        createVisualizer,
        engine,
        loadAllSettings,
        loadModules,
        pattern,
        recorder,
        state,
        tone,
        visualizer,
    };
}

describe("audio runtime controller", () => {
    afterEach(() => {
        controllers.splice(0).forEach((controller) => {
            controller.destroy();
        });
    });

    it("defers module loading and shares concurrent activation", async () => {
        const {
            contextState,
            controller,
            createAudioEngine,
            createPatternController,
            createRecorderManager,
            createVisualizer,
            loadAllSettings,
            loadModules,
            state,
            tone,
        } = createFixture();

        expect(loadModules).not.toHaveBeenCalled();
        await Promise.all([controller.startAudio(), controller.startAudio()]);

        expect(loadModules).toHaveBeenCalledOnce();
        expect(tone.start).toHaveBeenCalledOnce();
        expect(createAudioEngine).toHaveBeenCalledOnce();
        expect(createPatternController).toHaveBeenCalledOnce();
        expect(createRecorderManager).toHaveBeenCalledOnce();
        expect(createVisualizer).toHaveBeenCalledOnce();
        expect(loadAllSettings).toHaveBeenCalledWith({ bpm: 120 });
        expect(contextState()).toBe("running");
        expect(state.isAudioContextStarted).toBe(true);
        expect(controller.getAvailableAudioEngine()).toBe(controller.getAudioEngine());
    });

    it("cleans up a partially constructed runtime and permits retry", async () => {
        const { controller, engine, createVisualizer, loadModules } = createFixture();
        createVisualizer.mockImplementationOnce(() => {
            throw new Error("visualizer failed");
        });

        await expect(controller.startAudio()).rejects.toThrow("visualizer failed");
        expect(engine.dispose).toHaveBeenCalledOnce();
        expect(controller.getAudioEngine()).toBeUndefined();

        await controller.startAudio();
        expect(loadModules).toHaveBeenCalledOnce();
        expect(createVisualizer).toHaveBeenCalledTimes(2);
        expect(controller.getAudioEngine()).toBe(engine);
    });

    it("rebuilds the runtime after teardown", async () => {
        const { controller, createAudioEngine, state } = createFixture();
        await controller.startAudio();

        controller.destroy();

        expect(controller.getAudioEngine()).toBeUndefined();
        expect(state.isAudioContextStarted).toBe(false);

        await controller.startAudio();

        expect(createAudioEngine).toHaveBeenCalledTimes(2);
        expect(controller.getAudioEngine()).toBeDefined();
        expect(state.isAudioContextStarted).toBe(true);
    });
});
