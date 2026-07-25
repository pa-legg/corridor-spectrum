# Corridor Spectrum

An interactive 3D wireless traffic monitor designed as a corridor display artefact for a university cyber security department. Devices detected via WiFi and Bluetooth appear as glowing nodes in a three-dimensional corridor environment, with particle streams showing data transmission and a detail panel revealing visit frequency and transmission volume.

![Corridor Spectrum](https://img.shields.io/badge/Three.js-3D%20Visualisation-00d4ff)

## Features

- **3D corridor environment** — Built with Three.js, featuring bloom post-processing, orbital camera controls, and an ambient cyber-aesthetic
- **Real-time device tracking** — WebSocket stream updates the visualisation every 2 seconds
- **WiFi & Bluetooth detection** — Uses system tools (`nmcli`, `bluetoothctl`) when available; falls back to realistic simulation for demos and installations without dedicated hardware
- **Transmission visualisation** — Particle streams flow from each device to a central sensor; pulse intensity reflects live TX rate
- **Visit tracking** — Records how often each device enters the environment (5-minute gap = new visit)
- **Interactive inspection** — Click any device to reveal signal strength, packet count, data volume, TX rate, and visit history

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in a full-screen browser on your corridor display.

For production:

```bash
npm run build
npm start
```

Serves the built client and API on **http://localhost:3000**.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server port |
| `SCAN_MODE` | `auto` | `auto`, `simulation`, or `hardware` |
| `SCAN_INTERVAL` | `2000` | Scan interval in milliseconds |

### Scan Modes

- **`auto`** — Attempts hardware scanning; uses simulation if no devices are found
- **`simulation`** — Always uses simulated devices (ideal for demos and development)
- **`hardware`** — Forces hardware scanning only (requires Linux with `nmcli` and/or `bluetoothctl`)

## Hardware Setup (Production Installation)

For a live corridor installation on Linux:

1. Install NetworkManager and BlueZ:
   ```bash
   sudo apt install network-manager bluez
   ```

2. Ensure the display machine has WiFi and Bluetooth adapters enabled.

3. Run in hardware mode:
   ```bash
   SCAN_MODE=hardware npm start
   ```

4. For passive WiFi monitoring (probe requests, more devices), a dedicated monitor-mode adapter with tools like `airodump-ng` can be integrated — the current implementation uses active scans via `nmcli` which is suitable for most display scenarios.

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│  Three.js       │◄──────────────────►│  Node.js Server  │
│  3D Client      │                    │  Express + ws    │
└─────────────────┘                    └────────┬─────────┘
                                                │
                                       ┌────────▼─────────┐
                                       │  Scanner Module  │
                                       │  nmcli / btctl   │
                                       │  or Simulation   │
                                       └──────────────────┘
```

## Display Tips

- Run the browser in kiosk/full-screen mode (`F11` or `chromium --kiosk`)
- Use a large monitor or projector in a corridor-facing orientation
- The visualisation is designed for dark environments — dim ambient lighting enhances the bloom effect
- Click devices on touchscreens to inspect transmission profiles

## University Cyber Security Department

This installation is intended to raise awareness of the invisible radio spectrum surrounding us — every phone, laptop, wearable, and IoT device continuously broadcasts its presence. Corridor Spectrum makes that hidden layer visible.
