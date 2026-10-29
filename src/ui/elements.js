import * as THREE from "three/webgpu";
import {
  color,
  float,
  min,
  mx_noise_float,
  positionLocal,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import { font as cssFont } from "../config.js";
import { tweens, ease } from "../core/Tween.js";

const EMBER = color(0xff5a14);
export const DPR = Math.min(window.devicePixelRatio || 1, 2);

let seedCounter = 1;

/**
 * A flat UI quad whose pixels are painted on a 2D canvas and shown through a
 * TSL material: it burns in/out along a noisy front with an ember rim,
 * flickers like candlelight, can wobble, glow on hover and get a highlighted
 * border. Units are CSS pixels in the UI's orthographic camera. Call
 * `redraw()` once after construction to paint it.
 */
export class UIPanel extends THREE.Mesh {
  constructor({ width, height, anchor = "center", intensity = 1.5, wobble = 0, draw }) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * DPR);
    canvas.height = Math.ceil(height * DPR);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearFilter;

    const u = {
      reveal: uniform(0),
      opacity: uniform(1),
      hover: uniform(0),
      highlight: uniform(0),
      intensity: uniform(intensity),
      wobble: uniform(wobble),
      seed: uniform(seedCounter++ * 7.31),
      aspect: uniform(width / height),
    };

    const geometry = new THREE.PlaneGeometry(1, 1);
    // Anchors: "left" / "right" pin a side horizontally, "top" pins the top
    // edge (so a panel grows downwards); they combine, e.g. "top-left".
    if (anchor.includes("left")) geometry.translate(0.5, 0, 0);
    if (anchor.includes("right")) geometry.translate(-0.5, 0, 0);
    if (anchor.includes("top")) geometry.translate(0, -0.5, 0);

    super(geometry, UIPanel.createMaterial(map, u));
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.map = map;
    this.u = u;
    this.anchor = anchor;
    this.boxWidth = width;
    this.boxHeight = height;
    this.drawFn = draw;
    this.scale.set(width, height, 1);
    // Hidden panels stay in the scene fully transparent (reveal = 0): their
    // shaders compile on the first frame instead of hitching mid-game.
    this.frustumCulled = false;
  }

  static createMaterial(map, u) {
    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const st = uv();
    const tex = texture(map, st);

    // Burn front: noise plus a top-to-bottom bias so things ignite from above.
    const n = mx_noise_float(vec3(st.mul(vec2(u.aspect, 1)).mul(4.5), u.seed)).mul(0.5).add(0.5);
    const d = n.mul(0.72).add(float(1).sub(st.y).mul(0.28));
    const threshold = u.reveal.mul(1.3).sub(0.15);
    const visible = smoothstep(d.sub(0.012), d.add(0.012), threshold);
    const rim = visible.mul(float(1).sub(smoothstep(0, 0.08, threshold.sub(d)))).mul(step(u.reveal, 0.999));

    const flicker = mx_noise_float(vec2(time.mul(2.2), u.seed)).mul(0.1).add(1);
    const lit = u.intensity.add(u.hover.mul(0.9)).mul(flicker);

    // Highlighted border for selected cards.
    const edge = min(min(st.x, float(1).sub(st.x)).mul(u.aspect), min(st.y, float(1).sub(st.y)));
    const border = float(1).sub(smoothstep(0, 0.05, edge)).mul(u.highlight);

    material.colorNode = tex.rgb.mul(lit).add(EMBER.mul(rim.mul(6))).add(EMBER.mul(border.mul(3)));
    material.opacityNode = tex.a.mul(visible).add(border.mul(visible)).mul(u.opacity).clamp(0, 1);

    const sway = sin(time.mul(1.4).add(u.seed).add(positionLocal.x.mul(3))).mul(u.wobble);
    material.positionNode = positionLocal.add(vec3(0, sway, 0));
    return material;
  }

  redraw(...args) {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(DPR, DPR);
    this.drawFn(ctx, this.boxWidth, this.boxHeight, ...args);
    this.map.needsUpdate = true;
  }

  show({ duration = 0.8, delay = 0 } = {}) {
    tweens.to(this.u.reveal, "value", 1, duration, { delay, easing: ease.inOutQuad });
    return this;
  }

  hide({ duration = 0.6, delay = 0 } = {}) {
    tweens.to(this.u.reveal, "value", 0, duration, { delay, easing: ease.inOutQuad });
    return this;
  }

  get shown() {
    return this.visible && this.u.reveal.value > 0.5;
  }

  contains(x, y, pad = 6) {
    if (!this.shown) return false;
    const width = this.scale.x;
    let left = this.position.x - width / 2;
    if (this.anchor.includes("left")) left = this.position.x;
    if (this.anchor.includes("right")) left = this.position.x - width;
    const height = this.scale.y;
    const middle = this.anchor.includes("top") ? this.position.y - height / 2 : this.position.y;
    return (
      x >= left - pad &&
      x <= left + width + pad &&
      y >= middle - height / 2 - pad &&
      y <= middle + height / 2 + pad
    );
  }
}

