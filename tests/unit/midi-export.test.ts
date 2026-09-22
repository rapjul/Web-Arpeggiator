import { describe, expect, test } from "vitest";
import {
    createMidiBlob,
    createMidiFileBytes,
    encodeVariableLengthQuantity,
    noteNameToMidiNumber,
    TICKS_PER_BEAT,
    uint16ToBytes,
    uint32ToBytes,
} from "@core/midi-export.js";
import { compileTimeline } from "@core/timeline.js";

function readVariableLengthQuantity(bytes: Uint8Array, start: number) {
    let value = 0;
    let index = start;
    do {
        value = (value << 7) | (bytes[index] & 0x7f);
    } while (bytes[index++] & 0x80);
    return { value, nextIndex: index };
}

function readNoteEvents(bytes: Uint8Array) {
    const trackLength = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
    const events = [];
    let index = 22;
    let absoluteTick = 0;
    const end = index + trackLength;

    while (index < end) {
        const delta = readVariableLengthQuantity(bytes, index);
        absoluteTick += delta.value;
        index = delta.nextIndex;
        const status = bytes[index++];

        if (status === 0xff) {
            index += 1;
            const metaLength = readVariableLengthQuantity(bytes, index);
            index = metaLength.nextIndex + metaLength.value;
            continue;
        }

        if (status === 0x90 || status === 0x80) {
            events.push({
                type: status === 0x90 ? "on" : "off",
                tick: absoluteTick,
                note: bytes[index],
            });
            index += 2;
        }
    }

    return events;
}

function readTempo(bytes: Uint8Array) {
    for (let index = 0; index < bytes.length - 5; index += 1) {
        if (bytes[index] === 0xff && bytes[index + 1] === 0x51 && bytes[index + 2] === 0x03) {
            return (bytes[index + 3] << 16) | (bytes[index + 4] << 8) | bytes[index + 5];
        }
    }
    return 0;
}

function readSequencerMetadata(bytes: Uint8Array) {
    for (let index = 0; index < bytes.length - 3; index += 1) {
        if (bytes[index] !== 0xff || bytes[index + 1] !== 0x7f) continue;
        const length = readVariableLengthQuantity(bytes, index + 2);
        const payload = bytes.slice(length.nextIndex, length.nextIndex + length.value);
        return JSON.parse(new TextDecoder().decode(payload)) as {
            application: string;
            randomSeed: number;
        };
    }
    return null;
}

