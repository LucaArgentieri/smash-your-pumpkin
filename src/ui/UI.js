import * as THREE from "three/webgpu";
import { TEXT, TOOLS } from "../config.js";
import { tweens, ease } from "../core/Tween.js";
import { UIText } from "./elements.js";
import { createComboBar, createReticle, createToolCard } from "./cards.js";

const VIOLET = { colors: ["#e3d6ff", "#9b7bff"], glow: "#4a1f8a", intensity: 1.25 };
const BLOOD = { colors: ["#ffb08a", "#ff2a10"], glow: "#ff1a00" };

/**
 * Every bit of interface, rendered by an orthographic camera into its own
 * pass and composited over the scene. Coordinates are CSS pixels with the
 * origin at the screen centre, y up.
 */
export class UI {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.pointer = { x: 0, y: 0, touch: false };
    this.k = 1;

    const add = (el) => (this.scene.add(el), el);

    // Title screen.
    this.title1 = add(new UIText({ text: TEXT.title[0], font: "title", size: 150, wobble: 0.012 }));
    this.title2 = add(new UIText({ text: TEXT.title[1], font: "title", size: 80, wobble: 0.012 }));
    this.tagline = add(new UIText({ text: TEXT.tagline, size: 22, ...VIOLET }));
    this.rules = TEXT.rules.map((line) => add(new UIText({ text: line, size: 17, colors: ["#ffe9c4", "#ffb36a"], glow: "#5a1f0a", intensity: 1.2, backdrop: "rgba(8, 3, 12, 0.72)" })));
    this.begin = add(new UIText({ text: TEXT.begin, font: "title", size: 66, wobble: 0.03 }));
    // Describes the selected weapon; also flashes up mid-round on a switch.
    this.hint = add(new UIText({ text: "", size: 18, width: 520, ...VIOLET, backdrop: "rgba(8, 3, 12, 0.72)" }));
    this.loading = add(new UIText({ text: TEXT.loading, font: "title", size: 54, width: 700, wobble: 0.03 }));
    this.qualityLabel = add(new UIText({ text: "", size: 16, anchor: "left", width: 260, ...VIOLET }));

    // HUD.
    this.timer = add(new UIText({ text: "60", font: "numbers", size: 104, width: 220 }));
    this.scoreLabel = add(new UIText({ text: TEXT.score, size: 20, anchor: "left", width: 200, ...VIOLET }));
    this.scoreValue = add(new UIText({ text: "0", font: "numbers", size: 64, anchor: "left", width: 260 }));
    this.pumpkinsLabel = add(new UIText({ text: TEXT.pumpkins, size: 20, anchor: "right", width: 200, ...VIOLET }));
    this.pumpkinsValue = add(new UIText({ text: "0", font: "numbers", size: 64, anchor: "right", width: 160 }));
    this.combo = add(new UIText({ text: "x2 COMBO", font: "title", size: 54, width: 620, wobble: 0.04 }));
    this.comboBar = add(createComboBar());
    this.cashOut = add(new UIText({ text: "", font: "title", size: 46, width: 700, wobble: 0.03 }));

    // Big centre messages: READY / SMASH / TIME'S UP.
    this.big = add(new UIText({ text: TEXT.timeUp, font: "title", size: 150, width: 980, wobble: 0.02 }));

    // Results.
    this.resultsTitle = add(new UIText({ text: TEXT.results, font: "title", size: 72, width: 980, wobble: 0.01 }));
    this.rows = [TEXT.pumpkins, TEXT.shards, TEXT.bestCombo].map((label) => ({
      label: add(new UIText({ text: label, size: 28, anchor: "left", width: 300, ...VIOLET })),
      value: add(new UIText({ text: "0", font: "numbers", size: 46, anchor: "right", width: 220 })),
    }));
    this.finalScore = add(new UIText({ text: "0", font: "numbers", size: 110, width: 620, wobble: 0.015 }));
    this.bestLine = add(new UIText({ text: "", size: 24, width: 520, ...VIOLET }));
    this.recordLine = add(new UIText({ text: "", size: 24, width: 520, ...VIOLET }));
    this.again = add(new UIText({ text: TEXT.again, font: "title", size: 76, wobble: 0.03 }));

