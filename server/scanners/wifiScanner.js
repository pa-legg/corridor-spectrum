import { commandExists, run } from './exec.js';

const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

function parseIwScan(output) {
  const results = new Map();
  let current = null;

  for (const line of output.split('\n')) {
    const bssMatch = line.match(/^BSS ([0-9a-f:]+)/i);
    if (bssMatch) {
      current = { mac: bssMatch[1].toUpperCase(), ssid: null, rssi: -70 };
      continue;
    }
    if (!current) continue;

    const ssidMatch = line.match(/^\s+SSID: (.*)$/);
    if (ssidMatch) {
      current.ssid = ssidMatch[1] || 'Hidden Network';
      continue;
    }

    const signalMatch = line.match(/^\s+signal: ([-\d.]+)/);
    if (signalMatch) {
      current.rssi = Math.round(parseFloat(signalMatch[1]));
      if (MAC_RE.test(current.mac)) {
        results.set(current.mac, {
          id: `wifi-${current.mac}`,
          mac: current.mac,
          name: current.ssid || 'Hidden Network',
          type: 'wifi',
          vendor: 'Access Point',
          rssi: current.rssi,
          packets: 1,
          packetBytes: 120,
          source: 'iw',
        });
      }
      current = null;
    }
  }

  return [...results.values()];
}

function parseNmcli(output) {
  const results = new Map();

  for (const line of output.split('\n').filter(Boolean)) {
    const unescaped = line.replace(/\\:/g, ':');
    const parts = unescaped.split(':');
    if (parts.length < 7) continue;

    const signal = parseInt(parts[parts.length - 1], 10);
    const mac = parts.slice(0, 6).join(':').toUpperCase();
    const ssid = parts.slice(6, -1).join(':') || 'Hidden Network';
    if (!MAC_RE.test(mac)) continue;

    results.set(mac, {
      id: `wifi-${mac}`,
      mac,
      name: ssid,
      type: 'wifi',
      vendor: 'Network',
      rssi: Number.isFinite(signal) ? signal - 100 : -70,
      packets: 1,
      packetBytes: 120,
      source: 'nmcli',
    });
  }

  return [...results.values()];
}

async function detectWifiInterface(iface) {
  if (iface) return iface;
  try {
    const output = await run("iw dev 2>/dev/null | awk '/Interface/ {print $2; exit}'");
    return output.trim() || 'wlan0';
  } catch {
    return 'wlan0';
  }
}

export async function scanWifi({ iface, probeSniffer }) {
  const results = new Map();

  if (probeSniffer) {
    for (const device of probeSniffer.getActive()) {
      results.set(device.mac, device);
    }
  }

  const wifiIface = await detectWifiInterface(iface);

  if (await commandExists('iw')) {
    try {
      await run(`sudo iw dev ${wifiIface} scan trigger 2>/dev/null || iw dev ${wifiIface} scan trigger 2>/dev/null`, 5000).catch(() => {});
      const output = await run(`iw dev ${wifiIface} scan dump 2>/dev/null`, 12000);
      for (const ap of parseIwScan(output)) {
        if (!results.has(ap.mac)) results.set(ap.mac, ap);
      }
    } catch (err) {
      console.warn('[wifi] iw scan failed:', err.message);
    }
  }

  if (results.size === 0 && (await commandExists('nmcli'))) {
    try {
      await run('nmcli dev wifi rescan 2>/dev/null', 8000).catch(() => {});
      const output = await run('nmcli -t -f BSSID,SSID,SIGNAL dev wifi list 2>/dev/null | head -60', 8000);
      for (const ap of parseNmcli(output)) {
        if (!results.has(ap.mac)) results.set(ap.mac, ap);
      }
    } catch (err) {
      console.warn('[wifi] nmcli scan failed:', err.message);
    }
  }

  return [...results.values()];
}
