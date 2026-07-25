import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Scanner } from './scanner.js';
import { DeviceRegistry } from './deviceRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const SCAN_MODE = process.env.SCAN_MODE || 'auto';
const SCAN_INTERVAL = parseInt(process.env.SCAN_INTERVAL || '2000', 10);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const registry = new DeviceRegistry();
const scanner = new Scanner({ mode: SCAN_MODE, intervalMs: SCAN_INTERVAL });

app.use(express.json());

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    mode: scanner.useSimulation ? 'simulation' : 'hardware',
    scanMode: SCAN_MODE,
    scanInterval: SCAN_INTERVAL,
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

// Serve built client in production
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

    for (const raw of found) {
      const { device } = registry.upsert(raw);
      ids.push(device.id);
    }

    registry.markAbsent(ids);
    broadcast({ type: 'update', data: registry.getSnapshot() });
  } catch (err) {
    console.error('[scan]', err.message);
  }
}

setInterval(scanLoop, SCAN_INTERVAL);
scanLoop();

server.listen(PORT, () => {
  console.log(`Corridor Spectrum server on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});
