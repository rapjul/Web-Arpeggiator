/**
 * First-visit and audio-activation onboarding UI.
 *
 * The controller owns the welcome modal, returning-user overlay, focus trap,
 * and persisted visit state. Application behavior is injected so this module
 * does not communicate through window globals.
 *
 * @module onboarding-controller
 */

/** @typedef {import("../config/factory-presets.js").FactoryPreset} FactoryPreset */

/** @typedef {object} OnboardingControllerDependencies
 * @property {{startOverlay?: HTMLElement|null, quickStartOverlay?: HTMLElement|null, quickStartModal?: HTMLElement|null, quickStartPresetsGrid?: HTMLElement|null, quickStartScratchButton?: HTMLButtonElement|null, appMain?: HTMLElement|null, playStopButton?: HTMLButtonElement|null, soundStartersDetails?: HTMLDetailsElement|null}} dom
 * @property {Document} documentRef
 * @property {Pick<Storage, "getItem"|"setItem">} storage
 * @property {() => string} getLocationSearch
 * @property {ReadonlySet<string>} presetUrlKeys
 * @property {ReadonlyArray<FactoryPreset>} factoryPresets
 * @property {(preset: FactoryPreset) => Promise<void>|void} onPresetSelected
 * @property {() => Promise<void>|void} onStartFromScratch
 * @property {() => Promise<void>|void} onStartOverlay
 * @property {{warn: (...args: unknown[]) => void}} [logger]
 */

const FIRST_VISIT_KEY = "webArpHasVisited";
const SOUND_STARTERS_OPEN_KEY = "soundStartersOpen";

/**
 * Builds the first-visit quick-start experience without coupling it to audio,
 * settings, or browser-global application state.
 *
 * @param {OnboardingControllerDependencies} dependencies - Injected UI and app behavior.
 * @returns {{initialize: () => void, closeQuickStartModal: () => void, prepareForPlayback: () => void}}
 */
