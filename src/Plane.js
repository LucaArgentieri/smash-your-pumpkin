import * as THREE from "three";

export class Plane {
  constructor(RAPIER, world, scene, { y = -3, size = 40, color = 0xff0000 } = {}) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color, side: THREE.FrontSide, opacity: 0.2 }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, y, 0);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, y, 0),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(size / 2, 0.1, size / 2), body);
  }
}
