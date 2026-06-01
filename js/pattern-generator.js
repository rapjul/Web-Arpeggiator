import * as Tone from 'tone';
import * as Tonal from 'tonal';

// Pattern generator module.
// Keeps arpeggio note expansion and Tone.Pattern creation separate from app.js.

/**
 * Quantizes notes to the nearest pitch in a Tonal.js scale.
 *
 * @param {string[]} baseNotes - Notes to quantize.
 * @param {string} root - Scale root note.
 * @param {string} scaleType - Tonal.js scale type name.
 * @returns {string[]} Quantized notes, or a copy of the input on failure.
 */
export function quantizeToScale(baseNotes, root, scaleType) {
    try {
        if (!root || !scaleType || !Tonal) return baseNotes.slice();

        const scale = Tonal.Scale.get(`${root} ${scaleType}`);
        if (!scale || !scale.notes || scale.notes.length === 0) return baseNotes.slice();

        const scalePitchClasses = scale.notes.map(n => Tonal.Note.pitchClass(n));

        const chromaticPitches = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const chromaticRange = [];
        for (let octave = 2; octave < 7; octave++) {
            for (const note of chromaticPitches) chromaticRange.push(`${note}${octave}`);
        }

        const scaleNotes = chromaticRange.filter(note => scalePitchClasses.includes(Tonal.Note.pitchClass(note)));
        if (!scaleNotes.length) return baseNotes.slice();

        return baseNotes.map(note => {
            try {
                const noteMidi = Tonal.Note.midi(note);
                if (noteMidi === undefined) return note;

                const closest = scaleNotes
                    .map(Tonal.Note.midi)
                    .reduce((prev, curr) => Math.abs(curr - noteMidi) < Math.abs(prev - noteMidi) ? curr : prev);

                return Tonal.Note.fromMidi(closest);
            } catch (_) {
                return note;
            }
        });
    } catch (e) {
        console.warn('quantizeToScale failed', e);
        return baseNotes.slice();
    }
}

/**
 * Expands a base note list across octaves and optionally quantizes it.
 *
 * @param {string[]} baseNotes - Base note names from the UI.
 * @param {object} [opts={}] - Expansion and quantization options.
 * @param {number} [opts.octaveRange=1] - Number of octave layers to add.
 * @param {number} [opts.octaveShift=0] - Octave transposition to apply.
 * @param {{enabled:boolean,root:string,scale:string}} [opts.quantize] - Scale quantization settings.
 * @returns {string[]} Expanded note list for Tone.Pattern.
 */
export function getArpeggioNotes(baseNotes, opts = {}) {

    const octaveRange = opts.octaveRange || 1;
    const octaveShift = opts.octaveShift || 0;

    const notes = baseNotes.slice();

    let expanded = [];
    for (let i = 0; i < notes.length; i++) {
        for (let o = 0; o < octaveRange; o++) {
            const note = notes[i];
            const parsed = Tonal.Note.get(note);
            if (!parsed || parsed.midi === undefined) continue;
            const midi = parsed.midi + (o * 12) + (octaveShift * 12);
            expanded.push(Tonal.Note.fromMidi(midi));
        }
    }

    if (opts.quantize && opts.quantize.enabled) {
        try {
            expanded = quantizeToScale(expanded, opts.quantize.root, opts.quantize.scale);
        } catch (e) {
            console.warn('Quantize failed', e);
        }
    }

    return expanded;
}

/**
 * Module-level cache mapping each arpeggiator pattern step index to its corresponding base note index.
 * @type {number[]}
 */
let stepToBaseIndexMap = [];

/**
 * Expands base notes across octave ranges and transpositions, and optionally quantizes them,
 * returning both the final array of notes and a mapping of each note to its index in baseNotes.
 *
 * @param {string[]} baseNotes - The original input sequence of note strings.
 * @param {number} octaveRange - Number of octaves to duplicate notes across (1 to 5).
 * @param {number} octaveShift - Octave transposition offset (-3 to 3).
 * @param {Object} [quantize] - Scale quantization configuration options.
 * @param {boolean} quantize.enabled - Whether scale quantization is active.
 * @param {string} quantize.root - The root note of the quantization scale.
 * @param {string} quantize.scale - The scale type of the quantization scale.
 * @returns {{notes: string[], map: number[]}} The expanded notes and their corresponding original indices in baseNotes.
 */