export function createOnboardingController(dependencies) {
    const {
        dom,
        documentRef,
        storage,
        getLocationSearch,
        presetUrlKeys,
        factoryPresets,
        onPresetSelected,
        onStartFromScratch,
        onStartOverlay,
        logger = console,
    } = dependencies;
    const {
        appMain,
        playStopButton,
        quickStartModal,
        quickStartOverlay,
        quickStartPresetsGrid,
        quickStartScratchButton,
        soundStartersDetails,
        startOverlay,
    } = dom;
    let isInitialized = false;

    /**
     * Checks whether a shared preset URL should bypass first-visit onboarding.
     *
     * @returns {boolean} Whether onboarding should appear for this visit.
     */
    function isFirstVisit() {
        try {
            const params = new URLSearchParams(getLocationSearch());
            const hasUrlPreset = Array.from(params.keys()).some((key) => presetUrlKeys.has(key));
            return !hasUrlPreset && storage.getItem(FIRST_VISIT_KEY) !== "true";
        } catch (error) {
            logger.warn("Could not read first-visit onboarding state:", error);
            return false;
        }
    }

    /**
     * Persists the completed first-visit flow when browser storage is available.
     *
     * @returns {void}
     */
    function markVisited() {
        try {
            storage.setItem(FIRST_VISIT_KEY, "true");
        } catch (error) {
            logger.warn("Could not save first-visit onboarding state:", error);
        }
    }

    /**
     * Enables the primary playback button after an explicit onboarding action.
     *
     * @returns {void}
     */
    function enablePlayStopButton() {
        if (!playStopButton) return;
        playStopButton.disabled = false;
        playStopButton.textContent = "Start Audio";
        playStopButton.setAttribute("aria-label", "Press to play arpeggio");
        playStopButton.classList.remove("opacity-50", "cursor-not-allowed", "bg-gray-600");
        playStopButton.classList.add("bg-blue-600", "hover:bg-blue-700");
    }

    /**
     * Renders first-visit factory-preset cards and binds their selection.
     *
     * @returns {void}
     */
    function buildQuickStartPresetCards() {
        if (!quickStartPresetsGrid) return;
        quickStartPresetsGrid.innerHTML = "";

        for (const preset of factoryPresets) {
            const card = documentRef.createElement("button");
            card.type = "button";
            card.className =
                "sound-starter-card p-3 focus-visible:outline-none flex flex-col justify-between text-left";
            card.setAttribute("data-preset-id", preset.id);
            card.setAttribute(
                "aria-label",
                `Start with ${preset.name} preset, ${preset.settings.bpm} BPM`,
            );

            const accentBar = documentRef.createElement("div");
            accentBar.className = `sound-starter-accent bg-gradient-to-r ${preset.accentGradient || "from-blue-500 to-indigo-500"} mb-2 rounded-full`;

            const topRow = documentRef.createElement("div");
            topRow.className = "flex items-center justify-between gap-1 mb-1";

            const emojiSpan = documentRef.createElement("span");
            emojiSpan.className = "text-2xl shrink-0";
            emojiSpan.textContent = preset.emoji || "🎵";

            const bpmSpan = documentRef.createElement("span");
            bpmSpan.className =
                "text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-gray-900/60 text-gray-300 shrink-0";
            bpmSpan.textContent = `${preset.settings.bpm} BPM`;

            topRow.append(emojiSpan, bpmSpan);

            const title = documentRef.createElement("div");
            title.className = "text-xs font-semibold text-gray-100 truncate";
            title.textContent = preset.name;

            card.append(accentBar, topRow, title);
            card.addEventListener("click", () => {
                void handleQuickStartPresetClick(preset);
            });
            quickStartPresetsGrid.appendChild(card);
        }
    }

    /**
     * Opens the Quick Start modal and makes the application background inert.
     *
     * @returns {void}
     */
    function openQuickStartModal() {
        if (!quickStartOverlay) return;
        quickStartOverlay.classList.remove("is-hidden");
        appMain?.setAttribute("inert", "");
        buildQuickStartPresetCards();
        const firstPresetButton = quickStartPresetsGrid?.querySelector("button");
        (firstPresetButton || quickStartScratchButton)?.focus();
    }

    /**
     * Closes the Quick Start modal and restores application interaction.
     *
     * @returns {void}
     */
    function closeQuickStartModal() {
        quickStartOverlay?.classList.add("is-hidden");
        appMain?.removeAttribute("inert");
    }

    /**
     * Handles a factory-preset choice from the Quick Start modal.
     *
     * @param {FactoryPreset} preset - Selected factory preset.
     * @returns {Promise<void>}
     */
    async function handleQuickStartPresetClick(preset) {
        closeQuickStartModal();
        enablePlayStopButton();
        markVisited();
        try {
            await onPresetSelected(preset);
        } catch (error) {
            logger.warn("Could not start audio from a quick start preset:", error);
        }
    }

    /**
     * Handles dismissing the quick-start modal without choosing a preset.
     *
     * @returns {Promise<void>}
     */
    async function handleStartFromScratch() {
        closeQuickStartModal();
        if (soundStartersDetails) {
            soundStartersDetails.removeAttribute("open");
            try {
                storage.setItem(SOUND_STARTERS_OPEN_KEY, "false");
            } catch (error) {
                logger.warn("Could not save Sound Starters visibility:", error);
            }
        }
        enablePlayStopButton();
        markVisited();
        try {
            await onStartFromScratch();
        } catch (error) {
            logger.warn("Could not start audio from scratch:", error);
        }
    }

    /**
     * Handles the returning-user audio activation overlay.
     *
     * @returns {Promise<void>}
     */
    async function handleStartOverlayClick() {
        startOverlay?.classList.add("is-hidden");
        try {
            await onStartOverlay();
        } catch (error) {
            logger.warn("Could not start audio from the activation overlay:", error);
        } finally {
            if (playStopButton) {
                playStopButton.disabled = false;
                playStopButton.classList.remove("opacity-50", "cursor-not-allowed", "bg-gray-600");
                if (!playStopButton.classList.contains("bg-yellow-600")) {
                    enablePlayStopButton();
                }
            }
        }
    }

    /**
     * Retains keyboard focus within the modal while it is open.
     *
     * @param {KeyboardEvent} event - Modal key event.
     * @returns {void}
     */
    function trapQuickStartFocus(event) {
        if (event.key !== "Tab" || !quickStartModal) return;
        const focusable = Array.from(
            /** @type {NodeListOf<HTMLButtonElement>} */ (
                quickStartModal.querySelectorAll("button:not([disabled])")
            ),
        );
        if (focusable.length === 0) return;
        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (event.shiftKey && documentRef.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && documentRef.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    /**
     * Prepares first-visit UI before application playback starts elsewhere.
     *
     * @returns {void}
     */
    function prepareForPlayback() {
        startOverlay?.classList.add("is-hidden");
        closeQuickStartModal();
        enablePlayStopButton();
        markVisited();
    }

    /**
     * Binds onboarding listeners and chooses the initial visitor overlay.
     *
     * @returns {void}
     */
    function initialize() {
        if (isInitialized) return;
        isInitialized = true;

        startOverlay?.addEventListener("click", () => {
            void handleStartOverlayClick();
        });
        quickStartScratchButton?.addEventListener("click", () => {
            void handleStartFromScratch();
        });
        quickStartOverlay?.addEventListener("click", (event) => {
            if (event.target === quickStartOverlay) {
                void handleStartFromScratch();
            }
        });
        quickStartModal?.addEventListener("keydown", trapQuickStartFocus);
        documentRef.defaultView?.addEventListener("keydown", (event) => {
            if (
                event.key === "Escape" &&
                quickStartOverlay &&
                !quickStartOverlay.classList.contains("is-hidden")
            ) {
                void handleStartFromScratch();
            }
        });

        if (isFirstVisit()) {
            openQuickStartModal();
        } else {
            startOverlay?.classList.remove("is-hidden");
        }
    }

    return { initialize, closeQuickStartModal, prepareForPlayback };
}
