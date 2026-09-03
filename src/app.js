/**
 * Main Web Arpeggiator Application Module
 *
 * This module owns the shell: DOM wiring, transport control, preset/AI/test-hook
 * integration, and module initialization.  The heavy lifting (audio engine,
 * recorder/export, visualizer) has been split into separate modules.
 *
 * @module app
 */
import { downloadBlob } from "@core/audio-utils.js";
import { initializeKeyboardControls } from "@ui/keyboard-controller.js";
import { createMidiBlob, exportMidiFile } from "@core/midi-export.js";
import { formatEstimatedExportDuration, normalizeLoopCount } from "@core/export-duration.js";
import {
    calculateNoteMarkers,
    getArpeggioNotes as getArpeggioNotesFromModule,
    materializePatternSequence,
    normalizeNotesSequence,
} from "@core/pattern-core.js";
import { generateRandomNotes } from "@core/randomizer.js";
import { buildChordString, resolveChordDefinition } from "@core/chord-builder.js";
import { createSettingsManager } from "@storage/settings-manager.js";
import { createToastManager } from "@ui/ui-feedback.js";
import {
    PRESET_URL_KEYS,
    hasPresetChanges,
    parsePresetFromUrlParams,
    serializePresetToUrlParams,
} from "@core/url-preset.js";
import { filterNoteInput, filterNumericInput } from "@core/input-filters.js";
import { dbToPercent } from "@core/meter-utils.js";
import { setupKeyboardNavigation } from "@ui/a11y-navigation.js";
import { debounce, createSessionManager } from "@storage/session-manager.js";

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

// Attach filter functions to window for global inline event handlers / test assertions
window.filterNoteInput = filterNoteInput;
window.filterNumericInput = filterNumericInput;

