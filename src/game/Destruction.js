import * as THREE from "three/webgpu";
import { DestructibleMesh } from "@dgreenheck/three-pinata";
import { GAME } from "../config.js";
import { live } from "../core/Quality.js";
import { tweens, ease } from "../core/Tween.js";

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Owns every shard on the table: turns hits into fractures, slices or dust,
 * gives the pieces physics and burns old ones away.
 */
export class Destruction {
  constructor({ scene, physics, pool, debris }) {
    this.scene = scene;
    this.physics = physics;
    this.pool = pool;
    this.debris = debris;
    this.fragments = [];
  }

  get shardCount() {
    return this.fragments.length;
  }

  targets(pumpkin) {
    const list = this.fragments.filter((f) => !f.userData.pending && !f.userData.decaying);
    if (pumpkin?.hittable) list.push(pumpkin.mesh);
    return list;
  }

  /**
   * Resolves with what the blow did: `{ type: "crack" | "break" | "pieces" | "dust" | "none", pieces }`.
   */
  async hit(object, point, direction, tool) {
    const pumpkin = object.userData.pumpkin;
    if (pumpkin) return this.hitPumpkin(pumpkin, point, direction, tool);
    return this.hitFragment(object, point, direction, tool);
  }

  async hitPumpkin(pumpkin, point, direction, tool) {
    pumpkin.flash(1);
    this.debris.burst(point, direction, Math.round(tool.debris * 0.5), { force: 0.7 });
    pumpkin.hp -= tool.damage;

    if (pumpkin.hp > 0) {
      pumpkin.wobble();
      return { type: "crack", pieces: 0 };
    }

    pumpkin.state = "breaking";
    pumpkin.mesh.scale.setScalar(1);
    tweens.kill(pumpkin.mesh.scale, "x");
    tweens.kill(pumpkin.mesh.scale, "y");
    tweens.kill(pumpkin.mesh.scale, "z");
    this.debris.burst(point, direction, tool.debris, { force: 1.2, embers: 0.8 });

    let shards = null;
    if (tool.method !== "slice") {
      try {
        shards = await pumpkin.shards;
      } catch {
        shards = null;
      }
    }

    // Free the spot before the shards appear so they don't spawn inside the
    // pumpkin's own collider.
    const stem = pumpkin.takeStem();
    pumpkin.mesh.updateMatrixWorld();
    pumpkin.dispose();

    let pieces = [];
    try {
      if (tool.method === "slice") pieces = this.slice(pumpkin.mesh, point, direction, tool);
      // A cut that missed or failed still has to break the pumpkin, which is
      // already off the table: fall back to its precomputed shards.
      if (pieces.length === 0) {
        shards ??= await pumpkin.shards.catch(() => null);
        if (shards) pieces = this.spawnPieces(pumpkin.mesh, shards, point, direction, tool);
      }
    } catch (error) {
      console.warn("[destruction] pumpkin break failed", error);
    }

    if (stem) {
      this.scene.add(stem);
      this.addFragment(stem);
      stem.userData.body.applyImpulse(
        { x: (Math.random() - 0.5) * 0.4, y: 1.4, z: (Math.random() - 0.5) * 0.4 },
        true,
      );
      stem.userData.body.applyTorqueImpulse({ x: Math.random() * 0.02, y: 0, z: Math.random() * 0.02 }, true);
    }
    return { type: "break", pieces: pieces.length };
  }

  async hitFragment(fragment, point, direction, tool) {
    const data = fragment.userData;
    const radius = fragment.geometry.boundingSphere.radius;
    const body = data.body;

    // The fist grinds bigger shards to dust than the other weapons.
    if (radius < (tool.dustRadius ?? GAME.dustRadius) || data.generation >= 5) {
      this.debris.burst(point, direction, 14, { force: 0.9, embers: 1.2 });
      this.removeFragment(fragment);
      return { type: "dust", pieces: 0 };
    }

    data.hit = 1;
    this.debris.burst(point, direction, Math.round(tool.debris * 0.4), { force: 0.8 });
    body?.applyImpulseAtPoint(
      _v.copy(direction).multiplyScalar(body.mass() * tool.impulse * 0.5),
      point,
      true,
    );

    if (tool.method === "slice") {
      const pieces = this.slice(fragment, point, direction, tool);
      return { type: "pieces", pieces: pieces.length };
    }

    data.pending = true;
    const local = fragment.worldToLocal(point.clone());
    let shards;
    try {
      shards = await this.pool.fracture(fragment.geometry, {
        fragmentCount: Math.max(2, Math.round(tool.fragmentCount * live.pieces)),
        impactPoint: local,
        impactRadius: radius * 0.6,
      });
    } catch {
      shards = null;
    }
    data.pending = false;
    // The shard may have burnt away or fallen off while the worker was busy.
    if (!shards || !this.fragments.includes(fragment)) return { type: "none", pieces: 0 };

    fragment.updateMatrixWorld();
    const pieces = this.spawnPieces(fragment, shards, point, direction, tool);
    return { type: "pieces", pieces: pieces.length };
  }

