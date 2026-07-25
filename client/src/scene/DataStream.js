import * as THREE from 'three';

const MAX_PARTICLES = 60;

export class DataStream {
  constructor(from, to, color) {
    this.from = from.clone();
    this.to = to.clone();
    this.color = color;
    this.intensity = 0.3;
    this.particles = [];
    this._initParticles();
  }

  _initParticles() {
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        t: Math.random(),
        speed: 0.3 + Math.random() * 0.7,
      });
    }

    const mat = new THREE.PointsMaterial({
      color: this.color,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geo, mat);
  }

  updateEndpoints(from, to) {
    this.from.copy(from);
    this.to.copy(to);
  }

  setIntensity(txRate) {
    this.intensity = Math.min(1, txRate / 600);
    this.points.material.opacity = 0.15 + this.intensity * 0.65;
    this.points.material.size = 0.05 + this.intensity * 0.1;
  }

  animate(dt) {
    const pos = this.points.geometry.attributes.position;
    const activeCount = Math.floor(8 + this.intensity * (MAX_PARTICLES - 8));

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (i >= activeCount) {
        pos.array[i * 3] = 0;
        pos.array[i * 3 + 1] = -100;
        pos.array[i * 3 + 2] = 0;
        continue;
      }

      const p = this.particles[i];
      p.t += dt * p.speed * (0.5 + this.intensity);
      if (p.t > 1) p.t -= 1;

      const x = this.from.x + (this.to.x - this.from.x) * p.t;
      const y = this.from.y + (this.to.y - this.from.y) * p.t;
      const z = this.from.z + (this.to.z - this.from.z) * p.t;

      // Slight curve toward center
      const curve = Math.sin(p.t * Math.PI) * 0.5;
      pos.array[i * 3] = x + curve * (Math.random() - 0.5) * 0.3;
      pos.array[i * 3 + 1] = y;
      pos.array[i * 3 + 2] = z + curve * (Math.random() - 0.5) * 0.3;
    }

    pos.needsUpdate = true;
  }
}
