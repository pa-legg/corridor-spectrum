import { CorridorScene } from './scene/CorridorScene.js';
import { HUD, DevicePanel } from './ui/HUD.js';

const canvas = document.getElementById('scene-canvas');
const scene = new CorridorScene(canvas);
const hud = new HUD();
const devicePanel = new DevicePanel();

let devices = [];
let selectedId = null;
let scanMode = 'simulation';

scene.onDeviceSelect = (id) => {
  selectedId = id;
  if (id) {
    const device = devices.find((d) => d.id === id);
    devicePanel.show(device);
  } else {
    devicePanel.hide();
  }
};

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.hostname || 'localhost';
  const port = import.meta.env.DEV ? '3000' : (window.location.port || (protocol === 'wss' ? '443' : '80'));
  const wsUrl = import.meta.env.DEV
    ? `${protocol}://${host}:3000/ws`
    : `${protocol}://${window.location.host}/ws`;

  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'snapshot' || msg.type === 'update') {
      handleUpdate(msg.data);
    }
  };

  ws.onclose = () => {
    setTimeout(connect, 3000);
  };

  ws.onopen = async () => {
    try {
      const res = await fetch(import.meta.env.DEV ? 'http://localhost:3000/api/status' : '/api/status');
      const status = await res.json();
      scanMode = status.mode;
      hud.updateStats(status, scanMode);
    } catch {
      // status fetch optional
    }
  };
}

function handleUpdate(data) {
  devices = data.devices;
  scene.updateDevices(devices);
  hud.updateStats(data.stats, scanMode);

  if (selectedId) {
    const device = devices.find((d) => d.id === selectedId);
    if (device) devicePanel.show(device);
  }
}

connect();
