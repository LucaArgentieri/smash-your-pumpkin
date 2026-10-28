// Generates the lightweight placeholder pumpkins in public/pumpkins/*.glb.
// Each file mirrors what a modelled pumpkin should look like to the game:
// a "body" mesh with a base-colour texture (and optionally an emissive one for
// the carved face) plus an optional separate "stem" mesh that pops off.
//
//   node scripts/build-placeholders.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import * as THREE from "three";

const OUT = new URL("../public/pumpkins/", import.meta.url);
const TEX_W = 256;
const TEX_H = 128;

const SHAPES = [
  { id: "jack", size: 0.95, squash: 0.8, ribs: 10, ribDepth: 0.12, dimple: 0.18, color: "#ff7419", shade: "#a8330a", glow: "#ffb347", face: "grin", stem: { length: 0.42, bend: 0.12, radius: 0.09 } },
  { id: "bertha", size: 1.15, squash: 0.62, ribs: 12, ribDepth: 0.1, dimple: 0.2, color: "#f2620f", shade: "#8e2606", glow: "#ff9a3c", face: null, stem: { length: 0.3, bend: 0.05, radius: 0.12 } },
  { id: "spindle", size: 0.78, squash: 1.08, ribs: 8, ribDepth: 0.14, dimple: 0.12, color: "#ff9a2e", shade: "#b44a0c", glow: "#ffd36a", face: "scared", stem: { length: 0.55, bend: 0.25, radius: 0.07 } },
  { id: "pale", size: 0.9, squash: 0.74, ribs: 10, ribDepth: 0.11, dimple: 0.16, color: "#e6d8bd", shade: "#7d6a8e", glow: "#b46bff", face: "angry", stem: { length: 0.36, bend: 0.15, radius: 0.08 } },
  { id: "rotten", size: 0.88, squash: 0.7, ribs: 9, ribDepth: 0.15, dimple: 0.2, color: "#b5711f", shade: "#3f4a14", glow: "#c6ff5a", face: "sad", stem: { length: 0.28, bend: 0.3, radius: 0.08 } },
  { id: "pip", size: 0.6, squash: 0.85, ribs: 8, ribDepth: 0.12, dimple: 0.15, color: "#ffad3a", shade: "#c25a10", glow: "#ffe08a", face: "grin", stem: { length: 0.3, bend: 0.1, radius: 0.06 } },
];

// --- Geometry -------------------------------------------------------------------

function bodyGeometry(s) {
  const geometry = new THREE.SphereGeometry(1, 36, 24);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const v = new THREE.Vector3();
  const seed = s.id.length * 1.7;
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const u = uv.getX(i);
    const rib = Math.abs(Math.cos(u * Math.PI * s.ribs));
    const lumpy = 1 + 0.025 * Math.sin(u * Math.PI * 4 + seed) + 0.02 * Math.sin(v.y * 5 + seed);
    const radial = (1 - s.ribDepth * Math.pow(1 - rib, 1.6)) * lumpy;
    const poles = Math.sign(v.y) * s.dimple * smoothstep(0.8, 1, Math.abs(v.y));
    const y = (v.y - poles) * s.squash;
    position.setXYZ(i, v.x * radial * s.size, y * s.size, v.z * radial * s.size);
  }
  // Sphere u = 0.5 points at +X; turn the face (painted at u = 0.5) to +Z.
  geometry.rotateY(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function stemGeometry(s) {
  const { length, bend, radius } = s.stem;
  const geometry = new THREE.CylinderGeometry(radius * 0.7, radius, length, 7, 5);
  geometry.translate(0, length / 2, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / length;
    position.setX(i, position.getX(i) + bend * t * t);
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    position.setZ(i, position.getZ(i) * (1 - 0.18 * Math.abs(Math.sin(angle * 3.5))));
  }
  geometry.computeVertexNormals();
  return geometry;
}

// --- Textures -------------------------------------------------------------------

function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x, y, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = hash3(xi, yi, z), b = hash3(xi + 1, yi, z);
  const c = hash3(xi, yi + 1, z), d = hash3(xi + 1, yi + 1, z);
  return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}

function fbm(x, y, z) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 3; i++) {
    sum += valueNoise(x * f, y * f, z) * amp;
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}

const hex = (h) => new THREE.Color(h);

