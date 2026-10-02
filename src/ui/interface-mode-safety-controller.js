/**
 * Deactivates transient controls when Simple mode hides them.
 *
 * @module interface-mode-safety-controller
 */

/**
 * Creates the lifecycle guard for controls hidden by Simple mode.
 *
 * @param {{getInterfaceMode: () => string, getRecorderManager: () => {isRecording: boolean, stopRecording?: () => Promise<boolean>, toggleRecording: () => Promise<void>}|undefined, getKeyboardToggle: () => HTMLInputElement|null|undefined, getVisualizer: () => {isVisualizerOn: boolean, toggle: () => void}|null|undefined, setInterfaceMode: (mode: "simple"|"full") => void, showToast: (message: string, type?: string) => void, logger?: {warn: (...args: unknown[]) => void}}} dependencies - Mode and transient-control dependencies.
 * @returns {{onModeApplied: (mode: string) => void, destroy: () => void}} Mode transition lifecycle API.
 */
export function createInterfaceModeSafetyController(dependencies) {
    const {
        getInterfaceMode,
        getRecorderManager,
        getKeyboardToggle,
        getVisualizer,
        setInterfaceMode,
        showToast,
        logger = console,
    } = dependencies;
    let transitionId = 0;
    let isDestroyed = false;

    /**
     * Deactivates transient tools when switching into Simple mode.
     *
     * @param {string} mode - The applied interface mode ("simple"|"full").
     * @returns {void}
     */
    function onModeApplied(mode) {
        const currentTransitionId = ++transitionId;
        if (isDestroyed || mode !== "simple") return;

        // Deactivate virtual keyboard and dispatch change event to tear down
        // active keyboard input listeners and reset key visual states.
        const keyboardToggle = getKeyboardToggle?.();
        if (keyboardToggle?.checked) {
            keyboardToggle.checked = false;
            const EventConstructor = keyboardToggle.ownerDocument.defaultView?.Event ?? Event;
            keyboardToggle.dispatchEvent(new EventConstructor("change"));
        }

        // Deactivate visualizer oscilloscope to avoid drawing to a hidden canvas.
        // runUiUpdate continues running during active playback to drive the real-time
        // Transport Peak / VU meter, which remains visible in Simple mode.
        const visualizer = getVisualizer?.();
        if (visualizer?.isVisualizerOn) visualizer.toggle();

        const recorderManager = getRecorderManager();
        if (!recorderManager) return;

        const wasRecording = recorderManager.isRecording;
        let stopOperation;
        try {
            stopOperation = recorderManager.stopRecording
                ? recorderManager.stopRecording()
                : wasRecording
                  ? recorderManager.toggleRecording()
                  : undefined;
        } catch (error) {
            handleStopFailure(error, currentTransitionId);
            return;
        }
        if (!stopOperation) return;

        void Promise.resolve(stopOperation)
            .then((wasStopped) => {
                if (!isCurrentTransition(currentTransitionId)) return;
                if (wasStopped === false || !wasRecording) return;
                showToast("Recording stopped when Simple controls were selected.", "info");
            })
            .catch((error) => handleStopFailure(error, currentTransitionId));
    }

    /**
     * Checks if the given transition ID is still the active transition.
     *
     * @param {number} id - Transition ID to evaluate.
     * @returns {boolean} True if the transition is still active and valid.
     */
    function isCurrentTransition(id) {
        return !isDestroyed && transitionId === id && getInterfaceMode() === "simple";
    }

    /**
     * Handles recording stop failure by logging, reverting to Full mode, and showing a toast.
     *
     * @param {unknown} error - Error thrown during recorder stop.
     * @param {number} id - Transition ID that experienced the failure.
     * @returns {void}
     */
    function handleStopFailure(error, id) {
        logger.warn("Could not stop recording after selecting Simple controls:", error);
        if (!isCurrentTransition(id)) return;
        setInterfaceMode("full");
        showToast("Recording could not be stopped, so Full controls were restored.", "error");
    }

    /**
     * Cleans up the safety controller and invalidates pending transitions.
     *
     * @returns {void}
     */
    function destroy() {
        isDestroyed = true;
        transitionId += 1;
    }

    return { onModeApplied, destroy };
}
