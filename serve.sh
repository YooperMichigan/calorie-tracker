#!/usr/bin/env bash
# Serves this folder over HTTP on your Mac's local network so you can test
# the PWA in Safari on your iPhone/iPad, plus locally at http://localhost:8080
#
# Note: barcode scanning uses the camera (getUserMedia), which iOS Safari only
# allows on secure origins — https://, or http://localhost. Testing the scanner
# from another device over http://<lan-ip> will NOT work; use your Mac's own
# browser at http://localhost:8080 to test scanning locally, or deploy to
# HTTPS hosting (e.g. GitHub Pages) to test scanning on your phone.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8080}"
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "your-mac-ip")
echo "Serving $(pwd)"
echo "  On this Mac:      http://localhost:$PORT   (camera/scanning works here)"
echo "  On iPhone/iPad:   http://$IP:$PORT   (same Wi-Fi network; scanning needs HTTPS, see note above)"
echo "Press Ctrl+C to stop."
python3 -m http.server "$PORT"
