/**
 * Main Web Arpeggiator Application Module
 *
 * This module owns the shell: DOM wiring, transport control, preset integration,
 * and module initialization. The heavy lifting (audio engine,
 * recorder/export, visualizer) has been split into separate modules.
 *
 * @module app
 */
import { downloadBlob } from "@core/audio-utils.js";
import { buildChordString, resolveChordDefinition } from "@core/chord-builder.js";
import {
    formatEstimatedExportDuration,
    normalizeLoopCount,
    normalizeOfflineExportTailSeconds,
} from "@core/export-duration.js";
import { filterNoteInput, filterNumericInput } from "@core/input-filters.js";
import { dbToPercent } from "@core/meter-utils.js";
import { exportMidiFile } from "@core/midi-export.js";
import {
    calculateNoteMarkers,
    getArpeggioNotes as getArpeggioNotesFromModule,
    materializePatternSequence,
    normalizeNotesSequence,
} from "@core/pattern-core.js";
import { generateRandomNotes } from "@core/randomizer.js";
import {
    DEFAULT_SETTINGS,
    mergeSettings,
    UnsupportedSettingsVersionError,
} from "@core/settings-contract.js";
import {
    hasPresetChanges,
    PRESET_URL_KEYS,
    parsePresetFromUrlParams,
    serializePresetToUrlParams,
} from "@core/url-preset.js";
import { initializePwa } from "@pwa/pwa.js";
import { presetStore } from "@storage/presets-store.js";
import { debounce } from "@storage/session-manager.js";
import { createSettingsManager } from "@storage/settings-manager.js";
import { createAudioRuntimeController } from "@audio/runtime-controller.js";
import { createPlaybackController } from "@audio/playback-controller.js";
import { initializeKeyboardControls } from "@ui/keyboard-controller.js";
import { createHistoryController } from "@ui/history-controller.js";
import { createInputFilterController } from "@ui/input-filter-controller.js";
import { createNoteStepController } from "@ui/note-step-controller.js";
import { createOnboardingController } from "@ui/onboarding-controller.js";
import { createEffectsControlsController } from "@ui/effects-controls-controller.js";
import { createFuturePresetDialogController } from "@ui/future-preset-dialog-controller.js";
import { createPatternControlsController } from "@ui/pattern-controls-controller.js";
import { createPresetController } from "@ui/preset-controller.js";
import { createSynthControlsController } from "@ui/synth-controls-controller.js";
import { createTransportController } from "@ui/transport-controller.js";
import { createToastManager } from "@ui/ui-feedback.js";
import { createWorkspaceController } from "@ui/workspace-controller.js";
import { FACTORY_PRESETS } from "./config/factory-presets.js";

/** @typedef {import("./config/factory-presets.js").FactoryPreset} FactoryPreset */

/** @typedef {{value: number}} NumericAudioParam */
/** @typedef {{oscillator: {width: NumericAudioParam}, harmonicity: NumericAudioParam, modulationIndex: NumericAudioParam, filterEnvelope: {baseFrequency: number, octaves: number}, filter: {Q: NumericAudioParam}, vibratoAmount: NumericAudioParam, dampening: number, resonance: number, attackNoise: number, pitchDecay: number, octaves: number}} ActiveSynthLike */
/** @typedef {{activeSynth: ActiveSynthLike, currentWaveform: string, setSynth: (type: string) => void, updateEnvelope: () => void, postGain: {volume: NumericAudioParam}, distortion: {wet: NumericAudioParam}, filter: {frequency: NumericAudioParam, Q: NumericAudioParam}, chorus: {wet: NumericAudioParam}, autoPanner: {wet: NumericAudioParam}, delay: {wet: NumericAudioParam}, reverb: {wet: NumericAudioParam}, createOfflineChain: (context: unknown, settings: unknown) => {offlineSynth: {triggerAttackRelease: (note: string, duration: number, time: number) => void}}}} AudioEngineLike */
/** @typedef {{update: (settings: object) => object|null, getPattern: () => {start: () => void, stop: () => void}|null, dispose: () => void}} PatternControllerLike */
/** @typedef {{isRecording: boolean, toggleRecording: () => Promise<void>, exportRealtime: () => Promise<void>, exportOffline: () => Promise<void>, initRecorder: () => Promise<void>}} RecorderManagerLike */
/** @typedef {{currentMode: string, toggle: () => void, startUiLoop: () => void, stopUiLoop: () => void, onManualNoteAttack: () => void, onManualNoteRelease: () => void, updateStaticLoopMap: (buffer: unknown, markers: unknown) => void}} VisualizerLike */

// --- Global Config ---
// Keep development diagnostics out of production bundles.
const SHOW_AUDIO_READY_TOAST = import.meta.env.DEV;
const DEBUG = import.meta.env.DEV;

// Fix for audio session not working on Mobile Safari if in "Silent Mode"
// [237322 – webaudio api is muted when the iOS ringer is muted](https://bugs.webkit.org/show_bug.cgi?id=237322)
/** @typedef {Navigator & { audioSession?: { type?: string } }} AudioSessionNavigator */
const nav = /** @type {AudioSessionNavigator} */ (navigator);
if (nav.audioSession && nav.audioSession.type !== undefined) {
    nav.audioSession.type = "playback";
}

/**
 * Global logger function that respects the DEBUG flag.
 * @param {...unknown} args - Arguments to log.
 */
