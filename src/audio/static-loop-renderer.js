/**
 * Renders one exact arpeggio cycle for the loop-map visualizer.
 *
 * @module audio/static-loop-renderer
 */

import { compileTimeline, ticksToSeconds } from "@core/timeline.js";

/** @typedef {import("@core/settings-contract.js").ArpeggiatorSettings} ArpeggiatorSettings */
/** @typedef {{transport: {bpm: {value: number}, swing: number, start: (time: number) => void}}} OfflineContextLike */
/** @typedef {{Offline: (callback: (context: OfflineContextLike) => Promise<void>, duration: number) => Promise<unknown>}} StaticToneLike */

/**
 * Creates a one-cycle offline renderer without importing Tone at module load.
 *
 * @param {{isAudioContextStarted: () => boolean, getTone: () => StaticToneLike|null, getAudioEngine: () => {createOfflineChain: (context: OfflineContextLike, settings: ArpeggiatorSettings) => {offlineSynth: {triggerAttackRelease: (note: string, duration: number, time: number) => void}}}|undefined, getSettings: () => ArpeggiatorSettings, getTimeline?: () => import("@core/timeline.js").CompiledTimeline|null, updateStaticLoopMap: (buffer: unknown, markers: unknown[]) => void, logger?: {error?: (...args: unknown[]) => void}}} dependencies - Injected runtime dependencies.
 * @returns {{render: () => Promise<void>}} Static loop renderer API.
 */
export function createStaticLoopRenderer(dependencies) {
    const {
        isAudioContextStarted,
        getTone,
        getAudioEngine,
        getSettings,
        getTimeline,
        updateStaticLoopMap,
        logger = console,
    } = dependencies;

    /** @returns {Promise<void>} Renders one cycle and updates the visualizer. */
    async function render() {
        const tone = getTone();
        const audioEngine = getAudioEngine();
        if (!isAudioContextStarted() || !tone || !audioEngine) return;

        const settings = getSettings();
        const timeline =
            getTimeline?.() ??
            compileTimeline(
                {
                    baseNotes: settings.baseNotes,
                    direction: settings.direction,
                    octaveRange: settings.octaveRange,
                    octaveShift: settings.octaveShift,
                    quantize: {
                        enabled: settings.scaleQuantize,
                        root: settings.scaleRoot,
                        scale: settings.scaleType,
                    },
                    interval: settings.interval,
                    gateRatio: settings.gateRatio,
                    bpm: settings.bpm,
                    swing: settings.swing,
                },
                { cycles: 1 },
            );
        if (timeline.events.length === 0) return;

        const markers = timeline.events.map((event) => ({
            note: event.pitch,
            timeRatio: event.startTick / timeline.cycleDurationTicks,
        }));
        const loopDuration = ticksToSeconds(timeline.musicalDurationTicks, timeline.bpm);

        if (!(loopDuration > 0)) return;

        try {
            const audioBuffer = await tone.Offline(async (offlineContext) => {
                offlineContext.transport.bpm.value = timeline.bpm;
                offlineContext.transport.swing = 0;
                const { offlineSynth } = audioEngine.createOfflineChain(offlineContext, settings);
                timeline.events.forEach((event) => {
                    offlineSynth.triggerAttackRelease(
                        event.pitch,
                        ticksToSeconds(event.durationTicks, timeline.bpm),
                        ticksToSeconds(event.startTick, timeline.bpm),
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
