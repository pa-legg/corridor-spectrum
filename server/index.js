import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Scanner } from './scanner.js';
import { DeviceRegistry } from './deviceRegistry.js';
import { Persistence } from './persistence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const SCAN_MODE = process.env.SCAN_MODE || 'auto';
const SCAN_INTERVAL = parseInt(process.env.SCAN_INTERVAL || '2000', 10);
const WIFI_IFACE = process.env.WIFI_IFACE || 'wlan0';
const HCI_IFACE = process.env.HCI_IFACE || 'hci0';
const MONITOR_IFACE = process.env.MONITOR_IFACE || '';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '../data/registry.json');
const PERSIST_INTERVAL = parseInt(process.env.PERSIST_INTERVAL || '30000', 10);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const registry = new DeviceRegistry();
const persistence = new Persistence(DATA_FILE);
const scanner = new Scanner({
  mode: SCAN_MODE,
  wifiIface: WIFI_IFACE,
  hciIface: HCI_IFACE,
  monitorIface: MONITOR_IFACE,
});

persistence.load(registry);

app.use(express.json());

app.get('/api/status', (_req, res) => {
  const scannerStatus = scanner.getStatus();
  res.json({
    ok: true,
    mode: scannerStatus.mode,
    scanMode: SCAN_MODE,
    scanInterval: SCAN_INTERVAL,
    wifiIface: WIFI_IFACE,
    hciIface: HCI_IFACE,
    monitorIface: MONITOR_IFACE || null,
    capabilities: scannerStatus.capabilities,
    dataFile: DATA_FILE,
    ...registry.getSnapshot().stats,
  });
});

app.get('/api/devices', (_req, res) => {
  res.json(registry.getSnapshot());
});

app.get('/api/devices/:id', (req, res) => {
  const device = registry.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(device);
});

const clientDist = path.join(__dirname, '../dist/client');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'snapshot', data: registry.getSnapshot() }));
});

async function scanLoop() {
  try {
    const found = await scanner.scan();
    const ids = [];
    const hardware = !scanner.useSimulation;

    for (const raw of found) {
      const { device } = registry.upsert(raw, { hardware });
      ids.push(device.id);
    }

    registry.markAbsent(ids);
    broadcast({ type: 'update', data: registry.getSnapshot() });

    if (registry.consumeDirty()) {
      persistence.save(registry);
    }
  } catch (err) {
    console.error('[scan]', err.message);
  }
}

async function start() {
  await scanner.init();

  setInterval(scanLoop, SCAN_INTERVAL);
  setInterval(() => persistence.save(registry), PERSIST_INTERVAL);
  scanLoop();

  server.listen(PORT, () => {
    console.log(`Corridor Spectrum server on http://localhost:${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`Scan mode: ${scanner.getStatus().mode}`);
    console.log(`Data file: ${DATA_FILE}`);
  });
}

process.on('SIGINT', () => {
  persistence.save(registry);
  scanner.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  persistence.save(registry);
  scanner.stop();
  process.exit(0);
});

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