function log(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

/**
 * Narrows a Tone oscillator to one that exposes a mutable pulse-width value.
 *
 * @param {unknown} oscillator - Candidate oscillator from the active synth.
 * @returns {oscillator is { width: { value: number } }} Whether the oscillator supports duty-cycle control.
 */
function hasOscillatorWidth(oscillator) {
    if (typeof oscillator !== "object" || oscillator === null || !("width" in oscillator)) {
        return false;
    }

    const { width } = oscillator;
    return (
        typeof width === "object" &&
        width !== null &&
        "value" in width &&
        typeof width.value === "number"
    );
}

// --- Application State ---
let isAudioContextStarted = false;
let Tone;
let audioRuntimeController = null;
let playbackController = null;

/**
 * Starts the deferred audio runtime from a user-initiated action.
 *
 * @returns {Promise<void>}
 */
function startAudio() {
    if (!audioRuntimeController) {
        return Promise.reject(new Error("Audio runtime is not initialized."));
    }
    return audioRuntimeController.startAudio();
}

// --- DOMContentLoaded: Main Setup ---
/**
 * Initializes the arpeggiator application, sets up event listeners,
 * restores sessions, and wires up all UI controls.
 * @returns {void}
 */
function initializeApp() {
    // Prevent the browser from restoring a previous scroll position and ensure
    // the page always starts at the very top on every load/refresh.
    if (history.scrollRestoration) {
        history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);

    // --- DOM Elements ---
    /**
     * Primary application container element.
     * @type {HTMLElement | null}
     */
    const appMain = document.getElementById("app-main");
    const stickyTransportBar = /** @type {HTMLElement | null} */ (
        document.querySelector(".sticky-transport-bar")
    );

    const playStopButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("play-stop")
    );
    const undoButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("undo-button")
    );
    const redoButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("redo-button")
    );
    const historyMenuButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("history-menu-button")
    );
    const historyMenu = document.getElementById("history-menu");
    const historyMenuUndoButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("history-menu-undo")
    );
    const historyMenuRedoButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("history-menu-redo")
    );
    const resetDefaultsButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("reset-defaults-button")
    );
    const resetDefaultsDesktopButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("reset-defaults-desktop-button")
    );

    const resetDefaultsOverlay = document.getElementById("reset-defaults-overlay");
    const resetDefaultsDialog = document.getElementById("reset-defaults-dialog");
    const resetDefaultsCancelButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("reset-defaults-cancel")
    );
    const resetDefaultsConfirmButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("reset-defaults-confirm")
    );

    /**
     * Collapsible accordion wrapper for the Sound Starters strip.
     * @type {HTMLDetailsElement | null}
     */
    const soundStartersDetails = /** @type {HTMLDetailsElement | null} */ (
        document.getElementById("sound-starters-details")
    );

    /**
     * Grid container where Sound Starter preset cards are injected.
     * @type {HTMLElement | null}
     */
    const soundStartersGrid = document.getElementById("sound-starters-grid");

    const bpmSlider = /** @type {HTMLInputElement} */ (document.getElementById("bpm"));
    const bpmValue = document.getElementById("bpm-value");
    const postGainSlider = /** @type {HTMLInputElement} */ (document.getElementById("post-gain"));
    const postGainValue = document.getElementById("post-gain-value");
    const swingSlider = /** @type {HTMLInputElement} */ (document.getElementById("swing"));
    const swingValue = document.getElementById("swing-value");
    const notesInput = /** @type {HTMLInputElement} */ (document.getElementById("notes"));
    const intervalSelect = /** @type {HTMLSelectElement} */ (document.getElementById("interval"));

    // Synth Card Elements
    const synthTypeSelect = /** @type {HTMLSelectElement} */ (
        document.getElementById("synth-type")
    );

    // Waveform Elements
    const waveformButtons = document.getElementById("waveform-buttons");
    const carrierLabel = document.getElementById("carrier-label");
    const waveformPluckOverlay = document.getElementById("waveform-pluck-overlay");

    // Pattern Buttons
    const patternButtons = document.getElementById("pattern-buttons");

    // Basic Synth Params
    const basicSynthParams = document.getElementById("basic-synth-params");
    const dutyControl = document.getElementById("duty-control");
    const dutySlider = /** @type {HTMLInputElement} */ (document.getElementById("duty-cycle"));
    const dutyValue = document.getElementById("duty-value");

    // Advanced Synth Params
    const advancedSynthParams = document.getElementById("advanced-synth-params");
    const harmonicityControl = document.getElementById("harmonicity-control");
    const modIndexControl = document.getElementById("mod-index-control");
    const harmonicitySlider = /** @type {HTMLInputElement} */ (
        document.getElementById("harmonicity")
    );
    const harmonicityValue = document.getElementById("harmonicity-value");
    const modIndexSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("modulation-index")
    );
    const modIndexValue = document.getElementById("modulation-index-value");

    // MonoSynth Params
    const monoSynthParams = document.getElementById("mono-synth-params");
    const monoCutoffSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("mono-cutoff")
    );
    const monoCutoffValue = document.getElementById("mono-cutoff-value");
    const monoOctavesSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("mono-octaves")
    );
    const monoOctavesValue = document.getElementById("mono-octaves-value");
    const monoQSlider = /** @type {HTMLInputElement} */ (document.getElementById("mono-q"));
    const monoQValue = document.getElementById("mono-q-value");

    // DuoSynth Params
    const duoSynthParams = document.getElementById("duo-synth-params");
    const duoHarmSlider = /** @type {HTMLInputElement} */ (document.getElementById("duo-harm"));
    const duoHarmValue = document.getElementById("duo-harm-value");
    const duoVibratoSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("duo-vibrato")
    );
    const duoVibratoValue = document.getElementById("duo-vibrato-value");

    // PluckSynth Params
    const pluckSynthParams = document.getElementById("pluck-synth-params");
    const pluckDampeningSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("pluck-dampening")
    );
    const pluckDampeningValue = document.getElementById("pluck-dampening-value");
    const pluckResonanceSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("pluck-resonance")
    );
    const pluckResonanceValue = document.getElementById("pluck-resonance-value");
    const pluckNoiseSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("pluck-noise")
    );
    const pluckNoiseValue = document.getElementById("pluck-noise-value");

    // MembraneSynth Params
    const membraneSynthParams = document.getElementById("membrane-synth-params");
    const membranePitchDecaySlider = /** @type {HTMLInputElement} */ (
        document.getElementById("membrane-pitch-decay")
    );
    const membranePitchDecayValue = document.getElementById("membrane-pitch-decay-value");
    const membraneOctavesSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("membrane-octaves")
    );
    const membraneOctavesValue = document.getElementById("membrane-octaves-value");

    // Gate Parameter
    const gateSlider = /** @type {HTMLInputElement} */ (document.getElementById("gate"));
    const gateValue = document.getElementById("gate-value");

    // ADSR Envelope Controls
    const envAttackSlider = /** @type {HTMLInputElement} */ (document.getElementById("env-attack"));
    const envDecaySlider = /** @type {HTMLInputElement} */ (document.getElementById("env-decay"));
    const envSustainSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("env-sustain")
    );
    const envReleaseSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("env-release")
    );
    const envAttackValue = document.getElementById("env-attack-value");
    const envDecayValue = document.getElementById("env-decay-value");
    const envSustainValue = document.getElementById("env-sustain-value");
    const envReleaseValue = document.getElementById("env-release-value");

    // Keyboard Controls
    const keyboardVisual = document.getElementById("keyboard-visual");
    const keyboardToggle = /** @type {HTMLInputElement} */ (
        document.getElementById("keyboard-toggle")
    );
    const keyboardToggleStatus = document.getElementById("keyboard-toggle-status");
    const keyboardDescription = document.getElementById("keyboard-description");

    // Octave card
    const octaveShiftButtons = document.getElementById("octave-shift-buttons");
    const octaveRangeButtons = document.getElementById("octave-range-buttons");

    // Scale Quantizer card
    const scaleQuantizeToggle = /** @type {HTMLInputElement} */ (
        document.getElementById("scale-quantize-toggle")
    );
    const scaleQuantizeToggleStatus = document.getElementById("scale-quantize-toggle-status");
    const scaleRootSelect = /** @type {HTMLSelectElement} */ (
        document.getElementById("scale-root")
    );
    const scaleTypeSelect = /** @type {HTMLSelectElement} */ (
        document.getElementById("scale-type")
    );

    // Filter card
    const filterCutoffSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("filter-cutoff")
    );
    const filterCutoffValue = document.getElementById("filter-cutoff-value");
    const filterResonanceSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("filter-resonance")
    );
    const filterResonanceValue = document.getElementById("filter-resonance-value");

    // Effects card
    const driveMixSlider = /** @type {HTMLInputElement} */ (document.getElementById("drive-mix"));
    const driveMixValue = document.getElementById("drive-mix-value");
    const chorusMixSlider = /** @type {HTMLInputElement} */ (document.getElementById("chorus-mix"));
    const chorusMixValue = document.getElementById("chorus-mix-value");
    const autoPanMixSlider = /** @type {HTMLInputElement} */ (
        document.getElementById("autopan-mix")
    );
    const autoPanMixValue = document.getElementById("autopan-mix-value");
    const delayMixSlider = /** @type {HTMLInputElement} */ (document.getElementById("delay-mix"));
    const delayMixValue = document.getElementById("delay-mix-value");
    const reverbMixSlider = /** @type {HTMLInputElement} */ (document.getElementById("reverb-mix"));
    const reverbMixValue = document.getElementById("reverb-mix-value");

    // Randomize Notes Button
    const randomizeNotesButton = document.getElementById("randomize-notes");

    // Note Step Indicator
    const noteStepIndicator = document.getElementById("note-step-indicator");

    // Real-time Recording card
    const recordButton = document.getElementById("record-button");
    const recordStatus =
        document.getElementById("record-status") ||
        document.getElementById("realtime-record-status");
    const exportControls =
        document.getElementById("export-controls") ||
        document.getElementById("realtime-export-controls");
    const realtimeExportWavCheck = document.getElementById("realtime-export-wav");
    const realtimeExportMp3Check = document.getElementById("realtime-export-mp3");
    const exportButton = document.getElementById("realtime-export-button");

    // Offline Export card
    const loopCountInput = /** @type {HTMLInputElement} */ (document.getElementById("loop-count"));
    const offlineExportModeInputs = /** @type {NodeListOf<HTMLInputElement>} */ (
        document.querySelectorAll("input[name='offline-export-mode']")
    );
    const offlineExportTailControl = document.getElementById("offline-export-tail-control");
    const offlineExportTailSecondsInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("offline-export-tail-seconds")
    );
    const offlineExportDuration = document.getElementById("offline-export-duration");
    const offlineExportWavCheck = document.getElementById("offline-export-wav");
    const offlineExportMp3Check = document.getElementById("offline-export-mp3");
    const offlineExportButton = document.getElementById("offline-export-button");
    const offlineExportMidiButton = document.getElementById("offline-export-midi-button");
    const offlineExportStatus = document.getElementById("offline-export-status");

    // Output Peak / VU Meter
    const vuMeterBar = document.getElementById("vu-meter-bar");
    const vuDbValue = document.getElementById("vu-db-value");
    const vuClipContainer = document.getElementById("vu-clip-container");
    const vuClipIndicator = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("vu-clip-indicator")
    );
    const vuClipTooltip = document.getElementById("vu-clip-tooltip");
    const vuInfoButton = document.getElementById("vu-info-button");
    const vuInfoTooltip = document.getElementById("vu-info-tooltip");

    // Utility card
    const visualizerYAxisCanvas = /** @type {HTMLCanvasElement | null} */ (
        document.getElementById("visualizer-yaxis")
    );
    const visualizerViewport = document.getElementById("visualizer-viewport");
    const visualizerPlotCanvas = /** @type {HTMLCanvasElement | null} */ (
        document.getElementById("visualizer-plot")
    );
    const toggleVisualizerButton = document.getElementById("toggle-visualizer");
    const visualizerModeSelect = /** @type {HTMLSelectElement | null} */ (
        document.getElementById("visualizer-mode")
    );
    const pauseVisualizerButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("pause-visualizer")
    );
    const visualizerZoomSlider = /** @type {HTMLInputElement | null} */ (
        document.getElementById("visualizer-zoom")
    );
    const visualizerZoomValue = document.getElementById("visualizer-zoom-value");
    const oscilloscopeWindowSelect = /** @type {HTMLSelectElement | null} */ (
        document.getElementById("oscilloscope-window")
    );
    const oscilloscopeWindowContainer = document.getElementById("oscilloscope-window-container");

    // Preset Management card
    const presetNameInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("preset-name-input")
    );
    const savedPresetSelect = /** @type {HTMLSelectElement | null} */ (
        document.getElementById("saved-preset-select")
    );
    const savePresetButton = document.getElementById("save-preset-button");
    const savePresetToBrowserButton = document.getElementById("save-preset-to-browser-button");
    const sharePresetButton = document.getElementById("share-preset-button");
    const loadPresetButton = document.getElementById("load-preset-button");
    const loadSavedPresetButton = document.getElementById("load-saved-preset-button");
    const clearSavedPresetButton = document.getElementById("clear-saved-preset-button");
    const deleteSavedPresetButton = document.getElementById("delete-saved-preset-button");
    const browserStorageRecovery = /** @type {HTMLDetailsElement | null} */ (
        document.getElementById("browser-storage-recovery")
    );
    const loadPresetInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("load-preset-input")
    );

    // Toast
    const toastContainer = document.getElementById("toast-container");

    // --- State ---
    let isPlaying = false;
    let currentNotes = ["C4", "E4", "G4"];
    let currentOctaveShift = 0;
    let currentOctaveRange = 2;
    let activeNote = null;
    let currentWaveform = "sine";

    /**
     * Returns the engine being assembled, if any, so settings can be applied
     * before the fully constructed runtime is published.
     *
     * @returns {AudioEngineLike|null|undefined} The available engine.
     */
    function getAvailableAudioEngine() {
        return /** @type {AudioEngineLike|null|undefined} */ (
            audioRuntimeController?.getAvailableAudioEngine()
        );
    }

    /** @returns {AudioEngineLike|undefined} The published live audio engine. */
    function getAudioEngine() {
        return /** @type {AudioEngineLike|undefined} */ (audioRuntimeController?.getAudioEngine());
    }

    /** @returns {RecorderManagerLike|undefined} The published recorder manager. */
    function getRecorderManager() {
        return /** @type {RecorderManagerLike|undefined} */ (
            audioRuntimeController?.getRecorderManager()
        );
    }

    /** @returns {VisualizerLike|undefined} The published visualizer. */
    function getVisualizer() {
        return /** @type {VisualizerLike|undefined} */ (audioRuntimeController?.getVisualizer());
    }

    /** @returns {PatternControllerLike|undefined} The published pattern controller. */
    function getPatternController() {
        return /** @type {PatternControllerLike|undefined} */ (
            audioRuntimeController?.getPatternController()
        );
    }

    // --- App State Object (for injected modules) ---
    const appState = {
        get isPlaying() {
            return isPlaying;
        },
        set isPlaying(value) {
            isPlaying = value;
        },
        get currentNotes() {
            return currentNotes;
        },
        set currentNotes(value) {
            currentNotes = value;
        },
        get currentOctaveShift() {
            return currentOctaveShift;
        },
        set currentOctaveShift(value) {
            currentOctaveShift = value;
        },
        get currentOctaveRange() {
            return currentOctaveRange;
        },
        set currentOctaveRange(value) {
            currentOctaveRange = value;
        },
        get activeSynth() {
            return getAvailableAudioEngine()?.activeSynth || null;
        },
        set activeSynth(_value) {
            // activeSynth is owned by audio-engine; this is a no-op passthrough
        },
        get currentWaveform() {
            const availableAudioEngine = getAvailableAudioEngine();
            return availableAudioEngine ? availableAudioEngine.currentWaveform : currentWaveform;
        },
        set currentWaveform(value) {
            currentWaveform = value;
            const availableAudioEngine = getAvailableAudioEngine();
            if (availableAudioEngine) {
                availableAudioEngine.currentWaveform = value;
            }
        },
        get activeNote() {
            return activeNote;
        },
        set activeNote(value) {
            activeNote = value;
        },
        get isAudioContextStarted() {
            return isAudioContextStarted;
        },
        set isAudioContextStarted(value) {
            isAudioContextStarted = value;
        },
    };

    // --- Pattern Helpers ---

    /**
     * Returns expanded note list with octave shift and range applied.
     * @param {string[]} baseNotes - Base note names (e.g. ['C4', 'E4', 'G4']).
     * @param {number} range - Octave range (1-5).
     * @param {number} shift - Octave shift (-3 to +3).
     * @returns {string[]} Expanded note list.
     */
    function getArpeggioNotes(baseNotes, range, shift) {
        return getArpeggioNotesFromModule(baseNotes, {
            octaveRange: range,
            octaveShift: shift,
        });
    }

    /**
     * Rebuilds the scheduler from the current UI and application state.
     * @returns {void}
     */
    function createOrUpdatePattern() {
        if (!getAvailableAudioEngine()) {
            noteStepController.rebuild();
            updateEstimatedExportDuration();
            return;
        }
        getPatternController()?.update({
            baseNotes: currentNotes,
            octaveRange: currentOctaveRange,
            octaveShift: currentOctaveShift,
            interval: intervalSelect.value,
            gate: parseFloat(gateSlider.value),
            direction: patternControlsController.getSelectedPatternDirection(),
            quantize: {
                enabled: scaleQuantizeToggle.checked,
                root: scaleRootSelect.value,
                scale: scaleTypeSelect.value,
            },
        }) ?? null;
        // Rebuild the note step indicator pips to match the new note count
        noteStepController.rebuild();
        updateEstimatedExportDuration();
    }

    const noteStepController = createNoteStepController({
        container: noteStepIndicator,
        getNotes: () => currentNotes,
    });

    const patternControlsController = createPatternControlsController({
        dom: {
            notesInput,
            intervalSelect,
            gateSlider,
            gateValue,
            scaleQuantizeToggle,
            scaleQuantizeToggleStatus,
            scaleTypeSelect,
            scaleRootSelect,
            octaveShiftButtons,
            octaveRangeButtons,
            patternButtons,
            randomizeNotesButton,
            chordButtons: document.querySelectorAll(".chord-btn"),
        },
        normalizeNotes: normalizeNotesSequence,
        setNotes: (notes) => {
            currentNotes = notes;
        },
        setOctaveShift: (value) => {
            currentOctaveShift = value;
        },
        setOctaveRange: (value) => {
            currentOctaveRange = value;
        },
        onPatternChange: createOrUpdatePattern,
        onEstimatedDurationChange: () => updateEstimatedExportDuration(),
        onStaticLoopChange: () => debouncedRenderStaticLoop(),
        onNotesSelected: (notes) => {
            notesInput.value = notes.join(" ");
            notesInput.dispatchEvent(new Event("input", { bubbles: true }));
            notesInput.dispatchEvent(new Event("change", { bubbles: true }));
        },
        onClearActiveSoundStarter: () => clearActiveSoundStarterCard(),
        showToast: (message, type) => showToast(message, type),
        generateRandomNotes,
        buildChordString,
        resolveChordDefinition,
        debounce,
    });

    /**
     * Displays non-destructive recovery steps after a browser storage error.
     * @returns {void}
     */
    function showBrowserStorageRecovery() {
        if (!browserStorageRecovery) return;
        browserStorageRecovery.classList.remove("hidden");
        browserStorageRecovery.open = true;
    }

    /**
     * Hides recovery guidance after browser storage works again.
     * @returns {void}
     */
    function hideBrowserStorageRecovery() {
        if (!browserStorageRecovery) return;
        browserStorageRecovery.classList.add("hidden");
        browserStorageRecovery.open = false;
    }

    // ==================================================================
    //    Module Initialization
    // ==================================================================

    // 0. Toast Manager — UI notifications and live region announcements
    const toastManager = createToastManager({
        toastContainer,
        liveRegion: document.getElementById("sr-announcements"),
        logger: log,
    });
    const { showToast } = toastManager;

    const inputFilterController = createInputFilterController({
        dom: { notesInput, loopCountInput },
        filterNoteInput,
        filterNumericInput,
    });
    inputFilterController.initialize();

    initializePwa({ showToast });

    const presetController = createPresetController({
        dom: {
            savedPresetSelect,
            soundStartersGrid,
            soundStartersDetails,
        },
        documentRef: document,
        storage: {
            getItem: (key) => window.localStorage.getItem(key),
            setItem: (key, value) => window.localStorage.setItem(key, value),
        },
        getPresetStore: () => presetStore,
        onFactoryPresetSelected: async (preset) => {
            applySettingsWithHistory(mergeSettings(DEFAULT_SETTINGS, preset.settings));
            if (presetNameInput) {
                presetNameInput.value = preset.name;
            }
            if (savedPresetSelect) {
                savedPresetSelect.value = preset.id;
            }
            if (!isPlaying) {
                try {
                    await startPlayback();
                } catch (error) {
                    console.warn("AudioContext failed to start from sound starter:", error);
                    return;
                }
            }
            showToast(`Loaded preset: ${preset.name}`, "info");
            scheduleLastSessionSave();
        },
        onStorageAvailable: hideBrowserStorageRecovery,
        onStorageUnavailable: showBrowserStorageRecovery,
        logger: console,
    });
    const {
        buildSoundStartersStrip,
        clearActiveSoundStarterCard,
        refreshSavedPresetList,
        setActiveSoundStarterCard,
    } = presetController;

    // 1. Settings Manager — serialization/restoration remains safe before audio starts.
    const settingsManager = createSettingsManager({
        state: appState,
        dom: {
            bpmSlider,
            bpmValue,
            swingSlider,
            swingValue,
            notesInput,
            intervalSelect,
            postGainSlider,
            postGainValue,
            scaleQuantizeToggle,
            scaleRootSelect,
            scaleTypeSelect,
            synthTypeSelect,
            harmonicitySlider,
            harmonicityValue,
            modIndexSlider,
            modIndexValue,
            monoCutoffSlider,
            monoCutoffValue,
            monoOctavesSlider,
            monoOctavesValue,
            monoQSlider,
            monoQValue,
            duoHarmSlider,
            duoHarmValue,
            duoVibratoSlider,
            duoVibratoValue,
            pluckDampeningSlider,
            pluckDampeningValue,
            pluckResonanceSlider,
            pluckResonanceValue,
            pluckNoiseSlider,
            pluckNoiseValue,
            membranePitchDecaySlider,
            membranePitchDecayValue,
            membraneOctavesSlider,
            membraneOctavesValue,
            gateSlider,
            gateValue,
            dutySlider,
            dutyValue,
            envAttackSlider,
            envDecaySlider,
            envSustainSlider,
            envReleaseSlider,
            envAttackValue,
            envDecayValue,
            envSustainValue,
            envReleaseValue,
            filterCutoffSlider,
            filterCutoffValue,
            filterResonanceSlider,
            filterResonanceValue,
            driveMixSlider,
            driveMixValue,
            chorusMixSlider,
            chorusMixValue,
            autoPanMixSlider,
            autoPanMixValue,
            delayMixSlider,
            delayMixValue,
            reverbMixSlider,
            reverbMixValue,
            loopCountInput,
            offlineExportModeInputs,
            offlineExportTailSecondsInput,
            octaveShiftButtons,
            octaveRangeButtons,
        },
        actions: {
            getArpeggioNotes,
            getSelectedPatternDirection: patternControlsController.getSelectedPatternDirection,
            setSelectedPatternDirection: patternControlsController.setSelectedPatternDirection,
            updateScaleQuantizeUi: patternControlsController.updateScaleQuantizeUi,
            updateScaleQuantizeToggleText: patternControlsController.updateScaleQuantizeToggleText,
            updateWaveformButtons: (waveform) =>
                synthControlsController?.updateWaveformButtons(waveform),
            setSynth: (type) => getAvailableAudioEngine()?.setSynth(type),
            updateEnvelope: () => getAvailableAudioEngine()?.updateEnvelope(),
            getTransport: () => (getAvailableAudioEngine() ? Tone.getTransport() : null),
            updateButtonGroup: patternControlsController.updateButtonGroup,
            createOrUpdatePattern,
            updateEstimatedExportDuration,
            updateOfflineExportModeUi,
            showToast,
        },
        audio: {
            get distortion() {
                return getAvailableAudioEngine()?.distortion;
            },
            get filter() {
                return getAvailableAudioEngine()?.filter;
            },
            get chorus() {
                return getAvailableAudioEngine()?.chorus;
            },
            get autoPanner() {
                return getAvailableAudioEngine()?.autoPanner;
            },
            get delay() {
                return getAvailableAudioEngine()?.delay;
            },
            get reverb() {
                return getAvailableAudioEngine()?.reverb;
            },
            get postGain() {
                return getAvailableAudioEngine()?.postGain;
            },
        },
    });

    const { getAllSettings, loadAllSettings, generateFilename } = settingsManager;

    const onboardingController = createOnboardingController({
        dom: {
            appMain,
            playStopButton,
            quickStartModal: document.getElementById("quick-start-modal"),
            quickStartOverlay: document.getElementById("quick-start-overlay"),
            quickStartPresetsGrid: document.getElementById("quick-start-presets-grid"),
            quickStartScratchButton: /** @type {HTMLButtonElement | null} */ (
                document.getElementById("quick-start-scratch")
            ),
            soundStartersDetails,
            startOverlay: document.getElementById("start-overlay"),
        },
        documentRef: document,
        storage: {
            getItem: (key) => window.localStorage.getItem(key),
            setItem: (key, value) => window.localStorage.setItem(key, value),
        },
        getLocationSearch: () => window.location.search,
        presetUrlKeys: PRESET_URL_KEYS,
        factoryPresets: FACTORY_PRESETS,
        onPresetSelected: async (preset) => {
            applySettingsWithHistory(mergeSettings(DEFAULT_SETTINGS, preset.settings));
            if (presetNameInput) {
                presetNameInput.value = preset.name;
            }
            if (savedPresetSelect) {
                savedPresetSelect.value = preset.id;
            }
            setActiveSoundStarterCard(preset.id);
            try {
                await startAudio();
                await startPlayback();
                showToast(`Started with preset: ${preset.name}`, "success");
            } catch (error) {
                console.warn("AudioContext failed to start on quick start click:", error);
            }
            scheduleLastSessionSave();
        },
        onStartFromScratch: async () => {
            await startAudio();
            loadPresetFromUrl();
        },
        onStartOverlay: async () => {
            await startAudio();
            loadPresetFromUrl();
        },
        logger: console,
    });

    // 5. Keyboard Controller
    const keyboardControls = initializeKeyboardControls({
        state: appState,
        dom: {
            keyboardVisual,
            keyboardToggle,
            keyboardToggleStatus,
            keyboardDescription,
            notesInput,
        },
        actions: {
            getCurrentTime: () => Tone?.now() ?? 0,
            onNoteAttack: () => {
                const visualizer = getVisualizer();
                if (visualizer && typeof visualizer.onManualNoteAttack === "function") {
                    visualizer.onManualNoteAttack();
                }
            },
            onNoteRelease: () => {
                const visualizer = getVisualizer();
                if (visualizer && typeof visualizer.onManualNoteRelease === "function") {
                    visualizer.onManualNoteRelease();
                }
            },
        },
    });
    const { updateKeyboardControlUi } = keyboardControls;

    audioRuntimeController = createAudioRuntimeController({
        dom: {
            audioEngine: {
                advancedSynthParams,
                harmonicityControl,
                modIndexControl,
                carrierLabel,
                waveformPluckOverlay,
                dutyControl,
                basicSynthParams,
                waveformButtons,
                monoSynthParams,
                duoSynthParams,
                pluckSynthParams,
                membraneSynthParams,
                harmonicitySlider,
                modIndexSlider,
                monoCutoffSlider,
                monoOctavesSlider,
                monoQSlider,
                duoHarmSlider,
                duoVibratoSlider,
                pluckDampeningSlider,
                pluckResonanceSlider,
                pluckNoiseSlider,
                membranePitchDecaySlider,
                membraneOctavesSlider,
                envAttackSlider,
                envDecaySlider,
                envSustainSlider,
                envReleaseSlider,
                driveMixSlider,
                chorusMixSlider,
                autoPanMixSlider,
            },
            visualizer: {
                visualizerYAxisCanvas,
                visualizerViewport,
                visualizerPlotCanvas,
                toggleVisualizerButton,
                visualizerModeSelect,
                pauseVisualizerButton,
                visualizerZoomSlider,
                visualizerZoomValue,
                oscilloscopeWindowSelect,
                oscilloscopeWindowContainer,
                vuMeterBar,
                vuDbValue,
                vuClipContainer,
                vuClipIndicator,
                vuClipTooltip,
                vuInfoButton,
                vuInfoTooltip,
                envReleaseSlider,
                recordButton,
            },
            recorder: {
                recordButton,
                recordStatus,
                exportControls,
                realtimeExportWavCheck,
                realtimeExportMp3Check,
                exportButton,
                offlineExportWavCheck,
                offlineExportMp3Check,
                offlineExportButton,
                offlineExportStatus,
                loopCountInput,
                envAttackSlider,
                envDecaySlider,
                envSustainSlider,
                envReleaseSlider,
            },
        },
        state: appState,
        getAllSettings,
        loadAllSettings,
        showToast,
        generateFilename,
        formatTime,
        startAudio,
        startPlayback,
        onPatternStep: noteStepController.highlight,
        onPatternChange: () => {},
        onToneLoaded: (tone) => {
            Tone = tone;
        },
        onAudioReady: () => {
            if (SHOW_AUDIO_READY_TOAST) showToast("Audio is ready!", "success");
        },
        onContextReady: () => playbackController?.observeAudioContextState(),
        logger: console,
    });

    playbackController = createPlaybackController({
        dom: { playStopButton },
        state: appState,
        getTone: () => audioRuntimeController?.getTone(),
        getPattern: () => audioRuntimeController?.getPatternController()?.getPattern(),
        getRecorderManager,
        getVisualizer,
        startAudio,
        prepareForPlayback: () => onboardingController.prepareForPlayback(),
        createOrUpdatePattern,
        clearNoteStep: noteStepController.clear,
    });

    // ==================================================================
    //    Remaining UI Utility Functions
    // ==================================================================

    /**
     * Formats seconds to mm:ss.t string.
     * @param {number} seconds - Time in seconds.
     * @returns {string} Formatted time string.
     */
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        const s = Math.floor(remainingSeconds);
        const ms = Math.floor((remainingSeconds - s) * 10);

        const paddedMinutes = minutes.toString().padStart(2, "0");
        const paddedSeconds = s.toString().padStart(2, "0");

        return `${paddedMinutes}:${paddedSeconds}.${ms}`;
    }

    /**
     * Returns the currently selected offline audio export mode.
     *
     * @returns {"seamless"|"tail"} Selected export mode.
     */
    function getSelectedOfflineExportMode() {
        return Array.from(offlineExportModeInputs).some(
            (input) => input.checked && input.value === "seamless",
        )
            ? "seamless"
            : "tail";
    }

    /**
     * Shows the tail duration only when the tail mode needs it.
     *
     * @returns {void}
     */
    function updateOfflineExportModeUi() {
        const isTailMode = getSelectedOfflineExportMode() === "tail";
        offlineExportTailControl?.classList.toggle("hidden", !isTailMode);
        if (offlineExportTailSecondsInput) {
            offlineExportTailSecondsInput.disabled = !isTailMode;
        }
    }

    /**
     * Refreshes the offline export duration estimate using the same materialized
     * pattern sequence used by offline audio and MIDI exports.
     *
     * @returns {void}
     */
    function updateEstimatedExportDuration() {
        if (!offlineExportDuration) return;

        const settings = getAllSettings();
        const { notes: patternNotes } = materializePatternSequence(
            settings.baseNotes || settings.notes,
            {
                direction: settings.direction,
                octaveRange: settings.octaveRange,
                octaveShift: settings.octaveShift,
                quantize: {
                    enabled: settings.scaleQuantize,
                    root: settings.scaleRoot,
                    scale: settings.scaleType,
                },
            },
        );

        offlineExportDuration.textContent = formatEstimatedExportDuration({
            loopCount: settings.loopCount,
            stepsPerLoop: patternNotes.length,
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
    }

    const workspaceController = createWorkspaceController({
        documentRef: document,
        dom: { presetNameInput, savedPresetSelect, loadPresetInput },
        getResetDefinitions: () => resetDefinitions,
        getPresetStore: () => presetStore,
        getAllSettings,
        loadAllSettings,
        getSelectedPatternDirection: patternControlsController.getSelectedPatternDirection,
        setSelectedPatternDirection: patternControlsController.setSelectedPatternDirection,
        clearActiveSoundStarterCard,
        onStaticLoopChange: () => debouncedRenderStaticLoop(),
        onHistoryChange: () => historyController?.updateControls(),
        showToast,
    });
    const {
        applySettingsWithHistory,
        getFocusedResetDefinition,
        redoSettings,
        resetAllSettings,
        resetIndividualSettings,
        restoreLastSession,
        scheduleLastSessionSave,
        undoSettings,
    } = workspaceController;

    const historyController = createHistoryController({
        dom: {
            appMain,
            undoButton,
            redoButton,
            historyMenuButton,
            historyMenu,
            historyMenuUndoButton,
            historyMenuRedoButton,
            resetDefaultsButton,
            resetDefaultsDesktopButton,
            resetDefaultsOverlay,
            resetDefaultsDialog,
            resetDefaultsCancelButton,
            resetDefaultsConfirmButton,
            presetNameInput,
        },
        documentRef: document,
        getStatus: workspaceController.getStatus,
        onUndo: undoSettings,
        onRedo: redoSettings,
        onResetDefaults: resetAllSettings,
        onEscapeReset: () => {
            const definition = getFocusedResetDefinition(document.activeElement);
            if (!definition) return false;
            resetIndividualSettings(definition);
            return true;
        },
    });

    const resetDefinitions = [
        {
            name: "Post Gain",
            keys: ["postGain"],
            controls: [postGainSlider],
            targets: ["label[for='post-gain']", "#post-gain-value"],
        },
        {
            name: "BPM",
            keys: ["bpm"],
            controls: [bpmSlider],
            targets: ["label[for='bpm']", "#bpm-value"],
        },
        {
            name: "Swing",
            keys: ["swing"],
            controls: [swingSlider],
            targets: ["label[for='swing']", "#swing-value"],
        },
        {
            name: "Notes",
            keys: ["baseNotes"],
            controls: [notesInput],
            targets: ["label[for='notes']"],
        },
        {
            name: "Pattern Direction",
            keys: ["direction"],
            controls: [patternButtons],
            targets: ["#pattern-label"],
        },
        {
            name: "Note Duration",
            keys: ["interval"],
            controls: [intervalSelect],
            targets: ["label[for='interval']"],
        },
        {
            name: "Scale Mode",
            keys: ["scaleQuantize", "scaleType"],
            controls: [scaleQuantizeToggle, scaleTypeSelect],
            targets: ["#scale-quantization-title"],
        },
        {
            name: "Scale Root",
            keys: ["scaleRoot"],
            controls: [scaleRootSelect],
            targets: ["label[for='scale-root']"],
        },
        {
            name: "Synth Type",
            keys: ["synthType"],
            controls: [synthTypeSelect],
            targets: ["label[for='synth-type']"],
        },
        {
            name: "Waveform",
            keys: ["waveform"],
            controls: [waveformButtons],
            targets: ["#waveform-label"],
        },
        {
            name: "Duty Cycle",
            keys: ["dutyCycle"],
            controls: [dutySlider],
            targets: ["label[for='duty-cycle']", "#duty-value"],
        },
        {
            name: "Harmonicity",
            keys: ["harmonicity"],
            controls: [harmonicitySlider],
            targets: ["label[for='harmonicity']", "#harmonicity-value"],
        },
        {
            name: "Modulation Index",
            keys: ["modulationIndex"],
            controls: [modIndexSlider],
            targets: ["label[for='modulation-index']", "#modulation-index-value"],
        },
        {
            name: "Mono Cutoff",
            keys: ["monoCutoff"],
            controls: [monoCutoffSlider],
            targets: ["label[for='mono-cutoff']", "#mono-cutoff-value"],
        },
        {
            name: "Mono Octaves",
            keys: ["monoOctaves"],
            controls: [monoOctavesSlider],
            targets: ["label[for='mono-octaves']", "#mono-octaves-value"],
        },
        {
            name: "Mono Resonance",
            keys: ["monoQ"],
            controls: [monoQSlider],
            targets: ["label[for='mono-q']", "#mono-q-value"],
        },
        {
            name: "Duo Harmonicity",
            keys: ["duoHarm"],
            controls: [duoHarmSlider],
            targets: ["label[for='duo-harm']", "#duo-harm-value"],
        },
        {
            name: "Duo Vibrato",
            keys: ["duoVibrato"],
            controls: [duoVibratoSlider],
            targets: ["label[for='duo-vibrato']", "#duo-vibrato-value"],
        },
        {
            name: "Pluck Dampening",
            keys: ["pluckDampening"],
            controls: [pluckDampeningSlider],
            targets: ["label[for='pluck-dampening']", "#pluck-dampening-value"],
        },
        {
            name: "Pluck Resonance",
            keys: ["pluckResonance"],
            controls: [pluckResonanceSlider],
            targets: ["label[for='pluck-resonance']", "#pluck-resonance-value"],
        },
        {
            name: "Pluck Noise",
            keys: ["pluckNoise"],
            controls: [pluckNoiseSlider],
            targets: ["label[for='pluck-noise']", "#pluck-noise-value"],
        },
        {
            name: "Membrane Pitch Decay",
            keys: ["membranePitchDecay"],
            controls: [membranePitchDecaySlider],
            targets: ["label[for='membrane-pitch-decay']", "#membrane-pitch-decay-value"],
        },
        {
            name: "Membrane Octaves",
            keys: ["membraneOctaves"],
            controls: [membraneOctavesSlider],
            targets: ["label[for='membrane-octaves']", "#membrane-octaves-value"],
        },
        {
            name: "Gate",
            keys: ["gateRatio"],
            controls: [gateSlider],
            targets: ["label[for='gate']", "#gate-value"],
        },
        {
            name: "Attack",
            keys: ["envAttack"],
            controls: [envAttackSlider],
            targets: ["label[for='env-attack']", "#env-attack-value"],
        },
        {
            name: "Decay",
            keys: ["envDecay"],
            controls: [envDecaySlider],
            targets: ["label[for='env-decay']", "#env-decay-value"],
        },
        {
            name: "Sustain",
            keys: ["envSustain"],
            controls: [envSustainSlider],
            targets: ["label[for='env-sustain']", "#env-sustain-value"],
        },
        {
            name: "Release",
            keys: ["envRelease"],
            controls: [envReleaseSlider],
            targets: ["label[for='env-release']", "#env-release-value"],
        },
        {
            name: "Filter Cutoff",
            keys: ["filterCutoff"],
            controls: [filterCutoffSlider],
            targets: ["label[for='filter-cutoff']", "#filter-cutoff-value"],
        },
        {
            name: "Filter Resonance",
            keys: ["filterResonance"],
            controls: [filterResonanceSlider],
            targets: ["label[for='filter-resonance']", "#filter-resonance-value"],
        },
        {
            name: "Drive",
            keys: ["driveMix"],
            controls: [driveMixSlider],
            targets: ["label[for='drive-mix']", "#drive-mix-value"],
        },
        {
            name: "Chorus",
            keys: ["chorusMix"],
            controls: [chorusMixSlider],
            targets: ["label[for='chorus-mix']", "#chorus-mix-value"],
        },
        {
            name: "Auto-Pan",
            keys: ["autoPanMix"],
            controls: [autoPanMixSlider],
            targets: ["label[for='autopan-mix']", "#autopan-mix-value"],
        },
        {
            name: "Delay",
            keys: ["delayMix"],
            controls: [delayMixSlider],
            targets: ["label[for='delay-mix']", "#delay-mix-value"],
        },
        {
            name: "Reverb",
            keys: ["reverbMix"],
            controls: [reverbMixSlider],
            targets: ["label[for='reverb-mix']", "#reverb-mix-value"],
        },
        {
            name: "Octave Shift",
            keys: ["octaveShift"],
            controls: [octaveShiftButtons],
            targets: ["#octave-shift-label"],
        },
        {
            name: "Octave Layers",
            keys: ["octaveRange"],
            controls: [octaveRangeButtons],
            targets: ["#octave-range-label"],
        },
        {
            name: "Audio Export",
            keys: ["loopCount", "offlineExportMode", "offlineExportTailSeconds"],
            controls: [loopCountInput, ...offlineExportModeInputs, offlineExportTailSecondsInput],
            targets: [
                "label[for='loop-count']",
                "#offline-export-mode-label",
                "label[for='offline-export-tail-seconds']",
            ],
        },
    ];

    // ==================================================================
    //    Event Listeners
    // ==================================================================

    /**
     * Serializes current settings to URL search parameters, writes the URL to the clipboard,
     * and reports the result to the user.
     * @returns {void}
     */
    function sharePresetAsUrl() {
        const settings = getAllSettings();
        const params = serializePresetToUrlParams(settings);
        const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

        navigator.clipboard
            .writeText(shareUrl)
            .then(() => {
                showToast("Share link copied to clipboard!", "success");
            })
            .catch((err) => {
                console.error("Failed to copy share link:", err);
                showToast(`Failed to copy link. Generated URL: ${shareUrl}`, "error");
            });
    }

    /**
     * Parses the current URL search parameters, validates each value against strict boundaries,
     * and loads them into the application via loadAllSettings.
     *
     * The toast notification is only shown when at least one recognized preset parameter was
     * found, validated successfully, AND its value actually differs from the current setting.
     * @returns {void}
     */
    /**
     * Parses the current URL search parameters, validates each value against strict boundaries,
     * and loads them into the application via loadAllSettings.
     *
     * The toast notification is only shown when at least one recognized preset parameter was
     * found, validated successfully, AND its value actually differs from the current setting.
     * @returns {void}
     */
    function loadPresetFromUrl() {
        const current = getAllSettings();
        const settings = parsePresetFromUrlParams(window.location.search, current);
        if (!settings || !hasPresetChanges(settings, current)) return;

        applySettingsWithHistory(settings);
        showToast("Preset loaded from URL link!", "success");
    }

    /**
     * Starts audio playback if not already running.
     * @returns {Promise<void>}
     */
    async function startPlayback() {
        if (!playbackController) {
            throw new Error("Playback controller is not initialized.");
        }
        await playbackController.start();
    }

    /**
     * Stops audio playback if currently running.
     * @returns {void}
     */
    function stopPlayback() {
        playbackController?.stop();
    }

    /**
     * Debounced wrapper to update the synth envelope.
     * @type {() => void}
     */
    const debouncedUpdateEnvelope = debounce(() => {
        getAudioEngine()?.updateEnvelope();
    }, 16);

    // --- Transport & Pattern ---

    /**
     * Debounced wrapper to set post gain volume.
     * @type {(db: number) => void}
     */
    const debouncedSetPostGain = debounce((/** @type {number} */ db) => {
        const audioEngine = getAudioEngine();
        if (audioEngine) audioEngine.postGain.volume.value = db;
    }, 16);

    /**
     * Debounced wrapper to set harmonicity.
     * @type {(val: number) => void}
     */
    const debouncedSetHarmonicity = debounce((/** @type {number} */ val) => {
        const audioEngine = getAudioEngine();
        if (audioEngine?.activeSynth && "harmonicity" in audioEngine.activeSynth) {
            audioEngine.activeSynth.harmonicity.value = val;
        }
    }, 16);

    /**
     * Debounced wrapper to set modulation index.
     * @type {(val: number) => void}
     */
    const debouncedSetModIndex = debounce((/** @type {number} */ val) => {
        const audioEngine = getAudioEngine();
        if (audioEngine?.activeSynth && "modulationIndex" in audioEngine.activeSynth) {
            audioEngine.activeSynth.modulationIndex.value = val;
        }
    }, 16);

    /**
     * Debounced wrapper to set duty cycle.
     * @type {(val: number) => void}
     */
    const debouncedSetDuty = debounce((/** @type {number} */ val) => {
        const audioEngine = getAudioEngine();
        const synth = audioEngine?.activeSynth;
        if (
            synth &&
            "oscillator" in synth &&
            hasOscillatorWidth(synth.oscillator) &&
            audioEngine?.currentWaveform === "square"
        ) {
            synth.oscillator.width.value = val;
        }
    }, 16);

    /**
     * Debounced wrapper to set filter cutoff frequency.
     * @type {(val: number) => void}
     */
    const debouncedSetFilterCutoff = debounce((/** @type {number} */ val) => {
        const audioEngine = getAudioEngine();
        if (audioEngine) audioEngine.filter.frequency.value = val;
    }, 16);

    /**
     * Debounced wrapper to set filter Q.
     * @type {(val: number) => void}
     */
    const debouncedSetFilterQ = debounce((/** @type {number} */ val) => {
        const audioEngine = getAudioEngine();
        if (audioEngine) audioEngine.filter.Q.value = val;
    }, 16);

    /**
     * Debounced wrapper to set delay mix.
     * @type {(val: number) => void}
     */
    const debouncedSetDelayMix = debounce((/** @type {number} */ val) => {
        const audioEngine = getAudioEngine();
        if (audioEngine) audioEngine.delay.wet.value = val;
    }, 16);

    /**
     * Debounced wrapper to set reverb mix.
     * @type {(val: number) => void}
     */
    const debouncedSetReverbMix = debounce((/** @type {number} */ val) => {
        const audioEngine = getAudioEngine();
        if (audioEngine) audioEngine.reverb.wet.value = val;
    }, 16);

    const transportController = createTransportController({
        dom: {
            playStopButton,
            stickyTransportBar,
            bpmSlider,
            bpmValue,
            swingSlider,
            swingValue,
        },
        windowRef: window,
        getIsPlaying: () => isPlaying,
        onStart: startPlayback,
        onStop: stopPlayback,
        onBpmChange: (value) => {
            if (getAudioEngine()) Tone.getTransport().bpm.value = value;
            updateEstimatedExportDuration();
        },
        onSwingChange: (value) => {
            if (getAudioEngine()) Tone.getTransport().swing = value;
        },
        debounce,
    });
    transportController.initialize();

    const synthControlsController = createSynthControlsController({
        dom: {
            synthTypeSelect,
            waveformButtons,
            envAttackSlider,
            envAttackValue,
            envDecaySlider,
            envDecayValue,
            envSustainSlider,
            envSustainValue,
            envReleaseSlider,
            envReleaseValue,
            harmonicitySlider,
            harmonicityValue,
            modIndexSlider,
            modIndexValue,
            dutySlider,
            dutyValue,
            monoCutoffSlider,
            monoCutoffValue,
            monoOctavesSlider,
            monoOctavesValue,
            monoQSlider,
            monoQValue,
            duoHarmSlider,
            duoHarmValue,
            duoVibratoSlider,
            duoVibratoValue,
            pluckDampeningSlider,
            pluckDampeningValue,
            pluckResonanceSlider,
            pluckResonanceValue,
            pluckNoiseSlider,
            pluckNoiseValue,
            membranePitchDecaySlider,
            membranePitchDecayValue,
            membraneOctavesSlider,
            membraneOctavesValue,
        },
        onSynthTypeChange: (type) => {
            getAudioEngine()?.setSynth(type);
            createOrUpdatePattern();
        },
        onWaveformChange: (waveform) => {
            appState.currentWaveform = waveform;
            synthControlsController.updateWaveformButtons(appState.currentWaveform);
            getAudioEngine()?.setSynth(synthTypeSelect.value);
        },
        onEnvelopeChange: debouncedUpdateEnvelope,
        onHarmonicityChange: debouncedSetHarmonicity,
        onModIndexChange: debouncedSetModIndex,
        onDutyChange: debouncedSetDuty,
        onMonoCutoffChange: (value) => {
            const audioEngine = getAudioEngine();
            if (
                audioEngine?.activeSynth &&
                "filterEnvelope" in audioEngine.activeSynth &&
                audioEngine.activeSynth.filterEnvelope
            ) {
                audioEngine.activeSynth.filterEnvelope.baseFrequency = value;
            }
        },
        onMonoOctavesChange: (value) => {
            const audioEngine = getAudioEngine();
            if (
                audioEngine?.activeSynth &&
                "filterEnvelope" in audioEngine.activeSynth &&
                audioEngine.activeSynth.filterEnvelope
            ) {
                audioEngine.activeSynth.filterEnvelope.octaves = value;
            }
        },
        onMonoQChange: (value) => {
            const audioEngine = getAudioEngine();
            if (
                audioEngine?.activeSynth &&
                "filter" in audioEngine.activeSynth &&
                audioEngine.activeSynth.filter
            ) {
                audioEngine.activeSynth.filter.Q.value = value;
            }
        },
        onDuoHarmonicityChange: (value) => {
            const audioEngine = getAudioEngine();
            if (audioEngine?.activeSynth && "harmonicity" in audioEngine.activeSynth) {
                audioEngine.activeSynth.harmonicity.value = value;
            }
        },
        onDuoVibratoChange: (value) => {
            const audioEngine = getAudioEngine();
            if (audioEngine?.activeSynth && "vibratoAmount" in audioEngine.activeSynth) {
                audioEngine.activeSynth.vibratoAmount.value = value;
            }
        },
        onPluckDampeningChange: (value) => {
            const audioEngine = getAudioEngine();
            if (audioEngine?.activeSynth && "dampening" in audioEngine.activeSynth) {
                audioEngine.activeSynth.dampening = value;
            }
        },
        onPluckResonanceChange: (value) => {
            const audioEngine = getAudioEngine();
            if (audioEngine?.activeSynth && "resonance" in audioEngine.activeSynth) {
                audioEngine.activeSynth.resonance = value;
            }
        },
        onPluckNoiseChange: (value) => {
            const audioEngine = getAudioEngine();
            if (audioEngine?.activeSynth && "attackNoise" in audioEngine.activeSynth) {
                audioEngine.activeSynth.attackNoise = value;
            }
        },
        onMembranePitchDecayChange: (value) => {
            const audioEngine = getAudioEngine();
            if (audioEngine?.activeSynth && "pitchDecay" in audioEngine.activeSynth) {
                audioEngine.activeSynth.pitchDecay = value;
            }
        },
        onMembraneOctavesChange: (value) => {
            const audioEngine = getAudioEngine();
            if (audioEngine?.activeSynth && "octaves" in audioEngine.activeSynth) {
                audioEngine.activeSynth.octaves = value;
            }
        },
    });
    synthControlsController.initialize();

    const effectsControlsController = createEffectsControlsController({
        dom: {
            postGainSlider,
            postGainValue,
            filterCutoffSlider,
            filterCutoffValue,
            filterResonanceSlider,
            filterResonanceValue,
            driveMixSlider,
            driveMixValue,
            chorusMixSlider,
            chorusMixValue,
            autoPanMixSlider,
            autoPanMixValue,
            delayMixSlider,
            delayMixValue,
            reverbMixSlider,
            reverbMixValue,
        },
        formatPostGain: dbToPercent,
        onPostGainChange: debouncedSetPostGain,
        onFilterCutoffChange: debouncedSetFilterCutoff,
        onFilterResonanceChange: debouncedSetFilterQ,
        onDriveMixChange: (value) => {
            const audioEngine = getAudioEngine();
            if (audioEngine?.distortion) audioEngine.distortion.wet.value = value;
        },
        onChorusMixChange: (value) => {
            const audioEngine = getAudioEngine();
            if (audioEngine?.chorus) audioEngine.chorus.wet.value = value;
        },
        onAutoPanMixChange: (value) => {
            const audioEngine = getAudioEngine();
            if (audioEngine?.autoPanner) audioEngine.autoPanner.wet.value = value;
        },
        onDelayMixChange: debouncedSetDelayMix,
        onReverbMixChange: debouncedSetReverbMix,
    });
    effectsControlsController.initialize();

    loopCountInput.addEventListener("input", updateEstimatedExportDuration);
    loopCountInput.addEventListener("change", () => {
        loopCountInput.value = String(normalizeLoopCount(loopCountInput.value));
        updateEstimatedExportDuration();
    });

    offlineExportModeInputs.forEach((input) => {
        input.addEventListener("change", () => {
            if (!input.checked) return;
            updateOfflineExportModeUi();
            updateEstimatedExportDuration();
        });
    });

    offlineExportTailSecondsInput?.addEventListener("input", updateEstimatedExportDuration);
    offlineExportTailSecondsInput?.addEventListener("change", () => {
        offlineExportTailSecondsInput.value = String(
            normalizeOfflineExportTailSeconds(offlineExportTailSecondsInput.value),
        );
        updateEstimatedExportDuration();
    });

    // --- Recording Controls ---
    recordButton.addEventListener("click", async () => {
        try {
            await startAudio();
        } catch (error) {
            console.warn("AudioContext failed to start on record click:", error);
            return;
        }
        await getRecorderManager()?.toggleRecording();
    });

    exportButton.addEventListener("click", async () => {
        try {
            await startAudio();
        } catch (error) {
            console.warn("AudioContext failed to start on recording export click:", error);
            return;
        }
        await getRecorderManager()?.exportRealtime();
    });

    offlineExportButton.addEventListener("click", async () => {
        try {
            await startAudio();
        } catch (error) {
            console.warn("AudioContext failed to start on offline export click:", error);
            return;
        }
        await getRecorderManager()?.exportOffline();
    });

    if (offlineExportMidiButton) {
        offlineExportMidiButton.addEventListener("click", () => {
            const settings = getAllSettings();
            const sequenceResult = materializePatternSequence(currentNotes, {
                direction: settings.direction,
                octaveRange: currentOctaveRange,
                octaveShift: currentOctaveShift,
                quantize: {
                    enabled: settings.scaleQuantize,
                    root: settings.scaleRoot,
                    scale: settings.scaleType,
                },
            });

            const filename = `${generateFilename(false)}.mid`;
            exportMidiFile(
                {
                    notes: sequenceResult.notes,
                    bpm: settings.bpm,
                    interval: settings.interval,
                    gateRatio: settings.gateRatio,
                    loopCount: settings.loopCount,
                },
                filename,
            );
            showToast("Exported MIDI pattern file!", "success");
        });
    }

    // --- Visualizer Toggle ---
    toggleVisualizerButton.addEventListener("click", () => {
        getVisualizer()?.toggle();
    });

    if (visualizerModeSelect) {
        visualizerModeSelect.addEventListener("change", () => {
            if (visualizerModeSelect.value === "loopMap") {
                renderStaticLoop();
            }
        });
    }

    // ==================================================================
    //    Preset Management
    // ==================================================================

    sharePresetButton.addEventListener("click", () => {
        log("Share preset button clicked.");
        sharePresetAsUrl();
    });

    /**
     * Helper function to handle preset serialization, file downloads, and IndexedDB persistence.
     *
     * @param {'save'|'download'} source - Action source ('save' for browser storage only, 'download' for JSON download).
     * @returns {Promise<'success'|'download-only-fail'|'save-fail'>} Outcome of the save operation.
     */
    async function performPresetSave(source) {
        const settings = getAllSettings();
        const filename = `${generateFilename(false)}-preset.json`;
        const presetName = presetNameInput?.value.trim() || filename;
        if (source === "download") {
            const settingsBlob = new Blob([JSON.stringify(settings, null, 2)], {
                type: "application/json",
            });
            downloadBlob(settingsBlob, filename);
        }

        try {
            const record = await presetStore.save(settings, {
                filename,
                name: presetName,
                source,
            });
            hideBrowserStorageRecovery();
            await refreshSavedPresetList(record.id);
            return "success";
        } catch (storeError) {
            console.warn("Failed to save preset to browser storage:", storeError);
            showBrowserStorageRecovery();
            return source === "download" ? "download-only-fail" : "save-fail";
        }
    }

    savePresetButton.addEventListener("click", async () => {
        log("Save preset button clicked.");
        const result = await performPresetSave("download");
        if (result === "download-only-fail") {
            showToast("Preset downloaded, but browser save failed.", "info");
        } else {
            showToast("Preset saved!", "success");
        }
    });

    if (savePresetToBrowserButton) {
        /**
         * Event listener for saving the current preset settings to IndexedDB browser storage.
         *
         * @param {Event} event - The button click event.
         * @returns {Promise<void>}
         */
        savePresetToBrowserButton.addEventListener("click", async (event) => {
            event.preventDefault();
            log("Save to browser preset button clicked.");
            const result = await performPresetSave("save");
            if (result === "success") {
                showToast("Preset saved to browser!", "success");
            } else {
                showToast("Browser save failed.", "error");
            }
        });
    }

    loadPresetButton.addEventListener("click", () => {
        log("Load preset button clicked.");
        loadPresetInput.click();
    });

    function saveImportedPreset(settings, file) {
        presetStore
            .save(settings, { filename: file.name, name: file.name, source: "import" })
            .then((record) => refreshSavedPresetList(record.id))
            .catch((error) => {
                console.warn("Failed to save imported preset:", error);
                showBrowserStorageRecovery();
            });
    }

    const futurePresetDialogController = createFuturePresetDialogController({
        getReturnFocus: () => loadPresetButton,
        onConfirm: (settings, fileName) => {
            const result = applySettingsWithHistory(settings, { allowFutureVersion: true });
            if (result.ok) {
                saveImportedPreset(getAllSettings(), { name: fileName });
                showToast("Loaded compatible settings from newer preset.", "info");
            }
        },
    });

    loadPresetInput.addEventListener("change", (event) => {
        const target = /** @type {HTMLInputElement} */ (event.target);
        const file = target.files ? target.files[0] : null;
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileReaderTarget = /** @type {FileReader} */ (e.target);
            if (fileReaderTarget && typeof fileReaderTarget.result === "string") {
                try {
                    const settings = JSON.parse(fileReaderTarget.result);
                    const result = applySettingsWithHistory(settings);
                    if (result.ok) {
                        saveImportedPreset(getAllSettings(), file);
                        showToast("Preset loaded!", "success");
                    } else if (
                        result.error instanceof UnsupportedSettingsVersionError &&
                        result.error.isFutureVersion
                    ) {
                        futurePresetDialogController.open(settings, file.name);
                    } else {
                        showToast("Failed to load preset.", "error");
                    }
                } catch (err) {
                    console.error("Failed to load preset:", err);
                    showToast("Failed to load preset.", "error");
                }
            }
        };
        reader.readAsText(file);
        target.value = "";
    });

    if (loadSavedPresetButton) {
        loadSavedPresetButton.addEventListener("click", async () => {
            log("Load saved preset button clicked.");
            const selectedId = savedPresetSelect?.value || "";

            // Check if selected preset is a Factory Preset
            const factoryPreset = FACTORY_PRESETS.find((p) => p.id === selectedId);
            if (factoryPreset) {
                applySettingsWithHistory(mergeSettings(DEFAULT_SETTINGS, factoryPreset.settings));
                if (presetNameInput) presetNameInput.value = factoryPreset.name;
                setActiveSoundStarterCard(factoryPreset.id);
                showToast(`Loaded factory preset: ${factoryPreset.name}`, "success");
                return;
            }

            try {
                const record = selectedId
                    ? await presetStore.get(selectedId)
                    : await presetStore.loadLatest();
                if (!record) {
                    showToast("No saved preset found yet.", "info");
                    return;
                }
                const result = applySettingsWithHistory(record.settings || record);
                if (!result.ok) {
                    showToast("Saved preset requires a newer version of Web Arpeggiator.", "error");
                    return;
                }
                if (presetNameInput) presetNameInput.value = record.name || record.filename || "";
                await refreshSavedPresetList(record.id);
                showToast("Loaded saved preset from browser storage.", "success");
            } catch (error) {
                console.error("Failed to load saved preset:", error);
                showBrowserStorageRecovery();
                showToast("Failed to load saved preset.", "error");
            }
        });
    }

    if (clearSavedPresetButton) {
        clearSavedPresetButton.addEventListener("click", async () => {
            log("Clear saved presets button clicked.");
            const confirmed = confirm(
                "Are you sure you want to clear all your saved user presets? This action cannot be undone.",
            );

            if (!confirmed) {
                return;
            }

            try {
                await presetStore.clear();
                await refreshSavedPresetList();
                showToast("Saved browser presets cleared.", "success");
            } catch (error) {
                console.error("Failed to clear saved presets:", error);
                showBrowserStorageRecovery();
                showToast("Failed to clear saved presets.", "error");
            }
        });
    }

    if (deleteSavedPresetButton) {
        deleteSavedPresetButton.addEventListener("click", async () => {
            log("Delete saved preset button clicked.");
            const selectedId = savedPresetSelect?.value || "";

            if (!selectedId) {
                showToast("No saved preset selected.", "info");
                return;
            }

            if (selectedId.startsWith("factory-")) {
                showToast("Factory presets cannot be deleted.", "info");
                return;
            }

            try {
                await presetStore.remove(selectedId);
                await refreshSavedPresetList();
                showToast("Deleted saved preset.", "success");
            } catch (error) {
                console.error("Failed to delete saved preset:", error);
                showBrowserStorageRecovery();
                showToast("Failed to delete saved preset.", "error");
            }
        });
    }

    /**
     * Renders exactly one cycle of the arpeggio loop offline, calculates the note trigger markers,
     * and sends the resulting buffer to the visualizer for rendering.
     *
     * @returns {Promise<void>}
     */
    async function renderStaticLoop() {
        const audioEngine = getAudioEngine();
        const visualizer = getVisualizer();
        if (!isAudioContextStarted || !audioEngine || !visualizer) return;

        const settings = getAllSettings();
        const markers = calculateNoteMarkers(settings);

        if (!markers || markers.length === 0) return;

        // Render exactly 1 loop duration
        const noteDuration = Tone.Time(settings.interval).toSeconds();
        const loopDuration = markers.length * noteDuration;

        try {
            const audioBuffer = await Tone.Offline(async (offlineContext) => {
                offlineContext.transport.bpm.value = settings.bpm;
                offlineContext.transport.swing = settings.swing;

                // Recreate offline chain
                const { offlineSynth } = audioEngine.createOfflineChain(offlineContext, settings);

                // Schedule note triggers at exact intervals
                const gateLength = settings.gateRatio * noteDuration;
                markers.forEach((marker, idx) => {
                    const triggerTime = idx * noteDuration;
                    offlineSynth.triggerAttackRelease(marker.note, gateLength, triggerTime);
                });

                offlineContext.transport.start(0);
            }, loopDuration);

            // Pass buffer and markers to visualizer
            visualizer.updateStaticLoopMap(audioBuffer, markers);
        } catch (e) {
            console.error("Static loop render failed:", e);
        }
    }

    /**
     * Debounced wrapper to trigger the static loop map background render.
     * @type {() => void}
     */
    const debouncedRenderStaticLoop = debounce(() => {
        const visualizer = getVisualizer();
        if (visualizer && visualizer.currentMode === "loopMap") {
            renderStaticLoop();
        }
    }, 150);

    patternControlsController.initialize();

    // ==================================================================
    //    Initial Setup
    // ==================================================================

    loadAllSettings(DEFAULT_SETTINGS);
    keyboardToggle.checked = false;
    updateKeyboardControlUi();

    workspaceController.initialize(getAllSettings());
    historyController.initialize();
    buildSoundStartersStrip();

    onboardingController.initialize();

    log("Arpeggiator initialized and ready.");
    void refreshSavedPresetList();
    restoreLastSession().then(() => {
        loadPresetFromUrl();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
} else {
    initializeApp();
}
