#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4173}"
APP_URL="http://127.0.0.1:${PORT}/index.html"
AB_TIMEOUT="${AB_TIMEOUT:-10000}"
SERVER_PID=""

cleanup() {
    if [[ -n "$SERVER_PID" ]]; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
    fi
}

trap cleanup EXIT

run_browser() {
    AGENT_BROWSER_DEFAULT_TIMEOUT="$AB_TIMEOUT" agent-browser "$@"
}

assert_page() {
    local js="$1"
    run_browser eval "Promise.resolve((async () => { ${js} })()).then((value) => value === undefined ? true : value)"
}

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT_DIR" >/tmp/web-arpeggiator-pwa-http.log 2>&1 &
SERVER_PID=$!

run_browser open "$APP_URL"
run_browser wait --load networkidle
run_browser wait --fn "window.__WEB_ARP_PWA_STATE__?.serviceWorkerRegistered === true"
run_browser reload
run_browser wait --fn "navigator.serviceWorker?.controller !== null && document.getElementById('notes') !== null"

assert_page "
    const manifest = await fetch('./manifest.json').then((response) => response.json());
    if (!manifest.name || !manifest.start_url || manifest.display !== 'standalone' || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
        throw new Error('Manifest is missing required PWA fields.');
    }
"

assert_page "
    await window.__WEB_ARP_TEST__.clearPresets();
    const emptyPresets = await window.__WEB_ARP_TEST__.listPresets();
    if (emptyPresets.length !== 0) {
        throw new Error('Expected preset store to be empty after clear.');
    }
"

assert_page "
    const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
    settings.baseNotes = ['C4', 'D4', 'F4'];
    const record = await window.__WEB_ARP_TEST__.savePreset(settings, { name: '__test__' });
    const records = await window.__WEB_ARP_TEST__.listPresets();
    if (!records.some((item) => item.id === record.id && item.name === '__test__')) {
        throw new Error('Saved preset was not listed.');
    }
"

assert_page "
    const latest = (await window.__WEB_ARP_TEST__.listPresets())[0];
    await window.__WEB_ARP_TEST__.loadPreset(latest.id);
    const notes = document.getElementById('notes').value;
    if (notes !== 'C4 D4 F4') {
        throw new Error('Preset load failed: ' + notes);
    }
"

assert_page "
    const latest = (await window.__WEB_ARP_TEST__.listPresets())[0];
    await window.__WEB_ARP_TEST__.removePreset(latest.id);
    const afterDelete = await window.__WEB_ARP_TEST__.listPresets();
    if (afterDelete.length !== 0) {
        throw new Error('Preset delete failed.');
    }
"

assert_page "
    const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
    settings.baseNotes = ['E4', 'G4', 'B4'];
    await window.WebArpPresetStore.saveLastSession(settings);
"

run_browser reload
run_browser wait --fn "window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"
assert_page "
    const notes = document.getElementById('notes').value;
    if (notes !== 'E4 G4 B4') {
        throw new Error('Last session restore failed: ' + notes);
    }
"

run_browser set offline on
run_browser reload
run_browser wait --fn "document.getElementById('notes') !== null"
assert_page "
    if (!document.getElementById('visualizer') || !document.getElementById('play-stop')) {
        throw new Error('Offline app shell did not render required controls.');
    }
"

run_browser click "#start-overlay"
run_browser wait --fn "document.getElementById('play-stop')?.disabled === false"
run_browser click "#play-stop"
run_browser wait --fn "typeof Tone !== 'undefined' && Tone.Transport.state === 'started'"
run_browser click "#play-stop"

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
