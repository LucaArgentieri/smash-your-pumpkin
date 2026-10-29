import * as THREE from "three/webgpu";
import { COMBO, font, FONTS, GAME, TEXT, TOOLS } from "../config.js";
import { FracturePool } from "../core/FracturePool.js";
import { Physics } from "../core/Physics.js";
import { live, Quality } from "../core/Quality.js";
import { Renderer } from "../core/Renderer.js";
import { ease, tweens } from "../core/Tween.js";
import { Debris } from "../fx/Debris.js";
import { Pumpkin } from "../pumpkins/Pumpkin.js";
import { VARIANTS } from "../pumpkins/variants.js";
import { faceGlowStrength, getPumpkinMaterials } from "../pumpkins/materials.js";
import { loadPumpkinModel } from "../pumpkins/models.js";
import { UI } from "../ui/UI.js";
import { Cabin, MOON_POSITION } from "../world/Cabin.js";
import { Destruction } from "./Destruction.js";
import { finish, progress } from "../core/loader.js";
import { Sound } from "../audio/Sound.js";
import { fetchTop, lastName, leaderboardEnabled, rememberName, submitScore } from "./leaderboard.js";

const PUMPKIN_SPOT = new THREE.Vector3(0, 0, 0.15);
const LOOK_AT = new THREE.Vector3(0, 0.85, 0);
const CAMERA_HOME = new THREE.Vector3(0, 2.75, 4.5);
// Results / leaderboard shot: low, over the pumpkin's shoulder while it gazes
// at the moon, drifting like an arcade attract mode.
const TO_MOON = MOON_POSITION.clone().sub(PUMPKIN_SPOT).normalize();
const TO_MOON_FLAT = new THREE.Vector3(TO_MOON.x, 0, TO_MOON.z).normalize();
const MOON_GAZE = Math.atan2(TO_MOON.x, TO_MOON.z);
const ACROSS_MOON = new THREE.Vector3(-TO_MOON_FLAT.z, 0, TO_MOON_FLAT.x);
// Framed so the pumpkin sits bottom-right and the moon top-left, leaving the
// centre for the results / leaderboard text.
const SHOWCASE_POSITION = PUMPKIN_SPOT.clone()
  .addScaledVector(TO_MOON_FLAT, -3)
  .addScaledVector(ACROSS_MOON, -2.4)
  .add(new THREE.Vector3(0, 1.6, 0));
const SHOWCASE_LOOK = PUMPKIN_SPOT.clone().addScaledVector(TO_MOON, 9).addScaledVector(ACROSS_MOON, 2);

