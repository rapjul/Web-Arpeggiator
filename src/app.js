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
    normalizeSettingsHistory,
    UnsupportedSettingsVersionError,
} from "@core/settings-contract.js";
import { createSettingsHistory } from "@core/settings-history.js";
import {
    hasPresetChanges,
    PRESET_URL_KEYS,
    parsePresetFromUrlParams,
    serializePresetToUrlParams,
} from "@core/url-preset.js";
import { initializePwa } from "@pwa/pwa.js";
import { presetStore } from "@storage/presets-store.js";
import { createSessionManager, debounce } from "@storage/session-manager.js";
import { createSettingsManager } from "@storage/settings-manager.js";
import { setupKeyboardNavigation } from "@ui/a11y-navigation.js";
import { initializeKeyboardControls } from "@ui/keyboard-controller.js";
import { createHistoryController } from "@ui/history-controller.js";
import { createInputFilterController } from "@ui/input-filter-controller.js";
import { createNoteStepController } from "@ui/note-step-controller.js";
import { createOnboardingController } from "@ui/onboarding-controller.js";
import { createEffectsControlsController } from "@ui/effects-controls-controller.js";
import { createPatternControlsController } from "@ui/pattern-controls-controller.js";
import { createPresetController } from "@ui/preset-controller.js";
import { createSynthControlsController } from "@ui/synth-controls-controller.js";
import { createTransportController } from "@ui/transport-controller.js";
import { createToastManager } from "@ui/ui-feedback.js";
import { FACTORY_PRESETS } from "./config/factory-presets.js";

/** @typedef {import("./config/factory-presets.js").FactoryPreset} FactoryPreset */

// --- Global Config ---
// Set to true to show a toast message when audio is ready (for testing)
const SHOW_AUDIO_READY_TOAST = true;
// Set to true for verbose console logging
const DEBUG = true;

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
let initializeAudioRuntime = null;
let audioStartPromise = null;
let audioModulesPromise = null;
let notifyAudioReady = () => {};
let notifyAudioFailure = () => {};
let Tone;
let createAudioEngine;
let createPatternController;
let createRecorderManager;
let createVisualizer;

/**
 * Loads Tone.js and every module that imports it only from an explicit audio
 * activation. Tone's package entry creates a Transport during module
 * evaluation, so a static import would create Web Audio before a user gesture.
 *
 * @returns {Promise<void>}
 */
async function loadAudioModules() {
    if (!audioModulesPromise) {
        audioModulesPromise = Promise.all([
            import("tone"),
            import("@audio/audio-engine.js"),
            import("@audio/pattern-generator.js"),
            import("@audio/recorder.js"),
            import("@ui/visualizer.js"),
        ])
            .then(([tone, audioEngineModule, patternModule, recorderModule, visualizerModule]) => {
                Tone = tone;
                ({ createAudioEngine } = audioEngineModule);
                ({ createPatternController } = patternModule);
                ({ createRecorderManager } = recorderModule);
                ({ createVisualizer } = visualizerModule);
            })
            .catch((error) => {
                audioModulesPromise = null;
                throw error;
            });
    }
    return audioModulesPromise;
}

/**
 * Starts the Tone.js AudioContext when the user interacts with the page.
 * @returns {Promise<void>}
 */
