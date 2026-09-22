/**
 * Recorder Module
 *
 * Owns real-time recording (MediaRecorder / Tone.Recorder fallback) and
 * offline export (Tone.Offline).  Exposes a factory function so the caller
 * (app.js) can inject shared state, audio-engine references, DOM elements,
 * and utility functions.
 *
 * @module recorder
 */

import {
    audioBufferToMp3Blob,
    audioBufferToWav,
    createSeamlessLoopAudioBuffer,
    downloadBlob,
} from "@core/audio-utils.js";
import {
    calculateOfflineExportDuration,
    calculateSeamlessRenderFrameWindow,
    getSeamlessModulationCompatibility,
    OFFLINE_EXPORT_MODE_SEAMLESS,
} from "@core/export-duration.js";
import { createOfflineExportMetadata } from "@core/export-metadata.js";
import {
    compileTimeline,
    createCyclicRenderEvents,
    getTimelineEndTick,
    isSwingPhaseAligned,
    ticksToSeconds,
} from "@core/timeline.js";
import * as Tone from "tone";

const DEFAULT_OFFLINE_SAMPLE_RATE = 44100;

/** @typedef {HTMLElement & HTMLInputElement} RecorderControl */

function getOfflineSampleRate() {
    const sampleRate = Number(Tone.getContext().sampleRate);
    return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : DEFAULT_OFFLINE_SAMPLE_RATE;
}

function formatEffectList(effectNames) {
    if (effectNames.length <= 1) return effectNames[0] || "effect";
    return `${effectNames.slice(0, -1).join(", ")} and ${effectNames[effectNames.length - 1]}`;
}

/**
 * Creates the recorder manager with real-time and offline export control.
 *
 * @param {object}   context                                - Injected app context.
 * @param {object}   context.audio                          - Audio-engine references.
 * @param {Tone.ToneAudioNode} context.audio.recordingOutput - Final monitored signal tap point.
 * @param {object}          context.audio.synths            - { synth, fmSynth, amSynth } for offline config.
 * @param {Function}        context.audio.createOfflineChain - Offline routing creation callback.
 * @param {object}   context.dom                            - DOM element references.
 * @param {HTMLElement}     context.dom.recordButton        - Record start/stop button.
 * @param {HTMLElement}     context.dom.recordStatus        - Recording status display.
 * @param {HTMLElement}     context.dom.exportControls      - Export controls wrapper.
 * @param {HTMLElement}     context.dom.realtimeExportWavCheck - Real-time WAV checkbox.
 * @param {HTMLElement}     context.dom.realtimeExportMp3Check - Real-time MP3 checkbox.
 * @param {HTMLElement}     context.dom.exportButton        - Real-time export button.
 * @param {HTMLElement}     context.dom.offlineExportWavCheck - Offline WAV checkbox.
 * @param {HTMLElement}     context.dom.offlineExportMp3Check - Offline MP3 checkbox.
 * @param {HTMLElement}     context.dom.offlineExportButton - Offline export trigger button.
 * @param {HTMLElement}     context.dom.offlineExportStatus - Offline export status display.
 * @param {HTMLElement}     context.dom.loopCountInput      - Loop count <input>.
 * @param {HTMLElement}     context.dom.envAttackSlider     - ADSR Attack slider.
 * @param {HTMLElement}     context.dom.envDecaySlider      - ADSR Decay slider.
 * @param {HTMLElement}     context.dom.envSustainSlider    - ADSR Sustain slider.
 * @param {HTMLElement}     context.dom.envReleaseSlider    - ADSR Release slider.
 * @param {object}   context.state                          - Shared mutable state.
 * @param {boolean}  context.state.isAudioContextStarted    - Audio context started (read).
 * @param {boolean}  context.state.isPlaying                - Transport playing (read).
 * @param {object}   context.actions                        - Action callbacks.
 * @param {Function} context.actions.showToast              - Toast notification.
 * @param {Function} context.actions.startUiLoop            - Start Tone.Loop.
 * @param {Function} context.actions.stopUiLoop             - Stop Tone.Loop.
 * @param {Function} context.actions.getAllSettings         - Current settings snapshot.
 * @param {Function} context.actions.generateFilename       - Timestamped filename.
 * @param {Function} context.actions.formatTime             - Time formatting helper.
 * @param {Function} [context.actions.startAudio]           - Start Web Audio context helper.
 * @param {Function} [context.actions.startPlayback]        - Start transport playback helper.
 * @param {Function} [context.actions.getTimeline]          - Current shared compiled timeline.
 * @typedef {object} RecorderManager
 * @property {Function} initRecorder - Creates recorder instance (lazy, called once).
 * @property {Function} toggleRecording - Start/stop recording.
 * @property {Function} exportRealtime - Export recorded blob as WAV/MP3.
 * @property {Function} exportOffline - Tone.Offline render + export.
 * @property {boolean} isRecording - Whether recording is active.
 * @property {boolean} [isStarting] - Whether capture initialization is currently pending.
 * @property {() => Promise<void>} [awaitPendingTransition] - Awaits in-flight transition.
 * @property {number} recordingStartTime - Timestamp when recording started.
 * @property {Function} setRecorderBlob - Sets liveRecordedWavBlob (called by event).
 * @property {Function} destroy - Stops capture and releases recorder-owned resources.
 *
 * @returns {RecorderManager} Public API.
 */
