/**
 * @file Unit tests for UI feedback toast notifications and screen reader announcements.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToastManager } from "@ui/ui-feedback.js";

describe("UI Feedback Toast Manager", () => {
    let toastContainer: HTMLElement;
    let liveRegion: HTMLElement;

    beforeEach(() => {
        vi.useFakeTimers();
        toastContainer = document.createElement("div");
        toastContainer.id = "toast-container";
        liveRegion = document.createElement("div");
        liveRegion.id = "sr-announcements";
        document.body.appendChild(toastContainer);
        document.body.appendChild(liveRegion);
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("creates toasts with correct message and type classes", () => {
        const logged: string[] = [];
        const manager = createToastManager({
            toastContainer,
            liveRegion,
            logger: (msg) => logged.push(String(msg)),
        });

        manager.showToast("Preset saved successfully!", "success");

        expect(logged).toContain("TOAST (success): Preset saved successfully!");
        const toast = toastContainer.querySelector(".toast-message");
        expect(toast).not.toBeNull();
        expect(toast?.textContent).toBe("Preset saved successfully!");
        expect(toast?.classList.contains("toast-success")).toBe(true);
    });

    it("uses default document elements when context is omitted", () => {
        const manager = createToastManager();
        manager.showToast("Default context toast", "info");

        const toast = toastContainer.querySelector(".toast-message");
        expect(toast).not.toBeNull();
        expect(toast?.textContent).toBe("Default context toast");
    });

    it("handles showToast when requestAnimationFrame is unavailable", () => {
        const customWindow = window as Window & {
            requestAnimationFrame?: typeof window.requestAnimationFrame;
        };
        const originalRaf = customWindow.requestAnimationFrame;
        try {
            customWindow.requestAnimationFrame = undefined;
            const manager = createToastManager({ toastContainer, liveRegion });
            manager.showToast("No RAF toast", "info");

            const toast = toastContainer.querySelector(".toast-message");
            expect(toast).not.toBeNull();
            expect(toast?.classList.contains("show")).toBe(true);
        } finally {
            customWindow.requestAnimationFrame = originalRaf;
        }
    });

    it("announces messages to the ARIA live region with timer delay", () => {
        const manager = createToastManager({ toastContainer, liveRegion });

        manager.announce("Audio playback started");
        expect(liveRegion.textContent).toBe("");

        vi.advanceTimersByTime(100);
        expect(liveRegion.textContent).toBe("Audio playback started");
    });

    it("handles auto-dismiss animation classes and DOM element removal", () => {
        const manager = createToastManager({ toastContainer, liveRegion });

        manager.showToast("Recording started", "info");
        const toast = toastContainer.querySelector(".toast-message");
        expect(toast).not.toBeNull();

        // Advance 3000ms: class switches from show to hide
        vi.advanceTimersByTime(3000);
        expect(toast?.classList.contains("hide")).toBe(true);

        // Advance further 300ms (3300ms total): element is removed from DOM
        vi.advanceTimersByTime(300);
        expect(toastContainer.querySelector(".toast-message")).toBeNull();
    });

    it("handles missing toast container and live region gracefully without throwing", () => {
        const manager = createToastManager({ toastContainer: null, liveRegion: null });

        expect(() => {
            manager.showToast("No container test", "error");
            manager.announce("No region test");
        }).not.toThrow();
    });
});