function buildPatternNotesAndMap(baseNotes, octaveRange, octaveShift, quantize) {
    const notes = [];
    const map = [];
    for (let i = 0; i < baseNotes.length; i++) {
        const note = baseNotes[i];
        const parsed = Tonal.Note.get(note);
        if (!parsed || parsed.midi === undefined) continue;
        for (let o = 0; o < octaveRange; o++) {
            const midi = parsed.midi + (o * 12) + (octaveShift * 12);
            notes.push(Tonal.Note.fromMidi(midi));
            map.push(i);
        }
    }
    if (quantize && quantize.enabled) {
        const quantized = quantizeToScale(notes, quantize.root, quantize.scale);
        return { notes: quantized, map };
    }
    return { notes, map };
}

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
        const baseNotesInput = document.getElementById('notes');
        if (!baseNotesInput) return;

        const raw = baseNotesInput.value.trim();
        const baseNotes = raw.length ? raw.split(/\s+/) : [];

        const octaveRange = parseInt(window.currentOctaveRange || 1, 10) || 1;
        const octaveShift = parseInt(window.currentOctaveShift || 0, 10) || 0;

        const intervalSelect = document.getElementById('interval');
        const gateSlider = document.getElementById('gate');

        const interval = intervalSelect ? intervalSelect.value : '16n';
        const gate = gateSlider ? parseFloat(gateSlider.value) : 0.8;

        // Determine pattern direction from selected button
        const patternButtons = document.getElementById('pattern-buttons');
        let direction = 'up';
        if (patternButtons) {
            const active = patternButtons.querySelector('button.selected');
            if (active) direction = active.getAttribute('data-pattern') || 'up';
        }

        // Quantize options (if present in DOM)
        const quantizeToggle = document.getElementById('scale-quantize-toggle');
        const quantizeRoot = document.getElementById('scale-root') ? document.getElementById('scale-root').value : 'C';
        const quantizeType = document.getElementById('scale-type') ? document.getElementById('scale-type').value : 'major';
        const quantizeOpts = { enabled: quantizeToggle ? quantizeToggle.checked : false, root: quantizeRoot, scale: quantizeType };

        let finalNotes = [];
        let finalDirection = direction;
        stepToBaseIndexMap = [];

        if (direction === 'upDownRepeat') {
            const { notes: notesForPattern, map: mapForPattern } = buildPatternNotesAndMap(baseNotes, octaveRange, octaveShift, quantizeOpts);
            if (notesForPattern && notesForPattern.length > 0) {
                const reversedNotes = [...notesForPattern].reverse();
                const reversedMap = [...mapForPattern].reverse();
                finalNotes = [...notesForPattern, ...reversedNotes];
                stepToBaseIndexMap = [...mapForPattern, ...reversedMap];
                finalDirection = 'up';
            }
        } else if (direction === 'downUpRepeat') {
            const { notes: notesForPattern, map: mapForPattern } = buildPatternNotesAndMap(baseNotes, octaveRange, octaveShift, quantizeOpts);
            if (notesForPattern && notesForPattern.length > 0) {
                const reversedNotes = [...notesForPattern].reverse();
                const reversedMap = [...mapForPattern].reverse();
                finalNotes = [...reversedNotes, ...notesForPattern];
                stepToBaseIndexMap = [...reversedMap, ...mapForPattern];
                finalDirection = 'up';
            }
        } else if (direction === 'octaveCycle') {
            const quantizedBaseNotes = (quantizeToggle && quantizeToggle.checked)
                ? quantizeToScale(baseNotes, quantizeRoot, quantizeType)
                : baseNotes;
            quantizedBaseNotes.forEach((baseNote, i) => {
                const parsed = Tonal.Note.get(baseNote);
                if (!parsed || parsed.midi === undefined) return;
                for (let rep = 0; rep < 2; rep++) {
                    for (let oct = 0; oct < 3; oct++) {
                        const midi = parsed.midi + (octaveShift * 12) + (oct * 12);
                        finalNotes.push(Tonal.Note.fromMidi(midi));
                        stepToBaseIndexMap.push(i);
                    }
                }
            });
            finalDirection = 'up';
        } else if (direction === 'octaveCycleReverse') {
            const quantizedBaseNotes = (quantizeToggle && quantizeToggle.checked)
                ? quantizeToScale(baseNotes, quantizeRoot, quantizeType)
                : baseNotes;
            // Map notes to their original indices to ensure correct step highlighting after reversal.
            const indexedNotes = quantizedBaseNotes.map((note, index) => ({ note, index }));
            const reversedIndexed = [...indexedNotes].reverse();
            reversedIndexed.forEach(({ note, index }) => {
                const parsed = Tonal.Note.get(note);
                if (!parsed || parsed.midi === undefined) return;
                for (let rep = 0; rep < 2; rep++) {
                    for (let oct = 2; oct >= 0; oct--) {
                        const midi = parsed.midi + (octaveShift * 12) + (oct * 12);
                        finalNotes.push(Tonal.Note.fromMidi(midi));
                        stepToBaseIndexMap.push(index);
                    }
                }
            });
            finalDirection = 'up';
        } else if (direction === 'octaveCyclePingPong') {
            const quantizedBaseNotes = (quantizeToggle && quantizeToggle.checked)
                ? quantizeToScale(baseNotes, quantizeRoot, quantizeType)
                : baseNotes;
            quantizedBaseNotes.forEach((baseNote, i) => {
                const parsed = Tonal.Note.get(baseNote);
                if (!parsed || parsed.midi === undefined) return;
                // Up: 0,1,2
                for (let oct = 0; oct < 3; oct++) {
                    const midi = parsed.midi + (octaveShift * 12) + (oct * 12);
                    finalNotes.push(Tonal.Note.fromMidi(midi));
                    stepToBaseIndexMap.push(i);
                }
                // Down: 1,0
                for (let oct = 1; oct >= 0; oct--) {
                    const midi = parsed.midi + (octaveShift * 12) + (oct * 12);
                    finalNotes.push(Tonal.Note.fromMidi(midi));
                    stepToBaseIndexMap.push(i);
                }
                // Up again: 1,2
                for (let oct = 1; oct < 3; oct++) {
                    const midi = parsed.midi + (octaveShift * 12) + (oct * 12);
                    finalNotes.push(Tonal.Note.fromMidi(midi));
                    stepToBaseIndexMap.push(i);
                }
            });
            finalDirection = 'up';
        } else if (direction === 'randomWalkDrunk') {
            const { notes: notesForPattern, map: mapForPattern } = buildPatternNotesAndMap(baseNotes, octaveRange, octaveShift, quantizeOpts);
            if (notesForPattern && notesForPattern.length > 0) {
                let currentIndex = Math.floor(Math.random() * notesForPattern.length);
                finalNotes.push(notesForPattern[currentIndex]);
                stepToBaseIndexMap.push(mapForPattern[currentIndex]);

                for (let i = 1; i < 16; i++) {
                    let step;
                    if (Math.random() < 0.8) {
                        step = Math.random() > 0.5 ? 1 : -1;
                    } else {
                        step = Math.floor(Math.random() * 7) - 3; // -3 to 3
                        if (step === 0) step = 1; // avoid 0
                    }

                    currentIndex = (currentIndex + step + notesForPattern.length) % notesForPattern.length;
                    finalNotes.push(notesForPattern[currentIndex]);
                    stepToBaseIndexMap.push(mapForPattern[currentIndex]);
                }
                finalDirection = 'up';
            }
        } else {
            // Standard patterns (up, down, upDown, downUp, random, randomWalk)
            const { notes: notesForPattern, map: mapForPattern } = buildPatternNotesAndMap(baseNotes, octaveRange, octaveShift, quantizeOpts);
            finalNotes = notesForPattern;
            stepToBaseIndexMap = mapForPattern;
            finalDirection = direction;
        }

        if (!finalNotes || finalNotes.length === 0) return;

        // Dispose old pattern if present
        if (window.arpPattern) {
            try { window.arpPattern.dispose(); } catch (e) { }
            window.arpPattern = null;
        }

        // Calculate note duration in seconds once outside the scheduling callback to avoid timing warnings
        const durationSeconds = Tone.Time(interval).toSeconds() * gate;

        // Create Tone.Pattern with direction mapping (use Tone.Pattern for sequences)
        const patternInstance = new Tone.Pattern((time, note) => {
            const synth = window.activeSynth || null;
            if (synth && synth.triggerAttackRelease) {
                try {
                    synth.triggerAttackRelease(note, durationSeconds, time);
                } catch (e) {
                    try { synth.triggerAttackRelease(note, durationSeconds); } catch (_) { }
                }
            }

            // Resolve the current step index to highlight the correct pip
            const currentPattern = patternInstance || window.arpPattern;
            const patternIndex = currentPattern ? currentPattern.index : 0;
            const pipIndex = stepToBaseIndexMap[patternIndex] !== undefined ? stepToBaseIndexMap[patternIndex] : 0;

            if (typeof window.__WEB_ARP_STEP_HIGHLIGHT__ === 'function') {
                Tone.Draw.schedule(() => {
                    window.__WEB_ARP_STEP_HIGHLIGHT__(pipIndex);
                }, time);
            }
        }, finalNotes, finalDirection);

        window.arpPattern = patternInstance;
        window.arpPattern.interval = interval;

        if (window.isPlaying) window.arpPattern.start(0);
    } catch (e) {
        console.error('createOrUpdatePattern error', e);
    }
}

// Expose for debug/test hooks.
window.__patternGenerator = { getArpeggioNotes, createOrUpdatePattern };
