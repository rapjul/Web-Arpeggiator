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

import * as Tone from 'tone';
import {
    audioBufferToMp3Blob,
    audioBufferToWav,
    downloadBlob
} from './audio-utils.js';

/**
 * Creates the recorder manager with real-time and offline export control.
 *
 * @param {object}   context                                - Injected app context.
 * @param {object}   context.audio                          - Audio-engine references.
 * @param {Tone.Reverb}     context.audio.reverb            - Reverb node (signal tap point).
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
    const dom = /** @type {any} */ (context.dom);

    // --- Internal recorder state ---
    let recorder = null;
    let recordedChunks = [];
    let recorderType = null;
    let liveRecordedWavBlob = null;
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
        dom.recordButton.textContent = 'Record';
        dom.recordButton.setAttribute('aria-label', 'Start recording');
        dom.recordButton.classList.remove('recording');
        dom.recordStatus.textContent = "Recording stopped. Ready to export.";
        dom.exportControls.classList.remove('hidden');
        dom.recordButton.disabled = false;
        dom.exportButton.disabled = false;
        dom.exportButton.textContent = 'Export Files';
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

        let mediaRecorderSuccess = false;

        // Try Tone.Recorder first (works in HTTP and Canvas contexts)
        try {
            recorder = new Tone.Recorder();
            audio.reverb.connect(recorder);
            recorderType = 'ToneRecorder';
            dom.recordStatus.textContent = "Ready to record (Tone.Recorder).";
            actions.showToast("Recorder ready (Fallback)", "info");
        } catch (e) {
            // Fall back to MediaRecorder (HTTPS only)
            if (window.isSecureContext && typeof MediaRecorder !== 'undefined') {
                try {
                    const rawCtx = /** @type {AudioContext} */ (Tone.getContext().rawContext);
                    const dest = rawCtx.createMediaStreamDestination();
                    audio.reverb.connect(dest);
                    recorder = new MediaRecorder(dest.stream);
                    recorderType = 'MediaRecorder';

                    recorder.ondataavailable = (e) => {
                        if (e.data.size > 0) recordedChunks.push(e.data);
                    };
                    recorder.onstop = () => {
                        liveRecordedWavBlob = new Blob(recordedChunks, { type: 'audio/webm' });
                        recordedChunks = [];
                        onRecordingStop();
                    };

                    mediaRecorderSuccess = true;
                    dom.recordStatus.textContent = "Ready to record (MediaRecorder).";
                    actions.showToast("Recorder ready (Native)", "success");
                } catch (e2) {
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
     * @returns {void}
     */
    function toggleRecording() {
        if (isRecording) {
            // --- Stop recording ---
            isRecording = false;
            if (recorderType === 'MediaRecorder') {
                recorder.stop();
                // onRecordingStop fires from the onstop event
            } else if (recorderType === 'ToneRecorder') {
                recorder.stop().then((blob) => {
                    liveRecordedWavBlob = blob;
                    onRecordingStop();
                });
            }
        } else {
            // --- Start recording ---
            if (!state.isAudioContextStarted) {
                actions.showToast("Please start audio playback first.", "error");
                return;
            }
            if (!recorder) {
                actions.showToast("Recorder not initialized. Try starting playback first.", "error");
                return;
            }

            liveRecordedWavBlob = null;

            if (recorderType === 'MediaRecorder') {
                recordedChunks = [];
                recorder.start();
            } else if (recorderType === 'ToneRecorder') {
                recorder.start();
            }

            dom.recordButton.classList.add('recording');
            dom.exportControls.classList.add('hidden');
            dom.recordStatus.textContent = "Recording... Click again to stop.";
            recordingStartTime = Tone.now();
            dom.recordButton.textContent = 'Stop Recording (00:00.0)';
            dom.recordButton.setAttribute('aria-label', 'Stop recording (current elapsed time 00:00.0)');
            isRecording = true;
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
        dom.exportButton.textContent = 'Exporting...';

        const filename = actions.generateFilename(true);

        if (dom.realtimeExportWavCheck.checked) {
            dom.recordStatus.textContent = "Exporting WAV...";
            actions.showToast("Exporting WAV...", "info");
            downloadBlob(liveRecordedWavBlob, `${filename}.wav`);
            actions.showToast("Exported WAV file!", "info");

            if (dom.realtimeExportMp3Check.checked) {
                await new Promise((resolve) => setTimeout(resolve, 300));
            }
        }

        if (dom.realtimeExportMp3Check.checked) {
            dom.recordStatus.textContent = "Encoding MP3... (this may take a moment)";
            actions.showToast("Encoding MP3...", "info");
            try {
                const audioBuffer = await Tone.getContext().decodeAudioData(
                    await liveRecordedWavBlob.arrayBuffer()
                );
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
        dom.exportButton.textContent = 'Export Files';
    }

    // ------------------------------------------------------------------
    // Offline Export (Tone.Offline)
    // ------------------------------------------------------------------

    /**
     * Renders a perfect-loop audio buffer offline and exports it as
     * WAV and/or MP3.
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
        dom.offlineExportButton.textContent = 'Generating...';
        dom.offlineExportStatus.textContent = "Generating audio... please wait.";

        const settings = actions.getAllSettings();
        const filename = actions.generateFilename(false);

        // Calculate loop duration
        let stepsPerLoop = settings.notes.length;

        if (settings.direction === 'upDownRepeat' || settings.direction === 'downUpRepeat') {
            stepsPerLoop = settings.notes.length * 2;
        } else if (settings.direction === 'upDown' || settings.direction === 'downUp') {
            if (settings.notes.length > 1) {
                stepsPerLoop = (settings.notes.length * 2) - 2;
            }
        }

        if (stepsPerLoop === 0) stepsPerLoop = 1;

        const intervalInSeconds = Tone.Time(settings.interval).toSeconds();
        const loopDurationInSeconds = stepsPerLoop * intervalInSeconds;
        const totalDuration = loopDurationInSeconds * settings.loopCount;

        try {
            const toneAudioBuffer = await Tone.Offline(async (offlineContext) => {
                offlineContext.transport.bpm.value = settings.bpm;
                offlineContext.transport.swing = settings.swing;

                // Recreate the synth + effects graph using the shared audio engine helper
                const { offlineSynth } = audio.createOfflineChain(offlineContext, settings);

                // --- Pattern for offline ---
                const gateLength = settings.gateRatio * Tone.Time(settings.interval).toSeconds();

                let patternNotes = settings.notes;
                let patternType = settings.direction;

                if (settings.direction === 'upDownRepeat') {
                    const reversed = [...settings.notes].reverse();
                    patternNotes = [...settings.notes, ...reversed];
                    patternType = 'up';
                } else if (settings.direction === 'downUpRepeat') {
                    const reversed = [...settings.notes].reverse();
                    patternNotes = [...reversed, ...settings.notes];
                    patternType = 'up';
                }

                const offlinePattern = new Tone.Pattern(
                    (time, note) => {
                        offlineSynth.triggerAttackRelease(note, gateLength, time);
                    },
                    patternNotes,
                    patternType
                );
                offlinePattern.interval = settings.interval;
                offlinePattern.start(0);

                offlineContext.transport.start(0);
            }, totalDuration + 2.0); // Extra 2 s for reverb tail

            const nativeBuffer = /** @type {AudioBuffer} */ (typeof toneAudioBuffer.get === 'function' ? toneAudioBuffer.get() : toneAudioBuffer);

            // Validate buffer
            if (nativeBuffer.length < 1000) {
                actions.showToast("Offline generation failed! No audio was created.", "error");
                dom.offlineExportStatus.textContent = "Offline rendering failed.";
                dom.offlineExportButton.disabled = false;
                dom.offlineExportButton.textContent = 'Generate & Export';
                return;
            }

            // Export WAV
            if (dom.offlineExportWavCheck.checked) {
                dom.offlineExportStatus.textContent = "Exporting WAV...";
                actions.showToast("Exporting WAV...", "info");
                const wavBlob = audioBufferToWav(nativeBuffer);
                downloadBlob(wavBlob, `${filename}.wav`);

                if (dom.offlineExportMp3Check.checked) {
                    await new Promise((resolve) => setTimeout(resolve, 250));
                }
            }

            // Export MP3
            if (dom.offlineExportMp3Check.checked) {
                dom.offlineExportStatus.textContent = "Encoding MP3...";
                actions.showToast("Encoding MP3...", "info");
                const mp3Blob = await audioBufferToMp3Blob(nativeBuffer);
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
            dom.offlineExportButton.textContent = 'Generate & Export';
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
        get isRecording() { return isRecording; },
        get recordingStartTime() { return recordingStartTime; },
        setRecorderBlob: (blob) => { liveRecordedWavBlob = blob; }
    };
}