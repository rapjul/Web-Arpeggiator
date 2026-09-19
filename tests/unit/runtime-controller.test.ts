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
        recordingOutput: {},
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
    const recorder = {
        isRecording: false,
        recordingStartTime: 0,
        destroy: vi.fn(async () => {}),
    };
    let visualizerArgs: {
        state: {
            isRecording: boolean;
            recordingStartTime: number;
            isPlaying: boolean;
            activeNote: string | null;
        };
    } | null = null;
    let recorderArgs: {
        state: { isAudioContextStarted: boolean; isPlaying: boolean };
        actions: { getTimeline: () => unknown };
    } | null = null;
    let patternArgs: {
        getSynth: () => unknown;
        getIsPlaying: () => boolean;
    } | null = null;
    const createAudioEngine = vi.fn(() => engine);
    const createPatternController = vi.fn((args) => {
        patternArgs = args;
        return pattern;
    });
    const createRecorderManager = vi.fn((args) => {
        recorderArgs = args;
        return recorder;
    });
    const createVisualizer = vi.fn((args) => {
        visualizerArgs = args;
        return visualizer;
    });
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
        patternArgs: () => patternArgs,
        recorder,
        recorderArgs: () => recorderArgs,
        state,
        tone,
        visualizer,
        visualizerArgs: () => visualizerArgs,
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
            engine,
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
        expect(createRecorderManager).toHaveBeenCalledWith(
            expect.objectContaining({
                audio: expect.objectContaining({ recordingOutput: engine.recordingOutput }),
            }),
        );
        expect(createVisualizer).toHaveBeenCalledOnce();
        expect(loadAllSettings).toHaveBeenCalledWith({ bpm: 120 });
        expect(contextState()).toBe("running");
        expect(state.isAudioContextStarted).toBe(true);
        expect(controller.getAvailableAudioEngine()).toBe(controller.getAudioEngine());
    });

    it("cleans up a partially constructed runtime and permits retry", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            const { controller, engine, createVisualizer, loadModules } = createFixture();
            createVisualizer.mockImplementationOnce(() => {
                throw new Error("visualizer failed");
            });

            await expect(controller.startAudio()).rejects.toThrow("visualizer failed");
            expect(engine.dispose).toHaveBeenCalledOnce();
            expect(controller.getAudioEngine()).toBeUndefined();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "AudioContext failed to start/resume:",
                expect.any(Error),
            );

            await controller.startAudio();
            expect(loadModules).toHaveBeenCalledOnce();
            expect(createVisualizer).toHaveBeenCalledTimes(2);
            expect(controller.getAudioEngine()).toBe(engine);
        } finally {
            consoleErrorSpy.mockRestore();
        }
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

    it("exposes getters for tone, pattern controller, recorder manager, and visualizer", async () => {
        const { controller, tone, pattern, recorder, visualizer } = createFixture();

        expect(controller.getTone()).toBeNull();
        expect(controller.getPatternController()).toBeUndefined();
        expect(controller.getRecorderManager()).toBeUndefined();
        expect(controller.getVisualizer()).toBeUndefined();

        await controller.startAudio();

        expect(controller.getTone()).toBe(tone);
        expect(controller.getPatternController()).toBe(pattern);
        expect(controller.getRecorderManager()).toBe(recorder);
        expect(controller.getVisualizer()).toBe(visualizer);
    });

    it("resets audioModulesPromise when loading audio modules fails to permit retrying", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            const { controller, loadModules } = createFixture();
            loadModules.mockRejectedValueOnce(new Error("network failure loading tone"));

            await expect(controller.startAudio()).rejects.toThrow("network failure loading tone");

            // Subsequent attempt should re-invoke loadModules
            await controller.startAudio();
            expect(loadModules).toHaveBeenCalledTimes(2);
            expect(controller.getAudioEngine()).toBeDefined();
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it("returns immediately without re-initializing if context is already started and running", async () => {
        const { controller, createAudioEngine, state, tone } = createFixture();
        await controller.startAudio();
        expect(createAudioEngine).toHaveBeenCalledOnce();

        // Already running and started
        expect(state.isAudioContextStarted).toBe(true);
        expect(tone.getContext().state).toBe("running");

        await controller.startAudio();
        expect(createAudioEngine).toHaveBeenCalledOnce();
    });

    it("logs warning if disposing a partial pattern controller during initialization failure throws", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            const { controller, pattern, loadAllSettings } = createFixture();
            // Assign custom logger with warnMock
            // We can inject logger or spy on console.warn
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            try {
                pattern.dispose.mockImplementationOnce(() => {
                    throw new Error("pattern dispose failed");
                });
                loadAllSettings.mockImplementationOnce(() => {
                    throw new Error("load settings failed");
                });

                await expect(controller.startAudio()).rejects.toThrow("load settings failed");
                expect(warnSpy).toHaveBeenCalledWith(
                    "Failed to dispose a partial arpeggio pattern:",
                    expect.any(Error),
                );
            } finally {
                warnSpy.mockRestore();
            }
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it("provides reactive getters to child modules", async () => {
        const fixture = createFixture();
        await fixture.controller.startAudio();

        // Exercise visualizer injected state
        expect(fixture.visualizerArgs().state.isRecording).toBe(false);
        expect(fixture.visualizerArgs().state.recordingStartTime).toBe(0);
        expect(fixture.visualizerArgs().state.isPlaying).toBe(false);
        expect(fixture.visualizerArgs().state.activeNote).toBeNull();

        // Exercise recorder injected state and actions
        expect(fixture.recorderArgs().state.isAudioContextStarted).toBe(true);
        expect(fixture.recorderArgs().state.isPlaying).toBe(false);
        expect(fixture.recorderArgs().actions.getTimeline()).toBeNull();

        // Exercise pattern controller getters
        expect(fixture.patternArgs().getSynth()).toBe(fixture.engine.activeSynth);
        expect(fixture.patternArgs().getIsPlaying()).toBe(false);
    });
});
