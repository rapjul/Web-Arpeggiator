/**
 * Coordinates URL sharing, file import, and browser-preset workflows.
 *
 * Preset rendering remains in preset-controller; this module owns the
 * settings application and persistence actions behind those views.
 *
 * @module preset-workflow-controller
 */

import { downloadBlob } from "@core/audio-utils.js";
import {
    DEFAULT_SETTINGS,
    UnsupportedSettingsVersionError,
    mergeSettings,
} from "@core/settings-contract.js";
import {
    hasPresetChanges,
    parsePresetFromUrlParams,
    serializePresetToUrlParams,
} from "@core/url-preset.js";
import { createFuturePresetDialogController } from "@ui/future-preset-dialog-controller.js";

/** @typedef {import("../config/factory-presets.js").FactoryPreset} FactoryPreset */
/** @typedef {{id: string, name?: string, filename?: string, settings?: Record<string, unknown>}} StoredPresetRecord */

/**
 * Creates the preset workflow controller.
 *
 * @param {{dom: {sharePresetButton: HTMLElement, savePresetButton: HTMLElement, savePresetToBrowserButton: HTMLElement|null, loadPresetButton: HTMLElement, loadPresetInput: HTMLInputElement, loadSavedPresetButton: HTMLElement|null, clearSavedPresetButton: HTMLElement|null, deleteSavedPresetButton: HTMLElement|null, presetNameInput: HTMLInputElement|null, savedPresetSelect: HTMLSelectElement|null}, windowRef: {location: {origin: string, pathname: string, search: string}}, navigatorRef: {clipboard?: {writeText: (value: string) => Promise<void>}}, fileReaderFactory: () => FileReader, confirm: (message: string) => boolean, factoryPresets: readonly FactoryPreset[], getPresetStore: () => {save: (settings: Record<string, unknown>, metadata: Record<string, string>) => Promise<{id: string}>, get: (id: string) => Promise<StoredPresetRecord|null>, loadLatest: () => Promise<StoredPresetRecord|null>, clear: () => Promise<void>, remove: (id: string) => Promise<void>}|undefined, getAllSettings: () => Record<string, unknown>, applySettingsWithHistory: (settings: unknown, options?: {allowFutureVersion?: boolean}) => {ok: boolean, error?: unknown}, generateFilename: (isRealtime: boolean) => string, refreshSavedPresetList: (selectedId?: string) => Promise<void>, setActiveSoundStarterCard: (presetId?: string|null) => void, showStorageRecovery: () => void, hideStorageRecovery: () => void, showToast: (message: string, type?: string) => void, logger?: {log?: (...args: unknown[]) => void, warn?: (...args: unknown[]) => void, error?: (...args: unknown[]) => void}}} dependencies - Injected preset workflow behavior.
 * @returns {{initialize: () => void, destroy: () => void, loadPresetFromUrl: () => void}} Preset workflow API.
 */
