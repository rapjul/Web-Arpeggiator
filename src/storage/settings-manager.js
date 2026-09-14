import {
    normalizeLoopCount,
    normalizeOfflineExportMode,
    normalizeOfflineExportTailSeconds,
} from "@core/export-duration.js";
import { normalizeSettings } from "@core/settings-contract.js";

/** @typedef {import("../core/settings-contract.js").ArpeggiatorSettings} ArpeggiatorSettings */

/**
 * The settings manager reads form-control values and updates their companion
 * labels. Its controls are supplied by the application composition root.
 *
 * @typedef {HTMLInputElement & HTMLSelectElement & HTMLElement & NodeListOf<HTMLInputElement>} SettingsControl
 */

/**
 * @typedef {object} SettingsManagerState
 * @property {string[]} currentNotes
 * @property {number} currentOctaveRange
 * @property {number} currentOctaveShift
 * @property {string} currentWaveform
 * @property {{oscillator?: {type: string}}|null} activeSynth
 */

/**
 * @typedef {object} SettingsManagerActions
 * @property {(notes: string[], octaveRange: number, octaveShift: number) => string[]} getArpeggioNotes
 * @property {() => string} getSelectedPatternDirection
 * @property {(direction: string) => void} setSelectedPatternDirection
 * @property {() => void} updateScaleQuantizeUi
 * @property {() => void} updateScaleQuantizeToggleText
 * @property {(waveform: string) => void} updateWaveformButtons
 * @property {(synthType: string) => void} setSynth
 * @property {() => {bpm?: {value: number}, swing?: number}|null} getTransport
 * @property {(container: HTMLElement, value: number, attribute: string) => void} updateButtonGroup
 * @property {() => void} createOrUpdatePattern
 * @property {() => void} updateEstimatedExportDuration
 * @property {() => void} updateOfflineExportModeUi
 * @property {() => void} updateEnvelope
 * @property {(message: string, type?: string) => void} showToast
 */

/**
 * @typedef {object} SettingsManagerAudio
 * @property {{wet: {value: number}}|undefined} distortion
 * @property {{frequency: {value: number}, Q: {value: number}}|undefined} filter
 * @property {{wet: {value: number}}|undefined} chorus
 * @property {{wet: {value: number}}|undefined} autoPanner
 * @property {{wet: {value: number}}|undefined} delay
 * @property {{wet: {value: number}}|undefined} reverb
 * @property {{volume: {value: number}}|undefined} postGain
 */

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
 * @returns {{getAllSettings: () => ArpeggiatorSettings, loadAllSettings: (settings: unknown) => void, generateFilename: (isRealtime: boolean, settingsSnapshot?: ArpeggiatorSettings, exportType?: "audio"|"general") => string}} Settings helpers.
 */
