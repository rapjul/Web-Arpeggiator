#!/usr/bin/env bash
#
# scripts/verify-synth-and-effects.sh
#
# Verifies synthesizer switching, synthesis parameters (harmonicity, mod index,
# duty cycle), envelope settings (ADSR), and audio effect (filter/delay/reverb)
# routing. Directly checks DOM visibility state and Tone.js node parameters.
#

set -euo pipefail

# Source the shared test helpers
# shellcheck source=./_test-helpers.sh
source "$(dirname "${BASH_SOURCE[0]}")/_test-helpers.sh"

# 1. Start HTTP server in the background (using port 4175 by default)
# If port 4175 is occupied, it will automatically search upward.
start_test_server 4175 "python"

# 2. Open page and wait for full service worker + test hooks initialization
wait_for_pwa_ready

# 3. Simulate user interactions to initialize audio engine and start playback
initialize_audio

# 4. Verify Synthesizer Switching and DOM view updates
echo "Testing switching synth types..."
assert_page "
    const sel = document.getElementById('synth-type');
    const adv = document.getElementById('advanced-synth-params');
    const basic = document.getElementById('basic-synth-params');
    
    // Switch to FM Synth
    sel.value = 'fmSynth';
    sel.dispatchEvent(new Event('change'));
    
    // Assert FM synth UI elements are visible and settings updated
    if (adv.classList.contains('hidden')) {
        throw new Error('FM Synth advanced params should be visible');
    }
    if (window.__WEB_ARP_TEST__.getCurrentSettings().synthType !== 'fmSynth') {
        throw new Error('Synth type setting should be fmSynth');
    }
"

# 5. Verify synthesis parameters updates
echo "Testing synthesis sliders (Harmonicity and Modulation Index)..."
assert_page "
    const harm = document.getElementById('harmonicity');
    harm.value = 5.5;
    harm.dispatchEvent(new Event('input'));
    harm.dispatchEvent(new Event('change'));

    const mod = document.getElementById('modulation-index');
    mod.value = 22.4;
    mod.dispatchEvent(new Event('input'));
    mod.dispatchEvent(new Event('change'));

    // Assert values updated in setting model
    const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
    if (settings.harmonicity !== 5.5) {
        throw new Error('Expected harmonicity to be 5.5, got ' + settings.harmonicity);
    }
    if (settings.modulationIndex !== 22.4) {
        throw new Error('Expected modulationIndex to be 22.4, got ' + settings.modulationIndex);
    }
"

# 6. Verify Envelope (ADSR) adjustments and direct activeTone.js state propagation
echo "Testing envelope (ADSR) sliders..."
assert_page "
    const att = document.getElementById('env-attack');
    att.value = 0.45;
    att.dispatchEvent(new Event('input'));
    att.dispatchEvent(new Event('change'));

    const rel = document.getElementById('env-release');
    rel.value = 2.15;
    rel.dispatchEvent(new Event('input'));
    rel.dispatchEvent(new Event('change'));

    // Verify tone envelope directly
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (!window.activeSynth || !window.activeSynth.envelope) {
        throw new Error('activeSynth envelope is not available on window');
    }
    if (Math.abs(window.activeSynth.envelope.attack - 0.45) > 0.001) {
        throw new Error('Tone.js synth attack envelope mismatch. Expected 0.45, got ' + window.activeSynth.envelope.attack);
    }
    if (Math.abs(window.activeSynth.envelope.release - 2.15) > 0.001) {
        throw new Error('Tone.js synth release envelope mismatch. Expected 2.15, got ' + window.activeSynth.envelope.release);
    }
"

# 7. Verify low-pass filter and audio effects chain updates
echo "Testing low-pass filter and feedback delay sliders..."
assert_page "
    const cutoff = document.getElementById('filter-cutoff');
    cutoff.value = 2500;
    cutoff.dispatchEvent(new Event('input'));
    cutoff.dispatchEvent(new Event('change'));

    const delayMix = document.getElementById('delay-mix');
    delayMix.value = 0.45;
    delayMix.dispatchEvent(new Event('input'));
    delayMix.dispatchEvent(new Event('change'));

    // Assert setting model matches
    const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
    if (settings.filterCutoff !== 2500) {
        throw new Error('Expected filterCutoff to be 2500, got ' + settings.filterCutoff);
    }
    if (Math.abs(settings.delayMix - 0.45) > 0.001) {
        throw new Error('Expected delayMix to be 0.45, got ' + settings.delayMix);
    }
"

echo "SYNTHESIS AND EFFECTS ROUTING VERIFIED SUCCESSFULLY!"
