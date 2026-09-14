import { createNoteStepController } from "@ui/note-step-controller.js";
import { describe, expect, it } from "vitest";

describe("note step controller", () => {
    it("renders notes and keeps only the highlighted step active", () => {
        const container = document.createElement("div");
        const controller = createNoteStepController({
            container,
            getNotes: () => ["C4", "E4", "G4"],
        });

        controller.rebuild();
        const pips = container.querySelectorAll<HTMLElement>(".note-step-pip");
        expect(pips).toHaveLength(3);
        expect(pips[1].getAttribute("aria-label")).toBe("E4");

        controller.highlight(1);
        controller.highlight(2);
        expect(pips[1].classList.contains("active")).toBe(false);
        expect(pips[2].classList.contains("active")).toBe(true);

        controller.clear();
        expect([...pips].every((pip) => !pip.classList.contains("active"))).toBe(true);
    });

    it("safely ignores unavailable containers and invalid indices", () => {
        const controller = createNoteStepController({ container: null, getNotes: () => ["C4"] });
        expect(() => {
            controller.rebuild();
            controller.highlight(-1);
            controller.clear();
        }).not.toThrow();
    });
});
