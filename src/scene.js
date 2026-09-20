import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { Cube } from "./Cube.js";
import { Plane } from "./Plane.js";

export class scene {
  constructor() {
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.physicsReady = false;
    this.RAPIER = null;
    this.world = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f0);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.z = 5;

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    this.cube = new Cube(this.scene, { position: new THREE.Vector3(-1.2, 0, 0) });

    this.fracturables = [this.cube];

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.setAnimationLoop(() => this.animate());
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    this.initPhysics();

    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("mousemove", (event) => this.onMouseMove(event));
    window.addEventListener("click", (event) => this.onClick(event));
  }

  async initPhysics() {
    this.RAPIER = await import("@dimforge/rapier3d");
    this.world = new this.RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.plane = new Plane(this.RAPIER, this.world, this.scene);
    this.fracturables.forEach((fracturable) =>
      fracturable.attachPhysics(this.RAPIER, this.world),
    );
    this.physicsReady = true;
  }

  onMouseMove(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  onClick(event) {
    if (!this.physicsReady) return;

    this.onMouseMove(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const targets = this.fracturables.flatMap((fracturable) =>
      fracturable.getRaycastTargets(),
    );
    const intersects = this.raycaster.intersectObjects(targets, false);
    if (intersects.length === 0) return;

    const hit = intersects[0];
    hit.object.userData.owner.fractureAt(hit.object, hit.point);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.render(this.scene, this.camera);
  }

  animate() {
    if (this.physicsReady) {
      this.world.step();
      this.fracturables.forEach((fracturable) => fracturable.sync());
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
