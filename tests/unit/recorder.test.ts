/**
 * @file Unit tests for Recorder Manager, real-time audio capture, and offline export coordination.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let lastOfflinePatternValues: string[] = [];
let lastOfflineRenderDuration = 0;
let lastOfflineTransportStopAt: number | null = null;

vi.mock("@core/audio-utils.js", () => ({
    audioBufferToMp3Blob: vi.fn(async () => new Blob(["MP3"], { type: "audio/mp3" })),
    audioBufferToWav: vi.fn(() => new Blob(["WAV"], { type: "audio/wav" })),
    downloadBlob: vi.fn(),
}));

const mockContext = {
    decodeAudioData: vi.fn(async (_buf: ArrayBuffer) => ({
        duration: 1.0,
        sampleRate: 44100,
        numberOfChannels: 2,
        getChannelData: () => new Float32Array(44100),
    })),
    rawContext: {
        createMediaStreamDestination: () => ({
            stream: {} as MediaStream,
        }),
        decodeAudioData: async (_buf: ArrayBuffer) => ({
            duration: 1.0,
            sampleRate: 44100,
            numberOfChannels: 2,
            getChannelData: () => new Float32Array(44100),
        }),
    },
};

vi.mock("tone", async () => {
    return {
        Recorder: class MockRecorder {
            state = "stopped";
            connect() {
                return this;
            }
            start() {
                this.state = "started";
            }
            async stop() {
                this.state = "stopped";
                return new Blob([new Uint8Array(2000)], { type: "audio/wav" });
            }
            dispose() {}
        },
        Pattern: class MockPattern {
            interval = "16n";
            constructor(
                _callback: (time: number, note: string) => void,
                values: string[],
                _pattern: string,
            ) {
                lastOfflinePatternValues = values;
            }
            start() {}
            dispose() {}
        },
        getContext: () => mockContext,
        now: () => 1.0,
        Time: (_t: string) => ({
            toSeconds: () => 0.125,
        }),
        Offline: vi.fn(async (cb: (ctx: unknown) => Promise<void>, duration: number) => {
            lastOfflineRenderDuration = duration;
            const mockOfflineContext = {
                transport: {
                    bpm: { value: 120 },
                    swing: 0,
                    start: vi.fn(),
                    stop: vi.fn((time: number) => {
                        lastOfflineTransportStopAt = time;
                    }),
                },
            };
            await cb(mockOfflineContext);
            return {
                get: () => ({
                    duration: 1.0,
                    sampleRate: 44100,
                    numberOfChannels: 2,
                    getChannelData: () => new Float32Array(44100),
                }),
            };
        }),
    };
});

import { createRecorderManager } from "@audio/recorder.js";

describe("Recorder Manager Module", () => {
    type RecorderContext = Parameters<typeof createRecorderManager>[0];
    type RecorderAudio = RecorderContext["audio"];
    type RecorderDom = RecorderContext["dom"];
    type RecorderState = RecorderContext["state"];
    type RecorderActions = RecorderContext["actions"];

    let mockDom: RecorderDom;
    let mockAudio: RecorderAudio;
    let mockState: RecorderState;
    let mockActions: RecorderActions;

    beforeEach(() => {
        lastOfflinePatternValues = [];
        lastOfflineRenderDuration = 0;
        lastOfflineTransportStopAt = null;
        const createEl = (tag = "div") => document.createElement(tag);
        mockDom = {
            recordButton: createEl("button"),
            recordStatus: createEl(),
            exportControls: createEl(),
            realtimeExportWavCheck: Object.assign(createEl("input"), { checked: true }),
            realtimeExportMp3Check: Object.assign(createEl("input"), { checked: false }),
            exportButton: createEl("button"),
            offlineExportWavCheck: Object.assign(createEl("input"), { checked: true }),
            offlineExportMp3Check: Object.assign(createEl("input"), { checked: false }),
            offlineExportButton: createEl("button"),
            offlineExportStatus: createEl(),
            loopCountInput: Object.assign(createEl("input"), { value: "2" }),
            envAttackSlider: Object.assign(createEl("input"), { value: "0.01" }),
            envDecaySlider: Object.assign(createEl("input"), { value: "0.1" }),
            envSustainSlider: Object.assign(createEl("input"), { value: "0.5" }),
            envReleaseSlider: Object.assign(createEl("input"), { value: "1.0" }),
        };

        mockAudio = {
            reverb: {
                connect: vi.fn(),
            } as unknown as RecorderAudio["reverb"],
            synths: {} as unknown as RecorderAudio["synths"],
            createOfflineChain: vi.fn(() => ({
                offlineSynth: {
                    triggerAttack: vi.fn(),
                    triggerRelease: vi.fn(),
                } as unknown as ReturnType<RecorderAudio["createOfflineChain"]>["offlineSynth"],
            })),
        };

        mockState = {
            isAudioContextStarted: true,
            isPlaying: false,
        };

        mockActions = {
            showToast: vi.fn(),
            startUiLoop: vi.fn(),
            stopUiLoop: vi.fn(),
            getAllSettings: vi.fn(() => ({
                bpm: 120,
                swing: 0,
                notes: ["C4", "E4", "G4"],
                direction: "upDownRepeat",
                interval: "16n",
                gateRatio: 0.8,
                loopCount: 2,
            })),
            generateFilename: vi.fn((prefix: string) => `arp-${prefix}`),
            formatTime: vi.fn((sec: number) => `${sec}s`),
            startAudio: vi.fn(),
            startPlayback: vi.fn(),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("initializes recorder and attaches to audio graph", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await manager.initRecorder();
        expect(mockAudio.reverb.connect).toHaveBeenCalled();
        expect(mockDom.recordStatus.textContent).toContain("Ready to record");
    });

    it("toggles recording state and updates button labels", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await manager.initRecorder();

        // Start recording
        await manager.toggleRecording();
        expect(manager.isRecording).toBe(true);
        expect(mockDom.recordButton.textContent).toContain("Stop Recording");

        // Stop recording
        await manager.toggleRecording();
        expect(manager.isRecording).toBe(false);
        expect(mockDom.recordButton.textContent).toBe("Record");
    });

    it("exports real-time recording to WAV and MP3 formats", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const testBlob = new Blob([new Uint8Array(2048)], { type: "audio/wav" });
        manager.setRecorderBlob(testBlob);

        // Both WAV and MP3
        mockDom.realtimeExportWavCheck.checked = true;
        mockDom.realtimeExportMp3Check.checked = true;

        await manager.exportRealtime();
        expect(mockActions.showToast).toHaveBeenCalledWith("Exported MP3 file!", "success");
    });

    it("handles real-time export validation errors", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        // No blob
        await manager.exportRealtime();
        expect(mockActions.showToast).toHaveBeenCalledWith("No recording found.", "error");

        // Blob too small
        manager.setRecorderBlob(new Blob(["tiny"]));
        await manager.exportRealtime();
        expect(mockActions.showToast).toHaveBeenCalledWith(
            "Recording failed! No audio was captured.",
            "error",
        );

        // No format selected
        manager.setRecorderBlob(new Blob([new Uint8Array(2000)]));
        mockDom.realtimeExportWavCheck.checked = false;
        mockDom.realtimeExportMp3Check.checked = false;
        await manager.exportRealtime();
        expect(mockDom.recordStatus.textContent).toContain("Please select at least one format");
    });

    it("renders and exports offline perfect loops in both WAV and MP3 formats", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        mockDom.offlineExportWavCheck.checked = true;
        mockDom.offlineExportMp3Check.checked = true;

        await manager.exportOffline();
        expect(mockAudio.createOfflineChain).toHaveBeenCalled();
        expect(mockActions.showToast).toHaveBeenCalledWith("Export complete!", "success");
    });

    it("renders with the selected BPM instead of the live Tone time conversion", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        mockActions.getAllSettings = vi.fn(() => ({
            bpm: 60,
            swing: 0,
            notes: ["C4", "E4", "G4"],
            direction: "up",
            interval: "16n",
            gateRatio: 0.8,
            loopCount: -1,
        }));

        await manager.exportOffline();

        expect(lastOfflineRenderDuration).toBe(2.75);
        expect(lastOfflineTransportStopAt).toBe(0.75);
    });

    it("uses the same quantized pitches as live playback and MIDI export", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        mockActions.getAllSettings = vi.fn(() => ({
            bpm: 120,
            swing: 0,
            baseNotes: ["C4", "D#4", "G#4"],
            notes: ["C4", "D#4", "G#4"],
            direction: "up",
            interval: "16n",
            gateRatio: 0.8,
            loopCount: 1,
            octaveRange: 1,
            octaveShift: 0,
            scaleQuantize: true,
            scaleRoot: "C",
            scaleType: "major",
        }));

        await manager.exportOffline();

        expect(lastOfflinePatternValues).toEqual(["C4", "D4", "G4"]);
    });

    it("validates offline export format selection and audio context state", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        // No formats selected
        mockDom.offlineExportWavCheck.checked = false;
        mockDom.offlineExportMp3Check.checked = false;
        await manager.exportOffline();
        expect(mockDom.offlineExportStatus.textContent).toContain(
            "Please select at least one format",
        );

        // Audio context not started
        mockDom.offlineExportWavCheck.checked = true;
        mockState.isAudioContextStarted = false;
        await manager.exportOffline();
        expect(mockActions.showToast).toHaveBeenCalledWith(
            "Please start audio playback first.",
            "error",
        );
    });

    it("renders offline loops with various pattern directions (upDown, downUp, downUpRepeat)", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        mockDom.offlineExportWavCheck.checked = true;
        mockDom.offlineExportMp3Check.checked = false;

        const directions = ["upDown", "downUp", "downUpRepeat", "up"];
        for (const direction of directions) {
            mockActions.getAllSettings = vi.fn(() => ({
                bpm: 120,
                swing: 0,
                notes: ["C4", "E4", "G4"],
                direction,
                interval: "16n",
                gateRatio: 0.8,
                loopCount: 1,
            }));

            await manager.exportOffline();
            expect(mockActions.showToast).toHaveBeenCalledWith("Export complete!", "success");
        }
    });

    it("handles offline export with only MP3 format selected and handles render errors", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        mockDom.offlineExportWavCheck.checked = false;
        mockDom.offlineExportMp3Check.checked = true;

        await manager.exportOffline();
        expect(mockActions.showToast).toHaveBeenCalledWith("Export complete!", "success");

        // Error during offline render
        const Tone = await import("tone");
        vi.spyOn(Tone, "Offline").mockRejectedValueOnce(new Error("Offline render crash"));
        await manager.exportOffline();
        expect(mockActions.showToast).toHaveBeenCalledWith("Offline render failed.", "error");
    });

    it("handles real-time export with only WAV format selected and decode failures", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const testBlob = new Blob([new Uint8Array(2048)], { type: "audio/wav" });
        manager.setRecorderBlob(testBlob);

        // WAV only
        mockDom.realtimeExportWavCheck.checked = true;
        mockDom.realtimeExportMp3Check.checked = false;
        await manager.exportRealtime();
        expect(mockActions.showToast).toHaveBeenCalledWith("Export complete!", "success");

        // MP3 decode failure
        mockActions.showToast.mockClear();
        mockDom.realtimeExportWavCheck.checked = false;
        mockDom.realtimeExportMp3Check.checked = true;
        const Tone = await import("tone");
        vi.spyOn(Tone.getContext(), "decodeAudioData").mockRejectedValueOnce(
            new Error("Decode failed"),
        );
        await manager.exportRealtime();
        expect(mockActions.showToast).toHaveBeenCalledWith("MP3 encoding failed.", "error");
    });

    it("auto-starts audio and playback when recording begins from stopped state", async () => {
        mockState.isAudioContextStarted = false;
        mockState.isPlaying = false;

        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await manager.toggleRecording();
        expect(mockActions.startAudio).toHaveBeenCalled();
        expect(mockActions.startPlayback).toHaveBeenCalled();
        expect(manager.isRecording).toBe(true);

        // Stop recording
        await manager.toggleRecording();
        expect(manager.isRecording).toBe(false);
        expect(manager.recordingStartTime).toBeDefined();
    });

    it("handles short audio buffers in offline export", async () => {
        const Tone = await import("tone");
        // @ts-expect-error mocking Offline return
        Tone.Offline = vi.fn(async () => ({
            length: 100, // < 1000
            duration: 0.01,
            sampleRate: 44100,
            numberOfChannels: 2,
            getChannelData: () => new Float32Array(100),
        }));

        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        mockDom.offlineExportWavCheck.checked = true;
        await manager.exportOffline();
        expect(mockActions.showToast).toHaveBeenCalledWith(
            "Offline generation failed! No audio was created.",
            "error",
        );
    });
});
