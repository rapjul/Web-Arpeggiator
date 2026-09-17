/**
 * Renders one exact arpeggio cycle for the loop-map visualizer.
 *
 * @module audio/static-loop-renderer
 */

import { calculateNoteMarkers } from "@core/pattern-core.js";

/** @typedef {import("@core/settings-contract.js").ArpeggiatorSettings} ArpeggiatorSettings */
/** @typedef {{transport: {bpm: {value: number}, swing: number, start: (time: number) => void}}} OfflineContextLike */
/** @typedef {{Time: (value: string) => {toSeconds: () => number}, Offline: (callback: (context: OfflineContextLike) => Promise<void>, duration: number) => Promise<unknown>}} StaticToneLike */

/**
 * Creates a one-cycle offline renderer without importing Tone at module load.
 *
 * @param {{isAudioContextStarted: () => boolean, getTone: () => StaticToneLike|null, getAudioEngine: () => {createOfflineChain: (context: OfflineContextLike, settings: ArpeggiatorSettings) => {offlineSynth: {triggerAttackRelease: (note: string, duration: number, time: number) => void}}}|undefined, getSettings: () => ArpeggiatorSettings, updateStaticLoopMap: (buffer: unknown, markers: unknown[]) => void, logger?: {error?: (...args: unknown[]) => void}}} dependencies - Injected runtime dependencies.
 * @returns {{render: () => Promise<void>}} Static loop renderer API.
 */
export function createStaticLoopRenderer(dependencies) {
    const {
        isAudioContextStarted,
        getTone,
        getAudioEngine,
        getSettings,
        updateStaticLoopMap,
        logger = console,
    } = dependencies;

    /** @returns {Promise<void>} Renders one cycle and updates the visualizer. */
    async function render() {
        const tone = getTone();
        const audioEngine = getAudioEngine();
        if (!isAudioContextStarted() || !tone || !audioEngine) return;

        const settings = getSettings();
        const markers = calculateNoteMarkers(settings);
        if (!markers || markers.length === 0) return;

        const noteDuration = tone.Time(settings.interval).toSeconds();
        const loopDuration = markers.length * noteDuration;

        try {
            const audioBuffer = await tone.Offline(async (offlineContext) => {
                offlineContext.transport.bpm.value = settings.bpm;
                offlineContext.transport.swing = settings.swing;
                const { offlineSynth } = audioEngine.createOfflineChain(offlineContext, settings);
                const gateLength = settings.gateRatio * noteDuration;
                markers.forEach((marker, index) => {
                    offlineSynth.triggerAttackRelease(
                        marker.note,
                        gateLength,
                        index * noteDuration,
                    );
                });
                offlineContext.transport.start(0);
            }, loopDuration);
            updateStaticLoopMap(audioBuffer, markers);
        } catch (error) {
            logger.error?.("Static loop render failed:", error);
        }
    }

    return { render };
}