// --- State (must be global for onclick) ---
var isAudioContextStarted = false;
let initializeAudioRuntime = null;
let audioStartPromise = null;
let audioModulesPromise = null;
let Tone;
let createAudioEngine;
let createOrUpdatePatternFromModule;
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
                ({ createOrUpdatePattern: createOrUpdatePatternFromModule } = patternModule);
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
                window.dispatchEvent(new CustomEvent("audioReady"));
            } catch (err) {
                console.error("AudioContext failed to start/resume:", err);
                window.dispatchEvent(new CustomEvent("audioFailed"));
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

    const playStopButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("play-stop")
    );

    /**
     * Fullscreen overlay for returning user audio activation.
     * @type {HTMLElement | null}
     */
    const startOverlay = document.getElementById("start-overlay");

    /**
     * Fullscreen overlay for first-visit quick start welcome modal.
     * @type {HTMLElement | null}
     */
    const quickStartOverlay = document.getElementById("quick-start-overlay");

    /**
     * Modal dialog element containing quick start onboarding choices.
     * @type {HTMLElement | null}
     */
    const quickStartModal = document.getElementById("quick-start-modal");

    /**
     * Grid container for dynamically rendered quick start preset cards.
     * @type {HTMLElement | null}
     */
    const quickStartPresetsGrid = document.getElementById("quick-start-presets-grid");

    /**
     * Button to start blank session without loading a preset.
     * @type {HTMLButtonElement | null}
     */
    const quickStartScratchButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("quick-start-scratch")
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

    const pwaTestStateField = document.getElementById("pwa-test-state");

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
    const loopCountInput = document.getElementById("loop-count");
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
    const loadPresetInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("load-preset-input")
    );

    // Toast
    const toastContainer = document.getElementById("toast-container");

    // --- State ---
    let isPlaying = false;
    let currentNotes = ["C4", "E4", "G4"];
    let arpPattern = null;
    let currentOctaveShift = 0;
    let currentOctaveRange = 2;
    let activeNote = null;
    let currentWaveform = "sine";
    let audioEngine;
    let pendingAudioEngine = null;
    let recorderManager;
    let visualizer;
    let audioRuntimePromise = null;
    let observedRawAudioContext = null;
    let audioContextStateListener = null;

    // Sync legacy window globals (needed by extracted modules)
    window.currentNotes = currentNotes;
    window.currentOctaveShift = currentOctaveShift;
    window.currentOctaveRange = currentOctaveRange;
    window.isPlaying = isPlaying;
    window.arpPattern = arpPattern;

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
            window.isPlaying = value;
        },
        get currentNotes() {
            return currentNotes;
        },
        set currentNotes(value) {
            currentNotes = value;
            window.currentNotes = value;
        },
        get currentOctaveShift() {
            return currentOctaveShift;
        },
        set currentOctaveShift(value) {
            currentOctaveShift = value;
            window.currentOctaveShift = value;
        },
        get currentOctaveRange() {
            return currentOctaveRange;
        },
        set currentOctaveRange(value) {
            currentOctaveRange = value;
            window.currentOctaveRange = value;
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
            window.currentWaveform = value;
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
     * Copies the app's live pattern state onto window so the extracted module
     * can continue to read the same values as the legacy implementation.
     * @returns {void}
     */
    function syncPatternModuleState() {
        // Sync local arpPattern from pattern generator before writing to window
        arpPattern = window.arpPattern;
        window.currentNotes = currentNotes;
        window.currentOctaveShift = currentOctaveShift;
        window.currentOctaveRange = currentOctaveRange;
        const availableAudioEngine = getAvailableAudioEngine();
        window.activeSynth = availableAudioEngine?.activeSynth || null;
        window.currentWaveform = availableAudioEngine
            ? availableAudioEngine.currentWaveform
            : currentWaveform;
        window.isPlaying = isPlaying;
        window.arpPattern = arpPattern;
    }

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
     * Delegates to pattern-generator's createOrUpdatePattern.
     * @returns {void}
     */
    function createOrUpdatePattern() {
        if (!getAvailableAudioEngine()) {
            rebuildNoteStepIndicator();
            updateEstimatedExportDuration();
            return;
        }
        createOrUpdatePatternFromModule();
        // Sync local arpPattern from the pattern generator's window.arpPattern
        arpPattern = window.arpPattern;
        // Rebuild the note step indicator pips to match the new note count
        rebuildNoteStepIndicator();
        updateEstimatedExportDuration();
    }

    /**
     * Writes key/value pairs onto the headless-test state object.
     * @param {object} updates - Key/value map to merge.
     * @returns {void}
     */
    function updateTestState(updates) {
        window.__WEB_ARP_TEST__ = window.__WEB_ARP_TEST__ || {};
        Object.assign(window.__WEB_ARP_TEST__, updates);
    }

    // ==================================================================
    //    Note Step Indicator
    // ==================================================================

    /**
     * Tracks the currently highlighted pip index for the step indicator.
     * @type {number}
     */
    let currentStepIndex = -1;

    /**
     * Cache array containing the note step indicator DOM element pips.
     * @type {HTMLElement[]}
     */
    let noteStepPips = [];

    /**
     * Rebuilds the step indicator pips to match the current base note count.
     * Call whenever notes or pattern settings change.
     * @returns {void}
     */
    function rebuildNoteStepIndicator() {
        if (!noteStepIndicator) return;
        const count = currentNotes.length;
        noteStepIndicator.innerHTML = "";
        noteStepPips = [];
        for (let i = 0; i < count; i++) {
            const pip = document.createElement("div");
            pip.className = "note-step-pip";
            pip.setAttribute("aria-label", currentNotes[i] || "");
            noteStepIndicator.appendChild(pip);
            noteStepPips.push(pip);
        }
        currentStepIndex = -1;
    }

    /**
     * Highlights the pip at the given index, removing the highlight from all others.
     * Intended to be called from the pattern callback on each note trigger.
     * Runs in O(1) time by leveraging the noteStepPips element cache.
     * @param {number} index - Zero-based index of the currently playing note.
     * @returns {void}
     */
    function highlightNoteStep(index) {
        if (!noteStepIndicator || noteStepPips.length === 0) return;

        // Remove active class from previous step
        if (currentStepIndex >= 0 && currentStepIndex < noteStepPips.length) {
            noteStepPips[currentStepIndex].classList.remove("active");
        }

        // Add active class to new step
        if (index >= 0 && index < noteStepPips.length) {
            noteStepPips[index].classList.add("active");
        }

        currentStepIndex = index;
    }

    // Expose for the pattern generator module (which runs in window scope)
    window.__WEB_ARP_STEP_HIGHLIGHT__ = highlightNoteStep;

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

    // --- Preset UI Helpers ---

    /**
     * Creates a human-readable display name from a preset record.
     * @param {object} record - Preset record from presets-store.
     * @returns {string} Display label.
     */
    function getPresetDisplayName(record) {
        const savedAt = record.savedAt ? new Date(record.savedAt) : null;
        const savedAtLabel =
            savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt.toLocaleString() : "unknown date";
        return `${record.name || record.filename || "Untitled"} (${savedAtLabel})`;
    }

    /**
     * Curated factory presets demonstrating synthesis modes and pattern possibilities.
     * @type {Array<{id: string, name: string, isFactory: boolean, settings: object}>}
     */
    const FACTORY_PRESETS = [
        {
            id: "factory-synthwave",
            name: "Classic Synthwave",
            emoji: "🌆",
            tagline: "Stranger Things, Kavinsky",
            accentGradient: "from-orange-500 to-pink-500",
            isFactory: true,
            settings: {
                bpm: 128,
                swing: 0,
                baseNotes: ["C4", "E4", "G4", "B4"],
                direction: "up",
                interval: "16n",
                octaveShift: 0,
                octaveRange: 2,
                scaleQuantize: true,
                scaleRoot: "C",
                scaleType: "major",
                synthType: "synth",
                waveform: "sawtooth",
                envAttack: 0.01,
                envDecay: 0.2,
                envSustain: 0.4,
                envRelease: 0.4,
                filterCutoff: 4500,
                filterResonance: 2,
                delayMix: 0.25,
                reverbMix: 0.35,
                loopCount: 4,
            },
        },
        {
            id: "factory-ambient",
            name: "Ambient Dreamscape",
            emoji: "✨",
            tagline: "Brian Eno, atmospheric pads",
            accentGradient: "from-teal-400 to-indigo-500",
            isFactory: true,
            settings: {
                bpm: 85,
                swing: 0.1,
                baseNotes: ["C4", "G4", "C5", "D5"],
                direction: "upDown",
                interval: "8n",
                octaveShift: 0,
                octaveRange: 2,
                scaleQuantize: true,
                scaleRoot: "C",
                scaleType: "lydian",
                synthType: "fmSynth",
                waveform: "sine",
                harmonicity: 2.0,
                modulationIndex: 5.0,
                envAttack: 0.1,
                envDecay: 0.6,
                envSustain: 0.7,
                envRelease: 1.2,
                filterCutoff: 3000,
                filterResonance: 1.5,
                delayMix: 0.45,
                reverbMix: 0.65,
                loopCount: 4,
            },
        },
        {
            id: "factory-cyberpunk",
            name: "Cyberpunk Bassline",
            emoji: "⚡",
            tagline: "Dark synth, driving bass",
            accentGradient: "from-yellow-400 to-red-500",
            isFactory: true,
            settings: {
                bpm: 140,
                swing: 0,
                baseNotes: ["C2", "C3", "D#2", "G2"],
                direction: "octaveCycle",
                interval: "16n",
                octaveShift: -1,
                octaveRange: 1,
                scaleQuantize: true,
                scaleRoot: "C",
                scaleType: "minor",
                synthType: "monoSynth",
                waveform: "sawtooth",
                monoCutoff: 1200,
                monoOctaves: 3,
                monoQ: 4,
                driveMix: 0.4,
                envAttack: 0.005,
                envDecay: 0.15,
                envSustain: 0.1,
                envRelease: 0.2,
                filterCutoff: 2200,
                filterResonance: 4.0,
                delayMix: 0.15,
                reverbMix: 0.2,
                loopCount: 4,
            },
        },
        {
            id: "factory-harp",
            name: "Plucked Acoustic Harp",
            emoji: "🪕",
            tagline: "Organic, delicate strings",
            accentGradient: "from-amber-400 to-emerald-500",
            isFactory: true,
            settings: {
                bpm: 110,
                swing: 0.05,
                baseNotes: ["D4", "F#4", "A4", "C#5"],
                direction: "randomWalk",
                interval: "16n",
                octaveShift: 0,
                octaveRange: 2,
                scaleQuantize: true,
                scaleRoot: "D",
                scaleType: "major",
                synthType: "pluckSynth",
                waveform: "sine",
                pluckDampening: 5000,
                pluckResonance: 0.95,
                envAttack: 0.001,
                envDecay: 0.5,
                envSustain: 0.0,
                envRelease: 0.8,
                filterCutoff: 6000,
                filterResonance: 1.0,
                delayMix: 0.2,
                reverbMix: 0.5,
                loopCount: 4,
            },
        },
        {
            id: "factory-chiptune",
            name: "Chiptune Nostalgia",
            emoji: "🕹️",
            tagline: "8-bit NES, arcade arps",
            accentGradient: "from-cyan-400 to-blue-600",
            isFactory: true,
            settings: {
                bpm: 150,
                swing: 0,
                baseNotes: ["C4", "E4", "G4", "C5"],
                direction: "upDownRepeat",
                interval: "32n",
                octaveShift: 0,
                octaveRange: 2,
                scaleQuantize: true,
                scaleRoot: "C",
                scaleType: "majorPentatonic",
                synthType: "synth",
                waveform: "square",
                dutyCycle: 0.5,
                envAttack: 0.001,
                envDecay: 0.08,
                envSustain: 0.2,
                envRelease: 0.05,
                filterCutoff: 8000,
                filterResonance: 0.5,
                delayMix: 0.1,
                reverbMix: 0.15,
                loopCount: 4,
            },
        },
        {
            id: "factory-neosoul",
            name: "Jazzy Neo-Soul",
            emoji: "🎹",
            tagline: "Warm chorus, mellow chords",
            accentGradient: "from-purple-400 to-pink-600",
            isFactory: true,
            settings: {
                bpm: 92,
                swing: 0.35,
                baseNotes: ["D4", "F4", "A4", "C5", "E5"],
                direction: "up",
                interval: "8n",
                octaveShift: 0,
                octaveRange: 2,
                scaleQuantize: true,
                scaleRoot: "D",
                scaleType: "dorian",
                synthType: "duoSynth",
                waveform: "sine",
                duoHarm: 1.5,
                duoVibrato: 0.3,
                chorusMix: 0.3,
                envAttack: 0.02,
                envDecay: 0.3,
                envSustain: 0.5,
                envRelease: 0.6,
                filterCutoff: 3800,
                filterResonance: 1.8,
                delayMix: 0.25,
                reverbMix: 0.4,
                loopCount: 4,
            },
        },
    ];

    /**
     * Rebuilds the saved-preset <select> from factory presets and IndexedDB.
     * @param {string} [selectedId=''] - The preset id to select after refresh.
     * @returns {Promise<void>}
     */
    async function refreshSavedPresetList(selectedId) {
        if (selectedId === undefined) selectedId = savedPresetSelect?.value || "";
        if (!savedPresetSelect) return;
        try {
            const records = window.WebArpPresetStore ? await window.WebArpPresetStore.list() : [];
            savedPresetSelect.innerHTML = "";

            // 1. Factory Presets group
            const factoryGroup = document.createElement("optgroup");
            factoryGroup.label = "Factory Presets";
            FACTORY_PRESETS.forEach((preset) => {
                const option = document.createElement("option");
                option.value = preset.id;
                option.textContent = preset.name;
                factoryGroup.appendChild(option);
            });
            savedPresetSelect.appendChild(factoryGroup);

            // 2. User Presets group
            const userGroup = document.createElement("optgroup");
            userGroup.label = "User Presets";
            if (records.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.disabled = true;
                option.textContent = "— No saved user presets —";
                userGroup.appendChild(option);
            } else {
                records.forEach((record) => {
                    const option = document.createElement("option");
                    option.value = record.id;
                    option.textContent = getPresetDisplayName(record);
                    userGroup.appendChild(option);
                });
            }
            savedPresetSelect.appendChild(userGroup);

            // Try to re-select the previously selected id
            if (selectedId && [...savedPresetSelect.options].some((o) => o.value === selectedId)) {
                savedPresetSelect.value = selectedId;
            }
        } catch (error) {
            console.warn("Failed to refresh saved preset list:", error);
        }
    }

    // ------------------------------------------------------------------
    // Session Manager — Auto-save and workspace restoration
    // ------------------------------------------------------------------

    const sessionManager = createSessionManager({
        getPresetStore: () => window.WebArpPresetStore,
        getSettings: () => getAllSettings(),
        onRestore: (settings) => {
            loadAllSettings(settings);
            if (getSelectedPatternDirection()) {
                setSelectedPatternDirection(getSelectedPatternDirection());
            } else {
                setSelectedPatternDirection("up");
            }
        },
        updateTestState,
    });

    const saveLastSessionNow = () => sessionManager.saveNow();
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
            getTransport: () => (getAvailableAudioEngine() ? Tone.getTransport() : null),
            updateButtonGroup,
            syncPatternModuleState,
            createOrUpdatePattern,
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
                        actions: {
                            syncPatternModuleState,
                            showToast: (msg, type) => showToast(msg, type),
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
                    loadAllSettings(getAllSettings());
                    syncPatternModuleState();

                    audioEngine = nextAudioEngine;
                    visualizer = nextVisualizer;
                    recorderManager = nextRecorderManager;
                    pendingAudioEngine = null;
                    window.audioEngine = audioEngine;
                    observeAudioContextState();
                } catch (error) {
                    nextVisualizer?.destroy();
                    nextAudioEngine?.dispose();
                    try {
                        arpPattern?.dispose();
                    } catch (cleanupError) {
                        console.warn("Failed to dispose a partial arpeggio pattern:", cleanupError);
                    }
                    audioEngine = undefined;
                    pendingAudioEngine = null;
                    visualizer = undefined;
                    recorderManager = undefined;
                    delete window.audioEngine;
                    arpPattern = null;
                    window.arpPattern = null;
                    window.activeSynth = null;
                    window.currentWaveform = currentWaveform;
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
     * Updates button group selection state by setting the selected class on elements
     * and checking the corresponding radio input.
     * @param {HTMLElement} container - The container element holding the buttons or radio inputs.
     * @param {string|number} selectedValue - The value matching the data attribute or radio value.
     * @param {string} dataAttribute - e.g. 'data-shift', 'data-range'.
     * @returns {void}
     */
    function updateButtonGroup(container, selectedValue, dataAttribute) {
        const radio = container.querySelector(
            `input[type="radio"][${dataAttribute}="${selectedValue}"], input[type="radio"][value="${selectedValue}"]`,
        );
        if (radio) {
            /** @type {HTMLInputElement} */ (radio).checked = true;
        }

        container.querySelectorAll(".octave-btn, button").forEach((btn) => {
            btn.classList.remove("selected");
            const btnVal = btn.getAttribute(dataAttribute);
            if (btnVal !== null) {
                const numVal = parseInt(btnVal, 10);
                if (numVal === selectedValue) {
                    btn.classList.add("selected");
                }
            }
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
        });
    }

    /**
     * Tracks the last selected non-chromatic scale type so it can be restored when re-enabling.
     * @type {string}
     */
    let lastActiveScaleType = "major";

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
     * and registers the URL on the global test hook for automated verification.
     * @returns {void}
     */
    function sharePresetAsUrl() {
        const settings = getAllSettings();
        const params = serializePresetToUrlParams(settings);
        const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

        // Test Hook: register the last shared URL
        if (!window.__WEB_ARP_TEST__) {
            window.__WEB_ARP_TEST__ = {};
        }
        window.__WEB_ARP_TEST__.lastSharedUrl = shareUrl;

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

        clearActiveSoundStarterCard();
        loadAllSettings(settings);
        showToast("Preset loaded from URL link!", "success");
    }

    // --- Sound Starters ---

    /**
     * Highlights a specific Sound Starter card by preset ID, or clears all active cards if null.
     *
     * @param {string | null} [presetId=null] - The factory preset ID to mark active, or null to clear.
     * @returns {void}
     */
    function setActiveSoundStarterCard(presetId = null) {
        if (!soundStartersGrid) return;
        const cards = soundStartersGrid.querySelectorAll(".sound-starter-card");
        cards.forEach((card) => {
            const isTarget = Boolean(presetId && card.getAttribute("data-preset-id") === presetId);
            if (isTarget) {
                card.classList.add("active");
                card.setAttribute("aria-pressed", "true");
            } else {
                card.classList.remove("active");
                card.setAttribute("aria-pressed", "false");
            }
        });
    }

    /**
     * Clears the active highlight state from all Sound Starter preset cards.
     *
     * @returns {void}
     */
    function clearActiveSoundStarterCard() {
        setActiveSoundStarterCard(null);
    }

    /**
     * Dynamically builds the Sound Starters factory presets card strip and wires interactions.
     *
     * @returns {void}
     */
    function buildSoundStartersStrip() {
        if (!soundStartersGrid) return;
        soundStartersGrid.innerHTML = "";

        FACTORY_PRESETS.forEach((preset) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "sound-starter-card p-2.5 focus-visible:outline-none";
            card.setAttribute("data-preset-id", preset.id);
            card.setAttribute("aria-pressed", "false");
            card.setAttribute(
                "aria-label",
                `Load ${preset.name} preset, ${preset.settings.bpm} BPM`,
            );

            const accentBar = document.createElement("div");
            accentBar.className = `sound-starter-accent bg-gradient-to-r ${preset.accentGradient || "from-blue-500 to-indigo-500"} mb-2 rounded-full`;

            const topRow = document.createElement("div");
            topRow.className = "flex items-center justify-between gap-1 mb-1";

            const emojiSpan = document.createElement("span");
            emojiSpan.className = "text-xl shrink-0";
            emojiSpan.textContent = preset.emoji || "🎵";

            const bpmSpan = document.createElement("span");
            bpmSpan.className =
                "text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-gray-900/60 text-gray-300 shrink-0";
            bpmSpan.textContent = `${preset.settings.bpm} BPM`;

            topRow.appendChild(emojiSpan);
            topRow.appendChild(bpmSpan);

            const title = document.createElement("div");
            title.className = "text-xs font-semibold text-gray-100 truncate mb-0.5";
            title.textContent = preset.name;

            const tagline = document.createElement("div");
            tagline.className = "text-[10px] text-gray-400 line-clamp-2 leading-tight";
            tagline.textContent = preset.tagline || "";

            card.appendChild(accentBar);
            card.appendChild(topRow);
            card.appendChild(title);
            card.appendChild(tagline);

            card.addEventListener("click", async () => {
                loadAllSettings(preset.settings);
                if (presetNameInput) {
                    presetNameInput.value = preset.name;
                }
                if (savedPresetSelect) {
                    savedPresetSelect.value = preset.id;
                }
                setActiveSoundStarterCard(preset.id);
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
            });

            soundStartersGrid.appendChild(card);
        });

        if (soundStartersDetails) {
            try {
                const storedOpen = localStorage.getItem("soundStartersOpen");
                if (storedOpen === "false") {
                    soundStartersDetails.removeAttribute("open");
                } else if (storedOpen === "true") {
                    soundStartersDetails.setAttribute("open", "");
                }
            } catch (err) {
                console.warn("Could not read soundStartersOpen from localStorage:", err);
            }

            soundStartersDetails.addEventListener("toggle", () => {
                try {
                    localStorage.setItem("soundStartersOpen", String(soundStartersDetails.open));
                } catch (err) {
                    console.warn("Could not write soundStartersOpen to localStorage:", err);
                }
            });
        }
    }

    // --- Sound Starters & Quick Start Onboarding ---

    /**
     * Storage key used to track if the user has previously completed first-time onboarding.
     * @type {string}
     */
    const FIRST_VISIT_KEY = "webArpHasVisited";

    /**
     * Checks whether the current session is considered a first-time visitor flow.
     * Returns false if URL search contains recognized preset parameters.
     *
     * @returns {boolean} True if this is a first-time visitor without URL preset params.
     */
    function isFirstVisit() {
        try {
            const params = new URLSearchParams(window.location.search);
            const hasUrlPreset = Array.from(params.keys()).some((key) => PRESET_URL_KEYS.has(key));
            if (hasUrlPreset) return false;
            return localStorage.getItem(FIRST_VISIT_KEY) !== "true";
        } catch {
            return false;
        }
    }

    /**
     * Marks the first-time onboarding flow as completed in localStorage.
     *
     * @returns {void}
     */
    function markVisited() {
        try {
            localStorage.setItem(FIRST_VISIT_KEY, "true");
        } catch (err) {
            console.warn("Storage access restricted:", err);
        }
    }

    /**
     * Enables the primary Play/Stop button and sets its active visual styling.
     *
     * @returns {void}
     */
    function enablePlayStopButton() {
        if (playStopButton) {
            playStopButton.disabled = false;
            playStopButton.textContent = "Start Audio";
            playStopButton.setAttribute("aria-label", "Press to play arpeggio");
            playStopButton.classList.remove("opacity-50", "cursor-not-allowed", "bg-gray-600");
            playStopButton.classList.add("bg-blue-600", "hover:bg-blue-700");
        }
    }

    /**
     * Dynamically builds the Quick Start preset cards inside the welcome modal.
     *
     * @returns {void}
     */
    function buildQuickStartPresetCards() {
        if (!quickStartPresetsGrid) return;
        quickStartPresetsGrid.innerHTML = "";

        FACTORY_PRESETS.forEach((preset) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className =
                "sound-starter-card p-3 focus-visible:outline-none flex flex-col justify-between text-left";
            card.setAttribute("data-preset-id", preset.id);
            card.setAttribute(
                "aria-label",
                `Start with ${preset.name} preset, ${preset.settings.bpm} BPM`,
            );

            const accentBar = document.createElement("div");
            accentBar.className = `sound-starter-accent bg-gradient-to-r ${preset.accentGradient || "from-blue-500 to-indigo-500"} mb-2 rounded-full`;

            const topRow = document.createElement("div");
            topRow.className = "flex items-center justify-between gap-1 mb-1";

            const emojiSpan = document.createElement("span");
            emojiSpan.className = "text-2xl shrink-0";
            emojiSpan.textContent = preset.emoji || "🎵";

            const bpmSpan = document.createElement("span");
            bpmSpan.className =
                "text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-gray-900/60 text-gray-300 shrink-0";
            bpmSpan.textContent = `${preset.settings.bpm} BPM`;

            topRow.appendChild(emojiSpan);
            topRow.appendChild(bpmSpan);

            const title = document.createElement("div");
            title.className = "text-xs font-semibold text-gray-100 truncate";
            title.textContent = preset.name;

            card.appendChild(accentBar);
            card.appendChild(topRow);
            card.appendChild(title);

            card.addEventListener("click", () => handleQuickStartPresetClick(preset));

            quickStartPresetsGrid.appendChild(card);
        });
    }

    /**
     * Opens the Quick Start onboarding modal dialog and makes the background application content inert.
     *
     * @returns {void}
     */
    function openQuickStartModal() {
        if (!quickStartOverlay) return;
        quickStartOverlay.style.display = "flex";
        if (appMain) {
            appMain.setAttribute("inert", "");
        }
        buildQuickStartPresetCards();
        const firstPresetBtn =
            quickStartPresetsGrid?.querySelector("button") || quickStartScratchButton;
        if (firstPresetBtn) {
            firstPresetBtn.focus();
        }
    }

    /**
     * Closes the Quick Start onboarding modal dialog and restores background interactivity.
     *
     * @returns {void}
     */
    function closeQuickStartModal() {
        if (quickStartOverlay) {
            quickStartOverlay.style.display = "none";
        }
        if (appMain) {
            appMain.removeAttribute("inert");
        }
    }

    /**
     * Handles selecting a factory preset from the Quick Start onboarding dialog.
     *
     * @param {object} preset - The selected factory preset definition.
     * @returns {Promise<void>}
     */
    async function handleQuickStartPresetClick(preset) {
        closeQuickStartModal();
        enablePlayStopButton();
        markVisited();
        loadAllSettings(preset.settings);
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
        } catch (err) {
            console.warn("AudioContext failed to start on quick start click:", err);
        }
        scheduleLastSessionSave();
    }

    /**
     * Handles clicking "Start from Scratch" or dismissing the Quick Start onboarding dialog.
     *
     * @returns {Promise<void>}
     */
    async function handleStartFromScratch() {
        closeQuickStartModal();
        if (soundStartersDetails) {
            soundStartersDetails.removeAttribute("open");
            try {
                localStorage.setItem("soundStartersOpen", "false");
            } catch (err) {
                console.warn("Could not write soundStartersOpen to localStorage:", err);
            }
        }
        enablePlayStopButton();
        markVisited();
        try {
            await startAudio();
            loadPresetFromUrl();
        } catch (err) {
            console.warn("AudioContext failed to start on scratch click:", err);
        }
    }

    /**
     * Handles clicks on the standard start overlay to initialize the AudioContext.
     *
     * @returns {Promise<void>}
     */
    const handleStartOverlayClick = async () => {
        if (startOverlay) {
            startOverlay.style.display = "none";
        }
        enablePlayStopButton();
        try {
            await startAudio();
            loadPresetFromUrl();
        } catch (err) {
            console.warn("AudioContext failed to start on overlay click:", err);
        }
    };

    /**
     * Starts audio playback if not already running.
     * @returns {Promise<void>}
     */
    async function startPlayback() {
        if (!isAudioContextStarted) {
            if (startOverlay) {
                startOverlay.style.display = "none";
            }
            closeQuickStartModal();
            enablePlayStopButton();
            markVisited();
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
            syncPatternModuleState();
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
            syncPatternModuleState();
            if (visualizer) visualizer.stopUiLoop();
            noteStepPips.forEach((p) => {
                p.classList.remove("active");
            });
            currentStepIndex = -1;
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

    // --- Transport: Play / Stop ---
    playStopButton.addEventListener("click", async () => {
        if (isPlaying) {
            stopPlayback();
        } else {
            try {
                await startPlayback();
            } catch (error) {
                console.warn("AudioContext failed to start from play button:", error);
            }
        }
    });

    /**
     * Debounced wrapper to update the synth envelope.
     * @type {() => void}
     */
    const debouncedUpdateEnvelope = debounce(() => {
        audioEngine?.updateEnvelope();
    }, 16);

    // --- ADSR Listeners ---
    envAttackSlider.addEventListener("input", () => {
        envAttackValue.textContent = parseFloat(envAttackSlider.value).toFixed(2);
        debouncedUpdateEnvelope();
    });
    envDecaySlider.addEventListener("input", () => {
        envDecayValue.textContent = parseFloat(envDecaySlider.value).toFixed(2);
        debouncedUpdateEnvelope();
    });
    envSustainSlider.addEventListener("input", () => {
        envSustainValue.textContent = parseFloat(envSustainSlider.value).toFixed(2);
        debouncedUpdateEnvelope();
    });
    envReleaseSlider.addEventListener("input", () => {
        envReleaseValue.textContent = parseFloat(envReleaseSlider.value).toFixed(2);
        debouncedUpdateEnvelope();
    });

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
     * Debounced wrapper to create or update pattern at 50ms.
     * @type {() => void}
     */
    const debouncedCreateOrUpdatePattern50 = debounce(() => {
        createOrUpdatePattern();
    }, 50);

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

    postGainSlider.addEventListener("input", () => {
        const db = parseFloat(postGainSlider.value);
        debouncedSetPostGain(db);
        postGainValue.textContent = String(dbToPercent(db));
    });

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

    swingSlider.addEventListener("input", () => {
        debouncedSetSwing(parseFloat(swingSlider.value));
        swingValue.textContent = parseFloat(swingSlider.value).toFixed(2);
    });

    notesInput.addEventListener("change", () => {
        const raw = notesInput.value.trim().split(/\s+/).filter(Boolean);
        const normalized = normalizeNotesSequence(raw);
        if (normalized.length > 0) {
            notesInput.value = normalized.join(" ");
            currentNotes = normalized;
        } else {
            currentNotes = raw.length ? raw : ["C4"];
        }
        syncPatternModuleState();
        createOrUpdatePattern();
    });
    notesInput.addEventListener("input", () => {
        currentNotes = notesInput.value.trim().split(/\s+/).filter(Boolean);
        if (currentNotes.length === 0) currentNotes = ["C4"];
        syncPatternModuleState();
        updateEstimatedExportDuration();
    });

    scaleQuantizeToggle.addEventListener("change", () => {
        if (scaleQuantizeToggle.checked) {
            if (scaleTypeSelect.value === "chromatic") {
                scaleTypeSelect.value = lastActiveScaleType || "major";
            }
        } else {
            if (scaleTypeSelect.value !== "chromatic") {
                lastActiveScaleType = scaleTypeSelect.value;
            }
            scaleTypeSelect.value = "chromatic";
        }
        updateScaleQuantizeUi();
        updateScaleQuantizeToggleText();
        createOrUpdatePattern();
    });

    scaleTypeSelect.addEventListener("change", () => {
        if (scaleTypeSelect.value === "chromatic") {
            scaleQuantizeToggle.checked = false;
        } else {
            scaleQuantizeToggle.checked = true;
            lastActiveScaleType = scaleTypeSelect.value;
        }
        updateScaleQuantizeUi();
        updateScaleQuantizeToggleText();
        createOrUpdatePattern();
    });

    scaleRootSelect.addEventListener("change", createOrUpdatePattern);

    intervalSelect.addEventListener("change", createOrUpdatePattern);

    // --- Synth & Effects ---
    synthTypeSelect.addEventListener("change", () => {
        audioEngine?.setSynth(synthTypeSelect.value);
        createOrUpdatePattern();
    });

    waveformButtons.addEventListener("click", (e) => {
        const btn = /** @type {Element} */ (e.target).closest("button.waveform-btn");
        if (!btn) return;

        appState.currentWaveform = btn.getAttribute("data-wave") || "sine";
        updateWaveformButtons(appState.currentWaveform);
        audioEngine?.setSynth(synthTypeSelect.value);
    });

    harmonicitySlider.addEventListener("input", () => {
        const val = parseFloat(harmonicitySlider.value);
        debouncedSetHarmonicity(val);
        harmonicityValue.textContent = val.toFixed(1);
    });

    modIndexSlider.addEventListener("input", () => {
        const val = parseFloat(modIndexSlider.value);
        debouncedSetModIndex(val);
        modIndexValue.textContent = val.toFixed(1);
    });

    // --- Duty Cycle ---
    dutySlider.addEventListener("input", () => {
        const val = parseFloat(dutySlider.value);
        dutyValue.textContent = val.toFixed(2);
        debouncedSetDuty(val);
    });

    // --- Octave Controls (Native change events & Click delegation) ---
    octaveShiftButtons.addEventListener("change", (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        if (target && target.value !== undefined) {
            currentOctaveShift = parseInt(target.value, 10) || 0;
            syncPatternModuleState();
            updateButtonGroup(octaveShiftButtons, currentOctaveShift, "data-shift");
            createOrUpdatePattern();
            debouncedRenderStaticLoop();
        }
    });

    octaveShiftButtons.addEventListener("click", (e) => {
        const target = /** @type {Element} */ (e.target).closest("button, label");
        if (!target) return;
        const btn = target.tagName === "BUTTON" ? target : target.querySelector("[data-shift]");
        if (btn) {
            const shiftVal = btn.getAttribute("data-shift");
            if (shiftVal !== null) {
                currentOctaveShift = parseInt(shiftVal, 10);
                syncPatternModuleState();
                updateButtonGroup(octaveShiftButtons, currentOctaveShift, "data-shift");
                createOrUpdatePattern();
                debouncedRenderStaticLoop();
            }
        }
    });

    octaveRangeButtons.addEventListener("change", (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        if (target && target.value !== undefined) {
            currentOctaveRange = parseInt(target.value, 10) || 1;
            syncPatternModuleState();
            updateButtonGroup(octaveRangeButtons, currentOctaveRange, "data-range");
            createOrUpdatePattern();
            debouncedRenderStaticLoop();
        }
    });

    octaveRangeButtons.addEventListener("click", (e) => {
        const target = /** @type {Element} */ (e.target).closest("button, label");
        if (!target) return;
        const btn = target.tagName === "BUTTON" ? target : target.querySelector("[data-range]");
        if (btn) {
            const rangeVal = btn.getAttribute("data-range");
            if (rangeVal !== null) {
                currentOctaveRange = parseInt(rangeVal, 10);
                syncPatternModuleState();
                updateButtonGroup(octaveRangeButtons, currentOctaveRange, "data-range");
                createOrUpdatePattern();
                debouncedRenderStaticLoop();
            }
        }
    });

    // --- Gate ---
    gateSlider.addEventListener("input", () => {
        gateValue.textContent = parseFloat(gateSlider.value).toFixed(2);
        debouncedCreateOrUpdatePattern50();
    });

    // --- Filter ---
    filterCutoffSlider.addEventListener("input", () => {
        const freq = parseFloat(filterCutoffSlider.value);
        debouncedSetFilterCutoff(freq);
        filterCutoffValue.textContent = freq.toFixed(0);
    });
    filterResonanceSlider.addEventListener("input", () => {
        const res = parseFloat(filterResonanceSlider.value);
        debouncedSetFilterQ(res);
        filterResonanceValue.textContent = res.toFixed(1);
    });

    // --- MonoSynth Controls ---
    if (monoCutoffSlider) {
        monoCutoffSlider.addEventListener("input", () => {
            const val = parseFloat(monoCutoffSlider.value);
            if (monoCutoffValue) monoCutoffValue.textContent = val.toFixed(0);
            if (
                audioEngine?.activeSynth &&
                "filterEnvelope" in audioEngine.activeSynth &&
                audioEngine.activeSynth.filterEnvelope
            ) {
                audioEngine.activeSynth.filterEnvelope.baseFrequency = val;
            }
        });
    }
    if (monoOctavesSlider) {
        monoOctavesSlider.addEventListener("input", () => {
            const val = parseFloat(monoOctavesSlider.value);
            if (monoOctavesValue) monoOctavesValue.textContent = val.toFixed(1);
            if (
                audioEngine?.activeSynth &&
                "filterEnvelope" in audioEngine.activeSynth &&
                audioEngine.activeSynth.filterEnvelope
            ) {
                audioEngine.activeSynth.filterEnvelope.octaves = val;
            }
        });
    }
    if (monoQSlider) {
        monoQSlider.addEventListener("input", () => {
            const val = parseFloat(monoQSlider.value);
            if (monoQValue) monoQValue.textContent = val.toFixed(1);
            if (
                audioEngine?.activeSynth &&
                "filter" in audioEngine.activeSynth &&
                audioEngine.activeSynth.filter
            ) {
                audioEngine.activeSynth.filter.Q.value = val;
            }
        });
    }

    // --- DuoSynth Controls ---
    if (duoHarmSlider) {
        duoHarmSlider.addEventListener("input", () => {
            const val = parseFloat(duoHarmSlider.value);
            if (duoHarmValue) duoHarmValue.textContent = val.toFixed(2);
            if (audioEngine?.activeSynth && "harmonicity" in audioEngine.activeSynth) {
                audioEngine.activeSynth.harmonicity.value = val;
            }
        });
    }
    if (duoVibratoSlider) {
        duoVibratoSlider.addEventListener("input", () => {
            const val = parseFloat(duoVibratoSlider.value);
            if (duoVibratoValue) duoVibratoValue.textContent = val.toFixed(2);
            if (audioEngine?.activeSynth && "vibratoAmount" in audioEngine.activeSynth) {
                audioEngine.activeSynth.vibratoAmount.value = val;
            }
        });
    }

    // --- PluckSynth Controls ---
    if (pluckDampeningSlider) {
        pluckDampeningSlider.addEventListener("input", () => {
            const val = parseFloat(pluckDampeningSlider.value);
            if (pluckDampeningValue) pluckDampeningValue.textContent = val.toFixed(0);
            if (audioEngine?.activeSynth && "dampening" in audioEngine.activeSynth) {
                audioEngine.activeSynth.dampening = val;
            }
        });
    }
    if (pluckResonanceSlider) {
        pluckResonanceSlider.addEventListener("input", () => {
            const val = parseFloat(pluckResonanceSlider.value);
            if (pluckResonanceValue) pluckResonanceValue.textContent = val.toFixed(2);
            if (audioEngine?.activeSynth && "resonance" in audioEngine.activeSynth) {
                audioEngine.activeSynth.resonance = val;
            }
        });
    }
    if (pluckNoiseSlider) {
        pluckNoiseSlider.addEventListener("input", () => {
            const val = parseFloat(pluckNoiseSlider.value);
            if (pluckNoiseValue) pluckNoiseValue.textContent = val.toFixed(1);
            if (audioEngine?.activeSynth && "attackNoise" in audioEngine.activeSynth) {
                audioEngine.activeSynth.attackNoise = val;
            }
        });
    }

    // --- MembraneSynth Controls ---
    if (membranePitchDecaySlider) {
        membranePitchDecaySlider.addEventListener("input", () => {
            const val = parseFloat(membranePitchDecaySlider.value);
            if (membranePitchDecayValue) membranePitchDecayValue.textContent = val.toFixed(3);
            if (audioEngine?.activeSynth && "pitchDecay" in audioEngine.activeSynth) {
                audioEngine.activeSynth.pitchDecay = val;
            }
        });
    }
    if (membraneOctavesSlider) {
        membraneOctavesSlider.addEventListener("input", () => {
            const val = parseFloat(membraneOctavesSlider.value);
            if (membraneOctavesValue) membraneOctavesValue.textContent = val.toFixed(1);
            if (audioEngine?.activeSynth && "octaves" in audioEngine.activeSynth) {
                audioEngine.activeSynth.octaves = val;
            }
        });
    }

    // --- Effects ---
    if (driveMixSlider) {
        driveMixSlider.addEventListener("input", () => {
            const mix = parseFloat(driveMixSlider.value);
            if (audioEngine?.distortion) audioEngine.distortion.wet.value = mix;
            if (driveMixValue) driveMixValue.textContent = mix.toFixed(2);
        });
    }
    if (chorusMixSlider) {
        chorusMixSlider.addEventListener("input", () => {
            const mix = parseFloat(chorusMixSlider.value);
            if (audioEngine?.chorus) audioEngine.chorus.wet.value = mix;
            if (chorusMixValue) chorusMixValue.textContent = mix.toFixed(2);
        });
    }
    if (autoPanMixSlider) {
        autoPanMixSlider.addEventListener("input", () => {
            const mix = parseFloat(autoPanMixSlider.value);
            if (audioEngine?.autoPanner) audioEngine.autoPanner.wet.value = mix;
            if (autoPanMixValue) autoPanMixValue.textContent = mix.toFixed(2);
        });
    }
    delayMixSlider.addEventListener("input", () => {
        const mix = parseFloat(delayMixSlider.value);
        debouncedSetDelayMix(mix);
        delayMixValue.textContent = mix.toFixed(2);
    });
    reverbMixSlider.addEventListener("input", () => {
        const mix = parseFloat(reverbMixSlider.value);
        debouncedSetReverbMix(mix);
        reverbMixValue.textContent = mix.toFixed(2);
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
     * Helper function to handle preset serialization, file downloads, test state updates,
     * and IndexedDB persistence.
     *
     * @param {'save'|'download'} source - Action source ('save' for browser storage only, 'download' for JSON download).
     * @returns {Promise<'success'|'download-only-success'|'download-only-fail'|'store-unavailable'|'save-fail'>} Outcome of the save operation.
     */
    async function performPresetSave(source) {
        const settings = getAllSettings();
        const filename = `${generateFilename(false)}-preset.json`;
        const presetName = presetNameInput?.value.trim() || filename;
        updateTestState({ lastSaveFinished: false });

        if (source === "download") {
            const settingsBlob = new Blob([JSON.stringify(settings, null, 2)], {
                type: "application/json",
            });
            downloadBlob(settingsBlob, filename);
        }

        if (!window.WebArpPresetStore) {
            updateTestState({
                lastSaveError: "Browser preset storage is unavailable.",
                lastSaveFinished: true,
            });
            return source === "download" ? "download-only-success" : "store-unavailable";
        }

        try {
            const record = await window.WebArpPresetStore.save(settings, {
                filename,
                name: presetName,
                source,
            });
            await refreshSavedPresetList(record.id);
            updateTestState({
                lastSavedPreset: settings,
                lastSavedPresetRecord: record,
                lastSaveFinished: true,
            });
            return "success";
        } catch (storeError) {
            console.warn("Failed to save preset to browser storage:", storeError);
            updateTestState({
                lastSaveError: String(storeError),
                lastSaveFinished: true,
            });
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
            } else if (result === "store-unavailable") {
                showToast("Browser preset storage is unavailable.", "error");
            } else {
                showToast("Browser save failed.", "error");
            }
        });
    }

    loadPresetButton.addEventListener("click", () => {
        log("Load preset button clicked.");
        loadPresetInput.click();
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
                    clearActiveSoundStarterCard();
                    loadAllSettings(settings);
                    updateTestState({ lastImportedPreset: settings });
                    if (window.WebArpPresetStore) {
                        window.WebArpPresetStore.save(settings, {
                            filename: file.name,
                            name: file.name,
                            source: "import",
                        })
                            .then((record) => refreshSavedPresetList(record.id))
                            .catch((er) => console.warn("Failed to save imported preset:", er));
                    }
                    showToast("Preset loaded!", "success");
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
            updateTestState({ lastLoadFinished: false });
            const selectedId = savedPresetSelect?.value || "";

            // Check if selected preset is a Factory Preset
            const factoryPreset = FACTORY_PRESETS.find((p) => p.id === selectedId);
            if (factoryPreset) {
                loadAllSettings(factoryPreset.settings);
                if (presetNameInput) presetNameInput.value = factoryPreset.name;
                setActiveSoundStarterCard(factoryPreset.id);
                updateTestState({
                    lastLoadedPreset: factoryPreset.settings,
                    lastLoadedPresetRecord: factoryPreset,
                    lastLoadFinished: true,
                });
                showToast(`Loaded factory preset: ${factoryPreset.name}`, "success");
                return;
            }

            if (!window.WebArpPresetStore) {
                updateTestState({
                    lastLoadError: "Browser preset storage is unavailable.",
                    lastLoadFinished: true,
                });
                showToast("Browser preset storage is unavailable.", "error");
                return;
            }
            try {
                const record = selectedId
                    ? await window.WebArpPresetStore.get(selectedId)
                    : await window.WebArpPresetStore.loadLatest();
                if (!record) {
                    updateTestState({
                        lastLoadedPreset: null,
                        lastLoadFinished: true,
                    });
                    showToast("No saved preset found yet.", "info");
                    return;
                }
                clearActiveSoundStarterCard();
                loadAllSettings(record.settings || record);
                if (presetNameInput) presetNameInput.value = record.name || record.filename || "";
                await refreshSavedPresetList(record.id);
                updateTestState({
                    lastLoadedPreset: record.settings || record,
                    lastLoadedPresetRecord: record,
                    lastLoadFinished: true,
                });
                showToast("Loaded saved preset from browser storage.", "success");
            } catch (error) {
                console.error("Failed to load saved preset:", error);
                updateTestState({
                    lastLoadError: String(error),
                    lastLoadFinished: true,
                });
                showToast("Failed to load saved preset.", "error");
            }
        });
    }

    if (clearSavedPresetButton) {
        clearSavedPresetButton.addEventListener("click", async () => {
            log("Clear saved presets button clicked.");
            updateTestState({ lastClearFinished: false });
            if (!window.WebArpPresetStore) {
                updateTestState({
                    lastClearError: "Browser preset storage is unavailable.",
                    lastClearFinished: true,
                });
                showToast("Browser preset storage is unavailable.", "error");
                return;
            }

            const confirmed = window.__WEB_ARP_TEST__?.skipConfirm
                ? true
                : confirm(
                      "Are you sure you want to clear all your saved user presets? This action cannot be undone.",
                  );

            if (!confirmed) {
                updateTestState({ lastClearFinished: true });
                return;
            }

            try {
                await window.WebArpPresetStore.clear();
                await refreshSavedPresetList();
                updateTestState({ lastClearFinished: true });
                showToast("Saved browser presets cleared.", "success");
            } catch (error) {
                console.error("Failed to clear saved presets:", error);
                updateTestState({
                    lastClearError: String(error),
                    lastClearFinished: true,
                });
                showToast("Failed to clear saved presets.", "error");
            }
        });
    }

    if (deleteSavedPresetButton) {
        deleteSavedPresetButton.addEventListener("click", async () => {
            log("Delete saved preset button clicked.");
            updateTestState({ lastDeleteFinished: false });
            const selectedId = savedPresetSelect?.value || "";

            if (!selectedId) {
                updateTestState({
                    lastDeleteError: "No saved preset selected.",
                    lastDeleteFinished: true,
                });
                showToast("No saved preset selected.", "info");
                return;
            }

            if (selectedId.startsWith("factory-")) {
                showToast("Factory presets cannot be deleted.", "info");
                updateTestState({ lastDeleteFinished: true });
                return;
            }

            if (!window.WebArpPresetStore) {
                updateTestState({
                    lastDeleteError: "Browser preset storage is unavailable.",
                    lastDeleteFinished: true,
                });
                showToast("Browser preset storage is unavailable.", "error");
                return;
            }

            try {
                await window.WebArpPresetStore.remove(selectedId);
                await refreshSavedPresetList();
                updateTestState({
                    lastDeletedPresetId: selectedId,
                    lastDeleteFinished: true,
                });
                showToast("Deleted saved preset.", "success");
            } catch (error) {
                console.error("Failed to delete saved preset:", error);
                updateTestState({
                    lastDeleteError: String(error),
                    lastDeleteFinished: true,
                });
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
            updateTestState({
                lastLoopMapRenderMarkers: markers,
                loopMapRenderCount: (window.__WEB_ARP_TEST__?.loopMapRenderCount || 0) + 1,
            });
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

    // --- Autosave (on any input/change/click) ---
    document.addEventListener("input", (event) => {
        const target = /** @type {Element} */ (event.target);
        if (target === pwaTestStateField || target === presetNameInput) return;
        if (target.matches("input, select, textarea")) {
            clearActiveSoundStarterCard();
            scheduleLastSessionSave();
            if (target !== loopCountInput) {
                // Exclude loop count input from debounced render
                debouncedRenderStaticLoop();
            }
        }
    });

    document.addEventListener("change", (event) => {
        const target = /** @type {Element} */ (event.target);
        if (
            target === pwaTestStateField ||
            target === presetNameInput ||
            target === savedPresetSelect ||
            target === loadPresetInput
        )
            return;
        if (target.matches("input, select, textarea")) {
            clearActiveSoundStarterCard();
            scheduleLastSessionSave();
            if (target !== loopCountInput) {
                // Exclude loop count input from debounced render
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
            clearActiveSoundStarterCard();
            scheduleLastSessionSave();
            debouncedRenderStaticLoop();
        }
    });

    // ==================================================================
    //    Browser Automation / Test Hooks
    // ==================================================================

    window.__WEB_ARP_TEST__ = window.__WEB_ARP_TEST__ || {};
    Object.assign(window.__WEB_ARP_TEST__, {
        getCurrentSettings: () => getAllSettings(),
        getAudioRuntimeState: () => ({
            hasEngine: Boolean(audioEngine),
            isAudioContextStarted,
        }),
        getLoopMapState: () => ({
            renderCount: window.__WEB_ARP_TEST__?.loopMapRenderCount || 0,
            markers: window.__WEB_ARP_TEST__?.lastLoopMapRenderMarkers || [],
        }),

        savePreset: async (settings = null, metadata = {}) => {
            if (!window.WebArpPresetStore)
                throw new Error("Browser preset storage is unavailable.");
            const record = await window.WebArpPresetStore.save(
                settings || getAllSettings(),
                metadata,
            );
            await refreshSavedPresetList(record.id);
            updateTestState({
                lastSavedPreset: record.settings,
                lastSavedPresetRecord: record,
                lastSaveFinished: true,
            });
            return record;
        },

        listPresets: async () => {
            if (!window.WebArpPresetStore) return [];
            const records = await window.WebArpPresetStore.list();
            updateTestState({ savedPresetCount: records.length });
            return records;
        },

        getPreset: async (id) => {
            if (!window.WebArpPresetStore) return null;
            return window.WebArpPresetStore.get(id);
        },

        loadPreset: async (id = "") => {
            if (!window.WebArpPresetStore)
                throw new Error("Browser preset storage is unavailable.");
            const record = id
                ? await window.WebArpPresetStore.get(id)
                : await window.WebArpPresetStore.loadLatest();
            if (!record) {
                updateTestState({
                    lastLoadedPreset: null,
                    lastLoadFinished: true,
                });
                return null;
            }
            loadAllSettings(record.settings || record);
            await refreshSavedPresetList(record.id);
            updateTestState({
                lastLoadedPreset: record.settings || record,
                lastLoadedPresetRecord: record,
                lastLoadFinished: true,
            });
            return record;
        },

        removePreset: async (id) => {
            if (!window.WebArpPresetStore)
                throw new Error("Browser preset storage is unavailable.");
            await window.WebArpPresetStore.remove(id);
            await refreshSavedPresetList();
            updateTestState({
                lastDeletedPresetId: id,
                lastDeleteFinished: true,
            });
        },

        clearPresets: async () => {
            if (!window.WebArpPresetStore) {
                updateTestState({
                    lastClearError: "Browser preset storage is unavailable.",
                    lastClearFinished: true,
                });
                return;
            }
            await window.WebArpPresetStore.clear();
            await refreshSavedPresetList();
            updateTestState({ lastClearFinished: true });
        },

        saveLastSession: saveLastSessionNow,
        restoreLastSession,

        play: async () => {
            if (!isPlaying) {
                playStopButton.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            return isPlaying;
        },

        stop: async () => {
            if (isPlaying) {
                playStopButton.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            return !isPlaying;
        },

        exportMidiBlob: (opts = {}) => {
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
            return createMidiBlob({
                notes: sequenceResult.notes,
                bpm: settings.bpm,
                interval: settings.interval,
                gateRatio: settings.gateRatio,
                loopCount: settings.loopCount,
                ...opts,
            });
        },

        getVisualizer: () => visualizer,
    });
    Object.defineProperty(window.__WEB_ARP_TEST__, "Tone", {
        configurable: true,
        enumerable: true,
        get: () => Tone,
    });

    // ==================================================================
    //    Global Audio Event Listeners
    // ==================================================================

    window.addEventListener("audioReady", () => {
        if (SHOW_AUDIO_READY_TOAST) {
            showToast("Audio is ready!", "success");
        }
    });

    window.addEventListener("audioFailed", () => {
        showToast("Audio failed to start. See console.", "error");
    });

    // ==================================================================
    //    Initial Setup
    // ==================================================================

    currentNotes = notesInput.value.trim().split(/\s+/).filter(Boolean);
    syncPatternModuleState();

    updateButtonGroup(octaveShiftButtons, currentOctaveShift, "data-shift");
    updateButtonGroup(octaveRangeButtons, currentOctaveRange, "data-range");
    updateWaveformButtons(currentWaveform);

    scaleQuantizeToggle.checked = true;
    updateScaleQuantizeUi();
    updateScaleQuantizeToggleText();
    keyboardToggle.checked = false;
    updateKeyboardControlUi();
    setSelectedPatternDirection("up");
    syncPatternModuleState();
    createOrUpdatePattern();

    buildSoundStartersStrip();

    if (startOverlay) {
        startOverlay.addEventListener("click", handleStartOverlayClick);
    }
    if (quickStartScratchButton) {
        quickStartScratchButton.addEventListener("click", handleStartFromScratch);
    }
    if (quickStartOverlay) {
        quickStartOverlay.addEventListener("click", (event) => {
            if (event.target === quickStartOverlay) {
                handleStartFromScratch();
            }
        });
    }
    if (quickStartModal) {
        quickStartModal.addEventListener("keydown", (event) => {
            if (event.key !== "Tab") return;
            const focusable = Array.from(
                quickStartModal.querySelectorAll("button:not([disabled])"),
            );
            if (focusable.length === 0) return;
            const firstElement = focusable[0];
            const lastElement = focusable[focusable.length - 1];

            if (event.shiftKey) {
                if (document.activeElement === firstElement) {
                    event.preventDefault();
                    lastElement.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    event.preventDefault();
                    firstElement.focus();
                }
            }
        });
    }
    window.addEventListener("keydown", (event) => {
        if (
            event.key === "Escape" &&
            quickStartOverlay &&
            quickStartOverlay.style.display !== "none"
        ) {
            handleStartFromScratch();
        }
    });

    if (isFirstVisit()) {
        openQuickStartModal();
    } else {
        if (startOverlay) {
            startOverlay.style.display = "flex";
        }
    }

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

// Expose handlers still referenced by inline HTML attributes and external checks.
window.filterNoteInput = filterNoteInput;
window.filterNumericInput = filterNumericInput;
window.startAudio = startAudio;
