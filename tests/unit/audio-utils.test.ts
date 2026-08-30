/**
 * @file Unit tests for audio utilities, PCM conversion, WAV creation, and MP3 exports.
 */

import { describe, expect, it, vi } from "vitest";
import {
    audioBufferToMp3Blob,
    audioBufferToWav,
    downloadBlob,
    fetchWithBackoff,
    float32ToInt16,
    interleave,
    loadLameJs,
    triggerIdleLoad,
    writeString,
} from "@core/audio-utils.js";

describe("Audio Utils Domain Module", () => {
    describe("PCM and WAV Operations", () => {
        it("converts Float32Array PCM samples to signed 16-bit integers", () => {
            const float32 = new Float32Array([0.0, 1.0, -1.0, 0.5, -0.5]);
            const int16 = float32ToInt16(float32);

            expect(int16[0]).toBe(0);
            expect(int16[1]).toBe(32767);
            expect(int16[2]).toBe(-32768);
            expect(int16[3]).toBe(16383);
            expect(int16[4]).toBe(-16384);
        });

        it("clamps out-of-range Float32Array samples safely", () => {
            const float32 = new Float32Array([1.5, -1.5, 2.0, -3.0]);
            const int16 = float32ToInt16(float32);

            expect(int16[0]).toBe(32767);
            expect(int16[1]).toBe(-32768);
            expect(int16[2]).toBe(32767);
            expect(int16[3]).toBe(-32768);
        });

        it("interleaves left and right stereo channels sequentially", () => {
            const left = new Float32Array([1.0, 3.0, 5.0]);
            const right = new Float32Array([2.0, 4.0, 6.0]);
            const interleaved = interleave(left, right);

            expect(interleaved.length).toBe(6);
            expect(Array.from(interleaved)).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
        });

        it("writes ASCII string bytes into a DataView at specified offset", () => {
            const buffer = new ArrayBuffer(8);
            const view = new DataView(buffer);
            writeString(view, 2, "TEST");

            expect(view.getUint8(2)).toBe(84); // 'T'
            expect(view.getUint8(3)).toBe(69); // 'E'
            expect(view.getUint8(4)).toBe(83); // 'S'
            expect(view.getUint8(5)).toBe(84); // 'T'
        });

        it("creates a valid WAV Blob from mono AudioBuffer", () => {
            const sampleRate = 44100;
            const length = 441;
            const channelData = new Float32Array(length).fill(0.25);

            const mockAudioBuffer = {
                numberOfChannels: 1,
                sampleRate,
                length,
                duration: length / sampleRate,
                getChannelData: () => channelData,
            } as unknown as AudioBuffer;

            const blob = audioBufferToWav(mockAudioBuffer);
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.type).toBe("audio/wav");
            expect(blob.size).toBe(44 + length * 2);
        });

        it("creates a valid WAV Blob from stereo AudioBuffer", () => {
            const sampleRate = 44100;
            const length = 441;
            const leftData = new Float32Array(length).fill(0.1);
            const rightData = new Float32Array(length).fill(-0.1);

            const mockAudioBuffer = {
                numberOfChannels: 2,
                sampleRate,
                length,
                duration: length / sampleRate,
                getChannelData: (ch: number) => (ch === 0 ? leftData : rightData),
            } as unknown as AudioBuffer;

            const blob = audioBufferToWav(mockAudioBuffer);
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.type).toBe("audio/wav");
            expect(blob.size).toBe(44 + length * 2 * 2);
        });
    });

    describe("downloadBlob", () => {
        it("creates an anchor and triggers download click", () => {
            const mockBlob = new Blob(["test-audio"], { type: "audio/wav" });
            const originalCreateObjectURL = URL.createObjectURL;
            const originalRevokeObjectURL = URL.revokeObjectURL;

            URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-url");
            URL.revokeObjectURL = vi.fn();

            let clicked = false;
            const originalCreateElement = document.createElement.bind(document);
            vi.spyOn(document, "createElement").mockImplementation((tag) => {
                const el = originalCreateElement(tag);
                if (tag === "a") {
                    el.click = () => {
                        clicked = true;
                    };
                }
                return el;
            });

            downloadBlob(mockBlob, "test-export.wav");

            expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
            expect(clicked).toBe(true);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-url");

            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
        });
    });

    describe("fetchWithBackoff", () => {
        it("returns parsed JSON on successful response", async () => {
            const mockData = { status: "ok" };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockData),
            });

            const result = await fetchWithBackoff("http://example.com/api", {}, 3, 10);
            expect(result).toEqual(mockData);
        });

        it("retries on HTTP failure and succeeds on subsequent try", async () => {
            let attempt = 0;
            global.fetch = vi.fn().mockImplementation(() => {
                attempt += 1;
                if (attempt === 1) {
                    return Promise.resolve({ ok: false, status: 503 });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ retried: true }),
                });
            });

            const result = await fetchWithBackoff("http://example.com/api", {}, 3, 5);
            expect(result).toEqual({ retried: true });
            expect(attempt).toBe(2);
        });

        it("throws error after exhausting retry budget on network exceptions", async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error("Network disconnect"));

            await expect(
                fetchWithBackoff("http://example.com/network-fail", {}, 2, 5),
            ).rejects.toThrow("Network disconnect");
        });

        it("throws error after exhausting retry budget on HTTP errors", async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
            });

            await expect(fetchWithBackoff("http://example.com/fail", {}, 2, 5)).rejects.toThrow(
                "HTTP error! status: 500",
            );
        });
    });

    describe("audioBufferToMp3Blob & loadLameJs", () => {
        it("resolves immediately when window.lamejs is already loaded", async () => {
            const mockLame = { Mp3Encoder: class {} };
            const originalWindowLame = (window as Window & { lamejs?: unknown }).lamejs;
            (window as Window & { lamejs?: unknown }).lamejs = mockLame;

            try {
                const result = await loadLameJs();
                expect(result).toBe(mockLame);
            } finally {
                (window as Window & { lamejs?: unknown }).lamejs = originalWindowLame;
            }
        });

        it("loads LameJS and caches promise", async () => {
            const lamejs = await loadLameJs();
            expect(lamejs).toBeDefined();

            const cached = await loadLameJs();
            expect(cached).toBe(lamejs);
        });

        it("encodes mono AudioBuffer to MP3 Blob using LameJS", async () => {
            const sampleRate = 44100;
            const length = 2304; // 2 MP3 frames (1152 * 2)
            const pcm = new Float32Array(length).fill(0.3);

            const mockAudioBuffer = {
                numberOfChannels: 1,
                sampleRate,
                length,
                duration: length / sampleRate,
                getChannelData: () => pcm,
            } as unknown as AudioBuffer;

            const mp3Blob = await audioBufferToMp3Blob(mockAudioBuffer);
            expect(mp3Blob).toBeInstanceOf(Blob);
            expect(mp3Blob.type).toBe("audio/mpeg");
        });

        it("encodes stereo AudioBuffer with distinct left and right channels", async () => {
            const sampleRate = 44100;
            const length = 2304;
            const leftPcm = new Float32Array(length).fill(0.2);
            const rightPcm = new Float32Array(length).fill(-0.2);

            const mockAudioBuffer = {
                numberOfChannels: 2,
                sampleRate,
                length,
                duration: length / sampleRate,
                getChannelData: (ch: number) => (ch === 0 ? leftPcm : rightPcm),
            } as unknown as AudioBuffer;

            const mp3Blob = await audioBufferToMp3Blob(mockAudioBuffer);
            expect(mp3Blob).toBeInstanceOf(Blob);
            expect(mp3Blob.type).toBe("audio/mpeg");
        });

        it("rejects when encoding encounters an unhandled error", async () => {
            const badBuffer = {
                numberOfChannels: 1,
                sampleRate: 44100,
                length: 100,
                duration: 0.1,
                getChannelData: () => {
                    throw new Error("Corrupt channel data");
                },
            } as unknown as AudioBuffer;

            await expect(audioBufferToMp3Blob(badBuffer)).rejects.toThrow("Corrupt channel data");
        });

        it("triggers background idle load with requestIdleCallback when available", () => {
            const originalIdle = (window as Window & { requestIdleCallback?: unknown })
                .requestIdleCallback;
            const idleMock = vi.fn((cb: () => void) => cb());
            (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback = idleMock;

            try {
                triggerIdleLoad();
                expect(idleMock).toHaveBeenCalled();
            } finally {
                (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback =
                    originalIdle;
            }
        });

        it("triggers background idle load with setTimeout fallback when requestIdleCallback is unavailable", () => {
            vi.useFakeTimers();
            const originalIdle = (window as Window & { requestIdleCallback?: unknown })
                .requestIdleCallback;
            (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback = undefined;

            try {
                triggerIdleLoad();
                vi.advanceTimersByTime(3000);
            } finally {
                (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback =
                    originalIdle;
                vi.useRealTimers();
            }
        });
    });
});
