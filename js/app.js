/**
 * Main Web Arpeggiator application module.
 *
 * This module owns DOM wiring, Tone.js audio setup, pattern generation,
 * recording/export controls, preset UI integration, and browser test hooks.
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
    if ([8, 9, 37, 38, 39, 40, 46].includes(keyCode)) { // Backspace, Tab, Arrows, Delete
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
    // Allow numbers, tab, backspace, delete, arrow keys
    if (
        (event.keyCode >= 48 && event.keyCode <= 57) || // 0-9
        (event.keyCode >= 96 && event.keyCode <= 105) || // Numpad 0-9
        [8, 9, 37, 38, 39, 40, 46].includes(event.keyCode) || // Backspace, Tab, Arrows, Delete
        (event.ctrlKey || event.metaKey) && [65, 67, 86, 88].includes(event.keyCode) // Ctrl+A/C/V/X
    ) {
        return true;
    } else {
        event.preventDefault();
        return false;
    }
}

// --- State (must be global for onclick) ---
var isAudioContextStarted = false; // <-- CRITICAL FIX

/**
 * Starts the Tone.js AudioContext when the user interacts with the page.
 * @returns {Promise<void>}
 */
async function startAudio() {
    if (isAudioContextStarted) {
        log("Audio context already started.");
        return;
    }

    log("startAudio() called. Attempting to start audio context...");
    try {
        await Tone.start();
        log("After await Tone.start(): Tone.getContext().state:", Tone.getContext().state);

        Tone.Transport.start();

        if (Tone.context.state !== 'running') {
            log("Before context.resume: Tone.getContext().state:", Tone.getContext().state);
            Tone.getContext().resume();
            await Tone.start();
            log("After context.resume and await Tone.start: Tone.getContext().state:", Tone.getContext().state);
        }

        log("Audio context started successfully.");
        isAudioContextStarted = true; // Mark as started

        // Call the toast function
        if (SHOW_AUDIO_READY_TOAST) {
            window.dispatchEvent(new CustomEvent('audioReady'));
        }
    } catch (e) {
        console.error("Tone.start() failed:", e);
        window.dispatchEvent(new CustomEvent('audioFailed'));
    }
}

/**
 * Initializes DOM wiring, Tone.js objects, event listeners, and persisted state
 * after browser dependencies have loaded.
 *
 * @returns {void}
 */
