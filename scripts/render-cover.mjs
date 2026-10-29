// Renders the key art and icons:
// - public/og.png (README cover + social cards): the game itself in its
//   "?cover" key-art mode, framed like the Inscryption cover;
// - public/favicon.png and public/apple-touch-icon.png from scripts/icons.html.
//
//   node scripts/render-cover.mjs        (needs Playwright with Chromium)

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

const icons = await browser.newPage({ deviceScaleFactor: 1 });
await icons.goto(`${base}scripts/icons.html`);
await icons.waitForFunction(() => window.ready === true);
for (const [id, file] of [["favicon", "favicon.png"], ["touch", "apple-touch-icon.png"]]) {
  await icons.locator(`#${id}`).screenshot({ path: join(root, "public", file) });
  console.log(`public/${file}`);
}

const game = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await game.goto(`${base}?cover`);
await game.waitForFunction(() => window.coverReady === true, null, { timeout: 300000 });
await game.screenshot({ path: join(root, "public", "og.png") });
console.log("public/og.png");

await browser.close();
await server.close();
