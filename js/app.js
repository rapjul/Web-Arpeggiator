/**
 * Main Web Arpeggiator Application Module
 *
 * This module owns the shell: DOM wiring, transport control, preset/AI/test-hook
 * integration, and module initialization.  The heavy lifting (audio engine,
 * recorder/export, visualizer) has been split into separate modules.
 *
 * @module app
 */
// --- Global Config ---
// Set to true to show a toast message when audio is ready (for testing)
const SHOW_AUDIO_READY_TOAST = true;
// Set to true for verbose console logging
const DEBUG = true;

// Fix for audio session not working on Mobile Safari if in "Silent Mode"
// [237322 – webaudio api is muted when the iOS ringer is muted](https://bugs.webkit.org/show_bug.cgi?id=237322)
if (navigator.audioSession && navigator.audioSession.type !== undefined) {
    navigator.audioSession.type = "playback";
}

/**
 * Global logger function that respects the DEBUG flag.
 * @param {...any} args - Arguments to log.
 */
function log(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

// --- Module Imports ---
import { createAudioEngine } from './audio-engine.js';
import { createVisualizer } from './visualizer.js';
import { createRecorderManager } from './recorder.js';
import { createOrUpdatePattern as createOrUpdatePatternFromModule, getArpeggioNotes as getArpeggioNotesFromModule } from './pattern-generator.js';
import { audioBufferToMp3Blob, audioBufferToWav, downloadBlob } from './audio-utils.js';
import { createSettingsManager } from './settings-manager.js';
import { initializeKeyboardControls } from './keyboard-controller.js';

/**
 * Filters keydown events for the notes input.
 * Allows: A-G, a-g, 0-9, #, b, Space, Backspace, Tab, Arrows, Delete, Ctrl/Cmd+A/C/V/X
 * @param {KeyboardEvent} event - The keyboard event.
 * @returns {boolean} True if the key is allowed, false otherwise.
 */
function filterNoteInput(event) {
    const key = event.key;
    const keyCode = event.keyCode;

    // Allow letters A-G (and a-g)
    if ((keyCode >= 65 && keyCode <= 71)) {
        return true;
    }

    // Allow numbers 0-9
    if ((keyCode >= 48 && keyCode <= 57) && !event.shiftKey) {
        return true;
    }

    // Allow Space, #, b
    if (key === ' ' || key === '#' || key === 'b') {
        return true;
    }

    // Allow control keys
    if ([8, 9, 37, 38, 39, 40, 46].includes(keyCode)) {
        return true;
    }

    // Allow Ctrl/Cmd + A, C, V, X
    if ((event.ctrlKey || event.metaKey) && [65, 67, 86, 88].includes(keyCode)) {
        return true;
    }

    // Block all other keys
    event.preventDefault();
    return false;
}

/**
 * Filters keydown events for numeric inputs to allow only digits and control keys.
 * @param {KeyboardEvent} event - The keyboard event.
 * @returns {boolean} True if the key is allowed, false otherwise.
 */
function filterNumericInput(event) {
    if (
        (event.keyCode >= 48 && event.keyCode <= 57) ||
        (event.keyCode >= 96 && event.keyCode <= 105) ||
        [8, 9, 37, 38, 39, 40, 46].includes(event.keyCode) ||
        (event.ctrlKey || event.metaKey) && [65, 67, 86, 88].includes(event.keyCode)
    ) {
        return true;
    } else {
        event.preventDefault();
        return false;
    }
}

// --- State (must be global for onclick) ---
var isAudioContextStarted = false;

/**
 * Starts the Tone.js AudioContext when the user interacts with the page.
 * @returns {Promise<void>}
 */
async function startAudio() {
    if (isAudioContextStarted) {
        log("AudioContext already started.");
        return;
    }

    try {
        await Tone.start();
        log("AudioContext started successfully.");
        isAudioContextStarted = true;
        window.dispatchEvent(new CustomEvent('audioReady'));
    } catch (err) {
        console.error("AudioContext failed to start:", err);
        window.dispatchEvent(new CustomEvent('audioFailed'));
        throw err;
    }
}

// --- DOMContentLoaded: Main Setup ---
document.addEventListener('DOMContentLoaded', () => {

    // Prevent the browser from restoring a previous scroll position and ensure
    // the page always starts at the very top on every load/refresh.
    if (history.scrollRestoration) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    // --- DOM Elements ---
    const playStopButton = document.getElementById('play-stop');

    const startOverlay = document.getElementById('start-overlay');
    const pwaTestStateField = document.getElementById('pwa-test-state');

    const bpmSlider = document.getElementById('bpm');
    const bpmValue = document.getElementById('bpm-value');
    const postGainSlider = document.getElementById('post-gain');
    const postGainValue = document.getElementById('post-gain-value');
    const swingSlider = document.getElementById('swing');
    const swingValue = document.getElementById('swing-value');
    const notesInput = document.getElementById('notes');
    const intervalSelect = document.getElementById('interval');

    // Synth Card Elements
    const synthTypeSelect = document.getElementById('synth-type');

    // Waveform Elements
    const waveformButtonsContainer = document.getElementById('waveform-buttons-container');
    const waveformButtons = document.getElementById('waveform-buttons');
    const carrierLabel = document.getElementById('carrier-label');

    // Pattern Buttons
    const patternButtons = document.getElementById('pattern-buttons');

    // Basic Synth Params
    const basicSynthParams = document.getElementById('basic-synth-params');
    const dutyControl = document.getElementById('duty-control');
    const dutySlider = document.getElementById('duty-cycle');
    const dutyValue = document.getElementById('duty-value');

    // Advanced Synth Params
    const advancedSynthParams = document.getElementById('advanced-synth-params');
    const harmonicityControl = document.getElementById('harmonicity-control');
    const modIndexControl = document.getElementById('mod-index-control');
    const harmonicitySlider = document.getElementById('harmonicity');
    const harmonicityValue = document.getElementById('harmonicity-value');
    const modIndexSlider = document.getElementById('modulation-index');
    const modIndexValue = document.getElementById('modulation-index-value');

    // Gate Parameter
    const gateSlider = document.getElementById('gate');
    const gateValue = document.getElementById('gate-value');

    // ADSR Envelope Controls
    const envAttackSlider = document.getElementById('env-attack');
    const envDecaySlider = document.getElementById('env-decay');
    const envSustainSlider = document.getElementById('env-sustain');
    const envReleaseSlider = document.getElementById('env-release');
    const envAttackValue = document.getElementById('env-attack-value');
    const envDecayValue = document.getElementById('env-decay-value');
    const envSustainValue = document.getElementById('env-sustain-value');
    const envReleaseValue = document.getElementById('env-release-value');

    // Keyboard Controls
    const keyboardVisual = document.getElementById('keyboard-visual');
    const keyboardToggle = document.getElementById('keyboard-toggle');
    const keyboardToggleStatus = document.getElementById('keyboard-toggle-status');
    const keyboardDescription = document.getElementById('keyboard-description');

    // Octave card
    const octaveShiftButtons = document.getElementById('octave-shift-buttons');
    const octaveRangeButtons = document.getElementById('octave-range-buttons');

    // Scale Quantizer card
    const quantizerCard = document.getElementById('quantizer-card');
    const quantizerControls = document.getElementById('quantizer-controls');
    const scaleQuantizeToggle = document.getElementById('scale-quantize-toggle');
    const scaleQuantizeToggleStatus = document.getElementById('scale-quantize-toggle-status');
    const scaleRootSelect = document.getElementById('scale-root');
    const scaleTypeSelect = document.getElementById('scale-type');

    // Filter card
    const filterCutoffSlider = document.getElementById('filter-cutoff');
    const filterCutoffValue = document.getElementById('filter-cutoff-value');
    const filterResonanceSlider = document.getElementById('filter-resonance');
    const filterResonanceValue = document.getElementById('filter-resonance-value');

    // Effects card
    const delayMixSlider = document.getElementById('delay-mix');
    const delayMixValue = document.getElementById('delay-mix-value');
    const reverbMixSlider = document.getElementById('reverb-mix');
    const reverbMixValue = document.getElementById('reverb-mix-value');

    // Randomize Notes Button
    const randomizeNotesButton = document.getElementById('randomize-notes');

    // Note Step Indicator
    const noteStepIndicator = document.getElementById('note-step-indicator');

    // Real-time Recording card
    const recordButton = document.getElementById('record-button');
    const recordStatus = document.getElementById('record-status') || document.getElementById('realtime-record-status');
    const exportControls = document.getElementById('export-controls') || document.getElementById('realtime-export-controls');
    const realtimeExportWavCheck = document.getElementById('realtime-export-wav');
    const realtimeExportMp3Check = document.getElementById('realtime-export-mp3');
    const exportButton = document.getElementById('realtime-export-button');

    // Offline Export card
    const loopCountInput = document.getElementById('loop-count');
    const offlineExportWavCheck = document.getElementById('offline-export-wav');
    const offlineExportMp3Check = document.getElementById('offline-export-mp3');
    const offlineExportButton = document.getElementById('offline-export-button');
    const offlineExportStatus = document.getElementById('offline-export-status');

    // Utility card
    const visualizerCanvas = document.getElementById('visualizer');
    const toggleVisualizerButton = document.getElementById('toggle-visualizer');

    // Preset Management card
    const presetNameInput = document.getElementById('preset-name-input');
    const savedPresetSelect = document.getElementById('saved-preset-select');
    const savePresetButton = document.getElementById('save-preset-button');
    const loadPresetButton = document.getElementById('load-preset-button');
    const loadSavedPresetButton = document.getElementById('load-saved-preset-button');
    const clearSavedPresetButton = document.getElementById('clear-saved-preset-button');
    const deleteSavedPresetButton = document.getElementById('delete-saved-preset-button');
    const loadPresetInput = document.getElementById('load-preset-input');

    // Toast
    const toastContainer = document.getElementById('toast-container');

    // --- State ---
    let isPlaying = false;
    let currentNotes = ['C4', 'E4', 'G4'];
    let arpPattern = null;
    let currentOctaveShift = 0;
    let currentOctaveRange = 2;
    let activeNote = null;
    let lastSessionSaveTimer = null;
    let isLoadingStoredSettings = false;

    // Sync legacy window globals (needed by extracted modules)
    window.currentNotes = currentNotes;
    window.currentOctaveShift = currentOctaveShift;
    window.currentOctaveRange = currentOctaveRange;
    window.isPlaying = isPlaying;
    window.arpPattern = arpPattern;

    // --- App State Object (for injected modules) ---
    const appState = {
        get isPlaying() { return isPlaying; },
        set isPlaying(value) {
            isPlaying = value;
            window.isPlaying = value;
        },
        get currentNotes() { return currentNotes; },
        set currentNotes(value) {
            currentNotes = value;
            window.currentNotes = value;
        },
        get currentOctaveShift() { return currentOctaveShift; },
        set currentOctaveShift(value) {
            currentOctaveShift = value;
            window.currentOctaveShift = value;
        },
        get currentOctaveRange() { return currentOctaveRange; },
        set currentOctaveRange(value) {
            currentOctaveRange = value;
            window.currentOctaveRange = value;
        },
        get activeSynth() { return audioEngine.activeSynth; },
        set activeSynth(value) {
            // activeSynth is owned by audio-engine; this is a no-op passthrough
        },
        get currentWaveform() { return audioEngine.currentWaveform; },
        set currentWaveform(value) {
            audioEngine.currentWaveform = value;
            window.currentWaveform = value;
        },
        get activeNote() { return activeNote; },
        set activeNote(value) { activeNote = value; },
        get isAudioContextStarted() { return isAudioContextStarted; },
        set isAudioContextStarted(value) { isAudioContextStarted = value; }
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
        if (audioEngine) {
            window.activeSynth = audioEngine.activeSynth;
            window.currentWaveform = audioEngine.currentWaveform;
        }
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
            octaveShift: shift
        });
    }

    /**
     * Delegates to pattern-generator's createOrUpdatePattern.
     * @returns {void}
     */
    function createOrUpdatePattern() {
        createOrUpdatePatternFromModule();
        // Sync local arpPattern from the pattern generator's window.arpPattern
        arpPattern = window.arpPattern;
        // Rebuild the note step indicator pips to match the new note count
        rebuildNoteStepIndicator();
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
        noteStepIndicator.innerHTML = '';
        noteStepPips = [];
        for (let i = 0; i < count; i++) {
            const pip = document.createElement('div');
            pip.className = 'note-step-pip';
            pip.setAttribute('aria-label', currentNotes[i] || '');
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
            noteStepPips[currentStepIndex].classList.remove('active');
        }
        
        // Add active class to new step
        if (index >= 0 && index < noteStepPips.length) {
            noteStepPips[index].classList.add('active');
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
        const selectedPatternButton = patternButtons.querySelector('.pattern-btn.selected');
        return selectedPatternButton ? selectedPatternButton.getAttribute('data-pattern') : 'up';
    }

    /**
     * Sets the currently selected pattern direction button.
     * @param {string} direction - Direction slug to select.
     * @returns {void}
     */
    function setSelectedPatternDirection(direction) {
        const nextDirection = direction || 'up';
        let selectedButton = patternButtons.querySelector(`.pattern-btn[data-pattern="${nextDirection}"]`);
        if (!selectedButton) {
            selectedButton = patternButtons.querySelector('.pattern-btn[data-pattern="up"]');
        }
        patternButtons.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
        selectedButton.classList.add('selected');
    }

    // --- Preset UI Helpers ---

    /**
     * Creates a human-readable display name from a preset record.
     * @param {object} record - Preset record from presets-store.
     * @returns {string} Display label.
     */
    function getPresetDisplayName(record) {
        const savedAt = record.savedAt ? new Date(record.savedAt) : null;
        const savedAtLabel = savedAt && !Number.isNaN(savedAt.getTime())
            ? savedAt.toLocaleString()
            : 'unknown date';
        return `${record.name || record.filename || 'Untitled'} (${savedAtLabel})`;
    }

    /**
     * Rebuilds the saved-preset <select> from IndexedDB.
     * @param {string} [selectedId=''] - The preset id to select after refresh.
     * @returns {Promise<void>}
     */
    async function refreshSavedPresetList(selectedId) {
        if (selectedId === undefined) selectedId = savedPresetSelect?.value || '';
        if (!savedPresetSelect) return;
        try {
            const records = await window.WebArpPresetStore.list();
            savedPresetSelect.innerHTML = '';
            if (records.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '— No saved presets —';
                savedPresetSelect.appendChild(option);
                return;
            }
            records.forEach((record) => {
                const option = document.createElement('option');
                option.value = record.id;
                option.textContent = getPresetDisplayName(record);
                savedPresetSelect.appendChild(option);
            });
            // Try to re-select the previously selected id
            if (selectedId && [...savedPresetSelect.options].some(o => o.value === selectedId)) {
                savedPresetSelect.value = selectedId;
            }
        } catch (error) {
            console.warn('Failed to refresh saved preset list:', error);
        }
    }

    /**
     * Immediately saves the current settings as "last session".
     * @returns {Promise<void>}
     */
    async function saveLastSessionNow() {
        if (!window.WebArpPresetStore || isLoadingStoredSettings) return;
        try {
            const record = await window.WebArpPresetStore.saveLastSession(getAllSettings());
            updateTestState({
                lastSessionId: record.id,
                lastSessionSavedAt: record.savedAt
            });
        } catch (error) {
            console.warn('Failed to save last session:', error);
        }
    }

    /**
     * Schedules a debounced last-session save.
     * @returns {void}
     */
    function scheduleLastSessionSave() {
        if (isLoadingStoredSettings) return;
        if (lastSessionSaveTimer) clearTimeout(lastSessionSaveTimer);
        lastSessionSaveTimer = setTimeout(() => {
            saveLastSessionNow();
        }, 2000);
    }

    /**
     * Restores the "last session" from IndexedDB on startup.
     * @returns {Promise<void>}
     */
    async function restoreLastSession() {
        if (!window.WebArpPresetStore) {
            updateTestState({ lastSessionRestoreFinished: true });
            return;
        }
        try {
            const record = await window.WebArpPresetStore.loadLastSession();
            if (record?.settings) {
                isLoadingStoredSettings = true;
                loadAllSettings(record.settings);
                // Fall back to up if the direction is valid
                if (getSelectedPatternDirection()) {
                    setSelectedPatternDirection(getSelectedPatternDirection());
                } else {
                    setSelectedPatternDirection('up');
                }
                isLoadingStoredSettings = false;
            }
        } catch (error) {
            isLoadingStoredSettings = false;
            console.warn('Failed to restore last session:', error);
        } finally {
            updateTestState({ lastSessionRestoreFinished: true });
        }
    }

    // ==================================================================
    //    Module Initialization
    // ==================================================================

    // 1. Audio Engine — synths, effects, filter, analyzer
    let audioEngine;
    audioEngine = createAudioEngine({
        dom: {
            advancedSynthParams,
            harmonicityControl,
            modIndexControl,
            carrierLabel,
            dutyControl,
            basicSynthParams,
            waveformButtons,
            harmonicitySlider,
            modIndexSlider,
            envAttackSlider,
            envDecaySlider,
            envSustainSlider,
            envReleaseSlider
        },
        actions: {
            syncPatternModuleState,
            showToast: (msg, type) => showToast(msg, type)
        }
    });
    window.activeSynth = audioEngine.activeSynth;
    window.currentWaveform = audioEngine.currentWaveform;
    window.audioEngine = audioEngine;

    // 2. Visualizer — canvas rendering, UI loop, toggle
    const visualizer = createVisualizer({
        dom: { visualizerCanvas, toggleVisualizerButton },
        audio: { analyser: audioEngine.analyser },
        state: {
            get isRecording() { return recorderManager.isRecording; },
            get recordingStartTime() { return recorderManager.recordingStartTime; },
            get isPlaying() { return isPlaying; },
            recordButton
        },
        actions: { formatTime: formatTime || ((s) => { return s; }) }
    });

    // 3. Settings Manager — serialization / restoration (no deps on recorder)
    const settingsManager = createSettingsManager({
        state: appState,
        dom: {
            bpmSlider, bpmValue, swingSlider, swingValue, notesInput, intervalSelect,
            postGainSlider, postGainValue,
            scaleQuantizeToggle, scaleRootSelect, scaleTypeSelect,
            synthTypeSelect, harmonicitySlider, harmonicityValue,
            modIndexSlider, modIndexValue, gateSlider, gateValue,
            dutySlider, dutyValue,
            envAttackSlider, envDecaySlider, envSustainSlider, envReleaseSlider,
            envAttackValue, envDecayValue, envSustainValue, envReleaseValue,
            filterCutoffSlider, filterCutoffValue, filterResonanceSlider, filterResonanceValue,
            delayMixSlider, delayMixValue, reverbMixSlider, reverbMixValue,
            loopCountInput, octaveShiftButtons, octaveRangeButtons
        },
        actions: {
            getArpeggioNotes,
            getSelectedPatternDirection,
            setSelectedPatternDirection,
            updateScaleQuantizeUi,
            updateWaveformButtons,
            setSynth: audioEngine.setSynth,
            updateButtonGroup,
            syncPatternModuleState,
            createOrUpdatePattern,
            showToast
        },
        audio: {
            filter: audioEngine.filter,
            delay: audioEngine.delay,
            reverb: audioEngine.reverb,
            postGain: audioEngine.postGain
        }
    });

    const { getAllSettings, loadAllSettings, generateFilename } = settingsManager;

    // 4. Keyboard Controller
    const keyboardControls = initializeKeyboardControls({
        state: appState,
        dom: { keyboardVisual, keyboardToggle, keyboardToggleStatus, keyboardDescription }
    });
    const { updateKeyboardControlUi } = keyboardControls;

    // 5. Recorder Manager (needs getAllSettings / generateFilename from settings)
    const recorderManager = createRecorderManager({
        audio: {
            reverb: audioEngine.reverb,
            synths: audioEngine.synths
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
            envReleaseSlider
        },
        state: {
            get isAudioContextStarted() { return isAudioContextStarted; },
            get isPlaying() { return isPlaying; }
        },
        actions: {
            showToast,
            startUiLoop: visualizer.startUiLoop,
            stopUiLoop: visualizer.stopUiLoop,
            getAllSettings,
            generateFilename,
            formatTime
        }
    });

    // ==================================================================
    //    Remaining UI Utility Functions
    // ==================================================================

    /**
     * Updates a button group to mark the matching button as selected.
     * @param {HTMLElement} container - The button group container.
     * @param {string|number} selectedValue - The value matching the data attribute.
     * @param {string} dataAttribute - e.g. 'data-shift', 'data-range'.
     * @returns {void}
     */
    function updateButtonGroup(container, selectedValue, dataAttribute) {
        container.querySelectorAll('button').forEach(btn => {
            btn.classList.remove('selected');
            const btnVal = btn.getAttribute(dataAttribute);
            if (btnVal !== null) {
                const numVal = parseInt(btnVal, 10);
                if (numVal === selectedValue) {
                    btn.classList.add('selected');
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
        waveformButtons.querySelectorAll('button').forEach(btn => {
            btn.classList.remove('selected');
            const btnWave = btn.getAttribute('data-wave');
            if (btnWave === selectedWave) {
                btn.classList.add('selected');
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
        const remainingSeconds = (seconds % 60);
        const s = Math.floor(remainingSeconds);
        const ms = Math.floor((remainingSeconds - s) * 10);

        const paddedMinutes = minutes.toString().padStart(2, '0');
        const paddedSeconds = s.toString().padStart(2, '0');

        return `${paddedMinutes}:${paddedSeconds}.${ms}`;
    }

    /**
     * Updates the UI for the quantizer (enables/disables controls).
     * @returns {void}
     */
    function updateScaleQuantizeUi() {
        const isEnabled = scaleQuantizeToggle.checked;
        if (isEnabled) {
            quantizerControls.classList.remove('opacity-50');
            scaleRootSelect.disabled = false;
            scaleTypeSelect.disabled = false;
        } else {
            quantizerControls.classList.add('opacity-50');
            scaleRootSelect.disabled = true;
            scaleTypeSelect.disabled = true;
        }
    }

    /**
     * Updates the quantizer toggle button label text.
     * @returns {void}
     */
    function updateScaleQuantizeToggleText() {
        if (scaleQuantizeToggle.checked) {
            scaleQuantizeToggleStatus.textContent = 'Enabled';
            scaleQuantizeToggleStatus.classList.remove('text-gray-400');
            scaleQuantizeToggleStatus.classList.add('text-green-400');
        } else {
            scaleQuantizeToggleStatus.textContent = 'Disabled';
            scaleQuantizeToggleStatus.classList.remove('text-green-400');
            scaleQuantizeToggleStatus.classList.add('text-gray-400');
        }
    }

    /**
     * Quantizes note names to the nearest note in a given scale.
     * @param {string[]} baseNotes - Array of note strings (e.g. ['C4', 'E4']).
     * @param {string} root - Scale root (e.g. 'C', 'D#').
     * @param {string} scaleType - Scale type (e.g. 'major', 'minor').
     * @returns {string[]} Quantized note strings.
     */
    function quantizeNotes(baseNotes, root, scaleType) {
        if (!scaleQuantizeToggle.checked) return baseNotes;
        try {
            const scaleName = `${root} ${scaleType}`;
            const scale = Tonal.Scale.get(scaleName);
            const scalePitchClasses = scale.notes;
            const chromaticPitches = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

            // Generate a wide range of notes (C2 to C7)
            const chromaticRange = [];
            for (let octave = 2; octave < 7; octave++) {
                for (const note of chromaticPitches) {
                    chromaticRange.push(`${note}${octave}`);
                }
            }

            const scaleNotes = chromaticRange.filter(note => {
                if (Tonal && Tonal.Note && Tonal.Note.pitchClass) {
                    return scalePitchClasses.includes(Tonal.Note.pitchClass(note));
                }
                const noteName = note.replace(/\d+$/, '');
                return scalePitchClasses.some(sc => {
                    return noteName === sc || (noteName.length === 1 && sc.startsWith(noteName));
                });
            });

            const quantizedNotes = baseNotes.map(note => {
                try {
                    const noteMidi = Tonal.Note.midi(note);
                    if (noteMidi === undefined) return note;
                    const closestMidi = scaleNotes.map(Tonal.Note.midi).reduce((prev, curr) => {
                        return (Math.abs(curr - noteMidi) < Math.abs(prev - noteMidi) ? curr : prev);
                    });
                    return Tonal.Note.fromMidi(closestMidi);
                } catch (e) {
                    return note;
                }
            });

            return quantizedNotes;
        } catch (e) {
            console.warn("Scale quantize failed, returning original notes.", e);
            return baseNotes;
        }
    }

    /**
     * Displays a stacking toast message for a few seconds.
     * @param {string} message - The text to display.
     * @param {string} type - 'success', 'info', or 'error'.
     * @returns {void}
     */
    function showToast(message, type = 'info') {
        if (!toastContainer) return;
        log(`TOAST (${type}): ${message}`);
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.className = `toast-message toast-${type}`;

        toastContainer.appendChild(toast);
        requestAnimationFrame(() => { toast.classList.add('show'); });

        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
        }, 3000);

        setTimeout(() => { toast.remove(); }, 3300);
    }

    // ==================================================================
    //    Event Listeners
    // ==================================================================

    // --- Pattern Button Selection ---
    patternButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('button.pattern-btn');
        if (!btn) return;
        patternButtons.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        createOrUpdatePattern();
    });

    // --- Start Overlay ---
    /**
     * Handles clicks on the start overlay to initialize the AudioContext
     * and transition the UI to the active state.
     *
     * @returns {Promise<void>}
     */
    const handleStartOverlayClick = async () => {
        if (startOverlay) {
            startOverlay.style.display = 'none';
        }

        if (playStopButton) {
            playStopButton.disabled = false;
            playStopButton.textContent = 'Start Audio';
            playStopButton.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-600');
            playStopButton.classList.add('bg-blue-600', 'hover:bg-blue-700');
        }

        try {
            await startAudio();
        } catch (err) {
            console.warn("AudioContext failed to start on overlay click:", err);
        }
    };

    if (startOverlay) {
        startOverlay.addEventListener('click', handleStartOverlayClick);
    }

    // --- Transport: Play / Stop ---
    playStopButton.addEventListener('click', async () => {
        await startAudio();

        // Lazy-init recorder on first play press
        if (!recorderManager.isRecording) {
            await recorderManager.initRecorder();
        }

        createOrUpdatePattern();

        if (isPlaying) {
            Tone.Transport.stop();
            if (arpPattern) arpPattern.stop();
            playStopButton.textContent = 'Restart Audio';
            playStopButton.classList.remove('bg-yellow-600', 'hover:bg-yellow-700');
            playStopButton.classList.add('bg-blue-600', 'hover:bg-blue-700');
            isPlaying = false;
            syncPatternModuleState();
        } else {
            if (arpPattern) arpPattern.start();
            Tone.Transport.start();
            playStopButton.textContent = 'Stop Audio';
            playStopButton.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
            playStopButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            isPlaying = true;
            syncPatternModuleState();
        }

        if (isPlaying) {
            visualizer.startUiLoop();
        } else {
            visualizer.stopUiLoop();
            // Clear the note step indicator when stopped
            noteStepPips.forEach(p => p.classList.remove('active'));
            currentStepIndex = -1;
        }
    });

    /**
     * Creates a debounced function that delays invoking the callback.
     * @param {Function} func - The callback function to debounce.
     * @param {number} wait - The delay in milliseconds.
     * @returns {Function} The debounced function.
     */
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
            }, wait);
        };
    }

    /**
     * Debounced wrapper to update the synth envelope.
     * @type {Function}
     */
    const debouncedUpdateEnvelope = debounce(() => {
        audioEngine.updateEnvelope();
    }, 16);

    // --- ADSR Listeners ---
    envAttackSlider.addEventListener('input', () => {
        envAttackValue.textContent = parseFloat(envAttackSlider.value).toFixed(2);
        debouncedUpdateEnvelope();
    });
    envDecaySlider.addEventListener('input', () => {
        envDecayValue.textContent = parseFloat(envDecaySlider.value).toFixed(2);
        debouncedUpdateEnvelope();
    });
    envSustainSlider.addEventListener('input', () => {
        envSustainValue.textContent = parseFloat(envSustainSlider.value).toFixed(2);
        debouncedUpdateEnvelope();
    });
    envReleaseSlider.addEventListener('input', () => {
        envReleaseValue.textContent = parseFloat(envReleaseSlider.value).toFixed(2);
        debouncedUpdateEnvelope();
    });

    /**
     * Generates a random, ascending sequence of 4 to 6 unique notes.
     * Uses Tonal.js to query the current scale pitches from the selected root and scale type.
     * Falls back to C major pentatonic if the scale query fails or returns empty notes.
     *
     * @param {string} root - The scale root note (e.g., "C", "F#").
     * @param {string} scaleType - The scale type/mode (e.g., "minor", "mixolydian").
     * @returns {string[]} An array of note names in Tone.js format (e.g. ["C4", "E4", "G4"]).
     */
    function generateRandomNotes(root, scaleType) {
        let activeScaleType = scaleType;
        if (activeScaleType === 'chromatic') {
            const scaleTypes = ['major', 'minor', 'majorPentatonic', 'minorPentatonic', 'dorian', 'mixolydian'];
            activeScaleType = scaleTypes[Math.floor(Math.random() * scaleTypes.length)];
        }

        const scaleName = `${root} ${activeScaleType}`;
        const scale = Tonal.Scale.get(scaleName);
        let scalePitchClasses = scale.notes;

        if (!scalePitchClasses || scalePitchClasses.length === 0) {
            scalePitchClasses = ['C', 'D', 'E', 'G', 'A'];
        }

        const notesPool = [];
        const octaves = [3, 4, 5];
        scalePitchClasses.forEach((pc) => {
            // Simplify double accidentals to standard flat/sharp pitch representations.
            const simplifiedPc = Tonal.Note.simplify(pc) || pc;
            octaves.forEach((oct) => {
                notesPool.push(`${simplifiedPc}${oct}`);
            });
        });

        const count = Math.floor(Math.random() * 3) + 4; // 4, 5, or 6 notes
        const selected = [];
        const tempPool = [...notesPool];
        for (let i = 0; i < count && tempPool.length > 0; i++) {
            const idx = Math.floor(Math.random() * tempPool.length);
            selected.push(tempPool.splice(idx, 1)[0]);
        }

        selected.sort((a, b) => {
            const aMidi = Tonal.Note.midi(a) || 0;
            const bMidi = Tonal.Note.midi(b) || 0;
            return aMidi - bMidi;
        });

        return selected;
    }

    // --- Randomize Notes ---
    randomizeNotesButton.addEventListener('click', () => {
        let root = scaleRootSelect.value;
        let scaleType = scaleTypeSelect.value;
        const isQuantized = scaleQuantizeToggle.checked;

        // If scale quantization is disabled, randomize the scale configuration first.
        if (!isQuantized) {
            // Select a random root note from the configured root note dropdown options.
            const rootOptions = scaleRootSelect.options;
            root = rootOptions[Math.floor(Math.random() * rootOptions.length)].value;
            scaleRootSelect.value = root;
            scaleRootSelect.dispatchEvent(new Event('change'));

            // Select a random scale type from the configured scale type dropdown options (excluding 'chromatic').
            const typeOptions = scaleTypeSelect.options;
            let randomTypeOption;
            do {
                randomTypeOption = typeOptions[Math.floor(Math.random() * typeOptions.length)].value;
            } while (randomTypeOption === 'chromatic' && typeOptions.length > 1);

            scaleType = randomTypeOption;
            scaleTypeSelect.value = scaleType;
            scaleTypeSelect.dispatchEvent(new Event('change'));
        }

        // Determine the actual scale type to use for generation.
        // If quantization is on, respect the user's selected scale; if off, use the newly randomized scale.
        const activeScaleType = (isQuantized && scaleType === 'chromatic') ? 'chromatic' : scaleType;
        const randomizedNotes = generateRandomNotes(root, activeScaleType);

        // Update the notes input field and trigger change events to refresh Tone.Pattern.
        notesInput.value = randomizedNotes.join(' ');
        notesInput.dispatchEvent(new Event('change'));

        const formattedScaleName = activeScaleType === 'chromatic'
            ? `${root} Chromatic (Random Selection)`
            : `${root} ${scaleType.charAt(0).toUpperCase() + scaleType.slice(1)}`;
        showToast(`Randomized notes using ${formattedScaleName}!`, 'success');
    });

    // --- Transport & Pattern ---

    /**
     * Converts the post gain slider's dB value to a 0–100% display label.
     * @param {number} db - Decibel value (-40 to 0).
     * @returns {number} Percentage (0–100).
     */
    function dbToPercent(db) {
        return Math.round((db + 40) / 40 * 100);
    }

    /**
     * Debounced wrapper to set post gain volume.
     * @type {Function}
     */
    const debouncedSetPostGain = debounce((db) => {
        audioEngine.postGain.volume.value = db;
    }, 16);

    /**
     * Debounced wrapper to set BPM.
     * @type {Function}
     */
    const debouncedSetBpm = debounce((val) => {
        Tone.Transport.bpm.value = val;
    }, 16);

    /**
     * Debounced wrapper to set swing.
     * @type {Function}
     */
    const debouncedSetSwing = debounce((val) => {
        Tone.Transport.swing = val;
    }, 16);

    /**
     * Debounced wrapper to set harmonicity.
     * @type {Function}
     */
    const debouncedSetHarmonicity = debounce((val) => {
        if (audioEngine.activeSynth && audioEngine.activeSynth.harmonicity) {
            audioEngine.activeSynth.harmonicity.value = val;
        }
    }, 16);

    /**
     * Debounced wrapper to set modulation index.
     * @type {Function}
     */
    const debouncedSetModIndex = debounce((val) => {
        if (audioEngine.activeSynth && audioEngine.activeSynth.modulationIndex) {
            audioEngine.activeSynth.modulationIndex.value = val;
        }
    }, 16);

    /**
     * Debounced wrapper to set duty cycle.
     * @type {Function}
     */
    const debouncedSetDuty = debounce((val) => {
        if (audioEngine.activeSynth && audioEngine.activeSynth.oscillator &&
            audioEngine.currentWaveform === 'square') {
            audioEngine.activeSynth.oscillator.width.value = val;
        }
    }, 16);

    /**
     * Debounced wrapper to create or update pattern at 50ms.
     * @type {Function}
     */
    const debouncedCreateOrUpdatePattern50 = debounce(() => {
        createOrUpdatePattern();
    }, 50);

    /**
     * Debounced wrapper to set filter cutoff frequency.
     * @type {Function}
     */
    const debouncedSetFilterCutoff = debounce((val) => {
        audioEngine.filter.frequency.value = val;
    }, 16);

    /**
     * Debounced wrapper to set filter Q.
     * @type {Function}
     */
    const debouncedSetFilterQ = debounce((val) => {
        audioEngine.filter.Q.value = val;
    }, 16);

    /**
     * Debounced wrapper to set delay mix.
     * @type {Function}
     */
    const debouncedSetDelayMix = debounce((val) => {
        audioEngine.delay.wet.value = val;
    }, 16);

    /**
     * Debounced wrapper to set reverb mix.
     * @type {Function}
     */
    const debouncedSetReverbMix = debounce((val) => {
        audioEngine.reverb.wet.value = val;
    }, 16);

    postGainSlider.addEventListener('input', () => {
        const db = parseFloat(postGainSlider.value);
        debouncedSetPostGain(db);
        postGainValue.textContent = dbToPercent(db);
    });

    bpmSlider.addEventListener('input', () => {
        debouncedSetBpm(parseInt(bpmSlider.value));
        bpmValue.textContent = bpmSlider.value;
    });

    swingSlider.addEventListener('input', () => {
        debouncedSetSwing(parseFloat(swingSlider.value));
        swingValue.textContent = parseFloat(swingSlider.value).toFixed(2);
    });

    notesInput.addEventListener('change', () => {
        currentNotes = notesInput.value.trim().split(/\s+/).filter(Boolean);
        if (currentNotes.length === 0) currentNotes = ['C4'];
        syncPatternModuleState();
        createOrUpdatePattern();
    });
    notesInput.addEventListener('input', () => {
        currentNotes = notesInput.value.trim().split(/\s+/).filter(Boolean);
        if (currentNotes.length === 0) currentNotes = ['C4'];
        syncPatternModuleState();
    });

    scaleQuantizeToggle.addEventListener('change', () => {
        updateScaleQuantizeUi();
        createOrUpdatePattern();
        updateScaleQuantizeToggleText();
    });
    scaleRootSelect.addEventListener('change', createOrUpdatePattern);
    scaleTypeSelect.addEventListener('change', createOrUpdatePattern);

    intervalSelect.addEventListener('change', createOrUpdatePattern);

    // --- Synth & Effects ---
    synthTypeSelect.addEventListener('change', () => {
        audioEngine.setSynth(synthTypeSelect.value);
        createOrUpdatePattern();
    });

    waveformButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('button.waveform-btn');
        if (!btn) return;

        audioEngine.currentWaveform = btn.getAttribute('data-wave');
        updateWaveformButtons(audioEngine.currentWaveform);
        audioEngine.setSynth(synthTypeSelect.value);
    });

    harmonicitySlider.addEventListener('input', () => {
        const val = parseFloat(harmonicitySlider.value);
        debouncedSetHarmonicity(val);
        harmonicityValue.textContent = val.toFixed(1);
    });

    modIndexSlider.addEventListener('input', () => {
        const val = parseFloat(modIndexSlider.value);
        debouncedSetModIndex(val);
        modIndexValue.textContent = val.toFixed(1);
    });

    // --- Duty Cycle ---
    dutySlider.addEventListener('input', () => {
        const val = parseFloat(dutySlider.value);
        dutyValue.textContent = val.toFixed(2);
        debouncedSetDuty(val);
    });

    // --- Octave Controls ---
    octaveShiftButtons.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentOctaveShift = parseInt(e.target.getAttribute('data-shift'));
            syncPatternModuleState();
            updateButtonGroup(octaveShiftButtons, currentOctaveShift, 'data-shift');
            createOrUpdatePattern();
        }
    });

    octaveRangeButtons.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentOctaveRange = parseInt(e.target.getAttribute('data-range'));
            syncPatternModuleState();
            updateButtonGroup(octaveRangeButtons, currentOctaveRange, 'data-range');
            createOrUpdatePattern();
        }
    });

    // --- Gate ---
    gateSlider.addEventListener('input', () => {
        gateValue.textContent = parseFloat(gateSlider.value).toFixed(2);
        debouncedCreateOrUpdatePattern50();
    });

    // --- Filter ---
    filterCutoffSlider.addEventListener('input', () => {
        const freq = parseFloat(filterCutoffSlider.value);
        debouncedSetFilterCutoff(freq);
        filterCutoffValue.textContent = freq.toFixed(0);
    });
    filterResonanceSlider.addEventListener('input', () => {
        const res = parseFloat(filterResonanceSlider.value);
        debouncedSetFilterQ(res);
        filterResonanceValue.textContent = res.toFixed(1);
    });

    // --- Effects ---
    delayMixSlider.addEventListener('input', () => {
        const mix = parseFloat(delayMixSlider.value);
        debouncedSetDelayMix(mix);
        delayMixValue.textContent = mix.toFixed(2);
    });
    reverbMixSlider.addEventListener('input', () => {
        const mix = parseFloat(reverbMixSlider.value);
        debouncedSetReverbMix(mix);
        reverbMixValue.textContent = mix.toFixed(2);
    });

    // --- Recording Controls ---
    recordButton.addEventListener('click', () => {
        recorderManager.toggleRecording();
    });

    exportButton.addEventListener('click', async () => {
        await recorderManager.exportRealtime();
    });

    offlineExportButton.addEventListener('click', async () => {
        await recorderManager.exportOffline();
    });

    // --- Visualizer Toggle ---
    toggleVisualizerButton.addEventListener('click', () => {
        visualizer.toggle();
    });

    // ==================================================================
    //    Preset Management
    // ==================================================================

    savePresetButton.addEventListener('click', async () => {
        log("Save preset button clicked.");
        const settings = getAllSettings();
        const settingsBlob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const filename = `${generateFilename(false)}-preset.json`;
        const presetName = presetNameInput?.value.trim() || filename;
        updateTestState({ lastSaveFinished: false });
        downloadBlob(settingsBlob, filename);
        if (window.WebArpPresetStore) {
            try {
                const record = await window.WebArpPresetStore.save(settings, {
                    filename,
                    name: presetName,
                    source: 'download'
                });
                await refreshSavedPresetList(record.id);
                updateTestState({
                    lastSavedPreset: settings,
                    lastSavedPresetRecord: record,
                    lastSaveFinished: true
                });
            } catch (storeError) {
                console.warn('Failed to save preset to browser storage:', storeError);
                updateTestState({ lastSaveError: String(storeError), lastSaveFinished: true });
                showToast('Preset downloaded, but browser save failed.', 'info');
                return;
            }
        } else {
            updateTestState({ lastSaveError: 'Browser preset storage is unavailable.', lastSaveFinished: true });
        }
        showToast("Preset saved!", "success");
    });

    loadPresetButton.addEventListener('click', () => {
        log("Load preset button clicked.");
        loadPresetInput.click();
    });

    loadPresetInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const settings = JSON.parse(e.target.result);
                loadAllSettings(settings);
                updateTestState({ lastImportedPreset: settings });
                if (window.WebArpPresetStore) {
                    window.WebArpPresetStore.save(settings, { filename: file.name, name: file.name, source: 'import' })
                        .then((record) => refreshSavedPresetList(record.id))
                        .catch((er) => console.warn('Failed to save imported preset:', er));
                }
                showToast("Preset loaded!", "success");
            } catch (err) {
                console.error("Failed to load preset:", err);
                showToast("Failed to load preset.", "error");
            }
        };
        reader.readAsText(file);
        event.target.value = null;
    });

    if (loadSavedPresetButton) {
        loadSavedPresetButton.addEventListener('click', async () => {
            log('Load saved preset button clicked.');
            updateTestState({ lastLoadFinished: false });
            if (!window.WebArpPresetStore) {
                updateTestState({ lastLoadError: 'Browser preset storage is unavailable.', lastLoadFinished: true });
                showToast('Browser preset storage is unavailable.', 'error');
                return;
            }
            try {
                const selectedId = savedPresetSelect?.value || '';
                const record = selectedId
                    ? await window.WebArpPresetStore.get(selectedId)
                    : await window.WebArpPresetStore.loadLatest();
                if (!record) {
                    updateTestState({ lastLoadedPreset: null, lastLoadFinished: true });
                    showToast('No saved preset found yet.', 'info');
                    return;
                }
                loadAllSettings(record.settings || record);
                if (presetNameInput) presetNameInput.value = record.name || record.filename || '';
                await refreshSavedPresetList(record.id);
                updateTestState({ lastLoadedPreset: record.settings || record, lastLoadedPresetRecord: record, lastLoadFinished: true });
                showToast('Loaded saved preset from browser storage.', 'success');
            } catch (error) {
                console.error('Failed to load saved preset:', error);
                updateTestState({ lastLoadError: String(error), lastLoadFinished: true });
                showToast('Failed to load saved preset.', 'error');
            }
        });
    }

    if (clearSavedPresetButton) {
        clearSavedPresetButton.addEventListener('click', async () => {
            log('Clear saved presets button clicked.');
            updateTestState({ lastClearFinished: false });
            if (!window.WebArpPresetStore) {
                updateTestState({ lastClearError: 'Browser preset storage is unavailable.', lastClearFinished: true });
                showToast('Browser preset storage is unavailable.', 'error');
                return;
            }
            try {
                await window.WebArpPresetStore.clear();
                await refreshSavedPresetList();
                updateTestState({ lastClearFinished: true });
                showToast('Saved browser presets cleared.', 'success');
            } catch (error) {
                console.error('Failed to clear saved presets:', error);
                updateTestState({ lastClearError: String(error), lastClearFinished: true });
                showToast('Failed to clear saved presets.', 'error');
            }
        });
    }

    if (deleteSavedPresetButton) {
        deleteSavedPresetButton.addEventListener('click', async () => {
            log('Delete saved preset button clicked.');
            updateTestState({ lastDeleteFinished: false });
            if (!window.WebArpPresetStore) {
                updateTestState({ lastDeleteError: 'Browser preset storage is unavailable.', lastDeleteFinished: true });
                showToast('Browser preset storage is unavailable.', 'error');
                return;
            }
            const selectedId = savedPresetSelect?.value || '';
            if (!selectedId) {
                updateTestState({ lastDeleteError: 'No saved preset selected.', lastDeleteFinished: true });
                showToast('No saved preset selected.', 'info');
                return;
            }
            try {
                await window.WebArpPresetStore.remove(selectedId);
                await refreshSavedPresetList();
                updateTestState({ lastDeletedPresetId: selectedId, lastDeleteFinished: true });
                showToast('Deleted saved preset.', 'success');
            } catch (error) {
                console.error('Failed to delete saved preset:', error);
                updateTestState({ lastDeleteError: String(error), lastDeleteFinished: true });
                showToast('Failed to delete saved preset.', 'error');
            }
        });
    }

    // --- Autosave (on any input/change/click) ---
    document.addEventListener('input', (event) => {
        if (event.target === pwaTestStateField || event.target === presetNameInput) return;
        if (event.target.matches('input, select, textarea')) {
            scheduleLastSessionSave();
        }
    });

    document.addEventListener('change', (event) => {
        if (event.target === pwaTestStateField || event.target === presetNameInput ||
            event.target === savedPresetSelect || event.target === loadPresetInput) return;
        if (event.target.matches('input, select, textarea')) {
            scheduleLastSessionSave();
        }
    });

    document.addEventListener('click', (event) => {
        if (event.target.closest('.pattern-btn, .waveform-btn, #octave-shift-buttons button, #octave-range-buttons button')) {
            scheduleLastSessionSave();
        }
    });

    // ==================================================================
    //    Browser Automation / Test Hooks
    // ==================================================================

    window.__WEB_ARP_TEST__ = window.__WEB_ARP_TEST__ || {};
    Object.assign(window.__WEB_ARP_TEST__, {
        getCurrentSettings: () => getAllSettings(),

        savePreset: async (settings = null, metadata = {}) => {
            if (!window.WebArpPresetStore) throw new Error('Browser preset storage is unavailable.');
            const record = await window.WebArpPresetStore.save(settings || getAllSettings(), metadata);
            await refreshSavedPresetList(record.id);
            updateTestState({ lastSavedPreset: record.settings, lastSavedPresetRecord: record, lastSaveFinished: true });
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

        loadPreset: async (id = '') => {
            if (!window.WebArpPresetStore) throw new Error('Browser preset storage is unavailable.');
            const record = id
                ? await window.WebArpPresetStore.get(id)
                : await window.WebArpPresetStore.loadLatest();
            if (!record) {
                updateTestState({ lastLoadedPreset: null, lastLoadFinished: true });
                return null;
            }
            loadAllSettings(record.settings || record);
            await refreshSavedPresetList(record.id);
            updateTestState({ lastLoadedPreset: record.settings || record, lastLoadedPresetRecord: record, lastLoadFinished: true });
            return record;
        },

        removePreset: async (id) => {
            if (!window.WebArpPresetStore) throw new Error('Browser preset storage is unavailable.');
            await window.WebArpPresetStore.remove(id);
            await refreshSavedPresetList();
            updateTestState({ lastDeletedPresetId: id, lastDeleteFinished: true });
        },

        clearPresets: async () => {
            if (!window.WebArpPresetStore) {
                updateTestState({ lastClearError: 'Browser preset storage is unavailable.', lastClearFinished: true });
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
        }
    });

    // ==================================================================
    //    Global Audio Event Listeners
    // ==================================================================

    window.addEventListener('audioReady', () => {
        if (SHOW_AUDIO_READY_TOAST) {
            showToast("Audio is ready!", "success");
        }
    });

    window.addEventListener('audioFailed', () => {
        showToast("Audio failed to start. See console.", "error");
    });

    // ==================================================================
    //    Initial Setup
    // ==================================================================

    audioEngine.setSynth(synthTypeSelect.value);
    Tone.Transport.bpm.value = parseInt(bpmSlider.value);
    currentNotes = notesInput.value.trim().split(/\s+/).filter(Boolean);
    syncPatternModuleState();

    updateButtonGroup(octaveShiftButtons, currentOctaveShift, 'data-shift');
    updateButtonGroup(octaveRangeButtons, currentOctaveRange, 'data-range');
    updateWaveformButtons(audioEngine.currentWaveform);

    scaleQuantizeToggle.checked = false;
    updateScaleQuantizeUi();
    keyboardToggle.checked = false;
    updateKeyboardControlUi();
    audioEngine.setSynth(synthTypeSelect.value);

    document.querySelector('.pattern-btn[data-pattern="up"]').classList.add('selected');
    syncPatternModuleState();
    createOrUpdatePattern();

    audioEngine.filter.frequency.value = parseFloat(filterCutoffSlider.value);
    audioEngine.filter.Q.value = parseFloat(filterResonanceSlider.value);
    audioEngine.delay.wet.value = parseFloat(delayMixSlider.value);
    audioEngine.reverb.wet.value = parseFloat(reverbMixSlider.value);
    audioEngine.postGain.volume.value = parseFloat(postGainSlider.value);

    log("Arpeggiator initialized and ready.");
    void refreshSavedPresetList();
    void restoreLastSession();
});

// Expose handlers still referenced by inline HTML attributes and external checks.
window.filterNoteInput = filterNoteInput;
window.filterNumericInput = filterNumericInput;
window.startAudio = startAudio;
