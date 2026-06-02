/**
 * Visualizer Module
 *
 * Owns the waveform canvas rendering, the 30 Hz UI update loop, and the
 * visualizer mode/pause/zoom/time-window controls.
 * Exposes a factory function so the caller (app.js) can
 * inject the analyzer node, DOM references, and shared state.
 *
 * @module visualizer
 */
import * as Tone from 'tone';

/**
 * Creates the waveform visualizer and UI update loop.
 *
 * @param {object}   context                                     - Injected app context.
 * @param {object}   context.dom                                 - DOM element references.
 * @param {HTMLCanvasElement} context.dom.visualizerYAxisCanvas  - Canvas element for Y-axis scale.
 * @param {HTMLElement}       context.dom.visualizerViewport     - Scrollable viewport container.
 * @param {HTMLCanvasElement} context.dom.visualizerPlotCanvas   - Canvas element for visualizer drawings.
 * @param {HTMLElement}       context.dom.toggleVisualizerButton - Toggle visualizer button.
 * @param {HTMLSelectElement} context.dom.visualizerModeSelect   - Dropdown select for mode.
 * @param {HTMLButtonElement}  context.dom.pauseVisualizerButton  - Pause visualizer button.
 * @param {HTMLInputElement}  context.dom.visualizerZoomSlider   - Zoom slider input range.
 * @param {HTMLElement}       context.dom.visualizerZoomValue    - Text readout for zoom.
 * @param {HTMLSelectElement} context.dom.oscilloscopeWindowSelect - Select dropdown for time duration.
 * @param {HTMLElement}       context.dom.oscilloscopeWindowContainer - Container wrapper for time dropdown.
 * @param {object}   context.audio                               - Audio-engine references.
 * @param {Tone.Analyser}     context.audio.analyser             - Waveform/FFT analyser.
 * @param {object}   context.state                               - Shared app state.
 * @param {boolean}  context.state.isRecording                   - Is recording active.
 * @param {number}   context.state.recordingStartTime            - Recording start time.
 * @param {HTMLElement}       context.state.recordButton         - Record button.
 * @param {boolean}  context.state.isPlaying                     - Is transport playing.
 * @param {object}   context.actions                             - Injected action helpers.
 * @param {Function} context.actions.formatTime                  - Time formatting helper.
 * @returns {object} Public API.
 */
