import * as THREE from "three/webgpu";
import {
  pass,
  uniform,
  uv,
  vec2,
  vec3,
  float,
  mix,
  smoothstep,
  length,
  floor,
  fract,
  sin,
  dot,
  time,
  screenSize,
  screenUV,
  renderOutput,
  clamp,
  max,
  mod,
  Fn,
  If,
  mx_noise_float,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { RETRO } from "../config.js";
import { snapGrid } from "./retro.js";


// 2x2 Bayer: (0,0)=0 (1,0)=2 (0,1)=3 (1,1)=1, i.e. (2x + 3y) mod 4.
const bayer2 = (x, y) => mod(x.mul(2).add(y.mul(3)), 4);

// 4x4 ordered-dither threshold in [0, 1).
const bayer4 = (cell) => {
  const small = bayer2(mod(cell.x, 2), mod(cell.y, 2));
  const large = bayer2(mod(floor(cell.x.div(2)), 2), mod(floor(cell.y.div(2)), 2));
  return small.mul(4).add(large).div(16);
};

/**
 * WebGPU renderer (falls back to WebGL2) plus the whole TSL post chain:
 * low-res scene pass, crisp UI pass composited on top, bloom on both,
 * chromatic fringe, vignette, flicker, grain and ordered dithering.
 */
export class Renderer {
  constructor({ scene, camera, uiScene, uiCamera }) {
    this.renderer = new THREE.WebGPURenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    this.uniforms = {
      flash: uniform(0),
      flashColor: uniform(new THREE.Color(1, 0.45, 0.12)),
      aberration: uniform(0.0015),
      vignette: uniform(1),
      pixelSize: uniform(1),
      dim: uniform(0),
      // Combo fire vignette: strength, fraction of the combo window left
      // (flames close in as it runs out) and a tint (orange, or red when broken).
      fire: uniform(0),
      fireLeft: uniform(1),
      fireTint: uniform(new THREE.Color(1, 1, 1)),
    };

    this.scenePass = pass(scene, camera);
    const sceneTexture = this.scenePass.renderTarget.texture;
    sceneTexture.minFilter = THREE.NearestFilter;
    sceneTexture.magFilter = THREE.NearestFilter;

    this.uiPass = pass(uiScene, uiCamera);

    this.pipeline = new THREE.RenderPipeline(this.renderer);
    this.pipeline.outputColorTransform = false;

    // The scene's low internal resolution (RETRO.lines) is the art style and
    // also the main reason it stays cheap on weak GPUs.
    this.maxPixelRatio = 2;
    this.bloomScale = null;
  }

  /** Applies a quality preset (see core/Quality.js). */
  setQuality({ pixelRatio, bloom }) {
    this.maxPixelRatio = pixelRatio;
    if (bloom !== this.bloomScale) {
      this.bloomScale = bloom;
      this.pipeline.outputNode = this.buildOutput(bloom);
      this.pipeline.needsUpdate = true;
    }
    this.resize();
  }

  /**
   * Renders `node` (a function of uv()) once into a texture, so expensive
   * procedural patterns cost a texture fetch at draw time instead of noise.
   */
  bake(node, width, height) {
    const target = new THREE.RenderTarget(width, height, {
      type: THREE.UnsignedByteType,
      generateMipmaps: true,
      // Unfiltered texels for the PS1 look. Set here: changing filters on a
      // render target texture afterwards would mean re-uploading it empty.
      minFilter: THREE.NearestMipmapNearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    const material = new THREE.MeshBasicNodeMaterial();
    material.colorNode = node;
    const quad = new THREE.QuadMesh(material);
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    quad.render(this.renderer);
    this.renderer.setRenderTarget(previous);
    material.dispose();
    return target.texture;
  }

  buildOutput(bloomScale) {
    const u = this.uniforms;
    const sceneColor = this.scenePass.getTextureNode();
    const uiColor = this.uiPass.getTextureNode();

    // Chromatic fringe grows towards the edges like an old lens.
    const centered = uv().sub(0.5);
    const fringe = centered.mul(length(centered)).mul(u.aberration.mul(8));
    const r = sceneColor.sample(uv().add(fringe)).r;
    const g = sceneColor.sample(uv()).g;
    const b = sceneColor.sample(uv().sub(fringe)).b;

    const ui = uiColor.sample(uv());
    // UI pass is rendered over transparent black, so its rgb is premultiplied.
    // The combo fire burns into the room only; the UI stays clean on top.
    const room = this.comboFire(centered, vec3(r, g, b)).mul(float(1).sub(u.dim.mul(0.5)));
    const composite = room.mul(float(1).sub(ui.a)).add(ui.rgb);

    let color = composite;
    if (bloomScale > 0) {
      // The UI feeds the bloom at a third of its brightness: enough for a halo
      // around text, without big titles washing the whole room in haze.
      const bloomInput = room.mul(float(1).sub(ui.a)).add(ui.rgb.mul(0.35));
      const glow = bloom(bloomInput, 0.85, 0.55, 0.62);
      glow.setResolutionScale(bloomScale);
      color = color.add(glow.rgb);
    } else {
      // No bloom on weak GPUs: lift the hottest pixels a little instead so
      // flames and carved faces still read as glowing.
      color = color.add(max(color.sub(0.8), 0).mul(0.6));
    }

    // Hit flash and a slow candle-like breathing of the whole frame.
    const breathe = sin(time.mul(1.7)).mul(sin(time.mul(2.9))).mul(0.025).add(1);
    color = color.mul(breathe).add(u.flashColor.mul(u.flash));

    // Vignette pulling everything into the dark violet of the room.
    const dist = length(centered.mul(vec2(screenSize.x.div(screenSize.y), 1)));
    const vig = smoothstep(0.25, 1.05, dist).mul(u.vignette);
    color = mix(color, color.mul(vec3(0.35, 0.18, 0.5)), vig);

    color = renderOutput(color, THREE.ACESFilmicToneMapping, THREE.SRGBColorSpace);

    // Ordered dithering + quantisation on the low-res pixel grid.
    const cell = floor(screenUV.mul(screenSize).div(u.pixelSize));
    const bayer = bayer4(cell);
    const steps = float(28);
    let gritty = floor(color.rgb.mul(steps).add(bayer.sub(0.5).mul(0.9)).add(0.5)).div(steps);

    // Film grain, tied to the same pixel grid so it reads as part of the image.
    const grain = fract(sin(dot(cell.add(floor(time.mul(24)).mul(17.13)), vec2(12.9898, 78.233))).mul(43758.5453));
    gritty = gritty.add(grain.sub(0.5).mul(0.045));

    // Dither and grain belong to the scene: text stays clean so it reads,
    // especially where scene pixels are big (phones, low tiers).
    color = mix(gritty, color.rgb, smoothstep(0.02, 0.35, ui.a));

    // Keep blacks slightly violet instead of pure black.
    color = max(color, vec3(0.018, 0.008, 0.03));

    return clamp(color, 0, 1);
  }

  /**
   * Flames licking in from the screen edges while a combo is alive: a
   * burning front that creeps towards the centre as the window to land the
   * next hit runs out, charred dark with embers behind it, throbbing when
   * time is nearly gone. Returns `scene` untouched when no combo is running.
   */
  comboFire(centered, scene) {
    const u = this.uniforms;
    return Fn(() => {
      const out = vec3(scene).toVar();
      If(u.fire.greaterThan(0.001), () => {
        // Snap to the scene's pixel grid so the flames are as chunky as the room.
        const cellUV = floor(screenUV.mul(screenSize).div(u.pixelSize)).add(0.5).mul(u.pixelSize).div(screenSize);
        const c = cellUV.sub(0.5);
        // Elliptical distance: 1 at the middle of each edge, ~1.4 in corners.
        const d = length(c.mul(2));
        const around = c.normalize();
        // Licking tongues: fine noise around the edge, scrolling inwards.
        const lick = mx_noise_float(vec3(around.mul(6), d.mul(9).sub(time.mul(4.5))));
        const sway = mx_noise_float(vec3(around.mul(2.2), time.mul(0.7)));
        const reach = mix(float(1.25), float(0.7), float(1).sub(u.fireLeft)).sub(u.fire.mul(0.05));
        const front = d.add(lick.mul(0.13)).add(sway.mul(0.08));
        // Everything past the front is burnt...
        const burnt = smoothstep(reach.sub(0.02), reach.add(0.03), front);
        // ...the front itself is a thin, hot band of flame...
        const band = burnt.mul(float(1).sub(smoothstep(reach.add(0.01), reach.add(0.09), front)));
        // ...and small sparks drift in the char.
        const spark = mx_noise_float(vec3(around.mul(16), d.mul(26).sub(time.mul(6))));
        const sparks = smoothstep(0.55, 0.7, spark).mul(burnt);
        const heat = lick.mul(0.5).add(0.5);
        const flameColor = mix(vec3(0.8, 0.12, 0.0), vec3(1.0, 0.62, 0.16), heat).mul(u.fireTint);
        const urgency = float(1).sub(smoothstep(0, 0.35, u.fireLeft));
        const throb = sin(time.mul(16)).mul(0.4).mul(urgency).add(1);
        const strength = u.fire.min(1.6);
        const charred = scene.mul(float(1).sub(burnt.mul(0.72).mul(strength.min(1))));
        const glow = flameColor.mul(band.mul(1.5).add(sparks.mul(0.9))).mul(strength).mul(throb);
        out.assign(charred.add(glow));
      });
      return out;
    })();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(w, h);
    // Measured on the shorter side, so portrait phones get as many scene
    // pixels across as landscape screens get top to bottom.
    const shortSide = Math.min(w, h) * this.renderer.getPixelRatio();
    const scale = Math.min(1, Math.max(0.05, RETRO.lines / shortSide));
    this.scenePass.setResolutionScale(scale);
    // Vertices snap to exactly the scene's pixel grid.
    const pr = this.renderer.getPixelRatio();
    snapGrid.value.set(Math.floor(w * pr * scale), Math.floor(h * pr * scale));
    this.uniforms.pixelSize.value = 1 / scale;
  }

  render() {
    this.pipeline.render();
  }

  get domElement() {
    return this.renderer.domElement;
  }
}
