import { describe, expect, it, vi } from "vitest";
import { createChordConflictDialogController } from "@ui/chord-conflict-dialog-controller.js";

function createFixture() {
    const overlay = document.createElement("div");
    overlay.classList.add("hidden");
    const dialog = document.createElement("div");
    const title = document.createElement("h2");
    title.dataset.chordConflictTitle = "";
    const requestedNotes = document.createElement("dd");
    const adaptedNotes = document.createElement("dd");
    const changedPitches = document.createElement("dd");
    const keepButton = document.createElement("button");
    const adaptButton = document.createElement("button");
    const cancelButton = document.createElement("button");
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
    document.body.append(overlay);

    const controller = createChordConflictDialogController({
        documentRef: document,
        dom: {
            overlay,
            dialog,
            requestedNotes,
            adaptedNotes,
            changedPitches,
            keepButton,
            adaptButton,
            cancelButton,
        },
    });

    return {
        adaptedNotes,
        adaptButton,
        cancelButton,
        changedPitches,
        controller,
        keepButton,
        overlay,
        requestedNotes,
        returnFocus: document.createElement("button"),
    };
}

describe("chord conflict dialog controller", () => {
    it("shows both choices, adapts, and restores focus", () => {
        const fixture = createFixture();
        document.body.append(fixture.returnFocus);
        fixture.returnFocus.focus();
        const onAdapt = vi.fn();

        fixture.controller.open({
            chordName: "Minor",
            root: "C",
            requestedNotes: ["C4", "D#4", "G4"],
            adaptedNotes: ["C4", "D4", "G4"],
            changedPitches: [{ requested: "D#4", adapted: "D4" }],
            onKeep: vi.fn(),
            onAdapt,
        });

        expect(fixture.overlay.classList.contains("hidden")).toBe(false);
        expect(fixture.requestedNotes.textContent).toBe("C4  •  D#4  •  G4");
        expect(fixture.adaptedNotes.textContent).toBe("C4  •  D4  •  G4");
        expect(fixture.changedPitches.textContent).toBe("D#4 → D4");
        expect(document.activeElement).toBe(fixture.adaptButton);

        fixture.adaptButton.click();

        expect(onAdapt).toHaveBeenCalledOnce();
        expect(fixture.overlay.classList.contains("hidden")).toBe(true);
        expect(document.activeElement).toBe(fixture.returnFocus);
        fixture.controller.destroy();
        fixture.overlay.remove();
        fixture.returnFocus.remove();
    });

    it("cancels on Escape without applying either choice", () => {
        const fixture = createFixture();
        const onKeep = vi.fn();
        const onAdapt = vi.fn();
        const onCancel = vi.fn();

        fixture.controller.open({
            chordName: "Minor",
            root: "C",
            requestedNotes: ["C4", "D#4", "G4"],
            adaptedNotes: ["C4", "D4", "G4"],
            changedPitches: [{ requested: "D#4", adapted: "D4" }],
            onKeep,
            onAdapt,
            onCancel,
        });
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

        expect(onKeep).not.toHaveBeenCalled();
        expect(onAdapt).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalledOnce();
        fixture.controller.destroy();
        fixture.overlay.remove();
    });
});
