# Pumpkin models

The game ships with six lightweight placeholder pumpkins (`public/pumpkins/*.glb`, built by
`node scripts/build-placeholders.mjs`). This page explains how to replace them with generated models.

## What the game expects

| | |
| --- | --- |
| Format | `.glb` |
| Triangles | **2,000–5,000** for the body. Fracturing runs at runtime, so more triangles means slower breaks on weak machines. The console warns above 6,000. |
| Textures | One base-colour texture, **512 px** max (256 is fine). An optional emissive texture for the carved face. |
| Materials | One material for the body. Extra maps (normal, AO, metal) are ignored. |
| Stem | Optional separate mesh whose name contains `stem`. It pops off when the pumpkin breaks. If the stem is fused into the body, it shatters with the rest. |
| Orientation | Face looking down **+Z**, stem up **+Y**. Otherwise set `rotationY` on the variant. |
| Scale | Any. The game scales the model so its horizontal radius matches `size` in `src/pumpkins/variants.js`. |
| Shape | A single closed (watertight) surface fractures best. Avoid floating parts, leaves and vines. |

## Prompts

These are written for text-to-3D tools (Meshy, Tripo, Rodin and similar). Prefix each prompt with the
shared style line, add the negative prompt where the tool supports one, and ask for a low-poly or
"game-ready" output with a 512 px texture.

**Shared style line**

> Stylised low-poly game asset, single pumpkin, chunky hand-painted texture, dark fairy-tale Halloween
> mood like Inscryption and Blasphemous, matte surface, deep vertical ribs, centred, front view, plain
> background.

**Negative prompt**

> multiple objects, table, ground plane, leaves, vines, candles, text, logo, glossy, photorealistic,
> high-poly, thin floating parts

| File | Prompt |
| --- | --- |
| `jack.glb` | Classic round orange jack-o'-lantern, 10 deep ribs, slightly squat, short curved green-brown stem, carved face with two triangle eyes, a triangle nose and a wide jagged grin, the carved holes glowing warm yellow from a candle inside. |
| `bertha.glb` | Huge, very wide and flat dark-orange pumpkin, 12 heavy ribs, thick stubby stem, no face, bruised and dented skin with darker blotches. |
| `spindle.glb` | Tall, narrow, slightly lopsided light-orange pumpkin, 8 deep ribs, long twisted stem curling to one side, carved scared face with two round eyes and a small round "O" mouth glowing soft yellow. |
| `pale.glb` | Ghostly pale cream-white pumpkin with faint violet shading in the grooves, 10 ribs, carved angry face with slanted triangle eyes and a jagged frown, the carvings glowing eerie purple. |
| `rotten.glb` | Rotting pumpkin, mottled orange fading to sickly olive green, moldy patches, sagging shape, 9 uneven ribs, short broken stem, carved sad face with drooping eyes and a frowning mouth glowing toxic lime green. |
| `pip.glb` | Small cute bright-orange baby pumpkin, 8 plump ribs, round, short stem, tiny carved grin with triangle eyes glowing warm yellow. |

The glow painted into the texture is picked up automatically when you set `glowFromAlbedo: true` on the
variant (it turns the brightest areas of the texture into light). A real emissive texture looks better:
in Blender, paint the carved holes white into a second texture and connect it to *Emission*.

## Optimising a generated model

Generated models are usually far too heavy (20k–200k triangles, 2k–4k textures).

**With gltf-transform** (Node). These flags are for `@gltf-transform/cli` v4; check `--help` if your
version differs.

```bash
npx @gltf-transform/cli inspect raw/jack.glb            # see triangle count
npx @gltf-transform/cli optimize raw/jack.glb public/pumpkins/jack.glb \
  --simplify-ratio 0.1 --texture-size 512 --texture-compress webp
```

Adjust `--simplify-ratio` so the body ends up between 2,000 and 5,000 triangles (for example 0.05 for
a 60k-triangle model). `optimize` also applies meshopt compression by default, which the game decodes.

**With Blender**: import the model, add a *Decimate* modifier (collapse) down to about 4,000 triangles,
optionally separate the stem into its own object named `stem`, resize the texture to 512 px, and
export as glTF Binary (`.glb`) with +Y up.

Then point the variant at the file in `src/pumpkins/variants.js` (`model: "pumpkins/jack.glb"`, relative to `public/`), run the game and watch the console
for the triangle warning.
