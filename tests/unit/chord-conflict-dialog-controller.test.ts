import { createChordConflictDialogController } from "@ui/chord-conflict-dialog-controller.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type DialogControllerDependencies = Parameters<typeof createChordConflictDialogController>[0];
type DialogController = ReturnType<typeof createChordConflictDialogController>;
type DialogDetails = Parameters<DialogController["open"]>[0];

interface DialogFixture {
    adaptedNotes: HTMLElement;
    adaptButton: HTMLButtonElement;
    appMain: HTMLElement;
    cancelButton: HTMLButtonElement;
    changedPitches: HTMLElement;
    controller: DialogController;
    dependencies: DialogControllerDependencies;
    dialog: HTMLElement;
    keepButton: HTMLButtonElement;
    overlay: HTMLElement;
    requestedNotes: HTMLElement;
    returnFocus: HTMLButtonElement;
}

function createDetails(overrides: Partial<DialogDetails> = {}): DialogDetails {
    return {
        chordName: "Minor",
        root: "C",
        requestedNotes: ["C4", "D#4", "G4"],
        adaptedNotes: ["C4", "D4", "G4"],
        changedPitches: [{ requested: "D#4", adapted: "D4" }],
        onKeep: vi.fn(),
        onAdapt: vi.fn(),
        ...overrides,
    };
}

function createFixture(): DialogFixture {
    const appMain = document.createElement("main");
    const overlay = document.createElement("div");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    const dialog = document.createElement("div");
    const title = document.createElement("h2");
    title.dataset.chordConflictTitle = "";
    const requestedNotes = document.createElement("dd");
    const adaptedNotes = document.createElement("dd");
    const changedPitches = document.createElement("dd");
    const keepButton = document.createElement("button");
    const adaptButton = document.createElement("button");
    const cancelButton = document.createElement("button");
    const returnFocus = document.createElement("button");
    dialog.append(
        title,
        requestedNotes,
        adaptedNotes,
        changedPitches,
        keepButton,
        adaptButton,
        cancelButton,
    );
    overlay.append(dialog);
    appMain.append(returnFocus);
    document.body.append(appMain, overlay);

    const dependencies: DialogControllerDependencies = {
        documentRef: document,
        dom: {
            appMain,
            overlay,
            dialog,
            requestedNotes,
            adaptedNotes,
            changedPitches,
            keepButton,
            adaptButton,
            cancelButton,
        },
    };

    return {
        adaptedNotes,
        adaptButton,
        appMain,
        cancelButton,
        changedPitches,
        controller: createChordConflictDialogController(dependencies),
        dependencies,
        dialog,
        keepButton,
        overlay,
        requestedNotes,
        returnFocus,
    };
}

