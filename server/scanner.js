import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const VENDORS = [
  'Apple', 'Samsung', 'Google', 'Microsoft', 'Intel', 'Huawei',
  'Xiaomi', 'Dell', 'Lenovo', 'Sony', 'Bose', 'Fitbit', 'Garmin',
  'TP-Link', 'Netgear', 'Raspberry Pi', 'Espressif', 'Broadcom',
];

const DEVICE_NAMES = {
  wifi: ['iPhone', 'MacBook Pro', 'Galaxy S24', 'Pixel 8', 'ThinkPad', 'Surface Pro', 'iPad', 'Smart TV', 'Nest Hub', 'Echo Dot', 'Ring Camera', 'Laptop', 'Tablet'],
  bluetooth: ['AirPods Pro', 'WH-1000XM5', 'Apple Watch', 'Fitbit Charge', 'JBL Speaker', 'Tile Tracker', 'Magic Keyboard', 'MX Master', 'Car Audio', 'Hearing Aids'],
  ble: ['Beacon-7A', 'Temp Sensor', 'Smart Lock', 'Fitness Band', 'BLE Tag', 'Medical Device', 'IoT Sensor'],
};

function randomMac() {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  return Array.from({ length: 6 }, hex).join(':').toUpperCase();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Attempts real WiFi scan via nmcli; returns [] on failure.
 */
async function scanWifiReal() {
  try {
    const { stdout } = await execAsync(
      'nmcli -t -f BSSID,SSID,SIGNAL,SECURITY dev wifi list 2>/dev/null | head -40',
      { timeout: 8000 },
    );
    const results = [];
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const parts = line.split(':');
      if (parts.length < 4) continue;
      const mac = parts[0];
      const ssid = parts.slice(1, -2).join(':') || 'Hidden Network';
      const signal = parseInt(parts[parts.length - 2], 10);
      if (!mac || mac === '--') continue;
      results.push({
        id: `wifi-${mac}`,
        mac,
        name: ssid,
        type: 'wifi',
        vendor: 'Network',
        rssi: signal ? signal - 100 : -70,
        packets: 1 + Math.floor(Math.random() * 8),
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Attempts real Bluetooth scan via bluetoothctl; returns [] on failure.
 */
async function scanBluetoothReal() {
  try {
    await execAsync('bluetoothctl --timeout 3 scan on 2>/dev/null', { timeout: 6000 }).catch(() => {});
    const { stdout } = await execAsync(
      'bluetoothctl devices 2>/dev/null | head -30',
      { timeout: 5000 },
    );
    const results = [];
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const match = line.match(/Device\s+([0-9A-F:]+)\s+(.*)/i);
      if (!match) continue;
      const mac = match[1].toUpperCase();
      const name = match[2].trim() || 'BLE Device';
      results.push({
        id: `bt-${mac}`,
        mac,
        name,
        type: name.toLowerCase().includes('ble') ? 'ble' : 'bluetooth',
        vendor: pick(VENDORS),
        rssi: -55 - Math.floor(Math.random() * 35),
        packets: 1 + Math.floor(Math.random() * 3),
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Simulated scanner for demo / installation mode.
 */
class SimulatedScanner {
  constructor() {
    this.pool = [];
    this.tick = 0;
    this._seedPool();
  }

  _seedPool() {
    const count = 12 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      const type = Math.random() < 0.55 ? 'wifi' : Math.random() < 0.7 ? 'bluetooth' : 'ble';
      const mac = randomMac();
      this.pool.push({
        id: `${type}-${mac}`,
        mac,
        name: pick(DEVICE_NAMES[type]),
        type,
        vendor: pick(VENDORS),
        rssi: -45 - Math.floor(Math.random() * 45),
        presence: Math.random() > 0.3,
        activity: Math.random(),
      });
    }
  }

  scan() {
    this.tick += 1;

    // Devices enter/leave the corridor
    for (const d of this.pool) {
      if (Math.random() < 0.04) d.presence = !d.presence;
      if (d.presence) {
        d.rssi += Math.floor(Math.random() * 7) - 3;
        d.rssi = Math.max(-95, Math.min(-35, d.rssi));
        d.activity = 0.2 + Math.random() * 0.8;
      }
    }

    // Occasionally a new wanderer appears
    if (Math.random() < 0.06) {
      const type = pick(['wifi', 'bluetooth', 'ble']);
      const mac = randomMac();
      this.pool.push({
        id: `${type}-${mac}`,
        mac,
        name: pick(DEVICE_NAMES[type]),
        type,
        vendor: pick(VENDORS),
        rssi: -50 - Math.floor(Math.random() * 40),
        presence: true,
        activity: Math.random(),
      });
      if (this.pool.length > 28) this.pool.shift();
    }

    return this.pool
      .filter((d) => d.presence)
      .map((d) => ({
        id: d.id,
        mac: d.mac,
        name: d.name,
        type: d.type,
        vendor: d.vendor,
        rssi: d.rssi,
        packets: Math.max(1, Math.floor(d.activity * 12 * (0.5 + Math.random()))),
        packetBytes: d.type === 'wifi'
          ? Math.floor(200 + d.activity * 1400)
          : Math.floor(40 + d.activity * 200),
      }));
  }
}

export class Scanner {
  constructor({ mode = 'auto', intervalMs = 2000 } = {}) {
    this.mode = mode; // 'auto' | 'simulation' | 'hardware'
    this.intervalMs = intervalMs;
    this.simulator = new SimulatedScanner();
    this.useSimulation = mode === 'simulation';
    this._hardwareChecked = false;
  }

  async _resolveMode() {
    if (this.mode === 'simulation') {
      this.useSimulation = true;
      return;
    }
    if (this.mode === 'hardware') {
      this.useSimulation = false;
      return;
    }
    if (this._hardwareChecked) return;
    this._hardwareChecked = true;
    const [wifi, bt] = await Promise.all([scanWifiReal(), scanBluetoothReal()]);
    this.useSimulation = wifi.length === 0 && bt.length === 0;
    if (!this.useSimulation) {
      console.log(`[scanner] Hardware mode: ${wifi.length} WiFi, ${bt.length} Bluetooth devices detected`);
    } else {
      console.log('[scanner] No hardware signals found — running in simulation mode');
    }
  }

  async scan() {
    await this._resolveMode();

    if (this.useSimulation) {
      return this.simulator.scan();
    }

    const [wifi, bt] = await Promise.all([scanWifiReal(), scanBluetoothReal()]);
    const combined = [...wifi, ...bt];

    // Blend simulation if hardware returns very few devices (keeps display lively)
    if (combined.length < 3) {
      return [...combined, ...this.simulator.scan().slice(0, 8)];
    }
    return combined;
  }
}
