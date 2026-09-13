/**
 * Browser and audio export helpers used by the Web Arpeggiator app.
 */

/**
 * @typedef {object} AudioBufferLike
 * @property {number} numberOfChannels - Number of PCM channels.
 * @property {number} sampleRate - Frames per second.
 * @property {number} length - Frames per channel.
 * @property {number} duration - Buffer duration in seconds.
 * @property {(channel: number) => Float32Array} getChannelData - Returns channel PCM data.
 */

/**
 * Fetches a URL with exponential backoff.
 *
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} options - Fetch options.
 * @param {number} [maxRetries=5] - Maximum retry attempts.
 * @param {number} [baseDelay=1000] - Base delay in milliseconds.
 * @returns {Promise<any>} Parsed JSON response.
 */
export async function fetchWithBackoff(url, options, maxRetries = 5, baseDelay = 1000) {
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            attempt += 1;
            if (attempt >= maxRetries) {
                throw error;
            }

            await new Promise((resolve) => setTimeout(resolve, baseDelay * 2 ** (attempt - 1)));
        }
    }

    throw new Error("fetchWithBackoff exhausted retries without a response.");
}

/**
 * Triggers a browser download for a Blob.
 *
 * @param {Blob} blob - The Blob object to download.
 * @param {string} filename - The file name to use for the download.
 * @returns {void}
 */
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.download = filename;
    anchor.href = url;
    anchor.click();
    URL.revokeObjectURL(url);
}

/**
 * Converts a Float32Array of PCM data to a signed 16-bit PCM buffer.
 *
 * @param {Float32Array} buffer - The input buffer.
 * @returns {Int16Array} The converted buffer.
 */
export function float32ToInt16(buffer) {
    const data = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, buffer[i]));
        data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return data;
}

/**
 * Creates an AudioBuffer-compatible PCM copy with a precise frame count.
 * Frames outside the source buffer remain silent so callers retain their
 * requested export length even if a browser returns a slightly short buffer.
 *
 * @param {AudioBufferLike} audioBuffer - Source PCM buffer.
 * @param {number} startFrame - First source frame to copy.
 * @param {number} frameCount - Number of frames in the copy.
 * @returns {AudioBufferLike} Copied PCM data.
 */
export function copyAudioBufferFrames(audioBuffer, startFrame, frameCount) {
    const safeSourceLength = Math.max(0, Math.trunc(Number(audioBuffer.length) || 0));
    const safeStartFrame = Math.min(
        Math.max(0, Math.trunc(Number(startFrame) || 0)),
        safeSourceLength,
    );
    const safeFrameCount = Math.max(0, Math.trunc(Number(frameCount) || 0));
    const safeSampleRate = Math.max(1, Number(audioBuffer.sampleRate) || 1);
    const safeChannelCount = Math.max(1, Math.trunc(Number(audioBuffer.numberOfChannels) || 1));
    const copiedChannels = Array.from({ length: safeChannelCount }, (_, channel) => {
        const copiedChannel = new Float32Array(safeFrameCount);
        const sourceChannel = audioBuffer.getChannelData(channel);
        const availableFrames = Math.max(0, safeSourceLength - safeStartFrame);
        const framesToCopy = Math.min(safeFrameCount, availableFrames, sourceChannel.length);
        copiedChannel.set(sourceChannel.subarray(safeStartFrame, safeStartFrame + framesToCopy));
        return copiedChannel;
    });

    return {
        numberOfChannels: safeChannelCount,
        sampleRate: safeSampleRate,
        length: safeFrameCount,
        duration: safeFrameCount / safeSampleRate,
        getChannelData(channel) {
            if (!Number.isInteger(channel) || channel < 0 || channel >= copiedChannels.length) {
                throw new RangeError(`Channel ${channel} is outside this audio buffer.`);
            }
            return copiedChannels[channel];
        },
    };
}

/**
 * Finds the maximum boundary-crossfade length for a seamless loop.
 *
 * @param {number} sampleRate - Frames per second.
 * @param {number} frameCount - Loop frames per channel.
 * @returns {number} Frames to crossfade at the end of the loop.
 */