window.addEventListener('load', () => {
    // Debug: initial Tone.js AudioContext state on load
    if (typeof Tone !== 'undefined') {
        log("Initial Tone.getContext().state:", Tone.getContext().state);
    } else {
        console.error("Tone.js not loaded.");
        return;
    }

    // --- DOM Elements ---
    const playStopButton = document.getElementById('play-stop');

    const startOverlay = document.getElementById('start-overlay');
    // const startButton = document.getElementById('start-button');
    const pwaTestStateField = document.getElementById('pwa-test-state');

    /**
     * Serializes the current browser-test state into a hidden textarea.
     *
     * @returns {void}
     */
    function syncPwaTestState() {
        if (!pwaTestStateField) {
            return;
        }

        pwaTestStateField.value = JSON.stringify(window.__WEB_ARP_TEST__ || {}, null, 2);
    }

    // Click anywhere on the overlay to start audio context
    startOverlay.addEventListener('click', () => {
        startAudio();

        // Update UI
        startOverlay.style.display = 'none';

        playStopButton.disabled = false;
        playStopButton.textContent = 'Start Audio';
        playStopButton.classList.remove('opacity-50', 'cursor-not-allowed');
        playStopButton.classList.remove('bg-gray-600');
        playStopButton.classList.add('bg-blue-600', 'hover:bg-blue-700');
    });



    const bpmSlider = document.getElementById('bpm');
    const bpmValue = document.getElementById('bpm-value');
    const swingSlider = document.getElementById('swing');
    const swingValue = document.getElementById('swing-value');
    const notesInput = document.getElementById('notes');
    const intervalSelect = document.getElementById('interval');

    // Synth Card Elements
    const synthTypeSelect = document.getElementById('synth-type');

    // Waveform Elements (1. & 2. Fix)
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

    // NEW: ADSR Envelope Controls
    const envAttackSlider = document.getElementById('env-attack');
    const envDecaySlider = document.getElementById('env-decay');
    const envSustainSlider = document.getElementById('env-sustain');
    const envReleaseSlider = document.getElementById('env-release');
    const envAttackValue = document.getElementById('env-attack-value');
    const envDecayValue = document.getElementById('env-decay-value');
    const envSustainValue = document.getElementById('env-sustain-value');
    const envReleaseValue = document.getElementById('env-release-value');

    // NEW: Keyboard Controls (2. Fix)
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

    // Gemini AI
    const aiPromptInput = document.getElementById('ai-prompt');
    const aiGenerateButton = document.getElementById('ai-generate-notes');
    const aiStatus = document.getElementById('ai-status');

    // Real-time Recording card
    const recordButton = document.getElementById('record-button');
    const recordStatus = document.getElementById('realtime-record-status');
    const exportControls = document.getElementById('realtime-export-controls');
    const exportWavCheck = document.getElementById('realtime-export-wav');
    const exportMp3Check = document.getElementById('realtime-export-mp3');
    const exportButton = document.getElementById('realtime-export-button');

    // Offline Export card
    const loopCountInput = document.getElementById('loop-count');
    const offlineExportWavCheck = document.getElementById('offline-export-wav');
    const offlineExportMp3Check = document.getElementById('offline-export-mp3');
    const offlineExportButton = document.getElementById('offline-export-button');
    const offlineExportStatus = document.getElementById('offline-export-status');

    // Utility card
    const visualizerCanvas = document.getElementById('visualizer');
    const visualizerCtx = visualizerCanvas.getContext('2d');
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
    let isRecording = false;
    let currentNotes = ['C4', 'E4', 'G4'];
    let arpPattern = null;
    let liveRecordedWavBlob = null;
    let currentOctaveShift = 0;
    let currentOctaveRange = 2;
    let uiUpdateLoop = null;
    let recordingStartTime = 0;
    let isVisualizerOn = false;
    let activeSynth = null;
    let currentWaveform = 'sine';
    let activeNote = null; // Stores the currently pressed note for monophonic playback
    let lastSessionSaveTimer = null;
    let isLoadingStoredSettings = false;

    /**
     * Merges new values into the shared browser-test state object.
     *
     * @param {object} updates - Values to expose to automation checks.
     * @returns {void}
     */
    function updateTestState(updates) {
        window.__WEB_ARP_TEST__ = window.__WEB_ARP_TEST__ || {};
        Object.assign(window.__WEB_ARP_TEST__, updates);
        syncPwaTestState();
    }

    /**
     * Reads the currently selected pattern direction from the button group.
     *
     * @returns {string} Pattern direction key.
     */
    function getSelectedPatternDirection() {
        const selectedPatternButton = patternButtons.querySelector('.pattern-btn.selected');
        return selectedPatternButton ? selectedPatternButton.getAttribute('data-pattern') : 'up';
    }

    /**
     * Selects a pattern direction button, falling back to the upward pattern.
     *
     * @param {string} direction - Pattern direction key from preset storage.
     * @returns {void}
     */
    function setSelectedPatternDirection(direction) {
        const nextDirection = direction || 'up';
        let selectedButton = patternButtons.querySelector(`.pattern-btn[data-pattern="${nextDirection}"]`);
        if (!selectedButton) {
            selectedButton = patternButtons.querySelector('.pattern-btn[data-pattern="up"]');
        }

        patternButtons.querySelectorAll('.pattern-btn').forEach((button) => {
            button.classList.toggle('selected', button === selectedButton);
        });
    }

    /**
     * Builds a human-readable label for a stored preset.
     *
     * @param {object} record - Preset record from IndexedDB.
     * @returns {string} Display label for the preset selector.
     */
    function getPresetDisplayName(record) {
        const savedAt = record.savedAt ? new Date(record.savedAt) : null;
        const savedAtLabel = savedAt && !Number.isNaN(savedAt.getTime())
            ? savedAt.toLocaleString()
            : 'Unknown date';
        return record.name || record.filename || `Preset ${savedAtLabel}`;
    }

    /**
     * Reloads the saved preset selector from IndexedDB.
     *
     * @param {string} [selectedId=savedPresetSelect?.value || ''] - Preset id to keep selected.
     * @returns {Promise<object[]>} Saved preset records.
     */
    async function refreshSavedPresetList(selectedId = savedPresetSelect?.value || '') {
        if (!savedPresetSelect) {
            return [];
        }

        if (!window.WebArpPresetStore) {
            savedPresetSelect.innerHTML = '<option value="">Browser storage unavailable</option>';
            savedPresetSelect.disabled = true;
            if (deleteSavedPresetButton) deleteSavedPresetButton.disabled = true;
            if (loadSavedPresetButton) loadSavedPresetButton.disabled = true;
            return [];
        }

        try {
            const records = await window.WebArpPresetStore.list();
            savedPresetSelect.innerHTML = '';

            if (records.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No saved presets';
                savedPresetSelect.appendChild(option);
                savedPresetSelect.disabled = true;
                if (deleteSavedPresetButton) deleteSavedPresetButton.disabled = true;
                return records;
            }

            records.forEach((record) => {
                const option = document.createElement('option');
                option.value = record.id;
                option.textContent = getPresetDisplayName(record);
                savedPresetSelect.appendChild(option);
            });

            savedPresetSelect.disabled = false;
            if (deleteSavedPresetButton) deleteSavedPresetButton.disabled = false;
            if (loadSavedPresetButton) loadSavedPresetButton.disabled = false;
            savedPresetSelect.value = records.some((record) => record.id === selectedId) ? selectedId : records[0].id;
            updateTestState({ savedPresetCount: records.length });
            return records;
        } catch (error) {
            console.warn('Failed to refresh saved presets:', error);
            savedPresetSelect.innerHTML = '<option value="">Unable to load saved presets</option>';
            savedPresetSelect.disabled = true;
            if (deleteSavedPresetButton) deleteSavedPresetButton.disabled = true;
            updateTestState({
                savedPresetCount: 0,
                savedPresetListError: String(error)
            });
            return [];
        }
    }

    /**
     * Persists the current app settings as the last session immediately.
     *
     * @returns {Promise<object|null>} Stored last-session record or null.
     */
    async function saveLastSessionNow() {
        if (!window.WebArpPresetStore || isLoadingStoredSettings) {
            return null;
        }

        try {
            const record = await window.WebArpPresetStore.saveLastSession(getAllSettings());
            updateTestState({
                lastSessionSaved: true,
                lastSessionSavedAt: record.savedAt
            });
            return record;
        } catch (error) {
            console.warn('Failed to save last session:', error);
            updateTestState({
                lastSessionSaved: false,
                lastSessionSaveError: String(error)
            });
            return null;
        }
    }

    /**
     * Debounces last-session persistence after user-editable control changes.
     *
     * @returns {void}
     */
    function scheduleLastSessionSave() {
        if (isLoadingStoredSettings) {
            return;
        }

        window.clearTimeout(lastSessionSaveTimer);
        lastSessionSaveTimer = window.setTimeout(() => {
            void saveLastSessionNow();
        }, 350);
    }

    /**
     * Loads and applies the most recent last-session snapshot if one exists.
     *
     * @returns {Promise<object|null>} Restored last-session record or null.
     */
    async function restoreLastSession() {
        if (!window.WebArpPresetStore) {
            updateTestState({
                lastSessionRestoreFinished: true,
                lastSessionRestored: false
            });
            return null;
        }

        updateTestState({ lastSessionRestoreFinished: false });

        try {
            const record = await window.WebArpPresetStore.loadLastSession();
            if (!record?.settings) {
                updateTestState({
                    lastSessionRestoreFinished: true,
                    lastSessionRestored: false
                });
                return null;
            }

            isLoadingStoredSettings = true;
            loadAllSettings(record.settings);
            isLoadingStoredSettings = false;
            updateTestState({
                lastSessionRestoreFinished: true,
                lastSessionRestored: true,
                lastSessionRestoredPreset: record.settings
            });
            showToast('Restored last session.', 'info');
            return record;
        } catch (error) {
            isLoadingStoredSettings = false;
            console.warn('Failed to restore last session:', error);
            updateTestState({
                lastSessionRestoreFinished: true,
                lastSessionRestored: false,
                lastSessionRestoreError: String(error)
            });
            return null;
        }
    }

    // --- Gemini API Config ---
    const apiKey = ""; // Per instructions, leave empty.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    // --- Tone.js Setup (Moved inside load listener for safety) ---
    let recorder = null;
    let recordedChunks = [];
    let recorderType = null;
    const analyser = new Tone.Analyser('waveform', 1024);

    // NEW: Master Limiter to prevent clipping (Global Fix)
    let limiter;
    try {
        // Instantiation and connecting to destination happens here
        limiter = new Tone.Limiter(0).toDestination();
    } catch (e) {
        console.warn("Tone.Limiter failed, connecting to Destination directly.", e);
    }

    const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 });
    const delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.5, wet: 0.2 }).connect(reverb);
    const filter = new Tone.Filter({ type: 'lowpass', frequency: 4000, Q: 1 }).connect(delay);

    const synths = {
        synth: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 } }),
        fmSynth: new Tone.FMSynth({ harmonicity: 3, modulationIndex: 10, detune: 0, oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.5 } }),
        amSynth: new Tone.AMSynth({ harmonicity: 3, detune: 0, oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.5 } })
    };

    // Connect synths to the start of the chain (filter)
    synths.synth.connect(filter);
    synths.fmSynth.connect(filter);
    synths.amSynth.connect(filter);

    // Connect Reverb to Limiter (which connects to Destination)
    if (limiter) {
        reverb.connect(limiter);
    } else {
        reverb.toDestination();
    }
    reverb.connect(analyser);
    // --- End Tone.js Setup ---


    dutySlider.addEventListener('input', () => {
        dutyValue.textContent = dutySlider.value;
        if (activeSynth && activeSynth.oscillator && currentWaveform === 'square') {
            activeSynth.oscillator.width.value = parseFloat(dutySlider.value);
        }
    });

    /**
     * Sets the active synthesizer, updates UI for advanced params, and updates ADSR.
     *
     * @param {string} type - The key of the synth to use (e.g., 'synth', 'fmSynth').
     * @returns {void}
     */
    function setSynth(type = 'synth') {
        activeSynth = synths[type];

        // Apply current ADSR to new synth
        updateEnvelope();

        // NEW: Always allow waveform selection for all synths (affects carrier)
        waveformButtons.querySelectorAll('button').forEach(btn => {
            btn.disabled = false;
        });

        if (type === 'synth') {
            activeSynth.oscillator.type = currentWaveform;

            advancedSynthParams.classList.add('hidden'); // Hide all advanced

            // 1. Hide "(Carrier)" label for Basic Synth
            if (carrierLabel) carrierLabel.classList.add('hidden');

            // 2. Show "Duty Cycle" selector only for "Square" waveform
            if (currentWaveform === 'square') {
                dutyControl.classList.remove('hidden');
                basicSynthParams.classList.remove('hidden');
            } else {
                dutyControl.classList.add('hidden');
                basicSynthParams.classList.add('hidden');
            }

        } else if (type === 'fmSynth') {
            activeSynth.harmonicity.value = parseFloat(harmonicitySlider.value);
            activeSynth.modulationIndex.value = parseFloat(modIndexSlider.value);
            activeSynth.oscillator.type = currentWaveform;

            advancedSynthParams.classList.remove('hidden'); // Show container
            harmonicityControl.classList.remove('hidden');
            modIndexControl.classList.remove('hidden');

            // Show "(Carrier)" label
            if (carrierLabel) carrierLabel.classList.remove('hidden');

        } else if (type === 'amSynth') {
            activeSynth.harmonicity.value = parseFloat(harmonicitySlider.value);
            activeSynth.oscillator.type = currentWaveform;

            advancedSynthParams.classList.remove('hidden'); // Show container
            harmonicityControl.classList.remove('hidden');
            modIndexControl.classList.add('hidden'); // HIDE mod index

            // Show "(Carrier)" label
            if (carrierLabel) carrierLabel.classList.remove('hidden');
        }
    }

    /**
     * Updates the active synthesizer's ADSR envelope based on slider values.
     *
     * @returns {void}
     */
    function updateEnvelope() {
        if (!activeSynth) return;
        const attack = parseFloat(envAttackSlider.value);
        const decay = parseFloat(envDecaySlider.value);
        const sustain = parseFloat(envSustainSlider.value);
        const release = parseFloat(envReleaseSlider.value);

        // Update the Tone.js object properties
        if (activeSynth.envelope) {
            activeSynth.envelope.attack = attack;
            activeSynth.envelope.decay = decay;
            activeSynth.envelope.sustain = sustain;
            activeSynth.envelope.release = release;
        }
    }

    /**
     * Updates the UI for the quantizer (enables/disables controls).
     *
     * @returns {void}
     */
    function updateScaleQuantizeUi() {
        const isEnabled = scaleQuantizeToggle.checked;
        if (isEnabled) {
            quantizerControls.classList.remove('quantizer-disabled');
            quantizerCard.classList.remove('opacity-70');

            quantizerControls.classList.add('cursor-default');
            quantizerControls.classList.remove('cursor-not-allowed');
        } else {
            quantizerControls.classList.add('quantizer-disabled');
            quantizerCard.classList.add('opacity-70');

            quantizerControls.classList.add('cursor-not-allowed');
            quantizerControls.classList.remove('cursor-default');
        }
    }

    /**
     * Update the visible label and accessibility attributes of the "Scale Quantize"
     * toggle checkbox in the UI to reflect the current quantization state.
     *
     * @returns {void}
     */
    function updateScaleQuantizeToggleText() {
        if (scaleQuantizeToggle.checked) {
            scaleQuantizeToggle.textContent = 'Off';
        } else {
            scaleQuantizeToggle.textContent = 'On';
        }
    }

    // Scale Quantization Toggle Listener
    scaleQuantizeToggle.addEventListener('change', () => {
        if (scaleQuantizeToggle.checked) {
            scaleQuantizeToggleStatus.textContent = 'On';
        } else {
            scaleQuantizeToggleStatus.textContent = 'Off';
        }
        updateScaleQuantizeUi();
    });

    /**
     * Applies scale quantization to a list of notes.
     *
     * @param {string[]} baseNotes - Notes entered by the user.
     * @param {string} root - Scale root note.
     * @param {string} scaleType - Tonal.js scale name.
     * @returns {string[]} Quantized note list, or the original notes on failure.
     */
    function quantizeNotes(baseNotes, root, scaleType) {
        // Check toggle
        if (!scaleQuantizeToggle.checked || scaleType === 'chromatic' || typeof Tonal === 'undefined' || !Tonal) {
            return baseNotes;
        }

        try {
            const scaleName = `${root} ${scaleType}`;
            const scale = Tonal.Scale.get(scaleName);

            if (!scale.notes || scale.notes.length === 0) {
                return baseNotes; // Not a valid scale
            }

            // Manually build the scale range using fundamental functions
            const scalePitchClasses = scale.notes;
            const chromaticPitches = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

            // Generate a wide range of notes (C2 to C7)
            const chromaticRange = [];
            for (let octave = 2; octave < 7; octave++) {
                for (const note of chromaticPitches) {
                    chromaticRange.push(`${note}${octave}`);
                }
            }

            // Filter the chromatic range to only include notes in our scale's pitch classes
            const scaleNotes = chromaticRange.filter(note => {
                if (Tonal && Tonal.Note && Tonal.Note.pitchClass) {
                    return scalePitchClasses.includes(Tonal.Note.pitchClass(note));
                }
                return false; // Fail safe
            });

            if (!scaleNotes || scaleNotes.length === 0) {
                return baseNotes;
            }

            const quantizedNotes = baseNotes.map(note => {
                try {
                    const noteMidi = Tonal.Note.midi(note);
                    if (noteMidi === undefined) return note; // Return original note if invalid

                    // Find the closest note in our generated scale range
                    const closestMidi = scaleNotes.map(Tonal.Note.midi).reduce((prev, curr) => {
                        return (Math.abs(curr - noteMidi) < Math.abs(prev - noteMidi) ? curr : prev);
                    });

                    return Tonal.Note.fromMidi(closestMidi);
                } catch (e) {
                    return note; // Return original note if parsing fails
                }
            });

            return quantizedNotes;

        } catch (e) {
            console.error("Error in quantizeNotes (quantization is disabled):", e);
            return baseNotes;
        }
    }


    /**
     * Generates the full list of notes for the arpeggiator.
     *
     * @param {string[]} baseNotes - User-entered base notes.
     * @param {number} range - Number of octave ranges to generate.
     * @param {number} shift - Octave shift applied to the generated notes.
     * @returns {string[]} Expanded Tone.js-compatible note names.
     */
    function getArpeggioNotes(baseNotes, range, shift) {
        const root = scaleRootSelect.value;
        const type = scaleTypeSelect.value;
        const quantized = quantizeNotes(baseNotes, root, type);

        const notes = [];
        const transpose = shift * 12;

        for (let i = 0; i < range; i++) {
            for (const note of quantized) {
                try {
                    const newNote = Tone.Frequency(note).transpose(transpose + (i * 12));
                    notes.push(newNote.toNote());
                } catch (e) {
                    console.warn("Invalid note:", note);
                }
            }
        }
        return notes.length > 0 ? notes : ['C4'];
    }

    /**
     * Creates or updates the arpeggiator pattern based on current UI settings.
     *
     * @returns {void}
     */
    function createOrUpdatePattern() {
        log("createOrUpdatePattern called.");
        if (arpPattern) {
            arpPattern.stop(0);
            arpPattern.dispose();
        }

        const noteInterval = intervalSelect.value;
        const gateLength = parseFloat(gateSlider.value) * Tone.Time(noteInterval).toSeconds();

        const notesWithOctaves = getArpeggioNotes(currentNotes, currentOctaveRange, currentOctaveShift);
        log(`Pattern updated with ${notesWithOctaves.length} notes.`);

        // Get the selected pattern from the button data-pattern attribute
        const selectedPatternBtn = document.querySelector('.pattern-btn.selected');
        // Default to 'up' if no button is selected
        const patternDirection = selectedPatternBtn ? selectedPatternBtn.getAttribute('data-pattern') : 'up';
        let patternNotes = notesWithOctaves;
        let finalPatternDirection = patternDirection;

        switch (patternDirection) {
            case 'upDownRepeat':
                // Inclusive up/down: [1, 2, 3] -> [1, 2, 3, 3, 2, 1]
                const reversed1 = [...notesWithOctaves].reverse();
                patternNotes = [...notesWithOctaves, ...reversed1];
                finalPatternDirection = 'up';
                log("Custom Pattern: UpDownRepeat converted to explicit sequence.");
                break;
            case 'downUpRepeat':
                const reversed2 = [...notesWithOctaves].reverse();
                patternNotes = [...reversed2, ...notesWithOctaves];
                finalPatternDirection = 'up';
                log("Custom Pattern: DownUpRepeat converted to explicit sequence.");
                break;
            case 'octaveCycle':
                patternNotes = [];
                currentNotes.forEach(baseNote => {
                    // For each base note, play 3 octaves (current, current+1, current+2) twice
                    for (let rep = 0; rep < 2; rep++) {
                        for (let oct = 0; oct < 3; oct++) {
                            const note = Tone.Frequency(baseNote).transpose((currentOctaveShift + oct) * 12).toNote();
                            patternNotes.push(note);
                        }
                    }
                });
                finalPatternDirection = 'up';
                break;
            case 'octaveCycleReverse':
                patternNotes = [];
                currentNotes.forEach(baseNote => {
                    for (let rep = 0; rep < 2; rep++) {
                        for (let oct = 2; oct >= 0; oct--) {
                            patternNotes.push(Tone.Frequency(baseNote).transpose((currentOctaveShift + oct) * 12).toNote());
                        }
                    }
                });
                finalPatternDirection = 'up';
                break;
            case 'octaveCyclePingPong':
                patternNotes = [];
                currentNotes.forEach(baseNote => {
                    // Up: 0,1,2
                    for (let oct = 0; oct < 3; oct++) {
                        patternNotes.push(Tone.Frequency(baseNote).transpose((currentOctaveShift + oct) * 12).toNote());
                    }
                    // Down: 1,0
                    for (let oct = 1; oct >= 0; oct--) {
                        patternNotes.push(Tone.Frequency(baseNote).transpose((currentOctaveShift + oct) * 12).toNote());
                    }
                    // Up again: 1,2
                    for (let oct = 1; oct < 3; oct++) {
                        patternNotes.push(Tone.Frequency(baseNote).transpose((currentOctaveShift + oct) * 12).toNote());
                    }
                });
                finalPatternDirection = 'up';
                break;
            case 'randomWalk':
            case 'randomWalkDrunk':
                patternNotes = [];
                if (notesWithOctaves.length === 0) {
                    patternNotes = ['C4'];
                } else {
                    let currentIndex = Math.floor(Math.random() * notesWithOctaves.length);
                    patternNotes.push(notesWithOctaves[currentIndex]);

                    for (let i = 1; i < 16; i++) {
                        let step;
                        if (patternDirection === 'randomWalk') {
                            // Constrained: only adjacent
                            step = Math.random() > 0.5 ? 1 : -1;
                        } else {
                            // Drunkard: 80% adjacent, 20% leap
                            if (Math.random() < 0.8) {
                                step = Math.random() > 0.5 ? 1 : -1;
                            } else {
                                step = Math.floor(Math.random() * 7) - 3; // -3 to 3
                                if (step === 0) step = 1; // avoid 0
                            }
                        }

                        currentIndex = (currentIndex + step + notesWithOctaves.length) % notesWithOctaves.length;
                        patternNotes.push(notesWithOctaves[currentIndex]);
                    }
                }
                finalPatternDirection = 'up';
                break;
        }

        arpPattern = new Tone.Pattern(
            (time, note) => {
                if (activeSynth) {
                    activeSynth.triggerAttackRelease(note, gateLength, time);
                }
            },
            patternNotes,
            finalPatternDirection
        );

        arpPattern.interval = noteInterval;
        if (isPlaying) {
            arpPattern.start(0);
        }
    }

    /**
     * Updates the visual state of a button group.
     *
     * @param {HTMLElement} container - Button group container.
     * @param {string|number} selectedValue - Value that should be selected.
     * @param {string} dataAttribute - Data attribute holding each button value.
     * @returns {void}
     */
    function updateButtonGroup(container, selectedValue, dataAttribute) {
        container.querySelectorAll('button').forEach(btn => {
            // Added padding classes here
            btn.className = 'octave-btn px-3 py-1 text-sm font-medium rounded-md cursor-pointer transition-all';

            const btnVal = btn.getAttribute(dataAttribute);

            if (btnVal == selectedValue) { // Use == for flexible comparison (string vs number)
                btn.classList.add('bg-blue-600', 'text-white', 'shadow');
            } else {
                btn.classList.add('bg-gray-800', 'text-gray-300', 'hover:bg-gray-700');
            }
        });
    }

    /**
     * Updates the visual state of the waveform button group.
     *
     * @param {string} selectedWave - Waveform key that should be selected.
     * @returns {void}
     */
    function updateWaveformButtons(selectedWave) {
        waveformButtons.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-wave') === selectedWave) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }

    /**
     * Formats seconds into a MM:SS.s string.
     *
     * @param {number} seconds - Duration in seconds.
     * @returns {string} Formatted time label.
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
     * Handles resizing the visualizer canvas to match its displayed size.
     *
     * @returns {void}
     */
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = visualizerCanvas.getBoundingClientRect();
        visualizerCanvas.width = rect.width * dpr;
        visualizerCanvas.height = rect.height * dpr;
        visualizerCtx.scale(dpr, dpr);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Init once

    /**
     * Main UI update loop. Runs when transport is playing OR when recording.
     * Handles visualizer and recording timer.
     *
     * @returns {void}
     */
    function runUiUpdate() {
        if (isVisualizerOn && analyser) {
            try {
                const waveform = analyser.getValue();

                const dpr = window.devicePixelRatio || 1;
                visualizerCtx.clearRect(0, 0, visualizerCanvas.width / dpr, visualizerCanvas.height / dpr);

                // Use local padding variables so it's easier to tweak spacing
                const leftPadding = 30;
                const rightPadding = 10;
                const topPadding = 10;
                const bottomPadding = 36;

                // Get logical dimensions
                const canvasLogicalWidth = visualizerCanvas.width / dpr;
                const canvasLogicalHeight = visualizerCanvas.height / dpr;

                // Tick and label spacing settings
                const tickLength = 8;
                const xLabelOffset = 28;
                const yLabelOffsetFromTicks = 40;

                // Draw waveform first
                visualizerCtx.beginPath();
                const plotWidth = canvasLogicalWidth - leftPadding - rightPadding;
                const plotHeight = canvasLogicalHeight - topPadding - bottomPadding;
                visualizerCtx.strokeStyle = '#38BDF8';
                visualizerCtx.lineWidth = 2;

                for (let i = 0; i < waveform.length; i++) {
                    const x = leftPadding + (i / waveform.length) * plotWidth;
                    const y = canvasLogicalHeight - bottomPadding - (waveform[i] + 1) * plotHeight / 2;
                    if (i === 0) {
                        visualizerCtx.moveTo(x, y);
                    } else {
                        visualizerCtx.lineTo(x, y);
                    }
                }
                visualizerCtx.stroke();

                // Draw axes and labels
                visualizerCtx.strokeStyle = '#9CA3AF'; // gray-400
                visualizerCtx.lineWidth = 1;
                visualizerCtx.font = '10px Arial';
                visualizerCtx.fillStyle = '#9CA3AF'; // gray-400

                // Draw axes
                visualizerCtx.beginPath();
                // X-axis
                visualizerCtx.moveTo(leftPadding, canvasLogicalHeight - bottomPadding);
                visualizerCtx.lineTo(canvasLogicalWidth - rightPadding, canvasLogicalHeight - bottomPadding);
                // Y-axis
                visualizerCtx.moveTo(leftPadding, topPadding);
                visualizerCtx.lineTo(leftPadding, canvasLogicalHeight - bottomPadding);
                visualizerCtx.stroke();

                // Draw X-axis ticks and labels
                const xTicks = [0, 0.25, 0.5, 0.75, 1.0];
                xTicks.forEach(tick => {
                    const x = leftPadding + tick * plotWidth;
                    visualizerCtx.beginPath();
                    visualizerCtx.moveTo(x, canvasLogicalHeight - bottomPadding);
                    visualizerCtx.lineTo(x, canvasLogicalHeight - bottomPadding + tickLength);
                    visualizerCtx.stroke();

                    visualizerCtx.textAlign = 'center';
                    visualizerCtx.textBaseline = 'top';
                    visualizerCtx.fillText(`${tick}s`, x, canvasLogicalHeight - bottomPadding + tickLength + xLabelOffset);
                });

                // Draw Y-axis ticks and labels
                const yTicks = [-1, -0.5, 0, 0.5, 1];
                yTicks.forEach(tick => {
                    const normalized = (tick + 1) / 2; // -1..1 -> 0..1
                    const y = canvasLogicalHeight - bottomPadding - normalized * plotHeight;
                    visualizerCtx.beginPath();
                    visualizerCtx.moveTo(leftPadding - tickLength, y);
                    visualizerCtx.lineTo(leftPadding, y);
                    visualizerCtx.stroke();

                    visualizerCtx.textAlign = 'right';
                    visualizerCtx.textBaseline = 'middle';
                    visualizerCtx.fillText(tick.toString(), leftPadding - tickLength - 6, y);
                });

                // Draw axis labels
                visualizerCtx.textAlign = 'center';
                visualizerCtx.font = '12px Arial';
                visualizerCtx.textBaseline = 'top';
                visualizerCtx.fillText('Time', canvasLogicalWidth / 2, canvasLogicalHeight - bottomPadding + tickLength + xLabelOffset + 2);

                // Draw rotated "Amplitude" label
                visualizerCtx.save();
                const amplitudeTranslateX = leftPadding - yLabelOffsetFromTicks;
                visualizerCtx.translate(amplitudeTranslateX, canvasLogicalHeight / 2);
                visualizerCtx.rotate(-Math.PI / 2);
                visualizerCtx.textAlign = 'center';
                visualizerCtx.textBaseline = 'middle';
                visualizerCtx.fillText('Amplitude', 0, 0);
                visualizerCtx.restore();

            } catch (e) {
                console.error("Visualizer error:", e);
                isVisualizerOn = false; // Stop trying if it fails
            }
        }

        if (isRecording) {
            const elapsed = Tone.now() - recordingStartTime;
            recordButton.textContent = `Stop Recording (${formatTime(elapsed)})`;
        }
    }

    /**
     * Starts the Tone.Loop for UI updates.
     *
     * @returns {void}
     */
    function startUiLoop() {
        if (!uiUpdateLoop) {
            uiUpdateLoop = new Tone.Loop(runUiUpdate, '30hz').start(0);
        }
    }

    /**
     * Stops the Tone.Loop for UI updates.
     *
     * @returns {void}
     */
    function stopUiLoop() {
        if (uiUpdateLoop && !isPlaying && !isRecording) {
            uiUpdateLoop.stop(0);
            uiUpdateLoop.dispose();
            uiUpdateLoop = null;
        }
    }

    // Pattern button selection
    patternButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('button.pattern-btn');
        if (!btn) return;

        // Update UI
        patternButtons.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        // Update pattern
        createOrUpdatePattern();
    });

    // --- Event Listeners ---

    playStopButton.addEventListener('click', async () => {
        log("Play/Stop button clicked.");
        await startAudio();

        // ** CRITICAL FIX: Robust Recording Initialization **
        if (!recorder) {
            log("Initializing recorder...");
            let mediaRecorderSuccess = false;

            // Prioritize Tone.Recorder in potentially insecure environments (Canvas, HTTP)
            // ToneRecorder works regardless of HTTPS status.
            try {
                log("Attempting Tone.Recorder fallback first...");
                recorder = new Tone.Recorder();
                reverb.connect(recorder); // Connect output to Tone.Recorder
                recorderType = 'ToneRecorder';
                log("Success: Using fallback Tone.Recorder API.");
                recordStatus.textContent = "Ready to record (Tone.Recorder).";
                showToast("Recorder ready (Fallback)", "info");
            } catch (e) {
                log("Tone.Recorder failed. Trying MediaRecorder (requires HTTPS).", e);

                // Attempt MediaRecorder only if ToneRecorder fails AND if MediaRecorder API exists
                if (window.isSecureContext && typeof MediaRecorder !== 'undefined') {
                    try {
                        // Fix: Access the raw Web Audio Context to call createMediaStreamDestination
                        const dest = Tone.getContext().rawContext.createMediaStreamDestination();
                        reverb.connect(dest);
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
                        log("Success: Using MediaRecorder API.");
                        recordStatus.textContent = "Ready to record (MediaRecorder).";
                        showToast("Recorder ready (Native)", "success");
                    } catch (e) {
                        log("MediaRecorder also failed.", e);
                        recorder = null;
                    }
                }

                if (!recorder) {
                    log("CRITICAL: All recording methods failed.");
                    recordButton.disabled = true;
                    recordStatus.textContent = "Recording not available on this device.";
                    showToast("Recording not supported.", "error");
                }
            }
        }

        // Enable button if recorder exists
        if (recorder) {
            recordButton.disabled = false;
        }

        // Ensure arpeggiator pattern is updated and scheduled at playback
        log("Scheduling arpeggiator pattern before transport start...");
        createOrUpdatePattern();

        // Now, just control the transport
        if (isPlaying) {
            Tone.Transport.stop();
            if (arpPattern) arpPattern.stop();
            playStopButton.textContent = 'Restart Audio';
            playStopButton.classList.remove('bg-yellow-600', 'hover:bg-yellow-700');
            // playStopButton.classList.remove('bg-orange-600', 'hover:bg-orange-700');
            playStopButton.classList.add('bg-blue-600', 'hover:bg-blue-700');
            // playStopButton.classList.remove('animate-pulse');
            isPlaying = false;
            log("Transport stopped.");
        } else {
            if (arpPattern) arpPattern.start();
            Tone.Transport.start();
            playStopButton.textContent = 'Stop Audio';
            playStopButton.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
            playStopButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            // playStopButton.classList.remove('bg-orange-600', 'hover:bg-orange-700');
            // playStopButton.classList.remove('animate-pulse');
            isPlaying = true;
            log("Transport started.");
        }

        if (isPlaying) {
            startUiLoop();
        } else {
            stopUiLoop();
        }
    });

    // --- ADSR Listeners ---
    envAttackSlider.addEventListener('input', () => { envAttackValue.textContent = envAttackSlider.value; updateEnvelope(); });
    envDecaySlider.addEventListener('input', () => { envDecayValue.textContent = envDecaySlider.value; updateEnvelope(); });
    envSustainSlider.addEventListener('input', () => { envSustainValue.textContent = envSustainSlider.value; updateEnvelope(); });
    envReleaseSlider.addEventListener('input', () => { envReleaseValue.textContent = envReleaseSlider.value; updateEnvelope(); });


    aiGenerateButton.addEventListener('click', async () => {
        log("AI Generate button clicked.");
        const userPrompt = aiPromptInput.value.trim();
        if (!userPrompt) {
            aiStatus.textContent = "Please enter a prompt.";
            return;
        }

        aiGenerateButton.disabled = true;
        aiGenerateButton.textContent = 'Generating...';
        aiStatus.textContent = 'Contacting AI...';

        const systemPrompt = "You are a music theory assistant. Your goal is to provide a short, usable arpeggio sequence based on the user's prompt. You MUST respond with only a space-separated list of notes in Tone.js format (e.g., 'C4 E4 G4' or 'A3 C4 E4 G4'). Do not include any other text, explanation, or markdown. The list should be between 3 and 7 notes long.";

        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
        };

        try {
            const result = await fetchWithBackoff(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
                notesInput.value = text.trim();
                notesInput.dispatchEvent(new Event('change'));
                aiStatus.textContent = 'Notes updated!';
                log("AI notes generated and applied.");
            } else {
                console.error("AI response was empty or malformed:", result);
                aiStatus.textContent = "AI returned an empty response.";
            }

        } catch (error) {
            console.error('Gemini API call failed:', error);
            aiStatus.textContent = 'Error calling AI. See console.';
        } finally {
            aiGenerateButton.disabled = false;
            aiGenerateButton.textContent = 'Generate Notes';
            setTimeout(() => {
                if (aiStatus.textContent === 'Notes updated!') {
                    aiStatus.textContent = '';
                }
            }, 3000);
        }
    });

    // Transport & Pattern
    bpmSlider.addEventListener('input', () => {
        Tone.Transport.bpm.value = parseInt(bpmSlider.value);
        bpmValue.textContent = bpmSlider.value;
    });

    swingSlider.addEventListener('input', () => {
        Tone.Transport.swing = parseFloat(swingSlider.value);
        swingValue.textContent = parseFloat(swingSlider.value).toFixed(2);
    });

    notesInput.addEventListener('change', () => {
        currentNotes = notesInput.value.trim().split(/\s+/).filter(Boolean);
        if (currentNotes.length === 0) currentNotes = ['C4'];
        createOrUpdatePattern();
    });
    notesInput.addEventListener('input', () => {
        currentNotes = notesInput.value.trim().split(/\s+/).filter(Boolean);
        if (currentNotes.length === 0) currentNotes = ['C4'];
    });

    scaleQuantizeToggle.addEventListener('change', () => {
        updateScaleQuantizeUi();
        createOrUpdatePattern();
        updateScaleQuantizeToggleText();
    });
    scaleRootSelect.addEventListener('change', createOrUpdatePattern);
    scaleTypeSelect.addEventListener('change', createOrUpdatePattern);


    intervalSelect.addEventListener('change', createOrUpdatePattern);

    // Synth & Effects
    synthTypeSelect.addEventListener('change', () => {
        setSynth(synthTypeSelect.value);
        createOrUpdatePattern();
    });

    // NEW Waveform listener
    waveformButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('button.waveform-btn');
        if (!btn) return;

        currentWaveform = btn.getAttribute('data-wave');
        log(`Waveform changed to: ${currentWaveform}`);

        updateWaveformButtons(currentWaveform);

        // Reapply synth settings and waveform (handles duty cycle reset if needed)
        setSynth(synthTypeSelect.value);
    });

    harmonicitySlider.addEventListener('input', () => {
        const val = parseFloat(harmonicitySlider.value);
        if (activeSynth && activeSynth.harmonicity) {
            activeSynth.harmonicity.value = val;
        }
        harmonicityValue.textContent = val.toFixed(1);
    });

    modIndexSlider.addEventListener('input', () => {
        const val = parseFloat(modIndexSlider.value);
        if (activeSynth && activeSynth.modulationIndex) {
            activeSynth.modulationIndex.value = val;
        }
        modIndexValue.textContent = val.toFixed(1);
    });

    octaveShiftButtons.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentOctaveShift = parseInt(e.target.getAttribute('data-shift'));
            updateButtonGroup(octaveShiftButtons, currentOctaveShift, 'data-shift');
            createOrUpdatePattern();
        }
    });

    octaveRangeButtons.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentOctaveRange = parseInt(e.target.getAttribute('data-range'));
            updateButtonGroup(octaveRangeButtons, currentOctaveRange, 'data-range');
            createOrUpdatePattern();
        }
    });

    gateSlider.addEventListener('input', () => {
        gateValue.textContent = parseFloat(gateSlider.value).toFixed(2);
        createOrUpdatePattern();
    });

    filterCutoffSlider.addEventListener('input', () => {
        const freq = parseFloat(filterCutoffSlider.value);
        filter.frequency.value = freq;
        filterCutoffValue.textContent = freq.toFixed(0);
    });

    filterResonanceSlider.addEventListener('input', () => {
        const res = parseFloat(filterResonanceSlider.value);
        filter.Q.value = res;
        filterResonanceValue.textContent = res.toFixed(1);
    });

    delayMixSlider.addEventListener('input', () => {
        const mix = parseFloat(delayMixSlider.value);
        delay.wet.value = mix;
        delayMixValue.textContent = mix.toFixed(2);
    });

    reverbMixSlider.addEventListener('input', () => {
        const mix = parseFloat(reverbMixSlider.value);
        reverb.wet.value = mix;
        reverbMixValue.textContent = mix.toFixed(2);
    });

    // --- KEYBOARD LOGIC ---
    const keyboardMapping = {
        // Lower Octave (Z-M row)
        'z': 'C4', 's': 'C#4', 'x': 'D4', 'd': 'D#4', 'c': 'E4', 'v': 'F4', 'g': 'F#4', 'b': 'G4', 'h': 'G#4', 'n': 'A4', 'j': 'A#4', 'm': 'B4',
        // Upper Octave (Q-I row) - Using QWERTY layout, mapping keys visually closer to sharps/flats
        'q': 'C5', '2': 'C#5', 'w': 'D5', '3': 'D#5', 'e': 'E5', 'r': 'F5', '5': 'F#5', 't': 'G5', '6': 'G#5', 'y': 'A5', '7': 'A#5', 'u': 'B5', 'i': 'C6',
    };

    // Keyboard Visuals - Mapping according to keyboard layout
    const visualKeysData = [
        // Octave 4 - notes C4 through B4 (Z-row; keys 'Z' through 'M')
        { note: 'C4', label: 'Z', type: 'white' },
        { note: 'C#4', label: 'S', type: 'black' },
        { note: 'D4', label: 'X', type: 'white' },
        { note: 'D#4', label: 'D', type: 'black' },
        { note: 'E4', label: 'C', type: 'white' },
        { note: 'F4', label: 'V', type: 'white' },
        { note: 'F#4', label: 'G', type: 'black' },
        { note: 'G4', label: 'B', type: 'white' },
        { note: 'G#4', label: 'H', type: 'black' },
        { note: 'A4', label: 'N', type: 'white' },
        { note: 'A#4', label: 'J', type: 'black' },
        { note: 'B4', label: 'M', type: 'white' },
        // Octave 5 - notes C5 through B5 (Q-row; keys 'Q' through 'U')
        { note: 'C5', label: 'Q', type: 'white' },
        { note: 'C#5', label: '2', type: 'black' },
        { note: 'D5', label: 'W', type: 'white' },
        { note: 'D#5', label: '3', type: 'black' },
        { note: 'E5', label: 'E', type: 'white' },
        { note: 'F5', label: 'R', type: 'white' },
        { note: 'F#5', label: '5', type: 'black' },
        { note: 'G5', label: 'T', type: 'white' },
        { note: 'G#5', label: '6', type: 'black' },
        { note: 'A5', label: 'Y', type: 'white' },
        { note: 'A#5', label: '7', type: 'black' },
        { note: 'B5', label: 'U', type: 'white' },
        // Octave 6 - note C6 (I-row; key 'I')
        { note: 'C6', label: 'I', type: 'white' },
    ];

    const keyboardMainWrapper = document.getElementById('keyboard-visual');
    keyboardMainWrapper.id = 'keyboard-main-wrapper';
    keyboardMainWrapper.classList.remove('flex', 'justify-center', 'items-start', 'h-20', 'select-none');

    // Create new divs for octaves
    const octave1Wrapper = document.createElement('div');
    octave1Wrapper.id = 'keyboard-octave-1';
    octave1Wrapper.classList.add('piano-octave');
    const octave2Wrapper = document.createElement('div');
    octave2Wrapper.id = 'keyboard-octave-2';
    octave2Wrapper.classList.add('piano-octave');

    keyboardMainWrapper.innerHTML = '';
    keyboardMainWrapper.appendChild(octave1Wrapper);
    keyboardMainWrapper.appendChild(octave2Wrapper);

    // Logic to determine which octave wrapper to append keys to
    let currentOctaveTarget = octave1Wrapper;
    let whiteKeyIndexInCurrentOctave = 0;

    const whiteKeyWidthPx = 40;
    const blackKeyWidthPx = 24;

    visualKeysData.forEach(k => {
        if (k.note === 'C5') {
            currentOctaveTarget = octave2Wrapper;
            whiteKeyIndexInCurrentOctave = 0;
        }

        const el = document.createElement('div');
        el.classList.add('piano-key');
        el.dataset.note = k.note;
        el.dataset.keylabel = k.label.toLowerCase();
        el.textContent = k.label;

        if (k.type === 'white') {
            el.classList.add('key-white');
            el.style.width = `${whiteKeyWidthPx}px`;
            el.style.height = '4.5rem';
            el.style.zIndex = '0';
            el.style.marginLeft = '-1px';
            el.dataset.whiteKeyIndex = whiteKeyIndexInCurrentOctave;
            whiteKeyIndexInCurrentOctave++;
        } else {
            el.classList.add('key-black');
            el.style.width = `${blackKeyWidthPx}px`;
            el.style.height = '2.5rem';
            el.style.position = 'absolute';
            el.style.top = '0';
            el.style.zIndex = '10';

            let baseWhiteKeyIndexOffset = 0;
            switch (k.note) {
                case 'C#4':
                case 'C#5':
                    baseWhiteKeyIndexOffset = 0;
                    break;
                case 'D#4':
                case 'D#5':
                    baseWhiteKeyIndexOffset = 1;
                    break;
                case 'F#4':
                case 'F#5':
                    baseWhiteKeyIndexOffset = 3;
                    break;
                case 'G#4':
                case 'G#5':
                    baseWhiteKeyIndexOffset = 4;
                    break;
                case 'A#4':
                case 'A#5':
                    baseWhiteKeyIndexOffset = 5;
                    break;
                default:
                    console.warn(`Unexpected black key: ${k.note}`);
                    break;
            }

            // Adjust for the -1px margin applied to white keys after the first one.
            // To center the black key over the *intersection* of two white keys:
            // Start from the left edge of the preceding white key (baseWhiteKeyIndexOffset * whiteKeyWidthPx)
            // Add the full width of that white key to get to its right edge
            // Subtract half the black key's width to center it on that boundary.
            // Also account for the -1px margin for each preceding white key.
            const cumulativeMarginOffset = baseWhiteKeyIndexOffset * 1; // 1px for each white key border overlap
            const leftPosition = (baseWhiteKeyIndexOffset * whiteKeyWidthPx) + whiteKeyWidthPx - (blackKeyWidthPx / 2) - cumulativeMarginOffset;
            el.style.left = `${leftPosition}px`;
            el.style.pointerEvents = 'auto';
        }

        el.addEventListener('mousedown', (e) => { e.preventDefault(); triggerKey(k.note); });
        el.addEventListener('mouseup', (e) => { e.preventDefault(); releaseKey(k.note); });
        el.addEventListener('mouseleave', () => releaseKey(k.note));
        el.addEventListener('touchstart', (e) => { e.preventDefault(); triggerKey(k.note); });
        el.addEventListener('touchend', () => releaseKey(k.note));

        currentOctaveTarget.appendChild(el);
    });

    /**
     * Triggers an attack for a given note if keyboard input is enabled.
     *
     * @param {string} note - The note string (e.g., 'C4').
     * @returns {void}
     */
    function triggerKey(note) {
        if (activeSynth && isAudioContextStarted && keyboardToggle.checked) {
            // 1. Always release the CURRENT active note (even if it's the same one, for retriggering)
            if (activeNote) {
                // Monophonic synth triggerRelease takes (time), NOT (note, time)
                activeSynth.triggerRelease(Tone.now());
                highlightKey(activeNote, false);
            }

            // 2. Trigger the new note
            activeSynth.triggerAttack(note, Tone.now());
            activeNote = note;
            highlightKey(note, true);
        }
    }

    /**
     * Releases the attack for a given note.
     *
     * @param {string} note - The note string (e.g., 'C4').
     * @returns {void}
     */
    function releaseKey(note) {
        // Only release if the note passed in is ACTUALLY the active note.
        if (activeSynth && isAudioContextStarted && activeNote === note) {
            // Monophonic synth triggerRelease takes (time), NOT (note, time)
            activeSynth.triggerRelease(Tone.now());
            highlightKey(note, false);
            activeNote = null;
        }
    }

    /**
     * Visually highlights a key in the virtual keyboard.
     *
     * @param {string} note - The note string (e.g., 'C4').
     * @param {boolean} on - True to highlight, false to release.
     * @returns {void}
     */
    function highlightKey(note, on) {
        const el = document.querySelector(`.piano-key[data-note="${note}"]`);
        if (el) {
            if (on) el.classList.add('active');
            else el.classList.remove('active');
        }
    }

    window.addEventListener('keydown', (e) => {
        if (e.repeat || e.target.tagName === 'INPUT' || !keyboardToggle.checked) return;
        const key = e.key.toLowerCase();
        const note = keyboardMapping[key];
        if (note) {
            e.preventDefault();
            triggerKey(note);
        }
    });

    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        const note = keyboardMapping[key];
        if (note) {
            releaseKey(note);
        }
    });

    // Keyboard Toggle Listener
    keyboardToggle.addEventListener('change', () => {
        if (keyboardToggle.checked) {
            keyboardToggleStatus.textContent = 'On';
        } else {
            keyboardToggleStatus.textContent = 'Off';
            // Stop any currently playing keyboard notes when toggle is turned off
            if (activeNote) {
                activeSynth.triggerRelease(Tone.now());
                highlightKey(activeNote, false);
                activeNote = null;
            }
        }
        updateKeyboardControlUi();
    });

    /**
     * Updates the UI for the keyboard (enables/disables controls).
     * Similar to `updateQuantizeUi()`.
     *
     * @returns {void}
     */
    function updateKeyboardControlUi() {
        const isEnabled = keyboardToggle.checked;
        if (isEnabled) {
            // keyboardVisualrControls.classList.remove('quantizer-disabled');
            keyboardMainWrapper.classList.remove('opacity-60');
            keyboardDescription.classList.remove('opacity-60');

            keyboardMainWrapper.classList.add('cursor-default');
            keyboardMainWrapper.classList.remove('cursor-not-allowed');

            keyboardDescription.classList.add('cursor-default');
            keyboardDescription.classList.remove('cursor-not-allowed');
        } else {
            // keyboardVisual.classList.add('quantizer-disabled');
            keyboardMainWrapper.classList.add('opacity-60');
            keyboardDescription.classList.add('opacity-60');

            keyboardMainWrapper.classList.add('cursor-not-allowed');
            keyboardMainWrapper.classList.remove('cursor-default');

            keyboardDescription.classList.add('cursor-not-allowed');
            keyboardDescription.classList.remove('cursor-default');
        }
    }

    /**
     * Updates recording UI state after the recorder produces a Blob.
     *
     * @returns {void}
     */
    function onRecordingStop() {
        recordButton.textContent = 'Record';
        recordButton.classList.remove('recording');
        recordStatus.textContent = "Recording stopped. Ready to export.";
        exportControls.classList.remove('hidden');
        recordButton.disabled = false;
        exportButton.disabled = false;
        exportButton.textContent = 'Export Files';
        log("Recording stopped and Blob created.");
    }

    // --- Real-time Record Button ---
    recordButton.addEventListener('click', () => {
        if (isRecording) {
            log("Stopping recording...");
            isRecording = false;
            if (recorderType === 'MediaRecorder') {
                recorder.stop();
                // onRecordingStop is called in onstop event
            } else if (recorderType === 'ToneRecorder') {
                recorder.stop().then(blob => {
                    liveRecordedWavBlob = blob;
                    onRecordingStop();
                });
            }
        } else {
            if (!isAudioContextStarted) {
                showToast("Please start audio playback first.", "error");
                return;
            }
            if (!recorder) {
                // This block should only try to initialize if needed (should be done on play/stop button already)
                showToast("Recorder not initialized. Try starting playback first.", "error");
                return;
            }

            log(`Starting recording using ${recorderType}...`);
            liveRecordedWavBlob = null;

            if (recorderType === 'MediaRecorder') {
                recordedChunks = [];
                recorder.start();
            } else if (recorderType === 'ToneRecorder') {
                recorder.start();
            }

            recordButton.classList.add('recording');
            exportControls.classList.add('hidden');
            recordStatus.textContent = "Recording... Click again to stop.";
            recordingStartTime = Tone.now();
            recordButton.textContent = 'Stop Recording (00:00.0)';
            isRecording = true;
        }

        if (isRecording) {
            startUiLoop();
        } else {
            stopUiLoop();
        }
    });

    // --- Real-time Export Button ---
    exportButton.addEventListener('click', async () => {
        log("Real-time export button clicked.");

        if (!liveRecordedWavBlob) {
            log("No recording blob found.");
            showToast("No recording found.", "error");
            return;
        }

        // NEW: Check blob size
        if (liveRecordedWavBlob.size < 1000) {
            log("Recording blob is empty.");
            showToast("Recording failed! No audio was captured.", "error");
            return;
        }

        if (!exportWavCheck.checked && !exportMp3Check.checked) {
            recordStatus.textContent = "Please select at least one format.";
            return;
        }

        exportButton.disabled = true;
        exportButton.textContent = 'Exporting...';

        const filename = generateFilename(true);

        if (exportWavCheck.checked) {
            log("Exporting real-time WAV...");
            recordStatus.textContent = "Exporting WAV...";
            showToast("Exporting WAV...", "info");
            downloadBlob(liveRecordedWavBlob, `${filename}.wav`);
            showToast("Exported WAV file!", "info");
            // Add a short delay here if both export formats are checked
            if (exportMp3Check.checked) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        if (exportMp3Check.checked) {
            log("Exporting real-time MP3...");
            recordStatus.textContent = "Encoding MP3... (this may take a moment)";
            showToast("Encoding MP3...", "info");
            try {
                const audioBuffer = await Tone.getContext().decodeAudioData(await liveRecordedWavBlob.arrayBuffer());
                const mp3Blob = await audioBufferToMp3Blob(audioBuffer);
                downloadBlob(mp3Blob, `${filename}.mp3`);

                recordStatus.textContent = "Export complete!";
                showToast("Exported MP3 file!", "success");
            } catch (e) {
                console.error("MP3 encoding failed:", e);
                recordStatus.textContent = "MP3 encoding failed. See console.";
                showToast("MP3 encoding failed.", "error");
            }
        } else if (exportWavCheck.checked) {
            recordStatus.textContent = "Export complete!";
            showToast("Export complete!", "success");
        }

        exportButton.disabled = false;
        exportButton.textContent = 'Export Files';
    });

    // --- Offline Export Button ---
    offlineExportButton.addEventListener('click', async () => {
        log("Offline export button clicked.");
        if (!offlineExportWavCheck.checked && !offlineExportMp3Check.checked) {
            offlineExportStatus.textContent = "Please select at least one format.";
            return;
        }

        // Check if audio context is started
        if (!isAudioContextStarted) {
            showToast("Please start audio playback first.", "error");
            return;
        }

        offlineExportButton.disabled = true;
        offlineExportButton.textContent = 'Generating...';
        offlineExportStatus.textContent = "Generating audio... please wait.";

        const settings = getAllSettings();
        const filename = generateFilename(false);
        log(`Offline export started for ${settings.loopCount} loops.`);

        const originalBpm = Tone.Transport.bpm.value;
        Tone.Transport.bpm.value = settings.bpm;

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

        // Restore main transport BPM
        Tone.Transport.bpm.value = originalBpm;

        try {
            const audioBuffer = await Tone.Offline(async (offlineContext) => {
                offlineContext.transport.bpm.value = settings.bpm;
                offlineContext.transport.swing = settings.swing;

                // OFFLINE LIMITER
                let offlineLimiter;
                try {
                    offlineLimiter = new Tone.Limiter(0).toDestination();
                } catch (e) {
                    // fallback if Limiter missing in this tone version context
                }

                const offlineReverb = new Tone.Reverb({ decay: 1.5, wet: settings.reverbMix });
                const offlineDelay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.5, wet: settings.delayMix }).connect(offlineReverb);
                const offlineFilter = new Tone.Filter({ type: 'lowpass', frequency: settings.filterCutoff, Q: settings.filterResonance }).connect(offlineDelay);

                let offlineSynth;
                if (settings.synthType === 'fmSynth') {
                    offlineSynth = new Tone.FMSynth(synths.fmSynth.get());
                    offlineSynth.harmonicity.value = settings.harmonicity;
                    offlineSynth.modulationIndex.value = settings.modulationIndex;
                } else if (settings.synthType === 'amSynth') {
                    offlineSynth = new Tone.AMSynth(synths.amSynth.get());
                    offlineSynth.harmonicity.value = settings.harmonicity;
                } else {
                    offlineSynth = new Tone.Synth(synths.synth.get());
                }
                offlineSynth.oscillator.type = settings.waveform;
                offlineSynth.connect(offlineFilter);

                // Apply Envelope Settings
                const attack = parseFloat(envAttackSlider.value);
                const decay = parseFloat(envDecaySlider.value);
                const sustain = parseFloat(envSustainSlider.value);
                const release = parseFloat(envReleaseSlider.value);

                if (offlineSynth.envelope) {
                    offlineSynth.envelope.attack = attack;
                    offlineSynth.envelope.decay = decay;
                    offlineSynth.envelope.sustain = sustain;
                    offlineSynth.envelope.release = release;
                }

                if (offlineLimiter) {
                    offlineReverb.connect(offlineLimiter);
                } else {
                    offlineReverb.connect(offlineContext.destination);
                }

                // *** OFFLINE BUG FIX ***
                // Calculate gate *inside* the offline context, using its own transport
                const gateLength = settings.gateRatio * Tone.Time(settings.interval).toSeconds();

                // ** FIX: Replicate Custom Pattern Logic for Offline Render **
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

                offlineContext.transport.start(0); // Start transport at time 0

            }, totalDuration + 2.0); // Add 2 seconds for reverb tail

            // NEW: Check buffer size (check number of samples)
            if (audioBuffer.length < 1000) {
                log("Offline buffer is empty.");
                showToast("Offline generation failed! No audio was created.", "error");
                offlineExportStatus.textContent = "Offline rendering failed.";
                offlineExportButton.disabled = false;
                offlineExportButton.textContent = 'Generate & Export';
                return;
            }

            if (offlineExportWavCheck.checked) {
                offlineExportStatus.textContent = "Exporting WAV...";
                log("Offline export: Exporting WAV...");
                showToast("Exporting WAV...", "info");
                const generatedWavBlob = audioBufferToWav(audioBuffer);
                downloadBlob(generatedWavBlob, `${filename}.wav`);

                if (offlineExportMp3Check.checked) {
                    await new Promise(resolve => setTimeout(resolve, 250)); // 250ms delay
                }
            }

            if (offlineExportMp3Check.checked) {
                offlineExportStatus.textContent = "Encoding MP3...";
                log("Offline export: Encoding MP3...");
                showToast("Encoding MP3...", "info");
                const mp3Blob = await audioBufferToMp3Blob(audioBuffer);
                downloadBlob(mp3Blob, `${filename}.mp3`);
            }

            offlineExportStatus.textContent = "Offline export complete!";
            showToast("Export complete!", "success");
            log("Offline export complete.");

        } catch (e) {
            console.error("Offline rendering failed:", e);
            offlineExportStatus.textContent = "Offline rendering failed. See console.";
            showToast("Offline render failed.", "error");
        } finally {
            offlineExportButton.disabled = false;
            offlineExportButton.textContent = 'Generate & Export';
        }
    });

    // --- Utility & Preset Listeners ---

    toggleVisualizerButton.addEventListener('click', () => {
        isVisualizerOn = !isVisualizerOn;
        log(`Visualizer toggled: ${isVisualizerOn}`);
        if (isVisualizerOn) {
            toggleVisualizerButton.textContent = "Disable Visualizer";
            toggleVisualizerButton.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
            toggleVisualizerButton.classList.remove('bg-gray-600', 'hover:bg-gray-500');
        } else {
            toggleVisualizerButton.textContent = "Enable Visualizer";
            toggleVisualizerButton.classList.remove('bg-yellow-600', 'hover:bg-yellow-700');
            toggleVisualizerButton.classList.add('bg-gray-600', 'hover:bg-gray-500');
            visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        }
    });

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
                updateTestState({
                    lastSaveError: String(storeError),
                    lastSaveFinished: true
                });
                showToast('Preset downloaded, but browser save failed.', 'info');
                return;
            }
        } else {
            updateTestState({
                lastSaveError: 'Browser preset storage is unavailable.',
                lastSaveFinished: true
            });
        }
        showToast("Preset saved!", "success");
    });

    loadPresetButton.addEventListener('click', () => {
        log("Load preset button clicked.");
        loadPresetInput.click();
    });

    loadPresetInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            log("File load canceled.");
            return;
        }
        log(`Loading file: ${file.name}`);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const settings = JSON.parse(e.target.result);
                loadAllSettings(settings);
                updateTestState({ lastImportedPreset: settings });
                if (window.WebArpPresetStore) {
                    window.WebArpPresetStore.save(settings, {
                        filename: file.name,
                        name: file.name,
                        source: 'import'
                    })
                        .then((record) => refreshSavedPresetList(record.id))
                        .catch((storeError) => {
                            console.warn('Failed to save imported preset to browser storage:', storeError);
                        });
                }
                showToast("Preset loaded!", "success");
                log("Preset loaded successfully.");
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
                updateTestState({
                    lastLoadError: 'Browser preset storage is unavailable.',
                    lastLoadFinished: true
                });
                showToast('Browser preset storage is unavailable.', 'error');
                return;
            }

            try {
                const selectedId = savedPresetSelect?.value || '';
                const record = selectedId
                    ? await window.WebArpPresetStore.get(selectedId)
                    : await window.WebArpPresetStore.loadLatest();
                if (!record) {
                    updateTestState({
                        lastLoadedPreset: null,
                        lastLoadFinished: true
                    });
                    showToast('No saved preset found yet.', 'info');
                    return;
                }

                loadAllSettings(record.settings || record);
                if (presetNameInput) {
                    presetNameInput.value = record.name || record.filename || '';
                }
                await refreshSavedPresetList(record.id);
                updateTestState({
                    lastLoadedPreset: record.settings || record,
                    lastLoadedPresetRecord: record,
                    lastLoadFinished: true
                });
                showToast('Loaded saved preset from browser storage.', 'success');
            } catch (error) {
                console.error('Failed to load saved preset from browser storage:', error);
                updateTestState({
                    lastLoadError: String(error),
                    lastLoadFinished: true
                });
                showToast('Failed to load saved preset.', 'error');
            }
        });
    }

    if (clearSavedPresetButton) {
        clearSavedPresetButton.addEventListener('click', async () => {
            log('Clear saved presets button clicked.');
            updateTestState({ lastClearFinished: false });
            if (!window.WebArpPresetStore) {
                updateTestState({
                    lastClearError: 'Browser preset storage is unavailable.',
                    lastClearFinished: true
                });
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
                updateTestState({
                    lastClearError: String(error),
                    lastClearFinished: true
                });
                showToast('Failed to clear saved presets.', 'error');
            }
        });
    }

    if (deleteSavedPresetButton) {
        deleteSavedPresetButton.addEventListener('click', async () => {
            log('Delete saved preset button clicked.');
            updateTestState({ lastDeleteFinished: false });
            if (!window.WebArpPresetStore) {
                updateTestState({
                    lastDeleteError: 'Browser preset storage is unavailable.',
                    lastDeleteFinished: true
                });
                showToast('Browser preset storage is unavailable.', 'error');
                return;
            }

            const selectedId = savedPresetSelect?.value || '';
            if (!selectedId) {
                updateTestState({
                    lastDeleteError: 'No saved preset selected.',
                    lastDeleteFinished: true
                });
                showToast('No saved preset selected.', 'info');
                return;
            }

            try {
                await window.WebArpPresetStore.remove(selectedId);
                await refreshSavedPresetList();
                updateTestState({
                    lastDeletedPresetId: selectedId,
                    lastDeleteFinished: true
                });
                showToast('Deleted saved preset.', 'success');
            } catch (error) {
                console.error('Failed to delete saved preset:', error);
                updateTestState({
                    lastDeleteError: String(error),
                    lastDeleteFinished: true
                });
                showToast('Failed to delete saved preset.', 'error');
            }
        });
    }

    // Autosave is attached at the document level so new controls added later
    // participate automatically when they emit standard input/change/click events.
    document.addEventListener('input', (event) => {
        if (event.target === pwaTestStateField || event.target === presetNameInput) {
            return;
        }

        if (event.target.matches('input, select, textarea')) {
            scheduleLastSessionSave();
        }
    });

    document.addEventListener('change', (event) => {
        if (event.target === pwaTestStateField || event.target === presetNameInput || event.target === savedPresetSelect || event.target === loadPresetInput) {
            return;
        }

        if (event.target.matches('input, select, textarea')) {
            scheduleLastSessionSave();
        }
    });

    document.addEventListener('click', (event) => {
        if (event.target.closest('.pattern-btn, .waveform-btn, #octave-shift-buttons button, #octave-range-buttons button')) {
            scheduleLastSessionSave();
        }
    });

    // Browser automation API for PWA, preset, and audio smoke tests.
    Object.assign(window.__WEB_ARP_TEST__, {
        /**
         * Reads the current app settings without mutating UI state.
         *
         * @returns {object} Current settings snapshot.
         */
        getCurrentSettings: () => getAllSettings(),
        /**
         * Saves a preset through the same IndexedDB path used by the UI.
         *
         * @param {object|null} [settings=null] - Optional settings snapshot to save.
         * @param {object} [metadata={}] - Optional preset metadata.
         * @returns {Promise<object>} Stored preset record.
         */
        savePreset: async (settings = null, metadata = {}) => {
            if (!window.WebArpPresetStore) {
                throw new Error('Browser preset storage is unavailable.');
            }

            const record = await window.WebArpPresetStore.save(settings || getAllSettings(), metadata);
            await refreshSavedPresetList(record.id);
            updateTestState({
                lastSavedPreset: record.settings,
                lastSavedPresetRecord: record,
                lastSaveFinished: true
            });
            return record;
        },
        /**
         * Lists saved presets for headless tests.
         *
         * @returns {Promise<object[]>} Saved preset records.
         */
        listPresets: async () => {
            if (!window.WebArpPresetStore) {
                return [];
            }

            const records = await window.WebArpPresetStore.list();
            updateTestState({ savedPresetCount: records.length });
            return records;
        },
        /**
         * Loads one preset record by id without applying it.
         *
         * @param {string} id - Preset id.
         * @returns {Promise<object|null>} Preset record or null.
         */
        getPreset: async (id) => {
            if (!window.WebArpPresetStore) {
                return null;
            }

            return window.WebArpPresetStore.get(id);
        },
        /**
         * Applies a saved preset to the visible UI.
         *
         * @param {string} [id=''] - Preset id, or blank to load the latest preset.
         * @returns {Promise<object|null>} Loaded preset record or null.
         */
        loadPreset: async (id = '') => {
            if (!window.WebArpPresetStore) {
                throw new Error('Browser preset storage is unavailable.');
            }

            const record = id
                ? await window.WebArpPresetStore.get(id)
                : await window.WebArpPresetStore.loadLatest();
            if (!record) {
                updateTestState({
                    lastLoadedPreset: null,
                    lastLoadFinished: true
                });
                return null;
            }

            loadAllSettings(record.settings || record);
            await refreshSavedPresetList(record.id);
            updateTestState({
                lastLoadedPreset: record.settings || record,
                lastLoadedPresetRecord: record,
                lastLoadFinished: true
            });
            return record;
        },
        /**
         * Removes one saved preset.
         *
         * @param {string} id - Preset id to delete.
         * @returns {Promise<void>}
         */
        removePreset: async (id) => {
            if (!window.WebArpPresetStore) {
                throw new Error('Browser preset storage is unavailable.');
            }

            await window.WebArpPresetStore.remove(id);
            await refreshSavedPresetList();
            updateTestState({
                lastDeletedPresetId: id,
                lastDeleteFinished: true
            });
        },
        /**
         * Clears all saved presets while preserving last-session state.
         *
         * @returns {Promise<void>}
         */
        clearPresets: async () => {
            if (!window.WebArpPresetStore) {
                updateTestState({
                    lastClearError: 'Browser preset storage is unavailable.',
                    lastClearFinished: true
                });
                return;
            }

            await window.WebArpPresetStore.clear();
            await refreshSavedPresetList();
            updateTestState({ lastClearFinished: true });
        },
        saveLastSession: saveLastSessionNow,
        restoreLastSession,
        /**
         * Starts playback through the same button path used by users.
         *
         * @returns {Promise<boolean>} True when playback is active.
         */
        play: async () => {
            if (!isPlaying) {
                playStopButton.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            return isPlaying;
        },
        /**
         * Stops playback through the same button path used by users.
         *
         * @returns {Promise<boolean>} True when playback is stopped.
         */
        stop: async () => {
            if (isPlaying) {
                playStopButton.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            return !isPlaying;
        }
    });

    // --- Global listeners for audio start ---
    window.addEventListener('audioReady', () => {
        if (SHOW_AUDIO_READY_TOAST) {
            showToast("Audio is ready!", "success");
        }
    });

    window.addEventListener('audioFailed', () => {
        showToast("Audio failed to start. See console.", "error");
    });

    // --- Initial Setup ---
    setSynth(synthTypeSelect.value);
    Tone.Transport.bpm.value = parseInt(bpmSlider.value);
    currentNotes = notesInput.value.trim().split(/\s+/).filter(Boolean);

    updateButtonGroup(octaveShiftButtons, currentOctaveShift, 'data-shift');
    updateButtonGroup(octaveRangeButtons, currentOctaveRange, 'data-range');
    updateWaveformButtons(currentWaveform); // Init new waveform buttons

    // Set quantizer to off by default
    scaleQuantizeToggle.checked = false;
    updateScaleQuantizeUi(); // Set initial disabled state for quantizer
    keyboardToggle.checked = false;
    updateKeyboardControlUi(); // Set initial disabled state for keyboard input
    setSynth(synthTypeSelect.value);

    // Set default pattern direction to "Up"
    document.querySelector('.pattern-btn[data-pattern="up"]').classList.add('selected');
    createOrUpdatePattern();

    filter.frequency.value = parseFloat(filterCutoffSlider.value);
    filter.Q.value = parseFloat(filterResonanceSlider.value);
    delay.wet.value = parseFloat(delayMixSlider.value);
    reverb.wet.value = parseFloat(reverbMixSlider.value);

    log("Arpeggiator initialized and ready.");
    void refreshSavedPresetList();
    void restoreLastSession();


    // --- Helper Functions ---

    /**
     * Collects all current UI settings into an object.
     * @returns {object} An object containing all settings.
     */
    function getAllSettings() {
        const baseNotes = currentNotes;
        // Note: getArpeggioNotes already applies quantization if enabled
        const notesWithOctaves = getArpeggioNotes(baseNotes, currentOctaveRange, currentOctaveShift);

        return {
            bpm: parseInt(bpmSlider.value),
            swing: parseFloat(swingSlider.value),
            baseNotes: baseNotes, // Save the original user-typed notes
            notes: notesWithOctaves, // Save the fully processed notes
            direction: getSelectedPatternDirection(),
            interval: intervalSelect.value,
            scaleQuantize: scaleQuantizeToggle.checked,
            scaleRoot: scaleRootSelect.value,
            scaleType: scaleTypeSelect.value,
            synthType: synthTypeSelect.value,
            waveform: currentWaveform, // <-- Use new state variable
            harmonicity: parseFloat(harmonicitySlider.value),
            modulationIndex: parseFloat(modIndexSlider.value),
            octaveShift: currentOctaveShift,
            octaveRange: currentOctaveRange,
            // *** OFFLINE BUG FIX: Store the ratio, not the calculated time ***
            gateRatio: parseFloat(gateSlider.value),
            filterCutoff: parseFloat(filterCutoffSlider.value),
            filterResonance: parseFloat(filterResonanceSlider.value),
            delayMix: parseFloat(delayMixSlider.value),
            reverbMix: parseFloat(reverbMixSlider.value),
            loopCount: parseInt(loopCountInput.value)
        };
    }

    /**
     * Loads all settings from an object and updates the UI.
     *
     * @param {object} settings - An object containing all settings.
     * @returns {void}
     */
    function loadAllSettings(settings) {
        try {
            bpmSlider.value = settings.bpm;
            bpmValue.textContent = settings.bpm;
            Tone.Transport.bpm.value = settings.bpm;
            swingSlider.value = settings.swing;
            swingValue.textContent = settings.swing.toFixed(2);
            Tone.Transport.swing = settings.swing;

            notesInput.value = settings.baseNotes.join(' ');
            currentNotes = settings.baseNotes;
            setSelectedPatternDirection(settings.direction);
            intervalSelect.value = settings.interval;

            scaleQuantizeToggle.checked = settings.scaleQuantize;
            scaleRootSelect.value = settings.scaleRoot;
            scaleTypeSelect.value = settings.scaleType;
            updateScaleQuantizeUi(); // Update UI based on loaded setting

            synthTypeSelect.value = settings.synthType;

            currentWaveform = settings.waveform; // <-- Load new state variable
            updateWaveformButtons(currentWaveform); // Update UI
            if (activeSynth && activeSynth.oscillator) {
                activeSynth.oscillator.type = settings.waveform;
            }

            if (settings.harmonicity) {
                harmonicitySlider.value = settings.harmonicity;
                harmonicityValue.textContent = settings.harmonicity.toFixed(1);
            }
            if (settings.modulationIndex) {
                modIndexSlider.value = settings.modulationIndex;
                modIndexValue.textContent = settings.modulationIndex.toFixed(1);
            }

            // Call setSynth *after* loading values
            setSynth(settings.synthType);

            currentOctaveShift = settings.octaveShift;
            currentOctaveRange = settings.octaveRange;
            updateButtonGroup(octaveShiftButtons, currentOctaveShift, 'data-shift');
            updateButtonGroup(octaveRangeButtons, currentOctaveRange, 'data-range');

            // *** OFFLINE BUG FIX: Load gateRatio ***
            const gateRatio = settings.gateRatio || 0.8; // Fallback for older presets
            gateSlider.value = gateRatio;
            gateValue.textContent = gateRatio.toFixed(2);

            filterCutoffSlider.value = settings.filterCutoff;
            filterCutoffValue.textContent = settings.filterCutoff.toFixed(0);
            filter.frequency.value = settings.filterCutoff;
            filterResonanceSlider.value = settings.filterResonance;
            filterResonanceValue.textContent = settings.filterResonance.toFixed(1);
            filter.Q.value = settings.filterResonance;

            delayMixSlider.value = settings.delayMix;
            delayMixValue.textContent = settings.delayMix.toFixed(2);
            delay.wet.value = settings.delayMix;
            reverbMixSlider.value = settings.reverbMix;
            reverbMixValue.textContent = settings.reverbMix.toFixed(2);
            reverb.wet.value = settings.reverbMix;

            loopCountInput.value = settings.loopCount;

            createOrUpdatePattern();
        } catch (e) {
            console.error("Failed to parse preset:", e);
            alert("Error loading preset. File may be corrupt or from an older version.");
        }
    }

    /**
     * Generates a descriptive filename based on current settings.
     * @param {boolean} isRealtime - Whether to add a timestamp for real-time recording.
     * @returns {string} The formatted filename (without extension).
     */
    function generateFilename(isRealtime) {
        const d = new Date();
        const timestamp = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}_${d.getHours().toString().padStart(2, '0')}-${d.getMinutes().toString().padStart(2, '0')}-${d.getSeconds().toString().padStart(2, '0')}`;

        if (isRealtime) {
            return `arp-realtime-${timestamp}`;
        } else {
            const settings = getAllSettings();
            const notesString = settings.baseNotes
                .join('')
                // .toUpperCase()
                .replace(/#/g, 's')
                .replace(/b/g, 'f')
                .replace(/\d/g, '');

            // const baseName = `arp-${settings.bpm}bpm-${settings.synthType}-${settings.interval}-${notesStr}-${settings.direction}`.toLowerCase().replace(/[^A-Za-z0-9-_\#]/g, '');
            let baseName = '';



            let scaleQuantize = (settings.scaleQuantize) ? `${settings.scaleRoot}-${settings.scaleType}` : 'noScale';

            if (settings.synthType === 'synth') {
                baseName = `arp-${settings.bpm}bpm-basicSynth-${settings.synthType}-${settings.waveform}-${settings.interval}-${notesString}-${scaleQuantize}`;
            } else if (settings.synthType === 'fmSynth' || settings.synthType === 'amSynth') {
                baseName = `arp-${settings.bpm}bpm-${settings.direction}-${settings.synthType}-${settings.interval}-${notesString}-${scaleQuantize}`;
            } else {
                // Error case for unknown synth type
                showToast(`Unknown synth type: ${settings.synthType}.`, "error");

                // throw Error(`Unknown synth type: ${settings.synthType}`);
                // return;

                baseName = `arp-${settings.bpm}bpm-${settings.direction}-${settings.synthType}-${settings.interval}-${notesString}-${scaleQuantize}`;
            }

            baseName = baseName
                // .toLowerCase()
                .replace(/[^A-Za-z0-9-_\#]/g, '');

            return `${baseName}-${timestamp}`;
        }
    }

    /**
     * Fetches a URL with exponential backoff.
     *
     * @param {string} url - The URL to fetch.
     * @param {RequestInit} options - Fetch options.
     * @param {number} [maxRetries=5] - Maximum retry attempts.
     * @param {number} [baseDelay=1000] - Base delay in ms.
     * @returns {Promise<any>} The parsed JSON response.
     */
    async function fetchWithBackoff(url, options, maxRetries = 5, baseDelay = 1000) {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
                return await response.json();
            } catch (error) {
                attempt++;
                if (attempt >= maxRetries) { throw error; }
                await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1)));
            }
        }
    }

    /**
     * Triggers a browser download for a given Blob.
     *
     * @param {Blob} blob - The Blob object to download.
     * @param {string} filename - The name of the file.
     * @returns {void}
     */
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.download = filename;
        anchor.href = url;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Converts a Float32Array of PCM data to a Int16Array.
     *
     * @param {Float32Array} buffer - The input buffer.
     * @returns {Int16Array} The converted buffer.
     */
    function float32ToInt16(buffer) {
        const data = new Int16Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            const s = Math.max(-1, Math.min(1, buffer[i]));
            data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return data;
    }

    /**
     * Encodes an AudioBuffer to an MP3 Blob using lamejs.
     *
     * @param {AudioBuffer} audioBuffer - The AudioBuffer object.
     * @returns {Promise<Blob>} The MP3 blob.
     */
    async function audioBufferToMp3Blob(audioBuffer) {
        return new Promise((resolve, reject) => {
            try {
                const channels = audioBuffer.numberOfChannels;
                const sampleRate = audioBuffer.sampleRate;
                const kbps = 128;
                const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
                const mp3Data = [];

                const pcmLeft = audioBuffer.getChannelData(0);
                const pcmRight = channels > 1 ? audioBuffer.getChannelData(1) : pcmLeft;

                const leftInt16 = float32ToInt16(pcmLeft);
                const rightInt16 = channels > 1 ? float32ToInt16(pcmRight) : leftInt16;

                const blockSize = 1152;

                for (let i = 0; i < leftInt16.length; i += blockSize) {
                    const leftChunk = leftInt16.subarray(i, i + blockSize);
                    const rightChunk = rightInt16.subarray(i, i + blockSize);

                    const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
                    if (mp3buf.length > 0) {
                        mp3Data.push(mp3buf);
                    }
                }

                const mp3buf = mp3encoder.flush();
                if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }

                const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });
                resolve(mp3Blob);
            } catch (e) {
                console.error("Error during MP3 encoding:", e);
                reject(e);
            }
        });
    }

    /**
     * Converts an AudioBuffer to a WAV Blob.
     *
     * @param {AudioBuffer} audioBuffer - The AudioBuffer object.
     * @returns {Blob} The WAV blob.
     */
    function audioBufferToWav(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;

        let result;
        if (numChannels === 2) {
            result = interleave(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1));
        } else {
            result = audioBuffer.getChannelData(0);
        }

        const dataLength = result.length * (bitDepth / 8);
        const blockAlign = numChannels * (bitDepth / 8);

        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);

        let offset = 44;
        for (let i = 0; i < result.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, result[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return new Blob([view], { type: 'audio/wav' });

        /**
         * Writes an ASCII chunk label into a DataView.
         *
         * @param {DataView} view - WAV file DataView.
         * @param {number} offset - Byte offset where the text starts.
         * @param {string} string - ASCII text to write.
         * @returns {void}
         */
        function writeString(view, offset, string) {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        }

        /**
         * Interleaves left and right PCM channels for stereo WAV output.
         *
         * @param {Float32Array} inputL - Left channel samples.
         * @param {Float32Array} inputR - Right channel samples.
         * @returns {Float32Array} Interleaved stereo samples.
         */
        function interleave(inputL, inputR) {
            const length = inputL.length + inputR.length;
            const result = new Float32Array(length);
            let index = 0, inputIndex = 0;
            while (index < length) {
                result[index++] = inputL[inputIndex];
                result[index++] = inputR[inputIndex];
                inputIndex++;
            }
            return result;
        }
    }

    /**
     * Shows a stacking toast message for a few seconds.
     * @param {string} message - The text to display.
     * @param {string} type - 'success', 'info', or 'error'.
     */
    function showToast(message, type = 'info') {
        if (!toastContainer) return;

        log(`TOAST (${type}): ${message}`);

        const toast = document.createElement('div');
        toast.textContent = message;
        toast.className = `toast-message toast-${type}`;

        toastContainer.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Set timers to remove
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
        }, 3000); // Show for 3 seconds

        setTimeout(() => {
            toast.remove();
        }, 3300); // Remove from DOM after fade out
    }

});

// Expose handlers still referenced by inline HTML attributes and external checks.
window.filterNoteInput = filterNoteInput;
window.filterNumericInput = filterNumericInput;
window.startAudio = startAudio;
