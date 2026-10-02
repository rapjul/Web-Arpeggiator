import { createOnboardingController } from "@ui/onboarding-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FACTORY_PRESETS } from "@/config/factory-presets.js";

interface FixtureOptions {
    search?: string;
    withModeChoice?: boolean;
    storage?: Pick<Storage, "getItem" | "setItem">;
    logger?: { warn: ReturnType<typeof vi.fn> };
    factoryPresets?: typeof FACTORY_PRESETS;
    hasPlayStopButton?: boolean;
    hasPresetsGrid?: boolean;
    hasOverlay?: boolean;
    onPresetSelected?: ReturnType<typeof vi.fn>;
    onStartFromScratch?: ReturnType<typeof vi.fn>;
    onStartOverlay?: ReturnType<typeof vi.fn>;
    onInterfaceModeSelected?: ReturnType<typeof vi.fn>;
}

const activeControllers: Array<ReturnType<typeof createOnboardingController>> = [];

/**
 * Builds a complete onboarding DOM fixture and injected dependencies.
 *
 * @param {string | FixtureOptions} [searchOrOptions=""] - URL search text or fixture options.
 * @param {boolean} [legacyWithModeChoice=false] - Optional mode choice flag when search is string.
 * @returns {object} Fixture DOM elements, spies, and controller instance.
 */
