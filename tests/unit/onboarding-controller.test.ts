import { createOnboardingController } from "@ui/onboarding-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FACTORY_PRESETS } from "@/config/factory-presets.js";

const activeControllers: Array<ReturnType<typeof createOnboardingController>> = [];

/**
 * Builds a complete onboarding DOM fixture and injected dependencies.
 *
 * @param {string} [search=""] - URL search text used by the first-visit check.
 */
function createFixture(search = "", withModeChoice = false) {
    const appMain = document.createElement("main");
    const playStopButton = document.createElement("button");
    playStopButton.disabled = true;
    playStopButton.classList.add("opacity-50", "cursor-not-allowed", "bg-gray-600");
    const startOverlay = document.createElement("div");
    startOverlay.classList.add("is-hidden");
    const quickStartOverlay = document.createElement("div");
    quickStartOverlay.classList.add("is-hidden");
    const quickStartModal = document.createElement("div");
    const quickStartModeChoice = withModeChoice ? document.createElement("div") : null;
    const quickStartModeContent = withModeChoice ? document.createElement("div") : null;
    const quickStartSimpleButton = withModeChoice ? document.createElement("button") : null;
    const quickStartFullButton = withModeChoice ? document.createElement("button") : null;
    const quickStartPresetsGrid = document.createElement("div");
    const quickStartScratchButton = document.createElement("button");
    const soundStartersDetails = document.createElement("details");
    soundStartersDetails.open = true;
    if (
        quickStartModeChoice &&
        quickStartModeContent &&
        quickStartSimpleButton &&
        quickStartFullButton
    ) {
        quickStartModeChoice.append(quickStartSimpleButton, quickStartFullButton);
        quickStartModeContent.hidden = true;
        quickStartModeContent.append(quickStartPresetsGrid, quickStartScratchButton);
        quickStartModal.append(quickStartModeChoice, quickStartModeContent);
    } else {
        quickStartModal.append(quickStartPresetsGrid, quickStartScratchButton);
    }
    quickStartOverlay.appendChild(quickStartModal);
    document.body.append(
        appMain,
        playStopButton,
        startOverlay,
        quickStartOverlay,
        soundStartersDetails,
    );

    const onPresetSelected = vi.fn();
    const onStartFromScratch = vi.fn();
    const onStartOverlay = vi.fn();
    const onInterfaceModeSelected = vi.fn();
    const controller = createOnboardingController({
        dom: {
            appMain,
            playStopButton,
            quickStartModal,
            quickStartModeChoice,
            quickStartModeContent,
            quickStartSimpleButton,
            quickStartFullButton,
            quickStartOverlay,
            quickStartPresetsGrid,
            quickStartScratchButton,
            soundStartersDetails,
            startOverlay,
        },
        documentRef: document,
        storage: localStorage,
        getLocationSearch: () => search,
        presetUrlKeys: new Set(["bpm", "notes"]),
        factoryPresets: FACTORY_PRESETS,
        onPresetSelected,
        onStartFromScratch,
        onStartOverlay,
        onInterfaceModeSelected,
    });
    activeControllers.push(controller);

    return {
        appMain,
        controller,
        onPresetSelected,
        onStartFromScratch,
        onStartOverlay,
        onInterfaceModeSelected,
        playStopButton,
        quickStartModal,
        quickStartOverlay,
        quickStartPresetsGrid,
        quickStartScratchButton,
        soundStartersDetails,
        startOverlay,
        quickStartModeChoice,
        quickStartModeContent,
        quickStartSimpleButton,
        quickStartFullButton,
    };
}

