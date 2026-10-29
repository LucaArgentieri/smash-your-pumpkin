import * as THREE from "three/webgpu";
import { TEXT, TOOLS } from "../config.js";
import { tweens, ease } from "../core/Tween.js";
import { UIText } from "./elements.js";
import { createReticle, createWeaponCursor, createWeaponSlot } from "./cards.js";
import { Board, NameEntry } from "./leaderboard.js";

const VIOLET = { colors: ["#e3d6ff", "#9b7bff"], glow: "#4a1f8a", intensity: 1.25 };
const BLOOD = { colors: ["#ffb08a", "#ff2a10"], glow: "#ff1a00" };

// Combo "heat" (0..1) drives the Balatro-style escalation: the higher the
// combo, the bigger, brighter and shakier the numbers get.
const HEAT_COMBO = 40;

/**
 * Every bit of interface, rendered by an orthographic camera into its own
 * pass and composited over the scene. Coordinates are CSS pixels with the
 * origin at the screen centre, y up.
 */
export class UI {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    // Touch-first devices never show a pointer-following cursor, not even
    // before the first tap.
    this.pointer = { x: 0, y: 0, touch: matchMedia("(hover: none)").matches };
    this.k = 1;

    const add = (el) => (this.scene.add(el), el);

    // Title screen.
    this.title1 = add(new UIText({ text: TEXT.title[0], font: "title", size: 150, wobble: 0.012 }));
    this.title2 = add(new UIText({ text: TEXT.title[1], font: "title", size: 80, wobble: 0.012 }));
    this.tagline = add(new UIText({ text: TEXT.tagline, size: 22, ...VIOLET }));
    this.begin = add(new UIText({ text: TEXT.begin, font: "title", size: 66, wobble: 0.03 }));
    this.loading = add(new UIText({ text: TEXT.loading, font: "title", size: 54, width: 700, wobble: 0.03 }));
    this.coverTitle = add(new UIText({ text: TEXT.title.join(" "), font: "title", size: 120, width: 1300, colors: ["#ffb347", "#ff6a10"], glow: "#7a1a00" }));
    this.qualityLabel = add(new UIText({ text: "", size: 16, anchor: "left", width: 260, ...VIOLET }));

    // HUD.
    this.timer = add(new UIText({ text: "60", font: "numbers", size: 104, width: 220 }));
    this.scoreLabel = add(new UIText({ text: TEXT.score, size: 20, anchor: "left", width: 200, ...VIOLET }));
    this.scoreValue = add(new UIText({ text: "0", font: "numbers", size: 64, anchor: "left", width: 210 }));
    this.pumpkinsLabel = add(new UIText({ text: TEXT.pumpkins, size: 20, anchor: "right", width: 200, ...VIOLET }));
    this.pumpkinsValue = add(new UIText({ text: "0", font: "numbers", size: 64, anchor: "right", width: 160 }));
    // Combo, split like Balatro's chips x mult: count, multiplier and rank.
    this.comboCount = add(new UIText({ text: "x2", font: "numbers", size: 64, anchor: "top-right", width: 190 }));
    this.comboMult = add(new UIText({ text: "1.05x", font: "numbers", size: 56, anchor: "top-left", width: 230, ...BLOOD }));
    this.comboRank = add(new UIText({ text: "", font: "title", size: 38, anchor: "top", width: 560, wobble: 0.03 }));
    this.cashOut = add(new UIText({ text: "", font: "title", size: 46, anchor: "top", width: 760, wobble: 0.03 }));
    // Balatro / Vampire Survivors escalation: at full heat the count more than
    // doubles and the multiplier nearly triples.
    this.comboCount.heatGain = 1.5;
    this.comboMult.heatGain = 1.8;
    this.comboRank.heatGain = 0.8;
    for (const el of [this.comboCount, this.comboMult, this.comboRank, this.cashOut]) el.sway = 0.06;
    this.comboParts = [this.comboCount, this.comboMult, this.comboRank];
    this.heat = 0;
    this.displayScore = 0;
    this.targetScore = 0;

    // Big centre messages: READY / SMASH / TIME'S UP.
    this.big = add(new UIText({ text: TEXT.timeUp, font: "title", size: 150, width: 980, wobble: 0.02 }));

