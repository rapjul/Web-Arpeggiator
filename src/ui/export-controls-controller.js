/**
 * Coordinates recording, export, offline-mode, and loop-preview controls.
 *
 * @module export-controls-controller
 */

import {
    formatEstimatedExportDuration,
    normalizeLoopCount,
    normalizeOfflineExportTailMode,
    normalizeOfflineExportTailSeconds,
    OFFLINE_EXPORT_MODE_SEAMLESS,
    OFFLINE_EXPORT_MODE_TAIL,
} from "@core/export-duration.js";
import { exportMidiFile } from "@core/midi-export.js";
import { compileTimeline, getTimelineTerminalEndSeconds } from "@core/timeline.js";

/** @typedef {import("@core/settings-contract.js").ArpeggiatorSettings} ArpeggiatorSettings */
/** @typedef {import("@core/timeline.js").CompiledTimeline} CompiledTimeline */

/**
 * DOM element references required by the export controls controller.
 *
 * @typedef {Object} ExportControlsDom
 * @property {HTMLInputElement} loopCountInput - Input for offline export cycle count.
 * @property {NodeListOf<HTMLInputElement>} offlineExportModeInputs - Radio buttons for export mode.
 * @property {HTMLElement|null} offlineExportTailControl - Container for effects tail controls.
 * @property {HTMLSelectElement|null} offlineExportTailModeSelect - Select element for tail strategy.
 * @property {HTMLInputElement|null} offlineExportTailSecondsInput - Custom tail duration input.
 * @property {HTMLElement|null} [offlineExportTailSecondsLabel] - Tail duration label element.
 * @property {HTMLElement|null} offlineExportDuration - Container displaying estimated export duration.
 * @property {HTMLElement} recordButton - Real-time recording toggle button.
 * @property {HTMLElement} exportButton - Real-time export trigger button.
 * @property {HTMLElement} offlineExportButton - Offline audio export trigger button.
 * @property {HTMLElement|null} offlineExportMidiButton - MIDI export trigger button.
 * @property {HTMLElement} toggleVisualizerButton - Visualizer toggle button.
 * @property {HTMLSelectElement|null} visualizerModeSelect - Visualizer mode selector dropdown.
 */

/**
 * Recorder manager dependency interface.
 *
 * @typedef {Object} ExportRecorderManager
 * @property {() => Promise<void>} toggleRecording - Toggles real-time capture.
 * @property {() => Promise<void>} exportRealtime - Triggers real-time audio export.
 * @property {() => Promise<void>} exportOffline - Triggers offline audio export.
 */

/**
 * Visualizer dependency interface.
 *
 * @typedef {Object} ExportVisualizer
 * @property {string} currentMode - Current visualizer mode (e.g. "oscilloscope" or "loopMap").
 * @property {boolean} [isVisualizerOn] - Whether visualizer rendering is currently active.
 * @property {() => void} toggle - Toggles visualizer on/off state.
 */

/**
 * Logger dependency interface.
 *
 * @typedef {Object} ExportLogger
 * @property {(...args: unknown[]) => void} [error] - Error logging method.
 * @property {(...args: unknown[]) => void} [warn] - Warning logging method.
 */

/**
 * Injected dependencies for the export controls controller.
 *
 * @typedef {Object} ExportControlsDependencies
 * @property {ExportControlsDom} dom - Injected DOM element references.
 * @property {() => ArpeggiatorSettings} getSettings - Accessor for current settings snapshot.
 * @property {() => CompiledTimeline|null} [getTimeline] - Accessor for compiled musical timeline.
 * @property {() => ExportRecorderManager|undefined} getRecorderManager - Accessor for recorder manager.
 * @property {() => ExportVisualizer|undefined} getVisualizer - Accessor for visualizer instance.
 * @property {() => string} [getInterfaceMode] - Accessor for current interface mode ("simple" | "full").
 * @property {() => Promise<void>} startAudio - Initializes audio context and runtime.
 * @property {(isRealtime: boolean) => string} generateFilename - Filename generator for exports.
 * @property {(message: string, type?: string) => void} showToast - Toast feedback notification handler.
 * @property {() => Promise<void>} renderStaticLoop - Triggers offline loop preview rendering.
 * @property {<T extends (...args: unknown[]) => unknown>(callback: T, wait: number) => T & {cancel?: () => void}} debounce - Debounce helper factory.
 * @property {number} [initialAdvancedActionGeneration] - Starting generation index for testing.
 * @property {ExportLogger} [logger] - Optional diagnostic logger.
 */

