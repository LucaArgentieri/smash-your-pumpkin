// Quality tiers, initial hardware guess and an adaptive governor that steps
// down when frames run long. Tiers only ever go down automatically: with
// vsync there is no reliable way to measure spare headroom to go back up.

export const TIERS = ["minimal", "low", "medium", "high"];

export const PRESETS = {
  minimal: {
    label: "MIN",
    pixelRatio: 0.75,
    sceneLines: 210,
    bloom: 0,
    shadows: "none",
    shadowMapSize: 512,
    candleLights: 0,
    maxFragments: 50,
    debris: 0.3,
    dust: 0,
    pieces: 0.5,
  },
  low: {
    label: "LOW",
    pixelRatio: 1,
    sceneLines: 270,
    bloom: 0,
    shadows: "none",
    shadowMapSize: 512,
    candleLights: 0,
    maxFragments: 80,
    debris: 0.45,
    dust: 50,
    pieces: 0.65,
  },
  medium: {
    label: "MED",
    pixelRatio: 1.5,
    sceneLines: 340,
    bloom: 0.25,
    shadows: "lantern",
    shadowMapSize: 512,
    candleLights: 1,
    maxFragments: 150,
    debris: 0.75,
    dust: 110,
    pieces: 0.85,
  },
  high: {
    label: "HIGH",
    pixelRatio: 2,
    sceneLines: 400,
    bloom: 0.5,
    shadows: "all",
    shadowMapSize: 1024,
    candleLights: 3,
    maxFragments: 220,
    debris: 1,
    dust: 160,
    pieces: 1,
  },
};

/** The active preset, read by systems that scale work per frame or per hit. */
export const live = { ...PRESETS.high };

const STORAGE_KEY = "smash-your-pumpkin:quality";
const LEARNED_KEY = "smash-your-pumpkin:auto-tier";
const WINDOW = 2; // seconds per sample window
const SLOW_FRAME_MS = 1000 / 45;
const STRIKES_TO_DROP = 2;
const SETTLE = 3; // seconds ignored after start or a change (shader compiles)

export class Quality {
  constructor(renderer) {
    // A tier the governor settled on during an earlier visit beats the guess.
    const learned = readStored(LEARNED_KEY);
    const guess = detectTier(renderer);
    this.detected = learned && TIERS.indexOf(learned) < TIERS.indexOf(guess) ? learned : guess;
    this.mode = readMode(); // "auto" or a tier name
    this.tier = this.mode === "auto" ? this.detected : this.mode;
    Object.assign(live, PRESETS[this.tier]);
    this.listeners = [];
    this.resetWindow();
  }

  get preset() {
    return PRESETS[this.tier];
  }

  get label() {
    return this.mode === "auto" ? `AUTO · ${this.preset.label}` : this.preset.label;
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  /** Cycles AUTO -> MIN -> LOW -> MED -> HIGH -> AUTO. */
  cycle() {
    const order = ["auto", ...TIERS];
    this.mode = order[(order.indexOf(this.mode) + 1) % order.length];
    writeMode(this.mode);
    this.set(this.mode === "auto" ? this.detected : this.mode);
  }

  set(tier) {
    this.tier = tier;
    Object.assign(live, PRESETS[tier]);
    this.resetWindow();
    this.listeners.forEach((fn) => fn(this.preset, this.tier));
  }

  resetWindow() {
    this.settle = SETTLE;
    this.elapsed = 0;
    this.frames = 0;
    this.strikes = 0;
  }

  /** Feed the real (unclamped) frame delta in seconds. */
  sample(dt) {
    if (this.mode !== "auto") return;
    // Tab switches and one-off stalls say nothing about steady-state speed;
    // genuinely slow frames (even several hundred ms) must still count.
    if (dt > 1) return;
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed < WINDOW) return;

    const average = (this.elapsed / this.frames) * 1000;
    this.elapsed = 0;
    this.frames = 0;
    this.strikes = average > SLOW_FRAME_MS ? this.strikes + 1 : 0;
    if (this.strikes < STRIKES_TO_DROP) return;

    const index = TIERS.indexOf(this.tier);
    if (index > 0) {
      // Remember the downgrade so the next visit starts where this one ended.
      this.detected = TIERS[index - 1];
      writeStored(LEARNED_KEY, this.detected);
      this.set(this.detected);
    } else {
      this.strikes = 0;
    }
  }
}

function detectTier(renderer) {
  const backend = renderer.backend;
  let gpu = "";
  try {
    if (backend.isWebGPUBackend) {
      const info = backend.adapter?.info;
      gpu = `${info?.vendor ?? ""} ${info?.architecture ?? ""} ${info?.description ?? ""}`;
    } else {
      const gl = backend.gl;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      gpu = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "";
    }
  } catch {
    // Some browsers hide the GPU; fall through to the other hints.
  }

  const coarse = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = navigator.deviceMemory ?? 8;

  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(gpu)) return "minimal";
  if (coarse || cores <= 4 || memory <= 4) return "low";
  if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d|apple gpu/i.test(gpu)) return "high";
  return "medium";
}

function readMode() {
  const value = readStored(STORAGE_KEY);
  return value === "auto" || TIERS.includes(value) ? value : "auto";
}

function writeMode(mode) {
  writeStored(STORAGE_KEY, mode);
}

function readStored(key) {
  try {
    const value = localStorage.getItem(key);
    return key === LEARNED_KEY && !TIERS.includes(value) ? null : value;
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted in private mode; the choice still applies this session.
  }
}
