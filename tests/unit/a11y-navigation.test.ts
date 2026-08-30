/**
 * @file Unit tests for ARIA keyboard arrow-key navigation in button/radio groups.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupKeyboardNavigation } from "@ui/a11y-navigation.js";

describe("A11y Navigation Domain Module", () => {
    let container: HTMLElement;
    let button1: HTMLButtonElement;
    let button2: HTMLButtonElement;
    let button3: HTMLButtonElement;

    beforeEach(() => {
        container = document.createElement("div");
        button1 = document.createElement("button");
        button2 = document.createElement("button");
        button3 = document.createElement("button");

        button1.className = "test-btn";
        button2.className = "test-btn";
        button3.className = "test-btn";

        container.appendChild(button1);
        container.appendChild(button2);
        container.appendChild(button3);
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("navigates right and wraps around to start on ArrowRight", () => {
        setupKeyboardNavigation(container, ".test-btn");

        button1.focus();
        expect(document.activeElement).toBe(button1);

        // ArrowRight from button1 -> button2
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement).toBe(button2);

        // ArrowRight from button2 -> button3
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement).toBe(button3);

        // ArrowRight from button3 -> wraps to button1
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement).toBe(button1);
    });

    it("navigates left and wraps around to end on ArrowLeft", () => {
        setupKeyboardNavigation(container, ".test-btn");

        button1.focus();
        expect(document.activeElement).toBe(button1);

        // ArrowLeft from button1 -> wraps to button3
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        expect(document.activeElement).toBe(button3);

        // ArrowLeft from button3 -> button2
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        expect(document.activeElement).toBe(button2);
    });

    it("navigates with ArrowDown and ArrowUp", () => {
        setupKeyboardNavigation(container, ".test-btn");

        button1.focus();
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(document.activeElement).toBe(button2);

        container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
        expect(document.activeElement).toBe(button1);
    });

    it("checks radio inputs and dispatches change and input events on arrow navigation", () => {
        const fieldset = document.createElement("fieldset");
        const radio1 = document.createElement("input");
        const radio2 = document.createElement("input");

        radio1.type = "radio";
        radio1.name = "pattern";
        radio1.value = "up";
        radio1.checked = true;
        radio1.className = "pattern-radio";

        radio2.type = "radio";
        radio2.name = "pattern";
        radio2.value = "down";
        radio2.checked = false;
        radio2.className = "pattern-radio";

        fieldset.appendChild(radio1);
        fieldset.appendChild(radio2);
        document.body.appendChild(fieldset);

        const changeHandler = vi.fn();
        radio2.addEventListener("change", changeHandler);

        setupKeyboardNavigation(fieldset, ".pattern-radio");

        radio1.focus();
        fieldset.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

        expect(document.activeElement).toBe(radio2);
        expect(radio2.checked).toBe(true);
        expect(changeHandler).toHaveBeenCalled();
    });

    it("ignores key events when activeElement is not a member of the button group", () => {
        setupKeyboardNavigation(container, ".test-btn");

        const externalButton = document.createElement("button");
        document.body.appendChild(externalButton);
        externalButton.focus();

        container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement).toBe(externalButton);
    });

    it("handles null or empty containers gracefully", () => {
        expect(() => {
            setupKeyboardNavigation(null, ".test-btn");
        }).not.toThrow();
    });
});
