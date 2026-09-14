/**
 * Factory-preset rendering and saved-preset selection UI.
 *
 * The controller owns DOM presentation only. Application effects such as
 * applying settings, starting playback, and persistence recovery are injected
 * so it does not communicate through globals.
 *
 * @module preset-controller
 */

import { FACTORY_PRESETS } from "../config/factory-presets.js";

/** @typedef {import("../config/factory-presets.js").FactoryPreset} FactoryPreset */

/**
 * Creates a human-readable display name from a persisted preset record.
 *
 * @param {{name?: string, filename?: string, savedAt?: string|number|Date}} record - Stored preset metadata.
 * @returns {string} Display label.
 */
export function getPresetDisplayName(record) {
    const savedAt = record.savedAt ? new Date(record.savedAt) : null;
    const savedAtLabel =
        savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt.toLocaleString() : "unknown date";
    return `${record.name || record.filename || "Untitled"} (${savedAtLabel})`;
}

/**
 * @typedef {object} PresetControllerDependencies
 * @property {{savedPresetSelect?: HTMLSelectElement|null, soundStartersGrid?: HTMLElement|null, soundStartersDetails?: HTMLDetailsElement|null}} dom
 * @property {Document} documentRef
 * @property {Pick<Storage, "getItem" | "setItem">} storage
 * @property {() => ({list: () => Promise<Array<{id: string, name?: string, filename?: string, savedAt?: string|number|Date}>} | null)} getPresetStore
 * @property {(preset: FactoryPreset) => Promise<void>|void} onFactoryPresetSelected
 * @property {() => void} onStorageAvailable
 * @property {() => void} onStorageUnavailable
 * @property {{warn: (...args: unknown[]) => void}} [logger]
 */

/**
 * Builds DOM controls for factory and user presets without coupling the UI to
 * browser storage or application playback state.
 *
 * @param {PresetControllerDependencies} dependencies - Injected DOM and application behavior.
 * @returns {{buildSoundStartersStrip: () => void, clearActiveSoundStarterCard: () => void, refreshSavedPresetList: (selectedId?: string) => Promise<void>, setActiveSoundStarterCard: (presetId?: string|null) => void}}
 */
