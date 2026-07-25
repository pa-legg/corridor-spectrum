export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatRate(bytesPerSec) {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function rssiToPercent(rssi) {
  return Math.max(0, Math.min(100, ((rssi + 95) / 60) * 100));
}

export class HUD {
  constructor() {
    this.els = {
      mode: document.getElementById('mode-badge'),
      present: document.getElementById('stat-present'),
      total: document.getElementById('stat-total'),
      wifi: document.getElementById('stat-wifi'),
      bt: document.getElementById('stat-bt'),
      packets: document.getElementById('stat-packets'),
    };
  }

  updateStats(stats, mode) {
    this.els.present.textContent = stats.presentDevices;
    this.els.total.textContent = stats.totalDevices;
    this.els.wifi.textContent = stats.wifiCount;
    this.els.bt.textContent = stats.bluetoothCount;
    this.els.packets.textContent = stats.totalPackets.toLocaleString();
    this.els.mode.textContent = mode === 'simulation' ? 'DEMO MODE' : 'LIVE SCAN';
  }
}

export class DevicePanel {
  constructor() {
    this.panel = document.getElementById('device-panel');
    this.els = {
      type: document.getElementById('panel-type'),
      name: document.getElementById('panel-name'),
      mac: document.getElementById('panel-mac'),
      vendor: document.getElementById('panel-vendor'),
      signal: document.getElementById('panel-signal'),
      rssi: document.getElementById('panel-rssi'),
      visits: document.getElementById('panel-visits'),
      bytes: document.getElementById('panel-bytes'),
      packets: document.getElementById('panel-packets'),
      rate: document.getElementById('panel-rate'),
      status: document.getElementById('panel-status'),
      visitsList: document.getElementById('panel-visits-list'),
    };

    document.getElementById('panel-close').addEventListener('click', () => this.hide());
  }

  show(device) {
    if (!device) return this.hide();

    const typeLabel = device.type === 'ble' ? 'BLE / IoT' : device.type.toUpperCase();
    this.els.type.textContent = typeLabel;
    this.els.name.textContent = device.name;
    this.els.mac.textContent = device.mac;
    this.els.vendor.textContent = device.vendor;
    this.els.rssi.textContent = `${device.rssi} dBm`;
    this.els.signal.style.width = `${rssiToPercent(device.rssi)}%`;
    this.els.visits.textContent = device.visitCount;
    this.els.bytes.textContent = formatBytes(device.bytesTransmitted);
    this.els.packets.textContent = device.packetsTransmitted.toLocaleString();
    this.els.rate.textContent = formatRate(device.txRate);
    this.els.status.textContent = device.isPresent ? '● Present' : '○ Absent';
    this.els.status.style.color = device.isPresent ? '#22d3a0' : '#6b8aab';

    this.els.visitsList.innerHTML = device.visits
      .slice()
      .reverse()
      .map((v) => {
        const entered = formatTime(v.enteredAt);
        const exited = v.exitedAt ? formatTime(v.exitedAt) : 'now';
        const duration = v.exitedAt
          ? formatDuration(v.exitedAt - v.enteredAt)
          : formatDuration(Date.now() - v.enteredAt);
        return `<li>Visit · ${entered} → ${exited} (${duration})</li>`;
      })
      .join('');

    this.panel.classList.remove('hidden');
  }

  hide() {
    this.panel.classList.add('hidden');
  }
}
