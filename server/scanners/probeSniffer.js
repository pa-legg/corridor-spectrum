import { spawnLineProcessor } from './exec.js';

const MAC_RE = /([0-9a-f]{2}(?::[0-9a-f]{2}){5})/gi;
const STALE_MS = 45_000;

/**
 * Passive WiFi probe-request listener for Raspberry Pi monitor interfaces.
 * Phones and laptops constantly broadcast probe requests — ideal for corridor sensing.
 */
export class ProbeSniffer {
  constructor(iface) {
    this.iface = iface;
    this.probes = new Map();
    this.child = null;
    this.running = false;
  }

  start() {
    if (!this.iface || this.running) return;
    this.running = true;

    console.log(`[probe] Listening on ${this.iface} for WiFi probe requests`);

    this.child = spawnLineProcessor(
      'tcpdump',
      ['-i', this.iface, '-l', '-n', '-e', 'type', 'mgt', 'subtype', 'probe-req'],
      (line) => this._handleLine(line),
    );

    this.child.on('exit', (code) => {
      this.running = false;
      if (code !== null && code !== 0) {
        console.warn(`[probe] tcpdump exited (${code}) — probe capture stopped`);
      }
    });
  }

  stop() {
    if (this.child) {
      this.child.kill('SIGTERM');
      this.child = null;
    }
    this.running = false;
  }

  _handleLine(line) {
    const macs = [...line.matchAll(MAC_RE)].map((m) => m[1].toUpperCase());
    if (macs.length === 0) return;

    // First MAC in probe-request frames is typically the client source address.
    const mac = macs[0];
    const now = Date.now();
    const existing = this.probes.get(mac);

    if (existing) {
      existing.lastSeen = now;
      existing.probeCount += 1;
    } else {
      this.probes.set(mac, {
        mac,
        lastSeen: now,
        probeCount: 1,
        firstSeen: now,
      });
    }
  }

  getActive() {
    const now = Date.now();
    const results = [];

    for (const [mac, probe] of this.probes) {
      if (now - probe.lastSeen > STALE_MS) {
        this.probes.delete(mac);
        continue;
      }

      results.push({
        id: `wifi-${mac}`,
        mac,
        name: 'WiFi Client',
        type: 'wifi',
        vendor: 'Probe Request',
        rssi: -65,
        packets: Math.min(probe.probeCount, 20),
        packetBytes: 80,
        source: 'probe',
      });
    }

    return results;
  }
}
