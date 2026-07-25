/**
 * Tracks discovered wireless/Bluetooth devices, environment entry counts, and transmission stats.
 */

const VISIT_GAP_MS = parseInt(process.env.VISIT_GAP_MS || String(2 * 60 * 1000), 10);
const ABSENCE_THRESHOLD = parseInt(process.env.ABSENCE_THRESHOLD || '4', 10);

export class DeviceRegistry {
  constructor() {
    this.devices = new Map();
    this.totalPackets = 0;
    this.sessionStart = Date.now();
    this.totalEntries = 0;
    this._dirty = false;
  }

  upsert(raw, { hardware = false } = {}) {
    const now = Date.now();
    const id = raw.id;
    let device = this.devices.get(id);

    if (!device) {
      device = {
        id,
        mac: raw.mac,
        name: raw.name || 'Unknown Device',
        type: raw.type,
        vendor: raw.vendor || 'Unknown',
        source: raw.source || 'unknown',
        rssi: raw.rssi ?? -70,
        firstSeen: now,
        lastSeen: now,
        visitCount: 1,
        entryCount: 1,
        visits: [{ enteredAt: now, exitedAt: null }],
        bytesTransmitted: 0,
        packetsTransmitted: 0,
        txRate: 0,
        isPresent: true,
        missedScans: 0,
        _rateWindow: [],
      };
      this.devices.set(id, device);
      this.totalEntries += 1;
      this._dirty = true;
      return { device, isNew: true, newEntry: true };
    }

    const wasAbsent = !device.isPresent;
    const prevLastSeen = device.lastSeen;
    device.lastSeen = now;
    device.isPresent = true;
    device.missedScans = 0;
    device.rssi = raw.rssi ?? device.rssi;
    if (raw.name && raw.name !== 'Unknown Device') device.name = raw.name;
    if (raw.vendor) device.vendor = raw.vendor;
    if (raw.source) device.source = raw.source;

    let newEntry = false;
    if (wasAbsent) {
      const gap = now - prevLastSeen;
      const lastVisit = device.visits[device.visits.length - 1];

      if (gap > VISIT_GAP_MS || lastVisit?.exitedAt) {
        device.visitCount += 1;
        device.entryCount = device.visitCount;
        device.visits.push({ enteredAt: now, exitedAt: null });
        this.totalEntries += 1;
        newEntry = true;
        this._dirty = true;
      } else if (lastVisit) {
        lastVisit.exitedAt = null;
        this._dirty = true;
      }
    }

    const packets = raw.packets ?? 1;
    const packetBytes = raw.packetBytes ?? (hardware ? 0 : this._estimatePacketBytes(device));
    device.packetsTransmitted += packets;
    device.bytesTransmitted += packetBytes;
    this.totalPackets += packets;

    device._rateWindow.push({ t: now, bytes: packetBytes });
    device._rateWindow = device._rateWindow.filter((e) => now - e.t < 5000);
    const windowBytes = device._rateWindow.reduce((s, e) => s + e.bytes, 0);
    device.txRate = Math.round(windowBytes / 5);

    return { device, isNew: false, newEntry };
  }

  markAbsent(idsPresent) {
    const now = Date.now();
    const presentSet = new Set(idsPresent);

    for (const [id, device] of this.devices) {
      if (presentSet.has(id)) {
        device.missedScans = 0;
        continue;
      }

      if (!device.isPresent) continue;

      device.missedScans += 1;
      if (device.missedScans < ABSENCE_THRESHOLD) continue;

      device.isPresent = false;
      const lastVisit = device.visits[device.visits.length - 1];
      if (lastVisit && !lastVisit.exitedAt) {
        lastVisit.exitedAt = now;
        this._dirty = true;
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
      source: d.source,
      rssi: d.rssi,
      firstSeen: d.firstSeen,
      lastSeen: d.lastSeen,
      visitCount: d.visitCount,
      entryCount: d.entryCount ?? d.visitCount,
      visits: d.visits.slice(-20),
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
        totalEntries: this.totalEntries,
        sessionUptime: Date.now() - this.sessionStart,
        wifiCount: devices.filter((d) => d.type === 'wifi' && d.isPresent).length,
        bluetoothCount: devices.filter((d) => (d.type === 'bluetooth' || d.type === 'ble') && d.isPresent).length,
      },
    };
  }

  getDevice(id) {
    if (!this.devices.has(id)) return null;
    return this.getSnapshot().devices.find((x) => x.id === id);
  }

  exportState() {
    const devices = {};
    for (const [id, d] of this.devices) {
      devices[id] = {
        id: d.id,
        mac: d.mac,
        name: d.name,
        type: d.type,
        vendor: d.vendor,
        source: d.source,
        rssi: d.rssi,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
        visitCount: d.visitCount,
        entryCount: d.entryCount ?? d.visitCount,
        visits: d.visits,
        bytesTransmitted: d.bytesTransmitted,
        packetsTransmitted: d.packetsTransmitted,
      };
    }

    return {
      version: 1,
      savedAt: Date.now(),
      totalPackets: this.totalPackets,
      totalEntries: this.totalEntries,
      sessionStart: this.sessionStart,
      devices,
    };
  }

  importState(data) {
    if (!data?.devices) return;

    this.totalPackets = data.totalPackets ?? 0;
    this.totalEntries = data.totalEntries ?? 0;
    this.sessionStart = data.sessionStart ?? Date.now();

    for (const [id, raw] of Object.entries(data.devices)) {
      this.devices.set(id, {
        ...raw,
        entryCount: raw.entryCount ?? raw.visitCount ?? 1,
        visitCount: raw.visitCount ?? raw.entryCount ?? 1,
        isPresent: false,
        missedScans: 0,
        txRate: 0,
        _rateWindow: [],
      });
    }
  }

  consumeDirty() {
    const dirty = this._dirty;
    this._dirty = false;
    return dirty;
  }

  _estimatePacketBytes(device) {
    const base = device.type === 'wifi' ? 800 : 120;
    const signalFactor = Math.max(0.3, (device.rssi + 100) / 70);
    return Math.round(base * signalFactor * (0.5 + Math.random()));
  }
}
