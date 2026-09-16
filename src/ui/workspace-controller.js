/**
 * Coordinates settings history, reset gestures, and workspace autosave.
 *
 * The composition root supplies serialized-settings and DOM contracts while
 * this controller owns the workspace lifecycle that spans those concerns.
 *
 * @module workspace-controller
 */

import { normalizeSettingsHistory } from "@core/settings-contract.js";
import { createSettingsHistory } from "@core/settings-history.js";
import { createSessionManager } from "@storage/session-manager.js";

/** @typedef {import("@core/settings-contract.js").ArpeggiatorSettings} ArpeggiatorSettings */
/** @typedef {import("../../types.d.ts").WebArpPresetStore} WebArpPresetStore */

/**
 * @typedef {object} ResetDefinition
 * @property {string} name - Human-readable setting group name.
 * @property {string[]} keys - Serialized settings keys restored together.
 * @property {Array<Element|null>} controls - Controls associated with the group.
 * @property {string[]} targets - Selectors for resettable labels or headings.
 */

/**
 * @typedef {object} WorkspaceControllerDependencies
 * @property {Document} documentRef - Document that owns the application UI.
 * @property {{presetNameInput?: HTMLInputElement|null, savedPresetSelect?: HTMLSelectElement|null, loadPresetInput?: HTMLInputElement|null}} dom - Inputs excluded from autosave history.
 * @property {() => ResetDefinition[]} getResetDefinitions - Accessor for logical reset groups supplied by the composition root.
 * @property {() => WebArpPresetStore|undefined} getPresetStore - Accessor for workspace persistence.
 * @property {() => ArpeggiatorSettings} getAllSettings - Serializes current settings.
 * @property {(settings: unknown, options?: {allowFutureVersion?: boolean}) => {ok: boolean, settings?: ArpeggiatorSettings, error?: unknown}} loadAllSettings - Applies settings without recording history.
 * @property {() => string|null} getSelectedPatternDirection - Reads the selected pattern direction.
 * @property {(direction: string) => void} setSelectedPatternDirection - Restores the selected direction.
 * @property {() => void} clearActiveSoundStarterCard - Clears factory-preset selection.
 * @property {() => void} onStaticLoopChange - Requests a debounced static loop refresh.
 * @property {() => void} onHistoryChange - Refreshes the history UI.
 * @property {(message: string, type: "success"|"info"|"error") => void} showToast - Displays user feedback.
 */

/**
 * Creates the workspace history and autosave coordinator.
 *
 * @param {WorkspaceControllerDependencies} dependencies - Injected workspace behavior.
 * @returns {{initialize: (defaults: Record<string, unknown>) => void, destroy: () => void, getStatus: () => {canUndo: boolean, canRedo: boolean, isAtDefault: boolean}, applySettingsWithHistory: (settings: Record<string, unknown>, options?: Record<string, unknown>) => {ok: boolean, error?: unknown}, recordCurrentSettings: (coalesced?: boolean) => boolean, undoSettings: () => void, redoSettings: () => void, resetAllSettings: () => void, resetIndividualSettings: (definition: ResetDefinition) => void, getFocusedResetDefinition: (element: Element|null) => ResetDefinition|null, scheduleLastSessionSave: () => void, restoreLastSession: () => Promise<boolean>}}
 */
