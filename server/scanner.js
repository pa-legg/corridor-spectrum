import { commandExists } from './scanners/exec.js';
import { scanWifi } from './scanners/wifiScanner.js';
import { scanBluetooth } from './scanners/bluetoothScanner.js';
import { ProbeSniffer } from './scanners/probeSniffer.js';
import { SimulatedScanner } from './scanners/simulation.js';
import { isPiLike } from './scanners/platform.js';

export class Scanner {
  constructor({
    mode = 'auto',
    wifiIface = 'wlan0',
    hciIface = 'hci0',
    monitorIface = '',
    btScanSeconds = 4,
  } = {}) {
    this.mode = mode;
    this.wifiIface = wifiIface;
    this.hciIface = hciIface;
    this.btScanSeconds = btScanSeconds;
    this.simulator = new SimulatedScanner();
    this.probeSniffer = monitorIface ? new ProbeSniffer(monitorIface) : null;
    this.useSimulation = mode === 'simulation';
    this._hardwareChecked = false;
    this.capabilities = {
      iw: false,
      nmcli: false,
      bluetoothctl: false,
      btmgmt: false,
      hcitool: false,
      tcpdump: false,
      probeMonitor: Boolean(monitorIface),
      platform: isPiLike() ? 'raspberry-pi' : 'linux',
    };
  }

  async init() {
    this.capabilities.iw = await commandExists('iw');
    this.capabilities.nmcli = await commandExists('nmcli');
    this.capabilities.bluetoothctl = await commandExists('bluetoothctl');
    this.capabilities.btmgmt = await commandExists('btmgmt');
    this.capabilities.hcitool = await commandExists('hcitool');
    this.capabilities.tcpdump = await commandExists('tcpdump');

    if (this.probeSniffer && this.capabilities.tcpdump) {
      this.probeSniffer.start();
    } else if (this.probeSniffer) {
      console.warn('[scanner] tcpdump not found — probe capture disabled');
      this.probeSniffer = null;
      this.capabilities.probeMonitor = false;
    }

    await this._resolveMode();
  }

  async _resolveMode() {
    if (this.mode === 'simulation') {
      this.useSimulation = true;
      console.log('[scanner] Simulation mode enabled');
      return;
    }

    if (this.mode === 'hardware') {
      this.useSimulation = false;
      console.log('[scanner] Hardware mode enabled (Raspberry Pi / Linux scanners)');
      return;
    }

    if (this._hardwareChecked) return;
    this._hardwareChecked = true;

    const hasScannerTool = this.capabilities.iw
      || this.capabilities.nmcli
      || this.capabilities.bluetoothctl
      || this.capabilities.btmgmt
      || this.capabilities.probeMonitor;

    if (isPiLike() && hasScannerTool) {
      this.useSimulation = false;
      console.log('[scanner] Raspberry Pi detected — using hardware scanners');
      return;
    }

    const [wifi, bt] = await Promise.all([
      scanWifi({ iface: this.wifiIface, probeSniffer: this.probeSniffer }),
      scanBluetooth({ hci: this.hciIface, scanSeconds: this.btScanSeconds }),
    ]);

    this.useSimulation = wifi.length === 0 && bt.length === 0;
    if (this.useSimulation) {
      console.log('[scanner] No wireless signals found — falling back to simulation');
    } else {
      console.log(`[scanner] Hardware mode: ${wifi.length} WiFi, ${bt.length} Bluetooth`);
    }
  }

  async scan() {
    if (this.useSimulation) {
      return this.simulator.scan();
    }

    const [wifi, bt] = await Promise.all([
      scanWifi({ iface: this.wifiIface, probeSniffer: this.probeSniffer }),
      scanBluetooth({ hci: this.hciIface, scanSeconds: this.btScanSeconds }),
    ]);

    return [...wifi, ...bt];
  }

  getStatus() {
    return {
      mode: this.useSimulation ? 'simulation' : 'hardware',
      capabilities: this.capabilities,
    };
  }

  stop() {
    this.probeSniffer?.stop();
  }
}