export function getSeamlessCrossfadeFrameCount(sampleRate, frameCount) {
    const safeSampleRate = Math.max(0, Number(sampleRate) || 0);
    const safeFrameCount = Math.max(0, Math.trunc(Number(frameCount) || 0));
    const fiveMilliseconds = Math.floor(safeSampleRate * 0.005);

    return Math.min(fiveMilliseconds, Math.floor(safeFrameCount / 16));
}

/**
 * Copies a cycle-aligned PCM section and smooths the ending boundary into its
 * beginning with an equal-power crossfade. The returned loop keeps the exact
 * requested number of frames.
 *
 * @param {AudioBufferLike} audioBuffer - Source PCM buffer.
 * @param {number} startFrame - First source frame in the seamless section.
 * @param {number} frameCount - Exact number of loop frames to retain.
 * @returns {AudioBufferLike} A precise, seamless-loop-ready PCM buffer.
 */
export function createSeamlessLoopAudioBuffer(audioBuffer, startFrame, frameCount) {
    const loopBuffer = copyAudioBufferFrames(audioBuffer, startFrame, frameCount);
    const crossfadeFrames = getSeamlessCrossfadeFrameCount(
        loopBuffer.sampleRate,
        loopBuffer.length,
    );

    if (crossfadeFrames === 0) return loopBuffer;

    const crossfadeStart = loopBuffer.length - crossfadeFrames;
    for (let channel = 0; channel < loopBuffer.numberOfChannels; channel += 1) {
        const channelData = loopBuffer.getChannelData(channel);
        for (let frame = 0; frame < crossfadeFrames; frame += 1) {
            const progress = (frame + 1) / crossfadeFrames;
            const tailGain = Math.cos((Math.PI / 2) * progress);
            const headGain = Math.sin((Math.PI / 2) * progress);
            channelData[crossfadeStart + frame] =
                channelData[crossfadeStart + frame] * tailGain + channelData[frame] * headGain;
        }
    }

    return loopBuffer;
}

const MP3_ENCODER_DELAY_SAMPLES = 576;
const MP3_XING_FLAGS = 0x000f;
const MP3_XING_TOC_ENTRIES = 100;
const MP3_XING_DATA_SIZE = 156;
const MP3_BITRATES_MPEG_1_LAYER_3 = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const MP3_BITRATES_MPEG_2_LAYER_3 = [
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];
const MP3_SAMPLE_RATES = {
    0: [11025, 12000, 8000],
    2: [22050, 24000, 16000],
    3: [44100, 48000, 32000],
};

/**
 * @typedef {object} Mp3FrameInfo
 * @property {number} offset - First byte of the frame.
 * @property {number} frameLength - Bytes occupied by this frame.
 * @property {number} sampleRate - Encoded sample rate.
 * @property {number} samplesPerFrame - PCM samples decoded by this frame.
 * @property {number} sideInfoLength - Bytes before the Info/Xing payload.
 * @property {number} bitrateKbps - Frame bitrate in kilobits per second.
 */

/**
 * Reads an MPEG Layer III frame header emitted by LameJS.
 *
 * @param {Uint8Array} bytes - Complete MP3 bitstream.
 * @param {number} offset - Frame start byte.
 * @returns {Mp3FrameInfo|null} Parsed frame information, if valid.
 */
