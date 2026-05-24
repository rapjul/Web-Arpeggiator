/**
 * Audio Engine Module
 *
 * Owns the Tone.js synthesizer instantiation, effects signal chain, and
 * synth-switching logic.  Exposes a factory function so the caller (app.js)
 * can inject DOM references and action callbacks.
 *
 * Signal chain:
 *   Synths → Filter → Delay → Reverb → Post Gain → Limiter → Destination
 *                                                ↓
 *                                            Analyser  (shared with visualizer)
 *
 * @module audio-engine
 */

/**
 * Creates the audio engine and all Tone.js nodes.
 *
 * @param {object}   context                         - Injected app context.
 * @param {object}   context.dom                      - DOM element references.
 * @param {HTMLElement} context.dom.advancedSynthParams - Container for FM/AM params.
 * @param {HTMLElement} context.dom.harmonicityControl  - Harmonicity slider wrapper.
 * @param {HTMLElement} context.dom.modIndexControl     - Modulation-index slider wrapper.
 * @param {HTMLElement} context.dom.carrierLabel        - "(Carrier)" label element.
 * @param {HTMLElement} context.dom.dutyControl         - Duty-cycle control wrapper.
 * @param {HTMLElement} context.dom.basicSynthParams    - Basic synth params wrapper.
 * @param {HTMLElement} context.dom.waveformButtons     - Waveform button container.
 * @param {HTMLElement} context.dom.harmonicitySlider   - Harmonicity <input>.
 * @param {HTMLElement} context.dom.modIndexSlider      - Modulation-index <input>.
 * @param {object}   context.actions                   - App action callbacks.
 * @param {Function} context.actions.syncPatternModuleState - Syncs pattern state.
 * @param {Function} context.actions.showToast          - Toast notification.
 * @returns {object} Public API.
 * @returns {Tone.Analyser}        return.analyser        - Waveform analyser node.
 * @returns {Tone.Filter}          return.filter          - Low-pass filter.
 * @returns {Tone.FeedbackDelay}   return.delay           - Feedback delay.
 * @returns {Tone.Reverb}          return.reverb          - Convolution reverb.
 * @returns {Tone.Volume}          return.postGain        - Post gain node.
 * @returns {Tone.Limiter}         return.limiter         - Master limiter.
 * @returns {object}               return.synths          - { synth, fmSynth, amSynth }.
 * @returns {string}               return.currentWaveform - Active waveform type (get/set).
 * @returns {Tone.Synth|Tone.FMSynth|Tone.AMSynth} return.activeSynth - Currently selected synth.
 * @returns {Function}             return.setSynth        - Switches active synth.
 * @returns {Function}             return.updateEnvelope  - Applies ADSR slider values.
 * @returns {Function}             return.getSynthConfig  - Returns synth config for offline render.
 */
