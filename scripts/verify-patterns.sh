#!/usr/bin/env bash
#
# scripts/verify-patterns.sh
#
# Verifies all 12 arpeggiator patterns (both native Tone.js and custom arrays)
# inside a headless browser using agent-browser. Ensures each selection
# compiles and schedules audio correctly without halting transport playback.
#

set -euo pipefail

# Source the shared test helpers
# shellcheck source=./_test-helpers.sh
source "$(dirname "${BASH_SOURCE[0]}")/_test-helpers.sh"

# 1. Start HTTP server in the background (using port 4174 by default)
# If port 4174 is occupied, it will automatically search upward.
start_test_server 4174 "python"

# 2. Open page and wait for full service worker + test hooks initialization
wait_for_pwa_ready

# 3. Simulate user interactions to initialize audio engine and start playback
initialize_audio

# 4. Define all pattern modes to test
PATTERNS=(
    "up"
    "down"
    "upDown"
    "downUp"
    "upDownRepeat"
    "downUpRepeat"
    "random"
    "octaveCycle"
    "octaveCycleReverse"
    "octaveCyclePingPong"
    "randomWalk"
    "randomWalkDrunk"
)

# 5. Sequentially trigger each pattern and verify the Tone.Pattern remains active
for pattern in "${PATTERNS[@]}"; do
    echo "Testing pattern selection: $pattern"
    # Click the matching pattern direction button in the DOM
    run_browser click "button[data-pattern='$pattern']"
    sleep 0.5
    # Verify the pattern is successfully recreated and playing in Tone.js
    assert_page "
        if (!window.arpPattern) {
            throw new Error('arpPattern is null/undefined for pattern $pattern');
        }
        if (window.arpPattern.state !== 'started') {
            throw new Error('arpPattern is not started for pattern $pattern');
        }
    "
done

echo "ALL 12 PATTERNS VERIFIED SUCCESSFULLY!"
