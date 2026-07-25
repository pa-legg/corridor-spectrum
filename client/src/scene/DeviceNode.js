import * as THREE from 'three';

export class DeviceNode {
  constructor(device, color, position) {
    this.device = device;
    this.color = color;
    this.opacity = 1;
    this.targetPosition = position.clone();
    this.group = new THREE.Group();
    this.group.position.copy(position);

    const size = this._sizeFromSignal(device);
    const geo = new THREE.IcosahedronGeometry(size, 1);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4,
      transparent: true,
      opacity: 1,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.group.add(this.mesh);

    // Outer glow shell
    const glowGeo = new THREE.SphereGeometry(size * 1.8, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glow = new THREE.Mesh(glowGeo, glowMat);
    this.group.add(this.glow);

    // Visit count ring
    const ringGeo = new THREE.TorusGeometry(size * 2.2, 0.02, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
    });
    this.visitRing = new THREE.Mesh(ringGeo, ringMat);
    this.visitRing.rotation.x = Math.PI / 2;
    this.group.add(this.visitRing);

    // Transmission pulse ring
    const pulseGeo = new THREE.RingGeometry(size * 1.2, size * 1.25, 32);
    const pulseMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
    this.group.add(this.pulseRing);

    this._selected = false;
    this._pulsePhase = Math.random() * Math.PI * 2;
    this._updateVisitRing(device.entryCount ?? device.visitCount);
  }

  _sizeFromSignal(device) {
    const signal = Math.max(0, Math.min(1, (device.rssi + 95) / 60));
    return 0.2 + signal * 0.35;
  }

  _updateVisitRing(visitCount) {
    const scale = 1 + Math.min(visitCount, 20) * 0.08;
    this.visitRing.scale.set(scale, scale, 1);
    this.visitRing.material.opacity = 0.2 + Math.min(visitCount, 15) * 0.04;
  }

  update(device) {
    this.device = device;
    const newSize = this._sizeFromSignal(device);
    this.mesh.scale.setScalar(newSize / 0.35);
    this._updateVisitRing(device.entryCount ?? device.visitCount);

    const intensity = Math.min(1, device.txRate / 500);
    this.mesh.material.emissiveIntensity = 0.4 + intensity * 0.8;
    this.glow.material.opacity = 0.08 + intensity * 0.2;
  }

  setTargetPosition(pos) {
    this.targetPosition.copy(pos);
  }

  setSelected(selected) {
    this._selected = selected;
    if (selected) {
      this.mesh.material.emissiveIntensity = 1.2;
    }
  }

  setAbsent() {
    this.opacity = Math.max(0, this.opacity - 0.03);
    this.mesh.material.opacity = this.opacity;
    this.glow.material.opacity = this.opacity * 0.12;
  }

  animate(dt, t) {
    // Smooth position lerp
    this.group.position.lerp(this.targetPosition, 0.04);

    // Idle float
    this.group.position.y += Math.sin(t * 1.5 + this._pulsePhase) * 0.002;

    // Rotation
    this.mesh.rotation.y += dt * 0.5;
    this.mesh.rotation.x += dt * 0.2;

    // Transmission pulse
    const txNorm = Math.min(1, this.device.txRate / 400);
    const pulse = (Math.sin(t * (3 + txNorm * 5) + this._pulsePhase) + 1) / 2;
    const pulseScale = 1 + pulse * txNorm * 0.8;
    this.pulseRing.scale.set(pulseScale, pulseScale, 1);
    this.pulseRing.material.opacity = 0.1 + pulse * txNorm * 0.5;
    this.pulseRing.lookAt(0, 2.5, 0);

    // Visit ring slow spin
    this.visitRing.rotation.z = t * 0.3;

    if (this._selected) {
      this.glow.scale.setScalar(1.3 + Math.sin(t * 4) * 0.15);
    }
  }
}
