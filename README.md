# Corridor Spectrum

An interactive 3D wireless traffic monitor designed as a corridor display artefact for a university cyber security department. Devices detected via WiFi and Bluetooth appear as glowing nodes in a three-dimensional corridor environment, with particle streams showing data transmission and a detail panel revealing how often each device has entered the monitoring environment.

![Corridor Spectrum](https://img.shields.io/badge/Three.js-3D%20Visualisation-00d4ff)

## Features

- **3D corridor environment** — Three.js with bloom post-processing and orbital camera controls
- **Raspberry Pi hardware scanning** — WiFi via `iw` / probe requests, Bluetooth via `bluetoothctl` / `btmgmt` / `hcitool`
- **Environment entry tracking** — Records how many times each device has entered the monitoring zone, persisted to disk across reboots
- **Transmission visualisation** — Particle streams from devices to a central sensor; intensity reflects observed packet/probe activity
- **Interactive inspection** — Click or tap a device for signal strength, entry count, packets, and entry history

## Quick Start (development)

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Use `SCAN_MODE=simulation` for demo data without hardware.

## Raspberry Pi Installation

On a Raspberry Pi running Raspberry Pi OS:

```bash
git clone <repo-url> corridor-spectrum
cd corridor-spectrum
bash scripts/install-pi.sh
sudo systemctl start corridor-spectrum
chromium-browser --kiosk http://localhost:3000
```

The install script sets up BlueZ, `iw`, `tcpdump`, builds the app, and installs a systemd service running in **hardware mode** by default.

### What the Pi scans

| Source | Tool | Detects |
|--------|------|---------|
| WiFi clients | `tcpdump` on monitor interface (`MONITOR_IFACE`) | Phones/laptops broadcasting probe requests |
| WiFi networks | `iw dev wlan0 scan` | Nearby access points |
| Bluetooth | `btmgmt` / `bluetoothctl` / `hcitool` | Phones, headphones, wearables, BLE beacons |

### Probe-request monitoring (recommended)

Built-in Pi WiFi is usually connected to your network, so for detecting **passing devices** add a USB WiFi adapter in monitor mode:

```bash
# Replace wlan1 with your USB adapter
sudo iw dev wlan1 interface add mon0 type monitor
sudo ip link set mon0 up

# Add to systemd service:
# Environment=MONITOR_IFACE=mon0
sudo systemctl restart corridor-spectrum
```

### Entry counting

A device is counted as **entering the environment** when:
1. It is first discovered, or
2. It returns after being absent for longer than `VISIT_GAP_MS` (default: 2 minutes)

Devices are marked absent only after `ABSENCE_THRESHOLD` consecutive missed scans (default: 4), preventing flicker between scan cycles.

Entry counts are saved to `data/registry.json` and survive reboots.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCAN_MODE` | `auto` | `hardware`, `simulation`, or `auto` (Pi defaults to hardware) |
| `SCAN_INTERVAL` | `2000` | Milliseconds between scan cycles |
| `WIFI_IFACE` | `wlan0` | WiFi interface for `iw` scans |
| `HCI_IFACE` | `hci0` | Bluetooth adapter |
| `MONITOR_IFACE` | _(empty)_ | Monitor interface for probe-request capture (e.g. `mon0`) |
| `VISIT_GAP_MS` | `120000` | Absence duration before a return counts as a new entry |
| `ABSENCE_THRESHOLD` | `4` | Missed scans before a device is marked absent |
| `DATA_FILE` | `./data/registry.json` | Persistent entry/packet storage |

## Production

```bash
npm run build
SCAN_MODE=hardware npm start
```

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────────────┐
│  Three.js       │◄──────────────────►│  Node.js (Raspberry Pi)  │
│  3D Client      │                    │  Express + ws            │
└─────────────────┘                    └────────────┬─────────────┘
                                                    │
                     ┌──────────────────────────────┼──────────────────────────────┐
                     │                              │                              │
              ┌──────▼──────┐              ┌────────▼────────┐           ┌────────▼────────┐
              │ iw / tcpdump │              │ bluetoothctl    │           │ registry.json   │
              │ WiFi scan    │              │ btmgmt / hcitool│           │ entry persistence│
              └─────────────┘              └─────────────────┘           └─────────────────┘
```

## University Cyber Security Department

This installation makes the invisible radio environment visible — every phone, laptop, wearable, and IoT device continuously announces its presence. Corridor Spectrum reveals that hidden layer and records how often devices pass through your monitoring space.
