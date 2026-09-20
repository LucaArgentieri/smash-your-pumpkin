import * as THREE from "three";
import { FractureOptions } from "@dgreenheck/three-pinata";

const MAX_GENERATION = 3;
const FRAGMENT_COUNTS = [32, 16, 8, 4];

export class Fracturable {
  constructor(
    scene,
    {
      maxGeneration = MAX_GENERATION,
      fragmentCounts = FRAGMENT_COUNTS,
      position = new THREE.Vector3(),
    } = {},
  ) {
    this.scene = scene;
    this.maxGeneration = maxGeneration;
    this.fragmentCounts = fragmentCounts;
    this.position = position;
    this.fragments = [];
    this.mesh = null;
    this.RAPIER = null;
    this.world = null;
  }

  setMesh(mesh) {
    this.mesh = mesh;
    this.mesh.position.copy(this.position);
    this.mesh.castShadow = true;
    this.mesh.userData.generation = 0;
    this.mesh.userData.owner = this;
    this.scene.add(this.mesh);
  }

  attachPhysics(RAPIER, world) {
    this.RAPIER = RAPIER;
    this.world = world;
  }

  getRaycastTargets() {
    if (!this.mesh) return [];
    return this.mesh.visible ? [this.mesh] : this.fragments;
  }

  fractureAt(target, worldPoint) {
    const generation = target.userData.generation ?? 0;
    if (generation >= this.maxGeneration) return;

    const localPoint = target.worldToLocal(worldPoint.clone());
    const fragmentCount =
      this.fragmentCounts[generation] ?? this.fragmentCounts.at(-1);

    const options = new FractureOptions({
      fractureMethod: "voronoi",
      fragmentCount,
      voronoiOptions: {
        mode: "3D",
        impactPoint: localPoint,
        impactRadius: 0.5,
      },
    });

    const newFragments = target.fracture(options, (fragment) => {
      fragment.userData.generation = generation + 1;
      fragment.userData.owner = this;
      this.attachRigidBody(fragment, target);
    });

    newFragments.forEach((fragment) => {
      this.scene.add(fragment);
      this.fragments.push(fragment);
    });

    if (target === this.mesh) {
      this.mesh.visible = false;
    } else {
      const index = this.fragments.indexOf(target);
      if (index !== -1) this.fragments.splice(index, 1);
      this.scene.remove(target);
      this.world.removeRigidBody(target.userData.rigidBody);
      target.geometry.dispose();
    }
  }

  attachRigidBody(mesh, sourceObject) {
    const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
      .setRotation(mesh.quaternion);
    const body = this.world.createRigidBody(bodyDesc);

    const verts = mesh.geometry.attributes.position.array;
    const colliderDesc =
      verts.length / 3 >= 4
        ? (this.RAPIER.ColliderDesc.convexHull(verts) ??
          this.RAPIER.ColliderDesc.ball(mesh.geometry.boundingSphere.radius))
        : this.RAPIER.ColliderDesc.ball(mesh.geometry.boundingSphere.radius);
    colliderDesc.setRestitution(0.3);
    this.world.createCollider(colliderDesc, body);
    mesh.userData.rigidBody = body;

    const center = sourceObject.getWorldPosition(new THREE.Vector3());
    const dir = mesh.position.clone().sub(center).normalize();
    dir.y += 0.5;
    dir.x += (Math.random() - 0.5) * 0.3;
    dir.z += (Math.random() - 0.5) * 0.3;
    dir.normalize();

    const mass = body.mass();
    body.applyImpulse(
      { x: dir.x * mass * 2, y: dir.y * mass * 2, z: dir.z * mass * 2 },
      true,
    );
  }

  sync() {
    this.fragments.forEach((fragment) => {
      const body = fragment.userData.rigidBody;
      if (!body) return;
      const t = body.translation();
      const r = body.rotation();
      fragment.position.set(t.x, t.y, t.z);
      fragment.quaternion.set(r.x, r.y, r.z, r.w);
    });
  }
}
