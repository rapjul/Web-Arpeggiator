/**
 * @file Unit tests for Visualizer module, mode switching, zoom handling, and canvas rendering.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("tone", async (importOriginal) => {
    return {
        Loop: class MockLoop {
            callback: Function;
            interval: string;
            isStarted = false;
            constructor(cb: Function, interval: string) {
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
        getContext: () => ({
            rawContext: {
                sampleRate: 44100,
            },
        }),
    };
});

import { createVisualizer } from "@ui/visualizer.js";

describe("Visualizer Module", () => {
    let mockDom: Record<string, any>;
    let mockAudio: Record<string, any>;
    let mockState: Record<string, any>;
    let mockActions: Record<string, any>;
    let mockCanvasCtx: Record<string, any>;

    beforeEach(() => {
        mockCanvasCtx = {
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
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
            canvas.getContext = vi.fn(() => mockCanvasCtx as any);
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
            },
            meter: {
                getValue: vi.fn(() => -12),
            },
            peakAnalyser: {
                getValue: vi.fn(() => mockFloatArray),
            },
        };

        mockState = {
            isRecording: false,
            recordingStartTime: 0,
            recordButton: createEl("button"),
            isPlaying: false,
            activeNote: null,
        };

        mockActions = {
            formatTime: vi.fn((sec) => `${sec}s`),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("initializes visualizer in disabled state by default", () => {
        const visualizer = createVisualizer({
            dom: mockDom as any,
            audio: mockAudio as any,
            state: mockState as any,
            actions: mockActions as any,
        });

        expect(visualizer.isVisualizerOn).toBe(false);
        expect(visualizer.currentMode).toBe("oscilloscope");
        expect(visualizer.isClipped).toBe(false);
    });

    it("toggles visualizer activation state and runs update loops", () => {
        const visualizer = createVisualizer({
            dom: mockDom as any,
            audio: mockAudio as any,
            state: mockState as any,
            actions: mockActions as any,
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
            dom: mockDom as any,
            audio: mockAudio as any,
            state: mockState as any,
            actions: mockActions as any,
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
        const visualizer = createVisualizer({
            dom: mockDom as any,
            audio: mockAudio as any,
            state: mockState as any,
            actions: mockActions as any,
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
            dom: mockDom as any,
            audio: mockAudio as any,
            state: mockState as any,
            actions: mockActions as any,
        });

        visualizer.toggle();

        mockDom.pauseVisualizerButton.click();
        expect(mockDom.pauseVisualizerButton.textContent).toBe("Resume");

        mockDom.pauseVisualizerButton.click();
        expect(mockDom.pauseVisualizerButton.textContent).toBe("Pause");
    });

    it("toggles and dismisses the VU meter info tooltip via keyboard and click", () => {
        createVisualizer({
            dom: mockDom as any,
            audio: mockAudio as any,
            state: mockState as any,
            actions: mockActions as any,
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
            dom: mockDom as any,
            audio: mockAudio as any,
            state: mockState as any,
            actions: mockActions as any,
        });

        mockDom.vuClipIndicator.click();
        expect(visualizer.isClipped).toBe(false);
    });

    it("handles manual keyboard note attack and release callbacks", () => {
        const visualizer = createVisualizer({
            dom: mockDom as any,
            audio: mockAudio as any,
            state: mockState as any,
            actions: mockActions as any,
        });

        expect(() => {
            visualizer.onManualNoteAttack("C4");
            visualizer.onManualNoteRelease("C4");
        }).not.toThrow();
    });

    it("updates static loop map buffer and markers and redraws when active", () => {
        const visualizer = createVisualizer({
            dom: mockDom as any,
            audio: mockAudio as any,
            state: mockState as any,
            actions: mockActions as any,
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
    });

    it("starts and stops UI loop lifecycles", () => {
        const visualizer = createVisualizer({
            dom: mockDom as any,
            audio: mockAudio as any,
            state: mockState as any,
            actions: mockActions as any,
        });

        expect(() => {
            visualizer.startUiLoop();
            visualizer.stopUiLoop();
        }).not.toThrow();
    });
});
