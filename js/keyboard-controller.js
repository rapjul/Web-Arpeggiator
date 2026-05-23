/**
 * Virtual keyboard DOM and interaction controller.
 */

/**
 * Initializes the virtual keyboard against the live app state.
 *
 * @param {object} context - Bound app references.
 * @returns {{updateKeyboardControlUi: Function}} Keyboard helpers.
 */
export function initializeKeyboardControls(context) {
    const { state, dom } = context;

    const keyboardMapping = {
        z: 'C4', s: 'C#4', x: 'D4', d: 'D#4', c: 'E4', v: 'F4', g: 'F#4', b: 'G4', h: 'G#4', n: 'A4', j: 'A#4', m: 'B4',
        q: 'C5', '2': 'C#5', w: 'D5', '3': 'D#5', e: 'E5', r: 'F5', '5': 'F#5', t: 'G5', '6': 'G#5', y: 'A5', '7': 'A#5', u: 'B5', i: 'C6'
    };

    const visualKeysData = [
        { note: 'C4', label: 'Z', type: 'white' },
        { note: 'C#4', label: 'S', type: 'black' },
        { note: 'D4', label: 'X', type: 'white' },
        { note: 'D#4', label: 'D', type: 'black' },
        { note: 'E4', label: 'C', type: 'white' },
        { note: 'F4', label: 'V', type: 'white' },
        { note: 'F#4', label: 'G', type: 'black' },
        { note: 'G4', label: 'B', type: 'white' },
        { note: 'G#4', label: 'H', type: 'black' },
        { note: 'A4', label: 'N', type: 'white' },
        { note: 'A#4', label: 'J', type: 'black' },
        { note: 'B4', label: 'M', type: 'white' },
        { note: 'C5', label: 'Q', type: 'white' },
        { note: 'C#5', label: '2', type: 'black' },
        { note: 'D5', label: 'W', type: 'white' },
        { note: 'D#5', label: '3', type: 'black' },
        { note: 'E5', label: 'E', type: 'white' },
        { note: 'F5', label: 'R', type: 'white' },
        { note: 'F#5', label: '5', type: 'black' },
        { note: 'G5', label: 'T', type: 'white' },
        { note: 'G#5', label: '6', type: 'black' },
        { note: 'A5', label: 'Y', type: 'white' },
        { note: 'A#5', label: '7', type: 'black' },
        { note: 'B5', label: 'U', type: 'white' },
        { note: 'C6', label: 'I', type: 'white' }
    ];

    const keyboardMainWrapper = dom.keyboardVisual;
    keyboardMainWrapper.id = 'keyboard-main-wrapper';
    keyboardMainWrapper.classList.remove('flex', 'justify-center', 'items-start', 'h-20', 'select-none');

    const octave1Wrapper = document.createElement('div');
    octave1Wrapper.id = 'keyboard-octave-1';
    octave1Wrapper.classList.add('piano-octave');

    const octave2Wrapper = document.createElement('div');
    octave2Wrapper.id = 'keyboard-octave-2';
    octave2Wrapper.classList.add('piano-octave');

    keyboardMainWrapper.innerHTML = '';
    keyboardMainWrapper.appendChild(octave1Wrapper);
    keyboardMainWrapper.appendChild(octave2Wrapper);

    let currentOctaveTarget = octave1Wrapper;
    let whiteKeyIndexInCurrentOctave = 0;
    const whiteKeyWidthPx = 40;
    const blackKeyWidthPx = 24;

    visualKeysData.forEach((keyData) => {
        if (keyData.note === 'C5') {
            currentOctaveTarget = octave2Wrapper;
            whiteKeyIndexInCurrentOctave = 0;
        }

        const el = document.createElement('div');
        el.classList.add('piano-key');
        el.dataset.note = keyData.note;
        el.dataset.keylabel = keyData.label.toLowerCase();
        el.textContent = keyData.label;

        if (keyData.type === 'white') {
            el.classList.add('key-white');
            el.style.width = `${whiteKeyWidthPx}px`;
            el.style.height = '4.5rem';
            el.style.zIndex = '0';
            el.style.marginLeft = '-1px';
            el.dataset.whiteKeyIndex = whiteKeyIndexInCurrentOctave;
            whiteKeyIndexInCurrentOctave += 1;
        } else {
            el.classList.add('key-black');
            el.style.width = `${blackKeyWidthPx}px`;
            el.style.height = '2.5rem';
            el.style.position = 'absolute';
            el.style.top = '0';
            el.style.zIndex = '10';

            let baseWhiteKeyIndexOffset = 0;
            switch (keyData.note) {
                case 'C#4':
                case 'C#5':
                    baseWhiteKeyIndexOffset = 0;
                    break;
                case 'D#4':
                case 'D#5':
                    baseWhiteKeyIndexOffset = 1;
                    break;
                case 'F#4':
                case 'F#5':
                    baseWhiteKeyIndexOffset = 3;
                    break;
                case 'G#4':
                case 'G#5':
                    baseWhiteKeyIndexOffset = 4;
                    break;
                case 'A#4':
                case 'A#5':
                    baseWhiteKeyIndexOffset = 5;
                    break;
                default:
                    console.warn(`Unexpected black key: ${keyData.note}`);
                    break;
            }

            const cumulativeMarginOffset = baseWhiteKeyIndexOffset;
            const leftPosition = (baseWhiteKeyIndexOffset * whiteKeyWidthPx) + whiteKeyWidthPx - (blackKeyWidthPx / 2) - cumulativeMarginOffset;
            el.style.left = `${leftPosition}px`;
            el.style.pointerEvents = 'auto';
        }

        el.addEventListener('mousedown', (event) => {
            event.preventDefault();
            triggerKey(keyData.note);
        });
        el.addEventListener('mouseup', (event) => {
            event.preventDefault();
            releaseKey(keyData.note);
        });
        el.addEventListener('mouseleave', () => releaseKey(keyData.note));
        el.addEventListener('touchstart', (event) => {
            event.preventDefault();
            triggerKey(keyData.note);
        });
        el.addEventListener('touchend', () => releaseKey(keyData.note));

        currentOctaveTarget.appendChild(el);
    });

    /**
     * Triggers an attack for a note if keyboard input is enabled.
     *
     * @param {string} note - The note name.
     * @returns {void}
     */
    function triggerKey(note) {
        if (state.activeSynth && state.isAudioContextStarted && dom.keyboardToggle.checked) {
            if (state.activeNote) {
                state.activeSynth.triggerRelease(Tone.now());
                highlightKey(state.activeNote, false);
            }

            state.activeSynth.triggerAttack(note, Tone.now());
            state.activeNote = note;
            highlightKey(note, true);
        }
    }

    /**
     * Releases the currently active note if it matches the provided note.
     *
     * @param {string} note - The note name.
     * @returns {void}
     */
    function releaseKey(note) {
        if (state.activeSynth && state.isAudioContextStarted && state.activeNote === note) {
            state.activeSynth.triggerRelease(Tone.now());
            highlightKey(note, false);
            state.activeNote = null;
        }
    }

    /**
     * Highlights or clears a virtual keyboard key.
     *
     * @param {string} note - The note name.
     * @param {boolean} on - Whether the key should be highlighted.
     * @returns {void}
     */
    function highlightKey(note, on) {
        const el = document.querySelector(`.piano-key[data-note="${note}"]`);
        if (el) {
            if (on) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        }
    }

    window.addEventListener('keydown', (event) => {
        if (event.repeat || event.target.tagName === 'INPUT' || !dom.keyboardToggle.checked) return;
        const key = event.key.toLowerCase();
        const note = keyboardMapping[key];
        if (note) {
            event.preventDefault();
            triggerKey(note);
        }
    });

    window.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        const note = keyboardMapping[key];
        if (note) {
            releaseKey(note);
        }
    });

    dom.keyboardToggle.addEventListener('change', () => {
        if (dom.keyboardToggle.checked) {
            dom.keyboardToggleStatus.textContent = 'On';
        } else {
            dom.keyboardToggleStatus.textContent = 'Off';
            if (state.activeNote) {
                state.activeSynth.triggerRelease(Tone.now());
                highlightKey(state.activeNote, false);
                state.activeNote = null;
            }
        }

        updateKeyboardControlUi();
    });

    /**
     * Updates the UI for the keyboard controls.
     *
     * @returns {void}
     */
    function updateKeyboardControlUi() {
        const isEnabled = dom.keyboardToggle.checked;
        if (isEnabled) {
            keyboardMainWrapper.classList.remove('opacity-60');
            dom.keyboardDescription.classList.remove('opacity-60');
            keyboardMainWrapper.classList.add('cursor-default');
            keyboardMainWrapper.classList.remove('cursor-not-allowed');
            dom.keyboardDescription.classList.add('cursor-default');
            dom.keyboardDescription.classList.remove('cursor-not-allowed');
        } else {
            keyboardMainWrapper.classList.add('opacity-60');
            dom.keyboardDescription.classList.add('opacity-60');
            keyboardMainWrapper.classList.add('cursor-not-allowed');
            keyboardMainWrapper.classList.remove('cursor-default');
            dom.keyboardDescription.classList.add('cursor-not-allowed');
            dom.keyboardDescription.classList.remove('cursor-default');
        }
    }

    return {
        updateKeyboardControlUi
    };
}