export function createVisualizer(context) {
    const { dom, audio, state, actions } = context;

    // --- DOM Elements ---
    const yAxisCanvas = dom.visualizerYAxisCanvas;
    const yAxisCtx = yAxisCanvas ? yAxisCanvas.getContext('2d') : null;
    const viewport = dom.visualizerViewport;
    const plotCanvas = dom.visualizerPlotCanvas;
    const plotCtx = plotCanvas ? plotCanvas.getContext('2d') : null;
    const toggleVisualizerButton = dom.toggleVisualizerButton;
    const visualizerModeSelect = dom.visualizerModeSelect;
    const pauseVisualizerButton = dom.pauseVisualizerButton;
    const zoomSlider = dom.visualizerZoomSlider;
    const zoomValueSpan = dom.visualizerZoomValue;
    const oscilloscopeWindowSelect = dom.oscilloscopeWindowSelect;
    const oscilloscopeWindowContainer = dom.oscilloscopeWindowContainer;
    const analyser = audio.analyser;

    // --- Internal State ---
    let isVisualizerOn = false;
    let isPaused = false;
    let currentMode = 'oscilloscope'; // 'oscilloscope' | 'fft' | 'loopMap'
    let animationFrameId = null;
    let lastTimeStr = '';
    let zoomFactor = 1.0;

    // --- Rolling Buffer for Oscilloscope ---
    let rollingBuffer = new Float32Array(0);
    let rollingBufferCapacity = 0;
    let writeIndex = 0;

    // Static tick coordinate arrays for Oscilloscope / Loop Map
    const yTicks = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5];

    // FFT frequency tick values (Hz) to plot logarithmically
    const fftTicks = [100, 500, 1000, 5000, 10000];

    // Tick fractions used for rendering axes ticks
    const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1.0];

    // Logarithmic frequency bounds for FFT mode
    const minFreq = 40;
    const maxFreq = 16000;
    const logMin = Math.log(minFreq);
    const logMax = Math.log(maxFreq);

    // Cache for background-rendered arpeggio loop data
    let cachedLoopMapBuffer = null;
    let cachedLoopMapMarkers = [];

    // Cache for linear gradient elements to avoid allocations on every frame
    let cachedGradient = null;
    let cachedGradientHeight = 0;

    // Persistent buffer for waveform / FFT values to prevent memory allocations
    const waveformBuffer = analyser ? new Float32Array(analyser.size) : null;

    /**
     * Helper to get or build the linear vertical gradient based on logical height.
     *
     * @param {CanvasRenderingContext2D} ctx - Context to create the gradient in.
     * @param {number} top - Top padding offset.
     * @param {number} height - Logical height boundary.
     * @returns {CanvasGradient} The cached or newly created gradient.
     */
    function getVerticalGradient(ctx, top, height) {
        if (cachedGradient && cachedGradientHeight === height) {
            return cachedGradient;
        }
        const grad = ctx.createLinearGradient(0, top, 0, height);
        grad.addColorStop(0.0, '#EF4444');      // Red at +1.5 (highest headroom)
        grad.addColorStop(0.166, '#EF4444');    // Red at +1.0 (clipping limit boundary)
        grad.addColorStop(0.167, '#38BDF8');    // Blue/Cyan inside nominal bounds
        grad.addColorStop(0.833, '#38BDF8');    // Blue/Cyan inside nominal bounds
        grad.addColorStop(0.834, '#EF4444');    // Red at -1.0 (clipping limit boundary)
        grad.addColorStop(1.0, '#EF4444');      // Red at -1.5 (lowest headroom)
        cachedGradient = grad;
        cachedGradientHeight = height;
        return grad;
    }

    /**
     * Resizes the Y-axis and plot canvases based on container size and zoom levels,
     * accounting for high-DPI retina displays to ensure crisp lines.
     *
     * @returns {void}
     */
    function resizeCanvas() {
        if (!yAxisCanvas || !plotCanvas || !viewport) return;

        // Invalidate cached gradient because the heights are changing
        cachedGradient = null;
        cachedGradientHeight = 0;

        const dpr = window.devicePixelRatio || 1;

        // 1. Size the Y-axis canvas (fixed width 50px)
        const yAxisRect = yAxisCanvas.getBoundingClientRect();
        yAxisCanvas.width = yAxisRect.width * dpr;
        yAxisCanvas.height = yAxisRect.height * dpr;
        if (yAxisCtx) {
            yAxisCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset scale
            yAxisCtx.scale(dpr, dpr);
        }

        // 2. Size the plot canvas based on viewport width and zoom level
        const viewportWidth = viewport.clientWidth;
        const plotWidth = viewportWidth * zoomFactor;
        const plotHeight = viewport.clientHeight;

        plotCanvas.style.width = `${plotWidth}px`;
        plotCanvas.style.height = `${plotHeight}px`;

        plotCanvas.width = plotWidth * dpr;
        plotCanvas.height = plotHeight * dpr;
        if (plotCtx) {
            plotCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset scale
            plotCtx.scale(dpr, dpr);
        }

        // If visualizer is enabled but audio is stopped (static map mode), redraw the static buffer immediately
        if (isVisualizerOn && currentMode === 'loopMap' && !state.isPlaying) {
            runUiUpdate();
        }
    }

    // Bind event listener and do initial sizing
    window.addEventListener('resize', resizeCanvas);

    // Bind event listener to parent details accordion to resize canvas when opened
    const parentDetails = viewport ? viewport.closest('details') : null;
    if (parentDetails) {
        parentDetails.addEventListener('toggle', () => {
            if (parentDetails.open) {
                resizeCanvas();
            }
        });
    }

    resizeCanvas();

    /**
     * Updates the size/capacity of the rolling buffer according to the selected timeframe.
     *
     * @returns {void}
     */
    function updateRollingBufferSize() {
        if (!oscilloscopeWindowSelect) return;
        const sampleRate = Tone.context.sampleRate || 48000;
        const durationSeconds = parseFloat(oscilloscopeWindowSelect.value) / 1000;
        rollingBufferCapacity = Math.round(sampleRate * durationSeconds);
        rollingBuffer = new Float32Array(rollingBufferCapacity);
        writeIndex = 0;
    }

    /**
     * Pushes new Float32Array samples into the circular rolling buffer.
     *
     * @param {Float32Array} newData - Incoming time domain data samples.
     * @returns {void}
     */
    function pushToRollingBuffer(newData) {
        if (rollingBufferCapacity === 0) return;
        for (let i = 0; i < newData.length; i++) {
            rollingBuffer[writeIndex] = newData[i];
            writeIndex = (writeIndex + 1) % rollingBufferCapacity;
        }
    }

    /**
     * Reconstructs a chronological sequence of samples from the circular rolling buffer.
     *
     * @returns {Float32Array} Ordered array of accumulated waveform samples.
     */
    function getChronologicalBuffer() {
        const buf = new Float32Array(rollingBufferCapacity);
        const part1 = rollingBuffer.subarray(writeIndex);
        const part2 = rollingBuffer.subarray(0, writeIndex);
        buf.set(part1, 0);
        buf.set(part2, part1.length);
        return buf;
    }

    // Initialize rolling buffer size
    updateRollingBufferSize();

    /**
     * Sets the visualizer zoom factor, updating the zoom slider UI.
     *
     * @param {number} factor - Zoom multiplier (e.g. 1.0 to 8.0).
     * @returns {void}
     */
    function setZoom(factor) {
        zoomFactor = factor;
        if (zoomSlider) {
            zoomSlider.value = String(factor);
        }
        if (zoomValueSpan) {
            zoomValueSpan.textContent = `${factor.toFixed(1)}x`;
        }
        resizeCanvas();
    }

    /**
     * Applies the dynamic default zoom for the current mode based on container width.
     * In loopMap mode, sets a default zoom on narrow screens so notes aren't compressed.
     *
     * @returns {void}
     */
    function applyDefaultZoom() {
        if (!viewport) return;

        const width = viewport.clientWidth;
        if (currentMode === 'loopMap') {
            if (width < 600) {
                const neededZoom = Math.max(1.5, 600 / width);
                setZoom(neededZoom);
            } else {
                setZoom(1.0);
            }
        } else {
            setZoom(1.0);
        }
    }

    /**
     * Toggles visibility of the Zoom and Time Window controls based on mode.
     *
     * @returns {void}
     */
    function updateControlsFooterVisibility() {
        if (oscilloscopeWindowContainer) {
            if (currentMode === 'oscilloscope') {
                oscilloscopeWindowContainer.style.display = 'flex';
            } else {
                oscilloscopeWindowContainer.style.display = 'none';
            }
        }
    }

    // Setup initial controls footer state
    updateControlsFooterVisibility();

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
        if (isVisualizerOn && analyser && plotCanvas && yAxisCanvas && plotCtx && yAxisCtx) {
            try {
                const dpr = window.devicePixelRatio || 1;
                const plotLogicalWidth = plotCanvas.width / dpr;
                const plotLogicalHeight = plotCanvas.height / dpr;
                const yAxisLogicalWidth = yAxisCanvas.width / dpr;
                const yAxisLogicalHeight = yAxisCanvas.height / dpr;

                // --- Layout Constants ---
                const leftPadding = 5; // Small padding for plot canvas
                const rightPadding = 15;
                const topPadding = 20;
                const bottomPadding = 40;

                const plotWidth = plotLogicalWidth - leftPadding - rightPadding;
                const plotHeight = plotLogicalHeight - topPadding - bottomPadding;
                const tickLength = 6;
                const xLabelOffset = 18;

                // Only grab/refresh the audio buffers if the visualizer is NOT paused and we are in a live mode
                if (!isPaused && (currentMode === 'oscilloscope' || currentMode === 'fft')) {
                    const nativeNode = /** @type {any} */ (analyser)?.analyser || /** @type {any} */ (analyser)?._analyser;
                    if (nativeNode) {
                        if (currentMode === 'fft') {
                            if (typeof nativeNode.getFloatFrequencyData === 'function') {
                                nativeNode.getFloatFrequencyData(waveformBuffer);
                            }
                        } else {
                            if (typeof nativeNode.getFloatTimeDomainData === 'function') {
                                nativeNode.getFloatTimeDomainData(waveformBuffer);
                                pushToRollingBuffer(waveformBuffer);
                            }
                        }
                    } else if (typeof analyser.getValue === 'function') {
                        const val = analyser.getValue();
                        if (val instanceof Float32Array) {
                            waveformBuffer.set(val);
                            if (currentMode === 'oscilloscope') {
                                pushToRollingBuffer(val);
                            }
                        }
                    }
                }

                // Clear logical frames
                plotCtx.clearRect(0, 0, plotLogicalWidth, plotLogicalHeight);
                yAxisCtx.clearRect(0, 0, yAxisLogicalWidth, yAxisLogicalHeight);

                // --- Drawing Mode logic (Plot Canvas) ---
                if (currentMode === 'oscilloscope') {
                    // Extract chronological data from rolling buffer
                    const chronBuffer = getChronologicalBuffer();

                    // Zero-crossing search (stabilize wave phase by aligning index at ascending zero threshold)
                    let triggerIndex = 0;
                    const displayLength = chronBuffer.length;
                    for (let i = 0; i < displayLength / 2; i++) {
                        if (chronBuffer[i] < 0 && chronBuffer[i + 1] >= 0) {
                            triggerIndex = i;
                            break;
                        }
                    }

                    // Get cached or updated linear gradient
                    const lineGrad = getVerticalGradient(plotCtx, topPadding, plotLogicalHeight - bottomPadding);

                    // Draw the accumulated rolling waveform
                    plotCtx.beginPath();
                    plotCtx.strokeStyle = lineGrad;
                    plotCtx.lineWidth = 2;

                    const activePoints = displayLength - triggerIndex;
                    for (let i = 0; i < activePoints; i++) {
                        const val = chronBuffer[triggerIndex + i];
                        const x = leftPadding + (i / activePoints) * plotWidth;

                        // Map Y coordinates across the ±1.5 range (normalized offset = (val + 1.5) / 3.0)
                        const normalizedY = (val + 1.5) / 3.0;
                        const y = plotLogicalHeight - bottomPadding - normalizedY * plotHeight;

                        if (i === 0) {
                            plotCtx.moveTo(x, y);
                        } else {
                            plotCtx.lineTo(x, y);
                        }
                    }
                    plotCtx.stroke();

                } else if (currentMode === 'fft') {
                    // Draw log-mapped FFT spectrum bar graph
                    const barCount = Math.floor(plotWidth / 3.5);
                    const barWidth = 2;
                    plotCtx.fillStyle = '#38BDF8';

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
                        const y = plotLogicalHeight - bottomPadding - barHeight;

                        plotCtx.fillRect(x, y, barWidth, barHeight);
                    }

                } else if (currentMode === 'loopMap' && cachedLoopMapBuffer) {
                    // Draw Static Loop Map waveform using dual min/max pixel downsampling
                    const channelData = cachedLoopMapBuffer.getChannelData(0);
                    const bufferLength = channelData.length;

                    const lineGrad = getVerticalGradient(plotCtx, topPadding, plotLogicalHeight - bottomPadding);

                    plotCtx.beginPath();
                    plotCtx.strokeStyle = lineGrad;
                    plotCtx.lineWidth = 1.5;

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
                        const yMin = plotLogicalHeight - bottomPadding - ((minVal + 1.5) / 3.0) * plotHeight;
                        const yMax = plotLogicalHeight - bottomPadding - ((maxVal + 1.5) / 3.0) * plotHeight;

                        plotCtx.moveTo(x, yMin);
                        plotCtx.lineTo(x, yMax);
                    }
                    plotCtx.stroke();

                    // Render vertical markers indicating exact note trigger boundaries
                    cachedLoopMapMarkers.forEach((marker) => {
                        const x = leftPadding + marker.timeRatio * plotWidth;

                        // Vertical dotted marker line
                        plotCtx.save();
                        plotCtx.strokeStyle = 'rgba(156, 163, 175, 0.4)'; // gray-400
                        plotCtx.setLineDash([3, 3]);
                        plotCtx.beginPath();
                        plotCtx.moveTo(x, topPadding);
                        plotCtx.lineTo(x, plotLogicalHeight - bottomPadding);
                        plotCtx.stroke();
                        plotCtx.restore();

                        // Label trigger note name at top
                        plotCtx.fillStyle = '#60A5FA'; // blue-400
                        plotCtx.font = 'bold 9px Arial';
                        plotCtx.textAlign = 'center';
                        plotCtx.textBaseline = 'top';
                        plotCtx.fillText(marker.note, x, topPadding - 12);
                    });
                }

                // --- Shared Axes and Labels rendering ---
                plotCtx.strokeStyle = '#4B5563';  // gray-700
                plotCtx.lineWidth = 1;
                plotCtx.font = '10px Arial';
                plotCtx.fillStyle = '#9CA3AF';   // gray-400

                // Plot Area border lines (horizontal bounds only; Y-axis border acts as left boundary)
                plotCtx.beginPath();
                plotCtx.moveTo(leftPadding, plotLogicalHeight - bottomPadding);
                plotCtx.lineTo(plotLogicalWidth - rightPadding, plotLogicalHeight - bottomPadding);
                plotCtx.moveTo(leftPadding, topPadding);
                plotCtx.lineTo(plotLogicalWidth - rightPadding, topPadding);
                plotCtx.stroke();

                // Setup Y-axis canvas properties
                yAxisCtx.strokeStyle = '#4B5563';
                yAxisCtx.lineWidth = 1;
                yAxisCtx.font = '10px Arial';
                yAxisCtx.fillStyle = '#9CA3AF';

                // Y-Axis Ticks
                if (currentMode === 'fft') {
                    // FFT mode: render Decibel (dB) ticks on Y-axis canvas
                    const dbTicks = [0, -20, -40, -60, -80, -100];
                    dbTicks.forEach((tick) => {
                        const ratio = (tick - (-100)) / 100;
                        const y = yAxisLogicalHeight - bottomPadding - ratio * plotHeight;

                        yAxisCtx.beginPath();
                        yAxisCtx.moveTo(yAxisLogicalWidth - tickLength, y);
                        yAxisCtx.lineTo(yAxisLogicalWidth, y);
                        yAxisCtx.stroke();

                        yAxisCtx.textAlign = 'right';
                        yAxisCtx.textBaseline = 'middle';
                        yAxisCtx.fillText(`${tick}dB`, yAxisLogicalWidth - tickLength - 4, y);
                    });
                } else {
                    // Oscilloscope and Loop Map modes: render ±1.5 scale Y-ticks on Y-axis canvas
                    yTicks.forEach((tick) => {
                        const ratio = (tick + 1.5) / 3.0;
                        const y = yAxisLogicalHeight - bottomPadding - ratio * plotHeight;

                        yAxisCtx.beginPath();
                        yAxisCtx.moveTo(yAxisLogicalWidth - tickLength, y);
                        yAxisCtx.lineTo(yAxisLogicalWidth, y);
                        yAxisCtx.stroke();

                        yAxisCtx.textAlign = 'right';
                        yAxisCtx.textBaseline = 'middle';
                        yAxisCtx.fillText(tick.toFixed(1), yAxisLogicalWidth - tickLength - 4, y);

                        // Overlay red dashed guidelines at nominal 1.0 / -1.0 limits (0dB ceiling) on plot canvas
                        if (tick === 1.0 || tick === -1.0) {
                            plotCtx.save();
                            plotCtx.strokeStyle = 'rgba(239, 68, 68, 0.45)'; // red-500
                            plotCtx.setLineDash([4, 4]);
                            plotCtx.beginPath();
                            plotCtx.moveTo(leftPadding, y);
                            plotCtx.lineTo(plotLogicalWidth - rightPadding, y);
                            plotCtx.stroke();
                            plotCtx.restore();
                        }
                    });
                }

                // X-Axis Ticks (rendered on the plot canvas)
                if (currentMode === 'fft') {
                    // FFT Logarithmic ticks
                    fftTicks.forEach((freq) => {
                        const logF = Math.log(freq);
                        const ratio = (logF - logMin) / (logMax - logMin);
                        const x = leftPadding + ratio * plotWidth;

                        plotCtx.beginPath();
                        plotCtx.moveTo(x, plotLogicalHeight - bottomPadding);
                        plotCtx.lineTo(x, plotLogicalHeight - bottomPadding + tickLength);
                        plotCtx.stroke();

                        plotCtx.textAlign = 'center';
                        plotCtx.textBaseline = 'top';
                        plotCtx.fillText(formatFrequency(freq), x, plotLogicalHeight - bottomPadding + tickLength + 4);
                    });

                    // X-Axis Title
                    plotCtx.textAlign = 'center';
                    plotCtx.textBaseline = 'top';
                    plotCtx.fillText('Frequency', plotLogicalWidth / 2, plotLogicalHeight - bottomPadding + xLabelOffset + 6);

                } else if (currentMode === 'loopMap' && cachedLoopMapBuffer) {
                    // Loop Map: draw ticks based on actual buffer duration
                    const dur = cachedLoopMapBuffer.duration;

                    TICK_FRACTIONS.forEach((frac) => {
                        const x = leftPadding + frac * plotWidth;
                        const secVal = frac * dur;

                        plotCtx.beginPath();
                        plotCtx.moveTo(x, plotLogicalHeight - bottomPadding);
                        plotCtx.lineTo(x, plotLogicalHeight - bottomPadding + tickLength);
                        plotCtx.stroke();

                        plotCtx.textAlign = 'center';
                        plotCtx.textBaseline = 'top';
                        plotCtx.fillText(`${secVal.toFixed(2)}s`, x, plotLogicalHeight - bottomPadding + tickLength + 4);
                    });

                    plotCtx.textAlign = 'center';
                    plotCtx.textBaseline = 'top';
                    plotCtx.fillText('Time (Single Loop Cycle)', plotLogicalWidth / 2, plotLogicalHeight - bottomPadding + xLabelOffset + 6);

                } else {
                    // Live Oscilloscope X-ticks based on actual chosen duration
                    const durationMs = oscilloscopeWindowSelect ? parseFloat(oscilloscopeWindowSelect.value) : 50;
                    TICK_FRACTIONS.forEach((frac) => {
                        const x = leftPadding + frac * plotWidth;
                        const timeVal = frac * durationMs;

                        plotCtx.beginPath();
                        plotCtx.moveTo(x, plotLogicalHeight - bottomPadding);
                        plotCtx.lineTo(x, plotLogicalHeight - bottomPadding + tickLength);
                        plotCtx.stroke();

                        plotCtx.textAlign = 'center';
                        plotCtx.textBaseline = 'top';

                        // Display as seconds if duration is 1.0s, else milliseconds
                        const labelText = durationMs >= 1000 ? `${(timeVal / 1000).toFixed(1)}s` : `${timeVal.toFixed(0)}ms`;
                        plotCtx.fillText(labelText, x, plotLogicalHeight - bottomPadding + tickLength + 4);
                    });

                    plotCtx.textAlign = 'center';
                    plotCtx.textBaseline = 'top';
                    plotCtx.fillText('Time', plotLogicalWidth / 2, plotLogicalHeight - bottomPadding + xLabelOffset + 6);
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
     * Toggles the visualizer active state, initializing the loop or clearing canvases.
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

            if (plotCtx) plotCtx.clearRect(0, 0, plotCanvas.width, plotCanvas.height);
            if (yAxisCtx) yAxisCtx.clearRect(0, 0, yAxisCanvas.width, yAxisCanvas.height);
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

            applyDefaultZoom();
            updateControlsFooterVisibility();

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
                    if (plotCtx) plotCtx.clearRect(0, 0, plotCanvas.width, plotCanvas.height);
                    if (yAxisCtx) yAxisCtx.clearRect(0, 0, yAxisCanvas.width, yAxisCanvas.height);
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

    // --- Zoom slider event wiring ---
    if (zoomSlider) {
        zoomSlider.addEventListener('input', () => {
            zoomFactor = parseFloat(zoomSlider.value);
            if (zoomValueSpan) {
                zoomValueSpan.textContent = `${zoomFactor.toFixed(1)}x`;
            }
            resizeCanvas();
        });
    }

    // --- Time Window selector event wiring ---
    if (oscilloscopeWindowSelect) {
        oscilloscopeWindowSelect.addEventListener('change', () => {
            updateRollingBufferSize();
            if (isVisualizerOn) {
                runUiUpdate();
            }
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

    // Trigger default zoom configuration
    applyDefaultZoom();

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
