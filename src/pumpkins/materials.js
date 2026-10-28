import * as THREE from "three/webgpu";
import {
  abs,
  clamp,
  color,
  cos,
  float,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  mx_worley_noise_float,
  positionLocal,
  pow,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

const EMBER = color(0xff5a14);
const cache = new Map();

// Per-object values read at draw time, so one material (one shader) serves the
// whole pumpkin and every shard: `userData.appear` burns objects in and out,
// `userData.hit` flashes them.
const appear = uniform(1).onObjectUpdate(({ object }) => object.userData.appear ?? 1);
const hit = uniform(0).onObjectUpdate(({ object }) => object.userData.hit ?? 0);

/**
 * Burn dissolve shared by shell and flesh. Returns the opacity mask and an
 * ember-coloured rim for the burning edge.
 */
function dissolve(size) {
  const noise = mx_noise_float(positionLocal.mul(3.2)).mul(0.5).add(0.5);
  const height = positionLocal.y.div(size * 2).add(0.5);
  const d = clamp(noise.mul(0.6).add(height.mul(0.4)), 0, 1);
  const threshold = appear.mul(1.3).sub(0.15);
  const visible = step(d, threshold);
  const rim = visible.mul(float(1).sub(smoothstep(0, 0.07, threshold.sub(d)))).mul(step(appear, 0.999));
  return { visible, rim: EMBER.mul(rim).mul(7) };
}

export function getPumpkinMaterials(variant) {
  if (cache.has(variant.name)) return cache.get(variant.name);

  const seed = variant.name.length * 3.1;
  const base = color(variant.color);
  const shade = color(variant.shade);
  const glow = color(variant.glow);
  const burn = dissolve(variant.size);
  const flash = vec3(1, 0.55, 0.25).mul(hit).mul(1.6);

  // --- Shell -------------------------------------------------------------
  const outer = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
  const st = uv();
  const rib = abs(cos(st.x.mul(Math.PI * variant.ribs)));
  const groove = pow(float(1).sub(rib), 3);
  const blotch = mx_fractal_noise_float(vec3(st.x.mul(22), st.y.mul(9), seed), 3, 2, 0.5);
  const pole = smoothstep(0.3, 0.5, abs(st.y.sub(0.5)));
  const streak = mx_noise_float(vec3(st.x.mul(150), st.y.mul(2.5), seed)).mul(0.1).add(1);
  const skin = mix(base, shade, clamp(groove.mul(0.85).add(pole.mul(0.55)).add(blotch.mul(0.3)), 0, 1)).mul(streak);

  const mask = variant.face ? texture(faceTexture(variant.face), st).r : float(0);
  const flicker = mx_noise_float(vec2(time.mul(4), seed)).mul(0.4).add(1);

  outer.colorNode = mix(skin, glow.mul(0.5), mask);
  outer.roughnessNode = mix(float(0.42), float(0.85), groove.add(pole.mul(0.5)));
  outer.emissiveNode = glow.mul(mask).mul(flicker).mul(4.5).add(burn.rim).add(flash);
  outer.opacityNode = burn.visible;
  outer.alphaTest = 0.5;

  // --- Flesh (cut faces) --------------------------------------------------
  const inner = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
  const p = positionLocal.mul(5);
  const fibres = mx_fractal_noise_float(vec3(p.x.mul(0.6), p.y.mul(3), p.z.mul(0.6)), 3, 2, 0.5);
  const flesh = mix(color(0xffb52e), color(0xe0561a), clamp(fibres.mul(0.9).add(0.45), 0, 1));
  const seeds = float(1).sub(smoothstep(0.08, 0.16, mx_worley_noise_float(positionLocal.mul(9))));
  inner.colorNode = mix(flesh, color(0xfff1c9), seeds);
  // Carved pumpkins have a candle inside: their flesh glows a little more.
  inner.emissiveNode = flesh.mul(variant.face ? 0.16 : 0.08).add(burn.rim).add(flash);
  inner.opacityNode = burn.visible;
  inner.alphaTest = 0.5;

  // --- Stem ---------------------------------------------------------------
  const stem = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const bark = mx_fractal_noise_float(vec3(uv().x.mul(30), uv().y.mul(4), seed), 3, 2, 0.5);
  stem.colorNode = mix(color(0x3d4a18), color(0x8a7a40), clamp(bark.add(uv().y.mul(0.6)), 0, 1));
  stem.emissiveNode = burn.rim.add(flash);
  stem.opacityNode = burn.visible;
  stem.alphaTest = 0.5;

  const materials = { outer, inner, stem };
  cache.set(variant.name, materials);
  return materials;
}

// --- Carved faces -------------------------------------------------------------
// Painted into UV space: x = u (around), y = 1 - v (top to bottom). The face is
// centred on u = 0.5 which points at the camera.

const FACES = {
  grin(ctx) {
    eye(ctx, 430, 190, 70, 64, -0.15);
    eye(ctx, 594, 190, 70, 64, 0.15);
    nose(ctx, 512, 255, 34);
    jaggedMouth(ctx, 380, 644, 290, 70, 6, true);
  },
  scared(ctx) {
    roundEye(ctx, 440, 190, 36);
    roundEye(ctx, 584, 190, 36);
    ctx.beginPath();
    ctx.ellipse(512, 320, 38, 54, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  angry(ctx) {
    eye(ctx, 432, 200, 78, 52, 0.45);
    eye(ctx, 592, 200, 78, 52, -0.45);
    jaggedMouth(ctx, 400, 624, 300, 46, 8, false);
  },
  sad(ctx) {
    eye(ctx, 440, 196, 56, 60, 0.3);
    eye(ctx, 584, 196, 56, 60, -0.3);
    ctx.beginPath();
    ctx.moveTo(420, 330);
    ctx.quadraticCurveTo(512, 255, 604, 330);
    ctx.quadraticCurveTo(512, 290, 420, 330);
    ctx.fill();
  },
};

function eye(ctx, x, y, w, h, tilt) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.moveTo(-w / 2, h / 2);
  ctx.lineTo(0, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundEye(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function nose(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s / 2, y + s / 2);
  ctx.lineTo(x, y - s / 2);
  ctx.lineTo(x + s / 2, y + s / 2);
  ctx.closePath();
  ctx.fill();
}

function jaggedMouth(ctx, x0, x1, y, h, teeth, smile) {
  const mid = (x0 + x1) / 2;
  const curve = (x) => (smile ? 1 : -0.4) * 40 * (1 - Math.pow((x - mid) / ((x1 - x0) / 2), 2));
  ctx.beginPath();
  ctx.moveTo(x0, y - 10);
  const step = (x1 - x0) / teeth;
  for (let i = 0; i <= teeth; i++) {
    const x = x0 + i * step;
    ctx.lineTo(x, y - 10 + curve(x) * 0.4 + (i % 2 ? 18 : 0));
  }
  for (let i = teeth; i >= 0; i--) {
    const x = x0 + i * step;
    ctx.lineTo(x, y + h * 0.5 + curve(x) + (i % 2 ? 0 : -16));
  }
  ctx.closePath();
  ctx.fill();
}

const faceTextures = new Map();

function faceTexture(name) {
  if (faceTextures.has(name)) return faceTextures.get(name);
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.filter = "blur(2px)";
  FACES[name](ctx);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.NoColorSpace;
  faceTextures.set(name, map);
  return map;
}