describe("MIDI Export Domain Module", () => {
    test("noteNameToMidiNumber accurately converts scientific pitch notation to standard MIDI numbers", () => {
        expect(noteNameToMidiNumber("C4")).toBe(60); // Middle C
        expect(noteNameToMidiNumber("A4")).toBe(69); // Concert A440
        expect(noteNameToMidiNumber("C3")).toBe(48);
        expect(noteNameToMidiNumber("C5")).toBe(72);
        expect(noteNameToMidiNumber("F#4")).toBe(66);
        expect(noteNameToMidiNumber("Bb3")).toBe(58);
        expect(noteNameToMidiNumber("G#2")).toBe(44);
        expect(noteNameToMidiNumber("Db5")).toBe(73);

        // Enharmonic pitch calculations across octave boundaries
        expect(noteNameToMidiNumber("Cb4")).toBe(59); // B3
        expect(noteNameToMidiNumber("Fb4")).toBe(64); // E4
        expect(noteNameToMidiNumber("E#4")).toBe(65); // F4
        expect(noteNameToMidiNumber("B#3")).toBe(60); // C4
        expect(noteNameToMidiNumber("C-1")).toBe(0); // Min MIDI note
        expect(noteNameToMidiNumber("G9")).toBe(127); // Max MIDI note clamped

        expect(noteNameToMidiNumber("invalid")).toBe(60); // Fallback to 60
        expect(noteNameToMidiNumber("")).toBe(60);
    });

    test("encodeVariableLengthQuantity encodes 7-bit variable-length quantities conforming to MIDI spec", () => {
        // Single byte values (< 128)
        expect(encodeVariableLengthQuantity(0)).toEqual([0x00]);
        expect(encodeVariableLengthQuantity(0x40)).toEqual([0x40]);
        expect(encodeVariableLengthQuantity(0x7f)).toEqual([0x7f]);

        // Multi-byte values (>= 128)
        expect(encodeVariableLengthQuantity(0x80)).toEqual([0x81, 0x00]);
        expect(encodeVariableLengthQuantity(0x2000)).toEqual([0xc0, 0x00]);
        expect(encodeVariableLengthQuantity(0x3fff)).toEqual([0xff, 0x7f]);
        expect(encodeVariableLengthQuantity(TICKS_PER_BEAT)).toEqual([0x83, 0x60]); // 480
    });

    test("uint16ToBytes and uint32ToBytes format big-endian byte arrays accurately", () => {
        expect(uint16ToBytes(6)).toEqual([0x00, 0x06]);
        expect(uint16ToBytes(480)).toEqual([0x01, 0xe0]);
        expect(uint32ToBytes(6)).toEqual([0x00, 0x00, 0x00, 0x06]);
        expect(uint32ToBytes(0x12345678)).toEqual([0x12, 0x34, 0x56, 0x78]);
    });

    test("createMidiFileBytes creates a valid Standard MIDI File Format 0 binary chunk structure", () => {
        const midiBytes = createMidiFileBytes({
            notes: ["C4", "E4", "G4"],
            bpm: 120,
            interval: "16n",
            gateRatio: 0.8,
            loopCount: 1,
            velocity: 100,
        });

        expect(midiBytes instanceof Uint8Array).toBe(true);
        expect(midiBytes.length).toBeGreaterThan(20);

        // Header Chunk ID: 'MThd' (0x4D, 0x54, 0x68, 0x64)
        expect(midiBytes[0]).toBe(0x4d);
        expect(midiBytes[1]).toBe(0x54);
        expect(midiBytes[2]).toBe(0x68);
        expect(midiBytes[3]).toBe(0x64);

        // Header Chunk length: 6 bytes (0x00, 0x00, 0x00, 0x06)
        expect(midiBytes[4]).toBe(0x00);
        expect(midiBytes[5]).toBe(0x00);
        expect(midiBytes[6]).toBe(0x00);
        expect(midiBytes[7]).toBe(0x06);

        // Format 0 (single track): (0x00, 0x00)
        expect(midiBytes[8]).toBe(0x00);
        expect(midiBytes[9]).toBe(0x00);

        // Number of tracks: 1 (0x00, 0x01)
        expect(midiBytes[10]).toBe(0x00);
        expect(midiBytes[11]).toBe(0x01);

        // Division: 480 PPQ (0x01, 0xE0)
        expect(midiBytes[12]).toBe(0x01);
        expect(midiBytes[13]).toBe(0xe0);

        // Track Chunk ID: 'MTrk' (0x4D, 0x54, 0x72, 0x6B) at byte offset 14
        expect(midiBytes[14]).toBe(0x4d);
        expect(midiBytes[15]).toBe(0x54);
        expect(midiBytes[16]).toBe(0x72);
        expect(midiBytes[17]).toBe(0x6b);

        // Verify End of Track meta event (FF 2F 00) at the end of the byte stream
        const len = midiBytes.length;
        expect(midiBytes[len - 3]).toBe(0xff);
        expect(midiBytes[len - 2]).toBe(0x2f);
        expect(midiBytes[len - 1]).toBe(0x00);
    });

    test("createMidiBlob returns a valid Blob with audio/midi MIME type", () => {
        const blob = createMidiBlob({
            notes: ["A4", "C5", "E5"],
            bpm: 140,
            interval: "8n",
            loopCount: 2,
        });

        expect(blob instanceof Blob).toBe(true);
        expect(blob.type).toBe("audio/midi");
        expect(blob.size).toBeGreaterThan(0);
    });

    test("createMidiFileBytes defensively normalizes non-finite or invalid parameters", () => {
        const bytesNaN = createMidiFileBytes({
            notes: ["C4"],
            bpm: Number.NaN,
            loopCount: Number.NaN,
            gateRatio: Number.NaN,
        });
        expect(bytesNaN instanceof Uint8Array).toBe(true);
        expect(bytesNaN.length).toBeGreaterThan(20);

        // Fractional loopCount should be safely truncated
        const bytesFractional = createMidiFileBytes({
            notes: ["C4", "E4"],
            loopCount: 2.7,
        });
        const bytesExact2 = createMidiFileBytes({
            notes: ["C4", "E4"],
            loopCount: 2,
        });
        expect(bytesFractional.length).toBe(bytesExact2.length);

        // Empty options fallback
        const bytesDefault = createMidiFileBytes();
        expect(bytesDefault.length).toBeGreaterThan(20);
    });

    test("encodes exact Note-On (0x90, vel 100) and Note-Off (0x80, release vel 64/0x40) events", () => {
        const midiBytes = createMidiFileBytes({
            notes: ["C4"], // Note 60 (0x3C)
            bpm: 120,
            interval: "4n",
            gateRatio: 0.8,
            loopCount: 1,
            velocity: 100,
        });

        // Search for Note-On sequence: [0x90, 0x3C, 0x64] (Channel 0 Note On, C4=60, Velocity 100=0x64)
        let noteOnIdx = -1;
        for (let i = 0; i < midiBytes.length - 2; i++) {
            if (midiBytes[i] === 0x90 && midiBytes[i + 1] === 60 && midiBytes[i + 2] === 100) {
                noteOnIdx = i;
                break;
            }
        }
        expect(noteOnIdx).toBeGreaterThan(0);

        // Search for Note-Off sequence: [0x80, 0x3C, 0x40] (Channel 0 Note Off, C4=60, Release Velocity 64=0x40)
        let noteOffIdx = -1;
        for (let i = noteOnIdx + 3; i < midiBytes.length - 2; i++) {
            if (midiBytes[i] === 0x80 && midiBytes[i + 1] === 60 && midiBytes[i + 2] === 0x40) {
                noteOffIdx = i;
                break;
            }
        }
        expect(noteOffIdx).toBeGreaterThan(noteOnIdx);
    });

    test("encodes accurate Set Tempo meta events across varied BPMs", () => {
        // At 120 BPM: 60,000,000 / 120 = 500,000 us/beat -> [0x07, 0xA1, 0x20]
        const bytes120 = createMidiFileBytes({ notes: ["C4"], bpm: 120 });
        let tempoIdx120 = -1;
        for (let i = 0; i < bytes120.length - 5; i++) {
            if (bytes120[i] === 0xff && bytes120[i + 1] === 0x51 && bytes120[i + 2] === 0x03) {
                tempoIdx120 = i;
                break;
            }
        }
        expect(tempoIdx120).toBeGreaterThan(0);
        expect(bytes120[tempoIdx120 + 3]).toBe(0x07);
        expect(bytes120[tempoIdx120 + 4]).toBe(0xa1);
        expect(bytes120[tempoIdx120 + 5]).toBe(0x20);

        // At 60 BPM: 60,000,000 / 60 = 1,000,000 us/beat -> [0x0F, 0x42, 0x40]
        const bytes60 = createMidiFileBytes({ notes: ["C4"], bpm: 60 });
        let tempoIdx60 = -1;
        for (let i = 0; i < bytes60.length - 5; i++) {
            if (bytes60[i] === 0xff && bytes60[i + 1] === 0x51 && bytes60[i + 2] === 0x03) {
                tempoIdx60 = i;
                break;
            }
        }
        expect(tempoIdx60).toBeGreaterThan(0);
        expect(bytes60[tempoIdx60 + 3]).toBe(0x0f);
        expect(bytes60[tempoIdx60 + 4]).toBe(0x42);
        expect(bytes60[tempoIdx60 + 5]).toBe(0x40);
    });

    test("keeps direct and precompiled MIDI tempos inside the 40-240 BPM contract", () => {
        expect(readTempo(createMidiFileBytes({ notes: ["C4"], bpm: 40 }))).toBe(1_500_000);
        expect(readTempo(createMidiFileBytes({ notes: ["C4"], bpm: 240 }))).toBe(250_000);
        for (const bpm of [1, 7, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(readTempo(createMidiFileBytes({ notes: ["C4"], bpm }))).toBe(
                Number.isFinite(bpm) ? 1_500_000 : 500_000,
            );
        }

        const timeline = compileTimeline({ baseNotes: ["C4"], bpm: 120 }, { cycles: 1 });
        expect(readTempo(createMidiFileBytes({ timeline: { ...timeline, bpm: 1 } }))).toBe(
            1_500_000,
        );
    });

    test("embeds the normalized random seed as sequencer-specific metadata", () => {
        expect(
            readSequencerMetadata(
                createMidiFileBytes({ notes: ["C4", "E4", "G4"], randomSeed: 42 }),
            ),
        ).toEqual({ application: "Web Arpeggiator", randomSeed: 42 });

        const timeline = compileTimeline(
            { baseNotes: ["C4"], randomSeed: 987654321 },
            { cycles: 1 },
        );
        expect(readSequencerMetadata(createMidiFileBytes({ timeline }))).toEqual({
            application: "Web Arpeggiator",
            randomSeed: 987654321,
        });
    });

    test("supports all interval subdivisions correctly", () => {
        const intervals = ["64n", "32n", "16n", "8n", "4n", "2n"] as const;
        intervals.forEach((interval) => {
            const bytes = createMidiFileBytes({
                notes: ["C4", "E4"],
                interval,
                gateRatio: 0.5,
                loopCount: 1,
            });
            expect(bytes instanceof Uint8Array).toBe(true);
            expect(bytes.length).toBeGreaterThan(25);
        });
    });

    test("serializes the shared timeline's absolute note timing", () => {
        const timeline = compileTimeline(
            {
                baseNotes: ["C4", "E4"],
                direction: "up",
                interval: "8n",
                gateRatio: 0.5,
                bpm: 120,
                swing: 0,
            },
            { cycles: 2 },
        );
        const bytes = createMidiFileBytes({ timeline });
        const actual = readNoteEvents(bytes);
        const expected = timeline.events
            .flatMap((event) => [
                { type: "on", tick: event.startTick, note: noteNameToMidiNumber(event.pitch) },
                {
                    type: "off",
                    tick: event.startTick + event.durationTicks,
                    note: noteNameToMidiNumber(event.pitch),
                },
            ])
            .sort((left, right) => {
                const tickDelta = left.tick - right.tick;
                if (tickDelta !== 0) return tickDelta;
                return (left.type === "off" ? 0 : 1) - (right.type === "off" ? 0 : 1);
            });

        expect(actual).toEqual(expected);
    });

    test("preserves the configured terminal gate for direct MIDI exports", () => {
        const settings = {
            baseNotes: ["C4", "E4", "G4"],
            interval: "16n",
            gateRatio: 1,
            swing: 1,
        };
        const directEvents = readNoteEvents(
            createMidiFileBytes({
                notes: settings.baseNotes,
                interval: settings.interval,
                gateRatio: settings.gateRatio,
                swing: settings.swing,
                loopCount: 1,
            }),
        );
        const clippedTimeline = compileTimeline(settings, { cycles: 1 });
        const suppliedEvents = readNoteEvents(createMidiFileBytes({ timeline: clippedTimeline }));

        expect(directEvents.findLast((event) => event.type === "off" && event.note === 67)).toEqual(
            {
                type: "off",
                tick: 520,
                note: 67,
            },
        );
        expect(
            suppliedEvents.findLast((event) => event.type === "off" && event.note === 67),
        ).toEqual({
            type: "off",
            tick: 360,
            note: 67,
        });
    });
});
