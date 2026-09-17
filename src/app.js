/**
 * Main Web Arpeggiator Application Module
 *
 * This module owns the shell: DOM wiring, transport control, preset integration,
 * and module initialization. The heavy lifting (audio engine,
 * recorder/export, visualizer) has been split into separate modules.
 *
 * @module app
 */
import { buildChordString, resolveChordDefinition } from "@core/chord-builder.js";
import { resolveChordConflict } from "@core/chord-conflict.js";
import { filterNoteInput, filterNumericInput } from "@core/input-filters.js";
import { dbToPercent } from "@core/meter-utils.js";
import {
    getArpeggioNotes as getArpeggioNotesFromModule,
    normalizeNotesSequence,
} from "@core/pattern-core.js";
import { generateRandomNotes } from "@core/randomizer.js";
import { DEFAULT_SETTINGS, mergeSettings } from "@core/settings-contract.js";
import { PRESET_URL_KEYS } from "@core/url-preset.js";
import { initializePwa } from "@pwa/pwa.js";
import { presetStore } from "@storage/presets-store.js";
import { debounce } from "@storage/session-manager.js";
import { createSettingsManager } from "@storage/settings-manager.js";
import { createAudioRuntimeController } from "@audio/runtime-controller.js";
import { createPlaybackController } from "@audio/playback-controller.js";
import { createStaticLoopRenderer } from "@audio/static-loop-renderer.js";
import { initializeKeyboardControls } from "@ui/keyboard-controller.js";
import { createHistoryController } from "@ui/history-controller.js";
import { createInputFilterController } from "@ui/input-filter-controller.js";
import { createNoteStepController } from "@ui/note-step-controller.js";
import { createOnboardingController } from "@ui/onboarding-controller.js";
import { createEffectsControlsController } from "@ui/effects-controls-controller.js";
import { createExportControlsController } from "@ui/export-controls-controller.js";
import { createPatternControlsController } from "@ui/pattern-controls-controller.js";
import { createChordConflictDialogController } from "@ui/chord-conflict-dialog-controller.js";
import { createPresetController } from "@ui/preset-controller.js";
import { createPresetWorkflowController } from "@ui/preset-workflow-controller.js";
import { createSynthControlsController } from "@ui/synth-controls-controller.js";
import { createTransportController } from "@ui/transport-controller.js";
import { createToastManager } from "@ui/ui-feedback.js";
import { createWorkspaceController } from "@ui/workspace-controller.js";
import { createDomReferences } from "@ui/dom-references.js";
import { createApplicationState } from "@/state/application-state.js";
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
let Tone;
let audioRuntimeController = null;
let playbackController = null;
let exportControlsController = null;
let presetWorkflowController = null;

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

/** @returns {void} Delegates the current duration estimate to export controls. */
function updateEstimatedExportDuration() {
    exportControlsController?.updateEstimatedExportDuration();
}

/** @returns {void} Delegates offline-mode presentation to export controls. */
function updateOfflineExportModeUi() {
    exportControlsController?.updateOfflineExportModeUi();
}

/** @returns {void} Requests a debounced loop-map render from export controls. */
function requestStaticLoopRender() {
    exportControlsController?.requestStaticLoopRender();
}

