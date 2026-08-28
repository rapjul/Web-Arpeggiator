/**
 * Pattern Generator Module
 *
 * Bridges the pure domain algorithms in pattern-core.js with the DOM and Tone.js
 * audio scheduling engine.
 *
 * @module pattern-generator
 */

import * as Tone from "tone";
import {
    quantizeToScale,
    getArpeggioNotes,
    buildPatternSequence,
    materializePatternSequence,
    buildPatternNotesAndMap,
    calculateNoteMarkers,
    CHROMATIC_PITCHES,
    CHROMATIC_RANGE,
} from "./pattern-core.js";

// Re-export pure domain helpers for backwards compatibility
export {
    quantizeToScale,
    getArpeggioNotes,
    buildPatternSequence,
    materializePatternSequence,
    buildPatternNotesAndMap,
    calculateNoteMarkers,
    CHROMATIC_PITCHES,
    CHROMATIC_RANGE,
};

/**
 * Module-level cache mapping each arpeggiator pattern step index to its corresponding base note index.
 * @type {number[]}
 */
let stepToBaseIndexMap = [];

/**
 * Builds the active Tone.Pattern from the current DOM and shared window state.
 *
 * Reads the current note input, interval, gate, pattern direction, octave settings,
 * and quantizer state from the page, then replaces window.arpPattern.
 *
 * @returns {void}
 */
export function createOrUpdatePattern() {
    try {
        const baseNotesInput = /** @type {HTMLInputElement|null} */ (
            document.getElementById("notes")
        );
        if (!baseNotesInput) return;

        const raw = baseNotesInput.value.trim();
        const baseNotes = raw.length ? raw.split(/\s+/) : [];

        const octaveRange = parseInt(String(window.currentOctaveRange || 1), 10) || 1;
        const octaveShift = parseInt(String(window.currentOctaveShift || 0), 10) || 0;

        const intervalSelect = /** @type {HTMLSelectElement|null} */ (
            document.getElementById("interval")
        );
        const gateSlider = /** @type {HTMLInputElement|null} */ (document.getElementById("gate"));

        const interval = intervalSelect ? intervalSelect.value : "16n";
        const gate = gateSlider ? parseFloat(gateSlider.value) : 0.8;

        // Determine pattern direction from selected button
        const patternButtons = document.getElementById("pattern-buttons");
        let direction = "up";
        if (patternButtons) {
            const active = patternButtons.querySelector("button.selected");
            if (active) direction = active.getAttribute("data-pattern") || "up";
        }

        // Quantize options (if present in DOM)
        const quantizeToggle = /** @type {HTMLInputElement|null} */ (
            document.getElementById("scale-quantize-toggle")
        );
        const quantizeRootEl = /** @type {HTMLSelectElement|null} */ (
            document.getElementById("scale-root")
        );
        const quantizeTypeEl = /** @type {HTMLSelectElement|null} */ (
            document.getElementById("scale-type")
        );

        const quantizeRoot = quantizeRootEl ? quantizeRootEl.value : "C";
        const quantizeType = quantizeTypeEl ? quantizeTypeEl.value : "major";
        const quantizeOpts = {
            enabled: quantizeToggle ? quantizeToggle.checked : false,
            root: quantizeRoot,
            scale: quantizeType,
        };

        const {
            finalNotes,
            stepToBaseIndexMap: computedMap,
            finalDirection,
        } = buildPatternSequence(baseNotes, {
            direction,
            octaveRange,
            octaveShift,
            quantize: quantizeOpts,
        });

        stepToBaseIndexMap = computedMap;

        if (!finalNotes || finalNotes.length === 0) return;

        // Dispose old pattern if present
        if (window.arpPattern) {
            try {
                window.arpPattern.dispose();
            } catch (e) {}
            window.arpPattern = null;
        }

        // Calculate note duration in seconds once outside the scheduling callback
        const durationSeconds = Tone.Time(interval).toSeconds() * gate;

        // Create Tone.Pattern with direction mapping
        const patternInstance = new Tone.Pattern(
            (time, note) => {
                const synth = window.activeSynth || null;
                if (synth) {
                    try {
                        if (
                            typeof synth.triggerAttack === "function" &&
                            typeof synth.triggerRelease === "function"
                        ) {
                            synth.triggerAttack(note, time);
                            synth.triggerRelease(time + durationSeconds);
                        } else if (typeof synth.triggerAttackRelease === "function") {
                            synth.triggerAttackRelease(note, durationSeconds, time);
                        }
                    } catch (e) {
                        try {
                            if (
                                typeof synth.triggerAttack === "function" &&
                                typeof synth.triggerRelease === "function"
                            ) {
                                synth.triggerAttack(note);
                                synth.triggerRelease(`+${durationSeconds}`);
                            } else if (typeof synth.triggerAttackRelease === "function") {
                                synth.triggerAttackRelease(note, durationSeconds);
                            }
                        } catch (_) {}
                    }
                }

                // Resolve the current step index to highlight the correct pip
                const currentPattern = patternInstance || window.arpPattern;
                const patternIndex = currentPattern ? currentPattern.index : 0;
                const pipIndex =
                    stepToBaseIndexMap[patternIndex] !== undefined
                        ? stepToBaseIndexMap[patternIndex]
                        : 0;

                if (typeof window.__WEB_ARP_STEP_HIGHLIGHT__ === "function") {
                    Tone.Draw.schedule(() => {
                        window.__WEB_ARP_STEP_HIGHLIGHT__(pipIndex);
                    }, time);
                }
            },
            finalNotes,
            finalDirection,
        );

        window.arpPattern = patternInstance;
        window.arpPattern.interval = interval;

        if (window.isPlaying) window.arpPattern.start(0);
    } catch (e) {
        console.error("createOrUpdatePattern error", e);
    }
}

// Expose for debug/test hooks.
window.__patternGenerator = { getArpeggioNotes, createOrUpdatePattern };
