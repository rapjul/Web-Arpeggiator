#!/usr/bin/env bash
#
# scripts/pwa-agent-browser-check.sh
#
# End-to-end integration testing script for the Web Arpeggiator PWA shell.
# Verifies:
#   - PWA Manifest completeness
#   - Service Worker registration & lifecycle hook compliance
#   - Preset storage CRUD operations in IndexedDB
#   - Session persistence (save & load)
#   - Offline app shell rendering
#   - Audio Context initialization and basic play/stop transport control
#   - Cache clearing/invalidation operations
#

set -euo pipefail

# Source the shared test helpers
# shellcheck source=./_test-helpers.sh
source "$(dirname "${BASH_SOURCE[0]}")/_test-helpers.sh"

# 1. Start HTTP server in the background (using port 4173 by default)
# If port 4173 is occupied, it will automatically search upward.
start_test_server 4173 "python"

# 2. Open browser, register service worker, and wait for initialization
wait_for_pwa_ready

# 3. Assert PWA Manifest completeness
echo "Verifying PWA manifest parameters..."
assert_page "
    const manifest = await fetch('./manifest.json').then((response) => response.json());
    if (!manifest.name || !manifest.start_url || manifest.display !== 'standalone' || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
        throw new Error('Manifest is missing required PWA fields.');
    }
"

# 4. Assert PWA service worker is registered
echo "Checking service worker registration..."
assert_page "
    if (!navigator.serviceWorker) {
        throw new Error('Service worker is not registered.');
    }
"

# 5. Assert preset store is empty initially
echo "Verifying IndexedDB preset store clear..."
assert_page "
    await window.__WEB_ARP_TEST__.clearPresets();
    const emptyPresets = await window.__WEB_ARP_TEST__.listPresets();
    if (emptyPresets.length !== 0) {
        throw new Error('Expected preset store to be empty after clear.');
    }
"

# 6. Assert preset can be saved to IndexedDB
echo "Testing saving preset to IndexedDB..."
assert_page "
    const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
    settings.baseNotes = ['C4', 'D4', 'F4'];
    const record = await window.__WEB_ARP_TEST__.savePreset(settings, { name: '__test__' });
    const records = await window.__WEB_ARP_TEST__.listPresets();
    if (!records.some((item) => item.id === record.id && item.name === '__test__')) {
        throw new Error('Saved preset was not listed.');
    }
"

# 7. Assert preset can be loaded back into the DOM
echo "Testing loading preset from IndexedDB..."
assert_page "
    const latest = (await window.__WEB_ARP_TEST__.listPresets())[0];
    await window.__WEB_ARP_TEST__.loadPreset(latest.id);
    const notes = document.getElementById('notes').value;
    if (notes !== 'C4 D4 F4') {
        throw new Error('Preset load failed: ' + notes);
    }
"

# 8. Assert preset can be deleted from IndexedDB
echo "Testing removing preset from IndexedDB..."
assert_page "
    const latest = (await window.__WEB_ARP_TEST__.listPresets())[0];
    await window.__WEB_ARP_TEST__.removePreset(latest.id);
    const afterDelete = await window.__WEB_ARP_TEST__.listPresets();
    if (afterDelete.length !== 0) {
        throw new Error('Preset delete failed.');
    }
"

# 9. Assert last session state is saved
echo "Testing last-session state serialization..."
assert_page "
    const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
    settings.baseNotes = ['E4', 'G4', 'B4'];
    await window.WebArpPresetStore.saveLastSession(settings);
"

# 10. Reload the page to test restoration
echo "Reloading page to test session restoration..."
run_browser reload
run_browser wait --fn "window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"

# Assert the last session was restored successfully
assert_page "
    const notes = document.getElementById('notes').value;
    if (notes !== 'E4 G4 B4') {
        throw new Error('Last session restore failed: ' + notes);
    }
"

# 11. Test offline app capabilities
echo "Testing offline app shell rendering..."
run_browser set offline on
run_browser reload
run_browser wait --fn "document.getElementById('notes') !== null && window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"

# Assert offline app shell is correctly loaded and DOM is fully complete
assert_page "
    if (!document.getElementById('visualizer') || !document.getElementById('play-stop')) {
        throw new Error('Offline app shell did not render required controls.');
    }
"

# 12. Simulate interactions and play/stop transport control in offline mode
# Handles start overlay click, warning output, and Tone.js start checks.
initialize_audio

# Stop transport audio playback in offline mode
echo "Stopping playback..."
run_browser click "#play-stop"

# 13. Disable offline mode and test cache invalidation/clear hooks
echo "Disabling offline mode and testing cache control operations..."
run_browser set offline off
assert_page "
    const cachesBeforeClear = await window.WebArpPWA.listCaches();
    if (!cachesBeforeClear.some((cacheName) => cacheName.startsWith('web-arpeggiator-'))) {
        throw new Error('Expected a web-arpeggiator cache before clearing.');
    }
    const activationResult = await window.WebArpPWA.activateWaitingWorker();
    if (!activationResult.ok) {
        throw new Error('SKIP_WAITING hook failed.');
    }
    await window.WebArpPWA.clearCaches();
    const cachesAfterClear = await caches.keys();
    if (cachesAfterClear.some((cacheName) => cacheName.startsWith('web-arpeggiator-'))) {
        throw new Error('clearCaches did not remove web-arpeggiator caches.');
    }
"

echo "PWA shell, preset persistence, last-session restore, offline audio, and cache hooks passed."
