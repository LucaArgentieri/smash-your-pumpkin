// Renders scripts/cover/cover.html into public/og.png (README + social cards),
// public/favicon.png and public/apple-touch-icon.png.
//
//   node scripts/render-cover.mjs        (needs Playwright with Chromium)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Playwright is a dev tool here, not a project dependency: resolve it however
// it is installed (local node_modules, NODE_PATH or global).
const { chromium } = createRequire(import.meta.url)("playwright");

const root = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript" };

// Tiny static server so the page can import the game's own pixel icons.
const server = createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream" });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const { port } = server.address();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/scripts/cover/cover.html`);
await page.waitForFunction(() => window.ready === true);
for (const [id, file] of [["cover", "og.png"], ["favicon", "favicon.png"], ["touch", "apple-touch-icon.png"]]) {
  await page.locator(`#${id}`).screenshot({ path: join(root, "public", file) });
  console.log(`public/${file}`);
}
await browser.close();
server.close();
