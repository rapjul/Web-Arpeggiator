import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaybackController } from "@audio/playback-controller.js";

const controllers: Array<ReturnType<typeof createPlaybackController>> = [];

/**
 * Creates a configured playback test fixture with mocks.
 *
 * @param {object} [options] - Fixture options.
 * @param {boolean} [options.hasButton=true] - Whether to include playStopButton.
 * @param {boolean} [options.hasRecorder=true] - Whether recorderManager is provided.
 * @param {boolean} [options.isRecording=false] - Whether recorder is already recording.
 * @returns {object} Fixture utilities and mocks.
 */
function createFixture(
    options: { hasButton?: boolean; hasRecorder?: boolean; isRecording?: boolean } = {},
) {
    const { hasButton = true, hasRecorder = true, isRecording = false } = options;
    let contextState = "running";
    let rawContext: EventTarget | null = new EventTarget();
    const transport = { position: 120, start: vi.fn(), stop: vi.fn() };
    const draw = { cancel: vi.fn() };
    const tone = {
        getContext: () => ({ state: contextState, rawContext }),
        getTransport: () => transport,
        Draw: draw,
    };
    const pattern = { start: vi.fn(), stop: vi.fn() };
    const silenceActiveSynth = vi.fn();
    const recorder = hasRecorder ? { isRecording, initRecorder: vi.fn(async () => {}) } : undefined;
    const visualizer = { startUiLoop: vi.fn(), stopUiLoop: vi.fn() };
    const state = { isAudioContextStarted: false, isPlaying: false };
    const playStopButton = hasButton ? document.createElement("button") : null;
    const startAudio = vi.fn(async () => {
        state.isAudioContextStarted = true;
    });
    const createOrUpdatePattern = vi.fn();
    const clearNoteStep = vi.fn();
    const prepareForPlayback = vi.fn();
    const onPlaybackStart = vi.fn();
    const onPlaybackStop = vi.fn();
    const controller = createPlaybackController({
        dom: { playStopButton },
        state,
        getTone: () => tone,
        getPattern: () => pattern,
        getSilenceActiveSynth: () => silenceActiveSynth,
        getRecorderManager: () => recorder,
        getVisualizer: () => visualizer,
        startAudio,
        prepareForPlayback,
        createOrUpdatePattern,
        clearNoteStep,
        onPlaybackStart,
        onPlaybackStop,
    });
    controllers.push(controller);

    return {
        clearNoteStep,
        contextState: (value: string) => {
            contextState = value;
        },
        controller,
        createOrUpdatePattern,
        draw,
        onPlaybackStart,
        onPlaybackStop,
        pattern,
        playStopButton,
        prepareForPlayback,
        rawContext,
        recorder,
        setRawContext: (ctx: EventTarget | null) => {
            rawContext = ctx;
        },
        silenceActiveSynth,
        startAudio,
        state,
        transport,
        visualizer,
    };
}