    // Results.
    this.resultsTitle = add(new UIText({ text: TEXT.results, font: "title", size: 72, width: 980, wobble: 0.01 }));
    this.rows = [TEXT.pumpkins, TEXT.shards, TEXT.bestCombo].map((label) => ({
      label: add(new UIText({ text: label, size: 28, anchor: "left", width: 300, ...VIOLET, backdrop: "rgba(8, 3, 12, 0.6)" })),
      value: add(new UIText({ text: "0", font: "numbers", size: 46, anchor: "right", width: 220 })),
    }));
    this.finalScore = add(new UIText({ text: "0", font: "numbers", size: 110, width: 620, wobble: 0.015 }));
    this.bestLine = add(new UIText({ text: "", size: 24, width: 520, ...VIOLET, backdrop: "rgba(8, 3, 12, 0.6)" }));
    this.recordLine = add(new UIText({ text: "", size: 24, width: 520, ...VIOLET, backdrop: "rgba(8, 3, 12, 0.6)" }));
    this.again = add(new UIText({ text: TEXT.again, font: "title", size: 76, wobble: 0.03 }));

    // Leaderboard: name entry on the results page, then the board.
    this.nameEntry = new NameEntry(add);
    this.board = new Board(add);

    // Weapon slots (only during a round) and the weapon that follows the
    // pointer. No explanations: players learn each weapon by using it.
    this.slots = TOOLS.map((tool) => {
      const slot = add(createWeaponSlot(tool));
      slot.lift = 0;
      return slot;
    });
    this.weapons = TOOLS.map((tool) => add(createWeaponCursor(tool)));
    this.selected = 0;
    this.playing = false;

    this.popups = Array.from({ length: 10 }, () => {
      const p = add(new UIText({ text: "", font: "numbers", size: 44, width: 280 }));
      p.renderOrder = 50;
      return p;
    });
    this.popupCursor = 0;

    this.reticle = add(createReticle());
    this.reticle.u.reveal.value = 1;
    this.reticle.baseScale = 1;
    this.applyScale(this.reticle);

