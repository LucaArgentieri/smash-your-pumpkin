// Renders the same screens with each candidate title font, to compare them in
// the real scene. Put the font files in public/fonts/ (otf, ttf, woff, woff2):
//
//   node scripts/compare-fonts.mjs [out-dir]     (needs Playwright with Chromium)
//
// Writes <font>-title.png, <font>-combo.png and <font>-board.png per font.

import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "vite";

const { chromium } = createRequire(import.meta.url)("playwright");

const root = fileURLToPath(new URL("..", import.meta.url));
const out = process.argv[2] ?? join(root, "font-previews");
await mkdir(out, { recursive: true });
const fonts = (await readdir(join(root, "public", "fonts"))).filter((f) => /\.(otf|ttf|woff2?)$/i.test(f));
if (fonts.length === 0) throw new Error("No fonts in public/fonts/");

const server = await createServer({ root, server: { port: 0 }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

for (const file of fonts) {
  const name = file.replace(/\.[^.]+$/, "");
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (m) => m.type() === "warning" && /fonts/.test(m.text()) && console.warn(m.text()));
  await page.addInitScript(() => localStorage.setItem("smash-your-pumpkin:quality", "medium"));
  await page.goto(`${base}?font=${encodeURIComponent(file)}`);
  await page.waitForFunction(() => window.game?.state === "title" && game.ui.begin.u.reveal.value > 0.99, null, { timeout: 300000 });
  await page.screenshot({ path: join(out, `${name}-title.png`) });

  // A hot combo with its rank, then the results / leaderboard title.
  await page.evaluate(() => game.beginRound());
  await page.waitForFunction(() => game.state === "playing", null, { timeout: 120000 });
  await page.evaluate(() => {
    game.combo = 34;
    game.extendCombo(1, game.camera.position.clone().setZ(0));
    window.pin = setInterval(() => (game.lastHitAt = game.elapsed - game.comboWindow() * 0.3), 16);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(out, `${name}-combo.png`) });
  await page.evaluate(() => {
    clearInterval(window.pin);
    game.score = 4321;
    game.timeLeft = 0.01;
  });
  await page.waitForFunction(() => ["results", "name"].includes(game.state), null, { timeout: 180000 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: join(out, `${name}-results.png`) });
  await page.close();
  console.log(name);
}

await browser.close();
await server.close();
