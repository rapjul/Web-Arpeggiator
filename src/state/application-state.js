/**
 * Owns the mutable state shared by the application composition root and its
 * injected controllers.
 *
 * @module state/application-state
 */

/**
 * @typedef {object} ApplicationStateAudioEngine
 * @property {object|null} activeSynth - The currently selected synth.
 * @property {string} currentWaveform - Waveform selected by the live engine.
 */

/**
 * @typedef {object} ApplicationState
 * @property {boolean} isPlaying - Whether the transport is running.
 * @property {string[]} currentNotes - Current base note sequence.
 * @property {number} currentOctaveShift - Current octave transposition.
 * @property {number} currentOctaveRange - Current number of octave layers.
 * @property {number} randomSeed - Seed used by reproducible stochastic patterns.
 * @property {object|null} activeSynth - Active synth owned by the audio engine.
 * @property {string} currentWaveform - Current waveform selection.
 * @property {string|null} activeNote - Current manually active keyboard note.
 * @property {boolean} isAudioContextStarted - Whether audio activation completed.
 */

/**
 * Creates an isolated application state object.
 *
 * @param {{getAvailableAudioEngine: () => ApplicationStateAudioEngine|null|undefined}} dependencies - Runtime accessors.
 * @returns {ApplicationState} Mutable state exposed through stable properties.
 */
export function createApplicationState({ getAvailableAudioEngine }) {
    let isPlaying = false;
    let currentNotes = ["C4", "E4", "G4"];
    let currentOctaveShift = 0;
    let currentOctaveRange = 2;
    let randomSeed = 0x6d2b79f5;
    let activeNote = null;
    let currentWaveform = "sine";
    let isAudioContextStarted = false;

    return {
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
        get randomSeed() {
            return randomSeed;
        },
        set randomSeed(value) {
            randomSeed = value;
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
}
