import { createInputFilterController } from "@ui/input-filter-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";

type InputFilterControllerDependencies = Parameters<typeof createInputFilterController>[0];

interface InputFilterFixture {
    controller: ReturnType<typeof createInputFilterController>;
    filterNoteInput: ReturnType<typeof vi.fn>;
    filterNumericInput: ReturnType<typeof vi.fn>;
    loopCountInput: HTMLInputElement;
    notesInput: HTMLInputElement;
}

/** Builds two constrained inputs and their injectable domain filters. */
function createFixture(): InputFilterFixture {
    const notesInput = document.createElement("input");
    const loopCountInput = document.createElement("input");
    const filterNoteInput = vi.fn(() => true);
    const filterNumericInput = vi.fn(() => true);
    document.body.append(notesInput, loopCountInput);
    const dependencies: InputFilterControllerDependencies = {
        dom: { notesInput, loopCountInput },
        filterNoteInput,
        filterNumericInput,
    };

    return {
        controller: createInputFilterController(dependencies),
        filterNoteInput,
        filterNumericInput,
        loopCountInput,
        notesInput,
    };
}

/** Dispatches a cancellable keyboard event and returns whether it was accepted. */
function dispatchKey(target: HTMLInputElement, key: string): boolean {
    return target.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
}

describe("input filter controller", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    test("routes each constrained input to its matching domain filter", () => {
        const { controller, filterNoteInput, filterNumericInput, loopCountInput, notesInput } =
            createFixture();
        controller.initialize();

        dispatchKey(notesInput, "C");
        dispatchKey(loopCountInput, "4");

        expect(filterNoteInput).toHaveBeenCalledOnce();
        expect(filterNumericInput).toHaveBeenCalledOnce();
    });

    test("prevents rejected keys while preserving allowed key behavior", () => {
        const { controller, filterNoteInput, filterNumericInput, loopCountInput, notesInput } =
            createFixture();
        filterNoteInput.mockReturnValue(false);
        filterNumericInput.mockReturnValue(true);
        controller.initialize();

        expect(dispatchKey(notesInput, "Z")).toBe(false);
        expect(dispatchKey(loopCountInput, "4")).toBe(true);
    });

    test("avoids duplicate handlers and releases them on teardown", () => {
        const { controller, filterNoteInput, filterNumericInput, loopCountInput, notesInput } =
            createFixture();
        controller.initialize();
        controller.initialize();

        dispatchKey(notesInput, "C");
        expect(filterNoteInput).toHaveBeenCalledOnce();

        controller.destroy();
        dispatchKey(notesInput, "D");
        dispatchKey(loopCountInput, "3");
        expect(filterNoteInput).toHaveBeenCalledOnce();
        expect(filterNumericInput).not.toHaveBeenCalled();
    });
});
