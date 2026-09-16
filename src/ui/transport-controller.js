/**
 * Playback-control and sticky transport-bar UI coordination.
 *
 * @module transport-controller
 */

/**
 * @typedef {object} TransportControllerDependencies
 * @property {{playStopButton?: HTMLButtonElement|null, stickyTransportBar?: HTMLElement|null, bpmSlider?: HTMLInputElement|null, bpmValue?: HTMLElement|null, swingSlider?: HTMLInputElement|null, swingValue?: HTMLElement|null}} dom
 * @property {Window} windowRef
 * @property {() => boolean} getIsPlaying
 * @property {() => Promise<void>} onStart
 * @property {() => void} onStop
 * @property {(value: number) => void} [onBpmChange]
 * @property {(value: number) => void} [onSwingChange]
 * @property {(callback: () => void, wait: number) => () => void} [debounce]
 * @property {{warn: (...args: unknown[]) => void}} [logger]
 */

/**
 * Binds playback actions and responsive sticky-bar appearance without owning
 * transport or audio-engine state.
 *
 * @param {TransportControllerDependencies} dependencies - Injected UI and app behavior.
 * @returns {{initialize: () => void, destroy: () => void}}
 */
export function createTransportController(dependencies) {
    const { dom, windowRef, getIsPlaying, onStart, onStop, logger = console } = dependencies;
    const { playStopButton, stickyTransportBar, bpmSlider, bpmValue, swingSlider, swingValue } =
        dom;
    let isInitialized = false;
    let stickyUpdateScheduled = false;
    /** @type {number | null} */
    let pendingStickyUpdateFrame = null;
    /** @type {AbortController | null} */
    let listenerController = null;
    const debouncedBpmChange =
        typeof dependencies.debounce === "function"
            ? dependencies.debounce(() => {
                  const value = Number.parseInt(bpmSlider?.value || "", 10);
                  if (Number.isFinite(value)) dependencies.onBpmChange?.(value);
              }, 16)
            : () => {
                  const value = Number.parseInt(bpmSlider?.value || "", 10);
                  if (Number.isFinite(value)) dependencies.onBpmChange?.(value);
              };
    const debouncedSwingChange =
        typeof dependencies.debounce === "function"
            ? dependencies.debounce(() => {
                  const value = Number.parseFloat(swingSlider?.value || "");
                  if (Number.isFinite(value)) dependencies.onSwingChange?.(value);
              }, 16)
            : () => {
                  const value = Number.parseFloat(swingSlider?.value || "");
                  if (Number.isFinite(value)) dependencies.onSwingChange?.(value);
              };

    /**
     * Applies the square sticky treatment only after the desktop bar reaches
     * the top edge of the viewport.
     *
     * @returns {void}
     */
    function updateStickyAppearance() {
        if (!stickyTransportBar) return;
        const isDesktop = windowRef.matchMedia("(min-width: 640px)").matches;
        const hasReachedViewportTop = stickyTransportBar.getBoundingClientRect().top <= 0;
        stickyTransportBar.classList.toggle("is-stuck", isDesktop && hasReachedViewportTop);
    }

    /**
     * Defers scroll layout work to the next animation frame.
     *
     * @returns {void}
     */
    function scheduleStickyUpdate() {
        if (stickyUpdateScheduled) return;
        stickyUpdateScheduled = true;
        pendingStickyUpdateFrame = windowRef.requestAnimationFrame(() => {
            pendingStickyUpdateFrame = null;
            stickyUpdateScheduled = false;
            updateStickyAppearance();
        });
    }

    /**
     * Starts or stops transport using the current injected playback state.
     *
     * @returns {Promise<void>}
     */
    async function handlePlayStopClick() {
        if (getIsPlaying()) {
            onStop();
            return;
        }
        try {
            await onStart();
        } catch (error) {
            logger.warn("AudioContext failed to start from play button:", error);
        }
    }

    /**
     * Binds transport controls once.
     *
     * @returns {void}
     */
    function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        listenerController = new AbortController();
        const listenerOptions = { signal: listenerController.signal };
        windowRef.addEventListener("scroll", scheduleStickyUpdate, {
            passive: true,
            signal: listenerController.signal,
        });
        windowRef.addEventListener("resize", updateStickyAppearance, listenerOptions);
        playStopButton?.addEventListener(
            "click",
            () => {
                void handlePlayStopClick();
            },
            listenerOptions,
        );
        bpmSlider?.addEventListener(
            "input",
            () => {
                if (bpmValue) bpmValue.textContent = bpmSlider.value;
                debouncedBpmChange();
            },
            listenerOptions,
        );
        swingSlider?.addEventListener(
            "input",
            () => {
                const value = Number.parseFloat(swingSlider.value);
                if (swingValue && Number.isFinite(value)) swingValue.textContent = value.toFixed(2);
                debouncedSwingChange();
            },
            listenerOptions,
        );
        updateStickyAppearance();
    }

    /**
     * Releases transport UI listeners when the controller is unmounted.
     *
     * @returns {void}
     */
    function destroy() {
        if (pendingStickyUpdateFrame !== null) {
            windowRef.cancelAnimationFrame(pendingStickyUpdateFrame);
            pendingStickyUpdateFrame = null;
        }
        listenerController?.abort();
        listenerController = null;
        isInitialized = false;
        stickyUpdateScheduled = false;
    }

    return { initialize, destroy };
}
