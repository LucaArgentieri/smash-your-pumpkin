import * as THREE from "three/webgpu";
import { COMBO, font, GAME, TEXT, TOOLS } from "../config.js";
import { FracturePool } from "../core/FracturePool.js";
import { Physics } from "../core/Physics.js";
import { live, Quality } from "../core/Quality.js";
import { Renderer } from "../core/Renderer.js";
import { tweens } from "../core/Tween.js";
import { Debris } from "../fx/Debris.js";
import { Pumpkin } from "../pumpkins/Pumpkin.js";
import { VARIANTS } from "../pumpkins/variants.js";
import { getPumpkinMaterials } from "../pumpkins/materials.js";
import { loadPumpkinModel } from "../pumpkins/models.js";
import { UI } from "../ui/UI.js";
import { Cabin } from "../world/Cabin.js";
import { Destruction } from "./Destruction.js";

const PUMPKIN_SPOT = new THREE.Vector3(0, 0, 0.15);
const LOOK_AT = new THREE.Vector3(0, 0.85, 0);
const CAMERA_HOME = new THREE.Vector3(0, 2.75, 4.5);
const BEST_KEY = "smash-your-pumpkin:best";
const COMBO_KEY = "smash-your-pumpkin:combo-record";
// How far (world units) a click may miss a shard and still count: small
// shards and touch screens would be frustrating otherwise.
const AIM_ASSIST = 0.15;

/**
 * The rage room: title -> intro -> 60 s of smashing -> results -> again.
 */
export class Game {
  async start() {
    // Downloads (physics wasm, pumpkin models) start right away and overlap
    // with font loading and renderer setup.
    this.physics = new Physics();
    const physicsReady = this.physics.init();
    const modelsReady = Promise.all(VARIANTS.map(loadPumpkinModel));
    await loadFonts();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    this.camera.position.copy(CAMERA_HOME);
    this.ui = new UI();
    this.renderer = new Renderer({
      scene: this.scene,
      camera: this.camera,
      uiScene: this.ui.scene,
      uiCamera: this.ui.camera,
    });
    await this.renderer.renderer.init();

    this.quality = new Quality(this.renderer.renderer);
    this.renderer.setQuality(this.quality.preset);
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.clock = new THREE.Timer();
    this.elapsed = 0;
    this.shake = 0;
    this.tool = 0;
    this.cooldownUntil = 0;
    this.pointerHeld = false;
    this.deck = [];
    this.state = "loading";
    this.resetStats();

    this.bindEvents();
    this.onResize();
    this.ui.setQualityLabel(this.quality.label);
    this.ui.showLoading();
    this.renderer.renderer.setAnimationLoop((t) => this.frame(t));

    const [, models] = await Promise.all([physicsReady, modelsReady]);

    this.cabin = new Cabin(this.scene, this.physics, this.renderer);
    this.cabin.setQuality(this.quality.preset);
    this.pool = new FracturePool();
    this.debris = new Debris(this.scene);
    this.destruction = new Destruction({
      scene: this.scene,
      physics: this.physics,
      pool: this.pool,
      debris: this.debris,
    });
    this.warmUpMaterials(models);
    this.quality.onChange((preset) => this.onQualityChange(preset));

    this.ui.hideLoading();
    this.state = "title";
    this.spawnPumpkin();
    this.ui.showTitle();
    this.dim(1);
  }

  resetStats() {
    this.score = 0;
    this.pumpkinsSmashed = 0;
    this.shards = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lastHitAt = -Infinity;
    this.lastTool = null;
    this.timeLeft = GAME.duration;
  }