export function createRecorderManager(context) {
    const { audio, state, actions } = context;
    const dom = /** @type {Record<string, RecorderControl>} */ (
        /** @type {unknown} */ (context.dom)
    );

    // --- Internal recorder state ---
    let recorder = null;
    let recordedChunks = [];
    let recorderType = null;
    let liveRecordedWavBlob = null;
    let decodedRecording = null;
    let recordingPhase = "idle";
    let recordingStartTime = 0;
    let recordingTarget = null;
    let mediaStreamDestination = null;
    let mediaStopResolver = null;
    let mediaStopRejecter = null;
    let activeTransitionPromise = null;
    let activeMediaRecorderError = null;
    let isExporting = false;
    let isDestroyed = false;

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Updates recording UI state after the recorder produces a blob.
     *
     * @returns {void}
     */
    function onRecordingStop() {
        dom.recordButton.textContent = "Record";
        dom.recordButton.setAttribute("aria-label", "Start recording");
        dom.recordButton.classList.remove("recording");
        dom.recordStatus.textContent = "Recording stopped. Ready to export.";
        dom.exportControls.classList.remove("hidden");
        dom.recordButton.disabled = false;
        dom.exportButton.disabled = false;
        dom.exportButton.textContent = "Export Files";
    }

    /**
     * Checks whether the recorder is currently capturing audio.
     *
     * @returns {boolean} Whether the recorder is actively capturing.
     */
    function isActivelyRecording() {
        return recordingPhase === "recording";
    }

    /**
     * Normalizes an unknown error value into a standard Error object.
     *
     * @param {unknown} error - Error value or event object to normalize.
     * @returns {Error} Normalized recorder error.
     */
    function toError(error) {
        return error instanceof Error ? error : new Error("Recording failed.");
    }

    /**
     * Restores the record control button state after an aborted or failed transition.
     *
     * @returns {void}
     */
    function restoreIdleUi() {
        dom.recordButton.textContent = "Record";
        dom.recordButton.setAttribute("aria-label", "Start recording");
        dom.recordButton.classList.remove("recording");
        dom.recordButton.disabled = false;
    }

    /**
     * Starts the selected capture backend and awaits capture readiness.
     *
     * @returns {Promise<void>} Starts the selected capture backend.
     */
    async function startCapture() {
        if (recorderType === "ToneRecorder") {
            await recorder.start();
            return;
        }

        if (recorderType !== "MediaRecorder") return;
        await /** @type {Promise<void>} */ (
            new Promise((resolve, reject) => {
                const onStart = () => {
                    recorder.removeEventListener("start", onStart);
                    recorder.removeEventListener("error", onError);
                    resolve();
                };
                const onError = (event) => {
                    recorder.removeEventListener("start", onStart);
                    recorder.removeEventListener("error", onError);
                    reject(toError(event?.error));
                };
                recorder.addEventListener("start", onStart, { once: true });
                recorder.addEventListener("error", onError, { once: true });
                try {
                    recorder.start();
                } catch (error) {
                    recorder.removeEventListener("start", onStart);
                    recorder.removeEventListener("error", onError);
                    reject(toError(error));
                }
            })
        );
    }

    /**
     * Stops the selected capture backend and awaits final recorded data.
     *
     * @returns {Promise<Blob|null>} Stops the selected capture backend.
     */
    async function stopCapture() {
        if (recorderType === "ToneRecorder") return await recorder.stop();
        if (recorderType !== "MediaRecorder") return null;

        return await new Promise((resolve, reject) => {
            mediaStopResolver = resolve;
            mediaStopRejecter = reject;
            try {
                recorder.stop();
            } catch (error) {
                mediaStopResolver = null;
                mediaStopRejecter = null;
                reject(toError(error));
            }
        });
    }

    /**
     * Finalizes an awaited recording stop and updates exported state.
     *
     * @param {Blob|null} blob - Captured recording blob if produced.
     * @returns {void}
     */
    function finalizeRecordingStop(blob) {
        if (blob) liveRecordedWavBlob = blob;
        recordingPhase = "idle";
        actions.stopUiLoop();
        onRecordingStop();
    }

    /**
     * Aborts capture after a startup or playback failure, attempting guarded cleanup.
     *
     * @param {unknown} primaryError - Original failure triggering the abort.
     * @returns {Promise<void>}
     */
    async function abortCapture(primaryError) {
        let blob = null;
        try {
            blob = await stopCapture();
        } catch (cleanupError) {
            console.warn("Failed to stop recorder during recovery:", cleanupError);
            resetRecorderBackend();
        } finally {
            if (blob) {
                finalizeRecordingStop(blob);
            } else {
                recordingPhase = "idle";
                actions.stopUiLoop();
                restoreIdleUi();
                dom.exportControls.classList.add("hidden");
            }
        }
        throw primaryError;
    }

    /**
     * Disconnects the audio source node from its current recorder target.
     *
     * @returns {void}
     */
    function disconnectRecordingTarget() {
        if (!recordingTarget) return;
        try {
            audio.recordingOutput.disconnect?.(recordingTarget);
        } catch (error) {
            console.warn("Failed to disconnect recording output:", error);
        }
        recordingTarget = null;
    }

    /**
     * Releases and clears a failed or stale recorder backend.
     *
     * Disconnects audio nodes, disposes Tone.js or native recorder instances,
     * terminates all media stream tracks, and resets transient capture buffers
     * and event resolvers so subsequent attempts re-initialize cleanly.
     *
     * @returns {void}
     */
    function resetRecorderBackend() {
        disconnectRecordingTarget();
        try {
            recorder?.dispose?.();
        } catch (error) {
            console.warn("Failed to dispose recorder backend:", error);
        }
        mediaStreamDestination?.disconnect?.();
        if (mediaStreamDestination?.stream?.getTracks) {
            mediaStreamDestination.stream.getTracks().forEach((track) => {
                track.stop();
            });
        }
        mediaStreamDestination = null;
        recorder = null;
        recorderType = null;
        recordedChunks = [];
        mediaStopResolver = null;
        mediaStopRejecter = null;
        activeMediaRecorderError = null;
    }

    // ------------------------------------------------------------------
    // Recorder Initialization
    // ------------------------------------------------------------------

    /**
     * Creates a recorder instance.  Tries Tone.Recorder first (works
     * everywhere), then falls back to MediaRecorder (HTTPS only).
     *
     * Safe to call multiple times—only initialises once.
     *
     * @returns {Promise<void>}
     */
    async function initRecorder() {
        if (recorder) return;

        // Try Tone.Recorder first (works in HTTP and Canvas contexts)
        try {
            recorder = new Tone.Recorder();
            audio.recordingOutput.connect(recorder);
            recordingTarget = recorder;
            recorderType = "ToneRecorder";
            dom.recordStatus.textContent = "Ready to record (Tone.Recorder).";
            actions.showToast("Recorder ready (Fallback)", "info");
        } catch {
            try {
                recorder?.dispose?.();
            } catch (error) {
                console.warn("Failed to dispose unavailable Tone recorder:", error);
            }
            recorder = null;
            recordingTarget = null;
            // Fall back to MediaRecorder (HTTPS only)
            if (window.isSecureContext && typeof MediaRecorder !== "undefined") {
                try {
                    const rawCtx = /** @type {AudioContext} */ (Tone.getContext().rawContext);
                    const dest = rawCtx.createMediaStreamDestination();
                    mediaStreamDestination = dest;
                    recordingTarget = dest;
                    audio.recordingOutput.connect(dest);
                    recorder = new MediaRecorder(dest.stream);
                    recorderType = "MediaRecorder";

                    recorder.ondataavailable = (event) => {
                        if (!isDestroyed && event.data.size > 0) recordedChunks.push(event.data);
                    };
                    recorder.onstop = () => {
                        const error = activeMediaRecorderError;
                        activeMediaRecorderError = null;
                        const blob = new Blob(recordedChunks, {
                            type: "audio/webm",
                        });
                        recordedChunks = [];
                        const resolveStop = mediaStopResolver;
                        const rejectStop = mediaStopRejecter;
                        mediaStopResolver = null;
                        mediaStopRejecter = null;

                        if (error) {
                            if (rejectStop) {
                                rejectStop(error);
                            }
                            if (isDestroyed) {
                                return;
                            }
                            recordingPhase = "idle";
                            actions.stopUiLoop();
                            restoreIdleUi();
                            dom.exportControls.classList.add("hidden");
                            dom.recordStatus.textContent = `Recording failed: ${error.message}`;
                            actions.showToast("Recording failed.", "error");
                            return;
                        }

                        if (resolveStop) {
                            resolveStop(blob);
                        }
                        if (isDestroyed) {
                            return;
                        }
                        liveRecordedWavBlob = blob;
                        if (!resolveStop && recordingPhase === "recording") {
                            finalizeRecordingStop(blob);
                        }
                    };
                    recorder.onerror = (event) => {
                        const rawError =
                            event && typeof event === "object" && "error" in event
                                ? /** @type {{ error?: unknown }} */ (event).error
                                : event;
                        const error = toError(rawError);
                        activeMediaRecorderError = error;
                        const rejectStop = mediaStopRejecter;
                        if (rejectStop) {
                            mediaStopResolver = null;
                            mediaStopRejecter = null;
                            rejectStop(error);
                        }
                    };

                    dom.recordStatus.textContent = "Ready to record (MediaRecorder).";
                    actions.showToast("Recorder ready (Native)", "success");
                } catch {
                    disconnectRecordingTarget();
                    mediaStreamDestination?.disconnect?.();
                    if (mediaStreamDestination?.stream?.getTracks) {
                        mediaStreamDestination.stream.getTracks().forEach((track) => {
                            track.stop();
                        });
                    }
                    mediaStreamDestination = null;
                    recorder = null;
                }
            }

            if (!recorder) {
                dom.recordButton.disabled = true;
                dom.recordStatus.textContent = "Recording not available on this device.";
                actions.showToast("Recording not supported.", "error");
            }
        }

        if (recorder) {
            dom.recordButton.disabled = false;
        }
    }

    // ------------------------------------------------------------------
    // Real-Time Record Toggle
    // ------------------------------------------------------------------

    /**
     * Starts or stops real-time recording.
     *
     * @returns {Promise<void>}
     */
    async function toggleRecording() {
        if (
            isDestroyed ||
            isExporting ||
            recordingPhase === "starting" ||
            recordingPhase === "stopping"
        )
            return;
        if (isActivelyRecording()) {
            recordingPhase = "stopping";
            dom.recordButton.disabled = true;
            const stopTransition = (async () => {
                try {
                    finalizeRecordingStop(await stopCapture());
                } catch (error) {
                    recordingPhase = "idle";
                    actions.stopUiLoop();
                    resetRecorderBackend();
                    restoreIdleUi();
                    dom.recordStatus.textContent = "Recording failed to stop. See console.";
                    actions.showToast("Recording failed to stop.", "error");
                    throw error;
                } finally {
                    activeTransitionPromise = null;
                }
            })();
            activeTransitionPromise = stopTransition;
            await stopTransition;
            return;
        }

        recordingPhase = "starting";
        dom.recordButton.disabled = true;
        const startTransition = (async () => {
            try {
                // --- Start recording ---
                // If audio context is not yet started, initialize audio context first
                if (!state.isAudioContextStarted && typeof actions.startAudio === "function") {
                    await actions.startAudio();
                }

                // Lazy initialize recorder instance if not yet created
                if (!recorder) {
                    await initRecorder();
                }

                if (!recorder) {
                    recordingPhase = "idle";
                    dom.recordButton.disabled = true;
                    dom.recordStatus.textContent = "Recording not available on this device.";
                    actions.showToast("Recording not supported on this device.", "error");
                    return;
                }

                liveRecordedWavBlob = null;
                decodedRecording = null;

                if (recorderType === "MediaRecorder") recordedChunks = [];
                await startCapture();
                // Start capture before playback so the first scheduled note is retained.
                recordingPhase = "recording";
                if (isDestroyed) return;

                dom.recordButton.classList.add("recording");
                dom.exportControls.classList.add("hidden");
                dom.recordStatus.textContent = "Recording... Click again to stop.";
                recordingStartTime = Tone.now();
                dom.recordButton.textContent = "Stop Recording (00:00.0)";
                dom.recordButton.setAttribute(
                    "aria-label",
                    "Stop recording (current elapsed time 00:00.0)",
                );

                // If transport is currently stopped, auto-start playback after capture is active.
                if (!state.isPlaying && typeof actions.startPlayback === "function") {
                    try {
                        await actions.startPlayback();
                    } catch (error) {
                        await abortCapture(error);
                    }
                }
                actions.startUiLoop();
                dom.recordButton.disabled = false;
            } catch (error) {
                if (recordingPhase === "starting") {
                    recordingPhase = "idle";
                    actions.stopUiLoop();
                    restoreIdleUi();
                    dom.recordStatus.textContent = "Recording failed to start. See console.";
                    actions.showToast("Recording failed to start.", "error");
                }
                throw error;
            } finally {
                activeTransitionPromise = null;
            }
        })();
        activeTransitionPromise = startTransition;
        await startTransition;
    }

    // ------------------------------------------------------------------
    // Real-Time Export
    // ------------------------------------------------------------------

    /**
     * Exports the last real-time recording as WAV and/or MP3.
     *
     * @returns {Promise<void>}
     */
    async function exportRealtime() {
        if (!liveRecordedWavBlob) {
            actions.showToast("No recording found.", "error");
            return;
        }

        if (liveRecordedWavBlob.size < 1000) {
            actions.showToast("Recording failed! No audio was captured.", "error");
            return;
        }

        if (!dom.realtimeExportWavCheck.checked && !dom.realtimeExportMp3Check.checked) {
            dom.recordStatus.textContent = "Please select at least one format.";
            return;
        }

        isExporting = true;
        dom.exportButton.disabled = true;
        dom.exportButton.textContent = "Exporting...";
        dom.recordButton.disabled = true;

        const currentExportBlob = liveRecordedWavBlob;
        let localDecodedBuffer = decodedRecording;
        let exportFailed = false;

        const filename = actions.generateFilename(true);
        const decodeRecording = async () => {
            if (!localDecodedBuffer) {
                localDecodedBuffer = await Tone.getContext().decodeAudioData(
                    await currentExportBlob.arrayBuffer(),
                );
                if (liveRecordedWavBlob === currentExportBlob) {
                    decodedRecording = localDecodedBuffer;
                }
            }
            return localDecodedBuffer;
        };

        try {
            if (dom.realtimeExportWavCheck.checked) {
                dom.recordStatus.textContent = "Exporting WAV...";
                actions.showToast("Exporting WAV...", "info");
                try {
                    const wavBlob = audioBufferToWav(await decodeRecording());
                    downloadBlob(wavBlob, `${filename}.wav`);
                } catch (error) {
                    exportFailed = true;
                    console.error("WAV encoding failed:", error);
                    dom.recordStatus.textContent = "WAV encoding failed. See console.";
                    actions.showToast("WAV encoding failed.", "error");
                    return;
                }
                actions.showToast("Exported WAV file!", "info");

                if (dom.realtimeExportMp3Check.checked) {
                    await new Promise((resolve) => setTimeout(resolve, 300));
                }
            }

            if (dom.realtimeExportMp3Check.checked) {
                dom.recordStatus.textContent = "Encoding MP3... (this may take a moment)";
                actions.showToast("Encoding MP3...", "info");
                try {
                    const audioBuffer = await decodeRecording();
                    const mp3Blob = await audioBufferToMp3Blob(audioBuffer);
                    downloadBlob(mp3Blob, `${filename}.mp3`);

                    dom.recordStatus.textContent = "Export complete!";
                    actions.showToast("Exported MP3 file!", "success");
                } catch (e) {
                    exportFailed = true;
                    console.error("MP3 encoding failed:", e);
                    dom.recordStatus.textContent = "MP3 encoding failed. See console.";
                    actions.showToast("MP3 encoding failed.", "error");
                }
            } else if (dom.realtimeExportWavCheck.checked) {
                dom.recordStatus.textContent = "Export complete!";
                actions.showToast("Export complete!", "success");
            }
        } finally {
            isExporting = false;
            dom.exportButton.disabled = false;
            dom.exportButton.textContent = "Export Files";
            dom.recordButton.disabled = false;
            if (!exportFailed && liveRecordedWavBlob === currentExportBlob) {
                decodedRecording = null;
            }
        }
    }

    // ------------------------------------------------------------------
    // Offline Export (Tone.Offline)
    // ------------------------------------------------------------------

    /**
     * Renders an offline audio buffer according to the selected export mode
     * and exports it as WAV and/or MP3.
     *
     * @returns {Promise<void>}
     */
    async function exportOffline() {
        if (!dom.offlineExportWavCheck.checked && !dom.offlineExportMp3Check.checked) {
            dom.offlineExportStatus.textContent = "Please select at least one format.";
            return;
        }

        if (!state.isAudioContextStarted) {
            actions.showToast("Please start audio playback first.", "error");
            return;
        }

        dom.offlineExportButton.disabled = true;
        dom.offlineExportButton.textContent = "Generating...";

        const settings = actions.getAllSettings();
        const filename = actions.generateFilename(false, settings, "audio");

        const baseTimeline = compileTimeline(settings, { cycles: 1 });
        const calculateExportDuration = (terminalDuration) =>
            calculateOfflineExportDuration({
                loopCount: settings.loopCount,
                stepsPerLoop: baseTimeline.events.length,
                interval: settings.interval,
                bpm: settings.bpm,
                exportMode: settings.offlineExportMode,
                tailSeconds: settings.offlineExportTailSeconds,
                envRelease: settings.envRelease,
                delayMix: settings.delayMix,
                reverbMix: settings.reverbMix,
                chorusMix: settings.chorusMix,
                autoPanMix: settings.autoPanMix,
                terminalDuration,
            });
        let exportDuration = calculateExportDuration();
        const isSeamlessExport = exportDuration.exportMode === OFFLINE_EXPORT_MODE_SEAMLESS;
        const selectedTimeline = compileTimeline(settings, {
            cycles: exportDuration.loopCount,
            terminalGatePolicy: isSeamlessExport ? "clip" : "preserve",
        });
        if (!isSeamlessExport) {
            exportDuration = calculateExportDuration(
                ticksToSeconds(getTimelineEndTick(selectedTimeline), selectedTimeline.bpm),
            );
        }
        const seamlessModulation = getSeamlessModulationCompatibility({
            bpm: settings.bpm,
            musicalDuration: exportDuration.musicalDuration,
            chorusMix: settings.chorusMix,
            autoPanMix: settings.autoPanMix,
        });
        const incompatibleSeamlessComponents = [
            ...(!isSwingPhaseAligned(selectedTimeline.musicalDurationTicks, selectedTimeline.swing)
                ? ["Swing"]
                : []),
            ...seamlessModulation.incompatibleEffects,
        ];

        if (isSeamlessExport && incompatibleSeamlessComponents.length > 0) {
            const componentLabel = formatEffectList(incompatibleSeamlessComponents);
            const message = `Cannot generate a seamless loop with ${componentLabel}: change Pattern cycles, disable it, or use Include effects tail.`;
            dom.offlineExportStatus.textContent = message;
            actions.showToast(message, "error");
            dom.offlineExportButton.disabled = false;
            dom.offlineExportButton.textContent = "Generate & Export";
            return;
        }

        const offlineSampleRate = getOfflineSampleRate();
        const seamlessRenderWindow = isSeamlessExport
            ? calculateSeamlessRenderFrameWindow({
                  preRollDuration: exportDuration.preRollDuration,
                  musicalDuration: exportDuration.musicalDuration,
                  sampleRate: offlineSampleRate,
              })
            : null;
        const offlineRenderDuration = seamlessRenderWindow
            ? seamlessRenderWindow.offlineRenderDuration
            : exportDuration.renderDuration;
        const patternStopTime = isSeamlessExport
            ? exportDuration.preRollDuration + exportDuration.musicalDuration
            : exportDuration.musicalDuration;
        const patternNotes = selectedTimeline.resolvedNotes;
        const renderedNotes = selectedTimeline.scheduledNotes;
        const renderEvents = isSeamlessExport
            ? createCyclicRenderEvents(
                  selectedTimeline,
                  exportDuration.preRollCycles * selectedTimeline.cycleDurationTicks,
              )
            : selectedTimeline.events;

        dom.offlineExportStatus.textContent = isSeamlessExport
            ? "Generating seamless WAV-ready audio... please wait."
            : "Generating audio with effects tail... please wait.";

        try {
            const toneAudioBuffer = await Tone.Offline(
                async (offlineContext) => {
                    offlineContext.transport.bpm.value = selectedTimeline.bpm;
                    offlineContext.transport.swing = 0;

                    // Recreate the synth + effects graph using the shared audio engine helper
                    const { offlineSynth } = audio.createOfflineChain(offlineContext, settings);

                    renderEvents.forEach((event) => {
                        const time = ticksToSeconds(event.startTick, selectedTimeline.bpm);
                        const duration = ticksToSeconds(event.durationTicks, selectedTimeline.bpm);
                        if (
                            typeof offlineSynth.triggerAttack === "function" &&
                            typeof offlineSynth.triggerRelease === "function"
                        ) {
                            offlineSynth.triggerAttack(event.pitch, time);
                            offlineSynth.triggerRelease(time + duration);
                        } else {
                            offlineSynth.triggerAttackRelease(event.pitch, duration, time);
                        }
                    });

                    offlineContext.transport.start(0);
                    offlineContext.transport.stop(patternStopTime);
                },
                offlineRenderDuration,
                2,
                offlineSampleRate,
            );

            const nativeBuffer = /** @type {AudioBuffer} */ (
                typeof toneAudioBuffer.get === "function" ? toneAudioBuffer.get() : toneAudioBuffer
            );

            // Validate buffer
            if (nativeBuffer.length < 1000) {
                actions.showToast("Offline generation failed! No audio was created.", "error");
                dom.offlineExportStatus.textContent = "Offline rendering failed.";
                dom.offlineExportButton.disabled = false;
                dom.offlineExportButton.textContent = "Generate & Export";
                return;
            }

            if (
                seamlessRenderWindow &&
                nativeBuffer.length < seamlessRenderWindow.sourceFrameCount
            ) {
                throw new Error("Offline renderer returned an incomplete seamless source buffer.");
            }

            const exportBuffer = isSeamlessExport
                ? createSeamlessLoopAudioBuffer(
                      nativeBuffer,
                      seamlessRenderWindow.startFrame,
                      seamlessRenderWindow.frameCount,
                  )
                : nativeBuffer;
            const exportMetadata = createOfflineExportMetadata({
                settings,
                patternNotes,
                renderedNotes,
                exportDuration: {
                    ...exportDuration,
                    renderDuration: offlineRenderDuration,
                },
                sampleRate: exportBuffer.sampleRate,
                channelCount: exportBuffer.numberOfChannels,
                frameCount: exportBuffer.length,
            });

            // Export WAV
            if (dom.offlineExportWavCheck.checked) {
                dom.offlineExportStatus.textContent = "Exporting WAV...";
                actions.showToast("Exporting WAV...", "info");
                const wavBlob = audioBufferToWav(exportBuffer, exportMetadata);
                downloadBlob(wavBlob, `${filename}.wav`);

                if (dom.offlineExportMp3Check.checked) {
                    await new Promise((resolve) => setTimeout(resolve, 250));
                }
            }

            // Export MP3
            if (dom.offlineExportMp3Check.checked) {
                dom.offlineExportStatus.textContent = "Encoding MP3...";
                actions.showToast("Encoding MP3...", "info");
                const mp3Blob = await audioBufferToMp3Blob(exportBuffer, exportMetadata);
                downloadBlob(mp3Blob, `${filename}.mp3`);
            }

            dom.offlineExportStatus.textContent = "Offline export complete!";
            actions.showToast("Export complete!", "success");
        } catch (e) {
            console.error("Offline rendering failed:", e);
            dom.offlineExportStatus.textContent = "Offline rendering failed. See console.";
            actions.showToast("Offline render failed.", "error");
        } finally {
            dom.offlineExportButton.disabled = false;
            dom.offlineExportButton.textContent = "Generate & Export";
        }
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /**
     * Releases recorder-owned browser and audio resources.
     *
     * @returns {Promise<void>}
     */
    async function destroy() {
        if (isDestroyed) return;
        isDestroyed = true;

        if (activeTransitionPromise) {
            try {
                await activeTransitionPromise;
            } catch (error) {
                console.warn("In-flight recorder transition failed during destruction:", error);
            }
        }

        if (isActivelyRecording()) {
            recordingPhase = "stopping";
            try {
                await stopCapture();
            } catch (error) {
                console.warn("Failed to stop recorder during destruction:", error);
            }
        }

        recordingPhase = "destroyed";
        mediaStopResolver = null;
        mediaStopRejecter = null;
        activeMediaRecorderError = null;
        activeTransitionPromise = null;
        if (recorderType === "MediaRecorder" && recorder) {
            recorder.ondataavailable = null;
            recorder.onstop = null;
            recorder.onerror = null;
        }
        disconnectRecordingTarget();
        try {
            recorder?.dispose?.();
        } catch (error) {
            console.warn("Failed to dispose recorder:", error);
        }
        mediaStreamDestination?.disconnect?.();
        mediaStreamDestination?.stream?.getTracks?.().forEach((track) => {
            track.stop();
        });
        mediaStreamDestination = null;
        recorder = null;
        recorderType = null;
        recordedChunks = [];
        liveRecordedWavBlob = null;
        decodedRecording = null;
        actions.stopUiLoop();
    }

    return {
        initRecorder,
        toggleRecording,
        exportRealtime,
        exportOffline,
        destroy,
        get isRecording() {
            return isActivelyRecording();
        },
        get isStarting() {
            return recordingPhase === "starting";
        },
        /**
         * Awaits any in-flight recording transition (starting or stopping).
         *
         * @returns {Promise<void>}
         */
        awaitPendingTransition: async () => {
            if (activeTransitionPromise) {
                await activeTransitionPromise;
            }
        },
        get recordingStartTime() {
            return recordingStartTime;
        },
        setRecorderBlob: (blob) => {
            liveRecordedWavBlob = blob;
            decodedRecording = null;
        },
    };
}
