import { UIPanel } from "./elements.js";
import { ICONS } from "./icons.js";

function drawIcon(ctx, name, x, y, pixel, color) {
  ctx.fillStyle = color;
  ICONS[name].forEach((row, j) => {
    [...row].forEach((c, i) => {
      if (c === "#") ctx.fillRect(x + i * pixel, y + j * pixel, pixel + 0.5, pixel + 0.5);
    });
  });
}

/**
 * Weapon slot: just the weapon's silhouette in a dark ember-rimmed frame. No
 * text; what each weapon does is for the player to find out.
 */
export function createWeaponSlot(tool) {
  const size = 84;
  const slot = new UIPanel({
    width: size,
    height: size,
    intensity: 1.2,
    draw: (ctx, w, h) => {
      ctx.fillStyle = "rgba(18, 7, 6, 0.88)";
      roundRect(ctx, 3, 3, w - 6, h - 6, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 122, 40, 0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
      drawIcon(ctx, tool.icon, (w - 12 * 5) / 2, (h - 12 * 5) / 2, 5, "#f3e2c0");
    },
  });
  slot.redraw();
  slot.tool = tool;
  return slot;
}

/** The weapon itself, following the pointer and swinging on every blow. */
export function createWeaponCursor(tool) {
  const size = 96;
  const cursor = new UIPanel({
    width: size,
    height: size,
    intensity: 1.8,
    draw: (ctx, w, h) => {
      const pixel = 6.5;
      const x = (w - 12 * pixel) / 2;
      const y = (h - 12 * pixel) / 2;
      // Dark outline first (the icon offset in 8 directions), then the bone fill.
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
        drawIcon(ctx, tool.icon, x + dx * 2.5, y + dy * 2.5, pixel, "#1a0806");
      }
      drawIcon(ctx, tool.icon, x, y, pixel, "#f6e6c4");
    },
  });
  cursor.redraw();
  cursor.renderOrder = 100;
  cursor.swing = 0;
  return cursor;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Cursor reticle drawn on the UI layer (the system cursor is hidden). */
export function createReticle() {
  const size = 44;
  const reticle = new UIPanel({
    width: size,
    height: size,
    intensity: 2.4,
    draw: (ctx, w, h) => {
      const c = w / 2;
      ctx.strokeStyle = "#ffd27a";
      ctx.shadowColor = "#ff5a14";
      ctx.shadowBlur = 6;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(c, c, 13, a - 0.45, a + 0.45);
        ctx.stroke();
      }
      ctx.fillStyle = "#fff1c9";
      ctx.fillRect(c - 2, c - 2, 4, 4);
    },
  });
  reticle.redraw();
  reticle.renderOrder = 100;
  return reticle;
}
