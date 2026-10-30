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
 * text; what each weapon does is for the player to find out. `charge` (0..1)
 * fills the frame with embers from the bottom; until it is full the weapon
 * is a dim shadow.
 */
export function createWeaponSlot(tool) {
  const size = 84;
  const slot = new UIPanel({
    width: size,
    height: size,
    intensity: 1.2,
    draw: (ctx, w, h, charge = 1) => {
      const ready = charge >= 1;
      ctx.fillStyle = "rgba(18, 7, 6, 0.88)";
      roundRect(ctx, 3, 3, w - 6, h - 6, 10);
      ctx.fill();
      if (tool.charge) {
        // Embers rising with the charge, clipped to the frame.
        ctx.save();
        ctx.clip();
        const top = 3 + (h - 6) * (1 - charge);
        const embers = ctx.createLinearGradient(0, top, 0, h);
        embers.addColorStop(0, ready ? "rgba(255, 150, 50, 0.55)" : "rgba(255, 90, 20, 0.45)");
        embers.addColorStop(1, "rgba(120, 20, 6, 0.5)");
        ctx.fillStyle = embers;
        ctx.fillRect(0, top, w, h - top);
        ctx.restore();
      }
      ctx.strokeStyle = ready ? "rgba(255, 140, 50, 0.9)" : "rgba(255, 122, 40, 0.35)";
      ctx.lineWidth = ready && tool.charge ? 3 : 2;
      ctx.stroke();
      drawIcon(ctx, tool.icon, (w - 12 * 5) / 2, (h - 12 * 5) / 2, 5, ready ? "#f3e2c0" : "#5a4a42");
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
