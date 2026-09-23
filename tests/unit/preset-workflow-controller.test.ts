import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, UnsupportedSettingsVersionError } from "@core/settings-contract.js";
import { FACTORY_PRESETS } from "@/config/factory-presets.js";
import { createPresetWorkflowController } from "@ui/preset-workflow-controller.js";

const controllers: Array<ReturnType<typeof createPresetWorkflowController>> = [];

interface CreateFixtureOptions {
    confirm?: (message: string) => boolean;
    getPresetStore?: () => unknown;
    navigatorRef?: { clipboard?: { writeText: (value: string) => Promise<void> } };
    search?: string;
}

/**
 * Creates a complete DOM and controller fixture for testing preset workflows.
 *
 * @param {CreateFixtureOptions} [options] - Optional overrides for navigator, confirm, and store.
 */
function createFixture(options: CreateFixtureOptions = {}) {
    const sharePresetButton = document.createElement("button");
    const savePresetButton = document.createElement("button");
    const savePresetToBrowserButton = document.createElement("button");
    const loadPresetButton = document.createElement("button");
    const loadPresetInput = document.createElement("input");
    const loadSavedPresetButton = document.createElement("button");
    const clearSavedPresetButton = document.createElement("button");
    const deleteSavedPresetButton = document.createElement("button");
    const presetNameInput = document.createElement("input");
    const savedPresetSelect = document.createElement("select");
    const factoryOption = document.createElement("option");
    factoryOption.value = FACTORY_PRESETS[0].id;
    const savedOption = document.createElement("option");
    savedOption.value = "saved-1";
    savedPresetSelect.append(factoryOption, savedOption);
    const appMain = document.createElement("main");
    const futureOverlay = document.createElement("div");
    futureOverlay.id = "future-preset-overlay";
    futureOverlay.setAttribute("aria-hidden", "true");
    const futureDialog = document.createElement("div");
    futureDialog.id = "future-preset-dialog";
    const futureCancel = document.createElement("button");
    futureCancel.id = "future-preset-cancel";
    const futureConfirm = document.createElement("button");
    futureConfirm.id = "future-preset-confirm";
    futureDialog.append(futureCancel, futureConfirm);
    futureOverlay.appendChild(futureDialog);
    document.body.append(
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
        appMain,
        futureOverlay,
    );

    let settings = { ...DEFAULT_SETTINGS };
    const defaultStore = {
        save: vi.fn(async () => ({ id: "saved-1" })),
        get: vi.fn(async () => ({ id: "saved-1", name: "Saved", settings })),
        loadLatest: vi.fn(async () => ({ id: "saved-1", name: "Saved", settings })),
        clear: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
    };
    const clipboard = { writeText: vi.fn(async () => {}) };
    const applySettingsWithHistory = vi.fn((nextSettings: unknown) => {
        if (!nextSettings || typeof nextSettings !== "object") return { ok: false };
        settings = { ...settings, ...nextSettings };
        return { ok: true };
    });
    const refreshSavedPresetList = vi.fn(async () => {});
    const setActiveSoundStarterCard = vi.fn();
    const showStorageRecovery = vi.fn();
    const hideStorageRecovery = vi.fn();
    const showToast = vi.fn();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const reader = new FileReader();
    let fileContents = "";
    vi.spyOn(reader, "readAsText").mockImplementation(() => {
        Object.defineProperty(reader, "result", {
            configurable: true,
            value: fileContents,
        });
        reader.dispatchEvent(new Event("load"));
    });
    const windowRef = {
        location: {
            origin: "https://example.test",
            pathname: "/",
            search: options.search ?? "",
        },
    };
    const store = options.getPresetStore ? options.getPresetStore() : defaultStore;
    const controller = createPresetWorkflowController({
        dom: {
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
        },
        windowRef,
        navigatorRef: options.navigatorRef ?? { clipboard },
        fileReaderFactory: () => reader,
        confirm: options.confirm ?? (() => true),
        factoryPresets: FACTORY_PRESETS,
        getPresetStore: () => store as ReturnType<typeof defaultStore.get>,
        getAllSettings: () => settings,
        applySettingsWithHistory,
        generateFilename: () => "arpeggio",
        refreshSavedPresetList,
        setActiveSoundStarterCard,
        showStorageRecovery,
        hideStorageRecovery,
        showToast,
        logger,
    });
    controller.initialize();
    controllers.push(controller);

    return {
        applySettingsWithHistory,
        clearSavedPresetButton,
        clipboard,
        controller,
        deleteSavedPresetButton,
        fileContents: (contents: string) => {
            fileContents = contents;
        },
        futureConfirm,
        futureOverlay,
        hideStorageRecovery,
        loadPresetButton,
        loadPresetInput,
        loadSavedPresetButton,
        logger,
        presetNameInput,
        refreshSavedPresetList,
        savePresetButton,
        savePresetToBrowserButton,
        savedPresetSelect,
        setActiveSoundStarterCard,
        settings: () => settings,
        sharePresetButton,
        showStorageRecovery,
        showToast,
        store: defaultStore,
        windowRef,
    };
}

