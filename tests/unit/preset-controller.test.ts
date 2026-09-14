import { createPresetController, getPresetDisplayName } from "@ui/preset-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FACTORY_PRESETS } from "@/config/factory-presets.js";

describe("preset controller", () => {
    afterEach(() => {
        localStorage.clear();
    });

    test("renders factory and stored presets while retaining the selected record", async () => {
        const savedPresetSelect = document.createElement("select");
        const onStorageAvailable = vi.fn();
        const controller = createPresetController({
            dom: { savedPresetSelect },
            documentRef: document,
            storage: localStorage,
            getPresetStore: () => ({
                list: async () => [
                    {
                        id: "user-preset",
                        name: "Warm Pad",
                        savedAt: "2026-09-13T12:00:00.000Z",
                    },
                ],
            }),
            onFactoryPresetSelected: () => {},
            onStorageAvailable,
            onStorageUnavailable: vi.fn(),
        });

        await controller.refreshSavedPresetList("user-preset");

        expect(onStorageAvailable).toHaveBeenCalledOnce();
        expect(savedPresetSelect.value).toBe("user-preset");
        expect(savedPresetSelect.querySelectorAll("optgroup")).toHaveLength(2);
        expect(savedPresetSelect.options).toHaveLength(FACTORY_PRESETS.length + 1);
        expect(
            [...savedPresetSelect.options].find((option) => option.value === "user-preset")
                ?.textContent,
        ).toContain("Warm Pad");
    });

    test("renders sound starters, applies selection state, and persists panel visibility", async () => {
        const soundStartersGrid = document.createElement("div");
        const soundStartersDetails = document.createElement("details");
        const onFactoryPresetSelected = vi.fn();
        localStorage.setItem("soundStartersOpen", "false");
        const controller = createPresetController({
            dom: { soundStartersGrid, soundStartersDetails },
            documentRef: document,
            storage: localStorage,
            getPresetStore: () => null,
            onFactoryPresetSelected,
            onStorageAvailable: vi.fn(),
            onStorageUnavailable: vi.fn(),
        });

        controller.buildSoundStartersStrip();

        const cards = soundStartersGrid.querySelectorAll(".sound-starter-card");
        expect(cards).toHaveLength(FACTORY_PRESETS.length);
        expect(soundStartersDetails.open).toBe(false);

        cards[1].dispatchEvent(new Event("click"));
        await Promise.resolve();

        expect(onFactoryPresetSelected).toHaveBeenCalledWith(FACTORY_PRESETS[1]);
        expect(cards[1].getAttribute("aria-pressed")).toBe("true");
        expect(cards[0].getAttribute("aria-pressed")).toBe("false");

        soundStartersDetails.open = true;
        soundStartersDetails.dispatchEvent(new Event("toggle"));
        expect(localStorage.getItem("soundStartersOpen")).toBe("true");
    });

    test("marks a Sound Starter active after its application callback completes", async () => {
        const soundStartersGrid = document.createElement("div");
        let completeApplication = () => {};
        const onFactoryPresetSelected = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    completeApplication = resolve;
                }),
        );
        const controller = createPresetController({
            dom: { soundStartersGrid },
            documentRef: document,
            storage: localStorage,
            getPresetStore: () => null,
            onFactoryPresetSelected,
            onStorageAvailable: vi.fn(),
            onStorageUnavailable: vi.fn(),
        });

        controller.buildSoundStartersStrip();
        const firstCard = soundStartersGrid.querySelector(".sound-starter-card");
        firstCard?.dispatchEvent(new Event("click"));

        expect(firstCard?.getAttribute("aria-pressed")).toBe("false");
        completeApplication();
        await vi.waitFor(() => {
            expect(firstCard?.getAttribute("aria-pressed")).toBe("true");
        });
    });

    test("shows recovery guidance when browser preset storage is unavailable", async () => {
        const onStorageUnavailable = vi.fn();
        const controller = createPresetController({
            dom: { savedPresetSelect: document.createElement("select") },
            documentRef: document,
            storage: localStorage,
            getPresetStore: () => null,
            onFactoryPresetSelected: () => {},
            onStorageAvailable: vi.fn(),
            onStorageUnavailable,
        });

        await controller.refreshSavedPresetList();

        expect(onStorageUnavailable).toHaveBeenCalledOnce();
    });

    test("creates resilient labels for stored preset metadata", () => {
        expect(getPresetDisplayName({ name: "Warm Pad", savedAt: "invalid" })).toBe(
            "Warm Pad (unknown date)",
        );
        expect(getPresetDisplayName({ filename: "preset.json" })).toBe(
            "preset.json (unknown date)",
        );
    });
});