function readMp3Frame(bytes, offset) {
    if (
        offset + 4 > bytes.length ||
        bytes[offset] !== 0xff ||
        (bytes[offset + 1] & 0xe0) !== 0xe0
    ) {
        return null;
    }

    const version = (bytes[offset + 1] >> 3) & 0x03;
    const layer = (bytes[offset + 1] >> 1) & 0x03;
    const bitrateIndex = bytes[offset + 2] >> 4;
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
    const hasPadding = (bytes[offset + 2] & 0x02) !== 0;
    const channelMode = bytes[offset + 3] >> 6;

    if (version === 1 || layer !== 1 || sampleRateIndex === 3) return null;

    const sampleRate = MP3_SAMPLE_RATES[version]?.[sampleRateIndex];
    const bitrateKbps =
        version === 3
            ? MP3_BITRATES_MPEG_1_LAYER_3[bitrateIndex]
            : MP3_BITRATES_MPEG_2_LAYER_3[bitrateIndex];
    if (!sampleRate || !bitrateKbps) return null;

    const samplesPerFrame = version === 3 ? 1152 : 576;
    const frameLength =
        Math.floor(((version === 3 ? 144 : 72) * bitrateKbps * 1000) / sampleRate) +
        (hasPadding ? 1 : 0);
    if (frameLength < 4 || offset + frameLength > bytes.length) return null;

    return {
        offset,
        frameLength,
        sampleRate,
        samplesPerFrame,
        sideInfoLength:
            4 + (version === 3 ? (channelMode === 3 ? 17 : 32) : channelMode === 3 ? 9 : 17),
        bitrateKbps,
    };
}

/**
 * Reads every frame in an MP3 stream generated by LameJS.
 *
 * @param {Uint8Array} bytes - Complete MP3 bitstream.
 * @returns {Mp3FrameInfo[]} Frame metadata, or an empty list for an invalid stream.
 */
function readMp3Frames(bytes) {
    const frames = [];
    let offset = 0;

    while (offset < bytes.length) {
        const frame = readMp3Frame(bytes, offset);
        if (!frame) return [];
        frames.push(frame);
        offset += frame.frameLength;
    }

    return frames;
}

/**
 * Writes an unsigned 32-bit integer in network byte order.
 *
 * @param {Uint8Array} bytes - Destination bytes.
 * @param {number} offset - Starting byte.
 * @param {number} value - Value to write.
 * @returns {void}
 */
function writeUint32BE(bytes, offset, value) {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
}

/**
 * Writes ASCII metadata text into an MP3 tag frame.
 *
 * @param {Uint8Array} bytes - Destination bytes.
 * @param {number} offset - Starting byte.
 * @param {string} text - ASCII text to write.
 * @returns {void}
 */
function writeMp3Ascii(bytes, offset, text) {
    for (let index = 0; index < text.length; index += 1) {
        bytes[offset + index] = text.charCodeAt(index);
    }
}

/**
 * Updates the reflected CRC-16 used by the LAME tag footer.
 *
 * @param {number} crc - Current CRC value.
 * @param {number} value - Byte to incorporate.
 * @returns {number} Updated CRC value.
 */
function updateMp3TagCrc(crc, value) {
    let nextCrc = (crc ^ value) & 0xffff;
    for (let bit = 0; bit < 8; bit += 1) {
        nextCrc = nextCrc & 1 ? (nextCrc >>> 1) ^ 0xa001 : nextCrc >>> 1;
    }
    return nextCrc;
}

/**
 * Prepends an Info/Xing-compatible LAME tag frame with the encoder delay and
 * final padding required for gapless-aware MP3 decoders. LameJS does not expose
 * its own tag writer, so this recreates its CBR metadata from the encoded frame
 * layout after flush.
 *
 * @param {Uint8Array} mp3Bytes - Raw CBR MP3 bytes generated by LameJS.
 * @param {number} inputSampleCount - PCM samples supplied per channel.
 * @param {number} inputSampleRate - PCM sample rate before MP3 encoding.
 * @returns {Uint8Array} MP3 bytes with a gapless metadata frame when possible.
 */
