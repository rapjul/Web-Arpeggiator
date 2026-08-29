/**
 * @file Unit tests for ARIA keyboard arrow-key navigation in button/radio groups.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
