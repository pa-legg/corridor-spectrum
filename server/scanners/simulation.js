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

export class SimulatedScanner {
  constructor() {
    this.pool = [];
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
    for (const d of this.pool) {
      if (Math.random() < 0.04) d.presence = !d.presence;
      if (d.presence) {
        d.rssi += Math.floor(Math.random() * 7) - 3;
        d.rssi = Math.max(-95, Math.min(-35, d.rssi));
        d.activity = 0.2 + Math.random() * 0.8;
      }
    }

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
        source: 'simulation',
      }));
  }
}
