/**
 * Builds the DOM reference registry used by the application composition root.
 *
 * The registry receives its document explicitly so the application can keep
 * all DOM lookup testable without relying on browser globals.
 *
 * @module ui/dom-references
 */

/**
 * @typedef {object} DomReferences
 * @property {Document} documentRef - Document that owns the application UI.
 * @property {(selectors: string[]) => Element[]} resolveResetTargets - Resolves reset targets.
 */

/**
 * Creates all DOM references needed during application initialization.
 *
 * @param {Document} documentRef - Document to query.
 */
export function createDomReferences(documentRef) {
    const getById = (id) => documentRef.getElementById(id);
    const query = (selector) => documentRef.querySelector(selector);
    const queryAll = (selector) => documentRef.querySelectorAll(selector);

    /**
     * Resolves reset labels and headings without exposing document queries to
     * the composition root.
     *
     * @param {string[]} selectors - Selectors for one logical reset group.
     * @returns {Element[]} Matching elements in selector order.
     */
    const resolveResetTargets = (selectors) =>
        selectors.flatMap((selector) => {
            const target = query(selector);
            return target ? [target] : [];
        });

    return {
        documentRef,
        appMain: getById("app-main"),
        interfaceModeSelect: /** @type {HTMLSelectElement | null} */ (getById("interface-mode")),
        stickyTransportBar: /** @type {HTMLElement | null} */ (query(".sticky-transport-bar")),
        playStopButton: /** @type {HTMLButtonElement | null} */ (getById("play-stop")),
        undoButton: /** @type {HTMLButtonElement | null} */ (getById("undo-button")),
        redoButton: /** @type {HTMLButtonElement | null} */ (getById("redo-button")),
        historyMenuButton: /** @type {HTMLButtonElement | null} */ (getById("history-menu-button")),
        historyMenu: getById("history-menu"),
        historyMenuUndoButton: /** @type {HTMLButtonElement | null} */ (
            getById("history-menu-undo")
        ),
        historyMenuRedoButton: /** @type {HTMLButtonElement | null} */ (
            getById("history-menu-redo")
        ),
        resetDefaultsButton: /** @type {HTMLButtonElement | null} */ (
            getById("reset-defaults-button")
        ),
        resetDefaultsDesktopButton: /** @type {HTMLButtonElement | null} */ (
            getById("reset-defaults-desktop-button")
        ),
        resetDefaultsOverlay: getById("reset-defaults-overlay"),
        resetDefaultsDialog: getById("reset-defaults-dialog"),
        resetDefaultsCancelButton: /** @type {HTMLButtonElement | null} */ (
            getById("reset-defaults-cancel")
        ),
        resetDefaultsConfirmButton: /** @type {HTMLButtonElement | null} */ (
            getById("reset-defaults-confirm")
        ),
        soundStartersDetails: /** @type {HTMLDetailsElement | null} */ (
            getById("sound-starters-details")
        ),
        soundStartersGrid: getById("sound-starters-grid"),
        guidedWorkflowSection: getById("guided-workflow-section"),
        guidedWorkflowStartButton: /** @type {HTMLButtonElement | null} */ (
            getById("guided-workflow-start")
        ),
        guidedWorkflowActivePanel: getById("guided-workflow-active"),
        guidedWorkflowSteps: /** @type {HTMLOListElement | null} */ (
            getById("guided-workflow-steps")
        ),
        guidedWorkflowStatus: getById("guided-workflow-status"),
        guidedWorkflowSkipButton: /** @type {HTMLButtonElement | null} */ (
            getById("guided-workflow-skip")
        ),
        guidedWorkflowRestartButton: /** @type {HTMLButtonElement | null} */ (
            getById("guided-workflow-restart")
        ),
        bpmSlider: /** @type {HTMLInputElement} */ (getById("bpm")),
        bpmValue: getById("bpm-value"),
        postGainSlider: /** @type {HTMLInputElement} */ (getById("post-gain")),
        postGainValue: getById("post-gain-value"),
        swingSlider: /** @type {HTMLInputElement} */ (getById("swing")),
        swingValue: getById("swing-value"),
        notesInput: /** @type {HTMLInputElement} */ (getById("notes")),
        intervalSelect: /** @type {HTMLSelectElement} */ (getById("interval")),
        synthTypeSelect: /** @type {HTMLSelectElement} */ (getById("synth-type")),
        waveformButtons: getById("waveform-buttons"),
        carrierLabel: getById("carrier-label"),
        waveformPluckOverlay: getById("waveform-pluck-overlay"),
        patternButtons: getById("pattern-buttons"),
        basicSynthParams: getById("basic-synth-params"),
        dutyControl: getById("duty-control"),
        dutySlider: /** @type {HTMLInputElement} */ (getById("duty-cycle")),
        dutyValue: getById("duty-value"),
        advancedSynthParams: getById("advanced-synth-params"),
        harmonicityControl: getById("harmonicity-control"),
        modIndexControl: getById("mod-index-control"),
        harmonicitySlider: /** @type {HTMLInputElement} */ (getById("harmonicity")),
        harmonicityValue: getById("harmonicity-value"),
        modIndexSlider: /** @type {HTMLInputElement} */ (getById("modulation-index")),
        modIndexValue: getById("modulation-index-value"),
        monoSynthParams: getById("mono-synth-params"),
        monoCutoffSlider: /** @type {HTMLInputElement} */ (getById("mono-cutoff")),
        monoCutoffValue: getById("mono-cutoff-value"),
        monoOctavesSlider: /** @type {HTMLInputElement} */ (getById("mono-octaves")),
        monoOctavesValue: getById("mono-octaves-value"),
        monoQSlider: /** @type {HTMLInputElement} */ (getById("mono-q")),
        monoQValue: getById("mono-q-value"),
        duoSynthParams: getById("duo-synth-params"),
        duoHarmSlider: /** @type {HTMLInputElement} */ (getById("duo-harm")),
        duoHarmValue: getById("duo-harm-value"),
        duoVibratoSlider: /** @type {HTMLInputElement} */ (getById("duo-vibrato")),
        duoVibratoValue: getById("duo-vibrato-value"),
        pluckSynthParams: getById("pluck-synth-params"),
        pluckDampeningSlider: /** @type {HTMLInputElement} */ (getById("pluck-dampening")),
        pluckDampeningValue: getById("pluck-dampening-value"),
        pluckResonanceSlider: /** @type {HTMLInputElement} */ (getById("pluck-resonance")),
        pluckResonanceValue: getById("pluck-resonance-value"),
        pluckNoiseSlider: /** @type {HTMLInputElement} */ (getById("pluck-noise")),
        pluckNoiseValue: getById("pluck-noise-value"),
        membraneSynthParams: getById("membrane-synth-params"),
        membranePitchDecaySlider: /** @type {HTMLInputElement} */ (getById("membrane-pitch-decay")),
        membranePitchDecayValue: getById("membrane-pitch-decay-value"),
        membraneOctavesSlider: /** @type {HTMLInputElement} */ (getById("membrane-octaves")),
        membraneOctavesValue: getById("membrane-octaves-value"),
        gateSlider: /** @type {HTMLInputElement} */ (getById("gate")),
        gateValue: getById("gate-value"),
        envAttackSlider: /** @type {HTMLInputElement} */ (getById("env-attack")),
        envDecaySlider: /** @type {HTMLInputElement} */ (getById("env-decay")),
        envSustainSlider: /** @type {HTMLInputElement} */ (getById("env-sustain")),
        envReleaseSlider: /** @type {HTMLInputElement} */ (getById("env-release")),
        envAttackValue: getById("env-attack-value"),
        envDecayValue: getById("env-decay-value"),
        envSustainValue: getById("env-sustain-value"),
        envReleaseValue: getById("env-release-value"),
        keyboardVisual: getById("keyboard-visual"),
        keyboardToggle: /** @type {HTMLInputElement} */ (getById("keyboard-toggle")),
        keyboardToggleStatus: getById("keyboard-toggle-status"),
        keyboardDescription: getById("keyboard-description"),
        octaveShiftButtons: getById("octave-shift-buttons"),
        octaveRangeButtons: getById("octave-range-buttons"),
        scaleQuantizeToggle: /** @type {HTMLInputElement} */ (getById("scale-quantize-toggle")),
        scaleQuantizeToggleStatus: getById("scale-quantize-toggle-status"),
        scaleRootSelect: /** @type {HTMLSelectElement} */ (getById("scale-root")),
        scaleTypeSelect: /** @type {HTMLSelectElement} */ (getById("scale-type")),
        filterCutoffSlider: /** @type {HTMLInputElement} */ (getById("filter-cutoff")),
        filterCutoffValue: getById("filter-cutoff-value"),
        filterResonanceSlider: /** @type {HTMLInputElement} */ (getById("filter-resonance")),
        filterResonanceValue: getById("filter-resonance-value"),
        driveMixSlider: /** @type {HTMLInputElement} */ (getById("drive-mix")),
        driveMixValue: getById("drive-mix-value"),
        chorusMixSlider: /** @type {HTMLInputElement} */ (getById("chorus-mix")),
        chorusMixValue: getById("chorus-mix-value"),
        autoPanMixSlider: /** @type {HTMLInputElement} */ (getById("autopan-mix")),
        autoPanMixValue: getById("autopan-mix-value"),
        delayMixSlider: /** @type {HTMLInputElement} */ (getById("delay-mix")),
        delayMixValue: getById("delay-mix-value"),
        reverbMixSlider: /** @type {HTMLInputElement} */ (getById("reverb-mix")),
        reverbMixValue: getById("reverb-mix-value"),
        randomizeNotesButton: getById("randomize-notes"),
        noteStepIndicator: getById("note-step-indicator"),
        recordButton: getById("record-button"),
        recordStatus: getById("record-status") || getById("realtime-record-status"),
        exportControls: getById("export-controls") || getById("realtime-export-controls"),
        realtimeExportWavCheck: getById("realtime-export-wav"),
        realtimeExportMp3Check: getById("realtime-export-mp3"),
        exportButton: getById("realtime-export-button"),
        loopCountInput: /** @type {HTMLInputElement} */ (getById("loop-count")),
        offlineExportModeInputs: /** @type {NodeListOf<HTMLInputElement>} */ (
            queryAll("input[name='offline-export-mode']")
        ),
        offlineExportTailControl: getById("offline-export-tail-control"),
        offlineExportTailModeSelect: /** @type {HTMLSelectElement | null} */ (
            getById("offline-export-tail-mode")
        ),
        offlineExportTailSecondsInput: /** @type {HTMLInputElement | null} */ (
            getById("offline-export-tail-seconds")
        ),
        offlineExportDuration: getById("offline-export-duration"),
        offlineExportWavCheck: getById("offline-export-wav"),
        offlineExportMp3Check: getById("offline-export-mp3"),
        offlineExportButton: getById("offline-export-button"),
        offlineExportMidiButton: getById("offline-export-midi-button"),
        offlineExportStatus: getById("offline-export-status"),
        vuMeterBar: getById("vu-meter-bar"),
        vuDbValue: getById("vu-db-value"),
        vuClipContainer: getById("vu-clip-container"),
        vuClipIndicator: /** @type {HTMLButtonElement | null} */ (getById("vu-clip-indicator")),
        vuClipTooltip: getById("vu-clip-tooltip"),
        vuInfoButton: getById("vu-info-button"),
        vuInfoTooltip: getById("vu-info-tooltip"),
        visualizerYAxisCanvas: /** @type {HTMLCanvasElement | null} */ (
            getById("visualizer-yaxis")
        ),
        visualizerViewport: getById("visualizer-viewport"),
        visualizerPlotCanvas: /** @type {HTMLCanvasElement | null} */ (getById("visualizer-plot")),
        toggleVisualizerButton: getById("toggle-visualizer"),
        visualizerModeSelect: /** @type {HTMLSelectElement | null} */ (getById("visualizer-mode")),
        pauseVisualizerButton: /** @type {HTMLButtonElement | null} */ (
            getById("pause-visualizer")
        ),
        visualizerZoomSlider: /** @type {HTMLInputElement | null} */ (getById("visualizer-zoom")),
        visualizerZoomValue: getById("visualizer-zoom-value"),
        oscilloscopeWindowSelect: /** @type {HTMLSelectElement | null} */ (
            getById("oscilloscope-window")
        ),
        oscilloscopeWindowContainer: getById("oscilloscope-window-container"),
        presetNameInput: /** @type {HTMLInputElement | null} */ (getById("preset-name-input")),
        savedPresetSelect: /** @type {HTMLSelectElement | null} */ (getById("saved-preset-select")),
        savePresetButton: getById("save-preset-button"),
        savePresetToBrowserButton: getById("save-preset-to-browser-button"),
        sharePresetButton: getById("share-preset-button"),
        loadPresetButton: getById("load-preset-button"),
        loadSavedPresetButton: getById("load-saved-preset-button"),
        clearSavedPresetButton: getById("clear-saved-preset-button"),
        deleteSavedPresetButton: getById("delete-saved-preset-button"),
        browserStorageRecovery: /** @type {HTMLDetailsElement | null} */ (
            getById("browser-storage-recovery")
        ),
        loadPresetInput: /** @type {HTMLInputElement | null} */ (getById("load-preset-input")),
        toastContainer: getById("toast-container"),
        liveRegion: getById("sr-announcements"),
        quickStartModal: getById("quick-start-modal"),
        quickStartOverlay: getById("quick-start-overlay"),
        quickStartModeChoice: getById("quick-start-mode-choice"),
        quickStartModeContent: getById("quick-start-mode-content"),
        quickStartSimpleButton: /** @type {HTMLButtonElement | null} */ (
            getById("quick-start-simple")
        ),
        quickStartFullButton: /** @type {HTMLButtonElement | null} */ (getById("quick-start-full")),
        quickStartPresetsGrid: getById("quick-start-presets-grid"),
        quickStartScratchButton: /** @type {HTMLButtonElement | null} */ (
            getById("quick-start-scratch")
        ),
        startOverlay: getById("start-overlay"),
        chordConflictOverlay: getById("chord-conflict-overlay"),
        chordConflictDialog: getById("chord-conflict-dialog"),
        chordConflictRequestedNotes: getById("chord-conflict-requested-notes"),
        chordConflictAdaptedNotes: getById("chord-conflict-adapted-notes"),
        chordConflictChangedPitches: getById("chord-conflict-changed-pitches"),
        chordConflictKeepButton: /** @type {HTMLButtonElement | null} */ (
            getById("chord-conflict-keep")
        ),
        chordConflictAdaptButton: /** @type {HTMLButtonElement | null} */ (
            getById("chord-conflict-adapt")
        ),
        chordConflictCancelButton: /** @type {HTMLButtonElement | null} */ (
            getById("chord-conflict-cancel")
        ),
        chordButtons: queryAll(".chord-btn"),
        resolveResetTargets,
    };
}
