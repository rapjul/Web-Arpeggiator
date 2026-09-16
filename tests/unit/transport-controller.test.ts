import { createTransportController } from "@ui/transport-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";

const controllers: Array<ReturnType<typeof createTransportController>> = [];
type TransportControllerDependencies = Parameters<typeof createTransportController>[0];

interface TransportFixture {
    bpmSlider: HTMLInputElement;
    controller: ReturnType<typeof createTransportController>;
    dependencies: TransportControllerDependencies;
    flushFrame: (frameId: number) => void;
    flushTransportChanges: () => void;
    matchMedia: ReturnType<typeof vi.fn>;
    onBpmChange: ReturnType<typeof vi.fn>;
    onStart: ReturnType<typeof vi.fn>;
    onStop: ReturnType<typeof vi.fn>;
    onSwingChange: ReturnType<typeof vi.fn>;
    playStopButton: HTMLButtonElement;
    requestAnimationFrame: ReturnType<typeof vi.fn>;
    setBarTop: (value: number) => void;
    setDesktop: (value: boolean) => void;
    setIsPlaying: (value: boolean) => void;
    stickyTransportBar: HTMLDivElement;
    swingSlider: HTMLInputElement;
}

/**
 * Builds transport controls with an isolated viewport state.
 */
function createFixture(): TransportFixture {
    const playStopButton = document.createElement("button");
    const stickyTransportBar = document.createElement("div");
    const bpmSlider = document.createElement("input");
    bpmSlider.value = "140";
    const swingSlider = document.createElement("input");
    swingSlider.value = "0.25";
    let isPlaying = false;
    let isDesktop = true;
    let barTop = 0;
    const onStart = vi.fn().mockResolvedValue(undefined);
    const onStop = vi.fn();
    const onBpmChange = vi.fn();
    const onSwingChange = vi.fn();
    const pendingFrames = new Map<number, FrameRequestCallback>();
    const pendingTransportChanges: Array<() => void> = [];
    let nextFrameId = 1;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
        const frameId = nextFrameId;
        nextFrameId += 1;
        pendingFrames.set(frameId, callback);
        return frameId;
    });
    const cancelAnimationFrame = vi.fn((frameId: number) => pendingFrames.delete(frameId));
    const matchMedia = vi.fn(() => ({ matches: isDesktop }));
    const windowRef = {
        addEventListener: window.addEventListener.bind(window),
        cancelAnimationFrame,
        matchMedia,
        requestAnimationFrame,
        removeEventListener: window.removeEventListener.bind(window),
    } as unknown as Window;
    vi.spyOn(stickyTransportBar, "getBoundingClientRect").mockImplementation(
        () => ({ top: barTop }) as DOMRect,
    );
    document.body.append(playStopButton, stickyTransportBar, bpmSlider, swingSlider);

    const dependencies: TransportControllerDependencies = {
        dom: { bpmSlider, playStopButton, stickyTransportBar, swingSlider },
        windowRef,
        getIsPlaying: () => isPlaying,
        onStart,
        onStop,
        onBpmChange,
        onSwingChange,
        debounce: (callback) => () => {
            pendingTransportChanges.push(callback);
        },
    };
    const controller = createTransportController(dependencies);
    controllers.push(controller);

    return {
        bpmSlider,
        controller,
        dependencies,
        flushFrame: (frameId: number) => {
            const callback = pendingFrames.get(frameId);
            if (!callback) return;
            pendingFrames.delete(frameId);
            callback(0);
        },
        flushTransportChanges: () => {
            pendingTransportChanges.splice(0).forEach((callback) => {
                callback();
            });
        },
        matchMedia,
        onStart,
        onStop,
        onBpmChange,
        onSwingChange,
        playStopButton,
        requestAnimationFrame,
        setBarTop: (value: number) => {
            barTop = value;
        },
        setDesktop: (value: boolean) => {
            isDesktop = value;
        },
        setIsPlaying: (value: boolean) => {
            isPlaying = value;
        },
        stickyTransportBar,
        swingSlider,
    };
}

describe("transport controller", () => {
    afterEach(() => {
        controllers.splice(0).forEach((controller) => {
            controller.destroy();
        });
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    test("starts or stops playback from the injected current state", async () => {
        const { controller, onStart, onStop, playStopButton, setIsPlaying } = createFixture();
        controller.initialize();

        playStopButton.click();
        await vi.waitFor(() => {
            expect(onStart).toHaveBeenCalledOnce();
        });
        expect(onStop).not.toHaveBeenCalled();

        setIsPlaying(true);
        playStopButton.click();
        expect(onStop).toHaveBeenCalledOnce();
    });

    test("updates sticky styling on viewport changes and coalesces scroll work", () => {
        const {
            controller,
            flushFrame,
            matchMedia,
            requestAnimationFrame,
            setBarTop,
            setDesktop,
            stickyTransportBar,
        } = createFixture();
        controller.initialize();

        expect(stickyTransportBar.classList.contains("is-stuck")).toBe(true);
        expect(matchMedia).toHaveBeenCalledWith("(min-width: 640px)");

        setDesktop(false);
        window.dispatchEvent(new Event("resize"));
        expect(stickyTransportBar.classList.contains("is-stuck")).toBe(false);

        setDesktop(true);
        setBarTop(-4);
        window.dispatchEvent(new Event("scroll"));
        window.dispatchEvent(new Event("scroll"));
        expect(requestAnimationFrame).toHaveBeenCalledOnce();
        expect(stickyTransportBar.classList.contains("is-stuck")).toBe(false);
        flushFrame(1);
        expect(stickyTransportBar.classList.contains("is-stuck")).toBe(true);
    });

    test("cancels a queued sticky update during teardown", () => {
        const { controller, flushFrame, requestAnimationFrame, stickyTransportBar } =
            createFixture();
        controller.initialize();
        stickyTransportBar.classList.remove("is-stuck");

        window.dispatchEvent(new Event("scroll"));
        expect(requestAnimationFrame).toHaveBeenCalledOnce();

        controller.destroy();
        flushFrame(1);
        expect(stickyTransportBar.classList.contains("is-stuck")).toBe(false);
    });

    test("suppresses queued tempo changes during teardown", () => {
        const {
            bpmSlider,
            controller,
            flushTransportChanges,
            onBpmChange,
            onSwingChange,
            swingSlider,
        } = createFixture();
        controller.initialize();

        bpmSlider.dispatchEvent(new Event("input"));
        swingSlider.dispatchEvent(new Event("input"));
        controller.destroy();
        flushTransportChanges();

        expect(onBpmChange).not.toHaveBeenCalled();
        expect(onSwingChange).not.toHaveBeenCalled();
    });
});
