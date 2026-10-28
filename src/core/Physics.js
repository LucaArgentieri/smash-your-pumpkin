const FIXED_STEP = 1 / 60;
const MAX_STEPS = 4;

/**
 * Thin wrapper around Rapier: fixed-step world, body <-> mesh syncing and the
 * static colliders of the cabin (table top and floor).
 */
export class Physics {
  async init() {
    this.RAPIER = await import("@dimforge/rapier3d");
    this.world = new this.RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_STEP;
    this.accumulator = 0;
    this.pausedFor = 0;
    this.links = new Map(); // body handle -> mesh
  }

  addStaticBox({ x = 0, y = 0, z = 0 }, { hx, hy, hz }, { friction = 0.9, restitution = 0.2 } = {}) {
    const body = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
    );
    const collider = this.RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setFriction(friction)
      .setRestitution(restitution);
    this.world.createCollider(collider, body);
    return body;
  }

  /** Dynamic convex body following `mesh` (its geometry must be centred). */
  addDynamicHull(mesh, { restitution = 0.25, friction = 0.8, density = 1 } = {}) {
    const R = this.RAPIER;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
        .setRotation(mesh.quaternion)
        .setAngularDamping(0.4)
        .setLinearDamping(0.05)
        .setCcdEnabled(true),
    );
    const positions = mesh.geometry.attributes.position.array;
    const radius = mesh.geometry.boundingSphere?.radius ?? 0.1;
    const collider =
      (positions.length >= 12 && R.ColliderDesc.convexHull(positions)) ||
      R.ColliderDesc.ball(radius);
    collider.setRestitution(restitution).setFriction(friction).setDensity(density);
    this.world.createCollider(collider, body);
    mesh.userData.body = body;
    this.links.set(body.handle, mesh);
    return body;
  }

  /** Kinematic body driven by `mesh`'s transform (used while a pumpkin spawns). */
  addKinematicHull(mesh) {
    const R = this.RAPIER;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
        .setRotation(mesh.quaternion),
    );
    const collider =
      R.ColliderDesc.convexHull(mesh.geometry.attributes.position.array) ??
      R.ColliderDesc.ball(mesh.geometry.boundingSphere.radius);
    this.world.createCollider(collider.setFriction(0.8), body);
    return body;
  }

  removeBody(body) {
    if (!body) return;
    this.links.delete(body.handle);
    this.world.removeRigidBody(body);
  }

  /** Freezes the simulation briefly: the "hit stop" that sells heavy blows. */
  hitStop(seconds) {
    this.pausedFor = Math.max(this.pausedFor, seconds);
  }

  step(dt) {
    if (this.pausedFor > 0) {
      this.pausedFor -= dt;
      return;
    }
    this.accumulator = Math.min(this.accumulator + dt, FIXED_STEP * MAX_STEPS);
    while (this.accumulator >= FIXED_STEP) {
      this.world.step();
      this.accumulator -= FIXED_STEP;
    }
    for (const mesh of this.links.values()) {
      const body = mesh.userData.body;
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