    // Tool cards.
    this.cards = TOOLS.map((tool, i) => {
      const card = add(createToolCard(tool, i));
      card.lift = 0;
      return card;
    });
    this.selected = 0;

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
    const k = (this.k = Math.min(1.3, Math.max(0.5, Math.min(w / 640, h / 720))));
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
      const fit = Math.min(1, maxWidth / (el.boxWidth * k));
      el.baseScale = k * fit;
      this.applyScale(el);
      el.position.set(x, y, 0);
    };

    place(this.title1, 0, top - 125 * k);
    place(this.title2, 0, top - 230 * k);
    place(this.tagline, 0, top - 290 * k);
    this.rules.forEach((line, i) => place(line, 0, top - 314 * k - i * 21 * k));
    place(this.begin, 0, bottom + 296 * k);
    // Clear of the selected card, which lifts above its row.
    place(this.hint, 0, bottom + 250 * k);
    place(this.loading, 0, 0);
    // Top-left: only shown on title and results, when the HUD is hidden.
    place(this.qualityLabel, left + margin * 0.6, top - Math.max(16, 20 * k), w * 0.5);

    place(this.timer, 0, top - 70 * k);
    place(this.scoreLabel, left + margin, top - 34 * k);
    place(this.scoreValue, left + margin, top - 80 * k, w / 2 - margin - 110 * k);
    place(this.pumpkinsLabel, right - margin, top - 34 * k);
    place(this.pumpkinsValue, right - margin, top - 80 * k, w / 2 - margin - 110 * k);
    place(this.combo, 0, top - 160 * k);
    place(this.comboBar, 0, top - 198 * k);
    place(this.cashOut, 0, top - 245 * k);
    place(this.big, 0, 40 * k);

    // Results hide the cards, so they can use the whole height.
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

    const spacing = Math.min(150 * k, (w - margin * 2) / 3);
    this.cards.forEach((card, i) => {
      place(card, (i - 1) * spacing, bottom + 115 * k);
      card.baseScale = Math.min(k, (spacing * 0.92) / card.boxWidth);
      this.applyScale(card);
    });
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
    this.rules.forEach((line, i) => line.show({ duration: 0.8, delay: 1.4 + i * 0.15 }));
    this.begin.show({ duration: 0.9, delay: 1.9 });
    this.describeTool(this.selected);
    this.hint.show({ duration: 0.8, delay: 2.1 });
    this.showCards(1.9);
    this.qualityLabel.show({ duration: 0.6, delay: 2.2 });
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
    [this.title1, this.title2, this.tagline, ...this.rules, this.begin, this.hint, this.qualityLabel].forEach((el, i) =>
      el.hide({ duration: 0.5, delay: i * 0.05 }),
    );
  }

  showCards(delay = 0) {
    this.cards.forEach((card, i) => card.show({ duration: 0.7, delay: delay + i * 0.12 }));
    this.select(this.selected);
  }

  hideCards() {
    this.cards.forEach((card, i) => card.hide({ duration: 0.5, delay: i * 0.08 }));
  }

  showHUD() {
    [this.timer, this.scoreLabel, this.scoreValue, this.pumpkinsLabel, this.pumpkinsValue].forEach((el, i) =>
      el.show({ duration: 0.6, delay: i * 0.06 }),
    );
  }

  hideHUD() {
    [this.timer, this.scoreLabel, this.scoreValue, this.pumpkinsLabel, this.pumpkinsValue, this.combo, this.comboBar, this.hint].forEach((el) =>
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

  showResults({ score, pumpkins, shards, bestCombo, best, isBest, comboRecord, isComboRecord }) {
    this.hideCards();
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
    this.again.show({ duration: 0.9, delay: 3.4 });
    this.qualityLabel.show({ duration: 0.6, delay: 3.6 });
  }

  hideResults() {
    [this.resultsTitle, ...this.rows.flatMap((r) => [r.label, r.value]), this.finalScore, this.bestLine, this.recordLine, this.again, this.qualityLabel].forEach(
      (el, i) => el.hide({ duration: 0.5, delay: i * 0.03 }),
    );
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

  setScore(score) {
    this.scoreValue.setText(String(score));
    this.punch(this.scoreValue, 0.5);
  }

  setPumpkins(count) {
    this.pumpkinsValue.setText(String(count));
    this.punch(this.pumpkinsValue, 0.8);
  }

  /** Combo counter with its rank and multiplier; `rankUp` makes it flare. */
  setCombo(combo, rank, multiplier, { rankUp = false } = {}) {
    if (combo < 2) return;
    this.combo.setText(`x${combo} ${rank ?? TEXT.combo}  ·  ${multiplier.toFixed(2)}x`);
    this.combo.u.intensity.value = rankUp ? 3 : 1.6;
    this.punch(this.combo, rankUp ? 1.2 : 0.5);
    for (const el of [this.combo, this.comboBar]) {
      if (el.u.reveal.value < 1) el.show({ duration: 0.25 });
    }
  }

  /** Fraction of the combo window left, drawn as the draining bar. */
  setComboTimer(fraction) {
    this.comboBar.fill = Math.max(0, fraction);
    this.applyScale(this.comboBar);
  }

  hideCombo() {
    this.combo.hide({ duration: 0.4 });
    this.comboBar.hide({ duration: 0.3 });
  }

  /** Big line under the combo when it is banked (or lost). */
  showCashOut(text, { broken = false } = {}) {
    const el = this.cashOut;
    el.setText(text);
    el.u.intensity.value = broken ? 1.2 : 2.6;
    el.u.reveal.value = 0;
    this.punch(el, 1);
    el.show({ duration: 0.2 });
    if (this.cashOutTimer) tweens.cancel(this.cashOutTimer);
    this.cashOutTimer = tweens.after(1.3, () => el.hide({ duration: 0.6 }));
  }

  /** Shows what the selected weapon is for under the cards. */
  describeTool(index, { flash = false } = {}) {
    const tool = TOOLS[index];
    this.hint.setText(`${tool.name} · ${tool.description}`);
    if (!flash) return;
    this.hint.u.reveal.value = 0;
    this.hint.show({ duration: 0.25 });
    if (this.hintTimer) tweens.cancel(this.hintTimer);
    this.hintTimer = tweens.after(2.4, () => this.hint.hide({ duration: 0.5 }));
  }

  /** Floating "+120" burnt into the air at a world position. */
  popup(text, worldPoint, camera, { blood = false } = {}) {
    const p = this.popups[this.popupCursor];
    this.popupCursor = (this.popupCursor + 1) % this.popups.length;
    const v = worldPoint.clone().project(camera);
    const x = THREE.MathUtils.clamp((v.x * this.w) / 2, -this.w / 2 + 80, this.w / 2 - 80);
    const y = (v.y * this.h) / 2 + 30 * this.k;

    p.setText(text);
    p.baseScale = this.k * (blood ? 1.15 : 0.9);
    p.punch = 0.5;
    p.u.intensity.value = blood ? 2.4 : 1.7;
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
    this.cards.forEach((card, i) => {
      tweens.to(card.u.highlight, "value", i === index ? 1 : 0, 0.25);
    });
  }

  movePointer(x, y, touch) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.touch = touch;
    this.pointer.seen = true;
    for (const card of this.cards) {
      const over = !touch && card.contains(x, y);
      if (over !== card.hovered) {
        card.hovered = over;
        tweens.to(card.u.hover, "value", over ? 0.5 : 0, 0.15);
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
    const card = this.cards.findIndex((c) => c.contains(x, y));
    if (card !== -1) return { type: "tool", index: card };
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
    for (const [i, card] of this.cards.entries()) {
      const target = (i === this.selected ? 22 : 0) + (card.hovered ? 8 : 0);
      card.lift += (target - card.lift) * Math.min(1, dt * 12);
      card.position.y = card.home.y + card.lift * this.k;
    }
    this.reticle.visible = !this.pointer.touch && this.pointer.seen;
    this.reticle.position.set(this.pointer.x, this.pointer.y, 0);
  }
}
