/**
 * Owns deferred Tone.js loading and construction of the live audio runtime.
 *
 * Tone and every module that imports it stay behind explicit activation so
 * importing the application cannot create an AudioContext.
 *
 * @module audio/runtime-controller
 */

/**
 * @typedef {{activeSynth: object|null, analyser: object, meter: object, peakAnalyser: object, reverb: object, synths: object, createOfflineChain: (...args: unknown[]) => object, currentWaveform: string, dispose: () => void}} RuntimeEngine
 * @typedef {{startUiLoop: () => void, stopUiLoop: () => void, destroy: () => void}} RuntimeVisualizer
 * @typedef {{isRecording: boolean, recordingStartTime: number}} RuntimeRecorder
 * @typedef {[object, {createAudioEngine: (...args: unknown[]) => RuntimeEngine}, {createPatternController: (...args: unknown[]) => object}, {createRecorderManager: (...args: unknown[]) => RuntimeRecorder}, {createVisualizer: (...args: unknown[]) => RuntimeVisualizer}]} AudioModules
 *
 * @typedef {object} AudioRuntimeDependencies
 * @property {{audioEngine: Record<string, unknown>, visualizer: Record<string, unknown> & {recordButton?: HTMLElement|null}, recorder: Record<string, unknown>}} dom - Runtime DOM references.
 * @property {{isPlaying: boolean, isAudioContextStarted: boolean, activeNote: string|null, currentWaveform: string}} state - Shared runtime state.
 * @property {() => Record<string, unknown>} getAllSettings - Reads serialized settings.
 * @property {(settings: unknown, options?: {allowFutureVersion?: boolean}) => {ok: boolean}} loadAllSettings - Applies pending settings.
 * @property {(message: string, type?: string) => void} showToast - Runtime feedback callback.
 * @property {(isRealtime: boolean, settings?: Record<string, unknown>, exportType?: string) => string} generateFilename - Filename helper.
 * @property {(seconds: number) => string} formatTime - Recording timer formatter.
 * @property {() => Promise<void>} startAudio - Shared activation callback for the recorder.
 * @property {() => Promise<void>} startPlayback - Shared playback callback for the recorder.
 * @property {() => void} [onAudioReady] - Optional development-ready notification.
 * @property {(index: number) => void} onPatternStep - Highlights a scheduled step.
 * @property {(pattern: object|null) => void} onPatternChange - Publishes the current pattern.
 * @property {() => Promise<AudioModules>} [loadModules] - Testable module loader override.
 * @property {(tone: object) => void} [onToneLoaded] - Receives the dynamically loaded Tone namespace.
 * @property {() => void} [onContextReady] - Called once a runtime context can be observed.
 * @property {{error?: (...args: unknown[]) => void, warn?: (...args: unknown[]) => void}} [logger]
 */

/**
 * Creates a deferred audio runtime controller.
 *
 * @param {AudioRuntimeDependencies} dependencies - Injected runtime dependencies.
 * @returns {{loadAudioModules: () => Promise<void>, startAudio: () => Promise<void>, initializeAudioRuntime: () => Promise<void>, getTone: () => object|null, getAvailableAudioEngine: () => object|null|undefined, getAudioEngine: () => object|undefined, getPatternController: () => object|undefined, getRecorderManager: () => object|undefined, getVisualizer: () => object|undefined, destroy: () => void}}
 */
