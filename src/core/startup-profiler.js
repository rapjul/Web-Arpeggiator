/**
 * Local performance profiling utilities using the standard Web Performance API.
 *
 * Provides high-resolution microsecond marks and duration measures across
 * audio module loading, context resumption, graph creation, settings application,
 * and first audible note playback.
 *
 * Privacy and performance guarantee:
 * Zero network requests, zero remote analytics, and zero external tracking.
 * All marks are stored strictly in local browser memory.
 * Profiling is active during development and automated tests, and in production
 * only when explicitly opted into via URL query parameters (?perf=true or ?debug=true).
 *
 * @module core/startup-profiler
 */

/** Canonical performance mark identifiers for the audio startup lifecycle. */
export const STARTUP_MARKS = Object.freeze({
    USER_START_GESTURE: "audio:user-start-gesture",
    MODULES_LOADING: "audio:modules-loading",
    MODULES_LOADED: "audio:modules-loaded",
    CONTEXT_RESUMING: "audio:context-resuming",
    CONTEXT_RESUMED: "audio:context-resumed",
    ENGINE_CREATING: "audio:engine-creating",
    ENGINE_CREATED: "audio:engine-created",
    SETTINGS_APPLYING: "audio:settings-applying",
    SETTINGS_APPLIED: "audio:settings-applied",
    TRANSPORT_STARTING: "audio:transport-starting",
    FIRST_STEP_EXECUTED: "audio:first-step-executed",
});

/** Canonical performance measure names for the audio startup waterfall. */
export const STARTUP_MEASURES = Object.freeze({
    MODULES_LOAD: "audio:modules-load-duration",
    CONTEXT_RESUME: "audio:context-resume-duration",
    ENGINE_BUILD: "audio:engine-build-duration",
    SETTINGS_APPLY: "audio:settings-apply-duration",
    TRANSPORT_TO_FIRST_NOTE: "audio:transport-to-first-note",
    TOTAL_COLD_START: "audio:total-cold-start",
});

/**
 * Test override for startup profiling enablement.
 * @type {boolean|null}
 */
let profilingOverride = null;

/**
 * Overrides profiling enablement for testing environments.
 *
 * @param {boolean|null} enabled - True/false to force enablement, or null to reset.
 * @returns {void}
 */
export function setProfilingOverride(enabled) {
    profilingOverride = enabled;
}

/**
 * Evaluates whether a search query string contains profiling activation flags.
 *
 * Requires exact `perf=true` or `debug=true` key-value pairs to prevent
 * unintentional activation from substrings like `?notperf=true`.
 *
 * @param {string} search - URL search query string.
 * @returns {boolean} Whether flags are present.
 */
export function isSearchParamEnabled(search) {
    if (typeof search !== "string" || search.length === 0) return false;
    try {
        const normalized = search.startsWith("?") ? search : `?${search}`;
        const params = new URLSearchParams(normalized);
        return params.get("perf") === "true" || params.get("debug") === "true";
    } catch {
        return false;
    }
}

/**
 * Determines whether local startup profiling is active.
 *
 * Enabled automatically during development and automated testing.
 * In production builds, profiling is completely inactive unless explicitly
 * requested via URL query parameters (?perf=true or ?debug=true).
 *
 * @returns {boolean} Whether performance profiling is enabled.
 */
export function isProfilingEnabled() {
    if (typeof profilingOverride === "boolean") {
        return profilingOverride;
    }

    const env = /** @type {Record<string, unknown>} */ (import.meta.env);
    const isDevOrTest = Boolean(import.meta.env.DEV || env?.MODE === "test");

    if (typeof window === "undefined") {
        return isDevOrTest;
    }
    return Boolean(isDevOrTest || isSearchParamEnabled(window.location.search));
}

/**
 * Safely creates a performance mark if profiling is enabled and supported by the runtime.
 *
 * @param {string} name - Name of the performance mark.
 * @returns {void}
 */
export function mark(name) {
    if (!isProfilingEnabled()) return;

    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
        try {
            performance.mark(name);
        } catch {
            // Environments with restricted or mocked performance APIs fail gracefully.
        }
    }
}

/**
 * Checks whether a specific performance mark exists in the performance buffer.
 *
 * @param {string} name - Name of the mark to verify.
 * @returns {boolean} Whether the mark has been recorded.
 */
export function hasMark(name) {
    if (!isProfilingEnabled()) return false;

    if (typeof performance !== "undefined" && typeof performance.getEntriesByName === "function") {
        try {
            return performance.getEntriesByName(name, "mark").length > 0;
        } catch {
            return false;
        }
    }
    return false;
}

/**
 * Safely clears a specific performance mark from the performance buffer.
 *
 * @param {string} name - Name of the mark to clear.
 * @returns {void}
 */
export function clearMark(name) {
    if (typeof performance !== "undefined" && typeof performance.clearMarks === "function") {
        try {
            performance.clearMarks(name);
        } catch {
            // Environments with restricted or mocked performance APIs fail gracefully.
        }
    }
}

/**
 * Checks whether a specific performance measure exists in the performance buffer.
 *
 * @param {string} name - Name of the measure to verify.
 * @returns {boolean} Whether the measure has been recorded.
 */
export function hasMeasure(name) {
    if (!isProfilingEnabled()) return false;

    if (typeof performance !== "undefined" && typeof performance.getEntriesByName === "function") {
        try {
            return performance.getEntriesByName(name, "measure").length > 0;
        } catch {
            return false;
        }
    }
    return false;
}