export function createPresetWorkflowController(dependencies) {
    const {
        dom,
        windowRef,
        navigatorRef,
        fileReaderFactory,
        confirm,
        factoryPresets,
        getPresetStore,
        getAllSettings,
        applySettingsWithHistory,
        generateFilename,
        refreshSavedPresetList,
        setActiveSoundStarterCard,
        showStorageRecovery,
        hideStorageRecovery,
        showToast,
        logger = console,
    } = dependencies;
    const {
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
    } = dom;
    let listenerController = null;
    let futurePresetDialogController = null;

    function sharePresetAsUrl() {
        const params = serializePresetToUrlParams(getAllSettings());
        const shareUrl = `${windowRef.location.origin}${windowRef.location.pathname}?${params.toString()}`;
        const copyPromise = navigatorRef.clipboard
            ? navigatorRef.clipboard.writeText(shareUrl)
            : Promise.reject(new Error("Clipboard API is unavailable."));
        copyPromise
            .then(() => showToast("Share link copied to clipboard!", "success"))
            .catch((error) => {
                logger.error?.("Failed to copy share link:", error);
                showToast(`Failed to copy link. Generated URL: ${shareUrl}`, "error");
            });
    }

    function loadPresetFromUrl() {
        const current = getAllSettings();
        const settings = parsePresetFromUrlParams(windowRef.location.search, current);
        if (!settings || !hasPresetChanges(settings, current)) return;
        applySettingsWithHistory(settings);
        showToast("Preset loaded from URL link!", "success");
    }

    async function performPresetSave(source) {
        const settings = getAllSettings();
        const filename = `${generateFilename(false)}-preset.json`;
        const presetName = presetNameInput?.value.trim() || filename;
        if (source === "download") {
            const settingsBlob = new Blob([JSON.stringify(settings, null, 2)], {
                type: "application/json",
            });
            downloadBlob(settingsBlob, filename);
        }

        const store = getPresetStore();
        if (!store) {
            showStorageRecovery();
            return source === "download" ? "download-only-fail" : "save-fail";
        }
        try {
            const record = await store.save(settings, {
                filename,
                name: presetName,
                source,
            });
            hideStorageRecovery();
            await refreshSavedPresetList(record.id);
            return "success";
        } catch (error) {
            logger.warn?.("Failed to save preset to browser storage:", error);
            showStorageRecovery();
            return source === "download" ? "download-only-fail" : "save-fail";
        }
    }

    async function saveImportedPreset(settings, file) {
        const store = getPresetStore();
        if (!store) {
            showStorageRecovery();
            return;
        }
        try {
            const record = await store.save(settings, {
                filename: file.name,
                name: file.name,
                source: "import",
            });
            await refreshSavedPresetList(record.id);
        } catch (error) {
            logger.warn?.("Failed to save imported preset:", error);
            showStorageRecovery();
        }
    }

    function createFuturePresetDialog() {
        return createFuturePresetDialogController({
            getReturnFocus: () => loadPresetButton,
            onConfirm: (settings, fileName) => {
                const result = applySettingsWithHistory(settings, { allowFutureVersion: true });
                if (result.ok) {
                    void saveImportedPreset(getAllSettings(), { name: fileName });
                    showToast("Loaded compatible settings from newer preset.", "info");
                }
            },
        });
    }

    function handleFileImport(event) {
        const target = /** @type {HTMLInputElement} */ (event.target);
        const file = target.files ? target.files[0] : null;
        if (!file) return;
        const reader = fileReaderFactory();
        reader.onload = (loadEvent) => {
            const fileReaderTarget = /** @type {FileReader} */ (loadEvent.target);
            if (!fileReaderTarget || typeof fileReaderTarget.result !== "string") return;
            try {
                const settings = JSON.parse(fileReaderTarget.result);
                const result = applySettingsWithHistory(settings);
                if (result.ok) {
                    void saveImportedPreset(getAllSettings(), file);
                    showToast("Preset loaded!", "success");
                } else if (
                    result.error instanceof UnsupportedSettingsVersionError &&
                    result.error.isFutureVersion
                ) {
                    futurePresetDialogController?.open(settings, file.name);
                } else {
                    showToast("Failed to load preset.", "error");
                }
            } catch (error) {
                logger.error?.("Failed to load preset:", error);
                showToast("Failed to load preset.", "error");
            }
        };
        reader.readAsText(file);
        target.value = "";
    }

    async function handleLoadSavedPreset() {
        const selectedId = savedPresetSelect?.value || "";
        const factoryPreset = factoryPresets.find((preset) => preset.id === selectedId);
        if (factoryPreset) {
            applySettingsWithHistory(mergeSettings(DEFAULT_SETTINGS, factoryPreset.settings));
            if (presetNameInput) presetNameInput.value = factoryPreset.name;
            setActiveSoundStarterCard(factoryPreset.id);
            showToast(`Loaded factory preset: ${factoryPreset.name}`, "success");
            return;
        }

        const store = getPresetStore();
        try {
            const record = selectedId ? await store?.get(selectedId) : await store?.loadLatest();
            if (!record) {
                showToast("No saved preset found yet.", "info");
                return;
            }
            const result = applySettingsWithHistory(record.settings || record);
            if (!result.ok) {
                showToast("Saved preset requires a newer version of Web Arpeggiator.", "error");
                return;
            }
            if (presetNameInput) presetNameInput.value = record.name || record.filename || "";
            await refreshSavedPresetList(record.id);
            showToast("Loaded saved preset from browser storage.", "success");
        } catch (error) {
            logger.error?.("Failed to load saved preset:", error);
            showStorageRecovery();
            showToast("Failed to load saved preset.", "error");
        }
    }

    async function handleClearSavedPresets() {
        if (
            !confirm(
                "Are you sure you want to clear all your saved user presets? This action cannot be undone.",
            )
        )
            return;
        try {
            await getPresetStore()?.clear();
            await refreshSavedPresetList();
            showToast("Saved browser presets cleared.", "success");
        } catch (error) {
            logger.error?.("Failed to clear saved presets:", error);
            showStorageRecovery();
            showToast("Failed to clear saved presets.", "error");
        }
    }

    async function handleDeleteSavedPreset() {
        const selectedId = savedPresetSelect?.value || "";
        if (!selectedId) {
            showToast("No saved preset selected.", "info");
            return;
        }
        if (selectedId.startsWith("factory-")) {
            showToast("Factory presets cannot be deleted.", "info");
            return;
        }
        try {
            await getPresetStore()?.remove(selectedId);
            await refreshSavedPresetList();
            showToast("Deleted saved preset.", "success");
        } catch (error) {
            logger.error?.("Failed to delete saved preset:", error);
            showStorageRecovery();
            showToast("Failed to delete saved preset.", "error");
        }
    }

    function initialize() {
        if (listenerController) return;
        listenerController = new AbortController();
        futurePresetDialogController = createFuturePresetDialog();
        const listenerOptions = { signal: listenerController.signal };
        sharePresetButton.addEventListener("click", sharePresetAsUrl, listenerOptions);
        savePresetButton.addEventListener(
            "click",
            async () => {
                const result = await performPresetSave("download");
                showToast(
                    result === "download-only-fail"
                        ? "Preset downloaded, but browser save failed."
                        : "Preset saved!",
                    result === "download-only-fail" ? "info" : "success",
                );
            },
            listenerOptions,
        );
        savePresetToBrowserButton?.addEventListener(
            "click",
            async (event) => {
                event.preventDefault();
                const result = await performPresetSave("save");
                showToast(
                    result === "success" ? "Preset saved to browser!" : "Browser save failed.",
                    result === "success" ? "success" : "error",
                );
            },
            listenerOptions,
        );
        loadPresetButton.addEventListener("click", () => loadPresetInput.click(), listenerOptions);
        loadPresetInput.addEventListener("change", handleFileImport, listenerOptions);
        loadSavedPresetButton?.addEventListener("click", handleLoadSavedPreset, listenerOptions);
        clearSavedPresetButton?.addEventListener("click", handleClearSavedPresets, listenerOptions);
        deleteSavedPresetButton?.addEventListener(
            "click",
            handleDeleteSavedPreset,
            listenerOptions,
        );
    }

    function destroy() {
        listenerController?.abort();
        listenerController = null;
        futurePresetDialogController?.destroy();
        futurePresetDialogController = null;
    }

    return { initialize, destroy, loadPresetFromUrl };
}
