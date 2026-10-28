# Smash Your Pumpkin

A Halloween rage room, successor to [paint-your-pumpkin](https://github.com/LucaArgentieri/paint-your-pumpkin).
You sit at a table in a candlelit cabin and have 60 seconds to smash as many pumpkins as you can.

- **Fist** (1): fast, takes three hits to crack a pumpkin.
- **Mallet** (2): slow, shatters a pumpkin in one blow.
- **Axe** (3): chops pumpkins and shards in half, worth more points per piece.

Chained hits build a combo multiplier. Shards that get too small turn to **dust**, which earns a bonus.

## Stack

- three.js `WebGPURenderer` (falls back to WebGL2) with TSL for every material and for post-processing
- [three-pinata](https://github.com/dgreenheck/three-pinata) for Voronoi fracturing and slicing, run in Web Workers
- [Rapier](https://rapier.rs) for physics
- All UI is drawn in WebGL: canvas-painted panels that burn in and out through a TSL shader

## Develop

```bash
bun install   # or npm install
bun run dev
```

In dev builds the game instance is exposed as `window.game`, for example `game.timeLeft = 1` ends the round.

## Deploy

Netlify picks up `netlify.toml`: `npm run build`, publish `dist/`.

## Project layout

| Path | What |
| --- | --- |
| `src/config.js` | Tools, scoring, timings, palette, fonts and all on-screen text |
| `src/game/Game.js` | Round flow, input, scoring, camera |
| `src/game/Destruction.js` | Hits → fractures / slices / dust, shard lifetime |
| `src/pumpkins/` | Pumpkin set (`variants.js`), procedural geometry, TSL materials, carved faces |
| `src/world/Cabin.js` | Table, candles, moon, dust, lights |
| `src/core/` | Renderer + post chain, physics, fracture worker pool, tweens |
| `src/ui/` | Burn-in UI panels, tool cards, HUD and screens |

## Swapping in modelled pumpkins

The pumpkins are generated procedurally for now. To use a model, drop a `.glb` in `public/pumpkins/` and add
`model: "/pumpkins/name.glb"` to a variant in `src/pumpkins/variants.js`. The model is merged into one mesh,
centred and scaled to `size`. Keep it low-poly (a few thousand triangles), because fracturing happens at runtime.
