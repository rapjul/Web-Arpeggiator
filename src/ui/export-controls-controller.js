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
} from "@core/export-duration.js";
import { exportMidiFile } from "@core/midi-export.js";
import { compileTimeline, getTimelineTerminalEndSeconds } from "@core/timeline.js";

/** @typedef {import("@core/settings-contract.js").ArpeggiatorSettings} ArpeggiatorSettings */
/** @typedef {import("@core/timeline.js").CompiledTimeline} CompiledTimeline */

/**
 * Creates the export controls controller.
 *
 * @param {{dom: {loopCountInput: HTMLInputElement, offlineExportModeInputs: NodeListOf<HTMLInputElement>, offlineExportTailControl: HTMLElement|null, offlineExportTailModeSelect: HTMLSelectElement|null, offlineExportTailSecondsInput: HTMLInputElement|null, offlineExportDuration: HTMLElement|null, recordButton: HTMLElement, exportButton: HTMLElement, offlineExportButton: HTMLElement, offlineExportMidiButton: HTMLElement|null, toggleVisualizerButton: HTMLElement, visualizerModeSelect: HTMLSelectElement|null}, getSettings: () => ArpeggiatorSettings, getTimeline?: () => CompiledTimeline|null, getRecorderManager: () => {toggleRecording: () => Promise<void>, exportRealtime: () => Promise<void>, exportOffline: () => Promise<void>}|undefined, getVisualizer: () => {currentMode: string, toggle: () => void}|undefined, startAudio: () => Promise<void>, generateFilename: (isRealtime: boolean) => string, showToast: (message: string, type?: string) => void, renderStaticLoop: () => Promise<void>, debounce: (callback: () => void, wait: number) => () => void, logger?: {error?: (...args: unknown[]) => void, warn?: (...args: unknown[]) => void}}} dependencies - Injected export behavior.
 * @returns {{initialize: () => void, destroy: () => void, updateEstimatedExportDuration: () => void, updateOfflineExportModeUi: () => void, requestStaticLoopRender: () => void}} Export controls API.
 */
export function createExportControlsController(dependencies) {
    const {
        dom,
        getSettings,
        getTimeline,
        getRecorderManager,
        getVisualizer,
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
        offlineExportDuration,
        recordButton,
        exportButton,
        offlineExportButton,
        offlineExportMidiButton,
        toggleVisualizerButton,
        visualizerModeSelect,
    } = dom;
    let listenerController = null;
    const requestStaticLoopRender = debounce(() => {
        const visualizer = getVisualizer();
        if (visualizer?.currentMode === "loopMap") void renderStaticLoop();
    }, 150);

    function getSelectedOfflineExportMode() {
        return Array.from(offlineExportModeInputs).some(
            (input) => input.checked && input.value === "seamless",
        )
            ? "seamless"
            : "tail";
    }

    function updateOfflineExportModeUi() {
        const isTailMode = getSelectedOfflineExportMode() === "tail";
        const tailMode = normalizeOfflineExportTailMode(
            offlineExportTailModeSelect?.value,
            "custom",
        );
        offlineExportTailControl?.classList.toggle("hidden", !isTailMode);
        if (offlineExportTailModeSelect) offlineExportTailModeSelect.disabled = !isTailMode;
        if (offlineExportTailSecondsInput) {
            offlineExportTailSecondsInput.disabled = !isTailMode || tailMode === "auto";
        }
    }

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
            terminalDuration,
        });
    }

    async function startAndRun(action, warning) {
        try {
            await startAudio();
        } catch (error) {
            logger.warn?.(warning, error);
            return;
        }
        try {
            await action();
        } catch (error) {
            logger.warn?.(warning, error);
        }
    }

    function handleMidiExport() {
        try {
            const settings = getSettings();
            const timeline = compileTimeline(settings, { cycles: settings.loopCount });
            exportMidiFile({ timeline }, `${generateFilename(false)}.mid`);
            showToast("Exported MIDI pattern file!", "success");
        } catch (error) {
            logger.error?.("Failed to export MIDI pattern:", error);
            showToast("Failed to export MIDI pattern.", "error");
        }
    }

    function initialize() {
        if (listenerController) return;
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
                ),
            listenerOptions,
        );
        exportButton.addEventListener(
            "click",
            () =>
                startAndRun(
                    () => getRecorderManager()?.exportRealtime(),
                    "AudioContext failed to start on recording export click:",
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

    function destroy() {
        listenerController?.abort();
        listenerController = null;
    }

    return {
        initialize,
        destroy,
        updateEstimatedExportDuration,
        updateOfflineExportModeUi,
        requestStaticLoopRender,
    };
}
