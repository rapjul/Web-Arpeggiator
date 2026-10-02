import { createInterfaceModeSafetyController } from "@ui/interface-mode-safety-controller.js";
import { describe, expect, it, vi } from "vitest";

/**
 * Test fixture options for the interface mode safety controller.
 */
interface FixtureOptions {
    isRecording?: boolean;
    stopRecording?: () => Promise<boolean>;
    keyboardToggle?: HTMLInputElement | null;
    visualizer?: { isVisualizerOn: boolean; toggle: () => void } | null;
    cancelPendingAdvancedActions?: (() => void) | null;
}

/**
 * Creates an interface mode safety controller fixture for testing.
 *
 * @param {FixtureOptions} [options={}] - Fixture configuration options.
 * @returns {object} The test fixture and mock dependencies.
 */
function createFixture(options: FixtureOptions = {}) {
    let mode = "full";
    const defaultKeyboardToggle = document.createElement("input");
    defaultKeyboardToggle.type = "checkbox";
    defaultKeyboardToggle.checked = true;
    const keyboardToggle =
        options.keyboardToggle !== undefined ? options.keyboardToggle : defaultKeyboardToggle;
    const keyboardChange = vi.fn();
    keyboardToggle?.addEventListener("change", keyboardChange);
    const visualizer =
        options.visualizer !== undefined
            ? options.visualizer
            : { isVisualizerOn: true, toggle: vi.fn() };
    const recorder = {
        isRecording: options.isRecording ?? true,
        stopRecording: options.stopRecording ?? vi.fn(async () => true),
        toggleRecording: vi.fn(async () => {}),
    };
    const cancelPendingAdvancedActions =
        options.cancelPendingAdvancedActions !== undefined
            ? (options.cancelPendingAdvancedActions ?? undefined)
            : vi.fn();
    const setInterfaceMode = vi.fn((nextMode: "simple" | "full") => {
        mode = nextMode;
    });
    const showToast = vi.fn();
    const logger = { warn: vi.fn() };
    const controller = createInterfaceModeSafetyController({
        getInterfaceMode: () => mode,
        getRecorderManager: () => recorder,
        getKeyboardToggle: () => keyboardToggle,
        getVisualizer: () => visualizer,
        cancelPendingAdvancedActions,
        setInterfaceMode,
        showToast,
        logger,
    });
    const applyMode = (nextMode: "simple" | "full") => {
        mode = nextMode;
        controller.onModeApplied(nextMode);
    };
    return {
        applyMode,
        cancelPendingAdvancedActions,
        controller,
        keyboardChange,
        keyboardToggle,
        logger,
        recorder,
        setInterfaceMode,
        showToast,
        visualizer,
    };
}

