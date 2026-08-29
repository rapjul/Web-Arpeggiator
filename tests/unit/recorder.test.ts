/**
 * @file Unit tests for Recorder Manager, real-time audio capture, and offline export coordination.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@core/audio-utils.js", () => ({
    audioBufferToMp3Blob: vi.fn(async () => new Blob(["MP3"], { type: "audio/mp3" })),
    audioBufferToWav: vi.fn(() => new Blob(["WAV"], { type: "audio/wav" })),
    downloadBlob: vi.fn(),
}));

vi.mock("tone", async (importOriginal) => {
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
            start() {}
            dispose() {}
        },
        getContext: () => ({
            decodeAudioData: async (_buf: any) => ({
                duration: 1.0,
                sampleRate: 44100,
                numberOfChannels: 2,
                getChannelData: () => new Float32Array(44100),
            }),
            rawContext: {
                createMediaStreamDestination: () => ({
                    stream: {},
                }),
                decodeAudioData: async (_buf: any) => ({
                    duration: 1.0,
                    sampleRate: 44100,
                    numberOfChannels: 2,
                    getChannelData: () => new Float32Array(44100),
                }),
            },
        }),
        now: () => 1.0,
        Time: (_t: string) => ({
            toSeconds: () => 0.125,
        }),
        Offline: vi.fn(async (cb: Function) => {
            const mockOfflineContext = {
                transport: {
                    bpm: { value: 120 },
                    swing: 0,
                    start: vi.fn(),
                    stop: vi.fn(),
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
    let mockDom: Record<string, any>;
    let mockAudio: Record<string, any>;
    let mockState: Record<string, any>;
    let mockActions: Record<string, any>;

    beforeEach(() => {
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
            },
            synths: {},
            createOfflineChain: vi.fn(() => ({
                offlineSynth: {
                    triggerAttack: vi.fn(),
                    triggerRelease: vi.fn(),
                },
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
            generateFilename: vi.fn((prefix) => `arp-${prefix}`),
            formatTime: vi.fn((sec) => `${sec}s`),
            startAudio: vi.fn(),
            startPlayback: vi.fn(),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("initializes recorder and attaches to audio graph", async () => {
        const manager = createRecorderManager({
            audio: mockAudio as any,
            dom: mockDom as any,
            state: mockState as any,
            actions: mockActions as any,
        });

        await manager.initRecorder();
        expect(mockAudio.reverb.connect).toHaveBeenCalled();
        expect(mockDom.recordStatus.textContent).toContain("Ready to record");
    });

    it("toggles recording state and updates button labels", async () => {
        const manager = createRecorderManager({
            audio: mockAudio as any,
            dom: mockDom as any,
            state: mockState as any,
            actions: mockActions as any,
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
            audio: mockAudio as any,
            dom: mockDom as any,
            state: mockState as any,
            actions: mockActions as any,
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
            audio: mockAudio as any,
            dom: mockDom as any,
            state: mockState as any,
            actions: mockActions as any,
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
            audio: mockAudio as any,
            dom: mockDom as any,
            state: mockState as any,
            actions: mockActions as any,
        });

        mockDom.offlineExportWavCheck.checked = true;
        mockDom.offlineExportMp3Check.checked = true;

        await manager.exportOffline();
        expect(mockAudio.createOfflineChain).toHaveBeenCalled();
        expect(mockActions.showToast).toHaveBeenCalledWith("Export complete!", "success");
    });

    it("validates offline export format selection and audio context state", async () => {
        const manager = createRecorderManager({
            audio: mockAudio as any,
            dom: mockDom as any,
            state: mockState as any,
            actions: mockActions as any,
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
});
