#!/usr/bin/env bash
#
# scripts/verify-keyboard-accessibility.sh
#
# Verifies the arrow key keyboard navigation logic on option button groups
# (Pattern, Waveform, Octave Shift, Octave Range) inside a headless browser.
# Ensures that pressing arrow keys shifts focus, wraps focus correctly,
# and supports accessibility standards.
#

set -euo pipefail

# Source the shared test helpers
# shellcheck source=./_test-helpers.sh
source "$(dirname "${BASH_SOURCE[0]}")/_test-helpers.sh"

# 1. Start HTTP server in the background
start_test_server 4181 "python"

# 2. Open page and wait for PWA state to settle
wait_for_pwa_ready

# 3. Simulate overlay click to close start overlay and focus elements
run_browser click "#start-overlay"
run_browser wait --fn "document.getElementById('play-stop')?.disabled === false"

# 4. Verify Arrow Navigation in Pattern Buttons Group
echo "Testing keyboard arrow navigation in Pattern Buttons group..."
assert_page "
    const patternGroup = document.getElementById('pattern-buttons');
    const buttons = Array.from(patternGroup.querySelectorAll('button.pattern-btn'));
    
    if (buttons.length < 2) {
        throw new Error('Expected at least 2 pattern buttons, found: ' + buttons.length);
    }
    
    // Focus the first button
    buttons[0].focus();
    if (document.activeElement !== buttons[0]) {
        throw new Error('Failed to focus the first pattern button');
    }
    
    // Simulate ArrowRight keydown
    patternGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    if (document.activeElement !== buttons[1]) {
        throw new Error('Focus did not shift to the second button on ArrowRight. Active: ' + document.activeElement.outerHTML);
    }
    
    // Simulate ArrowDown keydown
    patternGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    if (document.activeElement !== buttons[2]) {
        throw new Error('Focus did not shift to the third button on ArrowDown. Active: ' + document.activeElement.outerHTML);
    }
    
    // Simulate ArrowLeft keydown
    patternGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    if (document.activeElement !== buttons[1]) {
        throw new Error('Focus did not return to the second button on ArrowLeft');
    }
    
    // Simulate wrap-around by going Left from the first button
    buttons[0].focus();
    patternGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    if (document.activeElement !== buttons[buttons.length - 1]) {
        throw new Error('Focus did not wrap around to the last button on ArrowLeft from the first button');
    }
    
    // Go Right from the last button to test wrap-around in opposite direction
    buttons[buttons.length - 1].focus();
    patternGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    if (document.activeElement !== buttons[0]) {
        throw new Error('Focus did not wrap around to the first button on ArrowRight from the last button');
    }
"

# 5. Verify Arrow Navigation in Waveform Buttons Group
echo "Testing keyboard arrow navigation in Waveform Buttons group..."
assert_page "
    const waveGroup = document.getElementById('waveform-buttons');
    const buttons = Array.from(waveGroup.querySelectorAll('button.waveform-btn'));
    
    if (buttons.length < 2) {
        throw new Error('Expected at least 2 waveform buttons');
    }
    
    buttons[0].focus();
    waveGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    if (document.activeElement !== buttons[1]) {
        throw new Error('Focus failed to shift in Waveform group');
    }
"

# 6. Verify Arrow Navigation in Octave Shift Group
echo "Testing keyboard arrow navigation in Octave Shift group..."
assert_page "
    const shiftGroup = document.getElementById('octave-shift-buttons');
    const buttons = Array.from(shiftGroup.querySelectorAll('button.octave-btn'));
    
    if (buttons.length < 2) {
        throw new Error('Expected at least 2 octave shift buttons');
    }
    
    buttons[0].focus();
    shiftGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    if (document.activeElement !== buttons[1]) {
        throw new Error('Focus failed to shift in Octave Shift group');
    }
"

# 7. Verify Arrow Navigation in Octave Range Group
echo "Testing keyboard arrow navigation in Octave Range group..."
assert_page "
    const rangeGroup = document.getElementById('octave-range-buttons');
    const buttons = Array.from(rangeGroup.querySelectorAll('button.octave-btn'));
    
    if (buttons.length < 2) {
        throw new Error('Expected at least 2 octave range buttons');
    }
    
    buttons[0].focus();
    rangeGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    if (document.activeElement !== buttons[1]) {
        throw new Error('Focus failed to shift in Octave Range group');
    }
"

echo "KEYBOARD ARROW ACCESSIBILITY NAVIGATOR VERIFIED SUCCESSFULLY!"