/**
 * Dispatches a synthetic file import event with the given contents.
 *
 * @param {ReturnType<typeof createFixture>} fixture - Test fixture.
 * @param {string} contents - Text contents of the mock file.
 */
function dispatchFileImport(fixture: ReturnType<typeof createFixture>, contents: string) {
    fixture.fileContents(contents);
    const file = new File([contents], "preset.json", { type: "application/json" });
    Object.defineProperty(fixture.loadPresetInput, "files", {
        configurable: true,
        value: [file],
    });
    fixture.loadPresetInput.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Flushes microtask queue. */
async function flushPromises() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

describe("preset workflow controller", () => {
    afterEach(() => {
        controllers.splice(0).forEach((controller) => {
            controller.destroy();
        });
        document.body.replaceChildren();
    });

    it("reports clipboard failures and malformed imported files", async () => {
        const fixture = createFixture();
        fixture.clipboard.writeText.mockRejectedValueOnce(new Error("clipboard denied"));
        fixture.clipboard.writeText.mockClear();
        fixture.sharePresetButton.click();
        await Promise.resolve();
        await Promise.resolve();
        expect(fixture.showToast).toHaveBeenCalledWith(
            expect.stringContaining("Failed to copy link"),
            "error",
        );

        dispatchFileImport(fixture, "not-json");
        expect(fixture.showToast).toHaveBeenCalledWith("Failed to load preset.", "error");
        expect(fixture.logger.error).toHaveBeenCalledWith(
            "Failed to copy share link:",
            expect.any(Error),
        );
        expect(fixture.logger.error).toHaveBeenCalledWith(
            "Failed to load preset:",
            expect.any(Error),
        );
    });

    it("opens compatible loading for future versions and saves factory selections safely", async () => {
        const fixture = createFixture();
        fixture.applySettingsWithHistory.mockReturnValueOnce({
            ok: false,
            error: new UnsupportedSettingsVersionError(2),
        });
        dispatchFileImport(fixture, JSON.stringify({ settingsVersion: 2 }));
        expect(fixture.futureOverlay.getAttribute("aria-hidden")).toBe("false");

        fixture.futureConfirm.click();
        expect(fixture.applySettingsWithHistory).toHaveBeenCalledWith(
            { settingsVersion: 2 },
            { allowFutureVersion: true },
        );
        fixture.savedPresetSelect.value = FACTORY_PRESETS[0].id;
        fixture.loadSavedPresetButton.click();
        await Promise.resolve();
        expect(fixture.setActiveSoundStarterCard).toHaveBeenCalledWith(FACTORY_PRESETS[0].id);
    });

    it("protects factory presets and exposes browser-storage recovery", async () => {
        const fixture = createFixture();
        fixture.savedPresetSelect.value = FACTORY_PRESETS[0].id;
        fixture.deleteSavedPresetButton.click();

        expect(fixture.showToast).toHaveBeenCalledWith(
            "Factory presets cannot be deleted.",
            "info",
        );

        fixture.savedPresetSelect.value = "saved-1";
        fixture.store.remove.mockRejectedValueOnce(new Error("storage unavailable"));
        fixture.deleteSavedPresetButton.click();
        await Promise.resolve();
        expect(fixture.showStorageRecovery).toHaveBeenCalled();
        expect(fixture.logger.error).toHaveBeenCalledWith(
            "Failed to delete saved preset:",
            expect.any(Error),
        );
    });

    it("copies share URL to clipboard on success", async () => {
        const fixture = createFixture();
        fixture.sharePresetButton.click();
        await Promise.resolve();

        expect(fixture.clipboard.writeText).toHaveBeenCalledWith(
            expect.stringContaining("https://example.test/?"),
        );
        expect(fixture.showToast).toHaveBeenCalledWith(
            "Share link copied to clipboard!",
            "success",
        );
    });

    it("reports failure when clipboard API is completely missing from navigator", async () => {
        const fixture = createFixture({ navigatorRef: {} });
        fixture.sharePresetButton.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(fixture.logger.error).toHaveBeenCalledWith(
            "Failed to copy share link:",
            expect.any(Error),
        );
        expect(fixture.showToast).toHaveBeenCalledWith(
            expect.stringContaining("Failed to copy link. Generated URL:"),
            "error",
        );
    });

    it("loads preset from URL search parameters when valid changes exist", () => {
        const fixture = createFixture({ search: "?bpm=140" });
        fixture.controller.loadPresetFromUrl();

        expect(fixture.applySettingsWithHistory).toHaveBeenCalledWith(
            expect.objectContaining({ bpm: 140 }),
        );
        expect(fixture.showToast).toHaveBeenCalledWith("Preset loaded from URL link!", "success");
    });

    it("ignores loadPresetFromUrl when URL parameters match current settings or are empty", () => {
        const fixture = createFixture({ search: "" });
        fixture.controller.loadPresetFromUrl();

        expect(fixture.applySettingsWithHistory).not.toHaveBeenCalled();
    });

    it("downloads preset and saves to browser storage on save button click", async () => {
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => "blob:https://example.test/mock-blob");
        URL.revokeObjectURL = vi.fn();
        try {
            const fixture = createFixture();
            fixture.savePresetButton.click();
            await flushPromises();

            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(fixture.store.save).toHaveBeenCalled();
            expect(fixture.refreshSavedPresetList).toHaveBeenCalledWith("saved-1");
            expect(fixture.hideStorageRecovery).toHaveBeenCalled();
            expect(fixture.showToast).toHaveBeenCalledWith("Preset saved!", "success");
        } finally {
            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
        }
    });

    it("shows storage recovery if store save fails during file download save", async () => {
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => "blob:https://example.test/mock-blob");
        URL.revokeObjectURL = vi.fn();
        try {
            const fixture = createFixture();
            fixture.store.save.mockRejectedValueOnce(new Error("IndexedDB quota exceeded"));
            fixture.savePresetButton.click();
            await flushPromises();

            expect(fixture.showStorageRecovery).toHaveBeenCalled();
            expect(fixture.logger.warn).toHaveBeenCalledWith(
                "Failed to save preset to browser storage:",
                expect.any(Error),
            );
            expect(fixture.showToast).toHaveBeenCalledWith(
                "Preset downloaded, but browser save failed.",
                "info",
            );
        } finally {
            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
        }
    });

    it("saves preset to browser storage when savePresetToBrowserButton is clicked", async () => {
        const fixture = createFixture();
        fixture.presetNameInput.value = "My Custom Synth";
        fixture.savePresetToBrowserButton.click();
        await flushPromises();

        expect(fixture.store.save).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ name: "My Custom Synth", source: "save" }),
        );
        expect(fixture.showToast).toHaveBeenCalledWith("Preset saved to browser!", "success");
    });

    it("handles browser save failure when savePresetToBrowserButton is clicked", async () => {
        const fixture = createFixture();
        fixture.store.save.mockRejectedValueOnce(new Error("Save failed"));
        fixture.savePresetToBrowserButton.click();
        await flushPromises();

        expect(fixture.showToast).toHaveBeenCalledWith("Browser save failed.", "error");
    });

    it("loads non-factory saved preset from browser storage", async () => {
        const fixture = createFixture();
        fixture.savedPresetSelect.value = "saved-1";
        fixture.loadSavedPresetButton.click();
        await flushPromises();

        expect(fixture.store.get).toHaveBeenCalledWith("saved-1");
        expect(fixture.applySettingsWithHistory).toHaveBeenCalled();
        expect(fixture.showToast).toHaveBeenCalledWith(
            "Loaded saved preset from browser storage.",
            "success",
        );
    });

    it("shows info toast when no saved preset record is found in browser storage", async () => {
        const fixture = createFixture();
        const option = document.createElement("option");
        option.value = "nonexistent-id";
        fixture.savedPresetSelect.appendChild(option);
        fixture.savedPresetSelect.value = "nonexistent-id";
        fixture.store.get.mockResolvedValueOnce(null);
        fixture.loadSavedPresetButton.click();
        await flushPromises();

        expect(fixture.showToast).toHaveBeenCalledWith("No saved preset found yet.", "info");
    });

    it("shows error toast when saved preset has incompatible version", async () => {
        const fixture = createFixture();
        fixture.savedPresetSelect.value = "saved-1";
        fixture.applySettingsWithHistory.mockReturnValueOnce({ ok: false });
        fixture.loadSavedPresetButton.click();
        await flushPromises();

        expect(fixture.showToast).toHaveBeenCalledWith(
            "Saved preset requires a newer version of Web Arpeggiator.",
            "error",
        );
    });

    it("handles error when store.get throws while loading saved preset", async () => {
        const fixture = createFixture();
        fixture.savedPresetSelect.value = "saved-1";
        fixture.store.get.mockRejectedValueOnce(new Error("Corrupt IDB"));
        fixture.loadSavedPresetButton.click();
        await flushPromises();

        expect(fixture.logger.error).toHaveBeenCalledWith(
            "Failed to load saved preset:",
            expect.any(Error),
        );
        expect(fixture.showStorageRecovery).toHaveBeenCalled();
        expect(fixture.showToast).toHaveBeenCalledWith("Failed to load saved preset.", "error");
    });

    it("clears saved presets when user confirms", async () => {
        const fixture = createFixture({ confirm: () => true });
        fixture.clearSavedPresetButton.click();
        await flushPromises();

        expect(fixture.store.clear).toHaveBeenCalled();
        expect(fixture.refreshSavedPresetList).toHaveBeenCalled();
        expect(fixture.showToast).toHaveBeenCalledWith("Saved browser presets cleared.", "success");
    });

    it("aborts clearing saved presets when user cancels confirmation", async () => {
        const fixture = createFixture({ confirm: () => false });
        fixture.clearSavedPresetButton.click();
        await flushPromises();

        expect(fixture.store.clear).not.toHaveBeenCalled();
    });

    it("handles error when store.clear throws", async () => {
        const fixture = createFixture({ confirm: () => true });
        fixture.store.clear.mockRejectedValueOnce(new Error("IDB clear error"));
        fixture.clearSavedPresetButton.click();
        await flushPromises();

        expect(fixture.logger.error).toHaveBeenCalledWith(
            "Failed to clear saved presets:",
            expect.any(Error),
        );
        expect(fixture.showStorageRecovery).toHaveBeenCalled();
        expect(fixture.showToast).toHaveBeenCalledWith("Failed to clear saved presets.", "error");
    });

    it("shows info toast when deleting with no preset selected", () => {
        const fixture = createFixture();
        fixture.savedPresetSelect.value = "";
        fixture.deleteSavedPresetButton.click();

        expect(fixture.showToast).toHaveBeenCalledWith("No saved preset selected.", "info");
    });

    it("clicks hidden file input when loadPresetButton is clicked", () => {
        const fixture = createFixture();
        const clickSpy = vi.spyOn(fixture.loadPresetInput, "click");
        fixture.loadPresetButton.click();

        expect(clickSpy).toHaveBeenCalled();
    });

    it("imports valid file, applies settings, and automatically saves to browser storage", async () => {
        const fixture = createFixture();
        dispatchFileImport(fixture, JSON.stringify({ bpm: 130 }));
        await Promise.resolve();

        expect(fixture.applySettingsWithHistory).toHaveBeenCalledWith({ bpm: 130 });
        expect(fixture.store.save).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ name: "preset.json", source: "import" }),
        );
        expect(fixture.showToast).toHaveBeenCalledWith("Preset loaded!", "success");
    });

    it("shows storage recovery when store is unavailable during file import", async () => {
        const fixture = createFixture({ getPresetStore: () => undefined });
        dispatchFileImport(fixture, JSON.stringify({ bpm: 130 }));
        await Promise.resolve();

        expect(fixture.showStorageRecovery).toHaveBeenCalled();
    });

    it("handles file import with null file or non-object result", () => {
        const fixture = createFixture();
        fixture.loadPresetInput.dispatchEvent(new Event("change", { bubbles: true }));

        expect(fixture.applySettingsWithHistory).not.toHaveBeenCalled();
    });

    it("cleans up event listeners and future preset dialog on destroy", () => {
        const fixture = createFixture();
        fixture.controller.destroy();
        fixture.sharePresetButton.click();

        expect(fixture.clipboard.writeText).not.toHaveBeenCalled();
    });
});
