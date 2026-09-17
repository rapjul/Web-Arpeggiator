import { afterEach, describe, expect, it, vi } from "vitest";
import { createFuturePresetDialogController } from "@ui/future-preset-dialog-controller.js";

const controllers: Array<ReturnType<typeof createFuturePresetDialogController>> = [];

function renderDialog(): HTMLButtonElement {
    document.body.innerHTML = `
        <main id="app-main"></main>
        <button id="load-preset-button" type="button">Load preset</button>
        <div id="future-preset-overlay" class="hidden" aria-hidden="true">
            <div id="future-preset-dialog">
                <button id="future-preset-cancel" type="button">Cancel</button>
                <button id="future-preset-confirm" type="button">Load compatible settings</button>
            </div>
        </div>
    `;
    return document.getElementById("load-preset-button") as HTMLButtonElement;
}

afterEach(() => {
    controllers.splice(0).forEach((controller) => {
        controller.destroy();
    });
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

describe("future preset dialog controller", () => {
    it("keeps focus inside the dialog and restores it after cancellation", () => {
        const loadPresetButton = renderDialog();
        const controller = createFuturePresetDialogController({
            getReturnFocus: () => loadPresetButton,
            onConfirm: vi.fn(),
        });
        controllers.push(controller);
        const appMain = document.getElementById("app-main");
        const overlay = document.getElementById("future-preset-overlay");
        const dialog = document.getElementById("future-preset-dialog");
        const cancelButton = document.getElementById("future-preset-cancel") as HTMLButtonElement;
        const confirmButton = document.getElementById("future-preset-confirm") as HTMLButtonElement;

        controller.open({ settingsVersion: 99 }, "future-preset.json");
        expect(overlay?.classList.contains("flex")).toBe(true);
        expect(overlay?.getAttribute("aria-hidden")).toBe("false");
        expect(appMain?.hasAttribute("inert")).toBe(true);
        expect(document.activeElement).toBe(confirmButton);

        confirmButton.focus();
        dialog?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
        expect(document.activeElement).toBe(cancelButton);
        cancelButton.focus();
        dialog?.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }),
        );
        expect(document.activeElement).toBe(confirmButton);

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(overlay?.classList.contains("hidden")).toBe(true);
        expect(appMain?.hasAttribute("inert")).toBe(false);
        expect(document.activeElement).toBe(loadPresetButton);
    });

    it("confirms the pending snapshot once and closes on an overlay click", () => {
        const loadPresetButton = renderDialog();
        const onConfirm = vi.fn();
        const controller = createFuturePresetDialogController({
            getReturnFocus: () => loadPresetButton,
            onConfirm,
        });
        controllers.push(controller);
        const overlay = document.getElementById("future-preset-overlay");
        const confirmButton = document.getElementById("future-preset-confirm") as HTMLButtonElement;

        controller.open({ bpm: 96, settingsVersion: 99 }, "future-preset.json");
        confirmButton.click();
        expect(onConfirm).toHaveBeenCalledWith(
            { bpm: 96, settingsVersion: 99 },
            "future-preset.json",
        );
        expect(overlay?.classList.contains("hidden")).toBe(true);

        controller.open({ bpm: 100, settingsVersion: 99 }, "cancelled.json");
        overlay?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(overlay?.classList.contains("hidden")).toBe(true);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("removes keyboard listeners during teardown", () => {
        const loadPresetButton = renderDialog();
        const controller = createFuturePresetDialogController({
            getReturnFocus: () => loadPresetButton,
            onConfirm: vi.fn(),
        });
        controllers.push(controller);
        const overlay = document.getElementById("future-preset-overlay");

        controller.destroy();
        controller.open({ settingsVersion: 99 }, "future-preset.json");
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

        expect(overlay?.getAttribute("aria-hidden")).toBe("false");
    });
});