export function createWorkspaceController(dependencies) {
    const {
        documentRef,
        dom,
        getResetDefinitions,
        getPresetStore,
        getAllSettings,
        loadAllSettings,
        getSelectedPatternDirection,
        setSelectedPatternDirection,
        clearActiveSoundStarterCard,
        onStaticLoopChange,
        onHistoryChange,
        showToast,
    } = dependencies;
    const { presetNameInput, savedPresetSelect, loadPresetInput } = dom;
    const settingsHistory = createSettingsHistory();
    let defaultSettings = null;
    let listenerController = null;

    /**
     * Keeps the captured default independent from the settings object supplied
     * by the composition root.
     *
     * @param {Record<string, unknown>} settings - Serializable settings.
     * @returns {Record<string, unknown>} Cloned settings.
     */
    function cloneSettings(settings) {
        if (typeof structuredClone === "function") return structuredClone(settings);
        return JSON.parse(JSON.stringify(settings));
    }

    const sessionManager = createSessionManager({
        getPresetStore,
        getSettings: getAllSettings,
        getHistoryState: () => settingsHistory.exportState(),
        onRestore: (settings, persistedHistory) => {
            const result = loadAllSettings(settings);
            if (!result.ok) return;

            let history = null;
            try {
                history = normalizeSettingsHistory(persistedHistory, getAllSettings());
            } catch {
                history = null;
            }
            settingsHistory.restore(history, getAllSettings());
            const direction = getSelectedPatternDirection();
            setSelectedPatternDirection(direction || "up");
            onHistoryChange();
        },
    });

    /**
     * Applies a history snapshot without recording another entry.
     *
     * @param {Record<string, unknown>} settings - Snapshot to apply.
     * @returns {void}
     */
    function applyHistorySnapshot(settings) {
        loadAllSettings(settings);
        clearActiveSoundStarterCard();
        sessionManager.scheduleSave();
        onStaticLoopChange();
        onHistoryChange();
    }

    /**
     * Records current settings after a user-originated edit.
     *
     * @param {boolean} [coalesced=false] - Whether this belongs to a continuous gesture.
     * @returns {boolean} Whether history changed.
     */
    function recordCurrentSettings(coalesced = false) {
        const changed = coalesced
            ? settingsHistory.recordCoalesced(getAllSettings())
            : settingsHistory.record(getAllSettings());
        if (changed) onHistoryChange();
        return changed;
    }

    /**
     * Applies a settings replacement and records it as one history action.
     *
     * @param {Record<string, unknown>} settings - Replacement settings.
     * @param {Record<string, unknown>} [options={}] - Settings loading options.
     * @returns {{ok: boolean, error?: unknown}} Application result.
     */
    function applySettingsWithHistory(settings, options = {}) {
        settingsHistory.endTransaction();
        const result = loadAllSettings(settings, options);
        if (!result.ok) return result;
        recordCurrentSettings();
        clearActiveSoundStarterCard();
        sessionManager.scheduleSave();
        onStaticLoopChange();
        return result;
    }

    /** @returns {void} */
    function undoSettings() {
        const settings = settingsHistory.undo();
        if (settings) applyHistorySnapshot(settings);
    }

    /** @returns {void} */
    function redoSettings() {
        const settings = settingsHistory.redo();
        if (settings) applyHistorySnapshot(settings);
    }

    /** @returns {void} */
    function resetAllSettings() {
        if (!defaultSettings) return;
        applySettingsWithHistory(defaultSettings);
        showToast("Restored default settings. Undo is available.", "info");
    }

    /**
     * Restores one logical settings group to its captured default values.
     *
     * @param {ResetDefinition} definition - Group to restore.
     * @returns {void}
     */
    function resetIndividualSettings(definition) {
        if (!defaultSettings) return;
        const next = { ...getAllSettings() };
        definition.keys.forEach((key) => {
            next[key] = defaultSettings[key];
        });
        applySettingsWithHistory(next);
        showToast(`Reset ${definition.name} to default.`, "info");
    }

    /**
     * Installs double-click and focused-control reset affordances.
     *
     * @returns {void}
     */
    function registerIndividualResetGestures() {
        getResetDefinitions().forEach((definition) => {
            const hint = `Double-click to reset ${definition.name}. Press Escape while focused to reset.`;
            definition.targets.forEach((selector) => {
                const target = documentRef.querySelector(selector);
                if (!target) return;
                target.setAttribute("title", hint);
                target.classList.add("resettable-setting-target");
                target.addEventListener(
                    "dblclick",
                    (event) => {
                        event.preventDefault();
                        resetIndividualSettings(definition);
                    },
                    { signal: listenerController.signal },
                );
            });
            definition.controls.forEach((control) => {
                control?.setAttribute("aria-description", hint);
            });
        });
    }

    /**
     * Finds the reset group containing the focused element.
     *
     * @param {Element|null} element - Focused element.
     * @returns {ResetDefinition|null} Matching reset definition.
     */
    function getFocusedResetDefinition(element) {
        if (!element) return null;
        return (
            getResetDefinitions().find((definition) =>
                definition.controls.some(
                    (control) => control === element || control?.contains(element),
                ),
            ) || null
        );
    }

    /**
     * Determines whether a document target should be tracked in settings history.
     *
     * @param {Element|null} target - Document event target.
     * @returns {boolean} Whether the target is an editable settings control.
     */
    function isTrackedFormTarget(target) {
        if (!target) return false;
        if (
            target === presetNameInput ||
            target === savedPresetSelect ||
            target === loadPresetInput
        )
            return false;
        return target.matches("input, select, textarea");
    }

    /**
     * Determines whether an editable target should trigger a static-loop refresh.
     *
     * @param {Element} target - Editable settings control.
     * @returns {boolean} Whether the target affects the static loop.
     */
    function affectsStaticLoop(target) {
        return (
            target.id !== "loop-count" &&
            target.id !== "offline-export-tail-seconds" &&
            !target.matches("input[name='offline-export-mode']")
        );
    }

    /**
     * Records editable document changes while keeping metadata and export-only
     * controls out of the static-loop redraw path.
     *
     * @param {Event} event - Document input event.
     * @returns {void}
     */
    function handleInput(event) {
        const target = /** @type {Element|null} */ (event.target);
        if (!isTrackedFormTarget(target)) return;
        recordCurrentSettings(true);
        clearActiveSoundStarterCard();
        sessionManager.scheduleSave();
        if (affectsStaticLoop(target)) onStaticLoopChange();
    }

    /**
     * Completes editable document changes as atomic history actions.
     *
     * @param {Event} event - Document change event.
     * @returns {void}
     */
    function handleChange(event) {
        const target = /** @type {Element|null} */ (event.target);
        if (!isTrackedFormTarget(target)) return;
        settingsHistory.endTransaction();
        recordCurrentSettings();
        clearActiveSoundStarterCard();
        sessionManager.scheduleSave();
        if (affectsStaticLoop(target)) onStaticLoopChange();
    }

    /**
     * Records discrete button-group changes that are not standard form events.
     *
     * @param {Event} event - Document click event.
     * @returns {void}
     */
    function handleClick(event) {
        const target = /** @type {Element|null} */ (event.target);
        if (
            !target?.closest(
                ".pattern-btn, .waveform-btn, #octave-shift-buttons, #octave-range-buttons",
            )
        )
            return;
        recordCurrentSettings();
        clearActiveSoundStarterCard();
        sessionManager.scheduleSave();
        onStaticLoopChange();
    }

    /**
     * Initializes defaults, reset gestures, and document autosave listeners.
     *
     * @param {Record<string, unknown>} defaults - Captured default settings.
     * @returns {void}
     */
    function initialize(defaults) {
        if (listenerController) return;
        defaultSettings = cloneSettings(defaults);
        settingsHistory.initialize(defaultSettings);
        listenerController = new AbortController();
        registerIndividualResetGestures();
        const listenerOptions = { signal: listenerController.signal };
        documentRef.addEventListener("input", handleInput, listenerOptions);
        documentRef.addEventListener("change", handleChange, listenerOptions);
        documentRef.addEventListener("click", handleClick, listenerOptions);
        onHistoryChange();
    }

    /** @returns {{canUndo: boolean, canRedo: boolean, isAtDefault: boolean}} */
    function getStatus() {
        return {
            canUndo: settingsHistory.canUndo(),
            canRedo: settingsHistory.canRedo(),
            isAtDefault:
                defaultSettings !== null &&
                JSON.stringify(getAllSettings()) === JSON.stringify(defaultSettings),
        };
    }

    /** @returns {void} */
    function destroy() {
        listenerController?.abort();
        listenerController = null;
        sessionManager.cancelScheduledSave();
    }

    return {
        initialize,
        destroy,
        getStatus,
        applySettingsWithHistory,
        recordCurrentSettings,
        undoSettings,
        redoSettings,
        resetAllSettings,
        resetIndividualSettings,
        getFocusedResetDefinition,
        scheduleLastSessionSave: sessionManager.scheduleSave,
        restoreLastSession: sessionManager.restoreSession,
    };
}
