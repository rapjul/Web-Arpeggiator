#!/usr/bin/env bash
#
# scripts/verify-keyboard-and-quantizer.sh
#
# Verifies the virtual piano keyboard controls and scale quantization logic.
# Simulates keypress events on the keyboard and verifies active styles are
# applied and released. Enables scale quantizer and inputs out-of-scale notes
# to verify they snap to the selected scale.
#

set -euo pipefail

# Source the shared test helpers
# shellcheck source=./_test-helpers.sh
source "$(dirname "${BASH_SOURCE[0]}")/_test-helpers.sh"

# 1. Start HTTP server in the background (using port 4176 by default)
# If port 4176 is occupied, it will automatically search upward.
start_test_server 4176 "python"

# 2. Open page and wait for full service worker + test hooks initialization
wait_for_pwa_ready

# 3. Simulate user interactions to initialize audio engine and start playback
initialize_audio

# 4. Verify Virtual Keyboard UI Interactions
echo "Testing virtual keyboard controls..."
assert_page "
    const keyboardToggle = document.getElementById('keyboard-toggle');
    
    // Enable the keyboard
    keyboardToggle.checked = true;
    keyboardToggle.dispatchEvent(new Event('change'));

    // Trigger keydown on window for key 'z' (maps to C4)
    const eventDown = new KeyboardEvent('keydown', { key: 'z' });
    window.dispatchEvent(eventDown);

    // Verify key highlight active state
    const keyEl = document.querySelector('.piano-key[data-note=\"C4\"]');
    if (!keyEl) {
        throw new Error('C4 piano key element not found');
    }
    if (!keyEl.classList.contains('active')) {
        throw new Error('Expected key C4 to have active class');
    }

    // Trigger keyup on window for key 'z'
    const eventUp = new KeyboardEvent('keyup', { key: 'z' });
    window.dispatchEvent(eventUp);

    // Verify highlight is cleared
    if (keyEl.classList.contains('active')) {
        throw new Error('Expected active class to be removed from key C4 after keyup');
    }
"

# 5. Verify Scale Quantizer logic and snapping behavior
echo "Testing scale quantization..."
assert_page "
    const quantizeToggle = document.getElementById('scale-quantize-toggle');
    const scaleRoot = document.getElementById('scale-root');
    const scaleType = document.getElementById('scale-type');
    const notesInput = document.getElementById('notes');

    // 1. Enable scale quantization, set to C Major
    quantizeToggle.checked = true;
    quantizeToggle.dispatchEvent(new Event('change'));
    scaleRoot.value = 'C';
    scaleRoot.dispatchEvent(new Event('change'));
    scaleType.value = 'major';
    scaleType.dispatchEvent(new Event('change'));

    // 2. Set base notes containing G#4 (which is out of C Major scale)
    notesInput.value = 'C4 D4 E4 F4 G#4';
    notesInput.dispatchEvent(new Event('change'));

    // 3. Verify snapping by checking the Tone.Pattern values array
    if (!window.arpPattern || !window.arpPattern.values) {
        throw new Error('arpPattern is not initialized or has no values');
    }
    
    // G#4 should not be in the values, it should have snapped to G4 or A4
    if (window.arpPattern.values.includes('G#4')) {
        throw new Error('Scale quantizer failed: G#4 was not snapped to C Major');
    }
    
    // Check that notes snapped to valid C Major pitches
    const validPitches = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5'];
    for (const val of window.arpPattern.values) {
        if (!validPitches.includes(val)) {
            throw new Error('Quantized note ' + val + ' is not in C Major scale');
        }
    }
"

echo "KEYBOARD CONTROLS AND SCALE QUANTIZER VERIFIED SUCCESSFULLY!"
