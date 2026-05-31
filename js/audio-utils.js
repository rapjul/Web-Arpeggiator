/**
 * Browser and audio export helpers used by the Web Arpeggiator app.
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

            await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1)));
        }
    }

    throw new Error('fetchWithBackoff exhausted retries without a response.');
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
    const anchor = document.createElement('a');
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
        data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    return data;
}

let lameJsPromise = null;

/**
 * Dynamically loads the lamejs MP3 encoder library from CDN.
 * Uses a cached promise to ensure it is only fetched once.
 *
 * @returns {Promise<object>} Resolves to the window.lamejs object when loaded.
 */
export function loadLameJs() {
    if (window.lamejs) {
        return Promise.resolve(window.lamejs);
    }
    if (lameJsPromise) {
        return lameJsPromise;
    }
    lameJsPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
        script.type = 'text/javascript';
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        script.onload = () => {
            if (window.lamejs) {
                resolve(window.lamejs);
            } else {
                reject(new Error('LameJS was loaded but window.lamejs is undefined.'));
            }
        };
        script.onerror = (err) => {
            lameJsPromise = null;
            reject(err);
        };
        document.head.appendChild(script);
    });
    return lameJsPromise;
}

// Queue LameJS loading when the browser is idle
if (typeof window !== 'undefined') {
    /**
     * Triggers LameJS loading when the browser is idle.
     * @returns {void}
     */
    const triggerIdleLoad = () => {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => {
                loadLameJs().catch((err) => console.warn('Background LameJS pre-load failed:', err));
            });
        } else {
            setTimeout(() => {
                loadLameJs().catch((err) => console.warn('Background LameJS pre-load failed:', err));
            }, 3000);
        }
    };

    // When the page is loaded, trigger LameJS loading.
    if (document.readyState === 'complete') {
        triggerIdleLoad();
    } else {
        window.addEventListener('load', triggerIdleLoad);
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
    await loadLameJs();

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

            resolve(new Blob(mp3Data, { type: 'audio/mpeg' }));
        } catch (error) {
            console.error('Error during MP3 encoding:', error);
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

    const result = numChannels === 2
        ? interleave(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1))
        : audioBuffer.getChannelData(0);

    const dataLength = result.length * (bitDepth / 8);
    const blockAlign = numChannels * (bitDepth / 8);

    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < result.length; i += 1, offset += 2) {
        const sample = Math.max(-1, Math.min(1, result[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

/**
 * Writes ASCII text into a DataView.
 *
 * @param {DataView} view - Destination view.
 * @param {number} offset - Starting byte offset.
 * @param {string} text - ASCII text to write.
 * @returns {void}
 */
function writeString(view, offset, text) {
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
function interleave(inputL, inputR) {
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
