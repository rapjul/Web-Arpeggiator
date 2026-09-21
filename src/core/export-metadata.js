/**
 * Versioned metadata for offline audio exports.
 *
 * The settings snapshot is intentionally kept in a plain JSON-compatible
 * structure so a future importer can pass it through settings restoration
 * without needing to infer musical choices from rendered audio.
 */

export const OFFLINE_EXPORT_METADATA_SCHEMA = "web-arpeggiator.offline-export";
export const OFFLINE_EXPORT_METADATA_VERSION = 1;

/**
 * Creates an independent JSON-compatible copy of a settings record.
 *
 * @param {Record<string, unknown>} settings - Settings to copy.
 * @returns {Record<string, unknown>} Serializable settings copy.
 */
function cloneSettings(settings) {
    try {
        return JSON.parse(JSON.stringify(settings));
    } catch {
        return {};
    }
}

/**
 * @typedef {object} OfflineExportMetadataOptions
 * @property {Record<string, unknown>} settings - Complete serialized application settings snapshot.
 * @property {string[]} patternNotes - One materialized pattern cycle for version-1 compatibility.
 * @property {string[]} [renderedNotes] - Exact note sequence scheduled across the render.
 * @property {{exportMode: string, loopCount: number, musicalDuration: number, preRollCycles: number, preRollDuration: number, tailDuration: number, renderDuration: number}} exportDuration - Calculated timing window for the render.
 * @property {number} sampleRate - Frames per second in the exported buffer.
 * @property {number} channelCount - Audio channels in the exported buffer.
 * @property {number} frameCount - PCM frames per channel in the exported buffer.
 */

/**
 * Creates the self-contained settings record embedded in every offline WAV and
 * MP3 export. `patternNotes` keeps the version-1 repeating-cycle contract,
 * while `renderedNotes` preserves the complete materialized sequence,
 * including randomized directions. `settings` remains the source of truth for
 * future restoration into the interface.
 *
 * @param {OfflineExportMetadataOptions} options - Offline render details.
 * @returns {object} Versioned, JSON-compatible export metadata.
 */
export function createOfflineExportMetadata({
    settings,
    patternNotes,
    renderedNotes,
    exportDuration,
    sampleRate,
    channelCount,
    frameCount,
}) {
    const safePatternNotes = Array.isArray(patternNotes) ? patternNotes : [];
    const safeRenderedNotes = Array.isArray(renderedNotes) ? renderedNotes : safePatternNotes;
    return {
        schema: OFFLINE_EXPORT_METADATA_SCHEMA,
        version: OFFLINE_EXPORT_METADATA_VERSION,
        application: "Web Arpeggiator",
        export: {
            type: "offline-audio",
            mode: exportDuration.exportMode,
            loopCount: exportDuration.loopCount,
            musicalDurationSeconds: exportDuration.musicalDuration,
            preRollCycles: exportDuration.preRollCycles,
            preRollDurationSeconds: exportDuration.preRollDuration,
            tailDurationSeconds: exportDuration.tailDuration,
            renderDurationSeconds: exportDuration.renderDuration,
            sampleRate,
            channelCount,
            frameCount,
        },
        pattern: {
            scheduledNotes: [...safePatternNotes],
            stepsPerLoop: safePatternNotes.length,
            renderedNotes: [...safeRenderedNotes],
        },
        settings: cloneSettings(settings),
    };
}
