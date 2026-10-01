/**
 * Deactivates transient controls when Simple mode hides them.
 *
 * @module interface-mode-safety-controller
 */

/**
 * Creates the lifecycle guard for controls hidden by Simple mode.
 *
 * @param {{getInterfaceMode: () => string, getRecorderManager: () => {isRecording: boolean, stopRecording?: () => Promise<boolean>, toggleRecording: () => Promise<void>}|undefined, getKeyboardToggle: () => HTMLInputElement, getVisualizer: () => {isVisualizerOn: boolean, toggle: () => void}|undefined, setInterfaceMode: (mode: "simple"|"full") => void, showToast: (message: string, type?: string) => void, logger?: {warn: (...args: unknown[]) => void}}} dependencies - Mode and transient-control dependencies.
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

    function onModeApplied(mode) {
        const currentTransitionId = ++transitionId;
        if (isDestroyed || mode !== "simple") return;

        const keyboardToggle = getKeyboardToggle();
        if (keyboardToggle.checked) {
            keyboardToggle.checked = false;
            const EventConstructor = keyboardToggle.ownerDocument.defaultView?.Event ?? Event;
            keyboardToggle.dispatchEvent(new EventConstructor("change"));
        }

        const visualizer = getVisualizer();
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

    function isCurrentTransition(id) {
        return !isDestroyed && transitionId === id && getInterfaceMode() === "simple";
    }

    function handleStopFailure(error, id) {
        logger.warn("Could not stop recording after selecting Simple controls:", error);
        if (!isCurrentTransition(id)) return;
        setInterfaceMode("full");
        showToast("Recording could not be stopped, so Full controls were restored.", "error");
    }

    function destroy() {
        isDestroyed = true;
        transitionId += 1;
    }

    return { onModeApplied, destroy };
}
