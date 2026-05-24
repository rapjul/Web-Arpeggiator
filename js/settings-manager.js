/**
 * Settings serialization, restoration, and naming helpers.
 */

/**
 * Builds a settings API bound to the app's live DOM and state.
 *
 * @param {object} context - Bound app references.
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
        const notesWithOctaves = actions.getArpeggioNotes(baseNotes, state.currentOctaveRange, state.currentOctaveShift);

        return {
            bpm: parseInt(dom.bpmSlider.value),
            swing: parseFloat(dom.swingSlider.value),
            postGain: parseFloat(dom.postGainSlider.value),
            // Pattern
            baseNotes,
            notes: notesWithOctaves,
            direction: actions.getSelectedPatternDirection(),
            interval: dom.intervalSelect.value,
            scaleQuantize: dom.scaleQuantizeToggle.checked,
            scaleRoot: dom.scaleRootSelect.value,
            scaleType: dom.scaleTypeSelect.value,
            synthType: dom.synthTypeSelect.value,
            waveform: state.currentWaveform,
            harmonicity: parseFloat(dom.harmonicitySlider.value),
            modulationIndex: parseFloat(dom.modIndexSlider.value),
            octaveShift: state.currentOctaveShift,
            octaveRange: state.currentOctaveRange,
            gateRatio: parseFloat(dom.gateSlider.value),
            filterCutoff: parseFloat(dom.filterCutoffSlider.value),
            filterResonance: parseFloat(dom.filterResonanceSlider.value),
            delayMix: parseFloat(dom.delayMixSlider.value),
            reverbMix: parseFloat(dom.reverbMixSlider.value),
            loopCount: parseInt(dom.loopCountInput.value)
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
            Tone.Transport.bpm.value = settings.bpm;
            dom.swingSlider.value = settings.swing;
            dom.swingValue.textContent = settings.swing.toFixed(2);
            Tone.Transport.swing = settings.swing;

            // Restore post gain
            if (settings.postGain !== undefined && dom.postGainSlider) {
                dom.postGainSlider.value = settings.postGain;
                const pct = Math.round((settings.postGain + 40) / 40 * 100);
                dom.postGainValue.textContent = pct;
                if (audio.postGain) audio.postGain.volume.value = settings.postGain;
            }

            dom.notesInput.value = settings.baseNotes.join(' ');
            state.currentNotes = settings.baseNotes;
            actions.setSelectedPatternDirection(settings.direction);
            dom.intervalSelect.value = settings.interval;

            dom.scaleQuantizeToggle.checked = settings.scaleQuantize;
            dom.scaleRootSelect.value = settings.scaleRoot;
            dom.scaleTypeSelect.value = settings.scaleType;
            actions.updateScaleQuantizeUi();

            dom.synthTypeSelect.value = settings.synthType;

            state.currentWaveform = settings.waveform;
            actions.updateWaveformButtons(state.currentWaveform);
            if (state.activeSynth && state.activeSynth.oscillator) {
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

            actions.setSynth(settings.synthType);

            state.currentOctaveShift = settings.octaveShift;
            state.currentOctaveRange = settings.octaveRange;
            actions.updateButtonGroup(dom.octaveShiftButtons, state.currentOctaveShift, 'data-shift');
            actions.updateButtonGroup(dom.octaveRangeButtons, state.currentOctaveRange, 'data-range');

            const gateRatio = settings.gateRatio || 0.8;
            dom.gateSlider.value = gateRatio;
            dom.gateValue.textContent = gateRatio.toFixed(2);

            dom.filterCutoffSlider.value = settings.filterCutoff;
            dom.filterCutoffValue.textContent = settings.filterCutoff.toFixed(0);
            audio.filter.frequency.value = settings.filterCutoff;
            dom.filterResonanceSlider.value = settings.filterResonance;
            dom.filterResonanceValue.textContent = settings.filterResonance.toFixed(1);
            audio.filter.Q.value = settings.filterResonance;

            dom.delayMixSlider.value = settings.delayMix;
            dom.delayMixValue.textContent = settings.delayMix.toFixed(2);
            audio.delay.wet.value = settings.delayMix;
            dom.reverbMixSlider.value = settings.reverbMix;
            dom.reverbMixValue.textContent = settings.reverbMix.toFixed(2);
            audio.reverb.wet.value = settings.reverbMix;

            dom.loopCountInput.value = settings.loopCount;

            actions.syncPatternModuleState();
            actions.createOrUpdatePattern();
        } catch (error) {
            console.error('Failed to parse preset:', error);
            alert('Error loading preset. File may be corrupt or from an older version.');
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
        const timestamp = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}-${date.getMinutes().toString().padStart(2, '0')}-${date.getSeconds().toString().padStart(2, '0')}`;

        if (isRealtime) {
            return `arp-realtime-${timestamp}`;
        }

        const settings = getAllSettings();
        const notesString = settings.baseNotes
            .join('')
            .replace(/#/g, 's')
            .replace(/b/g, 'f')
            .replace(/\d/g, '');

        let baseName = '';
        const scaleQuantize = settings.scaleQuantize ? `${settings.scaleRoot}-${settings.scaleType}` : 'noScale';

        if (settings.synthType === 'synth') {
            baseName = `arp-${settings.bpm}bpm-basicSynth-${settings.synthType}-${settings.waveform}-${settings.interval}-${notesString}-${scaleQuantize}`;
        } else if (settings.synthType === 'fmSynth' || settings.synthType === 'amSynth') {
            baseName = `arp-${settings.bpm}bpm-${settings.direction}-${settings.synthType}-${settings.interval}-${notesString}-${scaleQuantize}`;
        } else {
            actions.showToast(`Unknown synth type: ${settings.synthType}.`, 'error');
            baseName = `arp-${settings.bpm}bpm-${settings.direction}-${settings.synthType}-${settings.interval}-${notesString}-${scaleQuantize}`;
        }

        baseName = baseName.replace(/[^A-Za-z0-9-_#]/g, '');

        return `${baseName}-${timestamp}`;
    }

    return {
        getAllSettings,
        loadAllSettings,
        generateFilename
    };
}
