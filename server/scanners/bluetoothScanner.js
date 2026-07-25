import { commandExists, run } from './exec.js';

const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

function classifyBluetooth(name) {
  const lower = (name || '').toLowerCase();
  if (lower.includes('ble') || lower.includes('beacon') || lower.includes('sensor') || lower.includes('iot')) {
    return 'ble';
  }
  return 'bluetooth';
}

function parseBluetoothctlDevices(output) {
  const results = new Map();

  for (const line of output.split('\n').filter(Boolean)) {
    const match = line.match(/Device\s+([0-9A-F:]+)\s+(.*)/i);
    if (!match) continue;
    const mac = match[1].toUpperCase();
    const name = match[2].trim() || 'Bluetooth Device';
    if (!MAC_RE.test(mac)) continue;

    results.set(mac, {
      id: `bt-${mac}`,
      mac,
      name,
      type: classifyBluetooth(name),
      vendor: 'Bluetooth',
      rssi: -70,
      packets: 1,
      packetBytes: 60,
      source: 'bluetoothctl',
    });
  }

  return results;
}

function parseBtmgmt(output) {
  const results = new Map();

  for (const line of output.split('\n').filter(Boolean)) {
    const match = line.match(/dev ([0-9A-F:]+)\s+.*rssi ([-\d]+).*name (.+)$/i)
      || line.match(/([0-9A-F:]{17}).*RSSI:\s*([-\d]+).*name:\s*(.+)$/i);
    if (!match) continue;

    const mac = match[1].toUpperCase();
    const rssi = parseInt(match[2], 10);
    const name = match[3].trim();
    if (!MAC_RE.test(mac)) continue;

    results.set(mac, {
      id: `bt-${mac}`,
      mac,
      name: name || 'Bluetooth Device',
      type: classifyBluetooth(name),
      vendor: 'Bluetooth',
      rssi,
      packets: 1,
      packetBytes: 60,
      source: 'btmgmt',
    });
  }

  return results;
}

function parseHcitoolLescan(output) {
  const results = new Map();

  for (const line of output.split('\n').filter(Boolean)) {
    const match = line.match(/^([0-9A-F:]{17})\s+(.*)$/i);
    if (!match) continue;
    const mac = match[1].toUpperCase();
    const name = match[2].trim() || 'BLE Device';
    if (!MAC_RE.test(mac)) continue;

    results.set(mac, {
      id: `bt-${mac}`,
      mac,
      name,
      type: 'ble',
      vendor: 'BLE',
      rssi: -75,
      packets: 1,
      packetBytes: 40,
      source: 'lescan',
    });
  }

  return results;
}

async function ensureBluetoothPowered(hci) {
  try {
    await run(`bluetoothctl --timeout 3 power on 2>/dev/null`, 5000);
    await run(`hciconfig ${hci} up 2>/dev/null`, 5000).catch(() => {});
  } catch {
    // Non-fatal
  }
}

export async function scanBluetooth({ hci = 'hci0', scanSeconds = 4 } = {}) {
  const results = new Map();

  await ensureBluetoothPowered(hci);

  if (await commandExists('btmgmt')) {
    try {
      const output = await run(`timeout ${scanSeconds} btmgmt -i ${hci} find -l 2>/dev/null`, (scanSeconds + 2) * 1000);
      for (const [mac, device] of parseBtmgmt(output)) {
        results.set(mac, device);
      }
    } catch {
      // Fall through
    }
  }

  if (await commandExists('bluetoothctl')) {
    try {
      await run(`bluetoothctl --timeout ${scanSeconds} scan on 2>/dev/null`, (scanSeconds + 3) * 1000);
      const output = await run('bluetoothctl devices 2>/dev/null', 5000);
      for (const [mac, device] of parseBluetoothctlDevices(output)) {
        if (!results.has(mac)) results.set(mac, device);
      }
    } catch (err) {
      console.warn('[bluetooth] bluetoothctl scan failed:', err.message);
    }
  }

  if (results.size === 0 && (await commandExists('hcitool'))) {
    try {
      const output = await run(`timeout ${scanSeconds} hcitool lescan --duplicates 2>/dev/null`, (scanSeconds + 2) * 1000);
      for (const [mac, device] of parseHcitoolLescan(output)) {
        results.set(mac, device);
      }
    } catch {
      // Fall through
    }

    try {
      const output = await run(`timeout ${scanSeconds} hcitool scan --flush 2>/dev/null`, (scanSeconds + 2) * 1000);
      for (const line of output.split('\n').filter(Boolean)) {
        const match = line.match(/^([0-9A-F:]{17})\t+(.*)$/i);
        if (!match) continue;
        const mac = match[1].toUpperCase();
        if (!MAC_RE.test(mac) || results.has(mac)) continue;
        results.set(mac, {
          id: `bt-${mac}`,
          mac,
          name: match[2].trim() || 'Bluetooth Device',
          type: 'bluetooth',
          vendor: 'Bluetooth',
          rssi: -70,
          packets: 1,
          packetBytes: 60,
          source: 'hcitool',
        });
      }
    } catch {
      // Non-fatal
    }
  }

  return [...results.values()];
}
