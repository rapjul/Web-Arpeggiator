import { createCreationWalkthroughController } from "@ui/creation-walkthrough-controller.js";
import { afterEach, describe, expect, test } from "vitest";

function createFixture() {
    const section = document.createElement("section");
    const startButton = document.createElement("button");
    const activePanel = document.createElement("div");
    const stepsList = document.createElement("ol");
    const status = document.createElement("p");
    const skipButton = document.createElement("button");
    const restartButton = document.createElement("button");
    const soundCard = document.createElement("button");
    soundCard.className = "sound-starter-card";
    const notesInput = document.createElement("input");
    notesInput.id = "notes";
    const intervalSelect = document.createElement("select");
    intervalSelect.id = "interval";
    const volumeInput = document.createElement("input");
    volumeInput.id = "post-gain";
    const exportButton = document.createElement("button");
    exportButton.id = "offline-export-button";

    document.body.append(
        section,
        startButton,
        activePanel,
        stepsList,
        status,
        skipButton,
        restartButton,
        soundCard,
        notesInput,
        intervalSelect,
        volumeInput,
        exportButton,
    );

    const controller = createCreationWalkthroughController({
        dom: {
            section,
            startButton,
            activePanel,
            stepsList,
            status,
            skipButton,
            restartButton,
        },
        documentRef: document,
        storage: localStorage,
    });
    controller.initialize();

    return {
        activePanel,
        controller,
        exportButton,
        intervalSelect,
        notesInput,
        restartButton,
        section,
        skipButton,
        soundCard,
        startButton,
        status,
        stepsList,
        volumeInput,
    };
}

describe("creation walkthrough controller", () => {
    afterEach(() => {
        localStorage.clear();
        document.body.replaceChildren();
    });

    test("walks through the creative steps and persists completion", () => {
        const {
            activePanel,
            exportButton,
            intervalSelect,
            notesInput,
            section,
            soundCard,
            startButton,
            stepsList,
            volumeInput,
        } = createFixture();

        expect(stepsList.children).toHaveLength(5);
        expect(activePanel.hidden).toBe(true);
        startButton.click();
        expect(activePanel.hidden).toBe(false);
        expect(stepsList.children).toHaveLength(5);
        expect(section.dataset.walkthroughState).toBe("active");

        soundCard.click();
        notesInput.dispatchEvent(new Event("input", { bubbles: true }));
        intervalSelect.dispatchEvent(new Event("change", { bubbles: true }));
        volumeInput.dispatchEvent(new Event("input", { bubbles: true }));
        exportButton.click();

        expect(section.dataset.walkthroughState).toBe("complete");
        expect(activePanel.hidden).toBe(true);
        expect(JSON.parse(localStorage.getItem("webArpCreationWalkthrough") || "null")).toEqual({
            state: "complete",
            stepIndex: 5,
        });
    });

    test("supports skipping, resuming, and restarting without touching musical settings", () => {
        const { controller, restartButton, section, skipButton, startButton } = createFixture();

        startButton.click();
        skipButton.click();
        expect(section.dataset.walkthroughState).toBe("skipped");

        startButton.click();
        expect(section.dataset.walkthroughState).toBe("active");
        restartButton.click();
        expect(section.dataset.walkthroughState).toBe("active");
        controller.destroy();
    });
});
