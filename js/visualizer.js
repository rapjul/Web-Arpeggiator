/**
 * Visualizer Module
 *
 * Owns the waveform canvas rendering, the 30 Hz UI update loop, and the
 * visualizer toggle.  Exposes a factory function so the caller (app.js) can
 * inject the analyser node, DOM references, and shared state.
 *
 * @module visualizer
 */

/**
 * Creates the waveform visualizer and UI update loop.
 *
 * @param {object}   context                            - Injected app context.
 * @param {object}   context.dom                         - DOM element references.
 * @param {HTMLCanvasElement} context.dom.visualizerCanvas  - Canvas element.
 * @param {HTMLElement}       context.dom.toggleVisualizerButton - Toggle button.
 * @param {object}   context.audio                       - Audio-engine references.
 * @param {Tone.Analyser}     context.audio.analyser     - Waveform analyser.
 * @param {object}   context.state                       - Shared app state.
 * @param {boolean}  context.state.isRecording           - Is recording active (read).
 * @param {number}   context.state.recordingStartTime    - Recording start time (read).
 * @param {HTMLElement}       context.state.recordButton - Record button for timer display.
 * @param {boolean}  context.state.isPlaying             - Is transport playing (read).
 * @param {Function} context.actions.formatTime          - Time formatting helper.
 * @returns {object} Public API.
 * @returns {Function} return.runUiUpdate    - Called by Tone.Loop (~30 Hz).
 * @returns {Function} return.startUiLoop    - Starts the Tone.Loop.
 * @returns {Function} return.stopUiLoop     - Stops the Tone.Loop (if idle).
 * @returns {boolean}  return.isVisualizerOn - Whether the visualizer is active.
 * @returns {Function} return.toggle         - Toggles visualizer on/off.
 * @returns {Function} return.resizeCanvas   - Recalculates canvas dimensions.
 */
