import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { DeviceNode } from './DeviceNode.js';
import { DataStream } from './DataStream.js';

const TYPE_COLORS = {
  wifi: new THREE.Color(0x00d4ff),
  bluetooth: new THREE.Color(0xa855f7),
  ble: new THREE.Color(0x22d3a0),
};

export class CorridorScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.deviceNodes = new Map();
    this.dataStreams = [];
    this.selectedId = null;
    this.onDeviceSelect = null;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._clock = new THREE.Clock();

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initControls();
    this._initPostProcessing();
    this._initEnvironment();
    this._initSensor();
    this._bindEvents();
    this._animate();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030508, 0.035);
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.set(0, 4, 14);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 28;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.target.set(0, 1.5, 0);
  }

  _initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.65,
      0.5,
      0.85,
    );
    this.composer.addPass(bloom);
  }

  _initEnvironment() {
    // Corridor floor grid
    const grid = new THREE.GridHelper(40, 40, 0x0a3d5c, 0x061220);
    grid.position.y = 0;
    this.scene.add(grid);

    // Floor plane with subtle reflection feel
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x040810,
      metalness: 0.8,
      roughness: 0.4,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    this.scene.add(floor);

    // Corridor walls (wireframe panels)
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      wireframe: true,
      transparent: true,
      opacity: 0.06,
    });

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), wallMat);
    leftWall.position.set(-10, 4, 0);
    leftWall.rotation.y = Math.PI / 2;
    this.scene.add(leftWall);

    const rightWall = leftWall.clone();
    rightWall.position.set(10, 4, 0);
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    // Ceiling light strips
    for (let z = -15; z <= 15; z += 5) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(18, 0.05, 0.3),
        new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.15 }),
      );
      strip.position.set(0, 7.5, z);
      this.scene.add(strip);

      const light = new THREE.PointLight(0x00d4ff, 0.4, 12);
      light.position.set(0, 7, z);
      this.scene.add(light);
    }

    // Ambient + key light
    this.scene.add(new THREE.AmbientLight(0x0a1520, 1.2));
    const key = new THREE.DirectionalLight(0x4488cc, 0.6);
    key.position.set(5, 10, 8);
    this.scene.add(key);

    // Floating ambient particles (environment dust/data motes)
    this.ambientParticles = this._createAmbientParticles();
    this.scene.add(this.ambientParticles);
  }

  _createAmbientParticles() {
    const count = 400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x00d4ff,
      size: 0.04,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Points(geo, mat);
  }

  _initSensor() {
    // Central monitoring sensor — the "eye" of the corridor
    const sensorGroup = new THREE.Group();

    const ringGeo = new THREE.TorusGeometry(0.8, 0.03, 8, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.7 });
    this.sensorRing = new THREE.Mesh(ringGeo, ringMat);
    this.sensorRing.rotation.x = Math.PI / 2;
    sensorGroup.add(this.sensorRing);

    const innerGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    sensorGroup.add(inner);

    const glowGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.15,
    });
    this.sensorGlow = new THREE.Mesh(glowGeo, glowMat);
    sensorGroup.add(this.sensorGlow);

    sensorGroup.position.set(0, 2.5, 0);
    this.sensor = sensorGroup;
    this.scene.add(sensorGroup);

    // Sensor scan ring on floor
    const scanGeo = new THREE.RingGeometry(0.5, 0.52, 64);
    const scanMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    this.scanRing = new THREE.Mesh(scanGeo, scanMat);
    this.scanRing.rotation.x = -Math.PI / 2;
    this.scanRing.position.y = 0.02;
    this.scene.add(this.scanRing);
  }

  _bindEvents() {
    window.addEventListener('resize', () => this._onResize());
    this.canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.canvas.addEventListener('click', (e) => this._onClick(e));
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  _onPointerMove(event) {
    this._pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this._pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  _onClick(event) {
    this._pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this._pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this._raycaster.setFromCamera(this._pointer, this.camera);
    const meshes = [...this.deviceNodes.values()].map((n) => n.mesh);
    const hits = this._raycaster.intersectObjects(meshes, false);

    if (hits.length > 0) {
      const node = hits[0].object.userData.deviceNode;
      if (node) {
        this.selectDevice(node.device.id);
      }
    } else {
      this.selectDevice(null);
    }
  }

  selectDevice(id) {
    if (this.selectedId === id) return;
    if (this.selectedId && this.deviceNodes.has(this.selectedId)) {
      this.deviceNodes.get(this.selectedId).setSelected(false);
    }
    this.selectedId = id;
    if (id && this.deviceNodes.has(id)) {
      this.deviceNodes.get(id).setSelected(true);
    }
    if (this.onDeviceSelect) this.onDeviceSelect(id);
  }

  _assignPosition(device, index, total) {
    // Distribute devices in a corridor-like arc around the sensor
    const angle = (index / Math.max(total, 1)) * Math.PI * 2 + (device.id.charCodeAt(0) * 0.1);
    const radius = 4 + (Math.abs(device.rssi + 70) / 30) * 4;
    const height = 1.2 + (index % 3) * 1.2 + Math.sin(angle * 2) * 0.5;

    return new THREE.Vector3(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius,
    );
  }

  updateDevices(devices) {
    const present = devices.filter((d) => d.isPresent);
    const activeIds = new Set();

    present.forEach((device, i) => {
      activeIds.add(device.id);
      const color = TYPE_COLORS[device.type] || TYPE_COLORS.wifi;

      if (!this.deviceNodes.has(device.id)) {
        const pos = this._assignPosition(device, i, present.length);
        const node = new DeviceNode(device, color, pos);
        node.mesh.userData.deviceNode = node;
        this.scene.add(node.group);
        this.deviceNodes.set(device.id, node);

        const stream = new DataStream(pos, new THREE.Vector3(0, 2.5, 0), color);
        this.scene.add(stream.points);
        this.dataStreams.push({ id: device.id, stream });
      } else {
        const node = this.deviceNodes.get(device.id);
        node.update(device);
        const targetPos = this._assignPosition(device, i, present.length);
        node.setTargetPosition(targetPos);

        const streamEntry = this.dataStreams.find((s) => s.id === device.id);
        if (streamEntry) {
          streamEntry.stream.updateEndpoints(node.group.position, new THREE.Vector3(0, 2.5, 0));
          streamEntry.stream.setIntensity(device.txRate);
        }
      }
    });

    // Fade out absent devices
    for (const [id, node] of this.deviceNodes) {
      if (!activeIds.has(id)) {
        node.setAbsent();
        if (node.opacity <= 0.01) {
          this.scene.remove(node.group);
          this.deviceNodes.delete(id);
          const streamIdx = this.dataStreams.findIndex((s) => s.id === id);
          if (streamIdx >= 0) {
            this.scene.remove(this.dataStreams[streamIdx].stream.points);
            this.dataStreams.splice(streamIdx, 1);
          }
        }
      }
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = this._clock.getDelta();
    const t = this._clock.elapsedTime;

    this.controls.update();

    // Sensor animation
    this.sensorRing.rotation.z = t * 0.8;
    this.sensorGlow.scale.setScalar(1 + Math.sin(t * 2) * 0.15);
    const scanScale = 1 + (Math.sin(t * 1.5) + 1) * 3;
    this.scanRing.scale.set(scanScale, scanScale, 1);
    this.scanRing.material.opacity = 0.5 * (1 - (scanScale - 1) / 6);

    // Ambient particles drift
    const pos = this.ambientParticles.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3 + 1] += dt * 0.15;
      if (pos.array[i * 3 + 1] > 8) pos.array[i * 3 + 1] = 0;
    }
    pos.needsUpdate = true;

    for (const node of this.deviceNodes.values()) {
      node.animate(dt, t);
    }

    for (const { stream } of this.dataStreams) {
      stream.animate(dt);
    }

    this.composer.render();
  }

  dispose() {
    this.renderer.dispose();
  }
}
