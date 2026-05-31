/**
 * Visualizer Module
 *
 * Owns the waveform canvas rendering, the 30 Hz UI update loop, and the
 * visualizer mode/pause toggles.
 * Exposes a factory function so the caller (app.js) can
 * inject the analyzer node, DOM references, and shared state.
 *
 * @module visualizer
 */

/**
 * Creates the waveform visualizer and UI update loop.
 *
 * @param {object}   context                                  - Injected app context.
 * @param {object}   context.dom                              - DOM element references.
 * @param {HTMLCanvasElement} context.dom.visualizerCanvas       - Canvas element.
 * @param {HTMLElement}       context.dom.toggleVisualizerButton - Toggle button.
 * @param {HTMLSelectElement} context.dom.visualizerModeSelect  - Dropdown select for mode.
 * @param {HTMLElement}       context.dom.pauseVisualizerButton  - Pause visualizer button.
 * @param {object}   context.audio                            - Audio-engine references.
 * @param {Tone.Analyser}     context.audio.analyser          - Waveform/FFT analyser.
 * @param {object}   context.state                            - Shared app state.
 * @param {boolean}  context.state.isRecording                - Is recording active.
 * @param {number}   context.state.recordingStartTime         - Recording start time.
 * @param {HTMLElement}       context.state.recordButton      - Record button.
 * @param {boolean}  context.state.isPlaying                  - Is transport playing.
 * @param {Function} context.actions.formatTime               - Time formatting helper.
 * @returns {object} Public API.
 */
