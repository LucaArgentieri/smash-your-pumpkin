import * as THREE from "three/webgpu";
import {
  clamp,
  color,
  float,
  Fn,
  If,
  luminance,
  mix,
  mx_noise_float,
  positionLocal,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import { affineUV, ps1, unfiltered } from "../core/retro.js";

const EMBER = color(0xff5a14);
const cache = new Map();

// Per-object values read at draw time, so one material (one shader) serves the
// whole pumpkin and every shard: `userData.appear` burns objects in and out,
// `userData.hit` flashes them.
const appear = uniform(1).onObjectUpdate(({ object }) => object.userData.appear ?? 1);
const hit = uniform(0).onObjectUpdate(({ object }) => object.userData.hit ?? 0);

/**
 * Burn dissolve shared by shell, flesh and stem: x = visibility, y = ember
 * rim. The noise only runs while an object is actually burning (appear < 1);
 * the branch is uniform per draw, so settled shards pay nothing for it.
 */
const burn = (size) =>
  Fn(() => {
    const out = vec2(1, 0).toVar();
    If(appear.lessThan(0.999), () => {
      const noise = mx_noise_float(positionLocal.mul(3.2)).mul(0.5).add(0.5);
      const height = positionLocal.y.div(size * 2).add(0.5);
      const d = clamp(noise.mul(0.6).add(height.mul(0.4)), 0, 1);
      const threshold = appear.mul(1.3).sub(0.15);
      const visible = step(d, threshold);
      out.assign(vec2(visible, visible.mul(float(1).sub(smoothstep(0, 0.07, threshold.sub(d))))));
    });
    return out;
  })();

/**
 * Materials for one pumpkin variant built from its model's look (see
 * models.js). The shell keeps the model's own textures; the flesh revealed by
 * fractures is procedural.
 */
export function getPumpkinMaterials(variant, look, stemLook) {
  if (cache.has(variant.model)) return cache.get(variant.model);

  const seed = variant.name.length * 3.1;
  const glow = color(variant.glow);
  const dissolve = burn(variant.size);
  const rim = EMBER.mul(dissolve.y).mul(7);
  const flash = vec3(1, 0.55, 0.25).mul(hit).mul(1.6);
  const flicker = mx_noise_float(vec2(time.mul(4), seed)).mul(0.4).add(1);

  // --- Shell -------------------------------------------------------------
  const outer = ps1(new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: look.roughness }));
  const skinUV = affineUV();
  const albedo = look.map ? texture(unfiltered(look.map), skinUV).rgb.mul(color(look.color)) : color(look.color);
  outer.colorNode = albedo;

  // Carved faces: the model's emissive map if it has one, otherwise the very
  // bright parts of the albedo (generated models often paint the glow in).
  let faceGlow = vec3(0);
  if (look.emissiveMap) faceGlow = texture(unfiltered(look.emissiveMap), skinUV).rgb.mul(color(look.emissive));
  else if (variant.glowFromAlbedo && look.map) faceGlow = albedo.mul(smoothstep(0.55, 0.85, luminance(albedo)));
  outer.emissiveNode = faceGlow.mul(flicker).mul(4.5).add(rim).add(flash);
  outer.opacityNode = dissolve.x;
  outer.alphaTest = 0.5;

  // --- Flesh (cut faces) --------------------------------------------------
  // One noise lookup for fibres and a second, higher-frequency one
  // thresholded into seeds: far cheaper than fractal + cellular noise.
  const inner = ps1(new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 }));
  const p = positionLocal.mul(5);
  const fibres = mx_noise_float(vec3(p.x.mul(0.6), p.y.mul(3), p.z.mul(0.6)));
  const [light, dark] = variant.flesh ?? [0xffb52e, 0xe0561a];
  const flesh = mix(color(light), color(dark), clamp(fibres.mul(0.9).add(0.45), 0, 1));
  const seeds = smoothstep(0.55, 0.7, mx_noise_float(positionLocal.mul(14)));
  inner.colorNode = mix(flesh, color(0xfff1c9), seeds);
  // Carved pumpkins have a candle inside: their flesh glows a little more.
  const carved = Boolean(look.emissiveMap || variant.glowFromAlbedo);
  inner.emissiveNode = flesh.mul(carved ? 0.12 : 0.06).add(glow.mul(carved ? 0.04 : 0)).add(rim).add(flash);
  inner.opacityNode = dissolve.x;
  inner.alphaTest = 0.5;

  // --- Stem ---------------------------------------------------------------
  const stem = ps1(new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: stemLook.roughness }));
  stem.colorNode = stemLook.map ? texture(unfiltered(stemLook.map), affineUV()).rgb.mul(color(stemLook.color)) : color(stemLook.color);
  stem.emissiveNode = rim.add(flash);
  stem.opacityNode = dissolve.x;
  stem.alphaTest = 0.5;

  const materials = { outer, inner, stem };
  cache.set(variant.model, materials);
  return materials;
}
