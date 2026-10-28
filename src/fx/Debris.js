import * as THREE from "three/webgpu";
import { color, instanceIndex, hash, mix, float, vec3 } from "three/tsl";

const GRAVITY = -9.8;
const FLOOR = 0.02;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Cheap CPU particles for the juicy bits: flesh chunks and seeds that bounce on
 * the table, plus embers that float up and glow (they feed the bloom).
 */
export class Debris {
  constructor(scene) {
    this.chunks = this.createPool(scene, 500, new THREE.BoxGeometry(1, 1, 1), this.chunkMaterial(), true);
    this.embers = this.createPool(scene, 260, new THREE.OctahedronGeometry(1, 0), this.emberMaterial(), false);
  }

  chunkMaterial() {
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
    // Mix of flesh tones and pale seeds, picked per instance.
    const pick = hash(instanceIndex);
    const flesh = mix(color(0xff9a24), color(0xe0561a), hash(instanceIndex.add(7)));
    material.colorNode = mix(flesh, color(0xf6e7c1), pick.greaterThan(0.72).select(float(1), float(0)));
    material.emissiveNode = flesh.mul(0.25);
    return material;
  }

  emberMaterial() {
    const material = new THREE.MeshBasicNodeMaterial();
    material.colorNode = mix(color(0xff4a10), color(0xffc457), hash(instanceIndex)).mul(vec3(6));
    return material;
  }

  createPool(scene, count, geometry, material, shadows) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = shadows;
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, ZERO);
    scene.add(mesh);
    return {
      mesh,
      particles: Array.from({ length: count }, () => ({
        alive: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        spin: new THREE.Vector3(),
        size: 0,
        life: 0,
        maxLife: 1,
      })),
      cursor: 0,
    };
  }

  /** Burst at `point`, biased along `direction` (usually away from the camera). */
  burst(point, direction, amount = 20, { force = 1, embers = 0.5 } = {}) {
    for (let i = 0; i < amount; i++) {
      const p = this.spawn(this.chunks);
      p.position.copy(point);
      p.velocity
        .set(Math.random() - 0.5, Math.random() * 0.9 + 0.3, Math.random() - 0.5)
        .normalize()
        .addScaledVector(direction, -0.6)
        .multiplyScalar((1.5 + Math.random() * 3) * force);
      p.size = 0.02 + Math.random() * 0.05;
      p.life = p.maxLife = 1.4 + Math.random() * 1.6;
    }
    const emberCount = Math.round(amount * embers);
    for (let i = 0; i < emberCount; i++) {
      const p = this.spawn(this.embers);
      p.position.copy(point);
      p.velocity
        .set(Math.random() - 0.5, Math.random() * 1.2 + 0.4, Math.random() - 0.5)
        .multiplyScalar((0.8 + Math.random() * 2.2) * force);
      p.size = 0.012 + Math.random() * 0.02;
      p.life = p.maxLife = 0.6 + Math.random() * 1.2;
    }
  }

  spawn(pool) {
    const p = pool.particles[pool.cursor];
    pool.cursor = (pool.cursor + 1) % pool.particles.length;
    p.alive = true;
    p.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
    return p;
  }

  update(dt) {
    this.step(this.chunks, dt, GRAVITY, true);
    this.step(this.embers, dt, 1.2, false);
  }

  step(pool, dt, gravity, bounce) {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    // Slots are never compacted so instanceIndex (and the colour hashed from
    // it) stays stable for a particle's whole life; dead ones collapse to 0.
    pool.particles.forEach((p, i) => {
      if (!p.alive) return;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        pool.mesh.setMatrixAt(i, ZERO);
        return;
      }
      p.velocity.y += gravity * dt;
      if (!bounce) p.velocity.multiplyScalar(1 - dt * 1.5);
      p.position.addScaledVector(p.velocity, dt);
      if (bounce && p.position.y < FLOOR + p.size && Math.abs(p.position.x) < 4.5 && Math.abs(p.position.z) < 2.5) {
        p.position.y = FLOOR + p.size;
        p.velocity.y *= -0.3;
        p.velocity.x *= 0.6;
        p.velocity.z *= 0.6;
        p.spin.multiplyScalar(0.6);
      }
      p.rotation.x += p.spin.x * dt;
      p.rotation.y += p.spin.y * dt;
      p.rotation.z += p.spin.z * dt;
      const fade = Math.min(1, p.life / (p.maxLife * 0.3));
      scale.setScalar(p.size * fade);
      quaternion.setFromEuler(p.rotation);
      matrix.compose(p.position, quaternion, scale);
      pool.mesh.setMatrixAt(i, matrix);
    });
    pool.mesh.instanceMatrix.needsUpdate = true;
  }
}