function createFixture(
    searchOrOptions: string | FixtureOptions = "",
    legacyWithModeChoice = false,
) {
    const options: FixtureOptions =
        typeof searchOrOptions === "string"
            ? { search: searchOrOptions, withModeChoice: legacyWithModeChoice }
            : searchOrOptions;
    const {
        search = "",
        withModeChoice = false,
        storage = localStorage,
        logger = { warn: vi.fn() },
        factoryPresets = FACTORY_PRESETS,
        hasPlayStopButton = true,
        hasPresetsGrid = true,
        hasOverlay = true,
        onPresetSelected = vi.fn(),
        onStartFromScratch = vi.fn(),
        onStartOverlay = vi.fn(),
        onInterfaceModeSelected = vi.fn(),
    } = options;

    const appMain = document.createElement("main");
    const playStopButton = hasPlayStopButton ? document.createElement("button") : null;
    if (playStopButton) {
        playStopButton.disabled = true;
        playStopButton.classList.add("opacity-50", "cursor-not-allowed", "bg-gray-600");
    }
    const startOverlay = hasOverlay ? document.createElement("div") : null;
    startOverlay?.classList.add("is-hidden");
    const quickStartOverlay = hasOverlay ? document.createElement("div") : null;
    quickStartOverlay?.classList.add("is-hidden");
    const quickStartModal = document.createElement("div");
    const quickStartModeChoice = withModeChoice ? document.createElement("div") : null;
    const quickStartModeContent = withModeChoice ? document.createElement("div") : null;
    const quickStartSimpleButton = withModeChoice ? document.createElement("button") : null;
    const quickStartFullButton = withModeChoice ? document.createElement("button") : null;
    const quickStartPresetsGrid = hasPresetsGrid ? document.createElement("div") : null;
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
        if (quickStartPresetsGrid) {
            quickStartModeContent.append(quickStartPresetsGrid);
        }
        quickStartModeContent.append(quickStartScratchButton);
        quickStartModal.append(quickStartModeChoice, quickStartModeContent);
    } else {
        if (quickStartPresetsGrid) {
            quickStartModal.append(quickStartPresetsGrid);
        }
        quickStartModal.append(quickStartScratchButton);
    }
    quickStartOverlay?.appendChild(quickStartModal);
    document.body.append(
        appMain,
        ...(playStopButton ? [playStopButton] : []),
        ...(startOverlay ? [startOverlay] : []),
        ...(quickStartOverlay ? [quickStartOverlay] : []),
        soundStartersDetails,
    );

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
        storage,
        getLocationSearch: () => search,
        presetUrlKeys: new Set(["bpm", "notes"]),
        factoryPresets,
        onPresetSelected,
        onStartFromScratch,
        onStartOverlay,
        onInterfaceModeSelected,
        logger,
    });
    activeControllers.push(controller);

    return {
        appMain,
        controller,
        logger,
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

        const cards = quickStartPresetsGrid?.querySelectorAll(".sound-starter-card") || [];
        expect(quickStartOverlay?.classList.contains("is-hidden")).toBe(false);
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
        quickStartPresetsGrid?.querySelector("button")?.dispatchEvent(new Event("click"));

        await vi.waitFor(() => {
            expect(onPresetSelected).toHaveBeenCalledWith(FACTORY_PRESETS[0]);
        });
        expect(quickStartOverlay?.classList.contains("is-hidden")).toBe(true);
        expect(appMain.hasAttribute("inert")).toBe(false);
        expect(playStopButton?.disabled).toBe(false);
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
        expect(playStopButton?.disabled).toBe(false);
    });

    test("uses the regular audio overlay for returning visitors and shared preset URLs", () => {
        localStorage.setItem("webArpHasVisited", "true");
        const returningVisitor = createFixture();

        returningVisitor.controller.initialize();

        expect(returningVisitor.startOverlay?.classList.contains("is-hidden")).toBe(false);
        expect(returningVisitor.quickStartOverlay?.classList.contains("is-hidden")).toBe(true);

        document.body.replaceChildren();
        localStorage.clear();
        const sharedPresetVisitor = createFixture("?bpm=160&notes=D4%20F4%20A4");

        sharedPresetVisitor.controller.initialize();

        expect(sharedPresetVisitor.startOverlay?.classList.contains("is-hidden")).toBe(false);
        expect(sharedPresetVisitor.quickStartOverlay?.classList.contains("is-hidden")).toBe(true);
    });

    test("uses the injected overlay callback and playback preparation without globals", async () => {
        const { controller, onStartOverlay, playStopButton, startOverlay } =
            createFixture("?bpm=160");

        controller.initialize();
        startOverlay?.dispatchEvent(new Event("click"));

        await vi.waitFor(() => {
            expect(onStartOverlay).toHaveBeenCalledOnce();
        });
        expect(playStopButton?.disabled).toBe(false);

        controller.prepareForPlayback();
        expect(startOverlay?.classList.contains("is-hidden")).toBe(true);
        expect(localStorage.getItem("webArpHasVisited")).toBe("true");
    });

    test("keeps play button disabled during overlay startup and preserves active playing state", async () => {
        let resolveOverlay: () => void = () => {};
        const onStartOverlay = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveOverlay = resolve;
                }),
        );
        const { controller, playStopButton, startOverlay } = createFixture({
            search: "?bpm=160",
            onStartOverlay,
        });

        controller.initialize();
        expect(playStopButton?.disabled).toBe(true);

        startOverlay?.dispatchEvent(new Event("click"));
        expect(startOverlay?.classList.contains("is-hidden")).toBe(true);
        // Play button must remain disabled while startup is in-flight
        expect(playStopButton?.disabled).toBe(true);

        // Simulate playback starting before onStartOverlay resolves
        if (playStopButton) {
            playStopButton.textContent = "Stop Audio";
            playStopButton.classList.add("bg-yellow-600");
        }

        resolveOverlay();
        await vi.waitFor(() => {
            expect(playStopButton?.disabled).toBe(false);
        });

        // Ensure "Stop Audio" and yellow class were not overwritten by "Start Audio"
        expect(playStopButton?.textContent).toBe("Stop Audio");
        expect(playStopButton?.classList.contains("bg-yellow-600")).toBe(true);
    });

    test("dismisses modal on backdrop click and on Escape key, ignoring unrelated events", async () => {
        const { controller, onStartFromScratch, quickStartModal, quickStartOverlay } =
            createFixture();

        controller.initialize();

        // Unrelated key on window does nothing
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(onStartFromScratch).not.toHaveBeenCalled();

        // Clicking inside the modal container does not trigger backdrop dismiss
        quickStartModal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(onStartFromScratch).not.toHaveBeenCalled();

        // Clicking directly on the backdrop overlay triggers dismiss
        quickStartOverlay?.dispatchEvent(
            new MouseEvent("click", { bubbles: false, cancelable: true }),
        );
        await vi.waitFor(() => {
            expect(onStartFromScratch).toHaveBeenCalledTimes(1);
        });

        // Now modal is hidden; pressing Escape should not call onStartFromScratch again
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(onStartFromScratch).toHaveBeenCalledTimes(1);

        // Reopen modal to test Escape key directly
        quickStartOverlay?.classList.remove("is-hidden");
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        await vi.waitFor(() => {
            expect(onStartFromScratch).toHaveBeenCalledTimes(2);
        });
    });

    test("focus trap ignores non-Tab keys and handles middle element navigation", () => {
        const { controller, quickStartModal } = createFixture();
        controller.initialize();

        const buttons = quickStartModal.querySelectorAll("button");
        expect(buttons.length).toBeGreaterThan(2);

        // Non-Tab key event
        const arrowEvent = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "ArrowDown",
        });
        quickStartModal.dispatchEvent(arrowEvent);
        expect(arrowEvent.defaultPrevented).toBe(false);

        // Middle element tab event (neither first+Shift nor last+normal)
        buttons[1].focus();
        const middleTabEvent = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Tab",
        });
        quickStartModal.dispatchEvent(middleTabEvent);
        expect(middleTabEvent.defaultPrevented).toBe(false);

        // Double initialization is an idempotent no-op
        controller.initialize();

        // Empty focusable container handles keydown safely
        const emptyModal = document.createElement("div");
        const emptyOverlay = document.createElement("div");
        emptyOverlay.appendChild(emptyModal);
        const emptyController = createOnboardingController({
            dom: { quickStartModal: emptyModal, quickStartOverlay: emptyOverlay },
            documentRef: document,
            storage: localStorage,
            getLocationSearch: () => "",
            presetUrlKeys: new Set(),
            factoryPresets: [],
            onPresetSelected: vi.fn(),
            onStartFromScratch: vi.fn(),
            onStartOverlay: vi.fn(),
        });
        emptyController.initialize();
        emptyModal.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    });

    test("handles storage read and write errors safely with logger warnings", () => {
        const failingStorage: Pick<Storage, "getItem" | "setItem"> = {
            getItem: vi.fn(() => {
                throw new Error("QuotaExceeded");
            }),
            setItem: vi.fn(() => {
                throw new Error("StorageDisabled");
            }),
        };
        const logger = { warn: vi.fn() };
        const { controller, quickStartScratchButton } = createFixture({
            storage: failingStorage,
            logger,
        });

        // isFirstVisit catch block triggered on failing getItem -> falls back to returning visitor
        controller.initialize();
        expect(logger.warn).toHaveBeenCalledWith(
            "Could not read first-visit onboarding state:",
            expect.any(Error),
        );

        // markVisited and sound starters persistence catch block on setItem
        quickStartScratchButton.dispatchEvent(new Event("click"));
        expect(logger.warn).toHaveBeenCalledWith(
            "Could not save Sound Starters visibility:",
            expect.any(Error),
        );
        expect(logger.warn).toHaveBeenCalledWith(
            "Could not save first-visit onboarding state:",
            expect.any(Error),
        );
    });

    test("logs warnings when injected action callbacks reject", async () => {
        const logger = { warn: vi.fn() };
        const onPresetSelected = vi.fn().mockRejectedValue(new Error("Audio load failed"));
        const onStartFromScratch = vi.fn().mockRejectedValue(new Error("Scratch init failed"));
        const onStartOverlay = vi.fn().mockRejectedValue(new Error("Overlay activation failed"));

        const { controller, quickStartPresetsGrid, quickStartScratchButton, startOverlay } =
            createFixture({
                logger,
                onPresetSelected,
                onStartFromScratch,
                onStartOverlay,
            });

        controller.initialize();

        // 1. Preset click rejection
        quickStartPresetsGrid?.querySelector("button")?.dispatchEvent(new Event("click"));
        await vi.waitFor(() => {
            expect(logger.warn).toHaveBeenCalledWith(
                "Could not start audio from a quick start preset:",
                expect.any(Error),
            );
        });

        // 2. Start from scratch rejection
        quickStartScratchButton.dispatchEvent(new Event("click"));
        await vi.waitFor(() => {
            expect(logger.warn).toHaveBeenCalledWith(
                "Could not start audio from scratch:",
                expect.any(Error),
            );
        });

        // 3. Overlay click rejection
        startOverlay?.dispatchEvent(new Event("click"));
        await vi.waitFor(() => {
            expect(logger.warn).toHaveBeenCalledWith(
                "Could not start audio from the activation overlay:",
                expect.any(Error),
            );
        });
    });

    test("renders presets with fallback gradients and emojis, and handles missing DOM elements", async () => {
        const fallbackPreset = {
            ...FACTORY_PRESETS[0],
            id: "fallback-preset",
            name: "Fallback Test",
            emoji: "",
            accentGradient: "",
        };
        const onStartFromScratch = vi.fn();
        const { controller, quickStartPresetsGrid } = createFixture({
            factoryPresets: [fallbackPreset],
            hasPlayStopButton: false,
            onStartFromScratch,
        });

        controller.initialize();

        const card = quickStartPresetsGrid?.querySelector(".sound-starter-card");
        expect(card?.querySelector(".sound-starter-accent")?.className).toContain(
            "from-blue-500 to-indigo-500",
        );
        expect(card?.textContent).toContain("🎵");

        // Safe when playStopButton is null
        controller.prepareForPlayback();

        // Safe when quickStartOverlay is missing on first visit
        const noOverlayController = createOnboardingController({
            dom: { quickStartOverlay: null },
            documentRef: document,
            storage: localStorage,
            getLocationSearch: () => "",
            presetUrlKeys: new Set(),
            factoryPresets: [],
            onPresetSelected: vi.fn(),
            onStartFromScratch: vi.fn(),
            onStartOverlay: vi.fn(),
        });
        noOverlayController.initialize();

        // Safe when starting from scratch with missing soundStartersDetails element
        const freshScratchButton = document.createElement("button");
        const onNoDetailsScratch = vi.fn();
        const noDetailsController = createOnboardingController({
            dom: {
                appMain: document.createElement("main"),
                quickStartScratchButton: freshScratchButton,
                soundStartersDetails: null,
            },
            documentRef: document,
            storage: localStorage,
            getLocationSearch: () => "",
            presetUrlKeys: new Set(),
            factoryPresets: [],
            onPresetSelected: vi.fn(),
            onStartFromScratch: onNoDetailsScratch,
            onStartOverlay: vi.fn(),
        });
        noDetailsController.initialize();
        freshScratchButton.dispatchEvent(new Event("click"));
        await vi.waitFor(() => {
            expect(onNoDetailsScratch).toHaveBeenCalledOnce();
        });
    });
});