export function createAudioRuntimeController(dependencies) {
    const {
        dom,
        state,
        getAllSettings,
        loadAllSettings,
        showToast,
        generateFilename,
        formatTime,
        startAudio: startAudioAction,
        startPlayback,
        onAudioReady,
        onPatternStep,
        onPatternChange,
        loadModules,
        onToneLoaded,
        onContextReady,
        logger = console,
    } = dependencies;

    let Tone = null;
    let createAudioEngine;
    let createPatternController;
    let createRecorderManager;
    let createVisualizer;
    let audioEngine;
    let pendingAudioEngine = null;
    let patternController;
    let recorderManager;
    let visualizer;
    let audioModulesPromise = null;
    let audioRuntimePromise = null;
    let audioStartPromise = null;

    /**
     * Loads Tone and Tone-dependent modules only when explicitly requested.
     *
     * @returns {Promise<void>}
     */
    async function loadAudioModules() {
        if (!audioModulesPromise) {
            const defaultModuleLoader = () =>
                Promise.all([
                    import("tone"),
                    import("@audio/audio-engine.js"),
                    import("@audio/pattern-generator.js"),
                    import("@audio/recorder.js"),
                    import("@ui/visualizer.js"),
                ]);
            const moduleLoader = /** @type {() => Promise<AudioModules>} */ (
                loadModules || defaultModuleLoader
            );
            audioModulesPromise = moduleLoader()
                .then(
                    ([
                        tone,
                        audioEngineModule,
                        patternModule,
                        recorderModule,
                        visualizerModule,
                    ]) => {
                        Tone = tone;
                        ({ createAudioEngine } = audioEngineModule);
                        ({ createPatternController } = patternModule);
                        ({ createRecorderManager } = recorderModule);
                        ({ createVisualizer } = visualizerModule);
                        onToneLoaded?.(tone);
                    },
                )
                .catch((error) => {
                    audioModulesPromise = null;
                    throw error;
                });
        }
        return audioModulesPromise;
    }

    /**
     * Creates the graph, visualizer, recorder, and scheduler transactionally.
     *
     * @returns {Promise<void>}
     */
    async function initializeAudioRuntime() {
        if (audioEngine) return;
        if (!audioRuntimePromise) {
            audioRuntimePromise = (async () => {
                let nextAudioEngine;
                let nextVisualizer;
                let nextRecorderManager;
                let nextPatternController;

                try {
                    nextAudioEngine = createAudioEngine({ dom: dom.audioEngine });
                    nextAudioEngine.currentWaveform = state.currentWaveform;

                    nextVisualizer = createVisualizer({
                        dom: dom.visualizer,
                        audio: {
                            analyser: nextAudioEngine.analyser,
                            meter: nextAudioEngine.meter,
                            peakAnalyser: nextAudioEngine.peakAnalyser,
                        },
                        state: {
                            get isRecording() {
                                return nextRecorderManager
                                    ? nextRecorderManager.isRecording
                                    : false;
                            },
                            get recordingStartTime() {
                                return nextRecorderManager
                                    ? nextRecorderManager.recordingStartTime
                                    : 0;
                            },
                            get isPlaying() {
                                return state.isPlaying;
                            },
                            get activeNote() {
                                return state.activeNote;
                            },
                            recordButton: dom.visualizer.recordButton,
                        },
                        actions: { formatTime },
                    });

                    nextRecorderManager = createRecorderManager({
                        audio: {
                            reverb: nextAudioEngine.reverb,
                            synths: nextAudioEngine.synths,
                            createOfflineChain: nextAudioEngine.createOfflineChain,
                        },
                        dom: dom.recorder,
                        state: {
                            get isAudioContextStarted() {
                                return state.isAudioContextStarted;
                            },
                            get isPlaying() {
                                return state.isPlaying;
                            },
                        },
                        actions: {
                            showToast,
                            startUiLoop: nextVisualizer.startUiLoop,
                            stopUiLoop: nextVisualizer.stopUiLoop,
                            getAllSettings,
                            generateFilename,
                            formatTime,
                            startAudio: startAudioAction,
                            startPlayback,
                        },
                    });

                    pendingAudioEngine = nextAudioEngine;
                    nextPatternController = createPatternController({
                        getSynth: () => nextAudioEngine?.activeSynth || null,
                        getIsPlaying: () => state.isPlaying,
                        onPatternChange,
                        onStep: onPatternStep,
                    });
                    loadAllSettings(getAllSettings());

                    audioEngine = nextAudioEngine;
                    visualizer = nextVisualizer;
                    recorderManager = nextRecorderManager;
                    patternController = nextPatternController;
                    pendingAudioEngine = null;
                    onContextReady?.();
                } catch (error) {
                    nextVisualizer?.destroy();
                    nextAudioEngine?.dispose();
                    try {
                        nextPatternController?.dispose();
                    } catch (cleanupError) {
                        logger.warn?.(
                            "Failed to dispose a partial arpeggio pattern:",
                            cleanupError,
                        );
                    }
                    audioEngine = undefined;
                    pendingAudioEngine = null;
                    visualizer = undefined;
                    recorderManager = undefined;
                    patternController = undefined;
                    onPatternChange(null);
                    throw error;
                }
            })().catch((error) => {
                audioRuntimePromise = null;
                throw error;
            });
        }
        return audioRuntimePromise;
    }

    /**
     * Starts the AudioContext and publishes a fully built runtime.
     *
     * @returns {Promise<void>}
     */
    async function startAudio() {
        if (state.isAudioContextStarted && Tone?.getContext().state === "running") return;

        if (!audioStartPromise) {
            audioStartPromise = (async () => {
                try {
                    await loadAudioModules();
                    const context = Tone.getContext();
                    if (context.state !== "running") await Tone.start();
                    await initializeAudioRuntime();
                    state.isAudioContextStarted = true;
                    onAudioReady?.();
                } catch (error) {
                    logger.error?.("AudioContext failed to start/resume:", error);
                    showToast("Audio failed to start. See console.", "error");
                    throw error;
                }
            })().finally(() => {
                audioStartPromise = null;
            });
        }

        return audioStartPromise;
    }

    /** @returns {object|null} Loaded Tone namespace. */
    function getTone() {
        return Tone;
    }

    /** @returns {object|null|undefined} Active or pending engine. */
    function getAvailableAudioEngine() {
        return audioEngine || pendingAudioEngine;
    }

    /** @returns {object|undefined} Published live engine. */
    function getAudioEngine() {
        return audioEngine;
    }

    /** @returns {object|undefined} Published pattern controller. */
    function getPatternController() {
        return patternController;
    }

    /** @returns {object|undefined} Published recorder manager. */
    function getRecorderManager() {
        return recorderManager;
    }

    /** @returns {object|undefined} Published visualizer. */
    function getVisualizer() {
        return visualizer;
    }

    /** @returns {void} Releases partially or fully built runtime resources. */
    function destroy() {
        visualizer?.destroy();
        audioEngine?.dispose();
        patternController?.dispose();
        audioEngine = undefined;
        pendingAudioEngine = null;
        visualizer = undefined;
        recorderManager = undefined;
        patternController = undefined;
        audioRuntimePromise = null;
        audioStartPromise = null;
        state.isAudioContextStarted = false;
        onPatternChange(null);
    }

    return {
        loadAudioModules,
        startAudio,
        initializeAudioRuntime,
        getTone,
        getAvailableAudioEngine,
        getAudioEngine,
        getPatternController,
        getRecorderManager,
        getVisualizer,
        destroy,
    };
}
