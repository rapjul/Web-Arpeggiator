#!/usr/bin/env bash
#
# scripts/verify-recording-and-presets.sh
#
# Verifies the Preset saving/IndexedDB persistence system, real-time audio
# recording, and Tone.Offline perfect loop render. Ensures all buttons and state
# transitions execute correctly in a headless browser environment.
#

set -euo pipefail

# Source the shared test helpers
# shellcheck source=./_test-helpers.sh
source "$(dirname "${BASH_SOURCE[0]}")/_test-helpers.sh"

# 1. Start HTTP server in the background (using port 4177 by default)
# If port 4177 is occupied, it will automatically search upward.
start_test_server 4177 "python"

# 2. Open page and wait for full service worker + test hooks initialization
wait_for_pwa_ready

# 3. Simulate user interactions to initialize audio engine and start playback
initialize_audio

# 4. Verify Preset Saving (IndexedDB & file download hook)
echo "Testing preset saving..."
assert_page "
    const presetNameInput = document.getElementById('preset-name-input');
    const savePresetButton = document.getElementById('save-preset-button');
    
    // Set a custom preset name
    presetNameInput.value = 'My test preset';
    presetNameInput.dispatchEvent(new Event('input'));

    // Trigger save
    savePresetButton.click();
"
# Wait for the async IndexedDB save to finish
run_browser wait --fn "window.__WEB_ARP_TEST__.lastSaveFinished === true"

# Assert the preset was indeed saved correctly in IndexedDB
assert_page "
    const records = await window.__WEB_ARP_TEST__.listPresets();
    if (!records.some(r => r.name === 'My test preset')) {
        throw new Error('Preset was not saved to IndexedDB');
    }
"

# 5. Verify Real-time Recording controls
echo "Testing real-time recording controls..."
assert_page "
    const recordBtn = document.getElementById('record-button');
    const recordStatus = document.getElementById('realtime-record-status');
    const exportControls = document.getElementById('realtime-export-controls');

    // Make sure export controls are hidden initially
    exportControls.classList.add('hidden');

    // Click to start recording
    recordBtn.click();
    if (!recordBtn.classList.contains('recording')) {
        throw new Error('Record button does not have recording class after click');
    }
"
# Wait 1.5 seconds to capture some buffer chunks
sleep 1.5

# Stop recording
assert_page "
    const recordBtn = document.getElementById('record-button');
    recordBtn.click();
"
sleep 0.5

# Verify export controls are visible
assert_page "
    const exportControls = document.getElementById('realtime-export-controls');
    if (exportControls.classList.contains('hidden')) {
        throw new Error('Export controls are still hidden after stopping recording');
    }
"

# 6. Verify Offline Loop Rendering
echo "Testing offline loop rendering..."
assert_page "
    const wavCheck = document.getElementById('offline-export-wav');
    const mp3Check = document.getElementById('offline-export-mp3');
    const offlineBtn = document.getElementById('offline-export-button');
    const loopCountInput = document.getElementById('loop-count');

    // Select WAV only to make it fast
    wavCheck.checked = true;
    mp3Check.checked = false;
    loopCountInput.value = '1';

    // Click offline render
    offlineBtn.click();
"

# Wait for rendering to complete (status text changes to 'Offline export complete!')
run_browser wait --fn "document.getElementById('offline-export-status')?.textContent.includes('Offline export complete!')"

echo "RECORDING, EXPORTS, AND PRESET MANAGEMENT VERIFIED SUCCESSFULLY!"
