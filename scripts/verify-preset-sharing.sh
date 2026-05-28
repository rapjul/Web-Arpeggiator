#!/usr/bin/env bash
#
# scripts/verify-preset-sharing.sh
#
# Verifies the URL-encoded preset sharing functionality in a headless browser.
# Validates parameters serialization, URL sharing link copying, state deserialization,
# UI value restoration, Tone.js node parameter updates, and boundary clamping.
#

set -euo pipefail

# Source the shared test helpers
# shellcheck source=./_test-helpers.sh
source "$(dirname "${BASH_SOURCE[0]}")/_test-helpers.sh"

# 1. Start HTTP server in the background
start_test_server 4180 "python"

# 2. Open page and wait for PWA state to settle
wait_for_pwa_ready

# 3. Simulate user overlay click to initialize audio context
initialize_audio

# 4. Verify Preset Sharing Link Serialization
echo "Testing preset sharing serialization (clicking 'Copy Share Link')..."
assert_page "
    const shareBtn = document.getElementById('share-preset-button');
    if (!shareBtn) {
        throw new Error('Copy Share Link button is missing in Preset Management');
    }
    
    // Clear any previous test values
    if (window.__WEB_ARP_TEST__) {
        window.__WEB_ARP_TEST__.lastSharedUrl = null;
    }
    
    // Click button to serialize and generate link
    shareBtn.click();
    
    // Check if link was registered on the test hook
    const lastUrl = window.__WEB_ARP_TEST__?.lastSharedUrl;
    if (!lastUrl) {
        throw new Error('Failed to capture generated share URL on window.__WEB_ARP_TEST__');
    }
    
    // Validate that the URL contains essential query parameters
    const url = new URL(lastUrl);
    if (!url.searchParams.has('bpm') || !url.searchParams.has('notes') || !url.searchParams.has('synth')) {
        throw new Error('Generated share URL is missing expected query parameters: ' + lastUrl);
    }
"

# 5. Verify Deserialization and Restoration from URL
echo "Testing restoration of preset from custom URL query parameters..."

# Construct a custom share URL with unique parameter values
CUSTOM_URL="${APP_URL}?bpm=195&notes=D4%20F4%20A4&synth=fmSynth&wave=square&harm=2.5&mod=15.0&quant=true&root=D&scale=minor"

echo "Navigating to: $CUSTOM_URL"
run_browser open "$CUSTOM_URL"
run_browser wait --load networkidle
run_browser wait --fn "window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"

# Click overlay to trigger restoration of presets before playback begins
echo "Clicking overlay to initialize AudioContext and trigger URL preset loading..."
run_browser click "#start-overlay"
run_browser wait --fn "document.getElementById('play-stop')?.disabled === false"

# Verify UI elements and underlying Tone.js engine reflect the restored values
assert_page "
    const bpmSlider = document.getElementById('bpm');
    const notesInput = document.getElementById('notes');
    const synthTypeSelect = document.getElementById('synth-type');
    const scaleRootSelect = document.getElementById('scale-root');
    const scaleTypeSelect = document.getElementById('scale-type');
    
    // Check UI inputs
    if (bpmSlider.value !== '195') {
        throw new Error('BPM input failed to restore. Expected 195, got: ' + bpmSlider.value);
    }
    if (notesInput.value !== 'D4 F4 A4') {
        throw new Error('Notes input failed to restore. Expected \"D4 F4 A4\", got: \"' + notesInput.value + '\"');
    }
    if (synthTypeSelect.value !== 'fmSynth') {
        throw new Error('Synth type selector failed to restore. Expected fmSynth, got: ' + synthTypeSelect.value);
    }
    if (scaleRootSelect.value !== 'D') {
        throw new Error('Scale Root select failed to restore. Expected D, got: ' + scaleRootSelect.value);
    }
    if (scaleTypeSelect.value !== 'minor') {
        throw new Error('Scale Type select failed to restore. Expected minor, got: ' + scaleTypeSelect.value);
    }
    
    // Check underlying Tone.js engine settings
    if (Math.round(Tone.Transport.bpm.value) !== 195) {
        throw new Error('Tone.Transport BPM was not updated. Expected 195, got: ' + Tone.Transport.bpm.value);
    }
"

# 6. Verify Out-of-Bounds Parameter Clamping
echo "Testing parameter boundary clamping (preventing out-of-bounds corruption)..."

# Construct a malicious/out-of-bounds query parameters URL
CLAMP_URL="${APP_URL}?bpm=999&gain=100&harm=99.9&range=10"

echo "Navigating to: $CLAMP_URL"
run_browser open "$CLAMP_URL"
run_browser wait --load networkidle
run_browser wait --fn "window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"

# Click overlay to trigger preset loading
run_browser click "#start-overlay"
run_browser wait --fn "document.getElementById('play-stop')?.disabled === false"

# Verify that all parameter values were successfully clamped to their boundaries
assert_page "
    const bpmSlider = document.getElementById('bpm');
    const postGainSlider = document.getElementById('post-gain');
    const harmonicitySlider = document.getElementById('harmonicity');
    
    // BPM: Max 240
    if (bpmSlider.value !== '240') {
        throw new Error('BPM failed to clamp to 240. Got: ' + bpmSlider.value);
    }
    
    // Post Gain: Max 0
    if (postGainSlider.value !== '0') {
        throw new Error('Post Gain failed to clamp to 0. Got: ' + postGainSlider.value);
    }
    
    // Harmonicity: Max 10.0
    if (harmonicitySlider.value !== '10') {
        throw new Error('Harmonicity failed to clamp to 10.0. Got: ' + harmonicitySlider.value);
    }
"

echo "PRESET SHARING AND URL PARAMETER INTEGRATION VERIFIED SUCCESSFULLY!"