describe("chord conflict dialog controller", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it("shows both choices, isolates the app, adapts, and restores focus", () => {
        const fixture = createFixture();
        fixture.returnFocus.focus();
        const onAdapt = vi.fn();

        fixture.controller.open(createDetails({ onAdapt }));

        expect(fixture.overlay.classList.contains("hidden")).toBe(false);
        expect(fixture.appMain.hasAttribute("inert")).toBe(true);
        expect(fixture.requestedNotes.textContent).toBe("C4  •  D#4  •  G4");
        expect(fixture.adaptedNotes.textContent).toBe("C4  •  D4  •  G4");
        expect(fixture.changedPitches.textContent).toBe("D#4 → D4");
        expect(document.activeElement).toBe(fixture.adaptButton);

        fixture.adaptButton.click();

        expect(onAdapt).toHaveBeenCalledOnce();
        expect(fixture.overlay.classList.contains("hidden")).toBe(true);
        expect(fixture.appMain.hasAttribute("inert")).toBe(false);
        expect(document.activeElement).toBe(fixture.returnFocus);
        fixture.controller.destroy();
    });

    it("contains dialog shortcuts and cancels on Escape", () => {
        const fixture = createFixture();
        const onCancel = vi.fn();
        const backgroundShortcut = vi.fn();
        window.addEventListener("keydown", backgroundShortcut);
        fixture.controller.open(createDetails({ onCancel }));

        fixture.adaptButton.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "z" }),
        );
        expect(backgroundShortcut).not.toHaveBeenCalled();

        fixture.adaptButton.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
        );

        expect(onCancel).toHaveBeenCalledOnce();
        expect(fixture.overlay.getAttribute("aria-hidden")).toBe("true");
        expect(fixture.appMain.hasAttribute("inert")).toBe(false);
        window.removeEventListener("keydown", backgroundShortcut);
        fixture.controller.destroy();
    });

    it("traps focus at both ends of the dialog", () => {
        const fixture = createFixture();
        fixture.controller.open(createDetails());

        fixture.cancelButton.focus();
        fixture.cancelButton.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }),
        );
        expect(document.activeElement).toBe(fixture.keepButton);

        fixture.keepButton.focus();
        fixture.keepButton.dispatchEvent(
            new KeyboardEvent("keydown", {
                bubbles: true,
                cancelable: true,
                key: "Tab",
                shiftKey: true,
            }),
        );
        expect(document.activeElement).toBe(fixture.cancelButton);
        fixture.controller.destroy();
    });

    it("fails closed when required dialog controls are unavailable", () => {
        const fixture = createFixture();
        const onCancel = vi.fn();
        const controller = createChordConflictDialogController({
            ...fixture.dependencies,
            dom: { ...fixture.dependencies.dom, adaptButton: null },
        });

        fixture.returnFocus.focus();
        controller.open(createDetails({ onCancel }));

        expect(onCancel).toHaveBeenCalledOnce();
        expect(fixture.overlay.classList.contains("hidden")).toBe(true);
        expect(fixture.appMain.hasAttribute("inert")).toBe(false);
        expect(document.activeElement).toBe(fixture.returnFocus);
        controller.destroy();
        fixture.controller.destroy();
    });

    it("cancels post-destroy opens without orphaning the dialog", () => {
        const fixture = createFixture();
        const onKeep = vi.fn();
        const onCancel = vi.fn();
        fixture.controller.destroy();
        fixture.controller.destroy();

        fixture.controller.open(createDetails({ onKeep, onCancel }));
        fixture.keepButton.click();
        fixture.overlay.click();
        fixture.adaptButton.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
        );

        expect(onKeep).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalledOnce();
        expect(fixture.overlay.classList.contains("hidden")).toBe(true);
        expect(fixture.appMain.hasAttribute("inert")).toBe(false);
    });

    it("safely ignores nullish or non-object calls to open", () => {
        const fixture = createFixture();
        expect(() => {
            // @ts-expect-error - testing invalid runtime input
            fixture.controller.open(null);
            // @ts-expect-error - testing invalid runtime input
            fixture.controller.open(undefined);
            // @ts-expect-error - testing invalid runtime input
            fixture.controller.open("invalid");
        }).not.toThrow();
        expect(fixture.overlay.classList.contains("hidden")).toBe(true);
        fixture.controller.destroy();
    });

    it("cancels a pending dialog when another open request arrives", () => {
        const fixture = createFixture();
        const firstCancel = vi.fn();
        const secondAdapt = vi.fn();

        fixture.controller.open(createDetails({ onCancel: firstCancel }));
        expect(fixture.overlay.classList.contains("hidden")).toBe(false);

        fixture.controller.open(createDetails({ onAdapt: secondAdapt }));
        expect(firstCancel).toHaveBeenCalledOnce();

        fixture.adaptButton.click();
        expect(secondAdapt).toHaveBeenCalledOnce();
        fixture.controller.destroy();
    });

    it("cancels when clicking the overlay background directly", () => {
        const fixture = createFixture();
        const onCancel = vi.fn();
        fixture.controller.open(createDetails({ onCancel }));

        fixture.overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(onCancel).toHaveBeenCalledOnce();
        expect(fixture.overlay.classList.contains("hidden")).toBe(true);
        fixture.controller.destroy();
    });
});