async function startAudio() {
    if (isAudioContextStarted && Tone?.getContext().state === "running") return;

    if (!audioStartPromise) {
        audioStartPromise = (async () => {
            try {
                // Accessing the context and resuming it must both happen inside the
                // user-initiated handler that called startAudio.
                await loadAudioModules();
                const context = Tone.getContext();
                if (context.state !== "running") {
                    await Tone.start();
                }
                if (typeof initializeAudioRuntime !== "function") {
                    throw new Error("Audio runtime is not initialized.");
                }
                await initializeAudioRuntime();
                isAudioContextStarted = true;
                log("AudioContext resumed successfully.");
                notifyAudioReady();
            } catch (err) {
                console.error("AudioContext failed to start/resume:", err);
                notifyAudioFailure();
                throw err;
            }
        })().finally(() => {
            audioStartPromise = null;
        });
    }

    return audioStartPromise;
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
    const futurePresetOverlay = document.getElementById("future-preset-overlay");
    const futurePresetDialog = document.getElementById("future-preset-dialog");
    const futurePresetCancelButton = document.getElementById("future-preset-cancel");
    const futurePresetConfirmButton = document.getElementById("future-preset-confirm");

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
    let arpPattern = null;
    let patternController;
    let currentOctaveShift = 0;
    let currentOctaveRange = 2;
    let activeNote = null;
    let currentWaveform = "sine";
    /** @type {Record<string, unknown>|null} */
    let pendingFuturePreset = null;
    let audioEngine;
    let pendingAudioEngine = null;
    let recorderManager;
    let visualizer;
    let audioRuntimePromise = null;
    let observedRawAudioContext = null;
    let audioContextStateListener = null;

    /**
     * Returns the engine being assembled, if any, so settings can be applied
     * before the fully constructed runtime is published.
     *
     * @returns {ReturnType<typeof createAudioEngine>|null|undefined} The available engine.
     */
    function getAvailableAudioEngine() {
        return audioEngine || pendingAudioEngine;
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
     * @returns {{ok: boolean, settings?: import("./core/settings-contract.js").ArpeggiatorSettings, error?: unknown}}
     */
    function createOrUpdatePattern() {
        if (!getAvailableAudioEngine()) {
            noteStepController.rebuild();
            updateEstimatedExportDuration();
            return;
        }
        arpPattern =
            patternController?.update({
                baseNotes: currentNotes,
                octaveRange: currentOctaveRange,
                octaveShift: currentOctaveShift,
                interval: intervalSelect.value,
                gate: parseFloat(gateSlider.value),
                direction: getSelectedPatternDirection(),
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

    /**
     * Returns the currently selected pattern direction value.
     * @returns {string} Direction slug (e.g. 'up', 'down').
     */
    function getSelectedPatternDirection() {
        const checkedRadio = /** @type {HTMLInputElement | null} */ (
            patternButtons.querySelector("input[name='pattern-direction']:checked")
        );
        if (checkedRadio?.value) {
            return checkedRadio.value;
        }
        const selectedPatternButton = patternButtons.querySelector(".pattern-btn.selected");
        return selectedPatternButton ? selectedPatternButton.getAttribute("data-pattern") : "up";
    }

    /**
     * Sets the currently selected pattern direction button or radio input.
     * @param {string} direction - Direction slug to select.
     * @returns {void}
     */
    function setSelectedPatternDirection(direction) {
        const nextDirection = direction || "up";
        const radio = /** @type {HTMLInputElement | null} */ (
            patternButtons.querySelector(
                `input[name='pattern-direction'][value="${nextDirection}"]`,
            ) ||
                patternButtons.querySelector(
                    `input[name='pattern-direction'][data-pattern="${nextDirection}"]`,
                )
        );
        if (radio) {
            radio.checked = true;
        } else {
            const fallbackRadio = /** @type {HTMLInputElement | null} */ (
                patternButtons.querySelector("input[name='pattern-direction'][value='up']")
            );
            if (fallbackRadio) {
                fallbackRadio.checked = true;
            }
        }
        let selectedButton = patternButtons.querySelector(
            `.pattern-btn[data-pattern="${nextDirection}"]`,
        );
        if (!selectedButton) {
            selectedButton = patternButtons.querySelector('.pattern-btn[data-pattern="up"]');
        }
        patternButtons.querySelectorAll(".pattern-btn, button").forEach((b) => {
            b.classList.remove("selected");
        });
        if (selectedButton) {
            selectedButton.classList.add("selected");
        }
    }

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

    // ------------------------------------------------------------------
    // Session Manager — Auto-save and workspace restoration
    // ------------------------------------------------------------------

    const settingsHistory = createSettingsHistory();

    const sessionManager = createSessionManager({
        getPresetStore: () => presetStore,
        getSettings: () => getAllSettings(),
        getHistoryState: () => settingsHistory.exportState(),
        onRestore: (settings, persistedHistory) => {
            const result = loadAllSettings(settings);
            if (!result.ok) return;
            let history = null;
            try {
                history = normalizeSettingsHistory(persistedHistory, getAllSettings());
            } catch {
                history = null;
            }
            settingsHistory.restore(history, getAllSettings());
            if (getSelectedPatternDirection()) {
                setSelectedPatternDirection(getSelectedPatternDirection());
            } else {
                setSelectedPatternDirection("up");
            }
            updateHistoryControls();
        },
    });

    const scheduleLastSessionSave = () => sessionManager.scheduleSave();
    const restoreLastSession = () => sessionManager.restoreSession();

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

    notifyAudioReady = () => {
        if (SHOW_AUDIO_READY_TOAST) {
            showToast("Audio is ready!", "success");
        }
    };
    notifyAudioFailure = () => {
        showToast("Audio failed to start. See console.", "error");
    };

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
            getSelectedPatternDirection,
            setSelectedPatternDirection,
            updateScaleQuantizeUi,
            updateScaleQuantizeToggleText,
            updateWaveformButtons,
            setSynth: (type) => getAvailableAudioEngine()?.setSynth(type),
            updateEnvelope: () => getAvailableAudioEngine()?.updateEnvelope(),
            getTransport: () => (getAvailableAudioEngine() ? Tone.getTransport() : null),
            updateButtonGroup,
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
                if (visualizer && typeof visualizer.onManualNoteAttack === "function") {
                    visualizer.onManualNoteAttack();
                }
            },
            onNoteRelease: () => {
                if (visualizer && typeof visualizer.onManualNoteRelease === "function") {
                    visualizer.onManualNoteRelease();
                }
            },
        },
    });
    const { updateKeyboardControlUi } = keyboardControls;

    /**
     * Creates the real-time Tone graph only after Tone.start() has resumed the
     * context from an explicit user action.
     *
     * @returns {Promise<void>}
     */
    initializeAudioRuntime = async () => {
        if (audioEngine) return;
        if (!audioRuntimePromise) {
            audioRuntimePromise = (async () => {
                let nextAudioEngine;
                let nextVisualizer;
                let nextRecorderManager;

                try {
                    nextAudioEngine = createAudioEngine({
                        dom: {
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
                    });
                    nextAudioEngine.currentWaveform = currentWaveform;

                    nextVisualizer = createVisualizer({
                        dom: {
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
                        },
                        audio: {
                            analyser: nextAudioEngine.analyser,
                            meter: nextAudioEngine.meter,
                            peakAnalyser: nextAudioEngine.peakAnalyser,
                        },
                        state: {
                            get isRecording() {
                                return recorderManager ? recorderManager.isRecording : false;
                            },
                            get recordingStartTime() {
                                return recorderManager ? recorderManager.recordingStartTime : 0;
                            },
                            get isPlaying() {
                                return isPlaying;
                            },
                            get activeNote() {
                                return activeNote;
                            },
                            recordButton,
                        },
                        actions: { formatTime },
                    });

                    nextRecorderManager = createRecorderManager({
                        audio: {
                            reverb: nextAudioEngine.reverb,
                            synths: nextAudioEngine.synths,
                            createOfflineChain: nextAudioEngine.createOfflineChain,
                        },
                        dom: {
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
                        state: {
                            get isAudioContextStarted() {
                                return isAudioContextStarted;
                            },
                            get isPlaying() {
                                return isPlaying;
                            },
                        },
                        actions: {
                            showToast,
                            startUiLoop: nextVisualizer.startUiLoop,
                            stopUiLoop: nextVisualizer.stopUiLoop,
                            getAllSettings,
                            generateFilename,
                            formatTime,
                            startAudio,
                            startPlayback,
                        },
                    });

                    // Apply any URL, session, or form state accumulated before audio
                    // activation before publishing the finished audio runtime.
                    pendingAudioEngine = nextAudioEngine;
                    patternController = createPatternController({
                        getSynth: () => getAvailableAudioEngine()?.activeSynth || null,
                        getIsPlaying: () => isPlaying,
                        onPatternChange: (pattern) => {
                            arpPattern = pattern;
                        },
                        onStep: noteStepController.highlight,
                    });
                    loadAllSettings(getAllSettings());

                    audioEngine = nextAudioEngine;
                    visualizer = nextVisualizer;
                    recorderManager = nextRecorderManager;
                    pendingAudioEngine = null;
                    observeAudioContextState();
                } catch (error) {
                    nextVisualizer?.destroy();
                    nextAudioEngine?.dispose();
                    try {
                        patternController?.dispose();
                    } catch (cleanupError) {
                        console.warn("Failed to dispose a partial arpeggio pattern:", cleanupError);
                    }
                    audioEngine = undefined;
                    pendingAudioEngine = null;
                    visualizer = undefined;
                    recorderManager = undefined;
                    patternController = undefined;
                    arpPattern = null;
                    throw error;
                }
            })().catch((error) => {
                audioRuntimePromise = null;
                throw error;
            });
        }
        return audioRuntimePromise;
    };

    // ==================================================================
    //    Remaining UI Utility Functions
    // ==================================================================

    /**
     * Reflects a selected numeric setting in a button/radio group.
     *
     * @param {HTMLElement} container - Group containing radio inputs and buttons.
     * @param {number} selectedValue - Numeric value to select.
     * @param {string} dataAttribute - Attribute that stores button values.
     * @returns {void}
     */
    function updateButtonGroup(container, selectedValue, dataAttribute) {
        const radio = container.querySelector(
            `input[type="radio"][${dataAttribute}="${selectedValue}"], input[type="radio"][value="${selectedValue}"]`,
        );
        if (radio) /** @type {HTMLInputElement} */ (radio).checked = true;
        container.querySelectorAll(".octave-btn, button").forEach((button) => {
            const valueControl = button.matches(`[${dataAttribute}]`)
                ? button
                : button.querySelector(`[${dataAttribute}]`);
            button.classList.toggle(
                "selected",
                valueControl !== null &&
                    Number(valueControl.getAttribute(dataAttribute)) === selectedValue,
            );
        });
    }

    /**
     * Updates waveform button selection state.
     * @param {string} selectedWave - The waveform to select (e.g. 'sine').
     * @returns {void}
     */
    function updateWaveformButtons(selectedWave) {
        waveformButtons.querySelectorAll("button").forEach((btn) => {
            btn.classList.remove("selected");
            const btnWave = btn.getAttribute("data-wave");
            if (btnWave === selectedWave) {
                btn.classList.add("selected");
            }
        });
    }

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

    /** @type {Record<string, unknown> | null} */
    let defaultSettings = null;

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
        getStatus: () => ({
            canUndo: settingsHistory.canUndo(),
            canRedo: settingsHistory.canRedo(),
            isAtDefault:
                defaultSettings !== null &&
                JSON.stringify(getAllSettings()) === JSON.stringify(defaultSettings),
        }),
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

    /**
     * Updates all history action availability states.
     *
     * @returns {void}
     */
    function updateHistoryControls() {
        historyController.updateControls();
    }

    /**
     * Applies a history snapshot without recording another entry.
     *
     * @param {Record<string, unknown>} settings - Snapshot to apply.
     * @returns {void}
     */
    function applyHistorySnapshot(settings) {
        loadAllSettings(settings);
        clearActiveSoundStarterCard();
        scheduleLastSessionSave();
        debouncedRenderStaticLoop();
        updateHistoryControls();
    }

    /**
     * Records the current serialized settings after a user-originated edit.
     *
     * @param {boolean} [coalesced=false] - Whether this belongs to a continuous input gesture.
     * @returns {boolean} Whether history changed.
     */
    function recordCurrentSettings(coalesced = false) {
        const changed = coalesced
            ? settingsHistory.recordCoalesced(getAllSettings())
            : settingsHistory.record(getAllSettings());
        if (changed) updateHistoryControls();
        return changed;
    }

    /**
     * Applies a settings replacement and records it as a single history action.
     *
     * @param {Record<string, unknown>} settings - Replacement settings.
     * @returns {{ok: boolean, settings?: import("./core/settings-contract.js").ArpeggiatorSettings, error?: unknown}}
     */
    function applySettingsWithHistory(settings, options = {}) {
        settingsHistory.endTransaction();
        const result = loadAllSettings(settings, options);
        if (!result.ok) return result;
        recordCurrentSettings();
        clearActiveSoundStarterCard();
        scheduleLastSessionSave();
        debouncedRenderStaticLoop();
        return result;
    }

    /**
     * Performs an undo action when history is available.
     *
     * @returns {void}
     */
    function undoSettings() {
        const settings = settingsHistory.undo();
        if (settings) applyHistorySnapshot(settings);
    }

    /**
     * Performs a redo action when history is available.
     *
     * @returns {void}
     */
    function redoSettings() {
        const settings = settingsHistory.redo();
        if (settings) applyHistorySnapshot(settings);
    }

    /**
     * Resets the entire serialized workspace to its captured defaults.
     *
     * @returns {void}
     */
    function resetAllSettings() {
        if (!defaultSettings) return;
        applySettingsWithHistory(defaultSettings);
        showToast("Restored default settings. Undo is available.", "info");
    }

    const patternControlsController = createPatternControlsController({
        dom: {
            notesInput,
            intervalSelect,
            gateSlider,
            gateValue,
            scaleQuantizeToggle,
            scaleTypeSelect,
            scaleRootSelect,
            octaveShiftButtons,
            octaveRangeButtons,
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
        onEstimatedDurationChange: updateEstimatedExportDuration,
        onStaticLoopChange: () => debouncedRenderStaticLoop(),
        onScaleQuantizeUiChange: updateScaleQuantizeUi,
        onScaleQuantizeTextChange: updateScaleQuantizeToggleText,
        debounce,
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

    /**
     * Applies the captured defaults for a logical settings group.
     *
     * @param {{name: string, keys: string[]}} definition - Resettable settings definition.
     * @returns {void}
     */
    function resetIndividualSettings(definition) {
        if (!defaultSettings) return;
        const next = { ...getAllSettings() };
        definition.keys.forEach((key) => {
            next[key] = defaultSettings[key];
        });
        applySettingsWithHistory(next);
        showToast(`Reset ${definition.name} to default.`, "info");
    }

    /**
     * Wires double-click and keyboard reset gestures without adding permanent controls.
     *
     * @returns {void}
     */
    function registerIndividualResetGestures() {
        resetDefinitions.forEach((definition) => {
            const hint = `Double-click to reset ${definition.name}. Press Escape while focused to reset.`;
            definition.targets.forEach((selector) => {
                const target = document.querySelector(selector);
                if (!target) return;
                target.setAttribute("title", hint);
                target.classList.add("resettable-setting-target");
                target.addEventListener("dblclick", (event) => {
                    event.preventDefault();
                    resetIndividualSettings(definition);
                });
            });
            definition.controls.forEach((control) => {
                if (!control) return;
                control.setAttribute("aria-description", hint);
            });
        });
    }

    /**
     * Finds the reset definition associated with the focused element.
     *
     * @param {Element | null} element - Focused element.
     * @returns {{name: string, keys: string[], controls: Element[]} | null} Matching definition.
     */
    function getFocusedResetDefinition(element) {
        if (!element) return null;
        return (
            resetDefinitions.find((definition) =>
                definition.controls.some(
                    (control) => control === element || control?.contains(element),
                ),
            ) || null
        );
    }

    /**
     * Updates the UI for the quantizer (enables/disables visual emphasis without locking dropdowns).
     * @returns {void}
     */
    function updateScaleQuantizeUi() {
        const isEnabled = scaleQuantizeToggle.checked && scaleTypeSelect.value !== "chromatic";
        if (isEnabled) {
            scaleRootSelect.classList.remove("opacity-50");
            scaleRootSelect.disabled = false;
        } else {
            scaleRootSelect.classList.add("opacity-50");
            scaleRootSelect.disabled = true;
        }
        scaleTypeSelect.disabled = false;
    }

    /**
     * Updates the quantizer toggle button label text and aria-checked attribute.
     * @returns {void}
     */
    function updateScaleQuantizeToggleText() {
        const isEnabled = scaleQuantizeToggle.checked && scaleTypeSelect.value !== "chromatic";
        scaleQuantizeToggle.setAttribute("aria-checked", isEnabled ? "true" : "false");
        if (isEnabled) {
            scaleQuantizeToggleStatus.textContent = "Enabled";
            scaleQuantizeToggleStatus.classList.remove("text-gray-400");
            scaleQuantizeToggleStatus.classList.add("text-green-400");
        } else {
            scaleQuantizeToggleStatus.textContent = "Disabled";
            scaleQuantizeToggleStatus.classList.remove("text-green-400");
            scaleQuantizeToggleStatus.classList.add("text-gray-400");
        }
    }

    setupKeyboardNavigation(patternButtons, "input[type='radio'], button.pattern-btn");
    setupKeyboardNavigation(waveformButtons, "button.waveform-btn");
    setupKeyboardNavigation(octaveShiftButtons, "input[type='radio'], button.octave-btn");
    setupKeyboardNavigation(octaveRangeButtons, "input[type='radio'], button.octave-btn");

    // ==================================================================
    //    Event Listeners
    // ==================================================================

    // --- Pattern Button Selection (Native change & Click delegation) ---
    patternButtons.addEventListener("change", (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        if (target && target.name === "pattern-direction") {
            setSelectedPatternDirection(target.value);
            createOrUpdatePattern();
        }
    });

    patternButtons.addEventListener("click", (e) => {
        const target = /** @type {Element} */ (e.target).closest(".pattern-btn, button, label");
        if (!target) return;
        const btn = target.classList.contains("pattern-btn")
            ? target
            : target.querySelector(".pattern-btn, [data-pattern]");
        if (btn) {
            const pattern = btn.getAttribute("data-pattern");
            if (pattern) {
                setSelectedPatternDirection(pattern);
                createOrUpdatePattern();
            }
        }
    });

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
        if (!isAudioContextStarted) {
            onboardingController.prepareForPlayback();
        }
        await startAudio();
        if (recorderManager && !recorderManager.isRecording) {
            await recorderManager.initRecorder();
        }
        createOrUpdatePattern();
        if (!isPlaying) {
            if (arpPattern) arpPattern.start();
            Tone.getTransport().start();
            if (playStopButton) {
                playStopButton.textContent = "Stop Audio";
                playStopButton.setAttribute("aria-label", "Press to stop arpeggio");
                playStopButton.classList.add("bg-yellow-600", "hover:bg-yellow-700");
                playStopButton.classList.remove("bg-blue-600", "hover:bg-blue-700");
            }
            isPlaying = true;
            if (visualizer) visualizer.startUiLoop();
        }
    }

    /**
     * Stops audio playback if currently running.
     * @returns {void}
     */
    function stopPlayback() {
        if (isPlaying) {
            Tone.getTransport().stop();
            if (arpPattern) arpPattern.stop();
            if (playStopButton) {
                playStopButton.textContent = "Restart Audio";
                playStopButton.setAttribute("aria-label", "Press to restart arpeggio");
                playStopButton.classList.remove("bg-yellow-600", "hover:bg-yellow-700");
                playStopButton.classList.add("bg-blue-600", "hover:bg-blue-700");
            }
            isPlaying = false;
            if (visualizer) visualizer.stopUiLoop();
            noteStepController.clear();
        }
    }

    /**
     * Keeps playback controls aligned with the browser AudioContext state.
     *
     * @returns {void}
     */
    function observeAudioContextState() {
        const rawAudioContext = Tone.getContext().rawContext;
        if (observedRawAudioContext === rawAudioContext) return;

        if (observedRawAudioContext && audioContextStateListener) {
            observedRawAudioContext.removeEventListener("statechange", audioContextStateListener);
        }

        audioContextStateListener = () => {
            if (Tone.getContext().state !== "running") {
                stopPlayback();
            }
        };
        observedRawAudioContext = rawAudioContext;
        rawAudioContext.addEventListener("statechange", audioContextStateListener);
    }

    const transportController = createTransportController({
        dom: { playStopButton, stickyTransportBar },
        windowRef: window,
        getIsPlaying: () => isPlaying,
        onStart: startPlayback,
        onStop: stopPlayback,
    });
    transportController.initialize();

    /**
     * Debounced wrapper to update the synth envelope.
     * @type {() => void}
     */
    const debouncedUpdateEnvelope = debounce(() => {
        audioEngine?.updateEnvelope();
    }, 16);

    // --- Randomize Notes ---
    randomizeNotesButton.addEventListener("click", () => {
        const isQuantized = scaleQuantizeToggle.checked && scaleTypeSelect.value !== "chromatic";
        let root = scaleRootSelect.value;
        let scaleType = scaleTypeSelect.value;

        // If scale quantization is disabled, pick a random root note without forcing quantization on
        if (!isQuantized) {
            const rootOptions = scaleRootSelect.options;
            root = rootOptions[Math.floor(Math.random() * rootOptions.length)].value;
            scaleRootSelect.value = root;
            scaleType = "chromatic";
        }

        const randomizedNotes = generateRandomNotes(root, scaleType);

        clearActiveSoundStarterCard();
        // Update the notes input field and trigger change events to refresh Tone.Pattern.
        notesInput.value = randomizedNotes.join(" ");
        notesInput.dispatchEvent(new Event("input", { bubbles: true }));
        notesInput.dispatchEvent(new Event("change", { bubbles: true }));

        const formattedScaleName =
            scaleType === "chromatic"
                ? `${root} Mode (Chromatic)`
                : `${root} ${scaleType.charAt(0).toUpperCase() + scaleType.slice(1)}`;
        showToast(`Randomized notes using ${formattedScaleName}!`, "success");
    });

    // --- Chord / Scale Builder Buttons ---
    const chordButtons = document.querySelectorAll(".chord-btn");
    chordButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const chordType = btn.getAttribute("data-chord") || "major";
            const root = scaleRootSelect?.value || "C";
            const chordNotesStr = buildChordString(chordType, root);
            const chordName = resolveChordDefinition(chordType).name;

            clearActiveSoundStarterCard();
            notesInput.value = chordNotesStr;
            notesInput.dispatchEvent(new Event("input", { bubbles: true }));
            notesInput.dispatchEvent(new Event("change", { bubbles: true }));

            showToast(`Loaded ${root} ${chordName} chord!`, "success");
        });
    });

    // --- Transport & Pattern ---

    /**
     * Debounced wrapper to set post gain volume.
     * @type {(db: number) => void}
     */
    const debouncedSetPostGain = debounce((/** @type {number} */ db) => {
        if (audioEngine) audioEngine.postGain.volume.value = db;
    }, 16);

    /**
     * Debounced wrapper to set BPM.
     * @type {(val: number) => void}
     */
    const debouncedSetBpm = debounce((/** @type {number} */ val) => {
        if (audioEngine) Tone.getTransport().bpm.value = val;
    }, 16);

    /**
     * Debounced wrapper to set swing.
     * @type {(val: number) => void}
     */
    const debouncedSetSwing = debounce((/** @type {number} */ val) => {
        if (audioEngine) Tone.getTransport().swing = val;
    }, 16);

    /**
     * Debounced wrapper to set harmonicity.
     * @type {(val: number) => void}
     */
    const debouncedSetHarmonicity = debounce((/** @type {number} */ val) => {
        if (audioEngine?.activeSynth && "harmonicity" in audioEngine.activeSynth) {
            audioEngine.activeSynth.harmonicity.value = val;
        }
    }, 16);

    /**
     * Debounced wrapper to set modulation index.
     * @type {(val: number) => void}
     */
    const debouncedSetModIndex = debounce((/** @type {number} */ val) => {
        if (audioEngine?.activeSynth && "modulationIndex" in audioEngine.activeSynth) {
            audioEngine.activeSynth.modulationIndex.value = val;
        }
    }, 16);

    /**
     * Debounced wrapper to set duty cycle.
     * @type {(val: number) => void}
     */
    const debouncedSetDuty = debounce((/** @type {number} */ val) => {
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
        if (audioEngine) audioEngine.filter.frequency.value = val;
    }, 16);

    /**
     * Debounced wrapper to set filter Q.
     * @type {(val: number) => void}
     */
    const debouncedSetFilterQ = debounce((/** @type {number} */ val) => {
        if (audioEngine) audioEngine.filter.Q.value = val;
    }, 16);

    /**
     * Debounced wrapper to set delay mix.
     * @type {(val: number) => void}
     */
    const debouncedSetDelayMix = debounce((/** @type {number} */ val) => {
        if (audioEngine) audioEngine.delay.wet.value = val;
    }, 16);

    /**
     * Debounced wrapper to set reverb mix.
     * @type {(val: number) => void}
     */
    const debouncedSetReverbMix = debounce((/** @type {number} */ val) => {
        if (audioEngine) audioEngine.reverb.wet.value = val;
    }, 16);

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
            audioEngine?.setSynth(type);
            createOrUpdatePattern();
        },
        onWaveformChange: (waveform) => {
            appState.currentWaveform = waveform;
            updateWaveformButtons(appState.currentWaveform);
            audioEngine?.setSynth(synthTypeSelect.value);
        },
        onEnvelopeChange: debouncedUpdateEnvelope,
        onHarmonicityChange: debouncedSetHarmonicity,
        onModIndexChange: debouncedSetModIndex,
        onDutyChange: debouncedSetDuty,
        onMonoCutoffChange: (value) => {
            if (
                audioEngine?.activeSynth &&
                "filterEnvelope" in audioEngine.activeSynth &&
                audioEngine.activeSynth.filterEnvelope
            ) {
                audioEngine.activeSynth.filterEnvelope.baseFrequency = value;
            }
        },
        onMonoOctavesChange: (value) => {
            if (
                audioEngine?.activeSynth &&
                "filterEnvelope" in audioEngine.activeSynth &&
                audioEngine.activeSynth.filterEnvelope
            ) {
                audioEngine.activeSynth.filterEnvelope.octaves = value;
            }
        },
        onMonoQChange: (value) => {
            if (
                audioEngine?.activeSynth &&
                "filter" in audioEngine.activeSynth &&
                audioEngine.activeSynth.filter
            ) {
                audioEngine.activeSynth.filter.Q.value = value;
            }
        },
        onDuoHarmonicityChange: (value) => {
            if (audioEngine?.activeSynth && "harmonicity" in audioEngine.activeSynth) {
                audioEngine.activeSynth.harmonicity.value = value;
            }
        },
        onDuoVibratoChange: (value) => {
            if (audioEngine?.activeSynth && "vibratoAmount" in audioEngine.activeSynth) {
                audioEngine.activeSynth.vibratoAmount.value = value;
            }
        },
        onPluckDampeningChange: (value) => {
            if (audioEngine?.activeSynth && "dampening" in audioEngine.activeSynth) {
                audioEngine.activeSynth.dampening = value;
            }
        },
        onPluckResonanceChange: (value) => {
            if (audioEngine?.activeSynth && "resonance" in audioEngine.activeSynth) {
                audioEngine.activeSynth.resonance = value;
            }
        },
        onPluckNoiseChange: (value) => {
            if (audioEngine?.activeSynth && "attackNoise" in audioEngine.activeSynth) {
                audioEngine.activeSynth.attackNoise = value;
            }
        },
        onMembranePitchDecayChange: (value) => {
            if (audioEngine?.activeSynth && "pitchDecay" in audioEngine.activeSynth) {
                audioEngine.activeSynth.pitchDecay = value;
            }
        },
        onMembraneOctavesChange: (value) => {
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
            if (audioEngine?.distortion) audioEngine.distortion.wet.value = value;
        },
        onChorusMixChange: (value) => {
            if (audioEngine?.chorus) audioEngine.chorus.wet.value = value;
        },
        onAutoPanMixChange: (value) => {
            if (audioEngine?.autoPanner) audioEngine.autoPanner.wet.value = value;
        },
        onDelayMixChange: debouncedSetDelayMix,
        onReverbMixChange: debouncedSetReverbMix,
    });
    effectsControlsController.initialize();

    bpmSlider.addEventListener("input", () => {
        bpmValue.textContent = bpmSlider.value;
        debouncedSetBpm(parseInt(bpmSlider.value, 10));
        updateEstimatedExportDuration();
    });

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

    swingSlider.addEventListener("input", () => {
        debouncedSetSwing(parseFloat(swingSlider.value));
        swingValue.textContent = parseFloat(swingSlider.value).toFixed(2);
    });

    // --- Recording Controls ---
    recordButton.addEventListener("click", async () => {
        try {
            await startAudio();
        } catch (error) {
            console.warn("AudioContext failed to start on record click:", error);
            return;
        }
        await recorderManager?.toggleRecording();
    });

    exportButton.addEventListener("click", async () => {
        try {
            await startAudio();
        } catch (error) {
            console.warn("AudioContext failed to start on recording export click:", error);
            return;
        }
        await recorderManager?.exportRealtime();
    });

    offlineExportButton.addEventListener("click", async () => {
        try {
            await startAudio();
        } catch (error) {
            console.warn("AudioContext failed to start on offline export click:", error);
            return;
        }
        await recorderManager?.exportOffline();
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
        visualizer?.toggle();
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

    function closeFuturePresetDialog() {
        pendingFuturePreset = null;
        futurePresetOverlay?.classList.add("hidden");
        futurePresetOverlay?.setAttribute("aria-hidden", "true");
    }

    function saveImportedPreset(settings, file) {
        presetStore
            .save(settings, { filename: file.name, name: file.name, source: "import" })
            .then((record) => refreshSavedPresetList(record.id))
            .catch((error) => {
                console.warn("Failed to save imported preset:", error);
                showBrowserStorageRecovery();
            });
    }

    futurePresetCancelButton?.addEventListener("click", closeFuturePresetDialog);
    futurePresetConfirmButton?.addEventListener("click", () => {
        if (!pendingFuturePreset) return;
        const pending = pendingFuturePreset;
        const result = applySettingsWithHistory(pending, { allowFutureVersion: true });
        closeFuturePresetDialog();
        if (result.ok) {
            const fileName =
                typeof pending.__importFileName === "string"
                    ? pending.__importFileName
                    : "Imported preset";
            saveImportedPreset(getAllSettings(), { name: fileName });
            showToast("Loaded compatible settings from newer preset.", "info");
        }
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
                    } else if (result.error instanceof UnsupportedSettingsVersionError) {
                        pendingFuturePreset = { ...settings, __importFileName: file.name };
                        futurePresetOverlay?.classList.remove("hidden");
                        futurePresetOverlay?.setAttribute("aria-hidden", "false");
                        futurePresetDialog?.focus();
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
                applySettingsWithHistory(record.settings || record);
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
        if (visualizer && visualizer.currentMode === "loopMap") {
            renderStaticLoop();
        }
    }, 150);

    patternControlsController.initialize();

    // --- Autosave (on any input/change/click) ---
    document.addEventListener("input", (event) => {
        const target = /** @type {Element} */ (event.target);
        if (target === presetNameInput) return;
        if (target.matches("input, select, textarea")) {
            recordCurrentSettings(true);
            clearActiveSoundStarterCard();
            scheduleLastSessionSave();
            if (
                target !== loopCountInput &&
                target !== offlineExportTailSecondsInput &&
                !target.matches("input[name='offline-export-mode']")
            ) {
                // Exclude export controls from debounced static-loop rendering.
                debouncedRenderStaticLoop();
            }
        }
    });

    document.addEventListener("change", (event) => {
        const target = /** @type {Element} */ (event.target);
        if (
            target === presetNameInput ||
            target === savedPresetSelect ||
            target === loadPresetInput
        )
            return;
        if (target.matches("input, select, textarea")) {
            settingsHistory.endTransaction();
            recordCurrentSettings();
            clearActiveSoundStarterCard();
            scheduleLastSessionSave();
            if (
                target !== loopCountInput &&
                target !== offlineExportTailSecondsInput &&
                !target.matches("input[name='offline-export-mode']")
            ) {
                // Exclude export controls from debounced static-loop rendering.
                debouncedRenderStaticLoop();
            }
        }
    });

    document.addEventListener("click", (event) => {
        const target = /** @type {Element} */ (event.target);
        if (
            target?.closest(
                ".pattern-btn, .waveform-btn, #octave-shift-buttons, #octave-range-buttons",
            )
        ) {
            recordCurrentSettings();
            clearActiveSoundStarterCard();
            scheduleLastSessionSave();
            debouncedRenderStaticLoop();
        }
    });

    // ==================================================================
    //    Initial Setup
    // ==================================================================

    loadAllSettings(DEFAULT_SETTINGS);
    keyboardToggle.checked = false;
    updateKeyboardControlUi();

    defaultSettings = getAllSettings();
    settingsHistory.initialize(defaultSettings);
    registerIndividualResetGestures();
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