export function addGaplessMp3Metadata(mp3Bytes, inputSampleCount, inputSampleRate) {
    const frames = readMp3Frames(mp3Bytes);
    const firstFrame = frames[0];
    if (!firstFrame) return mp3Bytes;

    const tagOffset = firstFrame.sideInfoLength;
    const lameOffset = tagOffset + 4 + 4 + 4 + 4 + MP3_XING_TOC_ENTRIES + 4;
    const tagCrcOffset = tagOffset + MP3_XING_DATA_SIZE - 2;
    if (tagOffset + MP3_XING_DATA_SIZE > firstFrame.frameLength) return mp3Bytes;

    const safeInputSampleRate = Number(inputSampleRate);
    const safeInputSampleCount = Math.max(0, Math.trunc(Number(inputSampleCount) || 0));
    if (!Number.isFinite(safeInputSampleRate) || safeInputSampleRate <= 0) return mp3Bytes;

    const encodedSampleCount = Math.round(
        (safeInputSampleCount * firstFrame.sampleRate) / safeInputSampleRate,
    );
    const encoderPadding =
        frames.length * firstFrame.samplesPerFrame - encodedSampleCount - MP3_ENCODER_DELAY_SAMPLES;
    if (encoderPadding < 0 || encoderPadding > 0x0fff) return mp3Bytes;

    const tagFrame = new Uint8Array(firstFrame.frameLength);
    tagFrame.set(mp3Bytes.subarray(0, 4));
    writeMp3Ascii(tagFrame, tagOffset, "Info");
    writeUint32BE(tagFrame, tagOffset + 4, MP3_XING_FLAGS);
    writeUint32BE(tagFrame, tagOffset + 8, frames.length);
    writeUint32BE(tagFrame, tagOffset + 12, mp3Bytes.length + tagFrame.length);

    for (let index = 1; index < MP3_XING_TOC_ENTRIES; index += 1) {
        tagFrame[tagOffset + 16 + index] = Math.floor((index * 255) / MP3_XING_TOC_ENTRIES);
    }

    writeMp3Ascii(tagFrame, lameOffset, "LAME3.100");

    let lameDetailsOffset = lameOffset + 9;
    tagFrame[lameDetailsOffset] = 0x01;
    lameDetailsOffset += 1;
    tagFrame[lameDetailsOffset] = 0;
    lameDetailsOffset += 1 + 4 + 2 + 2;
    tagFrame[lameDetailsOffset] = 0;
    lameDetailsOffset += 1;
    tagFrame[lameDetailsOffset] = Math.min(firstFrame.bitrateKbps, 0xff);
    lameDetailsOffset += 1;
    tagFrame[lameDetailsOffset] = MP3_ENCODER_DELAY_SAMPLES >> 4;
    tagFrame[lameDetailsOffset + 1] =
        ((MP3_ENCODER_DELAY_SAMPLES & 0x0f) << 4) | (encoderPadding >> 8);
    tagFrame[lameDetailsOffset + 2] = encoderPadding & 0xff;

    let tagCrc = 0;
    for (let index = 0; index < tagCrcOffset; index += 1) {
        tagCrc = updateMp3TagCrc(tagCrc, tagFrame[index]);
    }
    tagFrame[tagCrcOffset] = (tagCrc >> 8) & 0xff;
    tagFrame[tagCrcOffset + 1] = tagCrc & 0xff;

    const taggedMp3Bytes = new Uint8Array(tagFrame.length + mp3Bytes.length);
    taggedMp3Bytes.set(tagFrame);
    taggedMp3Bytes.set(mp3Bytes, tagFrame.length);
    return taggedMp3Bytes;
}

let lameJsPromise = null;

/**
 * Dynamically loads the lamejs MP3 encoder library from the npm package.
 * Uses a cached promise to ensure it is only fetched once.
 *
 * @returns {Promise<typeof import("@breezystack/lamejs")>} Resolves to the window.lamejs object when loaded.
 */
export function loadLameJs() {
    if (window.lamejs) {
        return Promise.resolve(window.lamejs);
    }
    if (lameJsPromise) {
        return lameJsPromise;
    }
    lameJsPromise = import("@breezystack/lamejs")
        .then((module) => {
            window.lamejs = module.default || module;
            return window.lamejs;
        })
        .catch((err) => {
            lameJsPromise = null;
            throw err;
        });
    return lameJsPromise;
}

/**
 * Triggers LameJS loading when the browser is idle.
 *
 * @returns {void}
 */