export function createPresetController(dependencies) {
    const {
        dom,
        documentRef,
        storage,
        getPresetStore,
        onFactoryPresetSelected,
        onStorageAvailable,
        onStorageUnavailable,
        logger = console,
    } = dependencies;
    const { savedPresetSelect, soundStartersGrid, soundStartersDetails } = dom;

    /**
     * Highlights a Sound Starter card by preset ID, or clears every card.
     *
     * @param {string|null} [presetId=null] - Factory preset ID to select.
     * @returns {void}
     */
    function setActiveSoundStarterCard(presetId = null) {
        if (!soundStartersGrid) return;
        const cards = soundStartersGrid.querySelectorAll(".sound-starter-card");
        cards.forEach((card) => {
            const isTarget = Boolean(presetId && card.getAttribute("data-preset-id") === presetId);
            card.classList.toggle("active", isTarget);
            card.setAttribute("aria-pressed", String(isTarget));
        });
    }

    /**
     * Clears the active highlight from every Sound Starter card.
     *
     * @returns {void}
     */
    function clearActiveSoundStarterCard() {
        setActiveSoundStarterCard();
    }

    /**
     * Rebuilds the saved-preset select with factory presets and stored records.
     *
     * @param {string} [selectedId=""] - Preset ID to restore after refresh.
     * @returns {Promise<void>}
     */
    async function refreshSavedPresetList(selectedId = savedPresetSelect?.value || "") {
        if (!savedPresetSelect) return;

        try {
            const store = getPresetStore();
            const records = store ? await store.list() : [];
            if (store) {
                onStorageAvailable();
            } else {
                onStorageUnavailable();
            }
            savedPresetSelect.innerHTML = "";

            const factoryGroup = documentRef.createElement("optgroup");
            factoryGroup.label = "Factory Presets";
            for (const preset of FACTORY_PRESETS) {
                const option = documentRef.createElement("option");
                option.value = preset.id;
                option.textContent = preset.name;
                factoryGroup.appendChild(option);
            }
            savedPresetSelect.appendChild(factoryGroup);

            const userGroup = documentRef.createElement("optgroup");
            userGroup.label = "User Presets";
            if (records.length === 0) {
                const option = documentRef.createElement("option");
                option.value = "";
                option.disabled = true;
                option.textContent = "— No saved user presets —";
                userGroup.appendChild(option);
            } else {
                for (const record of records) {
                    const option = documentRef.createElement("option");
                    option.value = record.id;
                    option.textContent = getPresetDisplayName(record);
                    userGroup.appendChild(option);
                }
            }
            savedPresetSelect.appendChild(userGroup);

            if (
                selectedId &&
                [...savedPresetSelect.options].some((option) => option.value === selectedId)
            ) {
                savedPresetSelect.value = selectedId;
            }
        } catch (error) {
            logger.warn("Failed to refresh saved preset list:", error);
            onStorageUnavailable();
        }
    }

    /**
     * Builds the Sound Starters strip and persists its expanded state.
     *
     * @returns {void}
     */
    function buildSoundStartersStrip() {
        if (!soundStartersGrid) return;
        soundStartersGrid.innerHTML = "";

        for (const preset of FACTORY_PRESETS) {
            const card = documentRef.createElement("button");
            card.type = "button";
            card.className = "sound-starter-card p-2.5 focus-visible:outline-none";
            card.setAttribute("data-preset-id", preset.id);
            card.setAttribute("aria-pressed", "false");
            card.setAttribute(
                "aria-label",
                `Load ${preset.name} preset, ${preset.settings.bpm} BPM`,
            );

            const accentBar = documentRef.createElement("div");
            accentBar.className = `sound-starter-accent bg-gradient-to-r ${preset.accentGradient || "from-blue-500 to-indigo-500"} mb-2 rounded-full`;

            const topRow = documentRef.createElement("div");
            topRow.className = "flex items-center justify-between gap-1 mb-1";

            const emojiSpan = documentRef.createElement("span");
            emojiSpan.className = "text-xl shrink-0";
            emojiSpan.textContent = preset.emoji || "🎵";

            const bpmSpan = documentRef.createElement("span");
            bpmSpan.className =
                "text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-gray-900/60 text-gray-300 shrink-0";
            bpmSpan.textContent = `${preset.settings.bpm} BPM`;

            topRow.append(emojiSpan, bpmSpan);

            const title = documentRef.createElement("div");
            title.className = "text-xs font-semibold text-gray-100 truncate mb-0.5";
            title.textContent = preset.name;

            const tagline = documentRef.createElement("div");
            tagline.className = "text-[10px] text-gray-400 line-clamp-2 leading-tight";
            tagline.textContent = preset.tagline || "";

            card.append(accentBar, topRow, title, tagline);
            card.addEventListener("click", async () => {
                await onFactoryPresetSelected(preset);
                setActiveSoundStarterCard(preset.id);
            });
            soundStartersGrid.appendChild(card);
        }

        if (!soundStartersDetails) return;

        try {
            const storedOpen = storage.getItem("soundStartersOpen");
            soundStartersDetails.open = storedOpen !== "false";
        } catch (error) {
            logger.warn("Could not read soundStartersOpen from localStorage:", error);
        }

        soundStartersDetails.addEventListener("toggle", () => {
            try {
                storage.setItem("soundStartersOpen", String(soundStartersDetails.open));
            } catch (error) {
                logger.warn("Could not write soundStartersOpen to localStorage:", error);
            }
        });
    }

    return {
        buildSoundStartersStrip,
        clearActiveSoundStarterCard,
        refreshSavedPresetList,
        setActiveSoundStarterCard,
    };
}