    this.layout(window.innerWidth, window.innerHeight);
  }

  // --- Layout -------------------------------------------------------------------

  layout(w, h) {
    this.w = w;
    this.h = h;
    // Narrow screens get relatively larger UI so text stays readable on phones.
    const k = (this.k = Math.min(1.3, Math.max(0.5, Math.min(w / 520, h / 720))));
    Object.assign(this.camera, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
    this.camera.updateProjectionMatrix();

    const top = h / 2;
    const bottom = -h / 2;
    const left = -w / 2;
    const right = w / 2;
    const margin = Math.max(18, 34 * k);
    const fitWidth = w - margin * 2;

    const place = (el, x, y, maxWidth = fitWidth) => {
      el.home = { x, y };
      el.maxScale = maxWidth / el.boxWidth;
      el.layoutScale = Math.min(k, el.maxScale);
      this.heatScale(el);
      el.position.set(x, y, 0);
    };

    place(this.title1, 0, top - 125 * k);
    place(this.title2, 0, top - 230 * k);
    place(this.tagline, 0, top - 290 * k);
    place(this.begin, 0, bottom + 150 * k);
    place(this.loading, 0, 0);
    place(this.coverTitle, 0, -0.02 * h);
    // Top-left: only shown on title and results, when the HUD is hidden.
    place(this.qualityLabel, left + margin * 0.6, top - Math.max(16, 20 * k), w * 0.5);

    place(this.timer, 0, top - 70 * k);
    place(this.scoreLabel, left + margin, top - 34 * k);
    place(this.scoreValue, left + margin, top - 68 * k, w / 2 - margin - 60 * k);
    place(this.pumpkinsLabel, right - margin, top - 34 * k);
    place(this.pumpkinsValue, right - margin, top - 68 * k, w / 2 - margin - 60 * k);
    // The combo hangs from a fixed top edge and grows downwards; rank and
    // cash-out follow its bottom edge every frame (see updateJuice). On narrow
    // screens it starts smaller so it has room to grow.
    const comboBase = w < 700 ? 0.65 : 1;
    place(this.comboCount, -8 * k, top - 135 * k, w / 2 - 6);
    place(this.comboMult, 8 * k, top - 135 * k, w / 2 - 6);
    place(this.comboRank, 0, top - 210 * k);
    place(this.cashOut, 0, top - 260 * k);
    for (const el of [this.comboCount, this.comboMult, this.comboRank, this.cashOut]) {
      el.layoutScale = Math.min(el.maxScale, k * comboBase);
      this.heatScale(el);
    }
    place(this.big, 0, 40 * k);

    // Results hide the weapon slots, so they can use the whole height.
    place(this.resultsTitle, 0, top - 100 * k);
    const column = Math.min(520 * k, fitWidth);
    this.rows.forEach((row, i) => {
      const y = top - 185 * k - i * 50 * k;
      place(row.label, -column / 2, y, column * 0.6);
      place(row.value, column / 2, y, column * 0.4);
    });
    place(this.finalScore, 0, top - 345 * k);
    place(this.bestLine, 0, top - 420 * k);
    place(this.recordLine, 0, top - 452 * k);
    place(this.again, 0, bottom + 120 * k);
    this.nameEntry.layout(place, { k, bottom });
    this.board.layout(place, { k, top, fitWidth });

    const spacing = 100 * k;
    this.slots.forEach((slot, i) => place(slot, (i - 1) * spacing, bottom + 70 * k));
    for (const weapon of this.weapons) {
      weapon.layoutScale = k;
      this.heatScale(weapon);
    }
  }

  /** Layout scale grown by the current heat, never wider than its slot. */
  heatScale(el, heat = this.heat) {
    el.baseScale = Math.min(el.maxScale ?? Infinity, el.layoutScale * (1 + (el.heatGain ?? 0) * heat));
    this.applyScale(el);
  }

  applyScale(el) {
    const s = el.baseScale * (1 + (el.punch ?? 0) * 0.3);
    el.scale.set(el.boxWidth * s * (el.fill ?? 1), el.boxHeight * s, 1);
  }

  punch(el, amount = 1) {
    el.punch = amount;
  }

  // --- Screens ------------------------------------------------------------------

  showTitle() {
    this.title1.show({ duration: 1.3, delay: 0.2 });
    this.title2.show({ duration: 1.1, delay: 0.7 });
    this.tagline.show({ duration: 1, delay: 1.2 });
    this.begin.show({ duration: 0.9, delay: 1.6 });
    this.qualityLabel.show({ duration: 0.6, delay: 2.2 });
  }

  /** Key-art mode: just the title, fully shown. */
  showCover() {
    this.coverTitle.u.reveal.value = 1;
    this.coverTitle.u.intensity.value = 2;
    this.reticle.visible = false;
    this.pointer.touch = true;
  }

  showLoading() {
    this.loading.show({ duration: 1 });
  }

  hideLoading() {
    this.loading.hide({ duration: 0.5 });
  }

  setQualityLabel(text) {
    this.qualityLabel.setText(`${TEXT.quality}: ${text}  [Q]`);
  }

  hideTitle() {
    [this.title1, this.title2, this.tagline, this.begin, this.qualityLabel].forEach((el, i) =>
      el.hide({ duration: 0.5, delay: i * 0.05 }),
    );
  }

  /** Round on/off: weapon slots appear and the pointer becomes the weapon. */
  setPlaying(playing) {
    this.playing = playing;
    this.slots.forEach((slot, i) =>
      playing ? slot.show({ duration: 0.6, delay: i * 0.1 }) : slot.hide({ duration: 0.5, delay: i * 0.08 }),
    );
    if (playing) this.select(this.selected);
    else this.weapons.forEach((w) => w.hide({ duration: 0.3 }));
  }

  /** A swing: the weapon strikes (on touch it appears where you tapped). */
  strike() {
    const weapon = this.weapons[this.selected];
    weapon.swing = 1;
    if (this.pointer.touch) {
      weapon.u.reveal.value = 1;
      tweens.kill(weapon.u.reveal, "value");
      if (this.strikeTimer) tweens.cancel(this.strikeTimer);
      this.strikeTimer = tweens.after(0.3, () => weapon.hide({ duration: 0.25 }));
    }
  }

  showHUD() {
    [this.timer, this.scoreLabel, this.scoreValue, this.pumpkinsLabel, this.pumpkinsValue].forEach((el, i) =>
      el.show({ duration: 0.6, delay: i * 0.06 }),
    );
  }

  hideHUD() {
    [this.timer, this.scoreLabel, this.scoreValue, this.pumpkinsLabel, this.pumpkinsValue, ...this.comboParts].forEach((el) =>
      el.hide({ duration: 0.5 }),
    );
  }

  /** Big centred word that burns in, lingers and burns away. */
  announce(text, { hold = 0.6, style } = {}) {
    return new Promise((resolve) => {
      const big = this.big;
      big.setText(text);
      big.u.reveal.value = 0;
      this.punch(big, 0.6);
      big.show({ duration: 0.35 });
      tweens.after(0.35 + hold, () => {
        big.hide({ duration: 0.45 });
        tweens.after(0.45, resolve);
      });
      big.u.intensity.value = style === "blood" ? 2.2 : 1.6;
    });
  }

  /** `askName`: show the name entry (leaderboard online) instead of AGAIN. */
  showResults({ score, pumpkins, shards, bestCombo, best, isBest, comboRecord, isComboRecord, askName = null }) {
    this.resultsTitle.show({ duration: 1.4, delay: 0.1 });
    const values = [pumpkins, shards, `x${bestCombo}`];
    this.rows.forEach((row, i) => {
      row.value.setText(String(values[i]));
      row.label.show({ duration: 0.6, delay: 0.9 + i * 0.25 });
      row.value.show({ duration: 0.6, delay: 1.0 + i * 0.25 });
    });

    this.finalScore.setText("0");
    this.finalScore.show({ duration: 0.8, delay: 1.8 });
    const counter = { value: 0 };
    tweens.to(counter, "value", score, 1.2, {
      delay: 1.9,
      easing: ease.outCubic,
      onUpdate: (v) => this.finalScore.setText(String(Math.round(v))),
      onComplete: () => this.punch(this.finalScore, 0.8),
    });

    this.bestLine.setText(isBest ? `~ ${TEXT.newBest} ~` : `${TEXT.best}  ${best}`);
    this.bestLine.show({ duration: 0.8, delay: 3.1 });
    this.recordLine.setText(isComboRecord ? `~ ${TEXT.newComboRecord} x${comboRecord} ~` : `${TEXT.comboRecord}  x${comboRecord}`);
    this.recordLine.show({ duration: 0.8, delay: 3.25 });
    if (askName) this.nameEntry.show(askName, 3.4);
    else this.again.show({ duration: 0.9, delay: 3.4 });
    this.qualityLabel.show({ duration: 0.6, delay: 3.6 });
  }

  /** Swaps the results page for the leaderboard, with AGAIN under it. */
  showBoard(entries, you) {
    this.hideResults({ keepQuality: true });
    this.board.show(entries, you, 0.4);
    this.again.show({ duration: 0.9, delay: 1.4 });
  }

  hideResults({ keepQuality = false } = {}) {
    [this.resultsTitle, ...this.rows.flatMap((r) => [r.label, r.value]), this.finalScore, this.bestLine, this.recordLine, this.again].forEach(
      (el, i) => el.hide({ duration: 0.5, delay: i * 0.03 }),
    );
    if (!keepQuality) this.qualityLabel.hide({ duration: 0.5 });
    this.nameEntry.hide();
    this.board.hide();
  }

  // --- HUD updates -------------------------------------------------------------

  setTimer(seconds) {
    const text = String(seconds);
    if (this.timer.text === text) return;
    this.timer.setText(text);
    if (seconds <= 10) {
      this.timer.u.intensity.value = 2.4;
      this.punch(this.timer, 0.7);
    } else {
      this.timer.u.intensity.value = 1.5;
    }
  }

  /** The score rolls up to its new value; bigger gains kick harder. */
  setScore(score) {
    const gain = score - this.targetScore;
    this.targetScore = score;
    if (gain <= 0) {
      this.displayScore = score;
      this.scoreValue.setText(String(score));
      return;
    }
    this.punch(this.scoreValue, Math.min(1.5, 0.3 + gain / 400));
  }

  setPumpkins(count) {
    this.pumpkinsValue.setText(String(count));
    this.punch(this.pumpkinsValue, 0.8);
  }

  heatFor(combo) {
    return Math.min(1, Math.max(0, combo - 1) / HEAT_COMBO);
  }

  /** Combo count, multiplier and rank; they grow and burn hotter with it. */
  setCombo(combo, rank, multiplier, { rankUp = false } = {}) {
    if (combo < 2) return;
    this.heat = this.heatFor(combo);
    const h = this.heat;
    this.comboCount.setText(`x${combo}`);
    this.comboMult.setText(`${multiplier.toFixed(2)}x`);
    this.comboRank.setText(rank ?? TEXT.combo);
    for (const el of [this.comboCount, this.comboMult, this.comboRank]) {
      this.heatScale(el);
      el.u.intensity.value = 1.5 + h * 2 + (rankUp ? 1.5 : 0);
      this.punch(el, (rankUp ? 1.6 : 0.6) + h);
    }
    for (const el of this.comboParts) {
      if (el.u.reveal.value < 1) el.show({ duration: 0.25 });
    }
  }

  hideCombo() {
    this.heat = 0;
    for (const el of this.comboParts) el.hide({ duration: 0.4 });
  }

  /** Big line under the combo when it is banked (or lost), sized by the combo. */
  showCashOut(text, { broken = false, combo = 0 } = {}) {
    const el = this.cashOut;
    const h = this.heatFor(combo);
    el.setText(text);
    el.heatGain = broken ? 0 : 1.2;
    this.heatScale(el, h);
    el.shake = broken ? 0 : h;
    el.u.intensity.value = broken ? 1.2 : 2.6 + h * 2;
    el.u.reveal.value = 0;
    this.punch(el, 1 + h);
    el.show({ duration: 0.2 });
    if (this.cashOutTimer) tweens.cancel(this.cashOutTimer);
    this.cashOutTimer = tweens.after(1.3, () => el.hide({ duration: 0.6 }));
  }

  /** Floating "+120" burnt into the air at a world position. */
  popup(text, worldPoint, camera, { blood = false } = {}) {
    const p = this.popups[this.popupCursor];
    this.popupCursor = (this.popupCursor + 1) % this.popups.length;
    const v = worldPoint.clone().project(camera);
    const x = THREE.MathUtils.clamp((v.x * this.w) / 2, -this.w / 2 + 80, this.w / 2 - 80);
    const y = (v.y * this.h) / 2 + 30 * this.k;

    p.setText(text);
    p.baseScale = this.k * (blood ? 1.15 : 0.9) * (1 + this.heat * 2);
    p.punch = 0.5 + this.heat;
    p.rotation.z = (Math.random() - 0.5) * 0.2 * (0.5 + this.heat);
    p.u.intensity.value = (blood ? 2.4 : 1.7) + this.heat * 2;
    p.position.set(x + (Math.random() - 0.5) * 30 * this.k, y, 0);
    p.u.reveal.value = 0;
    tweens.kill(p.u.reveal, "value");
    p.show({ duration: 0.18 });
    tweens.to(p.position, "y", y + 90 * this.k, 1.1, { easing: ease.outCubic });
    tweens.after(0.45, () => p.hide({ duration: 0.55 }));
  }

  // --- Input --------------------------------------------------------------------

  select(index) {
    this.selected = index;
    this.slots.forEach((slot, i) => {
      tweens.to(slot.u.highlight, "value", i === index ? 1 : 0, 0.2);
      tweens.to(slot.u.intensity, "value", i === index ? 1.6 : 0.7, 0.2);
    });
    this.weapons.forEach((weapon, i) => {
      if (i !== index) weapon.u.reveal.value = 0;
    });
    this.punch(this.slots[index], 0.6);
  }

  movePointer(x, y, touch) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.touch = touch;
    this.pointer.seen = true;
    for (const slot of this.slots) {
      const over = !touch && slot.contains(x, y);
      if (over !== slot.hovered) {
        slot.hovered = over;
        tweens.to(slot.u.hover, "value", over ? 0.5 : 0, 0.15);
      }
    }
    for (const button of [this.begin, this.again, this.qualityLabel]) {
      const over = !touch && button.contains(x, y, 20);
      if (over !== button.hovered) {
        button.hovered = over;
        tweens.to(button.u.hover, "value", over ? 1 : 0, 0.15);
      }
    }
  }

  /** Returns the UI action under the pointer, if any. */
  pick(x, y) {
    const name = this.nameEntry.pick(x, y);
    if (name) return name;
    const slot = this.slots.findIndex((c) => c.contains(x, y, 10));
    if (slot !== -1) return { type: "tool", index: slot };
    if (this.begin.contains(x, y, 20)) return { type: "begin" };
    if (this.qualityLabel.contains(x, y, 12)) return { type: "quality" };
    if (this.again.contains(x, y, 20)) return { type: "again" };
    return null;
  }

  update(dt) {
    // Fully burnt-out panels leave the draw list (after the first frames,
    // which compile every panel's shader up front).
    this.warmFrames = (this.warmFrames ?? 3) - 1;
    for (const el of this.scene.children) {
      if (el.u && el !== this.reticle && this.warmFrames < 0) el.visible = el.u.reveal.value > 0.001;
    }
    for (const el of this.scene.children) {
      if (el.punch) {
        el.punch = Math.max(0, el.punch - dt * 4);
        this.applyScale(el);
      }
    }
    for (const [i, slot] of this.slots.entries()) {
      const target = (i === this.selected ? 14 : 0) + (slot.hovered ? 5 : 0);
      slot.lift += (target - slot.lift) * Math.min(1, dt * 12);
      slot.position.y = slot.home.y + slot.lift * this.k;
    }
    this.updateWeapon(dt);

    this.time = (this.time ?? 0) + dt;
    this.updateJuice(dt);
  }

  /**
   * During a round the pointer is the selected weapon (on touch it only
   * shows up on a tap); otherwise a small reticle.
   */
  updateWeapon(dt) {
    const { x, y, touch, seen } = this.pointer;
    const weapon = this.weapons[this.selected];
    const mouseWeapon = this.playing && !touch && seen;
    this.reticle.visible = !this.playing && !touch && seen;
    this.reticle.position.set(x, y, 0);
    if (mouseWeapon) weapon.u.reveal.value = 1;

    // Resting tilted back, snapping forward on a blow, the head over the pointer.
    weapon.swing = Math.max(0, weapon.swing - dt * 6);
    const s = weapon.swing;
    weapon.rotation.z = -0.35 + Math.sin(s * Math.PI * 0.5) * 1.05;
    weapon.position.set(x + 26 * this.k, y - 22 * this.k, 0);
    weapon.punch = s * 0.6;
    this.applyScale(weapon);
  }

  /** Sway and shake of hot text, and the rolling score counter. */
  updateJuice(dt) {
    const t = this.time;
    // Rank hangs under the (growing) combo numbers, the cash-out under the rank.
    const comboBottom = this.comboCount.home.y - Math.max(this.comboCount.scale.y, this.comboMult.scale.y) * 0.8;
    this.comboRank.home.y = comboBottom;
    this.cashOut.home.y = this.comboRank.u.reveal.value > 0.01 ? comboBottom - this.comboRank.scale.y * 0.85 : comboBottom;
    for (const el of [this.comboCount, this.comboMult, this.comboRank, this.cashOut]) {
      const heat = el === this.cashOut ? (el.shake ?? 0) : this.heat;
      el.rotation.z = Math.sin(t * (2 + heat * 4) + el.u.seed.value) * el.sway * (0.3 + heat * 1.4);
      // Past half heat the numbers start to tremble.
      const tremble = Math.max(0, heat - 0.4) * 7 * this.k;
      el.position.x = el.home.x + (Math.random() - 0.5) * tremble;
      el.position.y = el.home.y + (Math.random() - 0.5) * tremble;
    }

    if (this.displayScore !== this.targetScore) {
      const step = Math.max(1, Math.ceil((this.targetScore - this.displayScore) * Math.min(1, dt * 10)));
      this.displayScore = Math.min(this.targetScore, this.displayScore + step);
      this.scoreValue.setText(String(this.displayScore));
    }
  }
}