describe("playback controller", () => {
    afterEach(() => {
        controllers.splice(0).forEach((controller) => {
            controller.destroy();
        });
    });

    it("starts and stops transport playback through injected runtime accessors", async () => {
        const {
            clearNoteStep,
            controller,
            createOrUpdatePattern,
            draw,
            onPlaybackStart,
            onPlaybackStop,
            pattern,
            playStopButton,
            prepareForPlayback,
            recorder,
            silenceActiveSynth,
            startAudio,
            state,
            transport,
            visualizer,
        } = createFixture();

        await controller.start();
        expect(prepareForPlayback).toHaveBeenCalledOnce();
        expect(startAudio).toHaveBeenCalledOnce();
        expect(recorder?.initRecorder).toHaveBeenCalledOnce();
        expect(createOrUpdatePattern).toHaveBeenCalledOnce();
        expect(pattern.start).toHaveBeenCalledWith(0);
        expect(transport.start).toHaveBeenCalledWith(undefined, 0);
        expect(transport.position).toBe(0);
        expect(state.isPlaying).toBe(true);
        expect(playStopButton?.textContent).toBe("Stop Audio");
        expect(visualizer.startUiLoop).toHaveBeenCalledOnce();
        expect(onPlaybackStart).toHaveBeenCalledOnce();
        expect(onPlaybackStop).not.toHaveBeenCalled();

        transport.position = 480;
        controller.stop();
        expect(silenceActiveSynth).toHaveBeenCalledOnce();
        expect(draw.cancel).toHaveBeenCalledWith(0);
        expect(pattern.stop).toHaveBeenCalledOnce();
        expect(transport.stop).toHaveBeenCalledOnce();
        expect(transport.position).toBe(0);
        expect(state.isPlaying).toBe(false);
        expect(playStopButton?.textContent).toBe("Restart Audio");
        expect(visualizer.stopUiLoop).toHaveBeenCalledOnce();
        expect(clearNoteStep).toHaveBeenCalledOnce();
        expect(onPlaybackStop).toHaveBeenCalledOnce();
    });

    it("silences the active synth before stopping the transport on stop", async () => {
        const { controller, silenceActiveSynth, state, transport } = createFixture();
        state.isAudioContextStarted = true;
        state.isPlaying = true;

        const callOrder: string[] = [];
        silenceActiveSynth.mockImplementation(() => callOrder.push("silence"));
        transport.stop.mockImplementation(() => callOrder.push("transport.stop"));

        controller.stop();

        expect(callOrder).toEqual(["silence", "transport.stop"]);
    });

    it("stops playback when the raw AudioContext becomes suspended", async () => {
        const { contextState, controller, rawContext, state, transport } = createFixture();
        state.isAudioContextStarted = true;
        state.isPlaying = true;
        controller.observeAudioContextState();

        contextState("suspended");
        rawContext?.dispatchEvent(new Event("statechange"));

        expect(state.isPlaying).toBe(false);
        expect(transport.stop).toHaveBeenCalledOnce();
    });

    it("skips prepareForPlayback and recorder init when already started and recording", async () => {
        const { controller, prepareForPlayback, recorder, state } = createFixture({
            isRecording: true,
        });
        state.isAudioContextStarted = true;

        await controller.start();

        expect(prepareForPlayback).not.toHaveBeenCalled();
        expect(recorder?.initRecorder).not.toHaveBeenCalled();
    });

    it("ignores start calls when playback is already active", async () => {
        const { controller, pattern, state, transport, visualizer } = createFixture();
        state.isAudioContextStarted = true;
        state.isPlaying = true;

        await controller.start();

        expect(pattern.start).not.toHaveBeenCalled();
        expect(transport.start).not.toHaveBeenCalled();
        expect(visualizer.startUiLoop).not.toHaveBeenCalled();
    });

    it("ignores stop calls when playback is already inactive", async () => {
        const { clearNoteStep, controller, draw, pattern, silenceActiveSynth, state, transport } =
            createFixture();
        state.isPlaying = false;

        controller.stop();

        expect(silenceActiveSynth).not.toHaveBeenCalled();
        expect(draw.cancel).not.toHaveBeenCalled();
        expect(pattern.stop).not.toHaveBeenCalled();
        expect(transport.stop).not.toHaveBeenCalled();
        expect(clearNoteStep).not.toHaveBeenCalled();
    });

    it("safely starts and stops when playStopButton and recorder are omitted", async () => {
        const { controller, state } = createFixture({
            hasButton: false,
            hasRecorder: false,
        });

        await controller.start();
        expect(state.isPlaying).toBe(true);

        controller.stop();
        expect(state.isPlaying).toBe(false);
    });

    it("manages AudioContext observation transitions, running state changes, and destroy", () => {
        const { contextState, controller, rawContext, setRawContext, state, transport } =
            createFixture();
        state.isPlaying = true;

        // Calling observeAudioContextState binds to rawContext
        controller.observeAudioContextState();

        // Idempotent call with the same context
        controller.observeAudioContextState();

        // State change to "running" should not stop playback
        contextState("running");
        rawContext?.dispatchEvent(new Event("statechange"));
        expect(state.isPlaying).toBe(true);
        expect(transport.stop).not.toHaveBeenCalled();

        // Null rawContext should safely be ignored
        setRawContext(null);
        controller.observeAudioContextState();

        // Switching to a new rawContext unbinds old context and binds new one
        const secondContext = new EventTarget();
        setRawContext(secondContext);
        controller.observeAudioContextState();

        // Dispatching on old context should now do nothing
        contextState("suspended");
        rawContext?.dispatchEvent(new Event("statechange"));
        expect(state.isPlaying).toBe(true);

        // Dispatching suspended on secondContext stops playback
        secondContext.dispatchEvent(new Event("statechange"));
        expect(state.isPlaying).toBe(false);
        expect(transport.stop).toHaveBeenCalledOnce();

        // Destroy unbinds listeners cleanly
        state.isPlaying = true;
        controller.destroy();
        secondContext.dispatchEvent(new Event("statechange"));
        expect(state.isPlaying).toBe(true);
    });

    it("serializes playback start with pending recorder transition", async () => {
        const fixture = createFixture();
        let resolveTransition: () => void = () => {};
        const pendingTransition = new Promise<void>((resolve) => {
            resolveTransition = resolve;
        });

        const recorderManagerWithTransition = {
            isRecording: false,
            isStarting: true,
            awaitPendingTransition: vi.fn(async () => {
                await pendingTransition;
                fixture.state.isPlaying = true;
            }),
            initRecorder: vi.fn(async () => {}),
        };

        const controller = createPlaybackController({
            dom: { playStopButton: fixture.playStopButton },
            state: fixture.state,
            getTone: () => ({
                getContext: () => ({ state: "running", rawContext: fixture.rawContext }),
                getTransport: () => fixture.transport,
            }),
            getPattern: () => fixture.pattern,
            getRecorderManager: () => recorderManagerWithTransition,
            getVisualizer: () => fixture.visualizer,
            startAudio: fixture.startAudio,
            prepareForPlayback: fixture.prepareForPlayback,
            createOrUpdatePattern: fixture.createOrUpdatePattern,
            clearNoteStep: fixture.clearNoteStep,
        });
        controllers.push(controller);

        const startPromise = controller.start();
        await Promise.resolve();
        expect(recorderManagerWithTransition.awaitPendingTransition).toHaveBeenCalled();
        expect(fixture.transport.start).not.toHaveBeenCalled();

        resolveTransition();
        await startPromise;

        expect(fixture.transport.start).not.toHaveBeenCalled();
    });

    it("does not block transport start on recorder pre-warming", async () => {
        let resolveInit: () => void = () => {};
        const slowInitRecorder = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveInit = resolve;
                }),
        );
        const fixture = createFixture();
        const slowRecorder = {
            isRecording: false,
            isStarting: false,
            initRecorder: slowInitRecorder,
        };
        const controller = createPlaybackController({
            dom: { playStopButton: fixture.playStopButton },
            state: fixture.state,
            getTone: () => ({
                getContext: () => ({ state: "running", rawContext: fixture.rawContext }),
                getTransport: () => fixture.transport,
            }),
            getPattern: () => fixture.pattern,
            getRecorderManager: () => slowRecorder,
            getVisualizer: () => fixture.visualizer,
            startAudio: fixture.startAudio,
            prepareForPlayback: fixture.prepareForPlayback,
            createOrUpdatePattern: fixture.createOrUpdatePattern,
            clearNoteStep: fixture.clearNoteStep,
        });
        controllers.push(controller);

        await controller.start();
        expect(slowInitRecorder).toHaveBeenCalledOnce();
        expect(fixture.transport.start).toHaveBeenCalledWith(undefined, 0);
        expect(fixture.state.isPlaying).toBe(true);

        resolveInit();
        await Promise.resolve();
    });

    it("schedules and starts transport before invoking recorder pre-warming", async () => {
        const callOrder: string[] = [];
        const fixture = createFixture();
        fixture.transport.start = vi.fn((_time, offset) => {
            callOrder.push(`transport.start:${String(offset)}`);
        });
        const syncRecorder = {
            isRecording: false,
            isStarting: false,
            initRecorder: vi.fn(async () => {
                callOrder.push("initRecorder");
            }),
        };
        const controller = createPlaybackController({
            dom: { playStopButton: fixture.playStopButton },
            state: fixture.state,
            getTone: () => ({
                getContext: () => ({ state: "running", rawContext: fixture.rawContext }),
                getTransport: () => fixture.transport,
            }),
            getPattern: () => fixture.pattern,
            getRecorderManager: () => syncRecorder,
            getVisualizer: () => fixture.visualizer,
            startAudio: fixture.startAudio,
            prepareForPlayback: fixture.prepareForPlayback,
            createOrUpdatePattern: fixture.createOrUpdatePattern,
            clearNoteStep: fixture.clearNoteStep,
        });
        controllers.push(controller);

        await controller.start();
        expect(callOrder).toEqual(["transport.start:0", "initRecorder"]);
        expect(fixture.transport.start).toHaveBeenCalledWith(undefined, 0);
    });
});
