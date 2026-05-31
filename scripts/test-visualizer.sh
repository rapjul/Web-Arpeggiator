#!/usr/bin/env bash
#
# scripts/test-visualizer.sh
#
# Automates visualizer functionality testing using agent-browser.
# Automates testing of visualizer zoom layouts and oscilloscope time periods.
# Uses agent-browser to navigate, interact, scroll, and capture snapshot files.
# Sourced helpers from _test-helpers.sh handle server startup,
# PWA lifecycles, and audio bypass setups.

set -euo pipefail

# Locate the directory containing this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared testing common helper functions
# shellcheck source=./_test-helpers.sh
source "${SCRIPT_DIR}/_test-helpers.sh"

# Define output snapshot directory
SNAPSHOTS_DIR="${ROOT_DIR}/tests/visualizer-snapshots"

# Ensure output snapshots directory exists
mkdir -p "${SNAPSHOTS_DIR}"
echo "Visual snapshots will be stored in: ${SNAPSHOTS_DIR}"

#
# scroll_visualizer_into_view
#
# Scrolls the visualizer container into the browser viewport center.
#
# Parameters:
#   None
#
# Return:
#   None
#
scroll_visualizer_into_view() {
    echo "Ensuring visualizer details accordion is open..."
    run_browser eval "{
        const container = document.getElementById('visualizer-container');
        if (container) {
            const det = container.closest('details');
            if (det) det.open = true;
        }
    }"
    run_browser wait 500
    echo "Scrolling visualizer into view..."
    run_browser scrollintoview "#visualizer-container"
    run_browser wait 500
}

#
# capture_mode_screenshots
#
# Switches to the specified visualizer mode, sets zoom levels,
# scrolls, and captures snapshots at 1.0x and 4.0x zoom.
#
# Parameters:
#   $1 - The visualizer mode value (oscilloscope, fft, loopMap)
#
# Return:
#   None
#
capture_mode_screenshots() {
    local mode="$1"
    echo "----------------------------------------------------------"
    echo " Testing mode: ${mode}"
    echo "----------------------------------------------------------"

    # Switch visualizer mode
    run_browser select "#visualizer-mode" "${mode}"
    run_browser wait 1000

    # Ensure centered
    scroll_visualizer_into_view

    # 1. Capture at 1.0x Zoom
    echo "Setting Zoom to 1.0x..."
    run_browser eval "{
        const zoomInput = document.getElementById('visualizer-zoom');
        if (zoomInput) {
            zoomInput.value = 1.0;
            zoomInput.dispatchEvent(new Event('input'));
            zoomInput.dispatchEvent(new Event('change'));
        }
    }"
    run_browser wait 800
    run_browser screenshot "${SNAPSHOTS_DIR}/${mode}_1x.png"
    echo "Captured screenshot: ${mode}_1x.png"

    # 2. Capture at 4.0x Zoom
    echo "Setting Zoom to 4.0x..."
    run_browser eval "{
        const zoomInput = document.getElementById('visualizer-zoom');
        if (zoomInput) {
            zoomInput.value = 4.0;
            zoomInput.dispatchEvent(new Event('input'));
            zoomInput.dispatchEvent(new Event('change'));
        }
    }"
    run_browser wait 800
    run_browser screenshot "${SNAPSHOTS_DIR}/${mode}_4x.png"
    echo "Captured screenshot: ${mode}_4x.png"

    # Reset Zoom back to 1.0x for next test
    run_browser eval "{
        const zoomInput = document.getElementById('visualizer-zoom');
        if (zoomInput) {
            zoomInput.value = 1.0;
            zoomInput.dispatchEvent(new Event('input'));
            zoomInput.dispatchEvent(new Event('change'));
        }
    }"
    run_browser wait 500
}

# Start local server on port 8080 (python backup)
start_test_server 8080 python

# Wait for PWA service workers and index page load
wait_for_pwa_ready

# Simulate start gestures, start Tone.js audio sequencer
initialize_audio

# Ensure containing details accordion is open so controls are interactive
run_browser eval "{
    const toggleBtn = document.getElementById('toggle-visualizer');
    if (toggleBtn) {
        const det = toggleBtn.closest('details');
        if (det) det.open = true;
    }
}"
run_browser wait 500

# Enable the visualizer
echo "Enabling visualizer..."
run_browser eval "document.getElementById('toggle-visualizer').click()"
run_browser wait 1000

# Capture screenshots for all modes using the reusable helper function
capture_mode_screenshots "oscilloscope"
capture_mode_screenshots "fft"
capture_mode_screenshots "loopMap"

# Extra test: Cycle Time Windows in Oscilloscope Mode
echo "----------------------------------------------------------"
echo " Testing Oscilloscope Time Window Settings"
echo "----------------------------------------------------------"
run_browser select "#visualizer-mode" "oscilloscope"
run_browser wait 500
scroll_visualizer_into_view

# Switch to 250ms timeframe and capture
echo "Setting Oscilloscope Time Window to 250ms..."
run_browser select "#oscilloscope-window" "250"
run_browser wait 800
run_browser screenshot "${SNAPSHOTS_DIR}/oscilloscope_250ms.png"
echo "Captured screenshot: oscilloscope_250ms.png"

# Switch to 1.0s timeframe and capture
echo "Setting Oscilloscope Time Window to 1.0s (1000ms)..."
run_browser select "#oscilloscope-window" "1000"
run_browser wait 800
run_browser screenshot "${SNAPSHOTS_DIR}/oscilloscope_1000ms.png"
echo "Captured screenshot: oscilloscope_1000ms.png"

echo "----------------------------------------------------------"
echo " Visualizer testing successful!"
echo " Screenshots saved to: ${SNAPSHOTS_DIR}"
echo "----------------------------------------------------------"
