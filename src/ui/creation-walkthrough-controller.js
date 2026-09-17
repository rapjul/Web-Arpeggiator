/**
 * Optional beginner walkthrough for the main creation workflow.
 *
 * @module creation-walkthrough-controller
 */

const WALKTHROUGH_STORAGE_KEY = "webArpCreationWalkthrough";
const WALKTHROUGH_STATES = new Set(["not-started", "active", "skipped", "complete"]);
const WALKTHROUGH_STEPS = Object.freeze([
    { id: "sound", label: "Choose a sound" },
    { id: "notes", label: "Choose notes or a chord" },
    { id: "rhythm", label: "Change the rhythm" },
    { id: "tone", label: "Adjust the tone" },
    { id: "export", label: "Save or export your idea" },
]);

/**
 * Creates the optional, resumable creation walkthrough.
 *
 * @param {{dom: {section: HTMLElement|null, startButton: HTMLButtonElement|null, activePanel: HTMLElement|null, stepsList: HTMLOListElement|null, status: HTMLElement|null, skipButton: HTMLButtonElement|null, restartButton: HTMLButtonElement|null}, documentRef: Document, storage: Pick<Storage, "getItem"|"setItem">, logger?: {warn: (...args: unknown[]) => void}}} dependencies - Injected DOM and storage dependencies.
 * @returns {{initialize: () => void, destroy: () => void, start: () => void, skip: () => void, restart: () => void}}
 */
export function createCreationWalkthroughController(dependencies) {
    const { dom, documentRef, storage, logger = console } = dependencies;
    const { section, startButton, activePanel, stepsList, status, skipButton, restartButton } = dom;
    let state = "not-started";
    let stepIndex = 0;
    let listenerController = null;

    function persist() {
        try {
            storage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify({ state, stepIndex }));
        } catch (error) {
            logger.warn("Could not save creation walkthrough state:", error);
        }
    }

    function render() {
        if (!section) return;
        section.dataset.walkthroughState = state;
        if (activePanel) activePanel.hidden = state !== "active";
        if (startButton) {
            startButton.textContent =
                state === "active"
                    ? "Walkthrough in progress"
                    : state === "complete"
                      ? "Restart walkthrough"
                      : state === "skipped"
                        ? "Resume walkthrough"
                        : "Start walkthrough";
            startButton.disabled = state === "active";
        }
        if (stepsList) {
            Array.from(stepsList.children).forEach((step, index) => {
                const item = /** @type {HTMLElement} */ (step);
                const isCurrent = state === "active" && index === stepIndex;
                const isComplete = state === "complete" || index < stepIndex;
                item.dataset.current = String(isCurrent);
                item.dataset.complete = String(isComplete);
                item.setAttribute("aria-current", isCurrent ? "step" : "false");
            });
        }
        if (status) {
            status.textContent =
                state === "complete"
                    ? "Nice work — you completed the walkthrough."
                    : state === "active"
                      ? `Step ${stepIndex + 1} of ${WALKTHROUGH_STEPS.length}: ${WALKTHROUGH_STEPS[stepIndex].label}.`
                      : state === "skipped"
                        ? "The walkthrough is paused. Resume it whenever you want."
                        : "Try the main creative steps at your own pace.";
        }
    }

    function setState(nextState, nextStepIndex = stepIndex) {
        state = WALKTHROUGH_STATES.has(nextState) ? nextState : "not-started";
        stepIndex = Math.min(Math.max(nextStepIndex, 0), WALKTHROUGH_STEPS.length);
        persist();
        render();
    }

    function start() {
        setState("active", state === "active" ? stepIndex : 0);
    }

    function skip() {
        setState("skipped");
    }

    function restart() {
        setState("active", 0);
    }

    function matchesStep(target, stepId) {
        if (!(target instanceof Element)) return false;
        if (stepId === "sound") {
            return Boolean(
                target.closest(
                    ".sound-starter-card, #quick-start-scratch, #quick-start-presets-grid button",
                ),
            );
        }
        if (stepId === "notes") {
            return Boolean(target.closest("#notes, .chord-btn, #randomize-notes"));
        }
        if (stepId === "rhythm") {
            return Boolean(
                target.closest(
                    "#interval, #bpm, #pattern-buttons, input[name='pattern-direction']",
                ),
            );
        }
        if (stepId === "tone") {
            return Boolean(target.closest("#post-gain, #synth-type, #filter-cutoff, #delay-mix"));
        }
        return Boolean(
            target.closest(
                "#save-preset-button, #save-preset-to-browser-button, #offline-export-button, #realtime-export-button",
            ),
        );
    }

    function handleInteraction(event) {
        if (state !== "active") return;
        const target = /** @type {Element|null} */ (event.target);
        const currentStep = WALKTHROUGH_STEPS[stepIndex];
        if (!currentStep || !matchesStep(target, currentStep.id)) return;
        const nextStepIndex = stepIndex + 1;
        setState(nextStepIndex >= WALKTHROUGH_STEPS.length ? "complete" : "active", nextStepIndex);
    }

    function initialize() {
        if (listenerController) return;
        listenerController = new AbortController();
        try {
            const saved = JSON.parse(storage.getItem(WALKTHROUGH_STORAGE_KEY) || "null");
            if (
                saved &&
                typeof saved === "object" &&
                WALKTHROUGH_STATES.has(saved.state) &&
                Number.isInteger(saved.stepIndex)
            ) {
                state = saved.state;
                stepIndex = Math.min(Math.max(saved.stepIndex, 0), WALKTHROUGH_STEPS.length);
            }
        } catch (error) {
            logger.warn("Could not read creation walkthrough state:", error);
        }
        if (stepsList && stepsList.childElementCount === 0) {
            for (const step of WALKTHROUGH_STEPS) {
                const item = documentRef.createElement("li");
                item.dataset.step = step.id;
                item.textContent = step.label;
                stepsList.appendChild(item);
            }
        }
        const listenerOptions = { signal: listenerController.signal };
        startButton?.addEventListener("click", start, listenerOptions);
        skipButton?.addEventListener("click", skip, listenerOptions);
        restartButton?.addEventListener("click", restart, listenerOptions);
        documentRef.addEventListener("input", handleInteraction, listenerOptions);
        documentRef.addEventListener("change", handleInteraction, listenerOptions);
        documentRef.addEventListener("click", handleInteraction, listenerOptions);
        render();
    }

    function destroy() {
        listenerController?.abort();
        listenerController = null;
    }

    return { initialize, destroy, start, skip, restart };
}