// Faces as polygons in a 1024 x 512 UV canvas (x = u, y = 1 - v), centred on u = 0.5.
const circle = (cx, cy, rx, ry = rx, n = 18) =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]);
const tri = (x, y, w, h, tilt) =>
  [[-w / 2, h / 2], [0, -h / 2], [w / 2, h / 2]].map(([px, py]) => [
    x + px * Math.cos(tilt) - py * Math.sin(tilt),
    y + px * Math.sin(tilt) + py * Math.cos(tilt),
  ]);
function jagged(x0, x1, y, h, teeth, smile) {
  const mid = (x0 + x1) / 2;
  const curve = (x) => (smile ? 1 : -0.4) * 40 * (1 - Math.pow((x - mid) / ((x1 - x0) / 2), 2));
  const step = (x1 - x0) / teeth;
  const top = [], bottom = [];
  for (let i = 0; i <= teeth; i++) {
    const x = x0 + i * step;
    top.push([x, y - 10 + curve(x) * 0.4 + (i % 2 ? 18 : 0)]);
    bottom.push([x, y + h * 0.5 + curve(x) + (i % 2 ? 0 : -16)]);
  }
  return [...top, ...bottom.reverse()];
}
function frown() {
  const pts = [];
  for (let i = 0; i <= 12; i++) pts.push([420 + i * 15.33, 330 - 75 * Math.sin((i / 12) * Math.PI) * 0.6]);
  for (let i = 12; i >= 0; i--) pts.push([420 + i * 15.33, 330 - 40 * Math.sin((i / 12) * Math.PI) * 0.6]);
  return pts;
}

const FACES = {
  grin: [tri(430, 190, 70, 64, -0.15), tri(594, 190, 70, 64, 0.15), tri(512, 255, 34, 34, 0), jagged(380, 644, 290, 70, 6, true)],
  scared: [circle(440, 190, 36), circle(584, 190, 36), circle(512, 320, 38, 54)],
  angry: [tri(432, 200, 78, 52, 0.45), tri(592, 200, 78, 52, -0.45), jagged(400, 624, 300, 46, 8, false)],
  sad: [tri(440, 196, 56, 60, 0.3), tri(584, 196, 56, 60, -0.3), frown()],
};

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function faceMask(face, px, py) {
  if (!face) return 0;
  let covered = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const x = ((px + (sx + 0.5) / 3) / TEX_W) * 1024;
      // +25: sit the face a little above the equator, where it reads best.
      const y = ((py + (sy + 0.5) / 3) / TEX_H) * 512 + 25;
      if (FACES[face].some((poly) => inside(poly, x, y))) covered++;
    }
  }
  return covered / 9;
}

function paintTextures(s) {
  const base = hex(s.color), shade = hex(s.shade), glow = hex(s.glow);
  const albedo = new Uint8Array(TEX_W * TEX_H * 3);
  const emissive = new Uint8Array(TEX_W * TEX_H * 3);
  const c = new THREE.Color();
  const seed = s.id.length * 3.1;
  for (let py = 0; py < TEX_H; py++) {
    for (let px = 0; px < TEX_W; px++) {
      const u = (px + 0.5) / TEX_W;
      const v = 1 - (py + 0.5) / TEX_H;
      const rib = Math.abs(Math.cos(u * Math.PI * s.ribs));
      const groove = Math.pow(1 - rib, 3);
      const blotch = fbm(u * 22, v * 9, seed);
      const pole = smoothstep(0.3, 0.5, Math.abs(v - 0.5));
      const streak = valueNoise(u * 150, v * 2.5, seed) * 0.1 + 1;
      c.copy(base).lerp(shade, clamp01(groove * 0.85 + pole * 0.55 + blotch * 0.3)).multiplyScalar(streak);
      const mask = faceMask(s.face, px, py);
      c.lerp(glow.clone().multiplyScalar(0.5), mask);
      // glTF colour textures are sRGB-encoded.
      c.convertLinearToSRGB();
      const i = (py * TEX_W + px) * 3;
      albedo[i] = to8(c.r);
      albedo[i + 1] = to8(c.g);
      albedo[i + 2] = to8(c.b);
      const g = glow.clone().multiplyScalar(mask).convertLinearToSRGB();
      emissive[i] = to8(g.r);
      emissive[i + 1] = to8(g.g);
      emissive[i + 2] = to8(g.b);
    }
  }
  return { albedo: png(albedo), emissive: s.face ? png(emissive) : null };
}

// --- PNG + GLB writers ------------------------------------------------------------