export function triggerIdleLoad() {
    if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => {
            loadLameJs().catch((err) => console.warn("Background LameJS pre-load failed:", err));
        });
    } else {
        setTimeout(() => {
            loadLameJs().catch((err) => console.warn("Background LameJS pre-load failed:", err));
        }, 3000);
    }
}

// Queue LameJS loading when the browser is idle
if (typeof window !== "undefined") {
    // When the page is loaded, trigger LameJS loading.
    if (document.readyState === "complete") {
        triggerIdleLoad();
    } else {
        window.addEventListener("load", triggerIdleLoad);
    }
}

/**
 * Encodes an AudioBuffer to an MP3 Blob using LameJS.
 *
 * @param {AudioBuffer} audioBuffer - The AudioBuffer to encode.
 * @returns {Promise<Blob>} MP3 audio data.
 */
export async function audioBufferToMp3Blob(audioBuffer) {
    // Wait for LameJS to be loaded, if it's not already loaded.
    const lamejs = await loadLameJs();

    return new Promise((resolve, reject) => {
        try {
            const channels = audioBuffer.numberOfChannels;
            const sampleRate = audioBuffer.sampleRate;
            const kbps = 128;
            const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
            const mp3Data = [];

            const pcmLeft = audioBuffer.getChannelData(0);
            const pcmRight = channels > 1 ? audioBuffer.getChannelData(1) : pcmLeft;

            const leftInt16 = float32ToInt16(pcmLeft);
            const rightInt16 = channels > 1 ? float32ToInt16(pcmRight) : leftInt16;

            const blockSize = 1152;

            for (let i = 0; i < leftInt16.length; i += blockSize) {
                const leftChunk = leftInt16.subarray(i, i + blockSize);
                const rightChunk = rightInt16.subarray(i, i + blockSize);

                const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
                if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }
            }

            const mp3buf = mp3encoder.flush();
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }

            const rawMp3Bytes = new Uint8Array(
                mp3Data.reduce((totalLength, chunk) => totalLength + chunk.length, 0),
            );
            let byteOffset = 0;
            for (const chunk of mp3Data) {
                rawMp3Bytes.set(chunk, byteOffset);
                byteOffset += chunk.length;
            }

            resolve(
                new Blob([addGaplessMp3Metadata(rawMp3Bytes, audioBuffer.length, sampleRate)], {
                    type: "audio/mpeg",
                }),
            );
        } catch (error) {
            console.error("Error during MP3 encoding:", error);
            reject(error);
        }
    });
}

/**
 * Converts an AudioBuffer to a WAV Blob.
 *
 * @param {AudioBuffer} audioBuffer - The AudioBuffer to encode.
 * @returns {Blob} WAV audio data.
 */
export function audioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const result =
        numChannels === 2
            ? interleave(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1))
            : audioBuffer.getChannelData(0);

    const dataLength = result.length * (bitDepth / 8);
    const blockAlign = numChannels * (bitDepth / 8);

    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < result.length; i += 1, offset += 2) {
        const sample = Math.max(-1, Math.min(1, result[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    return new Blob([view], { type: "audio/wav" });
}

/**
 * Writes ASCII text into a DataView.
 *
 * @param {DataView} view - Destination view.
 * @param {number} offset - Starting byte offset.
 * @param {string} text - ASCII text to write.
 * @returns {void}
 */
export function writeString(view, offset, text) {
    for (let i = 0; i < text.length; i += 1) {
        view.setUint8(offset + i, text.charCodeAt(i));
    }
}

/**
 * Interleaves two PCM channels for stereo WAV output.
 *
 * @param {Float32Array} inputL - Left channel samples.
 * @param {Float32Array} inputR - Right channel samples.
 * @returns {Float32Array} Interleaved stereo samples.
 */
export function interleave(inputL, inputR) {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;

    while (index < length) {
        result[index] = inputL[inputIndex];
        index += 1;
        result[index] = inputR[inputIndex];
        index += 1;
        inputIndex += 1;
    }

    return result;
}
