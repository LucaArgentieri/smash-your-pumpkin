# Smash Your Pumpkin

A Halloween rage room, successor to [paint-your-pumpkin](https://github.com/LucaArgentieri/paint-your-pumpkin).
You sit at a table in a candlelit cabin and have 60 seconds to smash as many pumpkins as you can.

There is no tutorial: the weapons (keys 1–3, mouse wheel, or the slots at the bottom) are meant to be
figured out by playing. The pointer becomes the selected weapon and swings with every blow. For
reference:

- **Fist**: fast, cracks a pumpkin in three hits and grinds small shards into **dust** for a bonus.
- **Mallet**: slow, shatters a whole pumpkin in one blow, pumpkin bonus x2.
- **Axe**: cuts pumpkins and shards in two, x2 points per piece.

### The combo

The combo is where high scores come from:

- Every hit inside the combo window extends it and raises the point multiplier (up to x3).
- Switching weapon mid-combo adds +2.
- The window tightens as the combo grows (1.1 s down to 0.55 s), shown by the bar under the counter.
- Let it run out and it is **cashed in** for combo² × 3 points. Click empty table and it **breaks** for nothing.
- Ranks: WICKED (5), GRIM (10), GHASTLY (20), UNHOLY (35), DAMNED (50), APOCALYPTIC (80).
- The best score and the combo record are kept in the browser.
- Like Balatro, the numbers escalate with the combo: count, multiplier, rank, score popups and the
  cash-out grow, glow hotter, sway and, past half heat, tremble. The score rolls up rather than jumping.

The results screen (where the leaderboard will live) switches to a low camera over the pumpkin's
shoulder while it turns to gaze at the moon, drifting slowly like an arcade attract mode.

Holding the button keeps swinging (held swings never break the combo), and near misses still count, which
helps on touch screens. Tuning lives in `COMBO` and `TOOLS` in `src/config.js`.

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

**GitHub Pages**: every push to `main` runs `.github/workflows/deploy.yml`, which builds with
`BASE_PATH=/<repo>/` and publishes `dist/` to the `gh-pages` branch. In the repository settings,
Pages must serve from the `gh-pages` branch (root).

**Netlify** also works: `netlify.toml` builds with `npm run build` and publishes `dist/` at the site root.

## Project layout

| Path | What |
| --- | --- |
| `src/config.js` | Tools, scoring, timings, palette, fonts and all on-screen text |
| `src/game/Game.js` | Round flow, input, scoring, camera |
| `src/game/Destruction.js` | Hits → fractures / slices / dust, shard lifetime |
| `src/pumpkins/` | Pumpkin set (`variants.js`), GLB loading (`models.js`), TSL materials |
| `src/world/Cabin.js` | Table, candles, moon, dust, lights |
| `src/core/` | Renderer + post chain, quality tiers, physics, fracture worker pool, tweens |
| `src/ui/` | Burn-in UI panels, tool cards, HUD and screens |

| `scripts/build-placeholders.mjs` | Generates the placeholder pumpkin GLBs |

## Performance

The game picks a quality tier at startup from the GPU and device hints, then **steps down
automatically** when frames run slower than 45 fps for about 4 seconds. Players can override it by
clicking the label in the corner of the title and results screens, or by pressing **Q**. The choice is
saved in the browser.

| Tier | Scene lines | Pixel ratio | Bloom | Shadows | Candle lights | Max shards |
| --- | --- | --- | --- | --- | --- | --- |
| MIN | 210 | 0.75 | off | off | 0 | 50 |
| LOW | 270 | 1 | off | off | 0 | 80 |
| MED | 340 | ≤ 1.5 | ¼ res | lantern | 1 | 150 |
| HIGH | 400 | ≤ 2 | ½ res | lantern + moon | 3 | 220 |

Other measures that apply to every tier:

- The 3D scene is always rendered at a low internal resolution, which is the look and also the biggest saving.
- Procedural textures (table, moon) are baked once at load instead of computing noise for every pixel.
- Voronoi fracturing runs in Web Workers; each pumpkin is pre-fractured while it drops onto the table.
- Shaders compile during loading (hidden warm-up draws), not on the first hit.
- Idle particles, burnt-out UI panels and finished dissolve effects are skipped entirely.
- Light and shadow changes, which recompile shaders, wait until the round ends.
- Scores are normalised by the tier's fracture detail, so lower tiers aren't penalised.

## Pumpkin models

See [docs/pumpkin-models.md](docs/pumpkin-models.md) for the model requirements, prompts to generate
the set, and how to optimise generated models.