export function createVisualizer(context) {
    const { dom, audio, state, actions } = context;

    // --- Internal state ---
    let isVisualizerOn = false;
    let animationFrameId = null;

    const visualizerCanvas = dom.visualizerCanvas;
    const visualizerCtx = visualizerCanvas.getContext('2d');
    const analyser = audio.analyser;

    /**
     * Resizes the canvas to match its CSS-displayed size, accounting for
     * high-DPI (Retina) displays.
     *
     * @returns {void}
     */
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = visualizerCanvas.getBoundingClientRect();
        visualizerCanvas.width = rect.width * dpr;
        visualizerCanvas.height = rect.height * dpr;
        visualizerCtx.scale(dpr, dpr);
    }

    // Wire resize listener + initial sizing
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    /**
     * Main UI update callback.  Runs at ~30 Hz while the transport is
     * playing or recording.
     *
     * - Draws the waveform from the analyser when the visualizer is on.
     * - Updates the recording timer display when recording.
     *
     * @returns {void}
     */
    function runUiUpdate() {
        // --- Waveform Rendering ---
        if (isVisualizerOn && analyser) {
            try {
                const waveform = analyser.getValue();
                const dpr = window.devicePixelRatio || 1;

                visualizerCtx.clearRect(
                    0,
                    0,
                    visualizerCanvas.width / dpr,
                    visualizerCanvas.height / dpr
                );

                // --- Layout constants ---
                const leftPadding = 30;
                const rightPadding = 10;
                const topPadding = 10;
                const bottomPadding = 36;

                const canvasLogicalWidth = visualizerCanvas.width / dpr;
                const canvasLogicalHeight = visualizerCanvas.height / dpr;
                const tickLength = 8;
                const xLabelOffset = 28;
                const yLabelOffsetFromTicks = 40;

                const plotWidth = canvasLogicalWidth - leftPadding - rightPadding;
                const plotHeight = canvasLogicalHeight - topPadding - bottomPadding;

                // --- Draw waveform path ---
                visualizerCtx.beginPath();
                visualizerCtx.strokeStyle = '#38BDF8';
                visualizerCtx.lineWidth = 2;

                for (let i = 0; i < waveform.length; i++) {
                    const x = leftPadding + (i / waveform.length) * plotWidth;
                    const y = canvasLogicalHeight - bottomPadding -
                        ((waveform[i] + 1) * plotHeight) / 2;
                    if (i === 0) {
                        visualizerCtx.moveTo(x, y);
                    } else {
                        visualizerCtx.lineTo(x, y);
                    }
                }
                visualizerCtx.stroke();

                // --- Draw axes and labels ---
                visualizerCtx.strokeStyle = '#9CA3AF';  // gray-400
                visualizerCtx.lineWidth = 1;
                visualizerCtx.font = '10px Arial';
                visualizerCtx.fillStyle = '#9CA3AF';

                // Axes
                visualizerCtx.beginPath();
                visualizerCtx.moveTo(leftPadding, canvasLogicalHeight - bottomPadding);
                visualizerCtx.lineTo(canvasLogicalWidth - rightPadding, canvasLogicalHeight - bottomPadding);
                visualizerCtx.moveTo(leftPadding, topPadding);
                visualizerCtx.lineTo(leftPadding, canvasLogicalHeight - bottomPadding);
                visualizerCtx.stroke();

                // X-axis ticks
                const xTicks = [0, 0.25, 0.5, 0.75, 1.0];
                xTicks.forEach((tick) => {
                    const x = leftPadding + tick * plotWidth;
                    visualizerCtx.beginPath();
                    visualizerCtx.moveTo(x, canvasLogicalHeight - bottomPadding);
                    visualizerCtx.lineTo(x, canvasLogicalHeight - bottomPadding + tickLength);
                    visualizerCtx.stroke();

                    visualizerCtx.textAlign = 'center';
                    visualizerCtx.textBaseline = 'top';
                    visualizerCtx.fillText(
                        `${tick}s`,
                        x,
                        canvasLogicalHeight - bottomPadding + tickLength + xLabelOffset
                    );
                });

                // Y-axis ticks
                const yTicks = [-1, -0.5, 0, 0.5, 1];
                yTicks.forEach((tick) => {
                    const normalized = (tick + 1) / 2;
                    const y = canvasLogicalHeight - bottomPadding - normalized * plotHeight;
                    visualizerCtx.beginPath();
                    visualizerCtx.moveTo(leftPadding - tickLength, y);
                    visualizerCtx.lineTo(leftPadding, y);
                    visualizerCtx.stroke();

                    visualizerCtx.textAlign = 'right';
                    visualizerCtx.textBaseline = 'middle';
                    visualizerCtx.fillText(tick.toString(), leftPadding - tickLength - 6, y);
                });

                // Axis labels
                visualizerCtx.textAlign = 'center';
                visualizerCtx.font = '12px Arial';
                visualizerCtx.textBaseline = 'top';
                visualizerCtx.fillText(
                    'Time',
                    canvasLogicalWidth / 2,
                    canvasLogicalHeight - bottomPadding + tickLength + xLabelOffset + 2
                );

                // Rotated "Amplitude" label
                visualizerCtx.save();
                const ampTranslateX = leftPadding - yLabelOffsetFromTicks;
                visualizerCtx.translate(ampTranslateX, canvasLogicalHeight / 2);
                visualizerCtx.rotate(-Math.PI / 2);
                visualizerCtx.textAlign = 'center';
                visualizerCtx.textBaseline = 'middle';
                visualizerCtx.fillText('Amplitude', 0, 0);
                visualizerCtx.restore();
            } catch (e) {
                console.error("Visualizer error:", e);
                isVisualizerOn = false;
            }
        }

        // --- Recording Timer Display ---
        if (state.isRecording) {
            const elapsed = Tone.now() - state.recordingStartTime;
            state.recordButton.textContent = `Stop Recording (${actions.formatTime(elapsed)})`;
        }
    }

    /**
     * Starts the requestAnimationFrame loop used for UI (visualizer + timer) updates.
     * Only runs when visualizer is enabled or recording is active.
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
     * Stops the requestAnimationFrame loop, but only when both the
     * transport and recording are inactive.
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
     * Toggles the waveform visualizer on/off and updates the toggle
     * button appearance.
     *
     * @returns {void}
     */
    function toggle() {
        isVisualizerOn = !isVisualizerOn;
        const btn = dom.toggleVisualizerButton;

        if (isVisualizerOn) {
            btn.textContent = "Disable Visualizer";
            btn.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
            btn.classList.remove('bg-gray-600', 'hover:bg-gray-500');
            if (state.isPlaying) {
                startUiLoop();
            }
        } else {
            btn.textContent = "Enable Visualizer";
            btn.classList.remove('bg-yellow-600', 'hover:bg-yellow-700');
            btn.classList.add('bg-gray-600', 'hover:bg-gray-500');
            visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
            if (!state.isRecording) {
                stopUiLoop();
            }
        }
    }

    return {
        runUiUpdate,
        startUiLoop,
        stopUiLoop,
        get isVisualizerOn() { return isVisualizerOn; },
        toggle,
        resizeCanvas
    };
}