export function createSettingsManager(context) {
    const state = /** @type {SettingsManagerState} */ (context.state);
    const dom = /** @type {Record<string, SettingsControl>} */ (context.dom);
    const actions = /** @type {SettingsManagerActions} */ (context.actions);
    const audio = /** @type {SettingsManagerAudio} */ (context.audio);

    /**
     * Collects all current UI settings into an object.
     *
     * @returns {ArpeggiatorSettings} A settings snapshot.
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
            offlineExportMode: normalizeOfflineExportMode(
                Array.from(dom.offlineExportModeInputs || []).find((input) => input.checked)?.value,
            ),
            offlineExportTailSeconds: normalizeOfflineExportTailSeconds(
                dom.offlineExportTailSecondsInput?.value,
            ),
        };
    }

    /**
     * Loads a settings snapshot into the UI and live Tone.js state.
     *
     * @param {unknown} rawSettings - Imported, restored, or in-memory settings to restore.
     * @returns {void}
     */
    function loadAllSettings(rawSettings) {
        try {
            const settings = normalizeSettings(rawSettings, getAllSettings());
            dom.bpmSlider.value = String(settings.bpm);
            dom.bpmValue.textContent = String(settings.bpm);
            const transport =
                typeof actions.getTransport === "function" ? actions.getTransport() : null;
            if (transport?.bpm) {
                transport.bpm.value = settings.bpm;
            }
            dom.swingSlider.value = String(settings.swing);
            dom.swingValue.textContent = settings.swing.toFixed(2);
            if (transport) {
                transport.swing = settings.swing;
            }

            // Restore post gain
            if (settings.postGain !== undefined && dom.postGainSlider) {
                dom.postGainSlider.value = String(settings.postGain);
                const pct = Math.round(((settings.postGain + 40) / 40) * 100);
                dom.postGainValue.textContent = String(pct);
                if (audio.postGain) audio.postGain.volume.value = settings.postGain;
            }

            const notesArr = settings.baseNotes;

            if (dom.notesInput) {
                dom.notesInput.value = notesArr.join(" ");
            }
            state.currentNotes = [...notesArr];
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
                dom.harmonicitySlider.value = String(settings.harmonicity);
                dom.harmonicityValue.textContent = settings.harmonicity.toFixed(1);
            }
            if (settings.modulationIndex) {
                dom.modIndexSlider.value = String(settings.modulationIndex);
                dom.modIndexValue.textContent = settings.modulationIndex.toFixed(1);
            }

            // Restore extended synth params
            if (settings.monoCutoff !== undefined && dom.monoCutoffSlider) {
                dom.monoCutoffSlider.value = String(settings.monoCutoff);
                if (dom.monoCutoffValue)
                    dom.monoCutoffValue.textContent = settings.monoCutoff.toFixed(0);
            }
            if (settings.monoOctaves !== undefined && dom.monoOctavesSlider) {
                dom.monoOctavesSlider.value = String(settings.monoOctaves);
                if (dom.monoOctavesValue)
                    dom.monoOctavesValue.textContent = settings.monoOctaves.toFixed(1);
            }
            if (settings.monoQ !== undefined && dom.monoQSlider) {
                dom.monoQSlider.value = String(settings.monoQ);
                if (dom.monoQValue) dom.monoQValue.textContent = settings.monoQ.toFixed(1);
            }
            if (settings.duoHarm !== undefined && dom.duoHarmSlider) {
                dom.duoHarmSlider.value = String(settings.duoHarm);
                if (dom.duoHarmValue) dom.duoHarmValue.textContent = settings.duoHarm.toFixed(2);
            }
            if (settings.duoVibrato !== undefined && dom.duoVibratoSlider) {
                dom.duoVibratoSlider.value = String(settings.duoVibrato);
                if (dom.duoVibratoValue)
                    dom.duoVibratoValue.textContent = settings.duoVibrato.toFixed(2);
            }
            if (settings.pluckDampening !== undefined && dom.pluckDampeningSlider) {
                dom.pluckDampeningSlider.value = String(settings.pluckDampening);
                if (dom.pluckDampeningValue)
                    dom.pluckDampeningValue.textContent = settings.pluckDampening.toFixed(0);
            }
            if (settings.pluckResonance !== undefined && dom.pluckResonanceSlider) {
                dom.pluckResonanceSlider.value = String(settings.pluckResonance);
                if (dom.pluckResonanceValue)
                    dom.pluckResonanceValue.textContent = settings.pluckResonance.toFixed(2);
            }
            if (settings.pluckNoise !== undefined && dom.pluckNoiseSlider) {
                dom.pluckNoiseSlider.value = String(settings.pluckNoise);
                if (dom.pluckNoiseValue)
                    dom.pluckNoiseValue.textContent = settings.pluckNoise.toFixed(1);
            }
            if (settings.membranePitchDecay !== undefined && dom.membranePitchDecaySlider) {
                dom.membranePitchDecaySlider.value = String(settings.membranePitchDecay);
                if (dom.membranePitchDecayValue)
                    dom.membranePitchDecayValue.textContent =
                        settings.membranePitchDecay.toFixed(3);
            }
            if (settings.membraneOctaves !== undefined && dom.membraneOctavesSlider) {
                dom.membraneOctavesSlider.value = String(settings.membraneOctaves);
                if (dom.membraneOctavesValue)
                    dom.membraneOctavesValue.textContent = settings.membraneOctaves.toFixed(1);
            }

            actions.setSynth(settings.synthType);

            // Restore duty cycle
            if (settings.dutyCycle !== undefined && dom.dutySlider) {
                dom.dutySlider.value = String(settings.dutyCycle);
                dom.dutyValue.textContent = settings.dutyCycle.toFixed(2);
            }

            // Restore ADSR envelope
            if (settings.envAttack !== undefined && dom.envAttackSlider) {
                dom.envAttackSlider.value = String(settings.envAttack);
                dom.envAttackValue.textContent = settings.envAttack.toFixed(2);
            }
            if (settings.envDecay !== undefined && dom.envDecaySlider) {
                dom.envDecaySlider.value = String(settings.envDecay);
                dom.envDecayValue.textContent = settings.envDecay.toFixed(2);
            }
            if (settings.envSustain !== undefined && dom.envSustainSlider) {
                dom.envSustainSlider.value = String(settings.envSustain);
                dom.envSustainValue.textContent = settings.envSustain.toFixed(2);
            }
            if (settings.envRelease !== undefined && dom.envReleaseSlider) {
                dom.envReleaseSlider.value = String(settings.envRelease);
                dom.envReleaseValue.textContent = settings.envRelease.toFixed(2);
            }
            if (typeof actions.updateEnvelope === "function") {
                actions.updateEnvelope();
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
            dom.gateSlider.value = String(gateRatio);
            dom.gateValue.textContent = gateRatio.toFixed(2);

            dom.filterCutoffSlider.value = String(settings.filterCutoff);
            dom.filterCutoffValue.textContent = settings.filterCutoff.toFixed(0);
            if (audio.filter) audio.filter.frequency.value = settings.filterCutoff;
            dom.filterResonanceSlider.value = String(settings.filterResonance);
            dom.filterResonanceValue.textContent = settings.filterResonance.toFixed(1);
            if (audio.filter) audio.filter.Q.value = settings.filterResonance;

            // Restore effects
            if (settings.driveMix !== undefined && dom.driveMixSlider) {
                dom.driveMixSlider.value = String(settings.driveMix);
                if (dom.driveMixValue) dom.driveMixValue.textContent = settings.driveMix.toFixed(2);
                if (audio.distortion) audio.distortion.wet.value = settings.driveMix;
            }
            if (settings.chorusMix !== undefined && dom.chorusMixSlider) {
                dom.chorusMixSlider.value = String(settings.chorusMix);
                if (dom.chorusMixValue)
                    dom.chorusMixValue.textContent = settings.chorusMix.toFixed(2);
                if (audio.chorus) audio.chorus.wet.value = settings.chorusMix;
            }
            if (settings.autoPanMix !== undefined && dom.autoPanMixSlider) {
                dom.autoPanMixSlider.value = String(settings.autoPanMix);
                if (dom.autoPanMixValue)
                    dom.autoPanMixValue.textContent = settings.autoPanMix.toFixed(2);
                if (audio.autoPanner) audio.autoPanner.wet.value = settings.autoPanMix;
            }

            dom.delayMixSlider.value = String(settings.delayMix);
            dom.delayMixValue.textContent = settings.delayMix.toFixed(2);
            if (audio.delay) audio.delay.wet.value = settings.delayMix;
            dom.reverbMixSlider.value = String(settings.reverbMix);
            dom.reverbMixValue.textContent = settings.reverbMix.toFixed(2);
            if (audio.reverb) audio.reverb.wet.value = settings.reverbMix;

            dom.loopCountInput.value = String(normalizeLoopCount(settings.loopCount));
            const offlineExportMode = normalizeOfflineExportMode(settings.offlineExportMode);
            Array.from(dom.offlineExportModeInputs || []).forEach((input) => {
                input.checked = input.value === offlineExportMode;
            });
            if (dom.offlineExportTailSecondsInput) {
                dom.offlineExportTailSecondsInput.value = String(
                    normalizeOfflineExportTailSeconds(settings.offlineExportTailSeconds),
                );
            }
            if (typeof actions.updateOfflineExportModeUi === "function") {
                actions.updateOfflineExportModeUi();
            }

            actions.createOrUpdatePattern();
            if (typeof actions.updateEstimatedExportDuration === "function") {
                actions.updateEstimatedExportDuration();
            }
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
     * @param {ArpeggiatorSettings} [settingsSnapshot] - Settings captured when an export begins.
     * @param {"audio"|"general"} [exportType="general"] - Filename use case.
     * @returns {string} The formatted filename without extension.
     */
    function generateFilename(isRealtime, settingsSnapshot, exportType = "general") {
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}_${date.getHours().toString().padStart(2, "0")}-${date.getMinutes().toString().padStart(2, "0")}-${date.getSeconds().toString().padStart(2, "0")}`;

        if (isRealtime) {
            return `arp-realtime-${timestamp}`;
        }

        const settings = settingsSnapshot || getAllSettings();
        if (exportType === "audio") {
            const baseNotes = Array.isArray(settings.baseNotes)
                ? settings.baseNotes
                : Array.isArray(settings.notes)
                  ? settings.notes
                  : [];
            const notes = baseNotes
                .map((note) => String(note).replace(/#/g, "s").replace(/b/g, "f"))
                .join("-");
            const scale = settings.scaleQuantize
                ? `${settings.scaleRoot}-${settings.scaleType}`
                : "chromatic";
            const exportMode = normalizeOfflineExportMode(settings.offlineExportMode);
            const tailSeconds = normalizeOfflineExportTailSeconds(
                settings.offlineExportTailSeconds,
            );
            const exportLength =
                exportMode === "seamless"
                    ? "seamless-loop"
                    : `tail-${String(tailSeconds).replace(".", "p")}s`;
            const synth =
                settings.synthType === "synth" ? `synth-${settings.waveform}` : settings.synthType;
            const filename = `arp-${settings.bpm}bpm-${notes || "notes"}-${settings.direction}-${settings.interval}-${normalizeLoopCount(settings.loopCount)}x-${exportLength}-${synth}-${scale}`;

            return `${filename.replace(/[^A-Za-z0-9-_#]/g, "")}-${timestamp}`;
        }

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
