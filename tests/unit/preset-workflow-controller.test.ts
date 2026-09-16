import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, UnsupportedSettingsVersionError } from "@core/settings-contract.js";
import { FACTORY_PRESETS } from "@/config/factory-presets.js";
import { createPresetWorkflowController } from "@ui/preset-workflow-controller.js";

const controllers: Array<ReturnType<typeof createPresetWorkflowController>> = [];

function createFixture() {
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
    const store = {
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
    const reader = new FileReader();
    let fileContents = "";
    vi.spyOn(reader, "readAsText").mockImplementation(() => {
        Object.defineProperty(reader, "result", {
            configurable: true,
            value: fileContents,
        });
        reader.dispatchEvent(new Event("load"));
    });
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
        windowRef: {
            location: { origin: "https://example.test", pathname: "/", search: "" },
        },
        navigatorRef: { clipboard },
        fileReaderFactory: () => reader,
        confirm: () => true,
        factoryPresets: FACTORY_PRESETS,
        getPresetStore: () => store,
        getAllSettings: () => settings,
        applySettingsWithHistory,
        generateFilename: () => "arpeggio",
        refreshSavedPresetList,
        setActiveSoundStarterCard,
        showStorageRecovery,
        hideStorageRecovery,
        showToast,
    });
    controller.initialize();
    controllers.push(controller);

    return {
        applySettingsWithHistory,
        clipboard,
        controller,
        deleteSavedPresetButton,
        fileContents: (contents: string) => {
            fileContents = contents;
        },
        futureConfirm,
        futureOverlay,
        hideStorageRecovery,
        loadPresetInput,
        loadSavedPresetButton,
        savedPresetSelect,
        setActiveSoundStarterCard,
        showStorageRecovery,
        showToast,
        store,
    };
}

function dispatchFileImport(fixture: ReturnType<typeof createFixture>, contents: string) {
    fixture.fileContents(contents);
    const file = new File([contents], "preset.json", { type: "application/json" });
    Object.defineProperty(fixture.loadPresetInput, "files", {
        configurable: true,
        value: [file],
    });
    fixture.loadPresetInput.dispatchEvent(new Event("change", { bubbles: true }));
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
        document.querySelector("button")?.click();
        await Promise.resolve();
        await Promise.resolve();
        expect(fixture.showToast).toHaveBeenCalledWith(
            expect.stringContaining("Failed to copy link"),
            "error",
        );

        dispatchFileImport(fixture, "not-json");
        expect(fixture.showToast).toHaveBeenCalledWith("Failed to load preset.", "error");
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
    });
});
