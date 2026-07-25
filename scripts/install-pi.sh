#!/usr/bin/env bash
set -euo pipefail

# Corridor Spectrum — Raspberry Pi installation script
# Run on Raspberry Pi OS (Bookworm) with: bash scripts/install-pi.sh

APP_DIR="${APP_DIR:-/opt/corridor-spectrum}"
SERVICE_USER="${SERVICE_USER:-pi}"

echo "==> Installing system packages"
sudo apt-get update
sudo apt-get install -y \
  nodejs npm \
  bluez \
  bluetooth \
  iw \
  wireless-tools \
  tcpdump \
  network-manager

echo "==> Creating application directory at ${APP_DIR}"
sudo mkdir -p "${APP_DIR}/data"
sudo chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"

if [ "$(pwd)" != "${APP_DIR}" ]; then
  echo "==> Copying application files"
  sudo rsync -a --exclude node_modules --exclude .git ./ "${APP_DIR}/"
  sudo chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
fi

cd "${APP_DIR}"

echo "==> Installing Node dependencies"
sudo -u "${SERVICE_USER}" npm install
sudo -u "${SERVICE_USER}" npm run build

echo "==> Configuring Bluetooth"
sudo systemctl enable bluetooth
sudo systemctl start bluetooth

echo "==> Installing systemd service"
sudo cp scripts/corridor-spectrum.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable corridor-spectrum

cat <<'EOF'

Installation complete.

Optional — enable WiFi probe-request monitoring (detects passing phones/laptops):
  1. Add a USB WiFi adapter that supports monitor mode
  2. sudo iw dev wlan1 interface add mon0 type monitor
  3. sudo ip link set mon0 up
  4. Edit /etc/systemd/system/corridor-spectrum.service
     Set MONITOR_IFACE=mon0
  5. sudo systemctl daemon-reload && sudo systemctl restart corridor-spectrum

Start the display:
  sudo systemctl start corridor-spectrum

Open in kiosk browser:
  chromium-browser --kiosk http://localhost:3000

Logs:
  journalctl -u corridor-spectrum -f

EOF