export function createAudioEngine(context) {
    const { dom, actions } = context;

    // --- Internal state ---
    let currentWaveform = 'sine';
    let activeSynth = null;

    // --- Analyser (shared with visualizer) ---
    const analyser = new Tone.Analyser('waveform', 1024);

    // --- Post Gain (pre-limiter) ---
    const postGain = new Tone.Volume(0); // 0 dB = unity gain

    // --- Master Limiter ---
    let limiter;
    try {
        limiter = new Tone.Limiter(0).toDestination();
    } catch (e) {
        console.warn("Tone.Limiter failed, connecting to Destination directly.", e);
    }

    // --- Effects Chain ---
    const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 });
    const delay = new Tone.FeedbackDelay({
        delayTime: '8n',
        feedback: 0.5,
        wet: 0.2
    }).connect(reverb);
    const filter = new Tone.Filter({
        type: 'lowpass',
        frequency: 4000,
        Q: 1
    }).connect(delay);

    // --- Synthesizers ---
    const synths = {
        synth: new Tone.Synth({
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 }
        }),
        fmSynth: new Tone.FMSynth({
            harmonicity: 3,
            modulationIndex: 10,
            detune: 0,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
            modulation: { type: 'square' },
            modulationEnvelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.5 }
        }),
        amSynth: new Tone.AMSynth({
            harmonicity: 3,
            detune: 0,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
            modulation: { type: 'square' },
            modulationEnvelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.5 }
        })
    };

    // Connect synths → filter (start of effects chain)
    synths.synth.connect(filter);
    synths.fmSynth.connect(filter);
    synths.amSynth.connect(filter);

    // Connect reverb → post gain → limiter → destination; reverb → analyser
    reverb.connect(postGain);
    if (limiter) {
        postGain.connect(limiter);
    } else {
        postGain.toDestination();
    }
    reverb.connect(analyser);

    /**
     * Switches the active synth, updates UI visibility for advanced
     * synth-specific parameters, and applies the current ADSR envelope.
     *
     * @param {string} type - Synth key: 'synth', 'fmSynth', or 'amSynth'.
     * @returns {void}
     */
    function setSynth(type = 'synth') {
        activeSynth = synths[type];
        actions.syncPatternModuleState();

        // Apply current ADSR to new synth
        updateEnvelope();

        // Enable all waveform buttons for all synths
        dom.waveformButtons.querySelectorAll('button').forEach((btn) => {
            btn.disabled = false;
        });

        if (type === 'synth') {
            activeSynth.oscillator.type = currentWaveform;
            dom.advancedSynthParams.classList.add('hidden');
            if (dom.carrierLabel) dom.carrierLabel.classList.add('hidden');

            if (currentWaveform === 'square') {
                dom.dutyControl.classList.remove('hidden');
                dom.basicSynthParams.classList.remove('hidden');
            } else {
                dom.dutyControl.classList.add('hidden');
                dom.basicSynthParams.classList.add('hidden');
            }
        } else if (type === 'fmSynth') {
            activeSynth.harmonicity.value = parseFloat(dom.harmonicitySlider.value);
            activeSynth.modulationIndex.value = parseFloat(dom.modIndexSlider.value);
            activeSynth.oscillator.type = currentWaveform;

            dom.advancedSynthParams.classList.remove('hidden');
            dom.harmonicityControl.classList.remove('hidden');
            dom.modIndexControl.classList.remove('hidden');
            if (dom.carrierLabel) dom.carrierLabel.classList.remove('hidden');
        } else if (type === 'amSynth') {
            activeSynth.harmonicity.value = parseFloat(dom.harmonicitySlider.value);
            activeSynth.oscillator.type = currentWaveform;

            dom.advancedSynthParams.classList.remove('hidden');
            dom.harmonicityControl.classList.remove('hidden');
            dom.modIndexControl.classList.add('hidden');
            if (dom.carrierLabel) dom.carrierLabel.classList.remove('hidden');
        }
    }

    /**
     * Reads ADSR slider values from the DOM and applies them to the
     * active synthesizer's envelope.
     *
     * @returns {void}
     */
    function updateEnvelope() {
        if (!activeSynth) return;

        const attack = parseFloat(dom.envAttackSlider.value);
        const decay = parseFloat(dom.envDecaySlider.value);
        const sustain = parseFloat(dom.envSustainSlider.value);
        const release = parseFloat(dom.envReleaseSlider.value);

        if (activeSynth.envelope) {
            activeSynth.envelope.attack = attack;
            activeSynth.envelope.decay = decay;
            activeSynth.envelope.sustain = sustain;
            activeSynth.envelope.release = release;
        }
    }

    /**
     * Returns a configuration object suitable for creating an offline
     * synth clone during Tone.Offline rendering.
     *
     * @param {string} type - Synth key.
     * @returns {object|null} Synth constructor config, or null if unknown.
     */
    function getSynthConfig(type) {
        const s = synths[type];
        return s ? s.get() : null;
    }

    // Set default synth
    setSynth('synth');

    return {
        analyser,
        filter,
        delay,
        reverb,
        postGain,
        limiter,
        synths,
        get activeSynth() { return activeSynth; },
        get currentWaveform() { return currentWaveform; },
        set currentWaveform(val) { currentWaveform = val; },
        setSynth,
        updateEnvelope,
        getSynthConfig
    };
}
