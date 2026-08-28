/**
 * Audio Engine Module
 *
 * Owns the Tone.js synthesizer instantiation, effects signal chain, and
 * synth-switching logic. Exposes a factory function so the caller (app.js)
 * can inject DOM references and action callbacks.
 *
 * Signal chain:
 *   Synths → Distortion → Filter → Chorus → AutoPanner → Delay → Reverb → Post Gain → Limiter → Destination
 *                                                                                ↓
 *                                                                            Analyser (shared with visualizer)
 *
 * @module audio-engine
 */

import * as Tone from "tone";

/**
 * Creates the audio engine and all Tone.js nodes.
 *
 * @param {object} context - Injected app context.
 * @param {object} context.dom - DOM element references.
 * @param {HTMLElement} context.dom.advancedSynthParams - Container for FM/AM params.
 * @param {HTMLElement} context.dom.harmonicityControl - Harmonicity slider wrapper.
 * @param {HTMLElement} context.dom.modIndexControl - Modulation-index slider wrapper.
 * @param {HTMLElement} context.dom.carrierLabel - "(Carrier)" label element.
 * @param {HTMLElement} context.dom.dutyControl - Duty-cycle control wrapper.
 * @param {HTMLElement} context.dom.basicSynthParams - Basic synth params wrapper.
 * @param {HTMLElement} context.dom.waveformButtons - Waveform button container.
 * @param {HTMLElement} [context.dom.monoSynthParams] - Container for MonoSynth params.
 * @param {HTMLElement} [context.dom.duoSynthParams] - Container for DuoSynth params.
 * @param {HTMLElement} [context.dom.pluckSynthParams] - Container for PluckSynth params.
 * @param {HTMLElement} [context.dom.membraneSynthParams] - Container for MembraneSynth params.
 * @param {HTMLInputElement} context.dom.harmonicitySlider - Harmonicity <input>.
 * @param {HTMLInputElement} context.dom.modIndexSlider - Modulation-index <input>.
 * @param {HTMLInputElement} [context.dom.monoCutoffSlider] - MonoSynth filter base cutoff <input>.
 * @param {HTMLInputElement} [context.dom.monoOctavesSlider] - MonoSynth filter octaves <input>.
 * @param {HTMLInputElement} [context.dom.monoQSlider] - MonoSynth filter resonance Q <input>.
 * @param {HTMLInputElement} [context.dom.duoHarmSlider] - DuoSynth harmonicity <input>.
 * @param {HTMLInputElement} [context.dom.duoVibratoSlider] - DuoSynth vibrato amount <input>.
 * @param {HTMLInputElement} [context.dom.pluckDampeningSlider] - PluckSynth dampening <input>.
 * @param {HTMLInputElement} [context.dom.pluckResonanceSlider] - PluckSynth resonance <input>.
 * @param {HTMLInputElement} [context.dom.pluckNoiseSlider] - PluckSynth attack noise <input>.
 * @param {HTMLInputElement} [context.dom.membranePitchDecaySlider] - MembraneSynth pitch decay <input>.
 * @param {HTMLInputElement} [context.dom.membraneOctavesSlider] - MembraneSynth octaves <input>.
 * @param {HTMLInputElement} context.dom.envAttackSlider - Envelope Attack <input>.
 * @param {HTMLInputElement} context.dom.envDecaySlider - Envelope Decay <input>.
 * @param {HTMLInputElement} context.dom.envSustainSlider - Envelope Sustain <input>.
 * @param {HTMLInputElement} context.dom.envReleaseSlider - Envelope Release <input>.
 * @param {HTMLInputElement} [context.dom.driveMixSlider] - Drive distortion mix <input>.
 * @param {HTMLInputElement} [context.dom.chorusMixSlider] - Chorus effect mix <input>.
 * @param {HTMLInputElement} [context.dom.autoPanMixSlider] - Auto-pan effect mix <input>.
 * @param {object} context.actions - App action callbacks.
 * @param {Function} context.actions.syncPatternModuleState - Syncs pattern state.
 * @param {Function} context.actions.showToast - Toast notification.
 * @typedef {object} AudioEngine
 * @property {Tone.Analyser} analyser - Waveform analyser node.
 * @property {Tone.Distortion} distortion - Overdrive/distortion node.
 * @property {Tone.Filter} filter - Low-pass filter.
 * @property {Tone.Chorus} chorus - Stereo chorus effect node.
 * @property {Tone.AutoPanner} autoPanner - Tempo-synced auto-panner node.
 * @property {Tone.FeedbackDelay} delay - Feedback delay.
 * @property {Tone.Reverb} reverb - Convolution reverb.
 * @property {Tone.Volume} postGain - Post gain node.
 * @property {Tone.Limiter} [limiter] - Master limiter.
 * @property {object} synths - Synthesizer dictionary.
 * @property {string} currentWaveform - Active waveform type (get/set).
 * @property {Tone.Synth|Tone.FMSynth|Tone.AMSynth|Tone.MonoSynth|Tone.DuoSynth|Tone.PluckSynth|Tone.MembraneSynth} activeSynth - Currently selected synth.
 * @property {Function} setSynth - Switches active synth.
 * @property {Function} updateEnvelope - Applies ADSR slider values.
 * @property {Function} getSynthConfig - Returns synth config for offline render.
 * @property {Function} createOfflineChain - Recreates offline context graph.
 *
 * @returns {AudioEngine} Public API.
 */