/** @returns {void} Loads a preset encoded in the current URL. */
function loadPresetFromUrl() {
    presetWorkflowController?.loadPresetFromUrl();
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

    // --- DOM References ---
    const {
        documentRef,
        appMain,
        stickyTransportBar,
        playStopButton,
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
        soundStartersDetails,
        soundStartersGrid,
        bpmSlider,
        bpmValue,
        postGainSlider,
        postGainValue,
        swingSlider,
        swingValue,
        notesInput,
        intervalSelect,
        synthTypeSelect,
        waveformButtons,
        carrierLabel,
        waveformPluckOverlay,
        patternButtons,
        basicSynthParams,
        dutyControl,
        dutySlider,
        dutyValue,
        advancedSynthParams,
        harmonicityControl,
        modIndexControl,
        harmonicitySlider,
        harmonicityValue,
        modIndexSlider,
        modIndexValue,
        monoSynthParams,
        monoCutoffSlider,
        monoCutoffValue,
        monoOctavesSlider,
        monoOctavesValue,
        monoQSlider,
        monoQValue,
        duoSynthParams,
        duoHarmSlider,
        duoHarmValue,
        duoVibratoSlider,
        duoVibratoValue,
        pluckSynthParams,
        pluckDampeningSlider,
        pluckDampeningValue,
        pluckResonanceSlider,
        pluckResonanceValue,
        pluckNoiseSlider,
        pluckNoiseValue,
        membraneSynthParams,
        membranePitchDecaySlider,
        membranePitchDecayValue,
        membraneOctavesSlider,
        membraneOctavesValue,
        gateSlider,
        gateValue,
        envAttackSlider,
        envDecaySlider,
        envSustainSlider,
        envReleaseSlider,
        envAttackValue,
        envDecayValue,
        envSustainValue,
        envReleaseValue,
        keyboardVisual,
        keyboardToggle,
        keyboardToggleStatus,
        keyboardDescription,
        octaveShiftButtons,
        octaveRangeButtons,
        scaleQuantizeToggle,
        scaleQuantizeToggleStatus,
        scaleRootSelect,
        scaleTypeSelect,
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
        randomizeNotesButton,
        noteStepIndicator,
        recordButton,
        recordStatus,
        exportControls,
        realtimeExportWavCheck,
        realtimeExportMp3Check,
        exportButton,
        loopCountInput,
        offlineExportModeInputs,
        offlineExportTailControl,
        offlineExportTailSecondsInput,
        offlineExportDuration,
        offlineExportWavCheck,
        offlineExportMp3Check,
        offlineExportButton,
        offlineExportMidiButton,
        offlineExportStatus,
        vuMeterBar,
        vuDbValue,
        vuClipContainer,
        vuClipIndicator,
        vuClipTooltip,
        vuInfoButton,
        vuInfoTooltip,
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
        presetNameInput,
        savedPresetSelect,
        savePresetButton,
        savePresetToBrowserButton,
        sharePresetButton,
        loadPresetButton,
        loadSavedPresetButton,
        clearSavedPresetButton,
        deleteSavedPresetButton,
        browserStorageRecovery,
        loadPresetInput,
        toastContainer,
        liveRegion,
        quickStartModal,
        quickStartOverlay,
        quickStartPresetsGrid,
        quickStartScratchButton,
        startOverlay,
        chordConflictOverlay,
        chordConflictDialog,
        chordConflictRequestedNotes,
        chordConflictAdaptedNotes,
        chordConflictChangedPitches,
        chordConflictKeepButton,
        chordConflictAdaptButton,
        chordConflictCancelButton,
        chordButtons,
        resolveResetTargets,
    } = createDomReferences(document);

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
    const appState = createApplicationState({ getAvailableAudioEngine });

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
            baseNotes: appState.currentNotes,
            octaveRange: appState.currentOctaveRange,
            octaveShift: appState.currentOctaveShift,
            interval: intervalSelect.value,
            gate: parseFloat(gateSlider.value),
            direction: patternControlsController.getSelectedPatternDirection(),
            bpm: parseFloat(bpmSlider.value),
            swing: parseFloat(swingSlider.value),
            quantize: {
                enabled: scaleQuantizeToggle.checked,
                root: scaleRootSelect.value,
                scale: scaleTypeSelect.value,
            },
        });
        // Rebuild the note step indicator pips to match the new note count
        noteStepController.rebuild();
        updateEstimatedExportDuration();
    }

    const noteStepController = createNoteStepController({
        container: noteStepIndicator,
        getNotes: () => appState.currentNotes,
    });

    const chordConflictDialogController = createChordConflictDialogController({
        documentRef: document,
        dom: {
            overlay: chordConflictOverlay,
            dialog: chordConflictDialog,
            requestedNotes: chordConflictRequestedNotes,
            adaptedNotes: chordConflictAdaptedNotes,
            changedPitches: chordConflictChangedPitches,
            keepButton: chordConflictKeepButton,
            adaptButton: chordConflictAdaptButton,
            cancelButton: chordConflictCancelButton,
        },
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
            chordButtons,
        },
        normalizeNotes: normalizeNotesSequence,
        setNotes: (notes) => {
            appState.currentNotes = notes;
        },
        setOctaveShift: (value) => {
            appState.currentOctaveShift = value;
        },
        setOctaveRange: (value) => {
            appState.currentOctaveRange = value;
        },
        onPatternChange: createOrUpdatePattern,
        onEstimatedDurationChange: () => updateEstimatedExportDuration(),
        onStaticLoopChange: requestStaticLoopRender,
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
        resolveChordConflict,
        openChordConflict: chordConflictDialogController.open,
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
        liveRegion,
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
        documentRef,
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
            if (!appState.isPlaying) {
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
            quickStartModal,
            quickStartOverlay,
            quickStartPresetsGrid,
            quickStartScratchButton,
            soundStartersDetails,
            startOverlay,
        },
        documentRef,
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

    const workspaceController = createWorkspaceController({
        documentRef,
        dom: { presetNameInput, savedPresetSelect, loadPresetInput },
        getResetDefinitions: () => resetDefinitions,
        getPresetStore: () => presetStore,
        getAllSettings,
        loadAllSettings,
        getSelectedPatternDirection: patternControlsController.getSelectedPatternDirection,
        setSelectedPatternDirection: patternControlsController.setSelectedPatternDirection,
        clearActiveSoundStarterCard,
        onStaticLoopChange: requestStaticLoopRender,
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
        documentRef,
        getStatus: workspaceController.getStatus,
        onUndo: undoSettings,
        onRedo: redoSettings,
        onResetDefaults: resetAllSettings,
        onEscapeReset: () => {
            const definition = getFocusedResetDefinition(documentRef.activeElement);
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
    ].map((definition) => ({
        ...definition,
        targets: resolveResetTargets(definition.targets),
    }));

    // ==================================================================
    //    Event Listeners
    // ==================================================================

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
        getIsPlaying: () => appState.isPlaying,
        onStart: startPlayback,
        onStop: stopPlayback,
        onBpmChange: (value) => {
            if (getAudioEngine()) Tone.getTransport().bpm.value = value;
            createOrUpdatePattern();
            updateEstimatedExportDuration();
        },
        onSwingChange: (_value) => {
            if (getAudioEngine()) Tone.getTransport().swing = 0;
            createOrUpdatePattern();
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

    const staticLoopRenderer = createStaticLoopRenderer({
        isAudioContextStarted: () => appState.isAudioContextStarted,
        getTone: () => Tone,
        getAudioEngine,
        getSettings: () => getAllSettings(),
        updateStaticLoopMap: (buffer, markers) =>
            getVisualizer()?.updateStaticLoopMap(buffer, markers),
        logger: console,
    });
    exportControlsController = createExportControlsController({
        dom: {
            loopCountInput,
            offlineExportModeInputs,
            offlineExportTailControl,
            offlineExportTailSecondsInput,
            offlineExportDuration,
            recordButton,
            exportButton,
            offlineExportButton,
            offlineExportMidiButton,
            toggleVisualizerButton,
            visualizerModeSelect,
        },
        getSettings: () => getAllSettings(),
        getCurrentNotes: () => ({
            notes: appState.currentNotes,
            octaveRange: appState.currentOctaveRange,
            octaveShift: appState.currentOctaveShift,
        }),
        getRecorderManager,
        getVisualizer,
        startAudio,
        generateFilename,
        showToast,
        renderStaticLoop: staticLoopRenderer.render,
        debounce,
        logger: console,
    });
    exportControlsController.initialize();

    // ==================================================================
    //    Preset Management
    // ==================================================================

    presetWorkflowController = createPresetWorkflowController({
        dom: {
            sharePresetButton,
            savePresetButton,
            savePresetToBrowserButton,
            loadPresetButton,
            loadPresetInput,
            loadSavedPresetButton,
            clearSavedPresetButton,
            deleteSavedPresetButton,
            presetNameInput,
            savedPresetSelect,
        },
        windowRef: window,
        navigatorRef: navigator,
        fileReaderFactory: () => new FileReader(),
        confirm: (message) => window.confirm(message),
        factoryPresets: FACTORY_PRESETS,
        getPresetStore: () => presetStore,
        getAllSettings,
        applySettingsWithHistory,
        generateFilename,
        refreshSavedPresetList,
        setActiveSoundStarterCard,
        showStorageRecovery: showBrowserStorageRecovery,
        hideStorageRecovery: hideBrowserStorageRecovery,
        showToast,
        logger: console,
    });
    presetWorkflowController.initialize();

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
