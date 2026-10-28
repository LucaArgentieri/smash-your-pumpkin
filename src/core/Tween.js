// Tiny tween/timer runner driven by the game loop, so every animation shares
// the same clock (and pauses with it).

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

class Tweener {
  constructor() {
    this.items = [];
  }

  /**
   * Animates `target[key]` to `to`. `target` may be a TSL uniform (animates
   * `.value`) or any plain object.
   */
  to(target, key, to, duration, { delay = 0, easing = ease.outCubic, onUpdate, onComplete } = {}) {
    this.kill(target, key);
    const item = {
      target,
      key,
      from: null,
      to,
      duration: Math.max(duration, 1e-4),
      delay,
      elapsed: 0,
      easing,
      onUpdate,
      onComplete,
    };
    this.items.push(item);
    return item;
  }

  after(delay, fn) {
    const item = { delay, elapsed: 0, duration: 0, call: fn };
    this.items.push(item);
    return item;
  }

  kill(target, key) {
    this.items = this.items.filter((i) => !(i.target === target && i.key === key));
  }

  cancel(item) {
    const index = this.items.indexOf(item);
    if (index !== -1) this.items.splice(index, 1);
  }

  update(dt) {
    const done = [];
    for (const item of this.items) {
      if (item.delay > 0) {
        item.delay -= dt;
        if (item.delay > 0) continue;
      }
      if (item.call) {
        done.push(item);
        continue;
      }
      if (item.from === null) item.from = item.target[item.key];
      item.elapsed += dt;
      const t = Math.min(item.elapsed / item.duration, 1);
      item.target[item.key] = item.from + (item.to - item.from) * item.easing(t);
      item.onUpdate?.(item.target[item.key]);
      if (t >= 1) done.push(item);
    }
    if (done.length === 0) return;
    this.items = this.items.filter((i) => !done.includes(i));
    for (const item of done) {
      if (item.call) item.call();
      else item.onComplete?.();
    }
  }
}

export const tweens = new Tweener();
