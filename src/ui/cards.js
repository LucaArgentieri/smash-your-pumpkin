import { font, PALETTE } from "../config.js";
import { UIPanel } from "./elements.js";

// 12x12 pixel-art glyphs, inked onto the cards.
const ICONS = {
  fist: [
    "...##.##.##.",
    "..###.##.###",
    ".###########",
    ".###########",
    ".###########",
    "##.#########",
    "###.########",
    ".###########",
    "..#########.",
    "...#######..",
    "...#######..",
    "...#######..",
  ],
  mallet: [
    ".##########.",
    "############",
    "############",
    "############",
    ".##########.",
    ".....##.....",
    ".....##.....",
    ".....##.....",
    ".....##.....",
    ".....##.....",
    "....####....",
    "....####....",
  ],
  axe: [
    "....##......",
    "...####.....",
    "..#####.##..",
    ".######.##..",
    ".#########..",
    ".######.##..",
    "..#####.##..",
    "...####.##..",
    "....##..##..",
    "........##..",
    "........##..",
    ".......####.",
  ],
};

/** Filled and lightly stroked text, shrunk to fit `maxWidth`. */
function inkText(ctx, text, x, y, face, size, maxWidth) {
  ctx.font = font(face, size);
  const width = ctx.measureText(text).width;
  if (width > maxWidth) ctx.font = font(face, Math.floor((size * maxWidth) / width));
  ctx.fillText(text, x, y);
  ctx.strokeText(text, x, y);
}

function drawIcon(ctx, name, x, y, pixel, color) {
  ctx.fillStyle = color;
  ICONS[name].forEach((row, j) => {
    [...row].forEach((c, i) => {
      if (c === "#") ctx.fillRect(x + i * pixel, y + j * pixel, pixel + 0.5, pixel + 0.5);
    });
  });
}

// Deterministic speckles so each card looks handled but never changes.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Inscryption-style parchment card for a tool. */
export function createToolCard(tool, index) {
  const width = 132;
  const height = 186;
  const card = new UIPanel({
    width,
    height,
    intensity: 1.05,
    draw: (ctx, w, h) => {
      const r = rng(index * 977 + 13);

      ctx.fillStyle = PALETTE.parchment;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(${90 + r() * 60}, ${50 + r() * 30}, 20, ${r() * 0.12})`;
        const s = 1 + r() * 7;
        ctx.fillRect(r() * w, r() * h, s, s);
      }

      // Frame and name banner.
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 5;
      ctx.strokeRect(2.5, 2.5, w - 5, h - 5);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(9, 9, w - 18, h - 18);
      ctx.fillStyle = "rgba(60, 25, 10, 0.18)";
      ctx.fillRect(9, 9, w - 18, 34);

      // Name in the same gothic face as the titles, set large and heavy.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PALETTE.ink;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 0.9;
      inkText(ctx, tool.name, w / 2, 28, "title", 32, w - 26);

      // Portrait box.
      ctx.lineWidth = 1.5;
      ctx.strokeRect(18, 48, w - 36, 80);
      drawIcon(ctx, tool.icon, w / 2 - 33, 53, 5.5, PALETTE.ink);

      // What the weapon is for, instead of abstract stats.
      ctx.fillStyle = "#5a1a0c";
      ctx.strokeStyle = "#5a1a0c";
      ctx.lineWidth = 0.5;
      inkText(ctx, tool.role, w / 2, 146, "title", 18, w - 24);

      // Hotkey.
      ctx.fillStyle = "rgba(26, 13, 10, 0.55)";
      ctx.font = font("numbers", 22);
      ctx.fillText(String(index + 1), w / 2, h - 18);
    },
  });
  card.redraw();
  card.tool = tool;
  return card;
}

/** Draining bar under the combo: the time left to land the next hit. */
export function createComboBar() {
  const bar = new UIPanel({
    width: 300,
    height: 16,
    intensity: 2.2,
    draw: (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, "#ff3a0a");
      gradient.addColorStop(1, "#ffd27a");
      ctx.fillStyle = "rgba(20, 6, 4, 0.9)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = gradient;
      ctx.fillRect(3, 3, w - 6, h - 6);
    },
  });
  bar.redraw();
  bar.fill = 1;
  return bar;
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