  /**
   * Draws one hidden copy of every pumpkin material under the table for a few
   * frames, so shaders compile now rather than on the first smash.
   */
  warmUpMaterials(models) {
    const group = new THREE.Group();
    VARIANTS.forEach((variant, i) => {
      const { outer, inner, stem } = getPumpkinMaterials(variant, models[i].look, models[i].stemLook);
      const geometry = models[i].body.clone();
      geometry.addGroup(0, geometry.index.count / 2, 0);
      geometry.addGroup(geometry.index.count / 2, geometry.index.count / 2, 1);
      const mesh = new THREE.Mesh(geometry, [outer, inner]);
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), stem));
      mesh.scale.setScalar(0.1);
      group.add(mesh);
    });
    group.position.set(0, -0.2, 0);
    this.scene.add(group);
    tweens.after(0.5, () => {
      this.scene.remove(group);
      group.traverse((o) => o.geometry?.dispose());
    });
  }

  // --- Input --------------------------------------------------------------------

  bindEvents() {
    const canvas = this.renderer.domElement;
    window.addEventListener("resize", () => this.onResize());
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerdown", (e) => {
      this.onPointerMove(e);
      this.onPointerDown();
    });
    const release = () => (this.pointerHeld = false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  onPointerMove(e) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ndc.set((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1);
    this.ui.movePointer(e.clientX - w / 2, h / 2 - e.clientY, e.pointerType === "touch");
  }

  onPointerDown() {
    const { x, y } = this.ui.pointer;
    this.ui.punch(this.ui.reticle, 0.8);
    const action = this.ui.pick(x, y);
    if (action?.type === "tool") return this.selectTool(action.index);
    if (action?.type === "quality") return this.quality.cycle();
    if (action?.type === "begin" && this.state === "title") return this.beginRound();
    if (action?.type === "again" && this.state === "results") return this.beginRound();
    if (this.state === "playing") {
      // Holding the button keeps swinging at the tool's own pace.
      this.pointerHeld = true;
      this.smash({ deliberate: true });
    }
  }

  onKey(e) {
    const index = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
    if (index !== -1) this.selectTool(index);
    if (e.code === "KeyQ" && this.state !== "loading") this.quality.cycle();
    if (e.code === "Space" || e.code === "Enter") {
      if (this.state === "title" && this.ui.begin.shown) this.beginRound();
      if (this.state === "results" && this.ui.again.shown) this.beginRound();
    }
  }

  selectTool(index) {
    if (index === this.tool && this.state === "playing") return;
    this.tool = index;
    this.ui.select(index);
    this.ui.describeTool(index, { flash: this.state === "playing" });
  }

  // --- Round flow ---------------------------------------------------------------

  async beginRound() {
    if (this.state === "title") this.ui.hideTitle();
    else {
      this.ui.hideResults();
      this.ui.showCards(0.3);
    }
    this.dim(0);
    this.destruction.clear();
    this.state = "intro";
    this.resetStats();
    this.ui.setScore(0);
    this.ui.setPumpkins(0);
    this.ui.setTimer(GAME.duration);
    this.ui.showHUD();

    await this.ui.announce(TEXT.ready, { hold: 0.45 });
    this.state = "playing";
    this.ui.announce(TEXT.go, { hold: 0.15, style: "blood" });
  }

  /**
   * Resolution and bloom change right away; lights and shadows recompile the
   * lit shaders, so mid-round they wait until the round is over.
   */
  onQualityChange(preset) {
    this.renderer.setQuality(preset);
    this.ui.setQualityLabel(this.quality.label);
    if (this.state === "playing" || this.state === "intro") this.pendingQuality = preset;
    else this.cabin.setQuality(preset);
  }

  async endRound() {
    this.state = "over";
    this.pointerHeld = false;
    this.endCombo({ cashOut: true });
    if (this.pendingQuality) {
      this.cabin.setQuality(this.pendingQuality);
      this.pendingQuality = null;
    }
    this.ui.combo.hide({ duration: 0.3 });
    await this.ui.announce(TEXT.timeUp, { hold: 0.9, style: "blood" });
    this.ui.hideHUD();
    this.dim(1);

    const previousBest = readNumber(BEST_KEY);
    const isBest = this.score > previousBest;
    if (isBest) writeNumber(BEST_KEY, this.score);
    const previousRecord = readNumber(COMBO_KEY);
    const isComboRecord = this.bestCombo > previousRecord;
    if (isComboRecord) writeNumber(COMBO_KEY, this.bestCombo);
    this.ui.showResults({
      score: this.score,
      pumpkins: this.pumpkinsSmashed,
      shards: this.shards,
      bestCombo: this.bestCombo,
      best: Math.max(previousBest, this.score),
      isBest: isBest && this.score > 0,
      comboRecord: Math.max(previousRecord, this.bestCombo),
      isComboRecord: isComboRecord && this.bestCombo > 1,
    });
    this.state = "results";
  }

  /** Darkens the room behind menus so the text reads. */
  dim(amount) {
    tweens.to(this.renderer.uniforms.dim, "value", amount, 0.8, { delay: amount ? 0.4 : 0 });
  }

  nextVariant() {
    if (this.deck.length === 0) {
      const last = this.lastVariant;
      this.deck = shuffle([...VARIANTS]);
      // Never the same pumpkin twice in a row across decks.
      if (this.deck.at(-1) === last) this.deck.unshift(this.deck.pop());
    }
    this.lastVariant = this.deck.pop();
    return this.lastVariant;
  }

  async spawnPumpkin() {
    const variant = this.nextVariant();
    const pumpkin = await Pumpkin.create(variant, {
      scene: this.scene,
      physics: this.physics,
      pool: this.pool,
    });
    this.pumpkin = pumpkin;
    pumpkin.spawn(PUMPKIN_SPOT);
  }

  // --- Smashing -----------------------------------------------------------------

  /** `deliberate`: a fresh click, not an auto-repeat from holding the button. */
  async smash({ deliberate = false } = {}) {
    if (this.elapsed < this.cooldownUntil) return;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const targets = this.destruction.targets(this.pumpkin);
    const hit = this.raycaster.intersectObjects(targets, false)[0] ?? this.nearMiss(targets);
    if (!hit) {
      // A deliberate swing at nothing breaks the combo (no cash-out). Held
      // swings sweeping over empty table are only throttled.
      if (deliberate && this.combo > 1) this.endCombo({ cashOut: false });
      this.cooldownUntil = this.elapsed + 0.08;
      return;
    }

    const tool = TOOLS[this.tool];
    this.cooldownUntil = this.elapsed + tool.cooldown;
    const motion = this.reducedMotion ? 0.25 : 1;
    this.shake = Math.min(1, this.shake + tool.shake * motion);
    if (!this.reducedMotion) {
      this.renderer.uniforms.flash.value = Math.min(0.5, this.renderer.uniforms.flash.value + tool.shake * 0.35);
    }
    this.physics.hitStop(tool.hitStop);

    const pumpkin = hit.object.userData.pumpkin;
    const direction = this.raycaster.ray.direction.clone();
    const result = await this.destruction.hit(hit.object, hit.point, direction, tool);

    if (result.type === "break" && this.pumpkin === pumpkin) {
      this.pumpkin = null;
      tweens.after(GAME.nextPumpkinDelay, () => this.spawnPumpkin());
    }
    if (this.state === "playing") this.register(result, hit.point, tool, pumpkin, TOOLS.indexOf(tool));
  }

  /** Closest target whose bounds pass within AIM_ASSIST of the ray. */
  nearMiss(targets) {
    const ray = this.raycaster.ray;
    const center = new THREE.Vector3();
    let best = null;
    let bestGap = AIM_ASSIST;
    for (const object of targets) {
      object.getWorldPosition(center);
      if (center.clone().sub(ray.origin).dot(ray.direction) <= 0) continue;
      const radius = object.geometry.boundingSphere.radius * object.scale.x;
      const gap = ray.distanceToPoint(center) - radius;
      if (gap < bestGap) {
        bestGap = gap;
        best = { object, center: center.clone(), radius };
      }
    }
    if (!best) return null;
    // Aim at the side of the object facing the ray.
    const point = ray.closestPointToPoint(best.center, new THREE.Vector3());
    point.sub(best.center).setLength(best.radius * 0.8).add(best.center);
    return { object: best.object, point };
  }

  // --- Combo --------------------------------------------------------------------

  comboWindow() {
    return Math.max(COMBO.minWindow, COMBO.window - this.combo * COMBO.tighten);
  }

  comboRank(combo = this.combo) {
    let rank = null;
    for (const [threshold, name] of COMBO.ranks) if (combo >= threshold) rank = name;
    return rank;
  }

  comboMultiplier() {
    return Math.min(COMBO.maxMultiplier, 1 + (this.combo - 1) * COMBO.multiplierStep);
  }

  /** Extends the combo for a landed hit and returns the point multiplier. */
  extendCombo(toolIndex, point) {
    const alive = this.combo > 0;
    const before = this.combo;
    this.combo += 1;
    if (alive && this.lastTool !== null && toolIndex !== this.lastTool) {
      this.combo += COMBO.switchBonus;
      this.ui.popup(`${TEXT.switched} +${COMBO.switchBonus}`, point, this.camera);
    }
    this.lastTool = toolIndex;
    this.lastHitAt = this.elapsed;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const rank = this.comboRank();
    this.ui.setCombo(this.combo, rank, this.comboMultiplier(), { rankUp: rank !== this.comboRank(before) });
    return this.comboMultiplier();
  }

  /** Ends the combo: banked (combo^2 bonus) when it runs out, lost on a miss. */
  endCombo({ cashOut }) {
    const combo = this.combo;
    this.combo = 0;
    this.lastTool = null;
    this.ui.hideCombo();
    if (combo < COMBO.minCashOut) return;
    if (!cashOut) {
      this.ui.showCashOut(`${TEXT.broken} · x${combo}`, { broken: true });
      return;
    }
    const bonus = Math.round(combo * combo * COMBO.cashOut);
    this.score += bonus;
    this.ui.setScore(this.score);
    this.ui.showCashOut(`x${combo} ${this.comboRank(combo) ?? TEXT.combo}  +${bonus}`);
  }

  register(result, point, tool, pumpkin, toolIndex) {
    if (result.type === "none") return;
    const multiplier = this.extendCombo(toolIndex, point);

    let points = 0;
    if (result.type === "crack") points = GAME.hitScore;
    if (result.type === "dust") points = GAME.dustScore;
    // Lower quality tiers cut fewer pieces; normalise so scores stay comparable.
    if (result.type === "pieces" || result.type === "break") {
      points = (result.pieces / live.pieces) * GAME.pieceScore * tool.scoreMult;
    }
    if (result.type === "break") {
      points += GAME.breakScore * (pumpkin?.variant.bonus ?? 1) * tool.breakBonus;
      this.pumpkinsSmashed++;
      this.ui.setPumpkins(this.pumpkinsSmashed);
    }
    this.shards += result.pieces;
    points = Math.round(points * multiplier);
    if (points === 0) return;

    this.score += points;
    this.ui.setScore(this.score);
    const label = result.type === "dust" ? `${TEXT.dust} +${points}` : `+${points}`;
    this.ui.popup(label, point, this.camera, { blood: result.type === "break" });
  }

  // --- Loop ---------------------------------------------------------------------

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Keep the table's width in view on portrait screens.
    const minHorizontalFov = THREE.MathUtils.degToRad(52);
    const vertical = 2 * Math.atan(Math.tan(minHorizontalFov / 2) / aspect);
    this.camera.fov = Math.max(48, THREE.MathUtils.radToDeg(vertical));
    this.camera.updateProjectionMatrix();
    this.renderer.resize();
    this.ui.layout(w, h);
  }

  frame(timestamp) {
    this.clock.update(timestamp);
    const realDt = this.clock.getDelta();
    const dt = Math.min(realDt, 1 / 20);
    this.elapsed += dt;

    tweens.update(dt);
    this.ui.update(dt);
    if (this.state === "loading") {
      this.renderer.render();
      return;
    }

    this.quality.sample(realDt);
    this.physics.step(dt);
    this.pumpkin?.update(dt);
    this.destruction.update(dt);
    this.debris.update(dt);
    this.cabin.update(this.elapsed);

    if (this.state === "playing") {
      if (this.pointerHeld) this.smash();
      if (this.combo > 0) {
        const left = 1 - (this.elapsed - this.lastHitAt) / this.comboWindow();
        this.ui.setComboTimer(left);
        if (left <= 0) this.endCombo({ cashOut: true });
      }
      this.timeLeft -= dt;
      this.ui.setTimer(Math.max(0, Math.ceil(this.timeLeft)));
      if (this.timeLeft <= 0) this.endRound();
    }

    this.updateCamera(dt);
    const flash = this.renderer.uniforms.flash;
    flash.value = Math.max(0, flash.value - dt * 3);
    this.renderer.render();
  }

  updateCamera(dt) {
    // Gentle parallax towards the pointer plus decaying screen shake.
    const sway = this.ui.pointer.touch || this.reducedMotion ? 0 : 1;
    const target = CAMERA_HOME.clone();
    target.x += this.ndc.x * 0.25 * sway;
    target.y += this.ndc.y * 0.12 * sway;
    this.camera.position.lerp(target, Math.min(1, dt * 3));

    this.shake = Math.max(0, this.shake - dt * 2.8);
    const s = this.shake * this.shake * 0.12;
    this.camera.lookAt(LOOK_AT);
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.rotation.z += (Math.random() - 0.5) * s * 0.5;
  }
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

async function loadFonts() {
  const fonts = ["title", "numbers", "body"].map((name) => font(name, 32));
  try {
    await Promise.race([
      Promise.all(fonts.map((f) => document.fonts.load(f))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // Fall back to whatever the browser has.
  }
}

function readNumber(key) {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private mode: records just aren't remembered.
  }
}
