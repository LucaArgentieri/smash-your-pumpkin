import { FONTS, PALETTE } from "../config.js";
import { UIPanel } from "./elements.js";

// 12x12 / 8x8 pixel-art glyphs, inked onto the cards.
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
  skull: [
    ".######.",
    "########",
    "#..##..#",
    "#..##..#",
    "########",
    ".##..##.",
    ".######.",
    ".#.##.#.",
  ],
  bolt: [
    "....###.",
    "...###..",
    "..###...",
    ".######.",
    "...###..",
    "..###...",
    ".###....",
    ".##.....",
  ],
};

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
      ctx.fillRect(9, 9, w - 18, 30);

      ctx.fillStyle = PALETTE.ink;
      ctx.font = `30px ${FONTS.title}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tool.name, w / 2, 26);

      // Portrait box.
      ctx.strokeRect(18, 46, w - 36, 82);
      drawIcon(ctx, tool.icon, w / 2 - 33, 52, 5.5, PALETTE.ink);

      // Stats: power bottom-left, speed bottom-right, like attack / health.
      ctx.font = `bold 26px ${FONTS.body}`;
      drawIcon(ctx, "skull", 16, 142, 3, "#5a1a0c");
      ctx.fillStyle = PALETTE.ink;
      ctx.textAlign = "left";
      ctx.fillText(String(tool.stats.power), 44, 155);
      drawIcon(ctx, "bolt", w - 42, 142, 3, "#5a1a0c");
      ctx.textAlign = "right";
      ctx.fillText(String(tool.stats.speed), w - 48, 155);

      // Hotkey.
      ctx.font = `14px ${FONTS.body}`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(26, 13, 10, 0.6)";
      ctx.fillText(`[${index + 1}]`, w / 2, h - 16);
    },
  });
  card.redraw();
  card.tool = tool;
  return card;
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
