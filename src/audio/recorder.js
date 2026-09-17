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

import * as Tone from "tone";
import {
    audioBufferToMp3Blob,
    audioBufferToWav,
    createSeamlessLoopAudioBuffer,
    downloadBlob,
} from "@core/audio-utils.js";
import {
    calculateSeamlessRenderFrameWindow,
    calculateOfflineExportDuration,
    getSeamlessModulationCompatibility,
    OFFLINE_EXPORT_MODE_SEAMLESS,
} from "@core/export-duration.js";
import { createOfflineExportMetadata } from "@core/export-metadata.js";
import { compileTimeline, ticksToSeconds } from "@core/timeline.js";

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
 * @property {number} recordingStartTime - Timestamp when recording started.
 * @property {Function} setRecorderBlob - Sets liveRecordedWavBlob (called by event).
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
    let isRecording = false;
    let recordingStartTime = 0;

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
            recorderType = "ToneRecorder";
            dom.recordStatus.textContent = "Ready to record (Tone.Recorder).";
            actions.showToast("Recorder ready (Fallback)", "info");
        } catch {
            // Fall back to MediaRecorder (HTTPS only)
            if (window.isSecureContext && typeof MediaRecorder !== "undefined") {
                try {
                    const rawCtx = /** @type {AudioContext} */ (Tone.getContext().rawContext);
                    const dest = rawCtx.createMediaStreamDestination();
                    audio.recordingOutput.connect(dest);
                    recorder = new MediaRecorder(dest.stream);
                    recorderType = "MediaRecorder";

                    recorder.ondataavailable = (e) => {
                        if (e.data.size > 0) recordedChunks.push(e.data);
                    };
                    recorder.onstop = () => {
                        liveRecordedWavBlob = new Blob(recordedChunks, {
                            type: "audio/webm",
                        });
                        recordedChunks = [];
                        onRecordingStop();
                    };

                    dom.recordStatus.textContent = "Ready to record (MediaRecorder).";
                    actions.showToast("Recorder ready (Native)", "success");
                } catch {
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
        if (isRecording) {
            // --- Stop recording ---
            isRecording = false;
            if (recorderType === "MediaRecorder") {
                recorder.stop();
                // onRecordingStop fires from the onstop event
            } else if (recorderType === "ToneRecorder") {
                recorder.stop().then((blob) => {
                    liveRecordedWavBlob = blob;
                    onRecordingStop();
                });
            }
        } else {
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
                dom.recordButton.disabled = true;
                dom.recordStatus.textContent = "Recording not available on this device.";
                actions.showToast("Recording not supported on this device.", "error");
                return;
            }

            liveRecordedWavBlob = null;
            decodedRecording = null;

            if (recorderType === "MediaRecorder") {
                recordedChunks = [];
                recorder.start();
            } else if (recorderType === "ToneRecorder") {
                recorder.start();
            }

            // Start capture before playback so the first scheduled note is retained.
            isRecording = true;

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
                    isRecording = false;
                    if (recorderType === "MediaRecorder") {
                        recorder.stop();
                    } else if (recorderType === "ToneRecorder") {
                        liveRecordedWavBlob = await recorder.stop();
                        onRecordingStop();
                    }
                    actions.stopUiLoop();
                    throw error;
                }
            }
        }

        if (isRecording) {
            actions.startUiLoop();
        } else {
            actions.stopUiLoop();
        }
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

        dom.exportButton.disabled = true;
        dom.exportButton.textContent = "Exporting...";

        const filename = actions.generateFilename(true);
        const decodeRecording = async () => {
            if (!decodedRecording) {
                decodedRecording = await Tone.getContext().decodeAudioData(
                    await liveRecordedWavBlob.arrayBuffer(),
                );
            }
            return decodedRecording;
        };

        if (dom.realtimeExportWavCheck.checked) {
            dom.recordStatus.textContent = "Exporting WAV...";
            actions.showToast("Exporting WAV...", "info");
            try {
                const wavBlob = audioBufferToWav(await decodeRecording());
                downloadBlob(wavBlob, `${filename}.wav`);
            } catch (error) {
                console.error("WAV encoding failed:", error);
                dom.recordStatus.textContent = "WAV encoding failed. See console.";
                actions.showToast("WAV encoding failed.", "error");
                dom.exportButton.disabled = false;
                dom.exportButton.textContent = "Export Files";
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
                console.error("MP3 encoding failed:", e);
                dom.recordStatus.textContent = "MP3 encoding failed. See console.";
                actions.showToast("MP3 encoding failed.", "error");
            }
        } else if (dom.realtimeExportWavCheck.checked) {
            dom.recordStatus.textContent = "Export complete!";
            actions.showToast("Export complete!", "success");
        }

        dom.exportButton.disabled = false;
        dom.exportButton.textContent = "Export Files";
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
        const exportDuration = calculateOfflineExportDuration({
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
        });
        const isSeamlessExport = exportDuration.exportMode === OFFLINE_EXPORT_MODE_SEAMLESS;
        const seamlessModulation = getSeamlessModulationCompatibility({
            bpm: settings.bpm,
            musicalDuration: exportDuration.musicalDuration,
            chorusMix: settings.chorusMix,
            autoPanMix: settings.autoPanMix,
        });

        if (isSeamlessExport && !seamlessModulation.isCompatible) {
            const effectLabel = formatEffectList(seamlessModulation.incompatibleEffects);
            const message = `Cannot generate a seamless loop with ${effectLabel}: change Pattern cycles, disable it, or use Include effects tail.`;
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
        let offlineRenderDuration = seamlessRenderWindow
            ? seamlessRenderWindow.offlineRenderDuration
            : exportDuration.renderDuration;
        const patternStopTime = isSeamlessExport
            ? exportDuration.preRollDuration + exportDuration.musicalDuration
            : exportDuration.musicalDuration;
        const selectedTimeline = compileTimeline(settings, {
            cycles: exportDuration.loopCount,
            terminalGatePolicy: isSeamlessExport ? "clip" : "preserve",
        });
        if (!isSeamlessExport) {
            const finalEvent = selectedTimeline.events.at(-1);
            if (finalEvent) {
                const terminalEndSeconds = ticksToSeconds(
                    finalEvent.startTick + finalEvent.durationTicks,
                    selectedTimeline.bpm,
                );
                offlineRenderDuration = Math.max(offlineRenderDuration, terminalEndSeconds);
            }
        }
        const patternNotes = selectedTimeline.scheduledNotes;
        let timeline = selectedTimeline;
        if (isSeamlessExport && patternNotes.length > 0) {
            const preRollSteps = exportDuration.preRollCycles * selectedTimeline.stepsPerCycle;
            const totalSteps = preRollSteps + patternNotes.length;
            const startIndex =
                (patternNotes.length - (preRollSteps % patternNotes.length)) % patternNotes.length;
            const renderedNotes = Array.from(
                { length: totalSteps },
                (_, index) => patternNotes[(startIndex + index) % patternNotes.length],
            );
            const selectedMap = selectedTimeline.events.map((event) => event.sourceNoteIndex);
            const renderedMap = Array.from(
                { length: totalSteps },
                (_, index) => selectedMap[(startIndex + index) % selectedMap.length],
            );
            timeline = compileTimeline(settings, {
                cycles: 1,
                maxCycles: 1,
                resolvedNotes: renderedNotes,
                sourceNoteMap: renderedMap,
                terminalGatePolicy: "clip",
            });
        }

        dom.offlineExportStatus.textContent = isSeamlessExport
            ? "Generating seamless WAV-ready audio... please wait."
            : "Generating audio with effects tail... please wait.";

        try {
            const toneAudioBuffer = await Tone.Offline(
                async (offlineContext) => {
                    offlineContext.transport.bpm.value = timeline.bpm;
                    offlineContext.transport.swing = 0;

                    // Recreate the synth + effects graph using the shared audio engine helper
                    const { offlineSynth } = audio.createOfflineChain(offlineContext, settings);

                    timeline.events.forEach((event) => {
                        const time = ticksToSeconds(event.startTick, timeline.bpm);
                        const duration = ticksToSeconds(event.durationTicks, timeline.bpm);
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
                stepsPerCycle: selectedTimeline.stepsPerCycle,
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

    return {
        initRecorder,
        toggleRecording,
        exportRealtime,
        exportOffline,
        get isRecording() {
            return isRecording;
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
