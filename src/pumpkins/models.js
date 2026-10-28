import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Above this the runtime fracture gets noticeably slower on weak machines.
const TRIANGLE_BUDGET = 6000;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

/**
 * Loads a pumpkin GLB and turns it into what the game needs:
 * - `body`: one merged, centred, indexed geometry (position/normal/uv only),
 *   scaled so its horizontal radius equals `variant.size`;
 * - `stem`: optional geometry from meshes named "stem", pivoted at its base so
 *   it can pop off as its own piece;
 * - `look` / `stemLook`: colour, maps and roughness taken from the GLB materials.
 */
export function loadPumpkinModel(variant) {
  if (!cache.has(variant.model)) cache.set(variant.model, load(variant));
  return cache.get(variant.model);
}

async function load(variant) {
  // Relative to the deploy base, so the game works from a sub-path (GitHub Pages).
  const gltf = await loader.loadAsync(import.meta.env.BASE_URL + variant.model);
  gltf.scene.rotation.y = variant.rotationY ?? 0;
  gltf.scene.updateMatrixWorld(true);

  const body = [];
  const stem = [];
  let look = null;
  let stemLook = null;
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    const isStem = /stem/i.test(child.name) || /stem/i.test(child.parent?.name ?? "");
    (isStem ? stem : body).push(clean(child.geometry.clone().applyMatrix4(child.matrixWorld)));
    const info = describe(child.material);
    if (isStem) stemLook ??= info;
    else look ??= info;
  });

  const bodyGeometry = mergeGeometries(body);
  bodyGeometry.computeBoundingBox();
  const box = bodyGeometry.boundingBox;
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
  const scale = variant.size / radius;
  const normalise = (g) => g.translate(-center.x, -center.y, -center.z).scale(scale, scale, scale);

  normalise(bodyGeometry);
  bodyGeometry.computeBoundingBox();
  bodyGeometry.computeBoundingSphere();

  let stemPart = null;
  if (stem.length) {
    const geometry = normalise(mergeGeometries(stem));
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    const pivot = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
    geometry.translate(-pivot.x, -pivot.y, -pivot.z);
    geometry.computeBoundingSphere();
    stemPart = { geometry, pivot };
  }

  const triangles = bodyGeometry.index.count / 3;
  if (triangles > TRIANGLE_BUDGET) {
    console.warn(
      `[pumpkins] ${variant.model} has ${triangles} triangles (budget ${TRIANGLE_BUDGET}); ` +
        "fracturing will be slow on weak machines. See README > Pumpkin models.",
    );
  }

  return { body: bodyGeometry, stem: stemPart, look, stemLook: stemLook ?? look };
}

/** Keeps only what the fracture code understands, indexed. */
function clean(geometry) {
  for (const name of Object.keys(geometry.attributes)) {
    if (!["position", "normal", "uv"].includes(name)) geometry.deleteAttribute(name);
  }
  if (!geometry.index) {
    const count = geometry.attributes.position.count;
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(count).map((_, i) => i), 1));
  }
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  if (!geometry.attributes.uv) {
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
  }
  geometry.clearGroups();
  return geometry;
}

function describe(material) {
  const m = Array.isArray(material) ? material[0] : material;
  return {
    color: m.color?.clone() ?? new THREE.Color(1, 1, 1),
    map: m.map ?? null,
    emissive: m.emissive?.clone().multiplyScalar(m.emissiveIntensity ?? 1) ?? new THREE.Color(0, 0, 0),
    emissiveMap: m.emissiveMap ?? null,
    roughness: m.roughness ?? 0.6,
  };
}