/**
 * Retrieves the most recent performance measure for a given name if it exists.
 *
 * @param {string} name - Name of the measure to retrieve.
 * @returns {PerformanceMeasure|null} The measure or null if missing/failed.
 */
export function getMeasure(name) {
    if (!isProfilingEnabled()) return null;

    if (typeof performance !== "undefined" && typeof performance.getEntriesByName === "function") {
        try {
            const entries = performance.getEntriesByName(name, "measure");
            return entries.length > 0
                ? /** @type {PerformanceMeasure} */ (entries[entries.length - 1])
                : null;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Safely creates a performance measure between two marks if both exist.
 *
 * @param {string} name - Name of the measure to create.
 * @param {string} startMark - Starting mark identifier.
 * @param {string} endMark - Ending mark identifier.
 * @returns {PerformanceMeasure|null} The created measure or null if skipped/failed.
 */
export function measure(name, startMark, endMark) {
    if (!isProfilingEnabled()) return null;

    if (name === STARTUP_MEASURES.TOTAL_COLD_START && hasMeasure(name)) {
        return getMeasure(name);
    }

    if (
        typeof performance !== "undefined" &&
        typeof performance.measure === "function" &&
        hasMark(startMark) &&
        hasMark(endMark)
    ) {
        try {
            return performance.measure(name, startMark, endMark);
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * @typedef {object} WaterfallStep
 * @property {string} phase - Human-readable label for the startup phase.
 * @property {string} measureName - Identifier of the Performance API measure.
 * @property {number} durationMs - Duration of the phase in milliseconds, rounded to 2 decimals.
 * @property {number} startTimeMs - Start time relative to page navigation origin in milliseconds.
 */

/**
 * Calculates standard startup measures across known lifecycle marks.
 *
 * @returns {WaterfallStep[]} Formatted waterfall entries for present measures.
 */
export function calculateStartupWaterfall() {
    if (!isProfilingEnabled()) return [];

    /** @type {Array<[string, string, string]>} */
    const measureConfigs = [
        [
            STARTUP_MEASURES.MODULES_LOAD,
            STARTUP_MARKS.MODULES_LOADING,
            STARTUP_MARKS.MODULES_LOADED,
        ],
        [
            STARTUP_MEASURES.CONTEXT_RESUME,
            STARTUP_MARKS.CONTEXT_RESUMING,
            STARTUP_MARKS.CONTEXT_RESUMED,
        ],
        [
            STARTUP_MEASURES.ENGINE_BUILD,
            STARTUP_MARKS.ENGINE_CREATING,
            STARTUP_MARKS.ENGINE_CREATED,
        ],
        [
            STARTUP_MEASURES.SETTINGS_APPLY,
            STARTUP_MARKS.SETTINGS_APPLYING,
            STARTUP_MARKS.SETTINGS_APPLIED,
        ],
        [
            STARTUP_MEASURES.TRANSPORT_TO_FIRST_NOTE,
            STARTUP_MARKS.TRANSPORT_STARTING,
            STARTUP_MARKS.FIRST_STEP_EXECUTED,
        ],
        [
            STARTUP_MEASURES.TOTAL_COLD_START,
            STARTUP_MARKS.USER_START_GESTURE,
            STARTUP_MARKS.FIRST_STEP_EXECUTED,
        ],
    ];

    /** @type {WaterfallStep[]} */
    const steps = [];

    for (const [measureName, startMark, endMark] of measureConfigs) {
        const perfMeasure = measure(measureName, startMark, endMark);
        if (perfMeasure) {
            steps.push({
                phase: measureName.replace("audio:", "").replace(/-/g, " "),
                measureName,
                durationMs: Math.round(perfMeasure.duration * 100) / 100,
                startTimeMs: Math.round(perfMeasure.startTime * 100) / 100,
            });
        }
    }

    return steps;
}

/**
 * Logs a structured breakdown of audio startup latency measures to the provided logger.
 *
 * @param {{table?: (...args: unknown[]) => void, log?: (...args: unknown[]) => void}} [logger] - Destination logger.
 * @returns {WaterfallStep[]} The computed steps.
 */
export function logStartupWaterfall(logger = console) {
    if (!isProfilingEnabled()) return [];

    const waterfall = calculateStartupWaterfall();
    if (waterfall.length === 0) return waterfall;

    const formattedRows = waterfall.map((step) => ({
        Phase: step.phase,
        "Duration (ms)": step.durationMs,
        "Start (ms)": step.startTimeMs,
    }));

    if (typeof logger.table === "function") {
        logger.table(formattedRows);
    } else if (typeof logger.log === "function") {
        logger.log("Audio Startup Waterfall:", formattedRows);
    }

    return waterfall;
}

/**
 * Clears audio startup marks and measures from the performance buffer.
 *
 * @returns {void}
 */
export function clearStartupProfiler() {
    if (typeof performance === "undefined") return;

    try {
        if (typeof performance.clearMarks === "function") {
            for (const markName of Object.values(STARTUP_MARKS)) {
                performance.clearMarks(markName);
            }
        }
        if (typeof performance.clearMeasures === "function") {
            for (const measureName of Object.values(STARTUP_MEASURES)) {
                performance.clearMeasures(measureName);
            }
        }
    } catch {
        // Restricted environments fail gracefully.
    }
}