// Key-art shot, a narrow lens framed like the Inscryption cover: eyes in the
// top third, the top of the pumpkin cropped, the title across the nose.
const COVER_POSITION = new THREE.Vector3(0, 1.0, 3.6);
const COVER_LOOK = new THREE.Vector3(0, 0.6, 0.15);
const COVER_FOV = 30;

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
    progress(0.05, "lighting the candles...");
    const physicsReady = this.physics.init().then(() => progress(0.35));
    let modelsLoaded = 0;
    const modelsReady = Promise.all(
      VARIANTS.map((v) =>
        loadPumpkinModel(v).then((m) => {
          progress(0.35 + (++modelsLoaded / VARIANTS.length) * 0.4, "carving the pumpkins...");
          return m;
        }),
      ),
    );
    await loadFonts();
    progress(0.15);

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
    progress(0.25);

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
    this.cameraMode = "play";
    this.cameraPosition = CAMERA_HOME.clone();
    this.cameraLook = LOOK_AT.clone();
    this.deck = [];
    this.state = "loading";
    this.resetStats();

    this.bindEvents();
    this.onResize();
    this.ui.setQualityLabel(this.quality.label);
    this.sound = new Sound();
    this.ui.setSoundLabel(this.sound.enabled);
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
    progress(0.85, "sharpening the blades...");
    this.warmUpMaterials(models);
    this.quality.onChange((preset) => this.onQualityChange(preset));

    // Let the first frames compile shaders behind the loader, then reveal.
    tweens.after(0.6, finish);
    if (new URLSearchParams(location.search).has("cover")) return this.startCover();
    this.state = "title";
    this.spawnPumpkin();
    this.ui.showTitle({ withBoard: leaderboardEnabled });
    this.dim(1);
  }

  /**
   * Key-art mode (?cover), rendered by scripts/render-cover.mjs: a carved
   * pumpkin looming over the camera like the Inscryption cover, with only
   * the title on top. Sets `window.coverReady` once the pumpkin has settled.
   */
  async startCover() {
    this.state = "cover";
    this.cameraMode = "cover";
    this.camera.fov = COVER_FOV;
    this.camera.updateProjectionMatrix();
    this.cameraPosition.copy(COVER_POSITION);
    this.cameraLook.copy(COVER_LOOK);
    this.quality.set("high");
    this.cabin.setQuality(this.quality.preset);
    this.cabin.setCoverLighting();
    // Bright enough to bloom and spill onto the skin, low enough to stay orange.
    faceGlowStrength.value = 1.6;
    this.renderer.uniforms.vignette.value = 1.5;
    await this.spawnPumpkin(VARIANTS.find((v) => v.name === "Jack"));
    this.pumpkin.mesh.rotation.y = 0;
    // ?cover&icon: the whole pumpkin on black, no title, for the favicon.
    if (new URLSearchParams(location.search).has("icon")) {
      this.cameraPosition.set(0, 0.95, 3.7);
      this.cameraLook.set(0, 0.78, 0.15);
      faceGlowStrength.value = 1.1;
    } else {
      this.ui.showCover();
    }
    tweens.after(2.5, () => (window.coverReady = true));
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
      this.sound.unlock();
      this.onPointerMove(e);
      this.onPointerDown();
    });
    // Vertical swipe pages through the leaderboard on touch screens.
    canvas.addEventListener("pointerdown", (e) => (this.swipeFrom = e.clientY));
    canvas.addEventListener("pointerup", (e) => {
      const dy = e.clientY - (this.swipeFrom ?? e.clientY);
      if (Math.abs(dy) > 50) this.turnBoard(dy < 0 ? 1 : -1);
      this.swipeFrom = null;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (e.deltaY === 0) return;
        if (this.ui.board.open) return this.turnBoard(Math.sign(e.deltaY));
        if (this.state !== "playing") return;
        this.selectTool((this.tool + Math.sign(e.deltaY) + TOOLS.length) % TOOLS.length);
      },
      { passive: true },
    );
    window.addEventListener("keydown", (e) => {
      this.sound.unlock();
      this.onKey(e);
    });
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
    if (action?.type === "sound") return this.toggleSound();
    if (action?.type === "begin" && this.state === "title") return this.beginRound();
    if (action?.type === "board" && this.state === "title") return this.openBoard();
    if (action?.type === "boardPage") return this.turnBoard(action.step);
    if (action?.type === "back" && this.state === "board") return this.closeBoard();
    if (action?.type === "again" && this.state === "results") return this.beginRound();
    if (this.state === "name" && action?.type.startsWith("name")) return this.onNameAction(action);
    // One click, one blow (no holding): speed and the right weapon score.
    if (this.state === "playing") this.smash();
  }

  onKey(e) {
    if (this.state === "name") return this.onNameKey(e);
    if (this.ui.board.open) {
      const step = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[e.code];
      if (step) return this.turnBoard(step);
    }
    const index = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
    if (index !== -1) this.selectTool(index);
    if (e.code === "KeyQ" && this.state !== "loading") this.quality.cycle();
    if (e.code === "KeyM") this.toggleSound();
    if (this.state === "board" && (e.code === "Escape" || e.code === "Enter" || e.code === "Space")) return this.closeBoard();
    if (e.code === "KeyL" && this.state === "title" && leaderboardEnabled) return this.openBoard();
    if (e.code === "Space" || e.code === "Enter") {
      if (this.state === "title" && this.ui.begin.shown) this.beginRound();
      if (this.state === "results" && this.ui.again.shown) this.beginRound();
    }
  }

  selectTool(index) {
    if (index === this.tool && this.state === "playing") return;
    this.tool = index;
    this.ui.select(index);
    this.sound.select(index);
  }

  toggleSound() {
    this.ui.setSoundLabel(this.sound.toggle());
  }

  // --- Round flow ---------------------------------------------------------------

  async beginRound() {
    if (this.state === "title") this.ui.hideTitle();
    else {
      this.ui.hideResults();
    }
    this.ui.setPlaying(true);
    this.dim(0);
    this.cameraMode = "play";
    this.turnPumpkin(0);
    this.destruction.clear();
    this.state = "intro";
    this.resetStats();
    this.ui.setScore(0);
    this.ui.setPumpkins(0);
    this.ui.setTimer(GAME.duration);
    this.ui.showHUD();

    this.sound.stinger("ready");
    await this.ui.announce(TEXT.ready, { hold: 0.45 });
    this.sound.stinger("go");
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
    this.endCombo({ cashOut: true });
    if (this.pendingQuality) {
      this.cabin.setQuality(this.pendingQuality);
      this.pendingQuality = null;
    }
    this.sound.stinger("end");
    await this.ui.announce(TEXT.timeUp, { hold: 0.9, style: "blood" });
    this.ui.hideHUD();
    this.ui.setPlaying(false);
    // The leaderboard shot: lighter dimming so the scene stays part of it.
    this.dim(0.35);
    this.cameraMode = "showcase";
    this.turnPumpkin(MOON_GAZE);

    const previousBest = readNumber(BEST_KEY);
    const isBest = this.score > previousBest;
    if (isBest) writeNumber(BEST_KEY, this.score);
    const previousRecord = readNumber(COMBO_KEY);
    const isComboRecord = this.bestCombo > previousRecord;
    if (isComboRecord) writeNumber(COMBO_KEY, this.bestCombo);
    // Online: ask for a name (only for runs that scored) before the board.
    const askName = leaderboardEnabled && this.score > 0;
    if (leaderboardEnabled) this.boardRequest = fetchTop().catch(() => null);
    this.ui.showResults({
      askName: askName ? lastName() : null,
      score: this.score,
      pumpkins: this.pumpkinsSmashed,
      shards: this.shards,
      bestCombo: this.bestCombo,
      best: Math.max(previousBest, this.score),
      isBest: isBest && this.score > 0,
      comboRecord: Math.max(previousRecord, this.bestCombo),
      isComboRecord: isComboRecord && this.bestCombo > 1,
    });
    this.state = askName ? "name" : "results";
  }

  // --- Leaderboard --------------------------------------------------------------

  /** From the title: the moonlit showcase shot with the board. */
  async openBoard() {
    this.state = "board";
    this.sound.blip();
    this.ui.showBoardFromTitle();
    this.cameraMode = "showcase";
    this.turnPumpkin(MOON_GAZE);
    this.dim(0.35);
    const entries = await fetchTop().catch(() => null);
    if (this.state === "board") this.ui.fillBoardFromTitle(entries);
  }

  /** Pages the leaderboard, wherever it is open. */
  turnBoard(step) {
    if (this.ui.board.turn(step)) this.sound.blip();
  }

  closeBoard() {
    this.sound.blip();
    this.ui.hideBoard();
    this.cameraMode = "play";
    this.turnPumpkin(0);
    this.dim(1);
    this.state = "title";
    this.ui.showTitle({ withBoard: true, fast: true });
  }

  onNameAction(action) {
    const entry = this.ui.nameEntry;
    this.sound.blip();
    if (action.type === "nameUp") entry.cycle(action.index, 1);
    if (action.type === "nameDown") entry.cycle(action.index, -1);
    if (action.type === "nameLetter") entry.select(action.index);
    if (action.type === "nameOk") this.submitName();
    if (action.type === "nameSkip") this.showBoard(null);
  }

  onNameKey(e) {
    const entry = this.ui.nameEntry;
    if (/^Key[A-Z]$|^Digit[0-9]$/.test(e.code)) entry.type(e.code.at(-1));
    else if (e.code === "Backspace") entry.backspace();
    else if (e.code === "ArrowUp") entry.cycle(entry.active, 1);
    else if (e.code === "ArrowDown") entry.cycle(entry.active, -1);
    else if (e.code === "ArrowLeft") entry.select(entry.active - 1);
    else if (e.code === "ArrowRight") entry.select(entry.active + 1);
    else if (e.code === "Enter") this.submitName();
    else if (e.code === "Escape") this.showBoard(null);
  }

  async submitName() {
    const name = this.ui.nameEntry.value;
    rememberName(name);
    this.state = "saving";
    this.ui.nameEntry.setStatus(TEXT.saving);
    let rank = null;
    try {
      rank = await submitScore({ name, score: this.score, combo: this.bestCombo, pumpkins: this.pumpkinsSmashed });
      // The board fetched before submitting is stale now.
      this.boardRequest = fetchTop().catch(() => null);
    } catch (error) {
      console.warn("[leaderboard] submit failed", error);
    }
    this.showBoard({ name, score: this.score, best_combo: this.bestCombo, rank });
  }

  /** Leaderboard page; `you` is the run just submitted (null when skipped). */
  async showBoard(you) {
    this.state = "saving";
    const entries = await (this.boardRequest ?? Promise.resolve(null));
    this.ui.showBoard(entries, you);
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

  async spawnPumpkin(variant) {
    // One at a time, and never on top of a pumpkin that's still whole.
    if (this.spawning || (this.pumpkin && this.pumpkin.state !== "broken")) return;
    this.spawning = true;
    let pumpkin;
    try {
      pumpkin = await Pumpkin.create(variant ?? this.nextVariant(), {
        scene: this.scene,
        physics: this.physics,
        pool: this.pool,
      });
    } finally {
      this.spawning = false;
    }
    this.pumpkin = pumpkin;
    pumpkin.spawn(PUMPKIN_SPOT);
    if (this.cameraMode === "showcase") pumpkin.mesh.rotation.y = MOON_GAZE;
  }

  /**
   * Safety net: whatever went wrong, the table is never left empty for long
   * (normally a broken pumpkin is replaced after GAME.nextPumpkinDelay).
   */
  watchPumpkin(dt) {
    const missing = !this.pumpkin || this.pumpkin.state === "broken";
    this.pumpkinMissingFor = missing && !this.spawning ? (this.pumpkinMissingFor ?? 0) + dt : 0;
    if (this.pumpkinMissingFor > GAME.nextPumpkinDelay + 1 && this.state !== "cover") {
      this.pumpkinMissingFor = 0;
      this.spawnPumpkin();
    }
  }

  /** Slowly turns the pumpkin on the table (towards the moon for results). */
  turnPumpkin(angle) {
    const mesh = this.pumpkin?.mesh;
    if (mesh) tweens.to(mesh.rotation, "y", angle, 1.8, { easing: ease.inOutQuad });
  }

  // --- Smashing -----------------------------------------------------------------

  /** One click: one swing of the selected weapon, within its cooldown. */
  async smash() {
    if (this.elapsed < this.cooldownUntil) return;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const targets = this.destruction.targets(this.pumpkin);
    const hit = this.raycaster.intersectObjects(targets, false)[0] ?? this.nearMiss(targets);
    this.ui.strike();
    if (!hit) {
      // A swing at nothing breaks the combo (no cash-out).
      this.sound.whiff();
      if (this.combo > 1) this.endCombo({ cashOut: false });
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
    // Sound on the swing, not when the fracture comes back from the worker.
    this.sound.hit(tool.id, { onPumpkin: Boolean(pumpkin) || hit.object.userData.generation < 99 });
    const direction = this.raycaster.ray.direction.clone();
    let result;
    try {
      result = await this.destruction.hit(hit.object, hit.point, direction, tool);
    } catch (error) {
      // Never let a failed fracture stall the round; the watchdog in frame()
      // brings a new pumpkin if this one was lost.
      console.warn("[smash] hit failed", error);
      return;
    }

    if (result.type === "break") this.sound.burst();
    if (result.type === "dust") this.sound.dust();
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
    const switched = alive && this.lastTool !== null && toolIndex !== this.lastTool;
    if (switched) {
      this.combo += COMBO.switchBonus;
      this.ui.popup(`${TEXT.switched} +${COMBO.switchBonus}`, point, this.camera);
    }
    this.lastTool = toolIndex;
    this.lastHitAt = this.elapsed;
    this.renderer.uniforms.fireTint.value.setRGB(1, 1, 1);
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const rank = this.comboRank();
    const rankUp = rank !== this.comboRank(before);
    this.ui.setCombo(this.combo, rank, this.comboMultiplier(), { rankUp });
    this.sound.comboUp(this.combo, { rankUp, switched, rank });
    return this.comboMultiplier();
  }

  /** The fire vignette follows the combo's heat and eases out when it ends. */
  updateFire(dt) {
    const fire = this.renderer.uniforms.fire;
    const target = this.combo >= 2 ? 0.35 + this.ui.heatFor(this.combo) * 0.65 : 0;
    fire.value += (target - fire.value) * Math.min(1, dt * (target > fire.value ? 8 : 2.5));
  }

  /** Ends the combo: banked (combo^2 bonus) when it runs out, lost on a miss. */
  endCombo({ cashOut }) {
    const combo = this.combo;
    this.combo = 0;
    this.lastTool = null;
    this.ui.hideCombo();
    if (combo < COMBO.minCashOut) return;
    // Banked: a last flare of flames rushing in; broken: a dull red snuff.
    const u = this.renderer.uniforms;
    u.fire.value = cashOut ? 1 + this.ui.heatFor(combo) : 0.8;
    u.fireLeft.value = cashOut ? 0.15 : 0.5;
    u.fireTint.value.setRGB(...(cashOut ? [1, 1, 1] : [0.55, 0.12, 0.25]));
    if (!cashOut) {
      this.sound.broken();
      this.ui.showCashOut(`${TEXT.broken} · x${combo}`, { broken: true, combo });
      return;
    }
    this.sound.cashOut(combo);
    const bonus = Math.round(combo * combo * COMBO.cashOut);
    this.score += bonus;
    this.ui.setScore(this.score);
    this.ui.showCashOut(`x${combo} ${this.comboRank(combo) ?? TEXT.combo}  +${bonus}`, { combo });
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
    this.camera.fov = this.cameraMode === "cover" ? COVER_FOV : Math.max(48, THREE.MathUtils.radToDeg(vertical));
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
    this.watchPumpkin(dt);
    this.destruction.update(dt);
    this.debris.update(dt);
    this.cabin.update(this.elapsed);

    if (this.state === "playing") {
      if (this.combo > 0) {
        const left = 1 - (this.elapsed - this.lastHitAt) / this.comboWindow();
        this.renderer.uniforms.fireLeft.value = Math.max(0, left);
        if (left <= 0) this.endCombo({ cashOut: true });
      }
      this.timeLeft -= dt;
      const seconds = Math.max(0, Math.ceil(this.timeLeft));
      if (seconds !== this.lastSecond && seconds <= 10 && seconds > 0) this.sound.tick(seconds);
      this.lastSecond = seconds;
      this.ui.setTimer(seconds);
      if (this.timeLeft <= 0) this.endRound();
    }

    this.updateFire(dt);
    this.sound.setHeat(this.state === "playing" && this.combo >= 2 ? this.ui.heatFor(this.combo) : 0);
    this.updateCamera(dt);
    const flash = this.renderer.uniforms.flash;
    flash.value = Math.max(0, flash.value - dt * 3);
    this.renderer.render();
  }

  updateCamera(dt) {
    const target = _cameraTarget;
    const look = _lookTarget;
    let roll = 0;
    if (this.cameraMode === "cover") {
      // Held wherever startCover put it.
      target.copy(this.cameraPosition);
      look.copy(this.cameraLook);
    } else if (this.cameraMode === "showcase") {
      // Slow, layered sine drift and roll: the arcade attract-mode float.
      const t = this.elapsed;
      const drift = this.reducedMotion ? 0.3 : 1;
      target.copy(SHOWCASE_POSITION);
      target.x += Math.sin(t * 0.21) * 0.45 * drift;
      target.y += Math.sin(t * 0.33) * 0.12 * drift;
      target.z += Math.sin(t * 0.17) * 0.3 * drift;
      look.copy(SHOWCASE_LOOK);
      look.x += Math.sin(t * 0.19) * 0.6 * drift;
      look.y += Math.sin(t * 0.27) * 0.25 * drift;
      roll = Math.sin(t * 0.23) * 0.03 * drift;
    } else {
      // Gentle parallax towards the pointer.
      const sway = this.ui.pointer.touch || this.reducedMotion ? 0 : 1;
      target.copy(CAMERA_HOME);
      target.x += this.ndc.x * 0.25 * sway;
      target.y += this.ndc.y * 0.12 * sway;
      look.copy(LOOK_AT);
    }
    const blend = 1 - Math.exp(-dt * (this.cameraMode === "showcase" ? 1.1 : 3));
    this.cameraPosition.lerp(target, blend);
    this.cameraLook.lerp(look, blend);

    // Decaying screen shake on top of the smoothed pose.
    this.shake = Math.max(0, this.shake - dt * 2.8);
    const s = this.shake * this.shake * 0.12;
    this.camera.position.copy(this.cameraPosition);
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.lookAt(this.cameraLook);
    this.camera.rotation.z += roll + (Math.random() - 0.5) * s * 0.5;
  }
}

const _cameraTarget = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

async function loadFonts() {
  await previewTitleFont();
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

/**
 * Dev only: ?font=<file> swaps the title face for public/fonts/<file> (or
 * ?gfont=<family> for a Google font), to try candidate fonts in the real scene
 * (see scripts/compare-fonts.mjs).
 */
async function previewTitleFont() {
  const params = new URLSearchParams(location.search);
  // ?gfont=<Google Fonts family> previews a Google font the same way.
  const google = import.meta.env.DEV && params.get("gfont");
  if (google) {
    const link = Object.assign(document.createElement("link"), {
      rel: "stylesheet",
      href: `https://fonts.googleapis.com/css2?family=${google.replace(/ /g, "+")}&display=block`,
    });
    document.head.append(link);
    await new Promise((resolve) => (link.onload = link.onerror = resolve));
    await document.fonts.load(`400 32px "${google}"`);
    FONTS.title = { family: `"${google}", serif`, weight: 400 };
    return;
  }
  const file = import.meta.env.DEV && params.get("font");
  if (!file) return;
  try {
    const face = new FontFace("Preview Title", `url(${import.meta.env.BASE_URL}fonts/${file})`);
    document.fonts.add(await face.load());
    FONTS.title = { family: '"Preview Title", serif', weight: 400 };
  } catch (error) {
    console.warn(`[fonts] could not load fonts/${file}`, error);
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
