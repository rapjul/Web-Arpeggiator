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
import * as Tone from "tone";
import {
    findTriggerPoint,
    formatFrequencyLabel,
    reconstructChronologicalBuffer,
    writeToCircularBuffer,
} from "@core/visualizer-math.js";

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
 * @param {HTMLButtonElement} context.dom.pauseVisualizerButton  - Pause visualizer button.
 * @param {HTMLInputElement}  context.dom.visualizerZoomSlider   - Zoom slider input range.
 * @param {HTMLElement}       context.dom.visualizerZoomValue    - Text readout for zoom.
 * @param {HTMLSelectElement} context.dom.oscilloscopeWindowSelect - Select dropdown for time duration.
 * @param {HTMLElement}       context.dom.oscilloscopeWindowContainer - Container wrapper for time dropdown.
 * @param {HTMLElement}       [context.dom.vuMeterBar]           - Meter bar element.
 * @param {HTMLElement}       [context.dom.vuDbValue]            - Peak dB value text container.
 * @param {HTMLElement}       [context.dom.vuClipContainer]      - Clip reset button wrapper container.
 * @param {HTMLButtonElement} [context.dom.vuClipIndicator]      - Clip reset button indicator.
 * @param {HTMLElement}       [context.dom.vuClipTooltip]        - Clip reset button micro-tooltip.
 * @param {HTMLElement}       [context.dom.vuInfoButton]         - Info tooltip trigger button.
 * @param {HTMLElement}       [context.dom.vuInfoTooltip]        - Info tooltip container.
 * @param {HTMLInputElement}  [context.dom.envReleaseSlider]     - Envelope release slider input.
 * @param {object}   context.audio                               - Audio-engine references.
 * @param {Tone.Analyser}     context.audio.analyser             - Waveform/FFT analyser.
 * @param {Tone.Meter}        [context.audio.meter]              - Real-time smoothed VU meter node.
 * @param {Tone.Analyser}     [context.audio.peakAnalyser]       - Unsmoothed waveform peak detector.
 * @param {object}   context.state                               - Shared app state.
 * @param {boolean}  context.state.isRecording                   - Is recording active.
 * @param {number}   context.state.recordingStartTime            - Recording start time.
 * @param {HTMLElement}       context.state.recordButton         - Record button.
 * @param {boolean}  context.state.isPlaying                     - Is transport playing.
 * @param {string|null}       [context.state.activeNote]         - Active keyboard note.
 * @param {object}   context.actions                             - Injected action helpers.
 * @param {Function} context.actions.formatTime                  - Time formatting helper.
 * @returns {object} Public API.
 */
