import { DestructibleMesh } from "@dgreenheck/three-pinata";
import * as THREE from "three";
import { Fracturable } from "./Fracturable.js";

export class Cube extends Fracturable {
  constructor(scene, options = {}) {
    super(scene, options);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const outerMaterial = new THREE.MeshBasicMaterial();
    const innerMaterial = new THREE.MeshBasicMaterial({ color: 0xff6b6b });

    this.setMesh(new DestructibleMesh(geometry, outerMaterial, innerMaterial));
  }
}
