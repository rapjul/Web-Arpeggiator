/**
 * @file Unit tests for Visualizer module, mode switching, zoom handling, and canvas rendering.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("tone", async () => {
    return {
        Loop: class MockLoop {
            callback: () => void;
            interval: string;
            isStarted = false;
            constructor(cb: () => void, interval: string) {
                this.callback = cb;
                this.interval = interval;
            }
            start() {
                this.isStarted = true;
                return this;
            }
            stop() {
                this.isStarted = false;
                return this;
            }
            dispose() {}
        },
        context: {
            sampleRate: 44100,
        },
        now: () => 1.0,
        getContext: () => ({
            rawContext: {
                sampleRate: 44100,
            },
        }),
    };
});

import { createVisualizer } from "@ui/visualizer.js";

describe("Visualizer Module", () => {
    type VisualizerContext = Parameters<typeof createVisualizer>[0];
    type VisualizerDom = VisualizerContext["dom"];
    type VisualizerAudio = VisualizerContext["audio"];
    type VisualizerState = VisualizerContext["state"];
    type VisualizerActions = VisualizerContext["actions"];

    let mockDom: VisualizerDom;
    let mockAudio: VisualizerAudio;
    let mockState: VisualizerState;
    let mockActions: VisualizerActions;
    let mockCanvasCtx: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
        mockCanvasCtx = {
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            fillRect: vi.fn(),
            fillText: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            setLineDash: vi.fn(),
            setTransform: vi.fn(),
            scale: vi.fn(),
            translate: vi.fn(),
            measureText: vi.fn(() => ({ width: 20 })),
            createLinearGradient: vi.fn(() => ({
                addColorStop: vi.fn(),
            })),
        };

        const createMockCanvas = () => {
            const canvas = document.createElement("canvas");
            canvas.getContext = vi.fn(() => mockCanvasCtx as unknown as CanvasRenderingContext2D);
            return canvas;
        };

        const createEl = (tag = "div") => document.createElement(tag);
        const viewport = createEl();
        Object.defineProperty(viewport, "clientWidth", { value: 400, configurable: true });
        Object.defineProperty(viewport, "clientHeight", { value: 150, configurable: true });

        const vuInfoTooltip = createEl();
        vuInfoTooltip.classList.add("hidden");

        mockDom = {
            visualizerYAxisCanvas: createMockCanvas(),
            visualizerViewport: viewport,
            visualizerPlotCanvas: createMockCanvas(),
            toggleVisualizerButton: createEl("button"),
            visualizerModeSelect: Object.assign(createEl("select"), {
                innerHTML:
                    "<option value='oscilloscope' selected>Oscilloscope</option><option value='fft'>FFT</option><option value='loopMap'>Loop Map</option>",
                value: "oscilloscope",
            }),
            pauseVisualizerButton: createEl("button"),
            visualizerZoomSlider: Object.assign(createEl("input"), { value: "1" }),
            visualizerZoomValue: createEl(),
            oscilloscopeWindowSelect: Object.assign(createEl("select"), {
                innerHTML:
                    "<option value='50' selected>50ms</option><option value='100'>100ms</option>",
                value: "50",
            }),
            oscilloscopeWindowContainer: createEl(),
            vuMeterBar: createEl(),
            vuDbValue: createEl(),
            vuClipContainer: createEl(),
            vuClipIndicator: createEl("button"),
            vuClipTooltip: createEl(),
            vuInfoButton: createEl("button"),
            vuInfoTooltip,
            envReleaseSlider: Object.assign(createEl("input"), { value: "1.0" }),
        };

        const mockFloatArray = new Float32Array(1024);
        for (let i = 0; i < mockFloatArray.length; i++) {
            mockFloatArray[i] = Math.sin((i / 1024) * Math.PI * 4) * 0.5;
        }

        mockAudio = {
            analyser: {
                getValue: vi.fn(() => mockFloatArray),
                type: "waveform",
            } as unknown as VisualizerAudio["analyser"],
            meter: {
                getValue: vi.fn(() => -12),
            } as unknown as VisualizerAudio["meter"],
            peakAnalyser: {
                getValue: vi.fn(() => mockFloatArray),
            } as unknown as VisualizerAudio["peakAnalyser"],
        };

        mockState = {
            isRecording: false,
            recordingStartTime: 0,
            recordButton: createEl("button"),
            isPlaying: false,
            activeNote: null,
        };

        mockActions = {
            formatTime: vi.fn((sec: number) => `${sec}s`),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("initializes visualizer in disabled state by default", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        expect(visualizer.isVisualizerOn).toBe(false);
        expect(visualizer.currentMode).toBe("oscilloscope");
        expect(visualizer.isClipped).toBe(false);
    });

    it("toggles visualizer activation state and runs update loops", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.toggle();
        expect(visualizer.isVisualizerOn).toBe(true);

        // Run UI update tick while active
        visualizer.runUiUpdate();
        expect(mockAudio.analyser.getValue).toHaveBeenCalled();

        visualizer.toggle();
        expect(visualizer.isVisualizerOn).toBe(false);
    });

    it("handles visualizer mode changes to FFT and Loop Map", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.toggle();

        // Switch to FFT mode
        mockDom.visualizerModeSelect.value = "fft";
        mockDom.visualizerModeSelect.dispatchEvent(new Event("change"));
        expect(visualizer.currentMode).toBe("fft");
        visualizer.runUiUpdate();

        // Switch to Loop Map mode
        mockDom.visualizerModeSelect.value = "loopMap";
        mockDom.visualizerModeSelect.dispatchEvent(new Event("change"));
        expect(visualizer.currentMode).toBe("loopMap");
        visualizer.runUiUpdate();
    });

    it("handles zoom slider changes and time window updates", () => {
        createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        // Zoom slider
        mockDom.visualizerZoomSlider.value = "2.5";
        mockDom.visualizerZoomSlider.dispatchEvent(new Event("input"));
        expect(mockDom.visualizerZoomValue.textContent).toBe("2.5x");

        // Time window select
        mockDom.oscilloscopeWindowSelect.value = "100";
        mockDom.oscilloscopeWindowSelect.dispatchEvent(new Event("change"));
    });

    it("handles pause button toggling", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.toggle();

        mockDom.pauseVisualizerButton.click();
        expect(mockDom.pauseVisualizerButton.textContent).toBe("Resume");

        mockDom.pauseVisualizerButton.click();
        expect(mockDom.pauseVisualizerButton.textContent).toBe("Pause");
    });

    it("toggles and dismisses the VU meter info tooltip via keyboard and click", () => {
        createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        // Open info tooltip
        mockDom.vuInfoButton.click();
        expect(mockDom.vuInfoTooltip.classList.contains("hidden")).toBe(false);

        // Escape dismisses
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(mockDom.vuInfoTooltip.classList.contains("hidden")).toBe(true);

        // Re-open and dismiss via outside click
        mockDom.vuInfoButton.click();
        expect(mockDom.vuInfoTooltip.classList.contains("hidden")).toBe(false);

        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(mockDom.vuInfoTooltip.classList.contains("hidden")).toBe(true);
    });

    it("resets clipping indicator state and handles click", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        mockDom.vuClipIndicator.click();
        expect(visualizer.isClipped).toBe(false);
    });

    it("handles manual keyboard note attack and release callbacks", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        expect(() => {
            visualizer.onManualNoteAttack("C4");
            visualizer.onManualNoteRelease("C4");
        }).not.toThrow();
    });

    it("updates static loop map buffer and markers and redraws when active", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.toggle();
        mockDom.visualizerModeSelect.value = "loopMap";
        mockDom.visualizerModeSelect.dispatchEvent(new Event("change"));

        const mockBuffer = {
            duration: 1.0,
            sampleRate: 44100,
            numberOfChannels: 1,
            getChannelData: () => new Float32Array(44100),
        } as unknown as AudioBuffer;
        const mockMarkers = [{ note: "C4", timeRatio: 0.5 }];

        expect(() => visualizer.updateStaticLoopMap(mockBuffer, mockMarkers)).not.toThrow();
        expect(mockCanvasCtx.clearRect).toHaveBeenCalled();
    });

    it("renders multi-octave expanded markers across varied pitch registers in loopMap mode", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.toggle();
        mockDom.visualizerModeSelect.value = "loopMap";
        mockDom.visualizerModeSelect.dispatchEvent(new Event("change"));

        const mockBuffer = {
            duration: 2.0,
            sampleRate: 44100,
            numberOfChannels: 1,
            getChannelData: () => new Float32Array(88200),
        } as unknown as AudioBuffer;

        // Simulate a 4-octave expanded pattern with transpositions
        const multiOctaveMarkers = [
            { note: "C2", timeRatio: 0.0 },
            { note: "E2", timeRatio: 0.1 },
            { note: "G2", timeRatio: 0.2 },
            { note: "C3", timeRatio: 0.3 },
            { note: "E3", timeRatio: 0.4 },
            { note: "G3", timeRatio: 0.5 },
            { note: "C4", timeRatio: 0.6 },
            { note: "E4", timeRatio: 0.7 },
            { note: "G4", timeRatio: 0.8 },
            { note: "C5", timeRatio: 0.9 },
        ];

        expect(() => visualizer.updateStaticLoopMap(mockBuffer, multiOctaveMarkers)).not.toThrow();
        expect(mockCanvasCtx.fillText).toHaveBeenCalledWith(
            "C2",
            expect.any(Number),
            expect.any(Number),
        );
        expect(mockCanvasCtx.fillText).toHaveBeenCalledWith(
            "E3",
            expect.any(Number),
            expect.any(Number),
        );
        expect(mockCanvasCtx.fillText).toHaveBeenCalledWith(
            "G4",
            expect.any(Number),
            expect.any(Number),
        );
        expect(mockCanvasCtx.fillText).toHaveBeenCalledWith(
            "C5",
            expect.any(Number),
            expect.any(Number),
        );
        expect(mockCanvasCtx.beginPath).toHaveBeenCalled();
        expect(mockCanvasCtx.stroke).toHaveBeenCalled();
    });

    it("retains and re-renders cached loop map buffer when switching modes", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.toggle();

        const mockBuffer = {
            duration: 1.0,
            sampleRate: 44100,
            numberOfChannels: 1,
            getChannelData: () => new Float32Array(44100),
        } as unknown as AudioBuffer;
        const mockMarkers = [
            { note: "C3", timeRatio: 0.0 },
            { note: "G3", timeRatio: 0.5 },
        ];

        // Store loop map data while still in oscilloscope mode
        visualizer.updateStaticLoopMap(mockBuffer, mockMarkers);

        // Clear previous drawing mock calls so we only assert redraw triggered by mode change
        vi.clearAllMocks();

        // Switch to loopMap mode — the change handler itself must trigger drawing of cached markers
        mockDom.visualizerModeSelect.value = "loopMap";
        mockDom.visualizerModeSelect.dispatchEvent(new Event("change"));

        expect(visualizer.currentMode).toBe("loopMap");
        expect(mockCanvasCtx.fillText).toHaveBeenCalledWith(
            "C3",
            expect.any(Number),
            expect.any(Number),
        );
        expect(mockCanvasCtx.fillText).toHaveBeenCalledWith(
            "G3",
            expect.any(Number),
            expect.any(Number),
        );
    });

    it("starts and stops UI loop lifecycles", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        expect(() => {
            visualizer.startUiLoop();
            visualizer.stopUiLoop();
        }).not.toThrow();
    });

    it("releases visualizer listeners when a temporary runtime is discarded", () => {
        const resizeListenerRemoval = vi.spyOn(window, "removeEventListener");
        const modeListenerRemoval = vi.spyOn(mockDom.visualizerModeSelect, "removeEventListener");
        const documentListenerRemoval = vi.spyOn(document, "removeEventListener");
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.destroy();

        expect(resizeListenerRemoval).toHaveBeenCalledWith("resize", expect.any(Function));
        expect(modeListenerRemoval).toHaveBeenCalledWith("change", expect.any(Function));
        expect(documentListenerRemoval).toHaveBeenCalledWith("keydown", expect.any(Function));

        mockDom.visualizerModeSelect.value = "fft";
        mockDom.visualizerModeSelect.dispatchEvent(new Event("change"));
        expect(visualizer.currentMode).toBe("oscilloscope");
    });

    it("triggers clipping state when VU meter levels reach or exceed 0 dB", () => {
        mockAudio.meter.getValue = vi.fn(() => 1.5);

        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.runUiUpdate();
        expect(visualizer.isClipped).toBe(true);
        expect(mockDom.vuClipIndicator.classList.contains("animate-pulse")).toBe(true);
        expect(mockDom.vuClipIndicator.classList.contains("bg-rose-600")).toBe(true);
    });

    it("updates elapsed recording time in button label during recording", () => {
        mockState.isRecording = true;
        mockState.recordingStartTime = 0.5;

        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.runUiUpdate();
        expect(mockState.recordButton.textContent).toContain("Stop Recording");
    });

    it("handles window resize events by recalculating canvas dimensions", () => {
        createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        expect(() => {
            window.dispatchEvent(new Event("resize"));
        }).not.toThrow();
    });

    it("renders oscilloscope and FFT waveforms onto canvas contexts across time windows", () => {
        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.toggle();

        // Oscilloscope with multiple time window sizes
        const windowSizes = ["50", "100", "200", "500"];
        for (const winSize of windowSizes) {
            mockDom.oscilloscopeWindowSelect.value = winSize;
            mockDom.oscilloscopeWindowSelect.dispatchEvent(new Event("change"));
            visualizer.runUiUpdate();
            expect(mockCanvasCtx.stroke).toHaveBeenCalled();
        }

        // FFT spectrum rendering
        mockDom.visualizerModeSelect.value = "fft";
        mockDom.visualizerModeSelect.dispatchEvent(new Event("change"));
        visualizer.runUiUpdate();
        expect(mockCanvasCtx.fillRect).toHaveBeenCalled();
    });

    it("handles clip tooltip interactions (mouseenter, mouseleave, focusin, focusout)", () => {
        createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        const target = mockDom.vuClipContainer || mockDom.vuClipIndicator;

        target.dispatchEvent(new Event("mouseenter"));
        expect(mockDom.vuClipTooltip.classList.contains("hidden")).toBe(false);

        target.dispatchEvent(new Event("mouseleave"));
        expect(mockDom.vuClipTooltip.classList.contains("hidden")).toBe(true);

        target.dispatchEvent(new Event("focusin"));
        expect(mockDom.vuClipTooltip.classList.contains("hidden")).toBe(false);

        target.dispatchEvent(new Event("focusout"));
        expect(mockDom.vuClipTooltip.classList.contains("hidden")).toBe(true);
    });

    it("displays -- dB when VU meter value is -Infinity or NaN", () => {
        mockAudio.meter.getValue = vi.fn(() => -Infinity);

        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.runUiUpdate();
        expect(mockDom.vuDbValue.textContent).toBe("-- dB");
    });

    it("toggles and closes info tooltip when clicked repeatedly or blurred", () => {
        createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        // First click opens
        mockDom.vuInfoButton.click();
        expect(mockDom.vuInfoTooltip.classList.contains("hidden")).toBe(false);

        // Second click closes
        mockDom.vuInfoButton.click();
        expect(mockDom.vuInfoTooltip.classList.contains("hidden")).toBe(true);

        // Focus and blur
        mockDom.vuInfoButton.dispatchEvent(new Event("focus"));
        expect(mockDom.vuInfoTooltip.classList.contains("hidden")).toBe(false);

        mockDom.vuInfoButton.dispatchEvent(new Event("blur"));
        expect(mockDom.vuInfoTooltip.classList.contains("hidden")).toBe(true);
    });

    it("switches visualizer modes while active during playback and stopped states", () => {
        mockState.isPlaying = true;

        const visualizer = createVisualizer({
            dom: mockDom,
            audio: mockAudio,
            state: mockState,
            actions: mockActions,
        });

        visualizer.toggle();

        // Switch to loopMap
        mockDom.visualizerModeSelect.value = "loopMap";
        mockDom.visualizerModeSelect.dispatchEvent(new Event("change"));

        // Switch back to oscilloscope with playback stopped
        mockState.isPlaying = false;
        mockDom.visualizerModeSelect.value = "oscilloscope";
        mockDom.visualizerModeSelect.dispatchEvent(new Event("change"));
        expect(visualizer.currentMode).toBe("oscilloscope");
    });

    it("runs manual note release decay timeout and toggles in loopMap mode", () => {
        vi.useFakeTimers();
        try {
            const visualizer = createVisualizer({
                dom: mockDom,
                audio: mockAudio,
                state: mockState,
                actions: mockActions,
            });

            visualizer.onManualNoteAttack("C4");
            visualizer.onManualNoteRelease("C4");
            vi.advanceTimersByTime(2000);

            // Toggle while in loopMap mode
            mockDom.visualizerModeSelect.value = "loopMap";
            visualizer.toggle();
            expect(visualizer.isVisualizerOn).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});
