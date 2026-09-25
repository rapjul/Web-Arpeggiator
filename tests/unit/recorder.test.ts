/**
 * @file Unit tests for Recorder Manager, real-time audio capture, and offline export coordination.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let lastOfflinePatternValues: string[] = [];
let lastOfflineAttackTimes: number[] = [];
let lastOfflineRenderDuration = 0;
let lastOfflineTransportStopAt: number | null = null;
let lastSeamlessStartFrame = 0;
let lastSeamlessFrameCount = 0;
let recorderLifecycle: string[] = [];
let recorderStartPromise: Promise<void> | null = null;
let recorderStopPromise: Promise<void> | null = null;
let recorderStartError: Error | null = null;
let recorderStopError: Error | null = null;
let toneRecorderConstructorError: Error | null = null;
let mediaTrackStop = vi.fn();
let destinationStreamTracks: { stop: ReturnType<typeof vi.fn> }[] = [{ stop: mediaTrackStop }];
const recorderDispose = vi.fn(() => {
    recorderLifecycle.push("dispose");
});
let nativeMediaRecorder: FakeMediaRecorder | null = null;

class FakeMediaRecorder extends EventTarget {
    state: RecordingState = "inactive";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;

    constructor(_stream: MediaStream) {
        super();
        nativeMediaRecorder = this;
    }

    start() {
        this.state = "recording";
    }

    stop() {
        this.state = "inactive";
    }

    emitStart() {
        this.dispatchEvent(new Event("start"));
    }

    emitData(blob: Blob) {
        const event = Object.assign(new Event("dataavailable"), { data: blob }) as BlobEvent;
        this.ondataavailable?.(event);
        this.dispatchEvent(event);
    }

    emitError(error: Error) {
        const event = Object.assign(new Event("error"), { error });
        this.onerror?.(event);
        this.dispatchEvent(event);
    }

    emitStop() {
        const event = new Event("stop");
        this.onstop?.(event);
        this.dispatchEvent(event);
    }
}

vi.mock("@core/audio-utils.js", () => ({
    audioBufferToMp3Blob: vi.fn(async () => new Blob(["MP3"], { type: "audio/mp3" })),
    audioBufferToWav: vi.fn(() => new Blob(["WAV"], { type: "audio/wav" })),
    createSeamlessLoopAudioBuffer: vi.fn(
        (audioBuffer: AudioBuffer, startFrame: number, frameCount: number) => {
            lastSeamlessStartFrame = startFrame;
            lastSeamlessFrameCount = frameCount;
            return {
                ...audioBuffer,
                length: frameCount,
                duration: frameCount / audioBuffer.sampleRate,
            };
        },
    ),
    downloadBlob: vi.fn(),
}));

const mockContext = {
    sampleRate: 44100,
    decodeAudioData: vi.fn(async (_buf: ArrayBuffer) => ({
        duration: 1.0,
        sampleRate: 44100,
        numberOfChannels: 2,
        getChannelData: () => new Float32Array(44100),
    })),
    rawContext: {
        createMediaStreamDestination: () => ({
            connect: vi.fn(),
            disconnect: vi.fn(),
            stream: {
                getTracks: () => destinationStreamTracks,
            } as unknown as MediaStream,
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
            constructor() {
                if (toneRecorderConstructorError) throw toneRecorderConstructorError;
            }
            connect() {
                return this;
            }
            async start() {
                if (recorderStartPromise) await recorderStartPromise;
                if (recorderStartError) throw recorderStartError;
                this.state = "started";
                recorderLifecycle.push("recording-start");
            }
            async stop() {
                if (recorderStopPromise) await recorderStopPromise;
                if (recorderStopError) throw recorderStopError;
                this.state = "stopped";
                recorderLifecycle.push("recording-stop");
                return new Blob([new Uint8Array(2000)], { type: "audio/wav" });
            }
            dispose() {
                recorderDispose();
            }
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
            const frameCount = Math.ceil(duration * mockContext.sampleRate);
            return {
                get: () => ({
                    duration,
                    sampleRate: mockContext.sampleRate,
                    numberOfChannels: 2,
                    length: frameCount,
                    getChannelData: () => new Float32Array(frameCount),
                }),
            };
        }),
    };
});

import { createRecorderManager } from "@audio/recorder.js";
import {
    audioBufferToMp3Blob,
    audioBufferToWav,
    createSeamlessLoopAudioBuffer,
} from "@core/audio-utils.js";

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
        lastOfflineAttackTimes = [];
        lastOfflineRenderDuration = 0;
        lastOfflineTransportStopAt = null;
        lastSeamlessStartFrame = 0;
        lastSeamlessFrameCount = 0;
        recorderLifecycle = [];
        recorderStartPromise = null;
        recorderStopPromise = null;
        recorderStartError = null;
        recorderStopError = null;
        toneRecorderConstructorError = null;
        mediaTrackStop = vi.fn();
        destinationStreamTracks = [{ stop: mediaTrackStop }];
        nativeMediaRecorder = null;
        vi.clearAllMocks();
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
            recordingOutput: {
                connect: vi.fn(),
                disconnect: vi.fn(),
            } as unknown as RecorderAudio["recordingOutput"],
            synths: {} as unknown as RecorderAudio["synths"],
            createOfflineChain: vi.fn(() => ({
                offlineSynth: {
                    triggerAttack: vi.fn((note: string, time: number) => {
                        lastOfflinePatternValues.push(note);
                        lastOfflineAttackTimes.push(time);
                    }),
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
            startPlayback: vi.fn(async () => {
                recorderLifecycle.push("playback-start");
            }),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("initializes recorder and attaches to audio graph", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await manager.initRecorder();
        expect(mockAudio.recordingOutput.connect).toHaveBeenCalled();
        expect(mockDom.recordStatus.textContent).toContain("Ready to record");
    });

    it("initializes one recorder for concurrent initRecorder calls", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await Promise.all([manager.initRecorder(), manager.initRecorder()]);

        expect(mockAudio.recordingOutput.connect).toHaveBeenCalledOnce();
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
        expect(audioBufferToWav).toHaveBeenCalledWith(
            expect.objectContaining({ sampleRate: 44100 }),
        );
        expect(mockContext.decodeAudioData).toHaveBeenCalledTimes(1);
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

    it("extends a zero-tail render far enough to preserve the final swung gate", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        mockActions.getAllSettings = vi.fn(() => ({
            bpm: 120,
            swing: 1,
            notes: ["C4", "E4", "G4"],
            direction: "up",
            interval: "16n",
            gateRatio: 1,
            loopCount: 1,
            offlineExportMode: "tail",
            offlineExportTailSeconds: 0,
        }));

        await manager.exportOffline();

        expect(lastOfflineTransportStopAt).toBeCloseTo((400 + 120) / 480 / 2);
        expect(lastOfflineRenderDuration).toBeCloseTo((400 + 120) / 480 / 2);
    });

    it("rejects a seamless export that ends at a different swing phase", async () => {
        const Tone = await import("tone");
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        mockActions.getAllSettings = vi.fn(() => ({
            bpm: 120,
            swing: 1,
            notes: ["C4", "E4", "G4"],
            direction: "up",
            interval: "16n",
            gateRatio: 1,
            loopCount: 1,
            offlineExportMode: "seamless",
            envRelease: 1,
            delayMix: 0,
            reverbMix: 0,
            chorusMix: 0,
            autoPanMix: 0,
        }));

        await manager.exportOffline();

        expect(Tone.Offline).not.toHaveBeenCalled();
        expect(mockDom.offlineExportStatus.textContent).toContain(
            "Cannot generate a seamless loop with Swing",
        );
    });

    it("warms, crops, and exports seamless loops from one settings snapshot", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        const settings = {
            bpm: 120,
            swing: 0,
            notes: ["C4", "E4", "G4"],
            direction: "up",
            interval: "16n",
            gateRatio: 0.8,
            loopCount: 4,
            offlineExportMode: "seamless",
            offlineExportTailSeconds: 8,
            envRelease: 1,
            delayMix: 0.5,
            reverbMix: 0.5,
        };
        mockActions.getAllSettings = vi.fn(() => settings);
        mockDom.offlineExportWavCheck.checked = true;
        mockDom.offlineExportMp3Check.checked = true;

        await manager.exportOffline();

        expect(mockActions.getAllSettings).toHaveBeenCalledTimes(1);
        expect(mockActions.generateFilename).toHaveBeenCalledWith(false, settings, "audio");
        expect(lastOfflineRenderDuration).toBeCloseTo(6.75 + 1 / 44100);
        expect(lastOfflineTransportStopAt).toBe(6.75);
        expect(lastSeamlessStartFrame).toBe(231525);
        expect(lastSeamlessFrameCount).toBe(66150);
        expect(createSeamlessLoopAudioBuffer).toHaveBeenCalledTimes(1);
        expect(audioBufferToWav).toHaveBeenCalledWith(
            expect.objectContaining({ length: 66150 }),
            expect.objectContaining({
                schema: "web-arpeggiator.offline-export",
                version: 1,
                settings,
                pattern: expect.objectContaining({
                    scheduledNotes: ["C4", "E4", "G4"],
                    stepsPerLoop: 3,
                    renderedNotes: [
                        "C4",
                        "E4",
                        "G4",
                        "C4",
                        "E4",
                        "G4",
                        "C4",
                        "E4",
                        "G4",
                        "C4",
                        "E4",
                        "G4",
                    ],
                }),
                export: expect.objectContaining({
                    mode: "seamless",
                    loopCount: 4,
                    sampleRate: 44100,
                    channelCount: 2,
                    frameCount: 66150,
                }),
            }),
        );
        expect(audioBufferToMp3Blob).toHaveBeenCalledWith(
            expect.objectContaining({ length: 66150 }),
            expect.objectContaining({
                schema: "web-arpeggiator.offline-export",
                settings,
            }),
        );
    });

    it("rejects a short seamless render before PCM copying can pad it", async () => {
        const Tone = await import("tone");
        vi.mocked(Tone.Offline).mockResolvedValueOnce({
            get: () => ({
                duration: 0.375,
                sampleRate: 44100,
                numberOfChannels: 2,
                length: 16537,
                getChannelData: () => new Float32Array(16537),
            }),
        } as never);
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        mockActions.getAllSettings = vi.fn(() => ({
            bpm: 120,
            swing: 0,
            notes: ["C4", "E4", "G4"],
            direction: "up",
            interval: "16n",
            gateRatio: 0.8,
            loopCount: 1,
            offlineExportMode: "seamless",
            envRelease: 0,
            delayMix: 0,
            reverbMix: 0,
            chorusMix: 0,
            autoPanMix: 0,
        }));

        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await manager.exportOffline();

            expect(createSeamlessLoopAudioBuffer).not.toHaveBeenCalled();
            expect(audioBufferToWav).not.toHaveBeenCalled();
            expect(mockActions.showToast).toHaveBeenCalledWith("Offline render failed.", "error");
            expect(errorSpy).toHaveBeenCalledWith("Offline rendering failed:", expect.any(Error));
        } finally {
            errorSpy.mockRestore();
        }
    });

    it("rejects unaligned chorus and auto-pan before offline rendering", async () => {
        const Tone = await import("tone");
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        mockActions.getAllSettings = vi.fn(() => ({
            bpm: 120,
            swing: 0,
            notes: ["C4", "E4", "G4"],
            direction: "up",
            interval: "16n",
            gateRatio: 0.8,
            loopCount: 1,
            offlineExportMode: "seamless",
            envRelease: 0,
            delayMix: 0,
            reverbMix: 0,
            chorusMix: 0.5,
            autoPanMix: 0.5,
        }));

        await manager.exportOffline();

        expect(Tone.Offline).not.toHaveBeenCalled();
        expect(mockDom.offlineExportStatus.textContent).toContain(
            "Cannot generate a seamless loop with Chorus and Auto-pan",
        );
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
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const Tone = await import("tone");
        vi.spyOn(Tone, "Offline").mockRejectedValueOnce(new Error("Offline render crash"));
        try {
            await manager.exportOffline();
            expect(mockActions.showToast).toHaveBeenCalledWith("Offline render failed.", "error");
            expect(errorSpy).toHaveBeenCalledWith("Offline rendering failed:", expect.any(Error));
        } finally {
            errorSpy.mockRestore();
        }
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
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        manager.setRecorderBlob(testBlob);
        try {
            await manager.exportRealtime();
            expect(mockActions.showToast).toHaveBeenCalledWith("MP3 encoding failed.", "error");
            expect(errorSpy).toHaveBeenCalledWith("MP3 encoding failed:", expect.any(Error));
        } finally {
            errorSpy.mockRestore();
        }
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
        expect(recorderLifecycle.slice(0, 2)).toEqual(["recording-start", "playback-start"]);
        expect(manager.isRecording).toBe(true);

        // Stop recording
        await manager.toggleRecording();
        expect(manager.isRecording).toBe(false);
        expect(manager.recordingStartTime).toBeDefined();
    });

    it("waits for capture readiness before starting playback", async () => {
        let resolveStart: (() => void) | undefined;
        recorderStartPromise = new Promise((resolve) => {
            resolveStart = resolve;
        });
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const startRecording = manager.toggleRecording();
        await Promise.resolve();
        expect(mockActions.startPlayback).not.toHaveBeenCalled();

        resolveStart?.();
        await startRecording;
        expect(recorderLifecycle.slice(0, 2)).toEqual(["recording-start", "playback-start"]);
        expect(mockDom.recordButton.disabled).toBe(false);
    });

    it("hides previous export controls while replacement capture is pending", async () => {
        let resolveStart: () => void = () => {};
        recorderStartPromise = new Promise((resolve) => {
            resolveStart = resolve;
        });
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        manager.setRecorderBlob(new Blob([new Uint8Array(2048)]));
        mockDom.exportControls.classList.remove("hidden");

        const startPromise = manager.toggleRecording();
        await vi.waitFor(() => {
            expect(mockDom.exportControls.classList.contains("hidden")).toBe(true);
        });
        expect(manager.isStarting).toBe(true);
        expect(manager.isRecording).toBe(false);

        resolveStart();
        await startPromise;
        await manager.destroy();
    });

    it("keeps exports hidden when replacement capture startup fails", async () => {
        recorderStartError = new Error("replacement recorder failed");
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        manager.setRecorderBlob(new Blob([new Uint8Array(2048)]));
        mockDom.exportControls.classList.remove("hidden");

        await expect(manager.toggleRecording()).rejects.toThrow("replacement recorder failed");

        expect(mockDom.exportControls.classList.contains("hidden")).toBe(true);
        expect(mockActions.showToast).toHaveBeenCalledWith("Recording failed to start.", "error");
        await manager.exportRealtime();
        expect(mockActions.showToast).toHaveBeenCalledWith("No recording found.", "error");
        await manager.destroy();
    });

    it("ignores a second toggle while playback startup is still pending", async () => {
        let notifyPlaybackStarted = () => {};
        let resolvePlayback: () => void = () => {};
        const playbackStarted = new Promise<void>((resolve) => {
            notifyPlaybackStarted = resolve;
        });
        const playbackPending = new Promise<void>((resolve) => {
            resolvePlayback = resolve;
        });
        mockActions.startPlayback = vi.fn(async () => {
            notifyPlaybackStarted();
            await playbackPending;
        });

        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const startPromise = manager.toggleRecording();
        await playbackStarted;
        await manager.toggleRecording();

        expect(manager.isRecording).toBe(true);
        expect(recorderLifecycle).not.toContain("recording-stop");
        expect(mockActions.startPlayback).toHaveBeenCalledOnce();

        resolvePlayback();
        await startPromise;
        expect(mockDom.recordButton.disabled).toBe(false);
    });

    it("does not update recording UI after destroy during playback startup", async () => {
        let notifyPlaybackStarted = () => {};
        let resolvePlayback: () => void = () => {};
        const playbackStarted = new Promise<void>((resolve) => {
            notifyPlaybackStarted = resolve;
        });
        const playbackPending = new Promise<void>((resolve) => {
            resolvePlayback = resolve;
        });
        mockActions.startPlayback = vi.fn(async () => {
            notifyPlaybackStarted();
            await playbackPending;
        });

        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const startPromise = manager.toggleRecording();
        await playbackStarted;
        const destroyPromise = manager.destroy();
        resolvePlayback();
        await Promise.all([startPromise, destroyPromise]);

        expect(mockActions.startUiLoop).not.toHaveBeenCalled();
        expect(mockActions.startPlayback).toHaveBeenCalledOnce();
        expect(manager.isRecording).toBe(false);
        expect(recorderDispose).toHaveBeenCalled();
    });

    it("waits for native MediaRecorder readiness and stores its stopped capture", async () => {
        toneRecorderConstructorError = new Error("Tone.Recorder unavailable");
        vi.stubGlobal("isSecureContext", true);
        vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await manager.initRecorder();
        expect(mockDom.recordStatus.textContent).toContain("MediaRecorder");

        const startRecording = manager.toggleRecording();
        await Promise.resolve();
        expect(mockActions.startPlayback).not.toHaveBeenCalled();

        nativeMediaRecorder?.emitStart();
        await startRecording;
        expect(mockActions.startPlayback).toHaveBeenCalledOnce();

        const stopRecording = manager.toggleRecording();
        nativeMediaRecorder?.emitData(new Blob([new Uint8Array(2048)], { type: "audio/webm" }));
        nativeMediaRecorder?.emitStop();
        await stopRecording;

        expect(manager.isRecording).toBe(false);
        await manager.exportRealtime();
        expect(audioBufferToWav).toHaveBeenCalledOnce();
    });

    it("restores the idle UI when native MediaRecorder startup or stop fails", async () => {
        toneRecorderConstructorError = new Error("Tone.Recorder unavailable");
        vi.stubGlobal("isSecureContext", true);
        vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await manager.initRecorder();
        const failedStart = manager.toggleRecording();
        nativeMediaRecorder?.emitError(new Error("native start failed"));
        await expect(failedStart).rejects.toThrow("native start failed");
        expect(mockActions.startPlayback).not.toHaveBeenCalled();
        expect(mockDom.recordButton.textContent).toBe("Record");

        const successfulStart = manager.toggleRecording();
        await vi.waitFor(() => expect(nativeMediaRecorder?.state).toBe("recording"));
        nativeMediaRecorder?.emitStart();
        await successfulStart;

        const failedStop = manager.toggleRecording();
        nativeMediaRecorder?.emitError(new Error("native stop failed"));
        await expect(failedStop).rejects.toThrow("native stop failed");
        expect(manager.isRecording).toBe(false);
        expect(mockDom.recordButton.textContent).toBe("Record");
    });

    it("releases native recorder streams and ignores late events after teardown", async () => {
        toneRecorderConstructorError = new Error("Tone.Recorder unavailable");
        vi.stubGlobal("isSecureContext", true);
        vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await manager.initRecorder();
        await manager.destroy();
        expect(nativeMediaRecorder?.ondataavailable).toBeNull();
        expect(nativeMediaRecorder?.onstop).toBeNull();
        expect(nativeMediaRecorder?.onerror).toBeNull();
        nativeMediaRecorder?.emitData(new Blob([new Uint8Array(2048)], { type: "audio/webm" }));
        nativeMediaRecorder?.emitStop();
        await manager.exportRealtime();

        expect(mediaTrackStop).toHaveBeenCalledOnce();
        expect(mockAudio.recordingOutput.disconnect).toHaveBeenCalledOnce();
        expect(mockActions.showToast).not.toHaveBeenCalledWith("No recording found.", "error");
    });

    it("restores the idle UI when recorder startup fails", async () => {
        recorderStartError = new Error("recorder failed");
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await expect(manager.toggleRecording()).rejects.toThrow("recorder failed");
        expect(manager.isRecording).toBe(false);
        expect(mockActions.startPlayback).not.toHaveBeenCalled();
        expect(mockDom.recordButton.textContent).toBe("Record");
        expect(mockActions.showToast).toHaveBeenCalledWith("Recording failed to start.", "error");
    });

    it("preserves the playback failure when recorder cleanup also fails", async () => {
        const playbackError = new Error("playback failed");
        recorderStopError = new Error("stop failed");
        mockActions.startPlayback = vi.fn(async () => {
            throw playbackError;
        });
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await expect(manager.toggleRecording()).rejects.toBe(playbackError);
            expect(manager.isRecording).toBe(false);
            expect(mockDom.recordButton.textContent).toBe("Record");
            expect(warnSpy).toHaveBeenCalledWith(
                "Failed to stop recorder during recovery:",
                expect.any(Error),
            );
        } finally {
            warnSpy.mockRestore();
        }
    });

    it("releases decoded PCM after a successful export and retains it for retry", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        const testBlob = new Blob([new Uint8Array(2048)], { type: "audio/wav" });
        manager.setRecorderBlob(testBlob);
        mockDom.realtimeExportWavCheck.checked = false;
        mockDom.realtimeExportMp3Check.checked = true;
        vi.mocked(audioBufferToMp3Blob).mockRejectedValueOnce(new Error("encode failed"));

        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await manager.exportRealtime();
            await manager.exportRealtime();
            expect(mockContext.decodeAudioData).toHaveBeenCalledTimes(1);

            await manager.exportRealtime();
            expect(mockContext.decodeAudioData).toHaveBeenCalledTimes(2);
            expect(errorSpy).toHaveBeenCalledWith("MP3 encoding failed:", expect.any(Error));
        } finally {
            errorSpy.mockRestore();
        }
    });

    it("disposes recorder resources and clears retained recordings", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        await manager.initRecorder();
        manager.setRecorderBlob(new Blob([new Uint8Array(2048)], { type: "audio/wav" }));

        await manager.destroy();
        const toastCount = mockActions.showToast.mock.calls.length;
        await manager.exportRealtime();

        expect(recorderDispose).toHaveBeenCalledOnce();
        expect(mockActions.showToast).toHaveBeenCalledTimes(toastCount);
    });

    it("preserves a Tone recording when playback startup fails", async () => {
        mockActions.startPlayback = vi.fn(async () => {
            throw new Error("playback failed");
        });
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await expect(manager.toggleRecording()).rejects.toThrow("playback failed");
        expect(manager.isRecording).toBe(false);
        expect(mockDom.recordStatus.textContent).toBe(
            "Playback failed to start. Partial recording is ready to export.",
        );
        expect(mockActions.showToast).toHaveBeenCalledWith("Playback failed to start.", "error");

        mockDom.realtimeExportWavCheck.checked = true;
        await manager.exportRealtime();

        expect(audioBufferToWav).toHaveBeenCalled();
        expect(mockDom.recordStatus.textContent).toContain("Export complete");
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

    it("serializes destroy with an in-flight stop transition without duplicate stops", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await manager.toggleRecording();
        expect(manager.isRecording).toBe(true);

        let resolveStop: () => void = () => {};
        recorderStopPromise = new Promise((resolve) => {
            resolveStop = resolve;
        });

        const stopPromise = manager.toggleRecording();
        const destroyPromise = manager.destroy();

        resolveStop();
        await stopPromise;
        await destroyPromise;

        expect(recorderDispose).toHaveBeenCalled();
        expect(manager.isRecording).toBe(false);
        expect(recorderLifecycle.filter((entry) => entry === "recording-stop")).toHaveLength(1);
    });

    it("serializes destroy with an in-flight start transition and stops before disposal", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        let resolveStart: () => void = () => {};
        recorderStartPromise = new Promise((resolve) => {
            resolveStart = resolve;
        });

        const startPromise = manager.toggleRecording();
        const destroyPromise = manager.destroy();

        resolveStart();
        await startPromise;
        await destroyPromise;

        expect(recorderDispose).toHaveBeenCalled();
        expect(manager.isRecording).toBe(false);
        expect(recorderLifecycle.indexOf("recording-stop")).toBeLessThan(
            recorderLifecycle.indexOf("dispose"),
        );
    });

    it("handles unexpected mid-capture MediaRecorder errors without advertising export readiness", async () => {
        toneRecorderConstructorError = new Error("Tone.Recorder unavailable");
        const originalSecureContext = window.isSecureContext;
        const originalMediaRecorder = window.MediaRecorder;

        let instance: {
            ondataavailable: ((e: { data: Blob }) => void) | null;
            onstop: (() => void) | null;
            onerror: ((e: { error: Error }) => void) | null;
            start: ReturnType<typeof vi.fn>;
            stop: ReturnType<typeof vi.fn>;
            addEventListener: ReturnType<typeof vi.fn>;
            removeEventListener: ReturnType<typeof vi.fn>;
        } | null = null;

        class MockMediaRecorder {
            ondataavailable = null;
            onstop = null;
            onerror = null;
            start = vi.fn();
            stop = vi.fn();
            addEventListener = vi.fn((event: string, cb: () => void) => {
                if (event === "start") setTimeout(cb, 0);
            });
            removeEventListener = vi.fn();
            constructor() {
                instance = this;
            }
        }

        // @ts-expect-error mocking browser MediaRecorder
        window.MediaRecorder = MockMediaRecorder;
        window.isSecureContext = true;

        try {
            const manager = createRecorderManager({
                audio: mockAudio,
                dom: mockDom,
                state: mockState,
                actions: mockActions,
            });

            await manager.toggleRecording();
            expect(manager.isRecording).toBe(true);

            // Simulate unexpected runtime error mid-capture
            instance?.onerror?.({ error: new Error("Hardware device lost") });
            instance?.onstop?.();

            expect(manager.isRecording).toBe(false);
            expect(mockDom.exportControls.classList.contains("hidden")).toBe(true);
            expect(mockDom.recordStatus.textContent).toContain(
                "Recording failed: Hardware device lost",
            );
            expect(mockActions.showToast).toHaveBeenCalledWith("Recording failed.", "error");
        } finally {
            window.isSecureContext = originalSecureContext;
            window.MediaRecorder = originalMediaRecorder;
        }
    });

    it("does not announce ready to export when abortCapture cannot produce a blob", async () => {
        mockActions.startPlayback = vi.fn(async () => {
            throw new Error("transport startup failed");
        });
        recorderStopError = new Error("cleanup stop failed");

        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await expect(manager.toggleRecording()).rejects.toThrow("transport startup failed");
            expect(mockDom.exportControls.classList.contains("hidden")).toBe(true);
            expect(mockDom.recordButton.textContent).toBe("Record");
            expect(mockDom.recordStatus.textContent).not.toContain("Ready to export");
            expect(mockDom.recordStatus.textContent).toBe(
                "Playback failed to start. No recording was saved.",
            );
            expect(mockActions.showToast).toHaveBeenCalledWith(
                "Playback failed to start.",
                "error",
            );
            expect(warnSpy).toHaveBeenCalledWith(
                "Failed to stop recorder during recovery:",
                expect.any(Error),
            );
        } finally {
            warnSpy.mockRestore();
        }
    });

    it("stops all destination stream tracks when MediaRecorder construction throws", async () => {
        toneRecorderConstructorError = new Error("Tone.Recorder unavailable");
        const originalSecureContext = window.isSecureContext;
        const originalMediaRecorder = window.MediaRecorder;

        class ThrowingMediaRecorder {
            constructor() {
                throw new Error("MIME type not supported");
            }
        }

        // @ts-expect-error mocking MediaRecorder constructor failure
        window.MediaRecorder = ThrowingMediaRecorder;
        window.isSecureContext = true;

        try {
            const manager = createRecorderManager({
                audio: mockAudio,
                dom: mockDom,
                state: mockState,
                actions: mockActions,
            });

            await manager.initRecorder();
            expect(destinationStreamTracks[0].stop).toHaveBeenCalled();
            expect(mockDom.recordButton.disabled).toBe(true);
        } finally {
            window.isSecureContext = originalSecureContext;
            window.MediaRecorder = originalMediaRecorder;
        }
    });

    it("keeps record button disabled on unsupported platforms", async () => {
        toneRecorderConstructorError = new Error("Tone.Recorder unavailable");
        const originalSecureContext = window.isSecureContext;
        const originalMediaRecorder = window.MediaRecorder;

        window.isSecureContext = false;
        // @ts-expect-error simulating missing MediaRecorder
        window.MediaRecorder = undefined;

        try {
            const manager = createRecorderManager({
                audio: mockAudio,
                dom: mockDom,
                state: mockState,
                actions: mockActions,
            });

            await manager.toggleRecording();
            expect(mockDom.recordButton.disabled).toBe(true);
            expect(mockDom.recordStatus.textContent).toBe(
                "Recording not available on this device.",
            );
        } finally {
            window.isSecureContext = originalSecureContext;
            window.MediaRecorder = originalMediaRecorder;
        }
    });

    it("disables Record button and blocks recording transitions during active real-time export", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const testBlob = new Blob([new Uint8Array(2048)], { type: "audio/wav" });
        manager.setRecorderBlob(testBlob);
        mockDom.realtimeExportWavCheck.checked = true;
        mockDom.realtimeExportMp3Check.checked = false;

        let exportResolve: () => void = () => {};
        vi.mocked(mockContext.decodeAudioData).mockImplementationOnce(async () => {
            await new Promise<void>((resolve) => {
                exportResolve = resolve;
            });
            return {
                duration: 1.0,
                sampleRate: 44100,
                numberOfChannels: 2,
                getChannelData: () => new Float32Array(44100),
            } as unknown as AudioBuffer;
        });

        const exportPromise = manager.exportRealtime();
        expect(mockDom.recordButton.disabled).toBe(true);

        // Attempting to record during active export must be ignored
        await manager.toggleRecording();
        expect(manager.isRecording).toBe(false);

        exportResolve();
        await exportPromise;
        expect(mockDom.recordButton.disabled).toBe(false);
    });

    it("waits for an active real-time export before destruction without stale UI updates", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        const { downloadBlob } = await import("@core/audio-utils.js");
        manager.setRecorderBlob(new Blob([new Uint8Array(2048)], { type: "audio/wav" }));
        mockDom.realtimeExportWavCheck.checked = true;
        mockDom.realtimeExportMp3Check.checked = false;

        let resolveDecode: (buffer: AudioBuffer) => void = () => {};
        vi.mocked(mockContext.decodeAudioData).mockImplementationOnce(
            async () =>
                await new Promise<AudioBuffer>((resolve) => {
                    resolveDecode = resolve;
                }),
        );

        const exportPromise = manager.exportRealtime();
        expect(mockDom.recordStatus.textContent).toBe("Exporting WAV...");
        expect(mockDom.exportButton.disabled).toBe(true);

        let destroyFinished = false;
        const destroyPromise = manager.destroy().then(() => {
            destroyFinished = true;
        });
        let repeatedDestroyFinished = false;
        const repeatedDestroyPromise = manager.destroy().then(() => {
            repeatedDestroyFinished = true;
        });
        await Promise.resolve();
        expect(destroyFinished).toBe(false);
        expect(repeatedDestroyFinished).toBe(false);

        resolveDecode({
            duration: 1.0,
            sampleRate: 44100,
            numberOfChannels: 2,
            getChannelData: () => new Float32Array(44100),
        } as unknown as AudioBuffer);
        await Promise.all([exportPromise, destroyPromise, repeatedDestroyPromise]);

        expect(downloadBlob).toHaveBeenCalledOnce();
        expect(destroyFinished).toBe(true);
        expect(repeatedDestroyFinished).toBe(true);
        expect(mockDom.recordStatus.textContent).toBe("Exporting WAV...");
        expect(mockDom.exportButton.disabled).toBe(true);
        expect(mockActions.showToast).toHaveBeenCalledOnce();
    });

    it("disposes and resets backend when stopCapture rejects during toggleRecording", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        await manager.toggleRecording();
        expect(manager.isRecording).toBe(true);

        recorderStopError = new Error("stop capture failure");
        await expect(manager.toggleRecording()).rejects.toThrow("stop capture failure");

        expect(recorderDispose).toHaveBeenCalled();
        expect(manager.isRecording).toBe(false);
        expect(mockDom.recordStatus.textContent).toContain("Recording failed to stop");
    });

    it("detaches native recorder handlers before resetting a failed backend", async () => {
        toneRecorderConstructorError = new Error("Tone.Recorder unavailable");
        const originalSecureContext = window.isSecureContext;
        const originalMediaRecorder = window.MediaRecorder;

        type MockMediaRecorderInstance = {
            ondataavailable: ((event: { data: Blob }) => void) | null;
            onstop: (() => void) | null;
            onerror: ((event: { error: Error }) => void) | null;
            start: ReturnType<typeof vi.fn>;
            stop: ReturnType<typeof vi.fn>;
            addEventListener: ReturnType<typeof vi.fn>;
            removeEventListener: ReturnType<typeof vi.fn>;
            emitLateEvents: () => void;
        };
        const instances: MockMediaRecorderInstance[] = [];

        class MockMediaRecorder {
            ondataavailable: MockMediaRecorderInstance["ondataavailable"] = null;
            onstop: MockMediaRecorderInstance["onstop"] = null;
            onerror: MockMediaRecorderInstance["onerror"] = null;
            start = vi.fn();
            stop = vi.fn(() => {
                if (this === instances[0]) throw new Error("native stop failed");
                this.onstop?.();
            });
            addEventListener = vi.fn((event: string, callback: () => void) => {
                if (event === "start") setTimeout(callback, 0);
            });
            removeEventListener = vi.fn();
            constructor() {
                instances.push(this);
            }
            emitLateEvents() {
                this.ondataavailable?.({ data: new Blob(["late data"]) });
                this.onerror?.({ error: new Error("late recorder error") });
                this.onstop?.();
            }
        }

        // @ts-expect-error mocking browser MediaRecorder
        window.MediaRecorder = MockMediaRecorder;
        window.isSecureContext = true;

        try {
            const manager = createRecorderManager({
                audio: mockAudio,
                dom: mockDom,
                state: mockState,
                actions: mockActions,
            });

            await manager.toggleRecording();
            const failedRecorder = instances[0];
            await expect(manager.toggleRecording()).rejects.toThrow("native stop failed");

            expect(failedRecorder.ondataavailable).toBeNull();
            expect(failedRecorder.onstop).toBeNull();
            expect(failedRecorder.onerror).toBeNull();
            const failedStatus = mockDom.recordStatus.textContent;
            failedRecorder.emitLateEvents();
            expect(mockDom.recordStatus.textContent).toBe(failedStatus);
            expect(manager.isRecording).toBe(false);

            await manager.toggleRecording();
            expect(instances).toHaveLength(2);
            expect(manager.isRecording).toBe(true);
            const recordingStatus = mockDom.recordStatus.textContent;
            failedRecorder.emitLateEvents();
            expect(mockDom.recordStatus.textContent).toBe(recordingStatus);
            expect(manager.isRecording).toBe(true);

            await manager.toggleRecording();
            expect(mockDom.exportControls.classList.contains("hidden")).toBe(false);
            await manager.destroy();
        } finally {
            window.isSecureContext = originalSecureContext;
            window.MediaRecorder = originalMediaRecorder;
        }
    });

    it("resets a native backend after capture startup fails so the next take can succeed", async () => {
        toneRecorderConstructorError = new Error("Tone.Recorder unavailable");
        const originalSecureContext = window.isSecureContext;
        const originalMediaRecorder = window.MediaRecorder;

        type NativeEvent = { error?: Error };
        type EventListener = (event?: NativeEvent) => void;
        type MockMediaRecorderInstance = {
            ondataavailable: ((event: { data: Blob }) => void) | null;
            onstop: (() => void) | null;
            onerror: ((event: { error: Error }) => void) | null;
            start: ReturnType<typeof vi.fn>;
            stop: ReturnType<typeof vi.fn>;
            addEventListener: ReturnType<typeof vi.fn>;
            removeEventListener: ReturnType<typeof vi.fn>;
            dispatch: (event: string, detail?: NativeEvent) => void;
        };
        const instances: MockMediaRecorderInstance[] = [];

        class MockMediaRecorder {
            ondataavailable: MockMediaRecorderInstance["ondataavailable"] = null;
            onstop: MockMediaRecorderInstance["onstop"] = null;
            onerror: MockMediaRecorderInstance["onerror"] = null;
            listeners: Record<string, EventListener[]> = {};
            start = vi.fn(() => {
                if (this === instances[0] && this.start.mock.calls.length === 1) {
                    const event = { error: new Error("native start failed") };
                    this.onerror?.(event);
                    this.dispatch("error", event);
                    return;
                }
                this.dispatch("start");
            });
            stop = vi.fn(() => {
                this.onstop?.();
            });
            addEventListener = vi.fn((event: string, listener: EventListener) => {
                this.listeners[event] ??= [];
                this.listeners[event].push(listener);
            });
            removeEventListener = vi.fn((event: string, listener: EventListener) => {
                this.listeners[event] = (this.listeners[event] ?? []).filter(
                    (registeredListener) => registeredListener !== listener,
                );
            });
            constructor() {
                instances.push(this);
            }
            dispatch(event: string, detail: NativeEvent = {}) {
                this.listeners[event]?.forEach((listener) => {
                    listener(detail);
                });
            }
        }

        // @ts-expect-error mocking browser MediaRecorder
        window.MediaRecorder = MockMediaRecorder;
        window.isSecureContext = true;

        try {
            const manager = createRecorderManager({
                audio: mockAudio,
                dom: mockDom,
                state: mockState,
                actions: mockActions,
            });

            await expect(manager.toggleRecording()).rejects.toThrow("native start failed");
            expect(instances).toHaveLength(1);
            expect(instances[0].onerror).toBeNull();
            expect(mockActions.showToast).toHaveBeenCalledWith(
                "Recording failed to start.",
                "error",
            );
            expect(mockActions.showToast).not.toHaveBeenCalledWith("Recording failed.", "error");

            await manager.toggleRecording();
            expect(instances).toHaveLength(2);
            expect(manager.isRecording).toBe(true);
            await manager.toggleRecording();

            expect(manager.isRecording).toBe(false);
            expect(mockDom.recordStatus.textContent).toContain("Ready to export");
            expect(mockActions.showToast).not.toHaveBeenCalledWith(
                "Recording failed to stop.",
                "error",
            );
            await manager.destroy();
        } finally {
            window.isSecureContext = originalSecureContext;
            window.MediaRecorder = originalMediaRecorder;
        }
    });

    it("handles WAV encoding errors during realtime export gracefully and re-enables export button", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const { audioBufferToWav } = await import("@core/audio-utils.js");
        vi.mocked(audioBufferToWav).mockImplementationOnce(() => {
            throw new Error("WAV encoding crashed");
        });

        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        manager.setRecorderBlob(new Blob([new Uint8Array(2000)]));
        mockDom.realtimeExportWavCheck.checked = true;
        mockDom.realtimeExportMp3Check.checked = false;
        mockDom.exportButton.disabled = true;

        try {
            await manager.exportRealtime();
            expect(errorSpy).toHaveBeenCalledWith("WAV encoding failed:", expect.any(Error));
            expect(mockDom.exportButton.disabled).toBe(false);
            expect(mockDom.exportButton.textContent).toBe("Export Files");
            expect(mockActions.showToast).toHaveBeenCalledWith("WAV encoding failed.", "error");
        } finally {
            errorSpy.mockRestore();
        }
    });

    it("handles MP3 encoding errors during realtime export gracefully", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const { audioBufferToMp3Blob } = await import("@core/audio-utils.js");
        vi.mocked(audioBufferToMp3Blob).mockRejectedValueOnce(new Error("MP3 failed"));

        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        manager.setRecorderBlob(new Blob([new Uint8Array(2000)]));
        mockDom.realtimeExportWavCheck.checked = false;
        mockDom.realtimeExportMp3Check.checked = true;

        try {
            await manager.exportRealtime();
            expect(errorSpy).toHaveBeenCalledWith("MP3 encoding failed:", expect.any(Error));
            expect(mockDom.recordStatus.textContent).toContain("MP3 encoding failed. See console.");
            expect(mockActions.showToast).toHaveBeenCalledWith("MP3 encoding failed.", "error");
        } finally {
            errorSpy.mockRestore();
        }
    });

    it("stops started backend when destroy is called during start transition", async () => {
        let resolveStart: () => void = () => {};
        recorderStartPromise = new Promise<void>((resolve) => {
            resolveStart = resolve;
        });

        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const togglePromise = manager.toggleRecording();
        const destroyPromise = manager.destroy();

        resolveStart();
        await togglePromise;
        await destroyPromise;

        expect(recorderLifecycle).toContain("recording-start");
        expect(recorderLifecycle).toContain("recording-stop");
        expect(recorderDispose).toHaveBeenCalled();
        expect(manager.isRecording).toBe(false);
    });

    it("resets and disposes backend when stopCapture fails during abortCapture recovery", async () => {
        mockActions.startPlayback = vi.fn(async () => {
            throw new Error("playback failure");
        });
        recorderStopError = new Error("recovery stop failure");

        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await expect(manager.toggleRecording()).rejects.toThrow("playback failure");

            expect(recorderDispose).toHaveBeenCalled();
            expect(manager.isRecording).toBe(false);
            expect(mockDom.exportControls.classList.contains("hidden")).toBe(true);
            expect(mockDom.recordButton.textContent).toBe("Record");
            expect(warnSpy).toHaveBeenCalledWith(
                "Failed to stop recorder during recovery:",
                expect.any(Error),
            );
        } finally {
            warnSpy.mockRestore();
        }
    });

    it("retains decoded PCM for retry when WAV export fails", async () => {
        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });
        const testBlob = new Blob([new Uint8Array(2048)], { type: "audio/wav" });
        manager.setRecorderBlob(testBlob);
        mockDom.realtimeExportWavCheck.checked = true;
        mockDom.realtimeExportMp3Check.checked = false;
        vi.mocked(audioBufferToWav).mockImplementationOnce(() => {
            throw new Error("wav encode failed");
        });

        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await manager.exportRealtime();
            expect(mockContext.decodeAudioData).toHaveBeenCalledTimes(1);

            // Retrying must reuse the cached decoded buffer without decoding again
            await manager.exportRealtime();
            expect(mockContext.decodeAudioData).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledWith("WAV encoding failed:", expect.any(Error));
        } finally {
            errorSpy.mockRestore();
        }
    });

    it("stops all destination stream tracks when graph connection throws during native init", async () => {
        toneRecorderConstructorError = new Error("Tone.Recorder unavailable");
        const originalSecureContext = window.isSecureContext;
        const originalMediaRecorder = window.MediaRecorder;

        const failingAudio = {
            ...mockAudio,
            recordingOutput: {
                connect: vi.fn(() => {
                    throw new Error("graph connection failure");
                }),
            },
        };

        class MockMediaRecorder {
            addEventListener = vi.fn();
            removeEventListener = vi.fn();
        }

        // @ts-expect-error mocking MediaRecorder
        window.MediaRecorder = MockMediaRecorder;
        window.isSecureContext = true;

        try {
            const manager = createRecorderManager({
                audio: failingAudio,
                dom: mockDom,
                state: mockState,
                actions: mockActions,
            });

            await manager.initRecorder();
            expect(destinationStreamTracks[0].stop).toHaveBeenCalled();
            expect(mockDom.recordButton.disabled).toBe(true);
        } finally {
            window.isSecureContext = originalSecureContext;
            window.MediaRecorder = originalMediaRecorder;
        }
    });

    it("exposes isStarting and awaitPendingTransition for transport coordination", async () => {
        let resolveStart: () => void = () => {};
        recorderStartPromise = new Promise<void>((resolve) => {
            resolveStart = resolve;
        });

        const manager = createRecorderManager({
            audio: mockAudio,
            dom: mockDom,
            state: mockState,
            actions: mockActions,
        });

        const togglePromise = manager.toggleRecording();
        expect(manager.isStarting).toBe(true);

        let transitionFinished = false;
        const awaitPromise = manager.awaitPendingTransition().then(() => {
            transitionFinished = true;
        });

        expect(transitionFinished).toBe(false);
        resolveStart();
        await togglePromise;
        await awaitPromise;

        expect(transitionFinished).toBe(true);
        expect(manager.isStarting).toBe(false);
        expect(manager.isRecording).toBe(true);
    });
});