describe("interface mode safety controller", () => {
    it("deactivates transient tools and confirms a successful recording stop", async () => {
        const fixture = createFixture();

        fixture.applyMode("simple");
        await vi.waitFor(() => {
            expect(fixture.showToast).toHaveBeenCalledWith(
                "Recording stopped when Simple controls were selected.",
                "info",
            );
        });

        expect(fixture.keyboardToggle.checked).toBe(false);
        expect(fixture.keyboardChange).toHaveBeenCalledOnce();
        expect(fixture.visualizer.toggle).toHaveBeenCalledOnce();
        expect(fixture.recorder.stopRecording).toHaveBeenCalledOnce();
        expect(fixture.setInterfaceMode).not.toHaveBeenCalled();
    });

    it("does not report a stop when a pending start never captured audio", async () => {
        const fixture = createFixture({ stopRecording: vi.fn(async () => false) });

        fixture.applyMode("simple");
        await Promise.resolve();

        expect(fixture.showToast).not.toHaveBeenCalled();
        expect(fixture.setInterfaceMode).not.toHaveBeenCalled();
    });

    it("restores Full controls after a real stop failure even when capture is idle", async () => {
        const stopError = new Error("recorder stop failed");
        const fixture = createFixture({
            stopRecording: vi.fn(async () => {
                fixture.recorder.isRecording = false;
                throw stopError;
            }),
        });

        fixture.applyMode("simple");
        await vi.waitFor(() => expect(fixture.setInterfaceMode).toHaveBeenCalledWith("full"));

        expect(fixture.logger.warn).toHaveBeenCalledWith(
            "Could not stop recording after selecting Simple controls:",
            stopError,
        );
        expect(fixture.showToast).toHaveBeenCalledWith(
            "Recording could not be stopped, so Full controls were restored.",
            "error",
        );
    });

    it("ignores stale stop failures after the user returns to Full mode", async () => {
        let rejectStop: ((error: Error) => void) | undefined;
        const stopRecording = vi.fn(
            () =>
                new Promise<boolean>((_resolve, reject) => {
                    rejectStop = reject;
                }),
        );
        const fixture = createFixture({ stopRecording });

        fixture.applyMode("simple");
        fixture.applyMode("full");
        rejectStop?.(new Error("late failure"));
        await Promise.resolve();

        expect(fixture.setInterfaceMode).not.toHaveBeenCalled();
        expect(fixture.showToast).not.toHaveBeenCalled();
    });

    it("ignores pending stop completions after teardown", async () => {
        let resolveStop: ((stopped: boolean) => void) | undefined;
        const stopRecording = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    resolveStop = resolve;
                }),
        );
        const fixture = createFixture({ stopRecording });

        fixture.applyMode("simple");
        fixture.controller.destroy();
        resolveStop?.(true);
        await Promise.resolve();

        expect(fixture.showToast).not.toHaveBeenCalled();
        expect(fixture.setInterfaceMode).not.toHaveBeenCalled();
    });

    it("handles missing or null keyboard toggle element gracefully without throwing", () => {
        const fixture = createFixture({ keyboardToggle: null });

        expect(() => fixture.applyMode("simple")).not.toThrow();
        expect(fixture.visualizer.toggle).toHaveBeenCalledOnce();
    });

    it("handles missing or null visualizer gracefully without throwing", () => {
        const fixture = createFixture({ visualizer: null });

        expect(() => fixture.applyMode("simple")).not.toThrow();
        expect(fixture.keyboardToggle?.checked).toBe(false);
    });

    it("does not toggle visualizer when visualizer is already off", () => {
        const fixture = createFixture({
            visualizer: { isVisualizerOn: false, toggle: vi.fn() },
        });

        fixture.applyMode("simple");

        expect(fixture.visualizer.toggle).not.toHaveBeenCalled();
    });

    it("calls cancelPendingAdvancedActions when Simple mode is applied", () => {
        const fixture = createFixture();

        fixture.applyMode("simple");

        expect(fixture.cancelPendingAdvancedActions).toHaveBeenCalledOnce();
    });

    it("does not call cancelPendingAdvancedActions when Full mode is applied", () => {
        const fixture = createFixture();

        fixture.applyMode("full");

        expect(fixture.cancelPendingAdvancedActions).not.toHaveBeenCalled();
    });

    it("handles missing cancelPendingAdvancedActions gracefully without throwing", () => {
        const fixture = createFixture({ cancelPendingAdvancedActions: null });

        expect(() => fixture.applyMode("simple")).not.toThrow();
        expect(fixture.visualizer.toggle).toHaveBeenCalledOnce();
    });

    it("handles throwing cancelPendingAdvancedActions gracefully without blocking other deactivations", () => {
        const error = new Error("Cancellation failure");
        const cancelPendingAdvancedActions = vi.fn(() => {
            throw error;
        });
        const fixture = createFixture({ cancelPendingAdvancedActions });

        expect(() => fixture.applyMode("simple")).not.toThrow();
        expect(fixture.logger.warn).toHaveBeenCalledWith(
            "Failed to cancel pending advanced actions on Simple mode transition:",
            error,
        );
        expect(fixture.visualizer.toggle).toHaveBeenCalledOnce();
        expect(fixture.keyboardToggle.checked).toBe(false);
    });
});