function png(rgb) {
  const raw = Buffer.alloc((TEX_W * 3 + 1) * TEX_H);
  for (let y = 0; y < TEX_H; y++) {
    raw[y * (TEX_W * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * TEX_W * 3, TEX_W * 3).copy(raw, y * (TEX_W * 3 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(TEX_W, 0);
  ihdr.writeUInt32BE(TEX_H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// three.js UVs start bottom-left, glTF UVs top-left (GLTFLoader flips back).
function gltfUVs(uv) {
  const out = new Float32Array(uv);
  for (let i = 1; i < out.length; i += 2) out[i] = 1 - out[i];
  return out;
}

function writeGLB(parts) {
  const json = {
    asset: { version: "2.0", generator: "smash-your-pumpkin placeholders" },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    textures: [],
    images: [],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }],
    accessors: [],
    bufferViews: [],
    buffers: [{ byteLength: 0 }],
  };
  const chunks = [];
  let offset = 0;
  const addView = (buffer, target) => {
    const padded = Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4)]);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length, ...(target && { target }) });
    chunks.push(padded);
    offset += padded.length;
    return json.bufferViews.length - 1;
  };
  const addAccessor = (array, type, componentType, target, minmax) => {
    const view = addView(Buffer.from(array.buffer, array.byteOffset, array.byteLength), target);
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
    json.accessors.push({ bufferView: view, componentType, count: array.length / size, type, ...minmax });
    return json.accessors.length - 1;
  };
  const addTexture = (pngBytes) => {
    json.images.push({ bufferView: addView(pngBytes), mimeType: "image/png" });
    json.textures.push({ sampler: 0, source: json.images.length - 1 });
    return json.textures.length - 1;
  };

  for (const part of parts) {
    const g = part.geometry;
    const position = new Float32Array(g.attributes.position.array);
    const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
    const attributes = {
      POSITION: addAccessor(position, "VEC3", 5126, 34962, { min: box.min.toArray(), max: box.max.toArray() }),
      NORMAL: addAccessor(new Float32Array(g.attributes.normal.array), "VEC3", 5126, 34962),
      TEXCOORD_0: addAccessor(gltfUVs(g.attributes.uv.array), "VEC2", 5126, 34962),
    };
    const indices = addAccessor(new Uint16Array(g.index.array), "SCALAR", 5123, 34963);

    const material = {
      name: part.name,
      pbrMetallicRoughness: { baseColorFactor: [...part.color, 1], metallicFactor: 0, roughnessFactor: part.roughness },
    };
    if (part.albedo) material.pbrMetallicRoughness.baseColorTexture = { index: addTexture(part.albedo) };
    if (part.emissive) {
      material.emissiveTexture = { index: addTexture(part.emissive) };
      material.emissiveFactor = [1, 1, 1];
    }
    json.materials.push(material);
    json.meshes.push({ name: part.name, primitives: [{ attributes, indices, material: json.materials.length - 1 }] });
    json.nodes.push({ name: part.name, mesh: json.meshes.length - 1, ...(part.translation && { translation: part.translation }) });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  }

  const bin = Buffer.concat(chunks);
  json.buffers[0].byteLength = bin.length;
  let jsonBuffer = Buffer.from(JSON.stringify(json));
  jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc((4 - (jsonBuffer.length % 4)) % 4, 0x20)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuffer.length + 8 + bin.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, bin]);
}

// --- Main -------------------------------------------------------------------------

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function clamp01(x) {
  return Math.min(Math.max(x, 0), 1);
}
function to8(x) {
  return Math.round(clamp01(x) * 255);
}

mkdirSync(OUT, { recursive: true });
for (const s of SHAPES) {
  const textures = paintTextures(s);
  const body = bodyGeometry(s);
  const stem = stemGeometry(s);
  const stemTop = s.size * s.squash * (1 - s.dimple) * 0.98;
  const glb = writeGLB([
    { name: "body", geometry: body, color: [1, 1, 1], roughness: 0.6, albedo: textures.albedo, emissive: textures.emissive },
    { name: "stem", geometry: stem, color: hex("#5b5a26").toArray(), roughness: 0.9, translation: [0, stemTop, 0] },
  ]);
  writeFileSync(new URL(`${s.id}.glb`, OUT), glb);
  const triangles = (body.index.count + stem.index.count) / 3;
  console.log(`${s.id}.glb  ${(glb.length / 1024).toFixed(1)} KB  ${triangles} triangles`);
}
