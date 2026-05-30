#!/usr/bin/env bash
#
# scripts/generate-pwa-assets.sh
#
# Generates PNG icons and screenshots for the Web Arpeggiator PWA manifest.
# Assumes the local HTTP server is running on port 3000.
#

set -euo pipefail

# 1. Dependency checks
if ! command -v rsvg-convert >/dev/null 2>&1; then
    echo "Error: rsvg-convert is not installed. Please run 'brew install librsvg' first." >&2
    exit 1
fi

if ! command -v agent-browser >/dev/null 2>&1; then
    echo "Error: agent-browser is not installed or not in PATH." >&2
    exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON_DIR="${ROOT_DIR}/images/icons"
SCREENSHOT_DIR="${ROOT_DIR}/images/screenshots"

# Ensure output directories exist
mkdir -p "${ICON_DIR}"
mkdir -p "${SCREENSHOT_DIR}"

# Generate maskable SVG icon from standard SVG icon
echo "Generating maskable SVG from standard SVG..."
# node "${ROOT_DIR}/scripts/generate-maskable-svg.js"
bash "${ROOT_DIR}/scripts/generate-maskable-svg.sh"

# Generate PNG icons
echo "Generating PNG icons..."
rsvg-convert -w 192 -h 192 -f png -o "${ICON_DIR}/pwa-icon-192.png" "${ICON_DIR}/pwa-icon.svg"
rsvg-convert -w 512 -h 512 -f png -o "${ICON_DIR}/pwa-icon-512.png" "${ICON_DIR}/pwa-icon.svg"
rsvg-convert -w 192 -h 192 -f png -o "${ICON_DIR}/pwa-icon-maskable-192.png" "${ICON_DIR}/pwa-icon-maskable.svg"
rsvg-convert -w 512 -h 512 -f png -o "${ICON_DIR}/pwa-icon-maskable-512.png" "${ICON_DIR}/pwa-icon-maskable.svg"
echo "PNG icons generated successfully."

# Generate PWA screenshots
echo "Capturing PWA screenshots..."

# Check if server is reachable on port 3000
if ! curl -s -I "http://localhost:3000/index.html" >/dev/null; then
    echo "Error: Local server is not running on port 3000." >&2
    echo "Please start the server with 'npx serve .' or check the running process." >&2
    exit 1
fi

# Open URL
agent-browser open "http://localhost:3000/index.html"
agent-browser wait --load networkidle

# Dismiss start-audio overlay so the actual UI is visible
agent-browser click "#start-overlay"
agent-browser wait 1000 # Wait for overlay transition to complete

# 1. Desktop Screenshot (Wide)
echo "Capturing desktop screenshot..."
agent-browser set viewport 1280 800
agent-browser wait 500 # Wait for redraw
agent-browser screenshot "${SCREENSHOT_DIR}/desktop.png"

# 2. Mobile Screenshot (Narrow)
echo "Capturing mobile screenshot..."
agent-browser set viewport 375 667
agent-browser wait 500 # Wait for redraw
agent-browser screenshot "${SCREENSHOT_DIR}/mobile.png"

# Close the browser
agent-browser close

echo "Screenshots captured successfully."
