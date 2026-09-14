import { createTransportController } from "@ui/transport-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";

const controllers: Array<ReturnType<typeof createTransportController>> = [];

/**
 * Builds transport controls with an isolated viewport state.
 */
function createFixture() {
    const playStopButton = document.createElement("button");
    const stickyTransportBar = document.createElement("div");
    let isPlaying = false;
    let isDesktop = true;
    let barTop = 0;
    const onStart = vi.fn().mockResolvedValue(undefined);
    const onStop = vi.fn();
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
    });
    const matchMedia = vi.fn(() => ({ matches: isDesktop }));
    const windowRef = {
        addEventListener: window.addEventListener.bind(window),
        matchMedia,
        requestAnimationFrame,
        removeEventListener: window.removeEventListener.bind(window),
    } as unknown as Window;
    vi.spyOn(stickyTransportBar, "getBoundingClientRect").mockImplementation(
        () => ({ top: barTop }) as DOMRect,
    );
    document.body.append(playStopButton, stickyTransportBar);

    const controller = createTransportController({
        dom: { playStopButton, stickyTransportBar },
        windowRef,
        getIsPlaying: () => isPlaying,
        onStart,
        onStop,
    });
    controllers.push(controller);

    return {
        controller,
        matchMedia,
        onStart,
        onStop,
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

    test("updates sticky styling on viewport changes and defers scroll work", () => {
        const {
            controller,
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
        expect(requestAnimationFrame).toHaveBeenCalledOnce();
        expect(stickyTransportBar.classList.contains("is-stuck")).toBe(true);
    });
});