export function createAudioEngine(context) {
    const { dom, actions } = context;

    // --- Internal state ---
    let currentWaveform = "sine";
    let activeSynth = null;

    // --- Analyser (shared with visualizer) ---
    const analyser = new Tone.Analyser("waveform", 1024);

    // --- Post Gain (pre-limiter) ---
    const postGain = new Tone.Volume(0); // 0 dB = unity gain

    // --- Master Limiter ---
    let limiter;
    try {
        limiter = new Tone.Limiter(0).toDestination();
    } catch (e) {
        console.warn("Tone.Limiter failed, connecting to Destination directly.", e);
    }

    // --- Real-time Meter (for peak/VU level metering) ---
    const meter = new Tone.Meter({ channels: 1, smoothing: 0.8 });

    // --- Effects Chain ---
    const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 });
    const delay = new Tone.FeedbackDelay({
        delayTime: "8n",
        feedback: 0.5,
        wet: 0.2,
    }).connect(reverb);

    const autoPanner = new Tone.AutoPanner({
        frequency: "4n",
        depth: 1,
        wet: 0,
    })
        .connect(delay)
        .start();

    const chorus = new Tone.Chorus({
        frequency: 1.5,
        delayTime: 3.5,
        depth: 0.7,
        wet: 0,
    })
        .connect(autoPanner)
        .start();

    const filter = new Tone.Filter({
        type: "lowpass",
        frequency: 4000,
        Q: 1,
    }).connect(chorus);

    const distortion = new Tone.Distortion({
        distortion: 0.4,
        wet: 0,
    }).connect(filter);

    // --- Synthesizers ---
    const synths = {
        synth: new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
        }),
        fmSynth: new Tone.FMSynth({
            harmonicity: 3,
            modulationIndex: 10,
            detune: 0,
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
            modulation: { type: "square" },
            modulationEnvelope: {
                attack: 0.01,
                decay: 0,
                sustain: 1,
                release: 0.5,
            },
        }),
        amSynth: new Tone.AMSynth({
            harmonicity: 3,
            detune: 0,
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
            modulation: { type: "square" },
            modulationEnvelope: {
                attack: 0.01,
                decay: 0,
                sustain: 1,
                release: 0.5,
            },
        }),
        monoSynth: new Tone.MonoSynth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
            filter: { Q: 2, type: "lowpass", rollover: -12 },
            filterEnvelope: {
                attack: 0.05,
                decay: 0.2,
                sustain: 0.2,
                release: 0.8,
                baseFrequency: 300,
                octaves: 4,
                exponent: 2,
            },
        }),
        duoSynth: new Tone.DuoSynth({
            harmonicity: 1.5,
            vibratoRate: 5,
            vibratoAmount: 0.2,
            voice0: {
                oscillator: { type: "sine" },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
            },
            voice1: {
                oscillator: { type: "sine" },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
            },
        }),
        pluckSynth: new Tone.PluckSynth({
            attackNoise: 1,
            dampening: 4000,
            resonance: 0.9,
        }),
        membraneSynth: new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 8,
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 },
        }),
    };

    // Connect all synths to start of effects chain (distortion)
    synths.synth.connect(distortion);
    synths.fmSynth.connect(distortion);
    synths.amSynth.connect(distortion);
    synths.monoSynth.connect(distortion);
    synths.duoSynth.connect(distortion);
    synths.pluckSynth.connect(distortion);
    synths.membraneSynth.connect(distortion);

    // Connect reverb → post gain → limiter → destination & meter; reverb → analyser
    reverb.connect(postGain);
    if (limiter) {
        postGain.connect(limiter);
        limiter.connect(meter);
    } else {
        postGain.connect(meter);
        postGain.toDestination();
    }
    reverb.connect(analyser);

    /**
     * Hides all synth-specific parameter wrappers.
     *
     * @returns {void}
     */
    function hideAllSpecificParams() {
        if (dom.basicSynthParams) dom.basicSynthParams.classList.add("hidden");
        if (dom.advancedSynthParams) dom.advancedSynthParams.classList.add("hidden");
        if (dom.carrierLabel) dom.carrierLabel.classList.add("hidden");
        if (dom.monoSynthParams) dom.monoSynthParams.classList.add("hidden");
        if (dom.duoSynthParams) dom.duoSynthParams.classList.add("hidden");
        if (dom.pluckSynthParams) dom.pluckSynthParams.classList.add("hidden");
        if (dom.membraneSynthParams) dom.membraneSynthParams.classList.add("hidden");
    }

    /**
     * Switches the active synth, updates UI visibility for advanced
     * synth-specific parameters, and applies the current ADSR envelope.
     *
     * @param {string} [type='synth'] - Synth key name.
     * @returns {void}
     */
    function setSynth(type = "synth") {
        activeSynth = synths[type] || synths.synth;
        actions.syncPatternModuleState();

        // Apply current ADSR to new synth
        updateEnvelope();

        // Enable/disable waveform buttons depending on whether active synth uses an oscillator
        if (dom.waveformButtons) {
            const isPluck = type === "pluckSynth";
            dom.waveformButtons.querySelectorAll("button").forEach((btn) => {
                btn.disabled = isPluck;
                if (isPluck) {
                    btn.classList.add("opacity-40", "cursor-not-allowed");
                    btn.setAttribute(
                        "title",
                        "Waveform is disabled for Pluck Synth (physical string modeling)",
                    );
                } else {
                    btn.classList.remove("opacity-40", "cursor-not-allowed");
                    btn.removeAttribute("title");
                }
            });
        }

        if (dom.waveformPluckOverlay) {
            if (type === "pluckSynth") {
                dom.waveformPluckOverlay.classList.remove("hidden");
            } else {
                dom.waveformPluckOverlay.classList.add("hidden");
            }
        }

        hideAllSpecificParams();

        if (type === "synth") {
            if (activeSynth.oscillator) activeSynth.oscillator.type = currentWaveform;
            if (currentWaveform === "square" && dom.dutyControl && dom.basicSynthParams) {
                dom.dutyControl.classList.remove("hidden");
                dom.basicSynthParams.classList.remove("hidden");
            }
        } else if (type === "fmSynth") {
            if (dom.harmonicitySlider)
                activeSynth.harmonicity.value = parseFloat(dom.harmonicitySlider.value);
            if (dom.modIndexSlider)
                activeSynth.modulationIndex.value = parseFloat(dom.modIndexSlider.value);
            if (activeSynth.oscillator) activeSynth.oscillator.type = currentWaveform;

            if (dom.advancedSynthParams) dom.advancedSynthParams.classList.remove("hidden");
            if (dom.harmonicityControl) dom.harmonicityControl.classList.remove("hidden");
            if (dom.modIndexControl) dom.modIndexControl.classList.remove("hidden");
            if (dom.carrierLabel) dom.carrierLabel.classList.remove("hidden");
        } else if (type === "amSynth") {
            if (dom.harmonicitySlider)
                activeSynth.harmonicity.value = parseFloat(dom.harmonicitySlider.value);
            if (activeSynth.oscillator) activeSynth.oscillator.type = currentWaveform;

            if (dom.advancedSynthParams) dom.advancedSynthParams.classList.remove("hidden");
            if (dom.harmonicityControl) dom.harmonicityControl.classList.remove("hidden");
            if (dom.modIndexControl) dom.modIndexControl.classList.add("hidden");
            if (dom.carrierLabel) dom.carrierLabel.classList.remove("hidden");
        } else if (type === "monoSynth") {
            if (activeSynth.oscillator) activeSynth.oscillator.type = currentWaveform;
            if (dom.monoCutoffSlider && activeSynth.filterEnvelope) {
                activeSynth.filterEnvelope.baseFrequency = parseFloat(dom.monoCutoffSlider.value);
            }
            if (dom.monoOctavesSlider && activeSynth.filterEnvelope) {
                activeSynth.filterEnvelope.octaves = parseFloat(dom.monoOctavesSlider.value);
            }
            if (dom.monoQSlider && activeSynth.filter) {
                activeSynth.filter.Q.value = parseFloat(dom.monoQSlider.value);
            }
            if (dom.monoSynthParams) dom.monoSynthParams.classList.remove("hidden");
        } else if (type === "duoSynth") {
            if (activeSynth.voice0 && activeSynth.voice0.oscillator) {
                activeSynth.voice0.oscillator.type = currentWaveform;
            }
            if (activeSynth.voice1 && activeSynth.voice1.oscillator) {
                activeSynth.voice1.oscillator.type = currentWaveform;
            }
            if (dom.duoHarmSlider) {
                activeSynth.harmonicity.value = parseFloat(dom.duoHarmSlider.value);
            }
            if (dom.duoVibratoSlider) {
                activeSynth.vibratoAmount.value = parseFloat(dom.duoVibratoSlider.value);
            }
            if (dom.duoSynthParams) dom.duoSynthParams.classList.remove("hidden");
        } else if (type === "pluckSynth") {
            if (dom.pluckDampeningSlider) {
                activeSynth.dampening = parseFloat(dom.pluckDampeningSlider.value);
            }
            if (dom.pluckResonanceSlider) {
                activeSynth.resonance = parseFloat(dom.pluckResonanceSlider.value);
            }
            if (dom.pluckNoiseSlider) {
                activeSynth.attackNoise = parseFloat(dom.pluckNoiseSlider.value);
            }
            if (dom.pluckSynthParams) dom.pluckSynthParams.classList.remove("hidden");
        } else if (type === "membraneSynth") {
            if (activeSynth.oscillator) activeSynth.oscillator.type = currentWaveform;
            if (dom.membranePitchDecaySlider) {
                activeSynth.pitchDecay = parseFloat(dom.membranePitchDecaySlider.value);
            }
            if (dom.membraneOctavesSlider) {
                activeSynth.octaves = parseFloat(dom.membraneOctavesSlider.value);
            }
            if (dom.membraneSynthParams) dom.membraneSynthParams.classList.remove("hidden");
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

        if (activeSynth.voice0 && activeSynth.voice0.envelope) {
            activeSynth.voice0.envelope.attack = attack;
            activeSynth.voice0.envelope.decay = decay;
            activeSynth.voice0.envelope.sustain = sustain;
            activeSynth.voice0.envelope.release = release;
        }

        if (activeSynth.voice1 && activeSynth.voice1.envelope) {
            activeSynth.voice1.envelope.attack = attack;
            activeSynth.voice1.envelope.decay = decay;
            activeSynth.voice1.envelope.sustain = sustain;
            activeSynth.voice1.envelope.release = release;
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

    /**
     * Recreates and connects the synthesizer and effects chain inside a Tone.Offline context.
     * This ensures the offline render output perfectly matches the live output routing and settings.
     *
     * @param {object} offlineContext - The Tone.Offline context.
     * @param {object} settings - Snapshot of the active settings.
     * @returns {object} Reference to the created offline synth and final output node.
     */
    function createOfflineChain(offlineContext, settings) {
        // 1. Recreate Limiter inside the virtual context (if supported)
        let offlineLimiter;
        try {
            offlineLimiter = new Tone.Limiter(0).toDestination();
        } catch (e) {
            // Fallback if context doesn't support limiters
        }

        // 2. Recreate Effects (reverb, delay, autoPanner, chorus, filter, distortion)
        const offlineReverb = new Tone.Reverb({
            decay: 1.5,
            wet: settings.reverbMix,
        });

        const offlineDelay = new Tone.FeedbackDelay({
            delayTime: "8n",
            feedback: 0.5,
            wet: settings.delayMix,
        }).connect(offlineReverb);

        const offlineAutoPanner = new Tone.AutoPanner({
            frequency: "4n",
            depth: 1,
            wet: settings.autoPanMix || 0,
        })
            .connect(offlineDelay)
            .start();

        const offlineChorus = new Tone.Chorus({
            frequency: 1.5,
            delayTime: 3.5,
            depth: 0.7,
            wet: settings.chorusMix || 0,
        })
            .connect(offlineAutoPanner)
            .start();

        const offlineFilter = new Tone.Filter({
            type: "lowpass",
            frequency: settings.filterCutoff,
            Q: settings.filterResonance,
        }).connect(offlineChorus);

        const offlineDistortion = new Tone.Distortion({
            distortion: 0.4,
            wet: settings.driveMix || 0,
        }).connect(offlineFilter);

        // 3. Recreate Synth based on type
        let offlineSynth;
        const synthType = settings.synthType || "synth";

        if (synthType === "fmSynth") {
            offlineSynth = new Tone.FMSynth(getSynthConfig("fmSynth"));
            offlineSynth.harmonicity.value = settings.harmonicity;
            offlineSynth.modulationIndex.value = settings.modulationIndex;
            offlineSynth.oscillator.type = settings.waveform;
        } else if (synthType === "amSynth") {
            offlineSynth = new Tone.AMSynth(getSynthConfig("amSynth"));
            offlineSynth.harmonicity.value = settings.harmonicity;
            offlineSynth.oscillator.type = settings.waveform;
        } else if (synthType === "monoSynth") {
            offlineSynth = new Tone.MonoSynth(getSynthConfig("monoSynth"));
            if (settings.monoCutoff)
                offlineSynth.filterEnvelope.baseFrequency = settings.monoCutoff;
            if (settings.monoOctaves) offlineSynth.filterEnvelope.octaves = settings.monoOctaves;
            if (settings.monoQ) offlineSynth.filter.Q.value = settings.monoQ;
            offlineSynth.oscillator.type = settings.waveform;
        } else if (synthType === "duoSynth") {
            offlineSynth = new Tone.DuoSynth(getSynthConfig("duoSynth"));
            if (settings.duoHarm) offlineSynth.harmonicity.value = settings.duoHarm;
            if (settings.duoVibrato) offlineSynth.vibratoAmount.value = settings.duoVibrato;
            if (offlineSynth.voice0 && offlineSynth.voice0.oscillator) {
                offlineSynth.voice0.oscillator.type = settings.waveform;
            }
            if (offlineSynth.voice1 && offlineSynth.voice1.oscillator) {
                offlineSynth.voice1.oscillator.type = settings.waveform;
            }
        } else if (synthType === "pluckSynth") {
            offlineSynth = new Tone.PluckSynth(getSynthConfig("pluckSynth"));
            if (settings.pluckDampening) offlineSynth.dampening = settings.pluckDampening;
            if (settings.pluckResonance) offlineSynth.resonance = settings.pluckResonance;
            if (settings.pluckNoise) offlineSynth.attackNoise = settings.pluckNoise;
        } else if (synthType === "membraneSynth") {
            offlineSynth = new Tone.MembraneSynth(getSynthConfig("membraneSynth"));
            if (settings.membranePitchDecay) offlineSynth.pitchDecay = settings.membranePitchDecay;
            if (settings.membraneOctaves) offlineSynth.octaves = settings.membraneOctaves;
            offlineSynth.oscillator.type = settings.waveform;
        } else {
            offlineSynth = new Tone.Synth(getSynthConfig("synth"));
            offlineSynth.oscillator.type = settings.waveform;
        }

        offlineSynth.connect(offlineDistortion);

        // Apply active ADSR Envelope settings
        if (offlineSynth.envelope) {
            offlineSynth.envelope.attack = settings.envAttack;
            offlineSynth.envelope.decay = settings.envDecay;
            offlineSynth.envelope.sustain = settings.envSustain;
            offlineSynth.envelope.release = settings.envRelease;
        }
        if (offlineSynth.voice0 && offlineSynth.voice0.envelope) {
            offlineSynth.voice0.envelope.attack = settings.envAttack;
            offlineSynth.voice0.envelope.decay = settings.envDecay;
            offlineSynth.voice0.envelope.sustain = settings.envSustain;
            offlineSynth.voice0.envelope.release = settings.envRelease;
        }
        if (offlineSynth.voice1 && offlineSynth.voice1.envelope) {
            offlineSynth.voice1.envelope.attack = settings.envAttack;
            offlineSynth.voice1.envelope.decay = settings.envDecay;
            offlineSynth.voice1.envelope.sustain = settings.envSustain;
            offlineSynth.voice1.envelope.release = settings.envRelease;
        }

        // 4. Connect final output to virtual destination
        if (offlineLimiter) {
            offlineReverb.connect(offlineLimiter);
        } else {
            offlineReverb.connect(offlineContext.destination);
        }

        return { offlineSynth, offlineOutput: offlineReverb };
    }

    // Set default synth
    setSynth("synth");

    return {
        analyser,
        meter,
        distortion,
        filter,
        chorus,
        autoPanner,
        delay,
        reverb,
        postGain,
        limiter,
        synths,
        get activeSynth() {
            return activeSynth;
        },
        get currentWaveform() {
            return currentWaveform;
        },
        set currentWaveform(val) {
            currentWaveform = val;
        },
        setSynth,
        updateEnvelope,
        getSynthConfig,
        createOfflineChain,
    };
}
