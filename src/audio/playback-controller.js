/**
 * Coordinates transport playback and browser AudioContext recovery.
 *
 * @module audio/playback-controller
 */

import { mark, STARTUP_MARKS } from "@core/startup-profiler.js";

/** @typedef {{isAudioContextStarted: boolean, isPlaying: boolean}} PlaybackState */

/**
 * Creates a playback coordinator around injected runtime accessors.
 *
 * @param {{dom: {playStopButton: HTMLButtonElement|null}, state: PlaybackState, getTone: () => {getContext: () => {state: string, rawContext: EventTarget|null}, getTransport: () => {position?: number|string, start: (time?: number|string, offset?: number|string) => void, stop: () => void}}, getPattern: () => {start: (time?: number|string) => void, stop: () => void}|undefined, getSilenceActiveSynth: () => (() => void)|undefined, getRecorderManager: () => {isRecording: boolean, isStarting?: boolean, awaitPendingTransition?: () => Promise<void>, initRecorder: () => Promise<void>}|undefined, getVisualizer: () => {startUiLoop: () => void, stopUiLoop: () => void}|undefined, startAudio: () => Promise<void>, prepareForPlayback: () => void, createOrUpdatePattern: () => void, clearNoteStep: () => void, onPlaybackStart?: () => void, onPlaybackStop?: () => void}} dependencies - Playback dependencies.
 * @returns {{start: () => Promise<void>, stop: () => void, observeAudioContextState: () => void, destroy: () => void}}
 */
export function createPlaybackController(dependencies) {
    const {
        dom,
        state,
        getTone,
        getPattern,
        getSilenceActiveSynth,
        getRecorderManager,
        getVisualizer,
        startAudio,
        prepareForPlayback,
        createOrUpdatePattern,
        clearNoteStep,
        onPlaybackStart,
        onPlaybackStop,
    } = dependencies;
    let observedRawAudioContext = null;
    let audioContextStateListener = null;

    /** @returns {Promise<void>} Starts the scheduler and transport. */
    async function start() {
        if (!state.isAudioContextStarted) prepareForPlayback();
        await startAudio();
        const recorderManager = getRecorderManager();
        if (recorderManager) {
            if (recorderManager.isStarting) {
                try {
                    await recorderManager.awaitPendingTransition?.();
                } catch {
                    // Capture startup failure is handled by recorder; proceed with normal playback start
                }
                if (state.isPlaying) return;
            }
            if (!recorderManager.isRecording) {
                void recorderManager.initRecorder();
            }
        }
        createOrUpdatePattern();
        if (!state.isPlaying) {
            const tone = getTone();
            const transport = tone?.getTransport();
            if (transport) {
                transport.position = 0;
            }
            getPattern()?.start(0);
            mark(STARTUP_MARKS.TRANSPORT_STARTING);
            transport?.start(undefined, 0);
            const playStopButton = dom.playStopButton;
            if (playStopButton) {
                playStopButton.textContent = "Stop Audio";
                playStopButton.setAttribute("aria-label", "Press to stop arpeggio");
                playStopButton.classList.add("bg-yellow-600", "hover:bg-yellow-700");
                playStopButton.classList.remove("bg-blue-600", "hover:bg-blue-700");
            }
            state.isPlaying = true;
            getVisualizer()?.startUiLoop();
            onPlaybackStart?.();
        }
    }

    /** @returns {void} Stops transport and clears active step state. */
    function stop() {
        if (!state.isPlaying) return;
        // Silence any synth attacks pre-scheduled for the swing-offset window
        // before stopping the transport so they do not sound after stop.
        getSilenceActiveSynth()?.();
        const tone = getTone();
        const transport = tone?.getTransport();
        transport?.stop();
        if (transport) {
            transport.position = 0;
        }
        // Cancel any queued draw frame callbacks on transport stop
        /** @type {{Draw?: {cancel?: (time?: number) => void}}} */ (tone)?.Draw?.cancel?.(0);
        getPattern()?.stop();
        const playStopButton = dom.playStopButton;
        if (playStopButton) {
            playStopButton.textContent = "Restart Audio";
            playStopButton.setAttribute("aria-label", "Press to restart arpeggio");
            playStopButton.classList.remove("bg-yellow-600", "hover:bg-yellow-700");
            playStopButton.classList.add("bg-blue-600", "hover:bg-blue-700");
        }
        state.isPlaying = false;
        getVisualizer()?.stopUiLoop();
        clearNoteStep();
        onPlaybackStop?.();
    }

    /** @returns {void} Binds recovery to the current raw AudioContext. */
    function observeAudioContextState() {
        const tone = getTone();
        const rawAudioContext = tone?.getContext().rawContext;
        if (!rawAudioContext || observedRawAudioContext === rawAudioContext) return;

        if (observedRawAudioContext && audioContextStateListener) {
            observedRawAudioContext.removeEventListener("statechange", audioContextStateListener);
        }

        audioContextStateListener = () => {
            if (getTone()?.getContext().state !== "running") stop();
        };
        observedRawAudioContext = rawAudioContext;
        rawAudioContext.addEventListener("statechange", audioContextStateListener);
    }

    /** @returns {void} Removes the AudioContext state listener. */
    function destroy() {
        if (observedRawAudioContext && audioContextStateListener) {
            observedRawAudioContext.removeEventListener("statechange", audioContextStateListener);
        }
        observedRawAudioContext = null;
        audioContextStateListener = null;
    }

    return { start, stop, observeAudioContextState, destroy };
}