  /** Chops `target` with a mostly vertical plane through the hit point. */
  slice(target, point, direction, tool) {
    target.updateMatrixWorld();
    const tilt = new THREE.Vector3((Math.random() - 0.5) * 0.6, 1, 0).normalize();
    const normal = new THREE.Vector3().crossVectors(direction, tilt).normalize();
    const inverse = target.getWorldQuaternion(_q).invert();
    const localNormal = normal.clone().applyQuaternion(inverse);
    const localOrigin = target.worldToLocal(point.clone());

    let raw;
    try {
      raw = target.slice(localNormal, localOrigin);
    } catch (error) {
      // Degenerate geometry can make the slicer throw; treat it as a miss.
      console.warn("[destruction] slice failed", error);
      return [];
    }
    if (raw.length < 2) {
      // Plane missed the mesh: treat it as a glancing blow.
      return [];
    }
    const shards = raw.map((piece) => {
      const geometry = piece.geometry;
      geometry.computeBoundingBox();
      const center = geometry.boundingBox.getCenter(new THREE.Vector3());
      geometry.translate(-center.x, -center.y, -center.z);
      geometry.computeBoundingSphere();
      return { geometry, center };
    });
    const pieces = this.spawnPieces(target, shards, point, direction, tool);
    // Push the halves apart along the cut.
    pieces.forEach((piece) => {
      const side = Math.sign(_v.copy(piece.position).sub(point).dot(normal)) || 1;
      const body = piece.userData.body;
      body.applyImpulse(_v.copy(normal).multiplyScalar(side * body.mass() * tool.impulse * 0.8), true);
    });
    return pieces;
  }

  /** Replaces `source` with physics shards built from `{ geometry, center }` (source-local). */
  spawnPieces(source, shards, point, direction, tool) {
    const sourceBody = source.userData.body;
    const linvel = sourceBody?.linvel() ?? { x: 0, y: 0, z: 0 };
    const angvel = sourceBody?.angvel() ?? { x: 0, y: 0, z: 0 };
    const { outer, inner } = source.userData.pumpkin?.materials ?? source.userData.materials;
    const generation = (source.userData.generation ?? 0) + 1;
    const quaternion = source.getWorldQuaternion(new THREE.Quaternion());

    const pieces = shards.map(({ geometry, center }) => {
      const mesh = new DestructibleMesh(geometry, outer, inner);
      mesh.material = [outer, inner];
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.copy(center).applyMatrix4(source.matrixWorld);
      mesh.quaternion.copy(quaternion);
      mesh.userData = { appear: 1, hit: 0.6, generation, materials: { outer, inner } };
      this.scene.add(mesh);
      this.addFragment(mesh);

      const body = mesh.userData.body;
      body.setLinvel(linvel, true);
      body.setAngvel(angvel, true);
      // Blast away from the impact, along the swing, with a little lift.
      const away = _v.copy(mesh.position).sub(point);
      const falloff = 1 / (1 + away.length() * 2.5);
      away.normalize().addScaledVector(direction, 0.7).addScaledVector(UP, 0.45).normalize();
      body.applyImpulse(away.multiplyScalar(body.mass() * tool.impulse * (0.6 + falloff * 2)), true);
      return mesh;
    });

    this.removeFragment(source, { keepMesh: Boolean(source.userData.pumpkin) });
    return pieces;
  }

  addFragment(mesh) {
    this.physics.addDynamicHull(mesh);
    mesh.userData.age = 0;
    this.fragments.push(mesh);
  }

  removeFragment(mesh, { keepMesh = false } = {}) {
    const index = this.fragments.indexOf(mesh);
    if (index !== -1) this.fragments.splice(index, 1);
    tweens.kill(mesh.userData, "appear");
    if (mesh.userData.body) {
      this.physics.removeBody(mesh.userData.body);
      mesh.userData.body = null;
    }
    if (keepMesh) return;
    this.scene.remove(mesh);
    if (!mesh.userData.shared) mesh.geometry.dispose();
  }

  /** Burns a shard out of existence, then removes it. */
  decay(mesh, duration = 0.9) {
    if (mesh.userData.decaying) return;
    mesh.userData.decaying = true;
    tweens.to(mesh.userData, "appear", 0, duration, {
      easing: ease.inQuad,
      onComplete: () => this.removeFragment(mesh),
    });
  }

  clear() {
    for (const mesh of [...this.fragments]) this.decay(mesh, 0.5 + Math.random() * 0.5);
  }

  update(dt) {
    // Oldest shards first: burn away whatever exceeds this tier's budget.
    let excess = -live.maxFragments;
    for (const f of this.fragments) if (!f.userData.decaying) excess++;
    for (let i = 0; excess > 0 && i < this.fragments.length; i++) {
      if (this.fragments[i].userData.decaying) continue;
      this.decay(this.fragments[i], 0.5);
      excess--;
    }

    // Backwards, because removeFragment splices.
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const mesh = this.fragments[i];
      const data = mesh.userData;
      data.age += dt;
      data.hit = Math.max(0, data.hit - dt * 5);
      if (mesh.position.y < -6) this.removeFragment(mesh);
      else if (data.age > GAME.fragmentLife) this.decay(mesh);
    }
  }
}
