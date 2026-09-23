import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaybackController } from "@audio/playback-controller.js";

const controllers: Array<ReturnType<typeof createPlaybackController>> = [];

function createFixture() {
    let contextState = "running";
    const rawContext = new EventTarget();
    const transport = { start: vi.fn(), stop: vi.fn() };
    const tone = {
        getContext: () => ({ state: contextState, rawContext }),
        getTransport: () => transport,
    };
    const pattern = { start: vi.fn(), stop: vi.fn() };
    const silenceActiveSynth = vi.fn();
    const recorder = { isRecording: false, initRecorder: vi.fn(async () => {}) };
    const visualizer = { startUiLoop: vi.fn(), stopUiLoop: vi.fn() };
    const state = { isAudioContextStarted: false, isPlaying: false };
    const playStopButton = document.createElement("button");
    const startAudio = vi.fn(async () => {
        state.isAudioContextStarted = true;
    });
    const createOrUpdatePattern = vi.fn();
    const clearNoteStep = vi.fn();
    const prepareForPlayback = vi.fn();
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
    });
    controllers.push(controller);

    return {
        clearNoteStep,
        contextState: (value: string) => {
            contextState = value;
        },
        controller,
        createOrUpdatePattern,
        pattern,
        playStopButton,
        prepareForPlayback,
        rawContext,
        recorder,
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
        expect(recorder.initRecorder).toHaveBeenCalledOnce();
        expect(createOrUpdatePattern).toHaveBeenCalledOnce();
        expect(pattern.start).toHaveBeenCalledOnce();
        expect(transport.start).toHaveBeenCalledOnce();
        expect(state.isPlaying).toBe(true);
        expect(playStopButton.textContent).toBe("Stop Audio");
        expect(visualizer.startUiLoop).toHaveBeenCalledOnce();

        controller.stop();
        expect(silenceActiveSynth).toHaveBeenCalledOnce();
        expect(pattern.stop).toHaveBeenCalledOnce();
        expect(transport.stop).toHaveBeenCalledOnce();
        expect(state.isPlaying).toBe(false);
        expect(playStopButton.textContent).toBe("Restart Audio");
        expect(visualizer.stopUiLoop).toHaveBeenCalledOnce();
        expect(clearNoteStep).toHaveBeenCalledOnce();
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
        rawContext.dispatchEvent(new Event("statechange"));

        expect(state.isPlaying).toBe(false);
        expect(transport.stop).toHaveBeenCalledOnce();
    });
});
