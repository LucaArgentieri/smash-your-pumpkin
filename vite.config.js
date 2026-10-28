import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets this.
  base: process.env.BASE_PATH ?? "/",
  plugins: [wasm()],
  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
  build: {
    target: "esnext",
  },
});
