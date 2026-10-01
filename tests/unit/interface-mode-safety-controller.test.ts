import { createInterfaceModeSafetyController } from "@ui/interface-mode-safety-controller.js";
import { describe, expect, it, vi } from "vitest";

function createFixture(
    options: { isRecording?: boolean; stopRecording?: () => Promise<boolean> } = {},
) {
    let mode = "full";
    const keyboardToggle = document.createElement("input");
    keyboardToggle.type = "checkbox";
    keyboardToggle.checked = true;
    const keyboardChange = vi.fn();
    keyboardToggle.addEventListener("change", keyboardChange);
    const visualizer = { isVisualizerOn: true, toggle: vi.fn() };
    const recorder = {
        isRecording: options.isRecording ?? true,
        stopRecording: options.stopRecording ?? vi.fn(async () => true),
        toggleRecording: vi.fn(async () => {}),
    };
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
});