/**
 * Export controls controller public interface.
 *
 * @typedef {Object} ExportControlsController
 * @property {() => void} initialize - Wires DOM listeners and initializes UI state.
 * @property {() => void} destroy - Tears down event listeners and aborts pending actions.
 * @property {() => void} updateEstimatedExportDuration - Recalculates and updates duration display.
 * @property {() => void} updateOfflineExportModeUi - Updates visibility and labels for export mode controls.
 * @property {() => void} requestStaticLoopRender - Requests debounced offline loop rendering.
 * @property {() => void} cancelPendingAdvancedActions - Cancels pending renders and increments action generation.
 * @property {() => number} getAdvancedActionGeneration - Returns the current generation counter.
 */

/**
 * Maximum safe generation threshold before rolling over.
 * @constant {number}
 */
const MAX_ACTION_GENERATION = Number.MAX_SAFE_INTEGER;

/**
 * Creates the export controls controller.
 *
 * @param {ExportControlsDependencies} dependencies - Injected export behavior.
 * @returns {ExportControlsController} Export controls API.
 */
export function createExportControlsController(dependencies) {
    const {
        dom,
        getSettings,
        getTimeline,
        getRecorderManager,
        getVisualizer,
        getInterfaceMode,
        startAudio,
        generateFilename,
        showToast,
        renderStaticLoop,
        debounce,
        logger = console,
    } = dependencies;
    const {
        loopCountInput,
        offlineExportModeInputs,
        offlineExportTailControl,
        offlineExportTailModeSelect,
        offlineExportTailSecondsInput,
        offlineExportTailSecondsLabel = dom.offlineExportTailControl?.querySelector?.(
            "label[for='offline-export-tail-seconds']",
        ) ?? null,
        offlineExportDuration,
        recordButton,
        exportButton,
        offlineExportButton,
        offlineExportMidiButton,
        toggleVisualizerButton,
        visualizerModeSelect,
    } = dom;
    let listenerController = null;
    let isDestroyed = false;
    let advancedActionGeneration = Number.isSafeInteger(
        dependencies.initialAdvancedActionGeneration,
    )
        ? dependencies.initialAdvancedActionGeneration
        : 0;

    /**
     * Debounced request to render static loop map visualization.
     * Guards against invocation in Simple mode or when the visualizer is inactive or not in loopMap mode.
     *
     * @type {(() => void) & {cancel?: () => void}}
     */
    const requestStaticLoopRender = debounce(() => {
        if (isDestroyed || getInterfaceMode?.() === "simple") return;
        const visualizer = getVisualizer();
        if (visualizer?.isVisualizerOn && visualizer?.currentMode === "loopMap") {
            void renderStaticLoop();
        }
    }, 150);

    /**
     * Invalidates any in-flight advanced actions queued during audio initialization.
     *
     * @returns {void}
     */
    function cancelPendingAdvancedActions() {
        /** @type {{cancel?: () => void}} */ (requestStaticLoopRender).cancel?.();
        if (
            !Number.isSafeInteger(advancedActionGeneration) ||
            advancedActionGeneration >= MAX_ACTION_GENERATION ||
            advancedActionGeneration < 0
        ) {
            advancedActionGeneration = 1;
        } else {
            advancedActionGeneration += 1;
        }
    }

    /**
     * Determines whether seamless loop or effects-tail export mode is currently selected.
     *
     * @returns {string} The selected offline export mode ("seamless" or "tail").
     */
    function getSelectedOfflineExportMode() {
        return Array.from(offlineExportModeInputs).some(
            (input) => input.checked && input.value === OFFLINE_EXPORT_MODE_SEAMLESS,
        )
            ? OFFLINE_EXPORT_MODE_SEAMLESS
            : OFFLINE_EXPORT_MODE_TAIL;
    }

    /**
     * Synchronizes UI visibility, disabled attributes, and tooltips for offline export tail controls.
     *
     * @returns {void}
     */
    function updateOfflineExportModeUi() {
        const isTailMode = getSelectedOfflineExportMode() === OFFLINE_EXPORT_MODE_TAIL;
        const tailMode = normalizeOfflineExportTailMode(
            offlineExportTailModeSelect?.value,
            "custom",
        );
        offlineExportTailControl?.classList.toggle("hidden", !isTailMode);
        if (offlineExportTailModeSelect) offlineExportTailModeSelect.disabled = !isTailMode;
        const isTailSecondsDisabled = !isTailMode || tailMode === "auto";
        if (offlineExportTailSecondsInput) {
            offlineExportTailSecondsInput.disabled = isTailSecondsDisabled;
            if (isTailSecondsDisabled) {
                offlineExportTailSecondsInput.setAttribute("aria-disabled", "true");
            } else {
                offlineExportTailSecondsInput.removeAttribute("aria-disabled");
            }
        }
        if (offlineExportTailSecondsLabel) {
            offlineExportTailSecondsLabel.classList.toggle(
                "setting-target-disabled",
                isTailSecondsDisabled,
            );
            if (isTailSecondsDisabled) {
                if (offlineExportTailSecondsLabel.hasAttribute("title")) {
                    offlineExportTailSecondsLabel.dataset.activeTitle =
                        offlineExportTailSecondsLabel.getAttribute("title") || "";
                    offlineExportTailSecondsLabel.removeAttribute("title");
                }
            } else if (offlineExportTailSecondsLabel.dataset.activeTitle) {
                offlineExportTailSecondsLabel.setAttribute(
                    "title",
                    offlineExportTailSecondsLabel.dataset.activeTitle,
                );
            }
        }
    }

    /**
     * Calculates and updates the human-readable estimated export duration label.
     *
     * @returns {void}
     */
    function updateEstimatedExportDuration() {
        if (!offlineExportDuration) return;
        const settings = getSettings();
        const timeline = getTimeline?.() ?? compileTimeline(settings, { cycles: 1 });
        const selectedTimeline =
            settings.offlineExportMode === "tail"
                ? compileTimeline(settings, {
                      cycles: settings.loopCount,
                      terminalGatePolicy: "preserve",
                  })
                : null;
        const terminalDuration = selectedTimeline
            ? getTimelineTerminalEndSeconds(selectedTimeline)
            : undefined;
        offlineExportDuration.textContent = formatEstimatedExportDuration({
            loopCount: settings.loopCount,
            stepsPerLoop: timeline.stepsPerCycle,
            interval: settings.interval,
            bpm: settings.bpm,
            exportMode: settings.offlineExportMode,
            tailMode: settings.offlineExportTailMode,
            tailSeconds: settings.offlineExportTailSeconds,
            envRelease: settings.envRelease,
            synthType: settings.synthType,
            delayMix: settings.delayMix,
            reverbMix: settings.reverbMix,
            chorusMix: settings.chorusMix,
            autoPanMix: settings.autoPanMix,
            swing: settings.swing,
            terminalDuration,
        });
    }

    /**
     * Ensures audio activation before executing a requested export or recording action.
     *
     * @param {() => Promise<unknown>|unknown} action - Export or recording callback.
     * @param {string} warning - Warning message logged if audio startup fails.
     * @param {{advancedOnly?: boolean}} [options={}] - Execution guard options.
     * @returns {Promise<void>}
     */
    async function startAndRun(action, warning, options = {}) {
        if (isDestroyed) return;
        if (typeof action !== "function") return;
        const advancedOnly = Boolean(options?.advancedOnly);
        const startGeneration = advancedActionGeneration;
        try {
            await startAudio();
        } catch (error) {
            if (isDestroyed) return;
            logger.warn?.(warning, error);
            return;
        }
        if (isDestroyed) return;
        // If the user switched to Simple mode or invalidated pending actions while asynchronous
        // audio runtime initialization was in flight, abort execution for advanced-only actions.
        if (
            advancedOnly &&
            (advancedActionGeneration !== startGeneration || getInterfaceMode?.() === "simple")
        ) {
            return;
        }
        try {
            await action();
        } catch (error) {
            logger.warn?.(warning, error);
        }
    }

    /**
     * Compiles the musical timeline and triggers standard MIDI (.mid) file download.
     *
     * @returns {void}
     */
    function handleMidiExport() {
        try {
            const settings = getSettings();
            const timeline = compileTimeline(settings, {
                cycles: settings.loopCount,
                terminalGatePolicy: "preserve",
            });
            exportMidiFile({ timeline }, `${generateFilename(false)}.mid`);
            showToast("Exported MIDI pattern file!", "success");
        } catch (error) {
            logger.error?.("Failed to export MIDI pattern:", error);
            showToast("Failed to export MIDI pattern.", "error");
        }
    }

    /**
     * Sets up DOM event listeners, binds inputs, and initializes control states.
     *
     * @returns {void}
     */
    function initialize() {
        if (listenerController) return;
        cancelPendingAdvancedActions();
        isDestroyed = false;
        listenerController = new AbortController();
        const listenerOptions = { signal: listenerController.signal };
        loopCountInput.addEventListener("input", updateEstimatedExportDuration, listenerOptions);
        loopCountInput.addEventListener(
            "change",
            () => {
                loopCountInput.value = String(normalizeLoopCount(loopCountInput.value));
                updateEstimatedExportDuration();
            },
            listenerOptions,
        );
        offlineExportModeInputs.forEach((input) => {
            input.addEventListener(
                "change",
                () => {
                    if (!input.checked) return;
                    updateOfflineExportModeUi();
                    updateEstimatedExportDuration();
                },
                listenerOptions,
            );
        });
        offlineExportTailModeSelect?.addEventListener(
            "change",
            () => {
                offlineExportTailModeSelect.value = normalizeOfflineExportTailMode(
                    offlineExportTailModeSelect.value,
                    "custom",
                );
                updateOfflineExportModeUi();
                updateEstimatedExportDuration();
            },
            listenerOptions,
        );
        offlineExportTailSecondsInput?.addEventListener(
            "input",
            updateEstimatedExportDuration,
            listenerOptions,
        );
        offlineExportTailSecondsInput?.addEventListener(
            "change",
            () => {
                offlineExportTailSecondsInput.value = String(
                    normalizeOfflineExportTailSeconds(offlineExportTailSecondsInput.value),
                );
                updateEstimatedExportDuration();
            },
            listenerOptions,
        );
        recordButton.addEventListener(
            "click",
            () =>
                startAndRun(
                    () => getRecorderManager()?.toggleRecording(),
                    "AudioContext failed to start on record click:",
                    { advancedOnly: true },
                ),
            listenerOptions,
        );
        exportButton.addEventListener(
            "click",
            () =>
                startAndRun(
                    () => getRecorderManager()?.exportRealtime(),
                    "AudioContext failed to start on recording export click:",
                    { advancedOnly: true },
                ),
            listenerOptions,
        );
        offlineExportButton.addEventListener(
            "click",
            () =>
                startAndRun(
                    () => getRecorderManager()?.exportOffline(),
                    "AudioContext failed to start on offline export click:",
                ),
            listenerOptions,
        );
        offlineExportMidiButton?.addEventListener("click", handleMidiExport, listenerOptions);
        toggleVisualizerButton.addEventListener(
            "click",
            () => getVisualizer()?.toggle(),
            listenerOptions,
        );
        visualizerModeSelect?.addEventListener(
            "change",
            () => {
                if (visualizerModeSelect.value === "loopMap") void renderStaticLoop();
            },
            listenerOptions,
        );
        updateOfflineExportModeUi();
        updateEstimatedExportDuration();
    }

    /**
     * Aborts event listeners, cancels pending debounced renders, and tears down controller state.
     *
     * @returns {void}
     */
    function destroy() {
        isDestroyed = true;
        cancelPendingAdvancedActions();
        /** @type {{cancel?: () => void}} */ (requestStaticLoopRender).cancel?.();
        listenerController?.abort();
        listenerController = null;
    }

    /**
     * Returns the current generation counter for queued advanced actions.
     *
     * @returns {number} Current generation.
     */
    function getAdvancedActionGeneration() {
        return advancedActionGeneration;
    }

    return {
        initialize,
        destroy,
        updateEstimatedExportDuration,
        updateOfflineExportModeUi,
        requestStaticLoopRender,
        cancelPendingAdvancedActions,
        getAdvancedActionGeneration,
    };
}
