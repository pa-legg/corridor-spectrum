#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/opt/cursor/artifacts/corridor-spectrum-demo.mp4}"
DURATION="${2:-25}"
WIDTH=1280
HEIGHT=720

mkdir -p "$(dirname "$OUT")"

# Start server with simulated data
pkill -f "node ${ROOT}/server/index.js" 2>/dev/null || true
sleep 1

SCAN_MODE=simulation node "${ROOT}/server/index.js" &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/status >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "Server ready — recording ${DURATION}s to ${OUT}"

xvfb-run -a --server-args="-screen 0 ${WIDTH}x${HEIGHT}x24" bash -c "
  set -euo pipefail
  google-chrome \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-infobars \
    --no-first-run \
    --no-default-browser-check \
    --window-size=${WIDTH},${HEIGHT} \
    --window-position=0,0 \
    --app=http://localhost:3000 \
    --enable-webgl \
    --ignore-gpu-blocklist \
    --use-gl=swiftshader \
    --enable-unsafe-swiftshader \
    about:blank &
  CHROME_PID=\$!

  sleep 2
  xdotool search --onlyvisible --class chrome windowmove 0 0 2>/dev/null || true
  xdotool search --onlyvisible --class chrome windowsize 0 0 ${WIDTH} ${HEIGHT} 2>/dev/null || true

  sleep 4

  ffmpeg -y \
    -f x11grab \
    -draw_mouse 0 \
    -framerate 24 \
    -video_size ${WIDTH}x${HEIGHT} \
    -i \"\${DISPLAY}\" \
    -t ${DURATION} \
    -c:v libx264 \
    -preset fast \
    -crf 20 \
    -pix_fmt yuv420p \
    \"${OUT}\"

  kill \"\$CHROME_PID\" 2>/dev/null || true
"

if [ -f "$OUT" ]; then
  echo "Saved demo video: $OUT ($(du -h "$OUT" | cut -f1))"
else
  echo "Recording failed" >&2
  exit 1
fi
