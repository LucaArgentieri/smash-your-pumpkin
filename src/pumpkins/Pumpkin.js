import * as THREE from "three/webgpu";
import { DestructibleMesh } from "@dgreenheck/three-pinata";
import { tweens, ease } from "../core/Tween.js";
import { createBodyGeometry, createStemGeometry, loadModelGeometry, stemAnchor } from "./geometry.js";
import { getPumpkinMaterials } from "./materials.js";

const PRE_FRACTURE_PIECES = 18;
const HP = 3;

/**
 * One pumpkin on the table. It drops in burning into existence, takes a few
 * hits (depending on the tool) and then shatters into pre-computed shards.
 */
export class Pumpkin {
  static async create(variant, ctx) {
    const geometry = variant.model ? await loadModelGeometry(variant) : createBodyGeometry(variant);
    return new Pumpkin(variant, geometry, ctx);
  }

  constructor(variant, geometry, { scene, physics, pool }) {
    this.variant = variant;
    this.scene = scene;
    this.physics = physics;
    this.hp = HP;
    this.state = "spawning";

    const materials = getPumpkinMaterials(variant);
    this.materials = materials;
    this.mesh = new DestructibleMesh(geometry, materials.outer, materials.inner);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData = { appear: 0, hit: 0, generation: 0, shared: true, pumpkin: this };

    if (!variant.model) {
      this.stem = new THREE.Mesh(createStemGeometry(variant), materials.stem);
      this.stem.position.y = stemAnchor(variant);
      this.stem.rotation.y = Math.random() * Math.PI * 2;
      this.stem.castShadow = true;
      this.stem.userData = this.mesh.userData; // burns in together with the body
      this.mesh.add(this.stem);
    }

    this.restY = -geometry.boundingBox.min.y;

    // Shatter pattern is computed in a worker as soon as the pumpkin exists,
    // weighted towards the side facing the player where most blows land.
    this.shards = pool.fracture(geometry, {
      fragmentCount: PRE_FRACTURE_PIECES,
      impactPoint: new THREE.Vector3(0, 0, variant.size * 0.9),
      impactRadius: variant.size * 0.9,
    });
    this.shards.catch(() => {});
  }

  spawn(position) {
    const mesh = this.mesh;
    mesh.position.set(position.x, this.restY + 2.6, position.z);
    mesh.rotation.y = (Math.random() - 0.5) * 0.5;
    this.scene.add(mesh);
    mesh.updateMatrixWorld();
    this.body = this.physics.addKinematicHull(mesh);

    tweens.to(mesh.userData, "appear", 1, 1.1, { easing: ease.inOutQuad });
    tweens.to(mesh.position, "y", this.restY, 0.85, {
      easing: ease.outBounce,
      onComplete: () => {
        if (this.state === "spawning") this.state = "idle";
      },
    });
  }

  get hittable() {
    return this.state === "idle" || (this.state === "spawning" && this.mesh.userData.appear > 0.6);
  }

  /** Non-lethal blow: squash and stretch, flash. */
  wobble() {
    const s = this.mesh.scale;
    s.set(1.12, 0.84, 1.12);
    tweens.to(s, "x", 1, 0.35, { easing: ease.outBack });
    tweens.to(s, "y", 1, 0.35, { easing: ease.outBack });
    tweens.to(s, "z", 1, 0.35, { easing: ease.outBack });
  }

  flash(amount = 1) {
    this.mesh.userData.hit = amount;
  }

  update(dt) {
    const data = this.mesh.userData;
    data.hit = Math.max(0, data.hit - dt * 6);
    if (this.body && this.state !== "broken") {
      const { position, quaternion } = this.mesh;
      this.body.setNextKinematicTranslation(position);
      this.body.setNextKinematicRotation(quaternion);
    }
  }

  /** Detaches the stem so it can fly off as its own physics piece. */
  takeStem() {
    if (!this.stem) return null;
    const stem = this.stem;
    this.mesh.updateMatrixWorld();
    stem.getWorldPosition(stem.position);
    stem.getWorldQuaternion(stem.quaternion);
    this.mesh.remove(stem);
    stem.userData = { appear: 1, hit: 0, generation: 99, shared: true };
    this.stem = null;
    return stem;
  }

  /** Removes the intact pumpkin (after it shattered, or at round reset). */
  dispose() {
    this.state = "broken";
    this.physics.removeBody(this.body);
    this.body = null;
    this.scene.remove(this.mesh);
    tweens.kill(this.mesh.userData, "appear");
    tweens.kill(this.mesh.position, "y");
  }
}
