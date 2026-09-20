import { DestructibleMesh } from "@dgreenheck/three-pinata";
import * as THREE from "three";
import { BufferGeometryUtils, GLTFLoader } from "three/examples/jsm/Addons.js";
import { Fracturable } from "./Fracturable.js";

const MODEL_URL = "/model/scene.gltf";

export class Model extends Fracturable {
  constructor(scene, options = {}) {
    super(scene, options);
    this.load();
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    gltf.scene.updateMatrixWorld(true);

    const geometries = [];
    let material = null;
    gltf.scene.traverse((child) => {
      if (!child.isMesh) return;
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);
      geometries.push(geometry);
      material = material ?? child.material;
    });

    const geometry = BufferGeometryUtils.mergeGeometries(geometries);
    geometry.center();

    const innerMaterial = new THREE.MeshBasicMaterial({ color: 0xff6b6b });
    this.setMesh(new DestructibleMesh(geometry, material, innerMaterial));

  }
}
