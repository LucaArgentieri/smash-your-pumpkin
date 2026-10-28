import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const cache = new Map();

/**
 * Ribbed, squashed sphere with dimpled poles. UVs are kept from the sphere so
 * the materials can shade ribs and paint the carved face; u = 0.5 faces +Z
 * (towards the player) and the UV seam sits at the back.
 */
export function createBodyGeometry(variant) {
  const key = `body:${variant.name}`;
  if (cache.has(key)) return cache.get(key);

  const geometry = new THREE.SphereGeometry(1, 44, 30);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const v = new THREE.Vector3();
  const seed = variant.name.length * 1.7;

  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const u = uv.getX(i);

    const rib = Math.abs(Math.cos(u * Math.PI * variant.ribs));
    const lumpy = 1 + 0.025 * Math.sin(u * Math.PI * 4 + seed) + 0.02 * Math.sin(v.y * 5 + seed);
    const radial = (1 - variant.ribDepth * Math.pow(1 - rib, 1.6)) * lumpy;

    const poles = Math.sign(v.y) * variant.dimple * smoothstep(0.8, 1, Math.abs(v.y));
    const y = (v.y - poles) * variant.squash;

    position.setXYZ(i, v.x * radial * variant.size, y * variant.size, v.z * radial * variant.size);
  }

  // Sphere u = 0.5 points at +X; turn it to face the camera (+Z).
  geometry.rotateY(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  cache.set(key, geometry);
  return geometry;
}

/** Curved stem, its base at the origin. Not fracturable: it pops off instead. */
export function createStemGeometry(variant) {
  const key = `stem:${variant.name}`;
  if (cache.has(key)) return cache.get(key);

  const { length, bend, radius } = variant.stem;
  const geometry = new THREE.CylinderGeometry(radius * 0.7, radius, length, 7, 6);
  geometry.translate(0, length / 2, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / length;
    position.setX(i, position.getX(i) + bend * t * t);
    // Fluted look: pinch every other vertex around the ring.
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    const flute = 1 - 0.18 * Math.abs(Math.sin(angle * 3.5));
    position.setZ(i, position.getZ(i) * flute);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  cache.set(key, geometry);
  return geometry;
}

/** Top of the body along Y, where the stem gets planted. */
export function stemAnchor(variant) {
  return variant.size * variant.squash * (1 - variant.dimple) * 0.98;
}

/**
 * Loads a modelled pumpkin and merges it into one centred geometry with the
 * attributes the fracture code needs. Scaled so its height matches `size * 2`.
 */
export async function loadModelGeometry(variant) {
  const key = `model:${variant.model}`;
  if (cache.has(key)) return cache.get(key);

  const gltf = await new GLTFLoader().loadAsync(variant.model);
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    let g = child.geometry.clone().applyMatrix4(child.matrixWorld);
    g = g.index ? g : mergeIndex(g);
    for (const name of Object.keys(g.attributes)) {
      if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    parts.push(g);
  });

  const geometry = mergeGeometries(parts);
  geometry.center();
  geometry.computeBoundingBox();
  const height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
  const scale = (variant.size * 2 * variant.squash) / height;
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  cache.set(key, geometry);
  return geometry;
}

function mergeIndex(geometry) {
  const count = geometry.attributes.position.count;
  geometry.setIndex(Array.from({ length: count }, (_, i) => i));
  return geometry;
}

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}