export function createVisualizer(context) {
    const { dom, audio, state, actions } = context;

    // --- DOM Elements ---
    const visualizerCanvas = dom.visualizerCanvas;
    const visualizerCtx = visualizerCanvas.getContext('2d');
    const toggleVisualizerButton = dom.toggleVisualizerButton;
    const visualizerModeSelect = dom.visualizerModeSelect;
    const pauseVisualizerButton = dom.pauseVisualizerButton;
    const analyser = audio.analyser;

    // --- Internal State ---
    let isVisualizerOn = false;
    let isPaused = false;
    let currentMode = 'oscilloscope'; // 'oscilloscope' | 'fft' | 'loopMap'
    let animationFrameId = null;
    let lastTimeStr = '';

    // Static tick coordinate arrays for Oscilloscope / Loop Map
    const yTicks = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5];

    // FFT frequency tick values (Hz) to plot logarithmically
    const fftTicks = [100, 500, 1000, 5000, 10000];

    // Logarithmic frequency bounds for FFT mode
    const minFreq = 40;
    const maxFreq = 16000;
    const logMin = Math.log(minFreq);
    const logMax = Math.log(maxFreq);

    // Cache for background-rendered arpeggio loop data
    let cachedLoopMapBuffer = null;
    let cachedLoopMapMarkers = [];

    // Persistent buffer for waveform / FFT values to prevent memory allocations
    const waveformBuffer = analyser ? new Float32Array(analyser.size) : null;

    /**
     * Resizes the canvas to match its CSS display size, accounting for
     * high-DPI retina displays to ensure crisp lines.
     *
     * @returns {void}
     */
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = visualizerCanvas.getBoundingClientRect();
        visualizerCanvas.width = rect.width * dpr;
        visualizerCanvas.height = rect.height * dpr;
        visualizerCtx.scale(dpr, dpr);

        // If visualizer is enabled but audio is stopped (static map mode), redraw the static buffer immediately
        if (isVisualizerOn && currentMode === 'loopMap' && !state.isPlaying) {
            runUiUpdate();
        }
    }

    // Bind event listener and do initial sizing
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    /**
     * Updates the pause visualizer button UI state.
     *
     * @returns {void}
     */
    function updatePauseButtonState() {
        if (!pauseVisualizerButton) return;

        if (currentMode === 'loopMap' || !isVisualizerOn) {
            // Disabled in static loopMap mode or when visualizer is off
            pauseVisualizerButton.disabled = true;
            pauseVisualizerButton.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-600');
            pauseVisualizerButton.classList.remove('bg-red-600', 'hover:bg-red-700', 'bg-green-600', 'hover:bg-green-700');
            pauseVisualizerButton.textContent = 'Pause';
        } else {
            // Active during live Oscilloscope / FFT modes
            pauseVisualizerButton.disabled = false;
            pauseVisualizerButton.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-600');
            if (isPaused) {
                pauseVisualizerButton.textContent = 'Resume';
                pauseVisualizerButton.classList.add('bg-green-600', 'hover:bg-green-700');
                pauseVisualizerButton.classList.remove('bg-red-600', 'hover:bg-red-700');
            } else {
                pauseVisualizerButton.textContent = 'Pause';
                pauseVisualizerButton.classList.add('bg-red-600', 'hover:bg-red-700');
                pauseVisualizerButton.classList.remove('bg-green-600', 'hover:bg-green-700');
            }
        }
    }

    /**
     * Formats frequency numbers into human-readable strings (e.g. 1000 -> 1kHz).
     *
     * @param {number} freq - Frequency in Hz.
     * @returns {string} Formatted label.
     */
    function formatFrequency(freq) {
        return freq >= 1000 ? `${(freq / 1000).toFixed(0)}kHz` : `${freq}Hz`;
    }

    /**
     * Main rendering update loop. Runs at ~30 Hz.
     * Handles live oscilloscope plotting (zero-crossing synchronized), FFT graphing,
     * and static downsampled Loop Map drawings.
     *
     * @returns {void}
     */
    function runUiUpdate() {
        // --- Waveform Rendering ---
        if (isVisualizerOn && analyser) {
            try {
                const dpr = window.devicePixelRatio || 1;
                const canvasLogicalWidth = visualizerCanvas.width / dpr;
                const canvasLogicalHeight = visualizerCanvas.height / dpr;

                // --- Layout Constants ---
                const leftPadding = 45; // Wider padding for ±1.5 and FFT dB labels
                const rightPadding = 15;
                const topPadding = 20;
                const bottomPadding = 40;

                const plotWidth = canvasLogicalWidth - leftPadding - rightPadding;
                const plotHeight = canvasLogicalHeight - topPadding - bottomPadding;
                const tickLength = 6;
                const xLabelOffset = 18;

                // Only grab/refresh the audio buffers if the visualizer is NOT paused and we are in a live mode
                if (!isPaused && (currentMode === 'oscilloscope' || currentMode === 'fft')) {
                    const nativeNode = analyser.analyser || analyser._analyser;
                    if (nativeNode) {
                        if (currentMode === 'fft') {
                            if (typeof nativeNode.getFloatFrequencyData === 'function') {
                                nativeNode.getFloatFrequencyData(waveformBuffer);
                            }
                        } else {
                            if (typeof nativeNode.getFloatTimeDomainData === 'function') {
                                nativeNode.getFloatTimeDomainData(waveformBuffer);
                            }
                        }
                    } else if (typeof analyser.getValue === 'function') {
                        const val = analyser.getValue();
                        if (val) waveformBuffer.set(val);
                    }
                }

                // Clear canvas logical frame
                visualizerCtx.clearRect(0, 0, canvasLogicalWidth, canvasLogicalHeight);

                // --- Drawing Mode logic ---
                if (currentMode === 'oscilloscope') {
                    // Zero-crossing search (stabilize wave phase by aligning index at ascending zero threshold)
                    let triggerIndex = 0;
                    const waveformLength = waveformBuffer ? waveformBuffer.length : 0;
                    for (let i = 0; i < waveformLength / 2; i++) {
                        if (waveformBuffer[i] < 0 && waveformBuffer[i + 1] >= 0) {
                            triggerIndex = i;
                            break;
                        }
                    }

                    // Create a vertical gradient to color-code signal headroom (red when > 1.0 or < -1.0)
                    const lineGrad = visualizerCtx.createLinearGradient(0, topPadding, 0, canvasLogicalHeight - bottomPadding);
                    lineGrad.addColorStop(0.0, '#EF4444');      // Red at +1.5 (highest headroom)
                    lineGrad.addColorStop(0.166, '#EF4444');    // Red at +1.0 (clipping limit boundary)
                    lineGrad.addColorStop(0.167, '#38BDF8');    // Blue/Cyan inside nominal bounds
                    lineGrad.addColorStop(0.833, '#38BDF8');    // Blue/Cyan inside nominal bounds
                    lineGrad.addColorStop(0.834, '#EF4444');    // Red at -1.0 (clipping limit boundary)
                    lineGrad.addColorStop(1.0, '#EF4444');      // Red at -1.5 (lowest headroom)

                    // Render only half the buffer to allow clean zero-crossing alignment shifting
                    const displayLength = Math.floor(waveformLength / 2);
                    visualizerCtx.beginPath();
                    visualizerCtx.strokeStyle = lineGrad;
                    visualizerCtx.lineWidth = 2;

                    for (let i = 0; i < displayLength; i++) {
                        const dataIndex = triggerIndex + i;
                        const val = waveformBuffer ? waveformBuffer[dataIndex] : 0;
                        const x = leftPadding + (i / displayLength) * plotWidth;
                        
                        // Map Y coordinates across the ±1.5 range (normalized offset = (val + 1.5) / 3.0)
                        const normalizedY = (val + 1.5) / 3.0;
                        const y = canvasLogicalHeight - bottomPadding - normalizedY * plotHeight;

                        if (i === 0) {
                            visualizerCtx.moveTo(x, y);
                        } else {
                            visualizerCtx.lineTo(x, y);
                        }
                    }
                    visualizerCtx.stroke();

                } else if (currentMode === 'fft') {
                    // Draw log-mapped FFT spectrum bar graph
                    const barCount = Math.floor(plotWidth / 3.5);
                    const barWidth = 2;
                    visualizerCtx.fillStyle = '#38BDF8';

                    for (let b = 0; b < barCount; b++) {
                        const ratio = b / barCount;
                        // Interpolate target frequency logarithmically
                        const freq = minFreq * Math.pow(maxFreq / minFreq, ratio);

                        const nyquist = Tone.context.sampleRate / 2;
                        const binCount = waveformBuffer ? waveformBuffer.length : 1;
                        const binIndex = Math.min(
                            binCount - 1,
                            Math.max(0, Math.floor((freq / nyquist) * binCount))
                        );

                        const db = waveformBuffer ? waveformBuffer[binIndex] : -100;
                        
                        // Normalize dB from [-100, 0] scale
                        const minDb = -100;
                        const maxDb = 0;
                        const normalizedDb = Math.min(1, Math.max(0, (db - minDb) / (maxDb - minDb)));

                        const barHeight = normalizedDb * plotHeight;
                        const x = leftPadding + b * (plotWidth / barCount);
                        const y = canvasLogicalHeight - bottomPadding - barHeight;

                        visualizerCtx.fillRect(x, y, barWidth, barHeight);
                    }

                } else if (currentMode === 'loopMap' && cachedLoopMapBuffer) {
                    // Draw Static Loop Map waveform using dual min/max pixel downsampling
                    const channelData = cachedLoopMapBuffer.getChannelData(0);
                    const bufferLength = channelData.length;

                    const lineGrad = visualizerCtx.createLinearGradient(0, topPadding, 0, canvasLogicalHeight - bottomPadding);
                    lineGrad.addColorStop(0.0, '#EF4444');      // Red at +1.5 (highest headroom)
                    lineGrad.addColorStop(0.166, '#EF4444');    // Red at +1.0 (clipping limit boundary)
                    lineGrad.addColorStop(0.167, '#38BDF8');    // Blue/Cyan inside nominal bounds
                    lineGrad.addColorStop(0.833, '#38BDF8');    // Blue/Cyan inside nominal bounds
                    lineGrad.addColorStop(0.834, '#EF4444');    // Red at -1.0 (clipping limit boundary)
                    lineGrad.addColorStop(1.0, '#EF4444');      // Red at -1.5 (lowest headroom)

                    visualizerCtx.beginPath();
                    visualizerCtx.strokeStyle = lineGrad;
                    visualizerCtx.lineWidth = 1.5;

                    for (let xPixel = 0; xPixel < plotWidth; xPixel++) {
                        const startSample = Math.floor((xPixel / plotWidth) * bufferLength);
                        const endSample = Math.min(bufferLength, Math.floor(((xPixel + 1) / plotWidth) * bufferLength));

                        let minVal = 0;
                        let maxVal = 0;
                        for (let s = startSample; s < endSample; s++) {
                            const val = channelData[s];
                            if (val < minVal) minVal = val;
                            if (val > maxVal) maxVal = val;
                        }

                        const x = leftPadding + xPixel;
                        const yMin = canvasLogicalHeight - bottomPadding - ((minVal + 1.5) / 3.0) * plotHeight;
                        const yMax = canvasLogicalHeight - bottomPadding - ((maxVal + 1.5) / 3.0) * plotHeight;

                        visualizerCtx.moveTo(x, yMin);
                        visualizerCtx.lineTo(x, yMax);
                    }
                    visualizerCtx.stroke();

                    // Render vertical markers indicating exact note trigger boundaries
                    cachedLoopMapMarkers.forEach((marker) => {
                        const x = leftPadding + marker.timeRatio * plotWidth;

                        // Vertical dotted marker line
                        visualizerCtx.save();
                        visualizerCtx.strokeStyle = 'rgba(156, 163, 175, 0.4)'; // gray-400
                        visualizerCtx.setLineDash([3, 3]);
                        visualizerCtx.beginPath();
                        visualizerCtx.moveTo(x, topPadding);
                        visualizerCtx.lineTo(x, canvasLogicalHeight - bottomPadding);
                        visualizerCtx.stroke();
                        visualizerCtx.restore();

                        // Label trigger note name at top
                        visualizerCtx.fillStyle = '#60A5FA'; // blue-400
                        visualizerCtx.font = 'bold 9px Arial';
                        visualizerCtx.textAlign = 'center';
                        visualizerCtx.textBaseline = 'top';
                        visualizerCtx.fillText(marker.note, x, topPadding - 12);
                    });
                }

                // --- Shared Axes and Labels rendering ---
                visualizerCtx.strokeStyle = '#4B5563';  // gray-700
                visualizerCtx.lineWidth = 1;
                visualizerCtx.font = '10px Arial';
                visualizerCtx.fillStyle = '#9CA3AF';   // gray-400

                // Plot Area border lines
                visualizerCtx.beginPath();
                visualizerCtx.moveTo(leftPadding, canvasLogicalHeight - bottomPadding);
                visualizerCtx.lineTo(canvasLogicalWidth - rightPadding, canvasLogicalHeight - bottomPadding);
                visualizerCtx.moveTo(leftPadding, topPadding);
                visualizerCtx.lineTo(leftPadding, canvasLogicalHeight - bottomPadding);
                visualizerCtx.stroke();

                // Y-Axis Ticks
                if (currentMode === 'fft') {
                    // FFT mode: render Decibel (dB) ticks on Y-axis
                    const dbTicks = [0, -20, -40, -60, -80, -100];
                    dbTicks.forEach((tick) => {
                        const ratio = (tick - (-100)) / 100;
                        const y = canvasLogicalHeight - bottomPadding - ratio * plotHeight;

                        visualizerCtx.beginPath();
                        visualizerCtx.moveTo(leftPadding - tickLength, y);
                        visualizerCtx.lineTo(leftPadding, y);
                        visualizerCtx.stroke();

                        visualizerCtx.textAlign = 'right';
                        visualizerCtx.textBaseline = 'middle';
                        visualizerCtx.fillText(`${tick}dB`, leftPadding - tickLength - 4, y);
                    });
                } else {
                    // Oscilloscope and Loop Map modes: render ±1.5 scale Y-ticks
                    yTicks.forEach((tick) => {
                        const ratio = (tick + 1.5) / 3.0;
                        const y = canvasLogicalHeight - bottomPadding - ratio * plotHeight;

                        visualizerCtx.beginPath();
                        visualizerCtx.moveTo(leftPadding - tickLength, y);
                        visualizerCtx.lineTo(leftPadding, y);
                        visualizerCtx.stroke();

                        visualizerCtx.textAlign = 'right';
                        visualizerCtx.textBaseline = 'middle';
                        visualizerCtx.fillText(tick.toFixed(1), leftPadding - tickLength - 4, y);

                        // Overlay red dashed guidelines at nominal 1.0 / -1.0 limits (0dB ceiling)
                        if (tick === 1.0 || tick === -1.0) {
                            visualizerCtx.save();
                            visualizerCtx.strokeStyle = 'rgba(239, 68, 68, 0.45)'; // red-500
                            visualizerCtx.setLineDash([4, 4]);
                            visualizerCtx.beginPath();
                            visualizerCtx.moveTo(leftPadding, y);
                            visualizerCtx.lineTo(canvasLogicalWidth - rightPadding, y);
                            visualizerCtx.stroke();
                            visualizerCtx.restore();
                        }
                    });
                }

                // X-Axis Ticks
                if (currentMode === 'fft') {
                    // FFT Logarithmic ticks
                    fftTicks.forEach((freq) => {
                        const logF = Math.log(freq);
                        const ratio = (logF - logMin) / (logMax - logMin);
                        const x = leftPadding + ratio * plotWidth;

                        visualizerCtx.beginPath();
                        visualizerCtx.moveTo(x, canvasLogicalHeight - bottomPadding);
                        visualizerCtx.lineTo(x, canvasLogicalHeight - bottomPadding + tickLength);
                        visualizerCtx.stroke();

                        visualizerCtx.textAlign = 'center';
                        visualizerCtx.textBaseline = 'top';
                        visualizerCtx.fillText(formatFrequency(freq), x, canvasLogicalHeight - bottomPadding + tickLength + 4);
                    });

                    // X-Axis Title
                    visualizerCtx.textAlign = 'center';
                    visualizerCtx.textBaseline = 'top';
                    visualizerCtx.fillText('Frequency', canvasLogicalWidth / 2, canvasLogicalHeight - bottomPadding + xLabelOffset + 6);

                } else if (currentMode === 'loopMap' && cachedLoopMapBuffer) {
                    // Loop Map: draw ticks based on actual buffer duration
                    const dur = cachedLoopMapBuffer.duration;
                    const fractions = [0, 0.25, 0.5, 0.75, 1.0];
                    
                    fractions.forEach((frac) => {
                        const x = leftPadding + frac * plotWidth;
                        const secVal = frac * dur;

                        visualizerCtx.beginPath();
                        visualizerCtx.moveTo(x, canvasLogicalHeight - bottomPadding);
                        visualizerCtx.lineTo(x, canvasLogicalHeight - bottomPadding + tickLength);
                        visualizerCtx.stroke();

                        visualizerCtx.textAlign = 'center';
                        visualizerCtx.textBaseline = 'top';
                        visualizerCtx.fillText(`${secVal.toFixed(2)}s`, x, canvasLogicalHeight - bottomPadding + tickLength + 4);
                    });

                    visualizerCtx.textAlign = 'center';
                    visualizerCtx.textBaseline = 'top';
                    visualizerCtx.fillText('Time (Single Loop Cycle)', canvasLogicalWidth / 2, canvasLogicalHeight - bottomPadding + xLabelOffset + 6);

                } else {
                    // Live Oscilloscope X-ticks
                    const xTicks = [0, 0.25, 0.5, 0.75, 1.0];
                    xTicks.forEach((tick) => {
                        const x = leftPadding + tick * plotWidth;

                        visualizerCtx.beginPath();
                        visualizerCtx.moveTo(x, canvasLogicalHeight - bottomPadding);
                        visualizerCtx.lineTo(x, canvasLogicalHeight - bottomPadding + tickLength);
                        visualizerCtx.stroke();

                        visualizerCtx.textAlign = 'center';
                        visualizerCtx.textBaseline = 'top';
                        visualizerCtx.fillText(`${tick}s`, x, canvasLogicalHeight - bottomPadding + tickLength + 4);
                    });

                    visualizerCtx.textAlign = 'center';
                    visualizerCtx.textBaseline = 'top';
                    visualizerCtx.fillText('Time', canvasLogicalWidth / 2, canvasLogicalHeight - bottomPadding + xLabelOffset + 6);
                }

            } catch (e) {
                console.error("Visualizer drawing error:", e);
            }
        }

        // --- Recording Timer updates ---
        if (state.isRecording) {
            const elapsed = Tone.now() - state.recordingStartTime;
            const timeStr = actions.formatTime(elapsed);
            if (timeStr !== lastTimeStr) {
                lastTimeStr = timeStr;
                state.recordButton.textContent = `Stop Recording (${timeStr})`;
                state.recordButton.setAttribute('aria-label', `Stop recording (current elapsed time ${timeStr})`);
            }
        }
    }

    /**
     * Starts the requestAnimationFrame loop for real-time visual updates.
     *
     * @returns {void}
     */
    function startUiLoop() {
        if (!animationFrameId && (isVisualizerOn || state.isRecording)) {
            const loop = () => {
                runUiUpdate();
                animationFrameId = requestAnimationFrame(loop);
            };
            animationFrameId = requestAnimationFrame(loop);
        }
    }

    /**
     * Stops the requestAnimationFrame rendering loop.
     *
     * @returns {void}
     */
    function stopUiLoop() {
        if (animationFrameId && !state.isPlaying && !state.isRecording) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    /**
     * Toggles the visualizer active state, initializing the loop or clearing canvas.
     *
     * @returns {void}
     */
    function toggle() {
        isVisualizerOn = !isVisualizerOn;
        updatePauseButtonState();

        if (isVisualizerOn) {
            toggleVisualizerButton.textContent = "Disable Visualizer";
            toggleVisualizerButton.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
            toggleVisualizerButton.classList.remove('bg-green-600', 'hover:bg-green-700');
            
            // Switch Tone.Analyser on-the-fly based on current mode selection
            if (analyser) {
                analyser.type = currentMode === 'fft' ? 'fft' : 'waveform';
            }

            if (state.isPlaying || currentMode === 'loopMap') {
                startUiLoop();
                if (currentMode === 'loopMap') {
                    // Force instant redraw of static loop
                    runUiUpdate();
                }
            }
        } else {
            toggleVisualizerButton.textContent = "Enable Visualizer";
            toggleVisualizerButton.classList.remove('bg-yellow-600', 'hover:bg-yellow-700');
            toggleVisualizerButton.classList.add('bg-green-600', 'hover:bg-green-700');
            
            visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
            if (!state.isRecording) {
                stopUiLoop();
            }
        }
    }

    // --- Mode selector event wiring ---
    if (visualizerModeSelect) {
        visualizerModeSelect.addEventListener('change', () => {
            currentMode = visualizerModeSelect.value;
            isPaused = false; // Reset pause state when switching modes
            updatePauseButtonState();

            // Set analyser type on the fly
            if (analyser) {
                analyser.type = currentMode === 'fft' ? 'fft' : 'waveform';
            }

            // Force repaint or check loop status
            if (isVisualizerOn) {
                if (currentMode === 'loopMap') {
                    // In loopMap mode, we run a static render. Ensure loop runs to draw it
                    startUiLoop();
                    runUiUpdate();
                } else if (state.isPlaying) {
                    startUiLoop();
                } else {
                    // stopped and not map mode: clear display
                    visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
                }
            }
        });
    }

    // --- Pause button event wiring ---
    if (pauseVisualizerButton) {
        pauseVisualizerButton.addEventListener('click', () => {
            if (!isVisualizerOn || currentMode === 'loopMap') return;

            isPaused = !isPaused;
            updatePauseButtonState();
        });
    }

    /**
     * Receives and stores a static rendered buffer along with its trigger events markers
     * to display the arpeggio sequence loop.
     *
     * @param {AudioBuffer} audioBuffer - Rendered arpeggio sound buffer.
     * @param {Array<{note: string, timeRatio: number}>} markers - Timestamps for each note event.
     * @returns {void}
     */
    function updateStaticLoopMap(audioBuffer, markers) {
        cachedLoopMapBuffer = audioBuffer;
        cachedLoopMapMarkers = markers;

        // Force a redraw of the static loop map if visualizer is currently active and selected
        if (isVisualizerOn && currentMode === 'loopMap') {
            runUiUpdate();
        }
    }

    return {
        runUiUpdate,
        startUiLoop,
        stopUiLoop,
        get isVisualizerOn() { return isVisualizerOn; },
        get currentMode() { return currentMode; },
        toggle,
        resizeCanvas,
        updateStaticLoopMap
    };
}
