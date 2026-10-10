# Storm Wisp source art

Storm Wisp is an original bundled Stage Actor created for Tempest Streaming Studio. The two transparent pose sheets are retained as source art; `tools/build-storm-wisp-assets.py` compiles them into the canonical Tempest row atlas: one transparent PNG, fixed 128×128 cells, and one named animation per row.

## Canonical row atlas

Storm Wisp 3.0 ships as an 8-column × 10-row `avatar.png`. Rows map to idle, walk, jump, attack, celebrate, sit, sleep, emote, damaged, and defeated. `avatar-jacket-mask.png` and `avatar-wisp-mask.png` use the identical grid, allowing the Stage to apply all 12 jacket and 12 wisp colors without separate state files. Simple six-row avatars use the same format and may choose a wider sheet; blank cells remain transparent.

## Humanoid Wisp v1 bounded template

Storm Wisp 2.1 is the reference avatar for Tempest's VRoid-style 2D authoring workflow. The builder normalizes all 20 drawable parts into one 2048×2560 transparent texture containing four columns and five rows of fixed 512×512 cells. The generated `humanoid-wisp-v1-guide.png` labels every cell; creators paint or replace `humanoid-wisp-v1-texture.png` while Studio retains the skeleton, pivots, clips, collision, and physics. Each renderer layer is restricted to exactly one declared cell, so pixels cannot bleed into another body part or move a joint.

The bounded rig experiment remains documented for reference, but the row atlas is the default Pack Builder and runtime format. Animation strips and bounded rigs remain readable for backward compatibility.

## Stage Actor v2 rig

The earlier 21-bone Canvas2D experiment remains in the source generator for research, but it is not included in the v3 runtime manifest. Whole-frame atlas cells are the reliable boundary: artwork cannot drift between independently transformed body parts.

Legacy rig source assets used to generate the bounded template:

- `rig-v2-atlas.png`: limb, face, foot, and tail parts
- `rig-v2-torso.png`: arm-free torso layer
- `rig-v2-hood.png`: plume-free hood layer
- `rig-v2-plume.png`: isolated clean plume layer

## State layout

- `core-poses.png`: idle, walk, jump, attack, celebrate
- `rest-poses.png`: sit, sleep, emote, damaged, defeated

## Generation prompts

The source art was generated with the built-in image-generation workflow on October 3, 2026.

Core sheet prompt:

> Create one original small full-body mascot named Storm Wisp: a cute energetic storm spirit in a sleek dark navy hooded flight jacket, with a glowing cyan face and restrained violet-magenta electrical accents. Show exactly five separated poses in a horizontal row: neutral idle, walking stride, upward jump, forward lightning attack, and joyful celebration. Use polished 2D game-character cel shading, a readable silhouette, consistent design and scale, and a genuinely transparent background. No text, borders, logos, watermark, weapons, cropped limbs, extra characters, or scenery.

Rest sheet prompt:

> Preserve the exact Storm Wisp identity, costume, proportions, colors, and rendering style. Show exactly five separated poses in a horizontal row: seated calmly, curled up asleep, playful friendly wave, damaged recoil without gore, and defeated or exhausted. Keep the same camera angle and scale with a genuinely transparent background. No text, borders, logos, watermark, blood, weapons, cropped limbs, extra characters, or scenery.

The v2 rig pieces were generated from the same design reference with transparent-background prompts for a separated production atlas, arm-free torso, plume-free hood, and one isolated plume. Keeping those source pieces separate prevents neighboring atlas art from bleeding into animated layers.

Run `python tools/build-storm-wisp-assets.py` after editing either source sheet.

## Custom colors

Storm Wisp v1.1 adds two independently tinted material layers:

- **Jacket:** Midnight Navy, Tempest Black, Storm Slate, Arctic White, Storm Cyan, Royal Blue, Electric Violet, Arc Magenta, Crimson, Ember Orange, Solar Gold, and Emerald.
- **Wisp:** Storm Cyan, Sky Blue, Deep Ocean, Electric Violet, Arc Magenta, Rosefire, Crimson Spark, Ember, Solar Gold, Acid Lime, Spectral Green, and Ghost White.

The builder derives soft jacket and wisp masks from the source paintings, applies the exact animation transforms to those masks, and records the 12 + 12 choices in `manifest.json`. The Stage composites those two choices at render time, yielding 144 combinations without duplicating the atlas or changing the character's silhouette and shading.
