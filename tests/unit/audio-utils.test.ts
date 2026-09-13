/**
 * @file Unit tests for audio utilities, PCM conversion, WAV creation, and MP3 exports.
 */

import { describe, expect, it, vi } from "vitest";
import {
    addGaplessMp3Metadata,
    audioBufferToMp3Blob,
    audioBufferToWav,
    copyAudioBufferFrames,
    createSeamlessLoopAudioBuffer,
    downloadBlob,
    fetchWithBackoff,
    float32ToInt16,
    getSeamlessCrossfadeFrameCount,
    interleave,
    loadLameJs,
    triggerIdleLoad,
    writeString,
} from "@core/audio-utils.js";

function createMpeg1Layer3Frames(frameCount: number): Uint8Array {
    const frameLength = 417;
    const bytes = new Uint8Array(frameCount * frameLength);

    for (let frame = 0; frame < frameCount; frame += 1) {
        const offset = frame * frameLength;
        bytes[offset] = 0xff;
        bytes[offset + 1] = 0xfb;
        bytes[offset + 2] = 0x90;
        bytes[offset + 3] = 0x00;
    }

    return bytes;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
    return new TextDecoder().decode(bytes.slice(offset, offset + length));
}

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

        it("copies exact multi-channel frame ranges without mutating the source", () => {
            const left = Float32Array.from({ length: 12 }, (_, index) => index / 10);
            const right = Float32Array.from({ length: 12 }, (_, index) => -index / 10);
            const source = {
                numberOfChannels: 2,
                sampleRate: 1000,
                length: 12,
                duration: 0.012,
                getChannelData: (channel: number) => (channel === 0 ? left : right),
            } as unknown as AudioBuffer;

            const copied = copyAudioBufferFrames(source, 4, 5);

            expect(copied.length).toBe(5);
            expect(Array.from(copied.getChannelData(0))).toEqual(Array.from(left.slice(4, 9)));
            expect(Array.from(copied.getChannelData(1))).toEqual(Array.from(right.slice(4, 9)));
            copied.getChannelData(0)[0] = 0;
            expect(left[4]).toBeCloseTo(0.4);
        });

        it("preserves requested frame counts and zero-fills missing source frames", () => {
            const sourceData = Float32Array.from([0.1, 0.2, 0.3, 0.4]);
            const source = {
                numberOfChannels: 1,
                sampleRate: 1000,
                length: 4,
                duration: 0.004,
                getChannelData: () => sourceData,
            } as unknown as AudioBuffer;

            const copied = copyAudioBufferFrames(source, 2, 4);

            expect(copied.length).toBe(4);
            expect(Array.from(copied.getChannelData(0))).toEqual([
                sourceData[2],
                sourceData[3],
                0,
                0,
            ]);
        });

        it("caps seamless crossfades at five milliseconds and one sixteenth of the loop", () => {
            expect(getSeamlessCrossfadeFrameCount(1000, 160)).toBe(5);
            expect(getSeamlessCrossfadeFrameCount(1000, 30)).toBe(1);
            expect(getSeamlessCrossfadeFrameCount(1000, 15)).toBe(0);
        });

        it("creates an exact seamless loop with an equal-power ending crossfade", async () => {
            const samples = Float32Array.from({ length: 32 }, (_, index) => index);
            const source = {
                numberOfChannels: 1,
                sampleRate: 1000,
                length: samples.length,
                duration: samples.length / 1000,
                getChannelData: () => samples,
            } as unknown as AudioBuffer;

            const seamless = createSeamlessLoopAudioBuffer(source, 0, 32);
            const channel = seamless.getChannelData(0);
            const wavBlob = audioBufferToWav(seamless);
            const wavData = new Uint8Array(await wavBlob.arrayBuffer());

            expect(seamless.length).toBe(32);
            expect(channel[0]).toBe(0);
            expect(channel[31]).toBe(1);
            expect(samples[31]).toBe(31);
            expect(new TextDecoder().decode(wavData.slice(0, 4))).toBe("RIFF");
            expect(new TextDecoder().decode(wavData.slice(8, 12))).toBe("WAVE");
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
        it("adds an Info/LAME gapless frame with exact delay and padding metadata", () => {
            const rawMp3 = createMpeg1Layer3Frames(4);
            const inputSampleCount = 4 * 1152 - 576 - 1000;
            const taggedMp3 = addGaplessMp3Metadata(rawMp3, inputSampleCount, 44100);
            const tagOffset = 4 + 32;
            const lameOffset = tagOffset + 4 + 4 + 4 + 4 + 100 + 4;
            const delayOffset = lameOffset + 21;
            const metadata = new DataView(
                taggedMp3.buffer,
                taggedMp3.byteOffset,
                taggedMp3.byteLength,
            );

            expect(taggedMp3).toHaveLength(rawMp3.length + 417);
            expect(readAscii(taggedMp3, tagOffset, 4)).toBe("Info");
            expect(metadata.getUint32(tagOffset + 4)).toBe(0x000f);
            expect(metadata.getUint32(tagOffset + 8)).toBe(4);
            expect(metadata.getUint32(tagOffset + 12)).toBe(taggedMp3.length);
            expect(readAscii(taggedMp3, lameOffset, 9)).toBe("LAME3.100");
            expect((taggedMp3[delayOffset] << 4) | (taggedMp3[delayOffset + 1] >> 4)).toBe(576);
            expect(((taggedMp3[delayOffset + 1] & 0x0f) << 8) | taggedMp3[delayOffset + 2]).toBe(
                1000,
            );
            expect(taggedMp3.slice(417)).toEqual(rawMp3);
        });

        it("leaves malformed MP3 data unchanged when it cannot add gapless metadata", () => {
            const malformed = new Uint8Array([0, 1, 2, 3]);

            expect(addGaplessMp3Metadata(malformed, 100, 44100)).toBe(malformed);
        });

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
            const mp3Bytes = new Uint8Array(await mp3Blob.arrayBuffer());
            expect(mp3Blob).toBeInstanceOf(Blob);
            expect(mp3Blob.type).toBe("audio/mpeg");
            expect(readAscii(mp3Bytes, 4 + 17, 4)).toBe("Info");
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