describe("onboarding controller", () => {
    afterEach(() => {
        activeControllers.splice(0).forEach((controller) => {
            controller.destroy();
        });
        localStorage.clear();
        document.body.replaceChildren();
    });

    test("opens a first-visit modal with focusable factory preset cards", () => {
        const {
            appMain,
            controller,
            quickStartModal,
            quickStartOverlay,
            quickStartPresetsGrid,
            quickStartScratchButton,
        } = createFixture();

        controller.initialize();

        const cards = quickStartPresetsGrid.querySelectorAll(".sound-starter-card");
        expect(quickStartOverlay.classList.contains("is-hidden")).toBe(false);
        expect(appMain.hasAttribute("inert")).toBe(true);
        expect(cards).toHaveLength(FACTORY_PRESETS.length);
        expect(document.activeElement).toBe(cards[0]);

        quickStartScratchButton.focus();
        quickStartModal.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
        expect(document.activeElement).toBe(cards[0]);

        cards[0].focus();
        quickStartModal.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }),
        );
        expect(document.activeElement).toBe(quickStartScratchButton);
    });

    test("requires a first-visit interface choice before showing sound starters", () => {
        const {
            controller,
            onInterfaceModeSelected,
            quickStartModeChoice,
            quickStartModeContent,
            quickStartPresetsGrid,
            quickStartSimpleButton,
        } = createFixture("", true);

        controller.initialize();

        expect(quickStartModeChoice?.hidden).toBe(false);
        expect(quickStartModeContent?.hidden).toBe(true);
        expect(quickStartPresetsGrid.querySelectorAll(".sound-starter-card")).toHaveLength(0);

        quickStartSimpleButton?.click();

        expect(onInterfaceModeSelected).toHaveBeenCalledWith("simple");
        expect(quickStartModeChoice?.hidden).toBe(true);
        expect(quickStartModeContent?.hidden).toBe(false);
        expect(quickStartPresetsGrid.querySelectorAll(".sound-starter-card")).toHaveLength(
            FACTORY_PRESETS.length,
        );
    });

    test("traps focus within whichever onboarding stage is visible", () => {
        const {
            controller,
            quickStartFullButton,
            quickStartModal,
            quickStartPresetsGrid,
            quickStartScratchButton,
            quickStartSimpleButton,
        } = createFixture("", true);

        controller.initialize();
        quickStartFullButton?.focus();
        quickStartModal.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
        expect(document.activeElement).toBe(quickStartSimpleButton);

        quickStartSimpleButton?.focus();
        quickStartModal.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }),
        );
        expect(document.activeElement).toBe(quickStartFullButton);

        quickStartSimpleButton?.click();
        const firstPreset = quickStartPresetsGrid.querySelector("button");
        quickStartScratchButton.focus();
        quickStartModal.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
        expect(document.activeElement).toBe(firstPreset);

        firstPreset?.focus();
        quickStartModal.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }),
        );
        expect(document.activeElement).toBe(quickStartScratchButton);
    });

    test("falls back to Full controls when Escape dismisses the mode choice", async () => {
        const { controller, onInterfaceModeSelected, onStartFromScratch, quickStartOverlay } =
            createFixture("", true);

        controller.initialize();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

        await vi.waitFor(() => expect(onStartFromScratch).toHaveBeenCalledOnce());
        expect(onInterfaceModeSelected).toHaveBeenCalledWith("full");
        expect(quickStartOverlay.classList.contains("is-hidden")).toBe(true);
    });

    test("falls back to Full controls when the backdrop dismisses the mode choice", async () => {
        const { controller, onInterfaceModeSelected, onStartFromScratch, quickStartOverlay } =
            createFixture("", true);

        controller.initialize();
        quickStartOverlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        await vi.waitFor(() => expect(onStartFromScratch).toHaveBeenCalledOnce());
        expect(onInterfaceModeSelected).toHaveBeenCalledWith("full");
    });

    test("keeps an explicit interface choice when the preset stage is dismissed", async () => {
        const { controller, onInterfaceModeSelected, onStartFromScratch, quickStartSimpleButton } =
            createFixture("", true);

        controller.initialize();
        quickStartSimpleButton?.click();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

        await vi.waitFor(() => expect(onStartFromScratch).toHaveBeenCalledOnce());
        expect(onInterfaceModeSelected).toHaveBeenCalledTimes(1);
        expect(onInterfaceModeSelected).toHaveBeenCalledWith("simple");
    });

    test("applies a quick-start preset through its injected callback", async () => {
        const {
            appMain,
            controller,
            onPresetSelected,
            playStopButton,
            quickStartOverlay,
            quickStartPresetsGrid,
        } = createFixture();

        controller.initialize();
        quickStartPresetsGrid.querySelector("button")?.dispatchEvent(new Event("click"));

        await vi.waitFor(() => {
            expect(onPresetSelected).toHaveBeenCalledWith(FACTORY_PRESETS[0]);
        });
        expect(quickStartOverlay.classList.contains("is-hidden")).toBe(true);
        expect(appMain.hasAttribute("inert")).toBe(false);
        expect(playStopButton.disabled).toBe(false);
        expect(localStorage.getItem("webArpHasVisited")).toBe("true");
    });

    test("does not retain active quick-start preset handlers after teardown", async () => {
        const { controller, onPresetSelected, quickStartPresetsGrid } = createFixture();

        controller.initialize();
        const card = quickStartPresetsGrid.querySelector("button");
        controller.destroy();
        card?.dispatchEvent(new Event("click"));

        await Promise.resolve();
        expect(onPresetSelected).not.toHaveBeenCalled();
        expect(quickStartPresetsGrid.childElementCount).toBe(0);
    });

    test("starts from scratch without retaining the expanded Sound Starters state", async () => {
        const {
            controller,
            onStartFromScratch,
            playStopButton,
            quickStartScratchButton,
            soundStartersDetails,
        } = createFixture();

        controller.initialize();
        quickStartScratchButton.dispatchEvent(new Event("click"));

        await vi.waitFor(() => {
            expect(onStartFromScratch).toHaveBeenCalledOnce();
        });
        expect(soundStartersDetails.open).toBe(false);
        expect(localStorage.getItem("soundStartersOpen")).toBe("false");
        expect(localStorage.getItem("webArpHasVisited")).toBe("true");
        expect(playStopButton.disabled).toBe(false);
    });

    test("uses the regular audio overlay for returning visitors and shared preset URLs", () => {
        localStorage.setItem("webArpHasVisited", "true");
        const returningVisitor = createFixture();

        returningVisitor.controller.initialize();

        expect(returningVisitor.startOverlay.classList.contains("is-hidden")).toBe(false);
        expect(returningVisitor.quickStartOverlay.classList.contains("is-hidden")).toBe(true);

        document.body.replaceChildren();
        localStorage.clear();
        const sharedPresetVisitor = createFixture("?bpm=160&notes=D4%20F4%20A4");

        sharedPresetVisitor.controller.initialize();

        expect(sharedPresetVisitor.startOverlay.classList.contains("is-hidden")).toBe(false);
        expect(sharedPresetVisitor.quickStartOverlay.classList.contains("is-hidden")).toBe(true);
    });

    test("uses the injected overlay callback and playback preparation without globals", async () => {
        const { controller, onStartOverlay, playStopButton, startOverlay } =
            createFixture("?bpm=160");

        controller.initialize();
        startOverlay.dispatchEvent(new Event("click"));

        await vi.waitFor(() => {
            expect(onStartOverlay).toHaveBeenCalledOnce();
        });
        expect(playStopButton.disabled).toBe(false);

        controller.prepareForPlayback();
        expect(startOverlay.classList.contains("is-hidden")).toBe(true);
        expect(localStorage.getItem("webArpHasVisited")).toBe("true");
    });
});
