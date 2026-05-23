#!/usr/bin/env bash
#
# scripts/_test-helpers.sh
#
# Common helper functions and infrastructure for running integration and
# verification tests on the Web Arpeggiator application using agent-browser.
#

set -euo pipefail

# Configuration Defaults
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_AB_TIMEOUT=10000
SERVER_PID=""
ACTUAL_PORT=""
APP_URL=""

#
# assert_dependencies
#
# Asserts that required test binaries exist on the system path.
# Specifically checks for 'agent-browser'.
#
# Parameters:
#   None
#
# Return:
#   None. Exits with code 1 if dependencies are missing.
#
assert_dependencies() {
    if ! command -v agent-browser >/dev/null 2>&1; then
        echo "Error: 'agent-browser' is not installed or not in PATH." >&2
        echo "Please install it before running this test script." >&2
        exit 1
    fi
    if ! command -v python3 >/dev/null 2>&1 && ! command -v npx >/dev/null 2>&1; then
        echo "Error: Neither 'python3' nor 'npx' is installed or in PATH." >&2
        echo "Please install at least one of them to run the local HTTP server." >&2
        exit 1
    fi
}

# Run dependency check immediately upon sourcing
assert_dependencies

#
# find_available_port
#
# Scans ports starting from a base number to find one that is unused.
# Checks if anything is listening on the port using lsof and nc.
#
# Parameters:
#   $1 - The starting port number.
#
# Return:
#   Outputs the first available port to stdout.
#
find_available_port() {
    local port="$1"
    # Keep incrementing the port if lsof or nc shows it's occupied
    while lsof -i :"$port" -sTCP:LISTEN -t >/dev/null 2>&1 || nc -z 127.0.0.1 "$port" >/dev/null 2>&1; do
        echo "Port $port is in use, trying next..." >&2
        port=$((port + 1))
    done
    echo "$port"
}

#
# cleanup
#
# Clean up background server processes and headless browser instances on exit.
# Should be registered as a trap handler: trap cleanup EXIT.
#
# Parameters:
#   None
#
# Return:
#   None
#
cleanup() {
    # Silence output during cleanup to keep test output clean
    run_browser close >/dev/null 2>&1 || true
    if [[ -n "${SERVER_PID:-}" ]]; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
    fi
}

# Register the cleanup handler on script exit/termination
trap cleanup EXIT

#
# start_test_server
#
# Starts a local HTTP web server in the background on an available port.
# Supports both 'python' (Python http.server) and 'npx' (npx serve).
# Automatically retries/increments the port if the initial selection is occupied.
# Sets global variables: ACTUAL_PORT, APP_URL, and SERVER_PID.
#
# Parameters:
#   $1 - The desired base port number.
#   $2 - The server type to start ("python" or "npx"). Defaults to "python".
#
# Return:
#   None.
#
start_test_server() {
    local base_port="$1"
    local server_type="${2:-python}"

    ACTUAL_PORT=$(find_available_port "$base_port")
    APP_URL="http://127.0.0.1:${ACTUAL_PORT}/index.html"

    echo "Starting test server (type: $server_type) on port $ACTUAL_PORT..."

    if [[ "$server_type" == "npx" ]]; then
        npx serve -l "$ACTUAL_PORT" "$ROOT_DIR" >/tmp/web-arpeggiator-test-npx.log 2>&1 &
        SERVER_PID=$!
    else
        python3 -m http.server "$ACTUAL_PORT" --bind 127.0.0.1 --directory "$ROOT_DIR" >/tmp/web-arpeggiator-test-py.log 2>&1 &
        SERVER_PID=$!
    fi

    # Allow server a moment to start listening
    sleep 2
}

#
# run_browser
#
# Wraps agent-browser CLI commands with a default timeout.
#
# Parameters:
#   $@ - Arguments to pass directly to agent-browser (e.g. open, click, eval)
#
# Return:
#   The exit code and output of agent-browser.
#
run_browser() {
    AGENT_BROWSER_DEFAULT_TIMEOUT="$DEFAULT_AB_TIMEOUT" agent-browser "$@"
}

#
# assert_page
#
# Evaluates JavaScript on the active browser page and asserts truthiness.
# Throws an error if the JavaScript evaluation yields false or rejects.
#
# Parameters:
#   $1 - JavaScript expression/script block to evaluate.
#
# Return:
#   None. Throws error and exits if JavaScript evaluates to false/rejects.
#
assert_page() {
    local js="$1"
    run_browser eval "Promise.resolve((async () => { ${js} })()).then((value) => value === undefined ? true : value)"
}

#
# wait_for_pwa_ready
#
# Navigates the browser to the test app URL, waits for service worker
# registration and lifecycle checks, reloads, and waits for session restore.
#
# Parameters:
#   None
#
# Return:
#   None.
#
wait_for_pwa_ready() {
    echo "Opening application page: $APP_URL"
    run_browser open "$APP_URL"
    run_browser wait --load networkidle

    echo "Waiting for service worker registration..."
    run_browser wait --fn "window.__WEB_ARP_PWA_STATE__?.serviceWorkerRegistered === true"
    run_browser wait --fn "navigator.serviceWorker?.controller !== null"

    echo "Activating service worker controller..."
    run_browser reload
    run_browser wait --fn "navigator.serviceWorker?.controller !== null && document.getElementById('notes') !== null && window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"
}

#
# initialize_audio
#
# Simulates the gesture interaction to start the Tone.js Audio Context
# and initiates play transport state. Prints warnings before starting audio.
#
# Parameters:
#   None
#
# Return:
#   None.
#
initialize_audio() {
    echo "Clicking overlay to bypass audio autoplay policy..."
    run_browser click "#start-overlay"
    run_browser wait --fn "document.getElementById('play-stop')?.disabled === false"

    echo "=========================================================="
    echo " WARNING: Audio is about to play during browser tests."
    echo " Please adjust your system volume to avoid loud output."
    echo "=========================================================="
    sleep 2

    echo "Starting sequencer playback..."
    run_browser click "#play-stop"
    run_browser wait --fn "typeof Tone !== 'undefined' && Tone.Transport.state === 'started'"
}