/**
 * Text label painted with a warm gradient, a dark outline and a soft glow.
 * Shrinks the font to fit `width` when the text is too long.
 */
export class UIText extends UIPanel {
  constructor({
    text = "",
    font = "body",
    size = 32,
    width,
    anchor = "center",
    colors = ["#ffe9a8", "#ff7a1a"],
    glow = "#ff4a10",
    intensity = 1.5,
    wobble = 0,
    backdrop = null,
  }) {
    // The title face has swashes (tails on N, L, K...) that reach well past
    // the advance width and below the baseline: give it extra room.
    const swash = font === "title";
    const pad = size * (swash ? 0.7 : 0.45);
    const measured = measure(text, cssFont(font, size)) + pad * 2;
    const boxWidth = width ?? measured;
    super({
      width: boxWidth,
      height: size * (swash ? 1.95 : 1.55),
      anchor,
      intensity,
      wobble,
      draw: (ctx, w, h, value) => drawText(ctx, w, h, value, { font, size, pad, colors, glow, anchor, backdrop }),
    });
    this.text = text;
    this.redraw(text);
  }

  setText(text) {
    if (text === this.text) return;
    this.text = text;
    this.redraw(text);
  }
}

function measure(text, css) {
  const ctx = measure.ctx ?? (measure.ctx = document.createElement("canvas").getContext("2d"));
  ctx.font = css;
  return inkWidth(ctx.measureText(text));
}

/** Width actually painted, which for swash letters exceeds the advance width. */
function inkWidth(metrics) {
  return Math.max(metrics.width, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight);
}

function drawText(ctx, w, h, text, { font, size, pad, colors, glow, anchor, backdrop }) {
  if (backdrop) {
    // Dark band behind the text so it reads over bright parts of the scene.
    const band = ctx.createLinearGradient(0, 0, w, 0);
    band.addColorStop(0, "rgba(0,0,0,0)");
    band.addColorStop(0.15, backdrop);
    band.addColorStop(0.85, backdrop);
    band.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, w, h);
  }
  let px = size;
  ctx.font = cssFont(font, px);
  const available = w - pad * 2;
  const textWidth = inkWidth(ctx.measureText(text));
  if (textWidth > available) {
    px = Math.floor(size * (available / textWidth));
    ctx.font = cssFont(font, px);
  }

  ctx.textBaseline = "middle";
  const side = anchor.includes("left") ? "left" : anchor.includes("right") ? "right" : "center";
  ctx.textAlign = side;
  // Measured after textAlign is set: the bounding box is relative to it.
  const metrics = ctx.measureText(text);
  // Centred text is centred on its ink, so a long swash on one side doesn't
  // push the word off-centre or out of the canvas.
  const x =
    side === "left"
      ? pad
      : side === "right"
        ? w - pad
        : w / 2 + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
  const y = h / 2 + px * 0.05;

  const gradient = ctx.createLinearGradient(0, y - px / 2, 0, y + px / 2);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);

  ctx.lineJoin = "round";
  ctx.shadowColor = glow;
  ctx.shadowBlur = px * 0.35;
  ctx.strokeStyle = "rgba(20, 6, 4, 0.9)";
  ctx.lineWidth = Math.max(2, px * 0.08);
  ctx.strokeText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = gradient;
  ctx.fillText(text, x, y);
}
