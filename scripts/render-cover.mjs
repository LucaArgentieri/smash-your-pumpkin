// Renders the key art and icons from the game itself, in its "?cover" mode
// (a dark room, the carved face as the only light, framed like the
// Inscryption cover):
// - public/og.png: README cover + social cards, 1200x630 with the title;
// - public/favicon.png (32) and public/apple-touch-icon.png (180): the same
//   face, square and without the title.
//
//   node scripts/render-cover.mjs        (needs Playwright with Chromium)

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "vite";

// Playwright is a dev tool here, not a project dependency: resolve it however
// it is installed (local node_modules, NODE_PATH or global).
const { chromium } = createRequire(import.meta.url)("playwright");

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, server: { port: 0 }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls.local[0];

// Software GL works everywhere (CI, containers); it is slow but this is a one-off.
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function capture(query, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => window.coverReady === true, null, { timeout: 300000 });
  const png = await page.screenshot();
  await page.close();
  return png;
}

await writeFile(join(root, "public", "og.png"), await capture("cover", 1200, 630));
console.log("public/og.png");

// Downscale the square render with smooth filtering, in a blank page's canvas.
const square = await capture("cover&icon", 360, 360);
const scaler = await browser.newPage();
for (const [size, file] of [[180, "apple-touch-icon.png"], [32, "favicon.png"]]) {
  const dataUrl = await scaler.evaluate(
    async ([src, size]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, size, size);
      return canvas.toDataURL("image/png");
    },
    [`data:image/png;base64,${square.toString("base64")}`, size],
  );
  await writeFile(join(root, "public", file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`public/${file}`);
}

await browser.close();
await server.close();
