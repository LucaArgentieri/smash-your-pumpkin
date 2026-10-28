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
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

// Vertical resolution the 3D scene is rendered at before being upscaled with
// nearest filtering: the chunky, low-fi look of the references.
const SCENE_LINES = 400;

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
    this.renderer = new THREE.WebGPURenderer({ antialias: false, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    };

    this.scenePass = pass(scene, camera);
    const sceneTexture = this.scenePass.renderTarget.texture;
    sceneTexture.minFilter = THREE.NearestFilter;
    sceneTexture.magFilter = THREE.NearestFilter;

    this.uiPass = pass(uiScene, uiCamera);

    this.pipeline = new THREE.RenderPipeline(this.renderer);
    this.pipeline.outputColorTransform = false;
    this.pipeline.outputNode = this.buildOutput();

    this.resize();
  }

  buildOutput() {
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
    const room = vec3(r, g, b).mul(float(1).sub(u.dim.mul(0.5)));
    const composite = room.mul(float(1).sub(ui.a)).add(ui.rgb);

    const glow = bloom(composite, 0.85, 0.55, 0.62);
    let color = composite.add(glow.rgb);

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
    color = floor(color.rgb.mul(steps).add(bayer.sub(0.5).mul(0.9)).add(0.5)).div(steps);

    // Film grain, tied to the same pixel grid so it reads as part of the image.
    const grain = fract(sin(dot(cell.add(floor(time.mul(24)).mul(17.13)), vec2(12.9898, 78.233))).mul(43758.5453));
    color = color.add(grain.sub(0.5).mul(0.045));

    // Keep blacks slightly violet instead of pure black.
    color = max(color, vec3(0.018, 0.008, 0.03));

    return clamp(color, 0, 1);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    const drawingHeight = h * this.renderer.getPixelRatio();
    const scale = Math.min(1, Math.max(0.2, SCENE_LINES / drawingHeight));
    this.scenePass.setResolutionScale(scale);
    this.uniforms.pixelSize.value = 1 / scale;
  }

  render() {
    this.pipeline.render();
  }

  get domElement() {
    return this.renderer.domElement;
  }
}
