import * as THREE from "three/webgpu";

/**
 * Paints the table's history into a texture laid out like the table top
 * (x across the width, y from the far edge to the player):
 * R = knife cuts, scratches and carvings, G = spilt candle wax, B = scorch.
 * It is only read once, while the wood is baked.
 */
export function createTableMarks({ width, depth, candles }) {
  const W = 1024;
  const H = Math.round((W * depth) / width);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const rand = seeded(1031);
  const px = (x) => (x / width + 0.5) * W;
  const pz = (z) => (z / depth + 0.5) * H;

  // Knife cuts: thin wedges, deepest in the middle.
  ctx.fillStyle = "rgb(255,0,0)";
  for (let i = 0; i < 34; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const length = 25 + rand() * 110;
    const angle = rand() * Math.PI;
    wedge(ctx, x, y, length * 1.3, angle, 3.5 + rand() * 4, 0.7 + rand() * 0.3);
  }

  // Scratch clusters: bundles of short parallel strokes.
  for (let c = 0; c < 7; c++) {
    const cx = rand() * W;
    const cy = rand() * H;
    const angle = rand() * Math.PI;
    for (let i = 0; i < 6 + rand() * 6; i++) {
      const offset = (i - 4) * 4 + rand() * 2;
      const x = cx + Math.cos(angle + Math.PI / 2) * offset;
      const y = cy + Math.sin(angle + Math.PI / 2) * offset;
      wedge(ctx, x, y, 24 + rand() * 36, angle + (rand() - 0.5) * 0.15, 2.2, 0.45 + rand() * 0.3);
    }
  }

  // Gouges where something heavy came down.
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(255,0,0,${0.35 + rand() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(rand() * W, rand() * H, 4 + rand() * 9, 2 + rand() * 4, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tally marks near the player's left hand: someone has been counting.
  const tallyX = px(-3.2);
  const tallyY = pz(1.75);
  for (let group = 0; group < 4; group++) {
    const gx = tallyX + group * 46;
    for (let i = 0; i < 4; i++) wedge(ctx, gx + i * 9, tallyY, 38, Math.PI / 2 + (rand() - 0.5) * 0.12, 4.5, 1);
    if (group < 3) wedge(ctx, gx + 14, tallyY, 52, Math.PI / 2 + 1.05, 4.5, 1);
  }

  // A crescent moon carved on the right, and a crude X.
  ctx.strokeStyle = "rgba(255,0,0,0.85)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(px(3.15), pz(1.55), 22, Math.PI * 0.35, Math.PI * 1.65);
  ctx.arc(px(3.15) - 9, pz(1.55), 16, Math.PI * 1.6, Math.PI * 0.4, true);
  ctx.stroke();
  wedge(ctx, px(2.2), pz(-1.9), 48, 0.8, 5, 1);
  wedge(ctx, px(2.2), pz(-1.9), 48, -0.8, 5, 1);

  // Wax spilt around the candles, and the wood scorched beneath them.
  for (const c of candles) {
    const x = px(c.x);
    const y = pz(c.z);
    const scorch = ctx.createRadialGradient(x, y, 4, x, y, 60);
    scorch.addColorStop(0, "rgba(0,0,255,0.9)");
    scorch.addColorStop(1, "rgba(0,0,255,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = scorch;
    ctx.fillRect(x - 60, y - 60, 120, 120);
    ctx.fillStyle = "rgb(0,255,0)";
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const r = 14 + rand() * 22;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, 3 + rand() * 8, 2 + rand() * 6, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** A tapered cut centred on (x, y): sharp ends, widest in the middle. */
function wedge(ctx, x, y, length, angle, width, depth) {
  const dx = (Math.cos(angle) * length) / 2;
  const dy = (Math.sin(angle) * length) / 2;
  const nx = (-Math.sin(angle) * width) / 2;
  const ny = (Math.cos(angle) * width) / 2;
  ctx.fillStyle = `rgba(255,0,0,${depth})`;
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  ctx.lineTo(x + nx, y + ny);
  ctx.lineTo(x + dx, y + dy);
  ctx.lineTo(x - nx, y - ny);
  ctx.closePath();
  ctx.fill();
}

function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
