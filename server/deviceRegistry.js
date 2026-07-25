/**
 * Tracks discovered wireless/Bluetooth devices, visit history, and transmission stats.
 */

const VISIT_GAP_MS = 5 * 60 * 1000; // New visit if absent for 5 minutes

export class DeviceRegistry {
  constructor() {
    this.devices = new Map();
    this.totalPackets = 0;
    this.sessionStart = Date.now();
  }

  upsert(raw) {
    const now = Date.now();
    const id = raw.id;
    let device = this.devices.get(id);

    if (!device) {
      device = {
        id,
        mac: raw.mac,
        name: raw.name || 'Unknown Device',
        type: raw.type, // 'wifi' | 'bluetooth' | 'ble'
        vendor: raw.vendor || 'Unknown',
        rssi: raw.rssi ?? -70,
        firstSeen: now,
        lastSeen: now,
        visitCount: 1,
        visits: [{ enteredAt: now, exitedAt: null }],
        bytesTransmitted: 0,
        packetsTransmitted: 0,
        txRate: 0, // bytes/sec rolling estimate
        isPresent: true,
        position: raw.position || null,
        _lastPacketAt: now,
        _rateWindow: [],
      };
      this.devices.set(id, device);
      return { device, isNew: true };
    }

    const wasAbsent = !device.isPresent;
    const prevLastSeen = device.lastSeen;
    device.lastSeen = now;
    device.isPresent = true;
    device.rssi = raw.rssi ?? device.rssi;
    if (raw.name && raw.name !== 'Unknown Device') device.name = raw.name;
    if (raw.vendor) device.vendor = raw.vendor;

    if (wasAbsent) {
      const gap = now - prevLastSeen;
      if (gap > VISIT_GAP_MS) {
        device.visitCount += 1;
        device.visits.push({ enteredAt: now, exitedAt: null });
      } else {
        const lastVisit = device.visits[device.visits.length - 1];
        if (lastVisit?.exitedAt) {
          device.visitCount += 1;
          device.visits.push({ enteredAt: now, exitedAt: null });
        } else if (lastVisit) {
          lastVisit.exitedAt = null;
        }
      }
    }

    // Simulate / record transmission activity
    const packetBytes = raw.packetBytes ?? this._estimatePacketBytes(device);
    device.packetsTransmitted += raw.packets ?? 1;
    device.bytesTransmitted += packetBytes;
    this.totalPackets += raw.packets ?? 1;

    device._rateWindow.push({ t: now, bytes: packetBytes });
    device._rateWindow = device._rateWindow.filter((e) => now - e.t < 5000);
    const windowBytes = device._rateWindow.reduce((s, e) => s + e.bytes, 0);
    device.txRate = Math.round(windowBytes / 5);

    return { device, isNew: false };
  }

  markAbsent(idsPresent) {
    const now = Date.now();
    const presentSet = new Set(idsPresent);
    for (const [id, device] of this.devices) {
      if (!presentSet.has(id) && device.isPresent) {
        device.isPresent = false;
        const lastVisit = device.visits[device.visits.length - 1];
        if (lastVisit && !lastVisit.exitedAt) {
          lastVisit.exitedAt = now;
        }
      }
    }
  }

  getSnapshot() {
    const devices = [...this.devices.values()].map((d) => ({
      id: d.id,
      mac: d.mac,
      name: d.name,
      type: d.type,
      vendor: d.vendor,
      rssi: d.rssi,
      firstSeen: d.firstSeen,
      lastSeen: d.lastSeen,
      visitCount: d.visitCount,
      visits: d.visits.slice(-10),
      bytesTransmitted: d.bytesTransmitted,
      packetsTransmitted: d.packetsTransmitted,
      txRate: d.txRate,
      isPresent: d.isPresent,
      dwellTime: d.isPresent ? Date.now() - (d.visits[d.visits.length - 1]?.enteredAt || d.firstSeen) : 0,
    }));

    return {
      devices,
      stats: {
        totalDevices: this.devices.size,
        presentDevices: devices.filter((d) => d.isPresent).length,
        totalPackets: this.totalPackets,
        sessionUptime: Date.now() - this.sessionStart,
        wifiCount: devices.filter((d) => d.type === 'wifi' && d.isPresent).length,
        bluetoothCount: devices.filter((d) => (d.type === 'bluetooth' || d.type === 'ble') && d.isPresent).length,
      },
    };
  }

  getDevice(id) {
    const d = this.devices.get(id);
    if (!d) return null;
    return this.getSnapshot().devices.find((x) => x.id === id);
  }

  _estimatePacketBytes(device) {
    const base = device.type === 'wifi' ? 800 : 120;
    const signalFactor = Math.max(0.3, (device.rssi + 100) / 70);
    return Math.round(base * signalFactor * (0.5 + Math.random()));
  }
}