export function createVisualizer(context) {
    const { dom, audio, state, actions } = context;

    // --- DOM Elements ---
    const yAxisCanvas = dom.visualizerYAxisCanvas;
    const yAxisCtx = yAxisCanvas ? yAxisCanvas.getContext("2d") : null;
    const viewport = dom.visualizerViewport;
    const plotCanvas = dom.visualizerPlotCanvas;
    const plotCtx = plotCanvas ? plotCanvas.getContext("2d") : null;
    const toggleVisualizerButton = dom.toggleVisualizerButton;
    const visualizerModeSelect = dom.visualizerModeSelect;
    const pauseVisualizerButton = dom.pauseVisualizerButton;
    const zoomSlider = dom.visualizerZoomSlider;
    const zoomValueSpan = dom.visualizerZoomValue;
    const oscilloscopeWindowSelect = dom.oscilloscopeWindowSelect;
    const oscilloscopeWindowContainer = dom.oscilloscopeWindowContainer;
    const vuMeterBar = dom.vuMeterBar;
    const vuDbValue = dom.vuDbValue;
    const vuClipContainer = dom.vuClipContainer || document.getElementById("vu-clip-container");
    const vuClipIndicator = dom.vuClipIndicator;
    const vuClipTooltip = dom.vuClipTooltip || document.getElementById("vu-clip-tooltip");
    const vuInfoButton = dom.vuInfoButton || document.getElementById("vu-info-button");
    const vuInfoTooltip = dom.vuInfoTooltip || document.getElementById("vu-info-tooltip");
    const envReleaseSlider = dom.envReleaseSlider;
    const analyser = audio.analyser;
    const meter = audio.meter;
    const peakAnalyser = audio.peakAnalyser;

    const visualizerColors = {
        wave: "#38bdf8",
        grid: "#4b5563",
        label: "#9ca3af",
        marker: "rgb(156 163 175 / 0.4)",
        limit: "rgb(239 68 68 / 0.45)",
        danger: "#dc2626",
    };

    // Cache for linear gradient elements to avoid allocations on every frame
    let cachedGradient = null;
    let cachedGradientHeight = 0;

    // --- Internal State ---
    let isVisualizerOn = false;
    let isPaused = false;
    let isClipped = false;
    let isDestroyed = false;
    let currentMode = "oscilloscope"; // 'oscilloscope' | 'fft' | 'loopMap'
    let animationFrameId = null;
    let lastTimeStr = "";
    let zoomFactor = 1.0;

    /**
     * Reads current theme custom properties from the document root into the visualizer color cache.
     *
     * @returns {void}
     */
    function refreshThemeColors() {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        const themeStyles = getComputedStyle(document.documentElement);
        const themeColor = (token, fallback) =>
            themeStyles.getPropertyValue(token).trim() || fallback;
        visualizerColors.wave = themeColor("--ui-visualizer-wave", "#38bdf8");
        visualizerColors.grid = themeColor("--ui-visualizer-grid", "#4b5563");
        visualizerColors.label = themeColor("--ui-visualizer-label", "#9ca3af");
        visualizerColors.marker = themeColor("--ui-visualizer-marker", "rgb(156 163 175 / 0.4)");
        visualizerColors.limit = themeColor("--ui-visualizer-limit", "rgb(239 68 68 / 0.45)");
        visualizerColors.danger = themeColor("--ui-danger", "#dc2626");
        cachedGradient = null;
        cachedGradientHeight = 0;

        if (isVisualizerOn && !isPaused && (!state?.isPlaying || currentMode === "loopMap")) {
            runUiUpdate();
        }
    }

    refreshThemeColors();

    let themeObserver = null;
    let colorSchemeMediaQuery = null;
    let onColorSchemeChange = null;

    if (typeof window !== "undefined" && typeof document !== "undefined") {
        if (typeof MutationObserver !== "undefined") {
            themeObserver = new MutationObserver(() => {
                refreshThemeColors();
            });
            themeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ["data-theme", "class", "style"],
            });
        }
        if (typeof window.matchMedia === "function") {
            colorSchemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
            onColorSchemeChange = () => refreshThemeColors();
            colorSchemeMediaQuery.addEventListener?.("change", onColorSchemeChange);
        }
    }

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
        grad.addColorStop(0.0, visualizerColors.danger);
        grad.addColorStop(0.166, visualizerColors.danger);
        grad.addColorStop(0.167, visualizerColors.wave);
        grad.addColorStop(0.833, visualizerColors.wave);
        grad.addColorStop(0.834, visualizerColors.danger);
        grad.addColorStop(1.0, visualizerColors.danger);
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
        if (isVisualizerOn && currentMode === "loopMap" && !state.isPlaying) {
            runUiUpdate();
        }
    }

    // Bind event listener and do initial sizing
    window.addEventListener("resize", resizeCanvas);

    // Bind event listener to parent details accordion to resize canvas when opened
    const parentDetails = viewport ? viewport.closest("details") : null;
    function handleParentDetailsToggle() {
        if (parentDetails?.open) {
            resizeCanvas();
        }
    }
    if (parentDetails) {
        parentDetails.addEventListener("toggle", handleParentDetailsToggle);
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
        writeIndex = writeToCircularBuffer(rollingBuffer, newData, writeIndex);
    }

    /**
     * Reconstructs a chronological sequence of samples from the circular rolling buffer.
     *
     * @returns {Float32Array} Ordered array of accumulated waveform samples.
     */
    function getChronologicalBuffer() {
        return reconstructChronologicalBuffer(rollingBuffer, writeIndex);
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
        if (currentMode === "loopMap") {
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
            if (currentMode === "oscilloscope") {
                oscilloscopeWindowContainer.classList.remove("is-hidden");
            } else {
                oscilloscopeWindowContainer.classList.add("is-hidden");
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

        if (currentMode === "loopMap" || !isVisualizerOn) {
            // Disabled in static loopMap mode or when visualizer is off
            pauseVisualizerButton.disabled = true;
            pauseVisualizerButton.classList.add("opacity-50", "cursor-not-allowed", "bg-gray-600");
            pauseVisualizerButton.classList.remove(
                "bg-red-600",
                "hover:bg-red-700",
                "bg-green-600",
                "hover:bg-green-700",
            );
            pauseVisualizerButton.textContent = "Pause";
        } else {
            // Active during live Oscilloscope / FFT modes
            pauseVisualizerButton.disabled = false;
            pauseVisualizerButton.classList.remove(
                "opacity-50",
                "cursor-not-allowed",
                "bg-gray-600",
            );
            if (isPaused) {
                pauseVisualizerButton.textContent = "Resume";
                pauseVisualizerButton.classList.add("bg-green-600", "hover:bg-green-700");
                pauseVisualizerButton.classList.remove("bg-red-600", "hover:bg-red-700");
            } else {
                pauseVisualizerButton.textContent = "Pause";
                pauseVisualizerButton.classList.add("bg-red-600", "hover:bg-red-700");
                pauseVisualizerButton.classList.remove("bg-green-600", "hover:bg-green-700");
            }
        }
    }

    function formatFrequency(freq) {
        return formatFrequencyLabel(freq);
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
                if (!isPaused && (currentMode === "oscilloscope" || currentMode === "fft")) {
                    const nativeNode =
                        /** @type {any} */ (analyser)?.analyser ||
                        /** @type {any} */ (analyser)?._analyser;
                    if (nativeNode) {
                        if (currentMode === "fft") {
                            if (typeof nativeNode.getFloatFrequencyData === "function") {
                                nativeNode.getFloatFrequencyData(waveformBuffer);
                            }
                        } else {
                            if (typeof nativeNode.getFloatTimeDomainData === "function") {
                                nativeNode.getFloatTimeDomainData(waveformBuffer);
                                pushToRollingBuffer(waveformBuffer);
                            }
                        }
                    } else if (typeof analyser.getValue === "function") {
                        const val = analyser.getValue();
                        if (val instanceof Float32Array) {
                            waveformBuffer.set(
                                val.subarray(0, Math.min(val.length, waveformBuffer.length)),
                            );
                            if (currentMode === "oscilloscope") {
                                pushToRollingBuffer(val);
                            }
                        }
                    }
                }

                // Clear logical frames
                plotCtx.clearRect(0, 0, plotLogicalWidth, plotLogicalHeight);
                yAxisCtx.clearRect(0, 0, yAxisLogicalWidth, yAxisLogicalHeight);

                // --- Drawing Mode logic (Plot Canvas) ---
                if (currentMode === "oscilloscope") {
                    // Extract chronological data from rolling buffer
                    const chronBuffer = getChronologicalBuffer();

                    // Zero-crossing search (stabilize wave phase by aligning index at ascending zero threshold)
                    const triggerIndex = findTriggerPoint(chronBuffer);

                    // Get cached or updated linear gradient
                    const lineGrad = getVerticalGradient(
                        plotCtx,
                        topPadding,
                        plotLogicalHeight - bottomPadding,
                    );

                    // Draw the accumulated rolling waveform
                    plotCtx.beginPath();
                    plotCtx.strokeStyle = lineGrad;
                    plotCtx.lineWidth = 2;

                    const activePoints = chronBuffer.length - triggerIndex;
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
                } else if (currentMode === "fft") {
                    // Draw log-mapped FFT spectrum bar graph
                    const barCount = Math.floor(plotWidth / 3.5);
                    const barWidth = 2;
                    plotCtx.fillStyle = visualizerColors.wave;

                    for (let b = 0; b < barCount; b++) {
                        const ratio = b / barCount;
                        // Interpolate target frequency logarithmically
                        const freq = minFreq * (maxFreq / minFreq) ** ratio;

                        const nyquist = Tone.context.sampleRate / 2;
                        const binCount = waveformBuffer ? waveformBuffer.length : 1;
                        const binIndex = Math.min(
                            binCount - 1,
                            Math.max(0, Math.floor((freq / nyquist) * binCount)),
                        );

                        const db = waveformBuffer ? waveformBuffer[binIndex] : -100;

                        // Normalize dB from [-100, 0] scale
                        const minDb = -100;
                        const maxDb = 0;
                        const normalizedDb = Math.min(
                            1,
                            Math.max(0, (db - minDb) / (maxDb - minDb)),
                        );

                        const barHeight = normalizedDb * plotHeight;
                        const x = leftPadding + b * (plotWidth / barCount);
                        const y = plotLogicalHeight - bottomPadding - barHeight;

                        plotCtx.fillRect(x, y, barWidth, barHeight);
                    }
                } else if (currentMode === "loopMap" && cachedLoopMapBuffer) {
                    // Draw Static Loop Map waveform using dual min/max pixel downsampling
                    const channelData = cachedLoopMapBuffer.getChannelData(0);
                    const bufferLength = channelData.length;

                    const lineGrad = getVerticalGradient(
                        plotCtx,
                        topPadding,
                        plotLogicalHeight - bottomPadding,
                    );

                    plotCtx.beginPath();
                    plotCtx.strokeStyle = lineGrad;
                    plotCtx.lineWidth = 1.5;

                    for (let xPixel = 0; xPixel < plotWidth; xPixel++) {
                        const startSample = Math.floor((xPixel / plotWidth) * bufferLength);
                        const endSample = Math.min(
                            bufferLength,
                            Math.floor(((xPixel + 1) / plotWidth) * bufferLength),
                        );

                        let minVal = 0;
                        let maxVal = 0;
                        for (let s = startSample; s < endSample; s++) {
                            const val = channelData[s];
                            if (val < minVal) minVal = val;
                            if (val > maxVal) maxVal = val;
                        }

                        const x = leftPadding + xPixel;
                        const yMin =
                            plotLogicalHeight - bottomPadding - ((minVal + 1.5) / 3.0) * plotHeight;
                        const yMax =
                            plotLogicalHeight - bottomPadding - ((maxVal + 1.5) / 3.0) * plotHeight;

                        plotCtx.moveTo(x, yMin);
                        plotCtx.lineTo(x, yMax);
                    }
                    plotCtx.stroke();

                    // Render vertical markers indicating exact note trigger boundaries
                    cachedLoopMapMarkers.forEach((marker) => {
                        const x = leftPadding + marker.timeRatio * plotWidth;

                        // Vertical dotted marker line
                        plotCtx.save();
                        plotCtx.strokeStyle = visualizerColors.marker;
                        plotCtx.setLineDash([3, 3]);
                        plotCtx.beginPath();
                        plotCtx.moveTo(x, topPadding);
                        plotCtx.lineTo(x, plotLogicalHeight - bottomPadding);
                        plotCtx.stroke();
                        plotCtx.restore();

                        // Label trigger note name at top
                        plotCtx.fillStyle = visualizerColors.wave;
                        plotCtx.font = "bold 9px Arial";
                        plotCtx.textAlign = "center";
                        plotCtx.textBaseline = "top";
                        plotCtx.fillText(marker.note, x, topPadding - 12);
                    });
                }

                // --- Shared Axes and Labels rendering ---
                plotCtx.strokeStyle = visualizerColors.grid;
                plotCtx.lineWidth = 1;
                plotCtx.font = "10px Arial";
                plotCtx.fillStyle = visualizerColors.label;

                // Plot Area border lines (horizontal bounds only; Y-axis border acts as left boundary)
                plotCtx.beginPath();
                plotCtx.moveTo(leftPadding, plotLogicalHeight - bottomPadding);
                plotCtx.lineTo(plotLogicalWidth - rightPadding, plotLogicalHeight - bottomPadding);
                plotCtx.moveTo(leftPadding, topPadding);
                plotCtx.lineTo(plotLogicalWidth - rightPadding, topPadding);
                plotCtx.stroke();

                // Setup Y-axis canvas properties
                yAxisCtx.strokeStyle = visualizerColors.grid;
                yAxisCtx.lineWidth = 1;
                yAxisCtx.font = "10px Arial";
                yAxisCtx.fillStyle = visualizerColors.label;

                // Y-Axis Ticks
                if (currentMode === "fft") {
                    // FFT mode: render Decibel (dB) ticks on Y-axis canvas
                    const dbTicks = [0, -20, -40, -60, -80, -100];
                    dbTicks.forEach((tick) => {
                        const ratio = (tick - -100) / 100;
                        const y = yAxisLogicalHeight - bottomPadding - ratio * plotHeight;

                        yAxisCtx.beginPath();
                        yAxisCtx.moveTo(yAxisLogicalWidth - tickLength, y);
                        yAxisCtx.lineTo(yAxisLogicalWidth, y);
                        yAxisCtx.stroke();

                        yAxisCtx.textAlign = "right";
                        yAxisCtx.textBaseline = "middle";
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

                        yAxisCtx.textAlign = "right";
                        yAxisCtx.textBaseline = "middle";
                        yAxisCtx.fillText(tick.toFixed(1), yAxisLogicalWidth - tickLength - 4, y);

                        // Overlay red dashed guidelines at nominal 1.0 / -1.0 limits (0dB ceiling) on plot canvas
                        if (tick === 1.0 || tick === -1.0) {
                            plotCtx.save();
                            plotCtx.strokeStyle = visualizerColors.limit;
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
                if (currentMode === "fft") {
                    // FFT Logarithmic ticks
                    fftTicks.forEach((freq) => {
                        const logF = Math.log(freq);
                        const ratio = (logF - logMin) / (logMax - logMin);
                        const x = leftPadding + ratio * plotWidth;

                        plotCtx.beginPath();
                        plotCtx.moveTo(x, plotLogicalHeight - bottomPadding);
                        plotCtx.lineTo(x, plotLogicalHeight - bottomPadding + tickLength);
                        plotCtx.stroke();

                        plotCtx.textAlign = "center";
                        plotCtx.textBaseline = "top";
                        plotCtx.fillText(
                            formatFrequency(freq),
                            x,
                            plotLogicalHeight - bottomPadding + tickLength + 4,
                        );
                    });

                    // X-Axis Title
                    plotCtx.textAlign = "center";
                    plotCtx.textBaseline = "top";
                    plotCtx.fillText(
                        "Frequency",
                        plotLogicalWidth / 2,
                        plotLogicalHeight - bottomPadding + xLabelOffset + 6,
                    );
                } else if (currentMode === "loopMap" && cachedLoopMapBuffer) {
                    // Loop Map: draw ticks based on actual buffer duration
                    const dur = cachedLoopMapBuffer.duration;

                    TICK_FRACTIONS.forEach((frac) => {
                        const x = leftPadding + frac * plotWidth;
                        const secVal = frac * dur;

                        plotCtx.beginPath();
                        plotCtx.moveTo(x, plotLogicalHeight - bottomPadding);
                        plotCtx.lineTo(x, plotLogicalHeight - bottomPadding + tickLength);
                        plotCtx.stroke();

                        plotCtx.textAlign = "center";
                        plotCtx.textBaseline = "top";
                        plotCtx.fillText(
                            `${secVal.toFixed(2)}s`,
                            x,
                            plotLogicalHeight - bottomPadding + tickLength + 4,
                        );
                    });

                    plotCtx.textAlign = "center";
                    plotCtx.textBaseline = "top";
                    plotCtx.fillText(
                        "Time (Single Loop Cycle)",
                        plotLogicalWidth / 2,
                        plotLogicalHeight - bottomPadding + xLabelOffset + 6,
                    );
                } else {
                    // Live Oscilloscope X-ticks based on actual chosen duration
                    const durationMs = oscilloscopeWindowSelect
                        ? parseFloat(oscilloscopeWindowSelect.value)
                        : 50;
                    TICK_FRACTIONS.forEach((frac) => {
                        const x = leftPadding + frac * plotWidth;
                        const timeVal = frac * durationMs;

                        plotCtx.beginPath();
                        plotCtx.moveTo(x, plotLogicalHeight - bottomPadding);
                        plotCtx.lineTo(x, plotLogicalHeight - bottomPadding + tickLength);
                        plotCtx.stroke();

                        plotCtx.textAlign = "center";
                        plotCtx.textBaseline = "top";

                        // Display as seconds if duration is 1.0s, else milliseconds
                        const labelText =
                            durationMs >= 1000
                                ? `${(timeVal / 1000).toFixed(1)}s`
                                : `${timeVal.toFixed(0)}ms`;
                        plotCtx.fillText(
                            labelText,
                            x,
                            plotLogicalHeight - bottomPadding + tickLength + 4,
                        );
                    });

                    plotCtx.textAlign = "center";
                    plotCtx.textBaseline = "top";
                    plotCtx.fillText(
                        "Time",
                        plotLogicalWidth / 2,
                        plotLogicalHeight - bottomPadding + xLabelOffset + 6,
                    );
                }
            } catch (e) {
                console.error("Visualizer drawing error:", e);
            }
        }

        // --- Real-time Peak / VU Meter updates ---
        if (meter && vuMeterBar) {
            // 1. Calculate unsmoothed peak amplitude for instantaneous clipping detection
            let isPeakClipping = false;
            if (peakAnalyser) {
                const samples = peakAnalyser.getValue();
                if (samples instanceof Float32Array) {
                    let maxAbs = 0;
                    for (let i = 0; i < samples.length; i++) {
                        const abs = Math.abs(samples[i]);
                        if (abs > maxAbs) maxAbs = abs;
                    }
                    if (maxAbs >= 0.994) {
                        isPeakClipping = true;
                    }
                }
            }

            // 2. Read smoothed RMS meter value for display
            const rawVal = meter.getValue();
            const db = typeof rawVal === "number" && Number.isFinite(rawVal) ? rawVal : -Infinity;

            if (db <= -60 || !Number.isFinite(db)) {
                vuMeterBar.style.width = "0%";
                vuMeterBar.setAttribute("aria-valuenow", "-60");
                vuMeterBar.setAttribute("aria-valuetext", "Idle");
                if (vuDbValue) vuDbValue.textContent = "-- dB";
            } else {
                const clampedDb = Math.min(0, Math.max(-60, db));
                const pct = Math.max(0, Math.min(100, ((clampedDb + 60) / 60) * 100));
                vuMeterBar.style.width = `${pct.toFixed(1)}%`;
                vuMeterBar.setAttribute("aria-valuenow", clampedDb.toFixed(1));
                vuMeterBar.setAttribute("aria-valuetext", `${clampedDb.toFixed(1)} dBFS`);
                if (vuDbValue) {
                    vuDbValue.textContent = `${db >= 0 ? "+" : ""}${db.toFixed(1)} dB`;
                }
            }

            // Latch red clip indicator if unsmoothed peak hits full scale or meter reaches 0 dBFS
            if ((isPeakClipping || db >= 0) && !isClipped && vuClipIndicator) {
                isClipped = true;
                vuClipIndicator.disabled = false;
                vuClipIndicator.classList.remove(
                    "bg-gray-800",
                    "text-gray-400",
                    "border-gray-600",
                    "cursor-default",
                    "opacity-60",
                );
                vuClipIndicator.classList.add(
                    "bg-rose-600",
                    "text-white",
                    "border-rose-400",
                    "animate-pulse",
                    "cursor-pointer",
                    "opacity-100",
                );
                vuClipIndicator.setAttribute("aria-pressed", "true");
                vuClipIndicator.setAttribute("title", "Signal clipped — Click to reset");
                if (vuClipTooltip) {
                    vuClipTooltip.textContent = "Signal clipped — Click to reset";
                }
            }
        }

        // --- Recording Timer updates ---
        if (state.isRecording) {
            const elapsed = Tone.now() - state.recordingStartTime;
            const timeStr = actions.formatTime(elapsed);
            if (timeStr !== lastTimeStr) {
                lastTimeStr = timeStr;
                state.recordButton.textContent = `Stop Recording (${timeStr})`;
                state.recordButton.setAttribute(
                    "aria-label",
                    `Stop recording (current elapsed time ${timeStr})`,
                );
            }
        }
    }

    let manualNoteActive = false;
    let manualNoteDecayTimeout = null;

    /**
     * Determines whether the real-time UI animation loop should remain active.
     *
     * @returns {boolean} True if audio is playing/recording, or manual keyboard notes are active/decaying.
     */
    function shouldRunUiLoop() {
        return Boolean(
            state.isRecording ||
                state.isPlaying ||
                manualNoteActive ||
                Boolean(state.activeNote) ||
                manualNoteDecayTimeout,
        );
    }

    /**
     * Starts the requestAnimationFrame loop for real-time visual updates.
     *
     * @returns {void}
     */
    function startUiLoop() {
        if (!isDestroyed && animationFrameId === null && shouldRunUiLoop()) {
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
        if (animationFrameId !== null && !shouldRunUiLoop()) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
            if (vuMeterBar) {
                vuMeterBar.style.width = "0%";
                vuMeterBar.setAttribute("aria-valuenow", "-60");
                vuMeterBar.setAttribute("aria-valuetext", "Idle");
            }
            if (vuDbValue) vuDbValue.textContent = "-- dB";
        }
    }

    /**
     * Notifies the visualizer that a manual keyboard note attack has started.
     *
     * @returns {void}
     */
    function onManualNoteAttack() {
        if (manualNoteDecayTimeout) {
            clearTimeout(manualNoteDecayTimeout);
            manualNoteDecayTimeout = null;
        }
        manualNoteActive = true;
        startUiLoop();
    }

    /**
     * Notifies the visualizer that a manual keyboard note has been released,
     * maintaining the loop during the envelope release decay phase.
     *
     * @returns {void}
     */
    function onManualNoteRelease() {
        manualNoteActive = false;
        if (manualNoteDecayTimeout) {
            clearTimeout(manualNoteDecayTimeout);
        }
        const releaseSec = envReleaseSlider ? parseFloat(envReleaseSlider.value) : 0.5;
        const decayDurationMs =
            (Number.isFinite(releaseSec) ? Math.max(0.1, releaseSec) : 0.5) * 1000 + 400;

        manualNoteDecayTimeout = setTimeout(() => {
            manualNoteDecayTimeout = null;
            stopUiLoop();
        }, decayDurationMs);
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
            toggleVisualizerButton.classList.add("bg-yellow-600", "hover:bg-yellow-700");
            toggleVisualizerButton.classList.remove("bg-green-600", "hover:bg-green-700");

            // Switch Tone.Analyser on-the-fly based on current mode selection
            if (analyser) {
                analyser.type = currentMode === "fft" ? "fft" : "waveform";
            }

            if (currentMode === "loopMap") {
                runUiUpdate();
            } else if (shouldRunUiLoop()) {
                startUiLoop();
            }
        } else {
            toggleVisualizerButton.textContent = "Enable Visualizer";
            toggleVisualizerButton.classList.remove("bg-yellow-600", "hover:bg-yellow-700");
            toggleVisualizerButton.classList.add("bg-green-600", "hover:bg-green-700");

            if (plotCtx) plotCtx.clearRect(0, 0, plotCanvas.width, plotCanvas.height);
            if (yAxisCtx) yAxisCtx.clearRect(0, 0, yAxisCanvas.width, yAxisCanvas.height);
            if (!shouldRunUiLoop()) {
                stopUiLoop();
            }
        }
    }

    function handleModeChange() {
        currentMode = visualizerModeSelect.value;
        isPaused = false; // Reset pause state when switching modes
        updatePauseButtonState();

        // Set analyser type on the fly
        if (analyser) {
            analyser.type = currentMode === "fft" ? "fft" : "waveform";
        }

        applyDefaultZoom();
        updateControlsFooterVisibility();

        // Force repaint or check loop status
        if (isVisualizerOn) {
            if (currentMode === "loopMap") {
                // In loopMap mode, we run a static render.
                runUiUpdate();
            } else if (shouldRunUiLoop()) {
                startUiLoop();
            } else {
                // stopped and not map mode: clear display
                if (plotCtx) plotCtx.clearRect(0, 0, plotCanvas.width, plotCanvas.height);
                if (yAxisCtx) yAxisCtx.clearRect(0, 0, yAxisCanvas.width, yAxisCanvas.height);
            }
        }
    }

    function handlePauseClick() {
        if (!isVisualizerOn || currentMode === "loopMap") return;

        isPaused = !isPaused;
        updatePauseButtonState();
    }

    function handleZoomInput() {
        zoomFactor = parseFloat(zoomSlider.value);
        if (zoomValueSpan) {
            zoomValueSpan.textContent = `${zoomFactor.toFixed(1)}x`;
        }
        resizeCanvas();
    }

    function handleOscilloscopeWindowChange() {
        updateRollingBufferSize();
        if (isVisualizerOn) {
            runUiUpdate();
        }
    }

    // --- Mode selector event wiring ---
    if (visualizerModeSelect) {
        visualizerModeSelect.addEventListener("change", handleModeChange);
    }

    // --- Pause button event wiring ---
    if (pauseVisualizerButton) {
        pauseVisualizerButton.addEventListener("click", handlePauseClick);
    }

    // --- Zoom slider event wiring ---
    if (zoomSlider) {
        zoomSlider.addEventListener("input", handleZoomInput);
    }

    // --- Time Window selector event wiring ---
    if (oscilloscopeWindowSelect) {
        oscilloscopeWindowSelect.addEventListener("change", handleOscilloscopeWindowChange);
    }

    /**
     * Resets the latched clipping state and restores normal indicator appearance.
     *
     * @returns {void}
     */
    function resetClip() {
        isClipped = false;
        if (vuClipIndicator) {
            vuClipIndicator.disabled = true;
            vuClipIndicator.classList.remove(
                "bg-rose-600",
                "text-white",
                "border-rose-400",
                "animate-pulse",
                "cursor-pointer",
                "opacity-100",
            );
            vuClipIndicator.classList.add(
                "bg-gray-800",
                "text-gray-400",
                "border-gray-600",
                "cursor-default",
                "opacity-60",
            );
            vuClipIndicator.setAttribute("aria-pressed", "false");
            vuClipIndicator.setAttribute("title", "Clipping indicator (normal)");
        }
        if (vuClipTooltip) {
            vuClipTooltip.textContent = "No clipping detected";
        }
    }

    /**
     * Shows the clip button micro-tooltip.
     *
     * @returns {void}
     */
    function showClipTooltip() {
        if (vuClipTooltip) {
            vuClipTooltip.classList.remove("hidden");
        }
    }

    /**
     * Hides the clip button micro-tooltip.
     *
     * @returns {void}
     */
    function hideClipTooltip() {
        if (vuClipTooltip) {
            vuClipTooltip.classList.add("hidden");
        }
    }

    if (vuClipIndicator) {
        vuClipIndicator.addEventListener("click", resetClip);
    }

    const clipTarget = vuClipContainer || vuClipIndicator;
    if (clipTarget && vuClipTooltip) {
        clipTarget.addEventListener("mouseenter", showClipTooltip);
        clipTarget.addEventListener("mouseleave", hideClipTooltip);
        clipTarget.addEventListener("focusin", showClipTooltip);
        clipTarget.addEventListener("focusout", hideClipTooltip);
    }

    /**
     * Shows the peak meter info tooltip and updates its ARIA state.
     *
     * @returns {void}
     */
    function showInfoTooltip() {
        if (vuInfoTooltip) {
            vuInfoTooltip.classList.remove("hidden");
        }
        if (vuInfoButton) {
            vuInfoButton.setAttribute("aria-expanded", "true");
        }
    }

    /**
     * Hides the peak meter info tooltip and updates its ARIA state.
     *
     * @returns {void}
     */
    function hideInfoTooltip() {
        if (vuInfoTooltip) {
            vuInfoTooltip.classList.add("hidden");
        }
        if (vuInfoButton) {
            vuInfoButton.setAttribute("aria-expanded", "false");
        }
    }

    function handleInfoButtonClick(event) {
        event.stopPropagation();
        if (vuInfoTooltip.classList.contains("hidden")) {
            showInfoTooltip();
        } else {
            hideInfoTooltip();
        }
    }

    function handleDocumentKeydown(event) {
        if (event.key === "Escape" && !vuInfoTooltip.classList.contains("hidden")) {
            hideInfoTooltip();
            vuInfoButton.focus();
        }
    }

    function handleDocumentClick(event) {
        if (
            !vuInfoTooltip.classList.contains("hidden") &&
            event.target !== vuInfoButton &&
            !vuInfoButton.contains(/** @type {Node} */ (event.target)) &&
            !vuInfoTooltip.contains(/** @type {Node} */ (event.target))
        ) {
            hideInfoTooltip();
        }
    }

    if (vuInfoButton && vuInfoTooltip) {
        // Desktop: Hover & Focus
        vuInfoButton.addEventListener("mouseenter", showInfoTooltip);
        vuInfoButton.addEventListener("mouseleave", hideInfoTooltip);
        vuInfoButton.addEventListener("focus", showInfoTooltip);
        vuInfoButton.addEventListener("blur", hideInfoTooltip);

        // Mobile/Touch: Tap toggle
        vuInfoButton.addEventListener("click", handleInfoButtonClick);

        // Global dismiss on Escape key or outside click
        document.addEventListener("keydown", handleDocumentKeydown);
        document.addEventListener("click", handleDocumentClick);
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
        if (isVisualizerOn && currentMode === "loopMap") {
            runUiUpdate();
        }
    }

    // Trigger default zoom configuration
    applyDefaultZoom();

    /**
     * Releases browser resources owned by this visualizer instance.
     *
     * @returns {void}
     */
    function destroy() {
        if (isDestroyed) return;
        isDestroyed = true;

        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (manualNoteDecayTimeout) {
            clearTimeout(manualNoteDecayTimeout);
            manualNoteDecayTimeout = null;
        }
        manualNoteActive = false;

        window.removeEventListener("resize", resizeCanvas);
        parentDetails?.removeEventListener("toggle", handleParentDetailsToggle);
        visualizerModeSelect?.removeEventListener("change", handleModeChange);
        pauseVisualizerButton?.removeEventListener("click", handlePauseClick);
        zoomSlider?.removeEventListener("input", handleZoomInput);
        oscilloscopeWindowSelect?.removeEventListener("change", handleOscilloscopeWindowChange);
        vuClipIndicator?.removeEventListener("click", resetClip);
        clipTarget?.removeEventListener("mouseenter", showClipTooltip);
        clipTarget?.removeEventListener("mouseleave", hideClipTooltip);
        clipTarget?.removeEventListener("focusin", showClipTooltip);
        clipTarget?.removeEventListener("focusout", hideClipTooltip);
        vuInfoButton?.removeEventListener("mouseenter", showInfoTooltip);
        vuInfoButton?.removeEventListener("mouseleave", hideInfoTooltip);
        vuInfoButton?.removeEventListener("focus", showInfoTooltip);
        vuInfoButton?.removeEventListener("blur", hideInfoTooltip);
        vuInfoButton?.removeEventListener("click", handleInfoButtonClick);
        document.removeEventListener("keydown", handleDocumentKeydown);
        document.removeEventListener("click", handleDocumentClick);
        if (themeObserver) {
            themeObserver.disconnect();
            themeObserver = null;
        }
        colorSchemeMediaQuery?.removeEventListener?.("change", onColorSchemeChange);
        colorSchemeMediaQuery = null;
        onColorSchemeChange = null;
        hideClipTooltip();
        hideInfoTooltip();
    }

    return {
        destroy,
        runUiUpdate,
        startUiLoop,
        stopUiLoop,
        onManualNoteAttack,
        onManualNoteRelease,
        get isVisualizerOn() {
            return isVisualizerOn;
        },
        get currentMode() {
            return currentMode;
        },
        get isClipped() {
            return isClipped;
        },
        resetClip,
        toggle,
        resizeCanvas,
        updateStaticLoopMap,
        refreshThemeColors,
        get visualizerColors() {
            return visualizerColors;
        },
    };
}
