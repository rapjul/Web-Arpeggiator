import { describe, test, expect } from "bun:test";
import { float32ToInt16, interleave, writeString, audioBufferToWav } from "../../js/audio-utils.js";

describe("Audio Utils Domain Module", () => {
    test("converts Float32Array PCM samples to signed 16-bit integers", () => {
        const floatData = new Float32Array([0.0, 1.0, -1.0, 0.5, -0.5]);
        const int16Data = float32ToInt16(floatData);

        expect(int16Data.length).toBe(5);
        expect(int16Data[0]).toBe(0);
        expect(int16Data[1]).toBe(0x7fff); // 32767
        expect(int16Data[2]).toBe(-0x8000); // -32768
        expect(int16Data[3]).toBe(Math.floor(0.5 * 0x7fff));
        expect(int16Data[4]).toBe(Math.floor(-0.5 * 0x8000));
    });

    test("clamps out-of-range Float32Array samples safely", () => {
        const floatData = new Float32Array([1.5, -2.0]);
        const int16Data = float32ToInt16(floatData);

        expect(int16Data[0]).toBe(0x7fff);
        expect(int16Data[1]).toBe(-0x8000);
    });

    test("interleaves left and right stereo channels sequentially", () => {
        const left = new Float32Array([1.0, 3.0, 5.0]);
        const right = new Float32Array([2.0, 4.0, 6.0]);

        const stereo = interleave(left, right);
        expect(stereo.length).toBe(6);
        expect(Array.from(stereo)).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    });

    test("writes ASCII string bytes into a DataView at specified offset", () => {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);

        writeString(view, 0, "RIFF");
        writeString(view, 4, "WAVE");

        const text = String.fromCharCode(
            view.getUint8(0),
            view.getUint8(1),
            view.getUint8(2),
            view.getUint8(3),
            view.getUint8(4),
            view.getUint8(5),
            view.getUint8(6),
            view.getUint8(7)
        );

        expect(text).toBe("RIFFWAVE");
    });

    test("creates a valid WAV Blob from mock AudioBuffer", async () => {
        const mockAudioBuffer = {
            numberOfChannels: 1,
            sampleRate: 44100,
            getChannelData: (ch: number) => new Float32Array([0.0, 0.5, -0.5, 0.0]),
        } as unknown as AudioBuffer;

        const wavBlob = audioBufferToWav(mockAudioBuffer);
        expect(wavBlob).toBeInstanceOf(Blob);
        expect(wavBlob.type).toBe("audio/wav");

        const arrayBuffer = await wavBlob.arrayBuffer();
        expect(arrayBuffer.byteLength).toBe(44 + 4 * 2); // 44-byte header + 4 samples * 2 bytes

        const view = new DataView(arrayBuffer);
        const riffHeader = String.fromCharCode(
            view.getUint8(0),
            view.getUint8(1),
            view.getUint8(2),
            view.getUint8(3)
        );
        const waveFormat = String.fromCharCode(
            view.getUint8(8),
            view.getUint8(9),
            view.getUint8(10),
            view.getUint8(11)
        );

        expect(riffHeader).toBe("RIFF");
        expect(waveFormat).toBe("WAVE");
        expect(view.getUint16(20, true)).toBe(1); // PCM format
        expect(view.getUint16(22, true)).toBe(1); // 1 channel
        expect(view.getUint32(24, true)).toBe(44100); // Sample rate
        expect(view.getUint16(34, true)).toBe(16); // 16 bits per sample
    });
});
