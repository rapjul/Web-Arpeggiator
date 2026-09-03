import * as Tone from "tone";
import { normalizeLoopCount } from "@core/export-duration.js";

/**
 * Settings serialization, restoration, and naming helpers.
 */

/**
 * @typedef {object} SettingsManagerContext
 * @property {object} state - App state references.
 * @property {object} dom - Bound DOM element references.
 * @property {object} actions - Bound app action functions.
 * @property {object} audio - Bound audio engine references.
 */

/**
 * Builds a settings API bound to the app's live DOM and state.
 *
 * @param {SettingsManagerContext} context - Bound app references.
 * @returns {{getAllSettings: Function, loadAllSettings: Function, generateFilename: Function}} Settings helpers.
 */
export function createSettingsManager(context) {
    const { state, dom, actions, audio } = context;

    /**
     * Collects all current UI settings into an object.
     *
     * @returns {object} A settings snapshot.
     */
    function getAllSettings() {
        const baseNotes = state.currentNotes;
        const notesWithOctaves = actions.getArpeggioNotes(
            baseNotes,
            state.currentOctaveRange,
            state.currentOctaveShift,
        );

        return {
            // Transport
            bpm: parseInt(dom.bpmSlider.value, 10),
            swing: parseFloat(dom.swingSlider.value),
            postGain: parseFloat(dom.postGainSlider.value),
            // Pattern
            baseNotes,
            notes: notesWithOctaves,
            direction: actions.getSelectedPatternDirection(),
            interval: dom.intervalSelect.value,
            octaveShift: state.currentOctaveShift,
            octaveRange: state.currentOctaveRange,
            // Scale
            scaleQuantize: dom.scaleQuantizeToggle.checked,
            scaleRoot: dom.scaleRootSelect.value,
            scaleType: dom.scaleTypeSelect.value,
            // Synth
            synthType: dom.synthTypeSelect.value,
            waveform: state.currentWaveform,
            harmonicity: parseFloat(dom.harmonicitySlider.value),
            modulationIndex: parseFloat(dom.modIndexSlider.value),
            dutyCycle: parseFloat(dom.dutySlider.value),
            gateRatio: parseFloat(dom.gateSlider.value),
            // Synth-Specific Extended Params
            monoCutoff: dom.monoCutoffSlider ? parseFloat(dom.monoCutoffSlider.value) : 300,
            monoOctaves: dom.monoOctavesSlider ? parseFloat(dom.monoOctavesSlider.value) : 4.0,
            monoQ: dom.monoQSlider ? parseFloat(dom.monoQSlider.value) : 2.0,
            duoHarm: dom.duoHarmSlider ? parseFloat(dom.duoHarmSlider.value) : 1.5,
            duoVibrato: dom.duoVibratoSlider ? parseFloat(dom.duoVibratoSlider.value) : 0.2,
            pluckDampening: dom.pluckDampeningSlider
                ? parseFloat(dom.pluckDampeningSlider.value)
                : 4000,
            pluckResonance: dom.pluckResonanceSlider
                ? parseFloat(dom.pluckResonanceSlider.value)
                : 0.9,
            pluckNoise: dom.pluckNoiseSlider ? parseFloat(dom.pluckNoiseSlider.value) : 1.0,
            membranePitchDecay: dom.membranePitchDecaySlider
                ? parseFloat(dom.membranePitchDecaySlider.value)
                : 0.05,
            membraneOctaves: dom.membraneOctavesSlider
                ? parseFloat(dom.membraneOctavesSlider.value)
                : 8.0,
            // Envelope (ADSR)
            envAttack: parseFloat(dom.envAttackSlider.value),
            envDecay: parseFloat(dom.envDecaySlider.value),
            envSustain: parseFloat(dom.envSustainSlider.value),
            envRelease: parseFloat(dom.envReleaseSlider.value),
            // Filter
            filterCutoff: parseFloat(dom.filterCutoffSlider.value),
            filterResonance: parseFloat(dom.filterResonanceSlider.value),
            // Effects
            driveMix: dom.driveMixSlider ? parseFloat(dom.driveMixSlider.value) : 0.0,
            chorusMix: dom.chorusMixSlider ? parseFloat(dom.chorusMixSlider.value) : 0.0,
            autoPanMix: dom.autoPanMixSlider ? parseFloat(dom.autoPanMixSlider.value) : 0.0,
            delayMix: parseFloat(dom.delayMixSlider.value),
            reverbMix: parseFloat(dom.reverbMixSlider.value),
            loopCount: normalizeLoopCount(dom.loopCountInput.value),
        };
    }

    /**
     * Loads a settings snapshot into the UI and live Tone.js state.
     *
     * @param {object} settings - The snapshot to restore.
     * @returns {void}
     */
    function loadAllSettings(settings) {
        try {
            dom.bpmSlider.value = settings.bpm;
            dom.bpmValue.textContent = settings.bpm;
            const transport = Tone?.getTransport ? Tone.getTransport() : Tone?.Transport;
            if (transport?.bpm) {
                transport.bpm.value = settings.bpm;
            }
            dom.swingSlider.value = settings.swing;
            dom.swingValue.textContent = settings.swing.toFixed(2);
            if (transport) {
                transport.swing = settings.swing;
            }

            // Restore post gain
            if (settings.postGain !== undefined && dom.postGainSlider) {
                dom.postGainSlider.value = settings.postGain;
                const pct = Math.round(((settings.postGain + 40) / 40) * 100);
                dom.postGainValue.textContent = pct;
                if (audio.postGain) audio.postGain.volume.value = settings.postGain;
            }

            const notesArr =
                Array.isArray(settings.baseNotes) && settings.baseNotes.length > 0
                    ? settings.baseNotes
                    : Array.isArray(settings.notes) && settings.notes.length > 0
                      ? settings.notes
                      : typeof settings.notes === "string" && settings.notes.trim().length > 0
                        ? settings.notes.trim().split(/\s+/)
                        : ["C4", "E4", "G4"];

            if (dom.notesInput) {
                dom.notesInput.value = notesArr.join(" ");
            }
            state.currentNotes = notesArr;
            if (settings.direction) {
                actions.setSelectedPatternDirection(settings.direction);
            }
            if (settings.interval && dom.intervalSelect) {
                dom.intervalSelect.value = settings.interval;
            }

            if (settings.scaleType) {
                dom.scaleTypeSelect.value = settings.scaleType;
            }
            if (settings.scaleRoot) {
                dom.scaleRootSelect.value = settings.scaleRoot;
            }
            if (settings.scaleQuantize !== undefined) {
                dom.scaleQuantizeToggle.checked = settings.scaleQuantize;
            } else if (settings.scaleType) {
                dom.scaleQuantizeToggle.checked = settings.scaleType !== "chromatic";
            }
            actions.updateScaleQuantizeUi();
            if (typeof actions.updateScaleQuantizeToggleText === "function") {
                actions.updateScaleQuantizeToggleText();
            }

            dom.synthTypeSelect.value = settings.synthType;

            state.currentWaveform = settings.waveform;
            actions.updateWaveformButtons(state.currentWaveform);
            if (state.activeSynth?.oscillator) {
                state.activeSynth.oscillator.type = settings.waveform;
            }

            if (settings.harmonicity) {
                dom.harmonicitySlider.value = settings.harmonicity;
                dom.harmonicityValue.textContent = settings.harmonicity.toFixed(1);
            }
            if (settings.modulationIndex) {
                dom.modIndexSlider.value = settings.modulationIndex;
                dom.modIndexValue.textContent = settings.modulationIndex.toFixed(1);
            }

            // Restore extended synth params
            if (settings.monoCutoff !== undefined && dom.monoCutoffSlider) {
                dom.monoCutoffSlider.value = settings.monoCutoff;
                if (dom.monoCutoffValue)
                    dom.monoCutoffValue.textContent = settings.monoCutoff.toFixed(0);
            }
            if (settings.monoOctaves !== undefined && dom.monoOctavesSlider) {
                dom.monoOctavesSlider.value = settings.monoOctaves;
                if (dom.monoOctavesValue)
                    dom.monoOctavesValue.textContent = settings.monoOctaves.toFixed(1);
            }
            if (settings.monoQ !== undefined && dom.monoQSlider) {
                dom.monoQSlider.value = settings.monoQ;
                if (dom.monoQValue) dom.monoQValue.textContent = settings.monoQ.toFixed(1);
            }
            if (settings.duoHarm !== undefined && dom.duoHarmSlider) {
                dom.duoHarmSlider.value = settings.duoHarm;
                if (dom.duoHarmValue) dom.duoHarmValue.textContent = settings.duoHarm.toFixed(2);
            }
            if (settings.duoVibrato !== undefined && dom.duoVibratoSlider) {
                dom.duoVibratoSlider.value = settings.duoVibrato;
                if (dom.duoVibratoValue)
                    dom.duoVibratoValue.textContent = settings.duoVibrato.toFixed(2);
            }
            if (settings.pluckDampening !== undefined && dom.pluckDampeningSlider) {
                dom.pluckDampeningSlider.value = settings.pluckDampening;
                if (dom.pluckDampeningValue)
                    dom.pluckDampeningValue.textContent = settings.pluckDampening.toFixed(0);
            }
            if (settings.pluckResonance !== undefined && dom.pluckResonanceSlider) {
                dom.pluckResonanceSlider.value = settings.pluckResonance;
                if (dom.pluckResonanceValue)
                    dom.pluckResonanceValue.textContent = settings.pluckResonance.toFixed(2);
            }
            if (settings.pluckNoise !== undefined && dom.pluckNoiseSlider) {
                dom.pluckNoiseSlider.value = settings.pluckNoise;
                if (dom.pluckNoiseValue)
                    dom.pluckNoiseValue.textContent = settings.pluckNoise.toFixed(1);
            }
            if (settings.membranePitchDecay !== undefined && dom.membranePitchDecaySlider) {
                dom.membranePitchDecaySlider.value = settings.membranePitchDecay;
                if (dom.membranePitchDecayValue)
                    dom.membranePitchDecayValue.textContent =
                        settings.membranePitchDecay.toFixed(3);
            }
            if (settings.membraneOctaves !== undefined && dom.membraneOctavesSlider) {
                dom.membraneOctavesSlider.value = settings.membraneOctaves;
                if (dom.membraneOctavesValue)
                    dom.membraneOctavesValue.textContent = settings.membraneOctaves.toFixed(1);
            }

            actions.setSynth(settings.synthType);

            // Restore duty cycle
            if (settings.dutyCycle !== undefined && dom.dutySlider) {
                dom.dutySlider.value = settings.dutyCycle;
                dom.dutyValue.textContent = settings.dutyCycle.toFixed(2);
            }

            // Restore ADSR envelope
            if (settings.envAttack !== undefined && dom.envAttackSlider) {
                dom.envAttackSlider.value = settings.envAttack;
                dom.envAttackValue.textContent = settings.envAttack.toFixed(2);
            }
            if (settings.envDecay !== undefined && dom.envDecaySlider) {
                dom.envDecaySlider.value = settings.envDecay;
                dom.envDecayValue.textContent = settings.envDecay.toFixed(2);
            }
            if (settings.envSustain !== undefined && dom.envSustainSlider) {
                dom.envSustainSlider.value = settings.envSustain;
                dom.envSustainValue.textContent = settings.envSustain.toFixed(2);
            }
            if (settings.envRelease !== undefined && dom.envReleaseSlider) {
                dom.envReleaseSlider.value = settings.envRelease;
                dom.envReleaseValue.textContent = settings.envRelease.toFixed(2);
            }

            state.currentOctaveShift = settings.octaveShift;
            state.currentOctaveRange = settings.octaveRange;
            actions.updateButtonGroup(
                dom.octaveShiftButtons,
                state.currentOctaveShift,
                "data-shift",
            );
            actions.updateButtonGroup(
                dom.octaveRangeButtons,
                state.currentOctaveRange,
                "data-range",
            );

            const gateRatio = settings.gateRatio || 0.8;
            dom.gateSlider.value = gateRatio;
            dom.gateValue.textContent = gateRatio.toFixed(2);

            dom.filterCutoffSlider.value = settings.filterCutoff;
            dom.filterCutoffValue.textContent = settings.filterCutoff.toFixed(0);
            if (audio.filter) audio.filter.frequency.value = settings.filterCutoff;
            dom.filterResonanceSlider.value = settings.filterResonance;
            dom.filterResonanceValue.textContent = settings.filterResonance.toFixed(1);
            if (audio.filter) audio.filter.Q.value = settings.filterResonance;

            // Restore effects
            if (settings.driveMix !== undefined && dom.driveMixSlider) {
                dom.driveMixSlider.value = settings.driveMix;
                if (dom.driveMixValue) dom.driveMixValue.textContent = settings.driveMix.toFixed(2);
                if (audio.distortion) audio.distortion.wet.value = settings.driveMix;
            }
            if (settings.chorusMix !== undefined && dom.chorusMixSlider) {
                dom.chorusMixSlider.value = settings.chorusMix;
                if (dom.chorusMixValue)
                    dom.chorusMixValue.textContent = settings.chorusMix.toFixed(2);
                if (audio.chorus) audio.chorus.wet.value = settings.chorusMix;
            }
            if (settings.autoPanMix !== undefined && dom.autoPanMixSlider) {
                dom.autoPanMixSlider.value = settings.autoPanMix;
                if (dom.autoPanMixValue)
                    dom.autoPanMixValue.textContent = settings.autoPanMix.toFixed(2);
                if (audio.autoPanner) audio.autoPanner.wet.value = settings.autoPanMix;
            }

            dom.delayMixSlider.value = settings.delayMix;
            dom.delayMixValue.textContent = settings.delayMix.toFixed(2);
            if (audio.delay) audio.delay.wet.value = settings.delayMix;
            dom.reverbMixSlider.value = settings.reverbMix;
            dom.reverbMixValue.textContent = settings.reverbMix.toFixed(2);
            if (audio.reverb) audio.reverb.wet.value = settings.reverbMix;

            dom.loopCountInput.value = String(normalizeLoopCount(settings.loopCount));

            actions.syncPatternModuleState();
            actions.createOrUpdatePattern();
        } catch (error) {
            console.error("Failed to parse preset:", error);
            if (typeof actions.showToast === "function") {
                actions.showToast(
                    "Error loading preset. File may be corrupt or from an older version.",
                    "error",
                );
            } else if (typeof alert === "function") {
                alert("Error loading preset. File may be corrupt or from an older version.");
            }
        }
    }

    /**
     * Generates a descriptive filename based on current settings.
     *
     * @param {boolean} isRealtime - Whether to add a timestamp for real-time recording.
     * @returns {string} The formatted filename without extension.
     */
    function generateFilename(isRealtime) {
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}_${date.getHours().toString().padStart(2, "0")}-${date.getMinutes().toString().padStart(2, "0")}-${date.getSeconds().toString().padStart(2, "0")}`;

        if (isRealtime) {
            return `arp-realtime-${timestamp}`;
        }

        const settings = getAllSettings();
        const notesString = settings.baseNotes
            .join("")
            .replace(/#/g, "s")
            .replace(/b/g, "f")
            .replace(/\d/g, "");

        let baseName = "";
        const scaleQuantize = settings.scaleQuantize
            ? `${settings.scaleRoot}-${settings.scaleType}`
            : "noScale";

        if (settings.synthType === "synth") {
            baseName = `arp-${settings.bpm}bpm-basicSynth-${settings.synthType}-${settings.waveform}-${settings.interval}-${notesString}-${scaleQuantize}`;
        } else {
            baseName = `arp-${settings.bpm}bpm-${settings.direction}-${settings.synthType}-${settings.interval}-${notesString}-${scaleQuantize}`;
        }

        baseName = baseName.replace(/[^A-Za-z0-9-_#]/g, "");

        return `${baseName}-${timestamp}`;
    }

    return {
        getAllSettings,
        loadAllSettings,
        generateFilename,
    };
}
