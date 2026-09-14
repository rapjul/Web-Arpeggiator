import { createHistoryController } from "@ui/history-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";

const controllers: Array<ReturnType<typeof createHistoryController>> = [];

/**
 * Builds history controls with injectable state transitions.
 *
 * @param {{canUndo?: boolean, canRedo?: boolean, isAtDefault?: boolean}} [status] - Initial status.
 */
function createFixture(status = {}) {
    const appMain = document.createElement("main");
    const undoButton = document.createElement("button");
    const redoButton = document.createElement("button");
    const historyMenuButton = document.createElement("button");
    historyMenuButton.id = "history-menu-button";
    historyMenuButton.setAttribute("aria-expanded", "false");
    const historyMenu = document.createElement("div");
    historyMenu.id = "history-menu";
    historyMenu.classList.add("hidden");
    const historyMenuUndoButton = document.createElement("button");
    const historyMenuRedoButton = document.createElement("button");
    const resetDefaultsButton = document.createElement("button");
    const resetDefaultsDesktopButton = document.createElement("button");
    const resetDefaultsOverlay = document.createElement("div");
    resetDefaultsOverlay.classList.add("hidden");
    resetDefaultsOverlay.setAttribute("aria-hidden", "true");
    const resetDefaultsDialog = document.createElement("div");
    const resetDefaultsCancelButton = document.createElement("button");
    const resetDefaultsConfirmButton = document.createElement("button");
    const presetNameInput = document.createElement("input");

    historyMenu.append(historyMenuUndoButton, historyMenuRedoButton, resetDefaultsButton);
    resetDefaultsDialog.append(resetDefaultsCancelButton, resetDefaultsConfirmButton);
    resetDefaultsOverlay.appendChild(resetDefaultsDialog);
    document.body.append(
        appMain,
        undoButton,
        redoButton,
        historyMenuButton,
        historyMenu,
        resetDefaultsDesktopButton,
        resetDefaultsOverlay,
        presetNameInput,
    );

    const currentStatus = {
        canUndo: false,
        canRedo: false,
        isAtDefault: true,
        ...status,
    };
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onResetDefaults = vi.fn();
    const onEscapeReset = vi.fn(() => false);
    const controller = createHistoryController({
        dom: {
            appMain,
            undoButton,
            redoButton,
            historyMenuButton,
            historyMenu,
            historyMenuUndoButton,
            historyMenuRedoButton,
            resetDefaultsButton,
            resetDefaultsDesktopButton,
            resetDefaultsOverlay,
            resetDefaultsDialog,
            resetDefaultsCancelButton,
            resetDefaultsConfirmButton,
            presetNameInput,
        },
        documentRef: document,
        getStatus: () => currentStatus,
        onUndo,
        onRedo,
        onResetDefaults,
        onEscapeReset,
    });
    controllers.push(controller);

    return {
        appMain,
        controller,
        currentStatus,
        historyMenu,
        historyMenuButton,
        historyMenuRedoButton,
        historyMenuUndoButton,
        onEscapeReset,
        onRedo,
        onResetDefaults,
        onUndo,
        presetNameInput,
        redoButton,
        resetDefaultsButton,
        resetDefaultsCancelButton,
        resetDefaultsConfirmButton,
        resetDefaultsDesktopButton,
        resetDefaultsDialog,
        resetDefaultsOverlay,
        undoButton,
    };
}

describe("history controller", () => {
    afterEach(() => {
        controllers.splice(0).forEach((controller) => {
            controller.destroy();
        });
        document.body.replaceChildren();
    });

    test("updates actions and restores focus after menu history actions", () => {
        const {
            controller,
            currentStatus,
            historyMenu,
            historyMenuButton,
            historyMenuRedoButton,
            historyMenuUndoButton,
            onRedo,
            onUndo,
            redoButton,
            resetDefaultsButton,
            resetDefaultsDesktopButton,
            undoButton,
        } = createFixture({ canUndo: true, isAtDefault: false });

        controller.initialize();

        expect(undoButton.disabled).toBe(false);
        expect(historyMenuUndoButton.disabled).toBe(false);
        expect(redoButton.disabled).toBe(true);
        expect(historyMenuRedoButton.disabled).toBe(true);
        expect(resetDefaultsButton.disabled).toBe(false);
        expect(resetDefaultsDesktopButton.disabled).toBe(false);

        historyMenuButton.click();
        expect(historyMenu.classList.contains("hidden")).toBe(false);
        expect(document.activeElement).toBe(historyMenuUndoButton);
        historyMenuUndoButton.click();
        expect(onUndo).toHaveBeenCalledOnce();
        expect(historyMenu.classList.contains("hidden")).toBe(true);
        expect(document.activeElement).toBe(historyMenuButton);

        currentStatus.canUndo = false;
        currentStatus.canRedo = true;
        controller.updateControls();
        historyMenuButton.click();
        historyMenuRedoButton.click();
        expect(onRedo).toHaveBeenCalledOnce();
    });

    test("confirms resets with focus containment and restores the invoking control", () => {
        const {
            appMain,
            controller,
            onResetDefaults,
            resetDefaultsCancelButton,
            resetDefaultsConfirmButton,
            resetDefaultsDesktopButton,
            resetDefaultsDialog,
            resetDefaultsOverlay,
        } = createFixture({ isAtDefault: false });

        controller.initialize();
        resetDefaultsDesktopButton.focus();
        resetDefaultsDesktopButton.click();

        expect(resetDefaultsOverlay.getAttribute("aria-hidden")).toBe("false");
        expect(appMain.hasAttribute("inert")).toBe(true);
        expect(document.activeElement).toBe(resetDefaultsConfirmButton);

        resetDefaultsConfirmButton.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
        );
        expect(document.activeElement).toBe(resetDefaultsCancelButton);
        resetDefaultsCancelButton.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }),
        );
        expect(document.activeElement).toBe(resetDefaultsConfirmButton);

        resetDefaultsConfirmButton.click();
        expect(onResetDefaults).toHaveBeenCalledOnce();
        expect(resetDefaultsOverlay.getAttribute("aria-hidden")).toBe("true");
        expect(appMain.hasAttribute("inert")).toBe(false);
        expect(document.activeElement).toBe(resetDefaultsDesktopButton);

        resetDefaultsDesktopButton.click();
        resetDefaultsDialog.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
        );
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
        expect(resetDefaultsOverlay.getAttribute("aria-hidden")).toBe("true");
    });

    test("handles shortcuts without blocking preset-name undo and delegates escape resets", () => {
        const { controller, onEscapeReset, onRedo, onUndo, presetNameInput } = createFixture({
            canUndo: true,
        });
        controller.initialize();

        const nativeUndo = new KeyboardEvent("keydown", {
            key: "z",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        presetNameInput.dispatchEvent(nativeUndo);
        expect(nativeUndo.defaultPrevented).toBe(false);
        expect(onUndo).not.toHaveBeenCalled();

        const undo = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true });
        window.dispatchEvent(undo);
        expect(undo.defaultPrevented).toBe(true);
        expect(onUndo).toHaveBeenCalledOnce();

        const redo = new KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey: true });
        window.dispatchEvent(redo);
        expect(onRedo).toHaveBeenCalledOnce();

        onEscapeReset.mockReturnValue(true);
        const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
        window.dispatchEvent(escapeEvent);
        expect(onEscapeReset).toHaveBeenCalled();
        expect(escapeEvent.defaultPrevented).toBe(true);
    });
});
