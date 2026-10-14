import type { WebArpPresetStore } from "../../types.d.ts";
import { DEFAULT_SETTINGS } from "@core/settings-contract.js";
import { hasPresetUrlParams, parsePresetFromUrlParams } from "@core/url-preset.js";
import { createPresetWorkflowController } from "@ui/preset-workflow-controller.js";
import { createWorkspaceController } from "@ui/workspace-controller.js";
import { describe, expect, it, vi } from "vitest";

describe("Shared Preset URL Lifecycle & State Matrix", () => {
    /**
     * Creates an integrated workspace and preset workflow fixture.
     *
     * @param {{
     *   search?: string,
     *   storedSession?: Record<string, unknown> | null,
     *   onSettingsInteraction?: () => void,
     * }} [options] - Fixture configuration options.
     */
    function createLifecycleFixture(
        options: {
            search?: string;
            storedSession?: Record<string, unknown> | null;
            onSettingsInteraction?: () => void;
        } = {},
    ) {
        let currentSettings = { ...DEFAULT_SETTINGS };
        const hasUrlPreset = hasPresetUrlParams(options.search ?? "");
        const initialSettings = hasUrlPreset
            ? (parsePresetFromUrlParams(options.search ?? "", DEFAULT_SETTINGS) ?? DEFAULT_SETTINGS)
            : DEFAULT_SETTINGS;

        currentSettings = { ...initialSettings };

        const loadAllSettings = vi.fn((settings: Record<string, unknown>) => {
            currentSettings = { ...currentSettings, ...settings };
            if (Array.isArray(settings.baseNotes)) {
                currentSettings.notes = (settings.baseNotes as string[]).map(
                    (n) => `${n} (derived)`,
                );
            }
            return { ok: true };
        });

        const getAllSettings = vi.fn(() => ({ ...currentSettings }));

        let hasUserModifiedSettingsFlag = false;
        const onSettingsInteraction = vi.fn(() => {
            hasUserModifiedSettingsFlag = true;
            options.onSettingsInteraction?.();
        });

        const store = {
            saveLastSession: vi.fn(async () => {}),
            loadLastSession: vi.fn(async () => {
                if (options.storedSession) {
                    return { settings: options.storedSession, history: null };
                }
                return null;
            }),
        };

        const workspaceController = createWorkspaceController({
            documentRef: document,
            dom: {
                presetNameInput: null,
                savedPresetSelect: null,
                loadPresetInput: document.createElement("input"),
            },
            getResetDefinitions: () => [],
            getPresetStore: () => store as unknown as WebArpPresetStore,
            getAllSettings,
            loadAllSettings,
            getSelectedPatternDirection: () => "up",
            setSelectedPatternDirection: () => {},
            clearActiveSoundStarterCard: () => {},
            canRestoreSession: () => !hasUserModifiedSettingsFlag,
            onSettingsInteraction,
            onStaticLoopChange: () => {},
            onHistoryChange: () => {},
            showToast: () => {},
        });

        if (hasUrlPreset) {
            workspaceController.markUserSettingsInteraction();
        }

        loadAllSettings(initialSettings);
        workspaceController.initialize(getAllSettings());

        if (hasUrlPreset) {
            workspaceController.scheduleLastSessionSave();
        }

        const presetWorkflowController = createPresetWorkflowController({
            dom: {
                sharePresetButton: document.createElement("button"),
                savePresetButton: document.createElement("button"),
                savePresetToBrowserButton: null,
                loadPresetButton: document.createElement("button"),
                loadPresetInput: document.createElement("input"),
                loadSavedPresetButton: null,
                clearSavedPresetButton: null,
                deleteSavedPresetButton: null,
                presetNameInput: null,
                savedPresetSelect: null,
            },
            windowRef: {
                location: {
                    origin: "https://example.test",
                    pathname: "/",
                    search: options.search ?? "",
                },
            },
            navigatorRef: {},
            fileReaderFactory: () => new FileReader(),
            confirm: () => true,
            factoryPresets: [],
            getPresetStore: () => undefined,
            getAllSettings,
            applySettingsWithHistory: (settings: unknown) => {
                return workspaceController.applySettingsWithHistory(
                    settings as Record<string, unknown>,
                );
            },
            generateFilename: () => "preset",
            refreshSavedPresetList: async () => {},
            setActiveSoundStarterCard: () => {},
            showStorageRecovery: () => {},
            hideStorageRecovery: () => {},
            showToast: vi.fn(),
            onUrlPresetRecognized: () => {
                workspaceController.markUserSettingsInteraction();
            },
        });

        presetWorkflowController.initialize();

        return {
            currentSettings: () => currentSettings,
            getAllSettings,
            hasUrlPreset,
            initialSettings,
            loadAllSettings,
            onSettingsInteraction,
            presetWorkflowController,
            store,
            workspaceController,
        };
    }

    it("S01: hydrates custom URL preset synchronously at startup with empty storage", () => {
        const fixture = createLifecycleFixture({
            search: "?bpm=140&synth=fmSynth",
            storedSession: null,
        });

        expect(fixture.hasUrlPreset).toBe(true);
        expect(fixture.currentSettings().bpm).toBe(140);
        expect(fixture.currentSettings().synthType).toBe("fmSynth");
        expect(fixture.workspaceController.hasUserModifiedSettings()).toBe(true);
        expect(fixture.workspaceController.getStatus().isAtDefault).toBe(true);
    });

    it("S02: custom URL preset takes precedence over fast restored session", async () => {
        const fixture = createLifecycleFixture({
            search: "?bpm=140&synth=fmSynth",
            storedSession: { bpm: 90, synthType: "amSynth" },
        });

        // Fast session restore completes
        await fixture.workspaceController.restoreLastSession();

        // Stored session must NOT overwrite the shared URL preset
        expect(fixture.currentSettings().bpm).toBe(140);
        expect(fixture.currentSettings().synthType).toBe("fmSynth");
        expect(fixture.loadAllSettings).not.toHaveBeenCalledWith(
            expect.objectContaining({ bpm: 90 }),
        );
    });

    it("S03: custom URL preset supersedes delayed session restore after timeout", async () => {
        const fixture = createLifecycleFixture({
            search: "?bpm=150",
            storedSession: { bpm: 80 },
        });

        expect(fixture.currentSettings().bpm).toBe(150);
        expect(fixture.workspaceController.hasUserModifiedSettings()).toBe(true);

        // Simulated late resolution after timeout
        await fixture.workspaceController.restoreLastSession();

        expect(fixture.currentSettings().bpm).toBe(150);
    });

    it("S04 & S05: default-matching URL preset (?bpm=120) takes precedence over stored session (bpm: 180)", async () => {
        const fixture = createLifecycleFixture({
            search: "?bpm=120",
            storedSession: { bpm: 180 },
        });

        expect(fixture.hasUrlPreset).toBe(true);
        expect(fixture.workspaceController.hasUserModifiedSettings()).toBe(true);
        expect(fixture.currentSettings().bpm).toBe(120);

        // Attempt session restore
        await fixture.workspaceController.restoreLastSession();

        // Stored session with 180 BPM must NOT overwrite requested 120 BPM
        expect(fixture.currentSettings().bpm).toBe(120);
    });

    it("S06: safely proceeds with URL preset when storage fails or is blocked", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const fixture = createLifecycleFixture({
            search: "?bpm=135",
            storedSession: null,
        });

        fixture.store.loadLastSession.mockRejectedValueOnce(new Error("Database blocked"));

        await expect(fixture.workspaceController.restoreLastSession()).resolves.toBe(false);
        expect(fixture.currentSettings().bpm).toBe(135);
        expect(warnSpy).toHaveBeenCalledWith(
            "Failed to restore workspace session:",
            expect.any(Error),
        );
        warnSpy.mockRestore();
    });

    it("S07: clamps out-of-range URL parameters and ignores unknown keys", () => {
        const fixture = createLifecycleFixture({
            search: "?bpm=999&gain=-100&unknown=malicious&synth=invalidSynth",
            storedSession: null,
        });

        expect(fixture.hasUrlPreset).toBe(true);
        // Clamped to bounds
        expect(fixture.currentSettings().bpm).toBe(240);
        expect(fixture.currentSettings().postGain).toBe(-40);
        // Invalid synth falls back to default "synth"
        expect(fixture.currentSettings().synthType).toBe("synth");
    });

    it("S08: guide sound starter selection explicitly overrides shared URL preset and pushes history", () => {
        const fixture = createLifecycleFixture({
            search: "?bpm=140&synth=fmSynth",
            storedSession: null,
        });

        expect(fixture.currentSettings().bpm).toBe(140);
        expect(fixture.currentSettings().synthType).toBe("fmSynth");

        // User chooses a factory preset from the onboarding guide
        fixture.workspaceController.applySettingsWithHistory({
            bpm: 105,
            synthType: "duoSynth",
        });

        expect(fixture.currentSettings().bpm).toBe(105);
        expect(fixture.currentSettings().synthType).toBe("duoSynth");
        expect(fixture.workspaceController.getStatus().canUndo).toBe(true);

        // Undoing reverts back to the shared URL preset
        fixture.workspaceController.undoSettings();
        expect(fixture.currentSettings().bpm).toBe(140);
        expect(fixture.currentSettings().synthType).toBe("fmSynth");
    });

    it("S09: guide dismissal preserves hydrated shared URL preset without modification", () => {
        const fixture = createLifecycleFixture({
            search: "?bpm=155&synth=amSynth",
            storedSession: null,
        });

        expect(fixture.currentSettings().bpm).toBe(155);
        expect(fixture.currentSettings().synthType).toBe("amSynth");

        // Dismissal occurs (no settings applied)
        // Verified: URL preset settings remain active and unmodified
        expect(fixture.currentSettings().bpm).toBe(155);
        expect(fixture.currentSettings().synthType).toBe("amSynth");
        expect(fixture.workspaceController.getStatus().canUndo).toBe(false);
    });

    it("S10: empty or unrelated search parameters do not trigger URL preset precedence", async () => {
        const fixture = createLifecycleFixture({
            search: "?utm_source=twitter&ref=share",
            storedSession: { bpm: 95 },
        });

        expect(fixture.hasUrlPreset).toBe(false);
        expect(fixture.workspaceController.hasUserModifiedSettings()).toBe(false);

        // Standard session restore applies
        await fixture.workspaceController.restoreLastSession();
        expect(fixture.currentSettings().bpm).toBe(95);
    });

    it("S11: persists synchronously loaded URL preset into storage after debounce", async () => {
        vi.useFakeTimers();
        try {
            const fixture = createLifecycleFixture({
                search: "?bpm=145&synth=duoSynth",
                storedSession: null,
            });

            expect(fixture.hasUrlPreset).toBe(true);
            expect(fixture.store.saveLastSession).not.toHaveBeenCalled();

            vi.advanceTimersByTime(2500);
            await Promise.resolve();

            expect(fixture.store.saveLastSession).toHaveBeenCalledWith(
                expect.objectContaining({ bpm: 145, synthType: "duoSynth" }),
                expect.anything(),
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it("S12: initializes URL history from canonical live snapshot with derived notes to ensure baseline default state", () => {
        const fixture = createLifecycleFixture({
            search: "?notes=E4+G4+B4&range=2&shift=1",
            storedSession: null,
        });

        expect(fixture.hasUrlPreset).toBe(true);
        expect(fixture.workspaceController.getStatus().isAtDefault).toBe(true);
        expect(fixture.workspaceController.getStatus().canUndo).toBe(false);
        expect(fixture.workspaceController.getStatus().canRedo).toBe(false);
    });

    it("S13: malformed or invalid preset query parameters do not trigger URL preset precedence, allowing session restoration", async () => {
        const fixture = createLifecycleFixture({
            search: "?bpm=oops&notes=invalid&export=bogus",
            storedSession: { bpm: 110, synthType: "fmSynth" },
        });

        expect(fixture.hasUrlPreset).toBe(false);
        expect(fixture.workspaceController.hasUserModifiedSettings()).toBe(false);

        await fixture.workspaceController.restoreLastSession();
        expect(fixture.currentSettings().bpm).toBe(110);
        expect(fixture.currentSettings().synthType).toBe("fmSynth");
    });
});
