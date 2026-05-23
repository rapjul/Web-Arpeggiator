#!/usr/bin/env bash
#
# scripts/verify-randomizer.sh
#
# Verifies the randomize notes functionality inside a headless browser.
# Ensures that clicking the randomize button generates valid musical notes,
# respects scale quantization if enabled (e.g., generating only in-key notes),
# and updates the underlying arpeggiator transport values correctly.
#

set -euo pipefail

# Source the shared test helpers
# shellcheck source=./_test-helpers.sh
source "$(dirname "${BASH_SOURCE[0]}")/_test-helpers.sh"

# 1. Start HTTP server in the background (using port 4178 by default)
# If port 4178 is occupied, it will automatically search upward.
start_test_server 4178 "python"

# 2. Open page and wait for full service worker + test hooks initialization
wait_for_pwa_ready

# 3. Simulate user interactions to initialize audio engine and start playback
initialize_audio

# 4. Verify Random Note Generation (Scale Quantization Off)
echo "Testing random note generation with scale quantization disabled..."
assert_page "
    const randomizeBtn = document.getElementById('randomize-notes');
    const notesInput = document.getElementById('notes');
    const quantizeToggle = document.getElementById('scale-quantize-toggle');

    // Disable quantization
    quantizeToggle.checked = false;
    quantizeToggle.dispatchEvent(new Event('change'));

    // Trigger randomization click
    randomizeBtn.click();

    // Verify notes input value is not empty
    const notesVal = notesInput.value.trim();
    if (!notesVal) {
        throw new Error('Notes input is empty after clicking randomize');
    }

    // Verify number of generated notes is between 4 and 6
    const notesArray = notesVal.split(/\s+/);
    if (notesArray.length < 4 || notesArray.length > 6) {
        throw new Error('Expected 4 to 6 randomized notes, got: ' + notesArray.length);
    }

    // Verify each note is in valid Tone.js format within octaves 3-5 (including flats)
    const noteRegex = /^[A-G][#b]?[3-5]$/;
    for (const note of notesArray) {
        if (!noteRegex.test(note)) {
            throw new Error('Invalid note format generated: ' + note);
        }
    }
"

# 5. Verify Random Note Generation (Scale Quantization On: F Minor Scale)
echo "Testing scale-quantized random note generation (F Minor)..."
assert_page "
    const randomizeBtn = document.getElementById('randomize-notes');
    const notesInput = document.getElementById('notes');
    const quantizeToggle = document.getElementById('scale-quantize-toggle');
    const scaleRoot = document.getElementById('scale-root');
    const scaleType = document.getElementById('scale-type');

    // Enable quantization and set scale to F Minor
    quantizeToggle.checked = true;
    quantizeToggle.dispatchEvent(new Event('change'));
    scaleRoot.value = 'F';
    scaleRoot.dispatchEvent(new Event('change'));
    scaleType.value = 'minor';
    scaleType.dispatchEvent(new Event('change'));

    // Trigger randomization click
    randomizeBtn.click();

    // Verify notes input value is not empty
    const notesVal = notesInput.value.trim();
    const notesArray = notesVal.split(/\s+/);

    // F Minor pitch classes in both sharp and flat notations to ensure spelling robustness
    // F Minor notes: F, G, Ab/G#, Bb/A#, C, Db/C#, Eb/D#
    const fMinorPitches = ['F', 'G', 'Ab', 'G#', 'Bb', 'A#', 'C', 'Db', 'C#', 'Eb', 'D#'];

    // Verify each note generated falls strictly within F Minor scale pitch classes
    for (const note of notesArray) {
        const pc = note.slice(0, -1); // Strip octave number
        if (!fMinorPitches.includes(pc)) {
            throw new Error('Generated note ' + note + ' is not part of F minor scale (' + pc + ')');
        }
    }

    // Verify pattern values in active Tone.Pattern are updated
    if (!window.arpPattern || !window.arpPattern.values) {
        throw new Error('arpPattern is not initialized or has no values');
    }
    
    // Ensure arpeggiator is actively playing the new randomized notes
    for (const val of window.arpPattern.values) {
        const pc = val.slice(0, -1);
        if (!fMinorPitches.includes(pc)) {
            throw new Error('Pattern value ' + val + ' is not part of F minor scale');
        }
    }
"

echo "RANDOM NOTE GENERATION VERIFIED SUCCESSFULLY!"
