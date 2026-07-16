# Seven Realms — Asset Pipeline

This folder holds real art and audio assets for the game. **All assets are
optional.** The game renders everything procedurally and only uses a file if it
has been dropped in here and successfully decoded. If an asset is missing or
fails to load, the game silently falls back to procedural rendering.

## How assets are served

This is a Vite project. Everything under `public/` is served from the app's
base URL. At runtime the base URL is `import.meta.env.BASE_URL`, so a file at:

```
public/assets/characters/knight.png
```

is served at:

```
${import.meta.env.BASE_URL}assets/characters/knight.png
```

## Loading convention (key ↔ path)

Load images through the singleton in `src/game/assets.ts` using a **key** that
is the path under `public/assets/` **without** the `assets/` prefix and
**without** the `.png` extension.

| File on disk                                  | Load key             |
| --------------------------------------------- | -------------------- |
| `public/assets/characters/knight.png`         | `characters/knight`  |
| `public/assets/enemies/goblin.png`            | `enemies/goblin`     |
| `public/assets/bosses/lich.png`               | `bosses/lich`        |
| `public/assets/tiles/grass.png`               | `tiles/grass`        |
| `public/assets/weapons/sword.png`             | `weapons/sword`      |
| `public/assets/armor/plate.png`               | `armor/plate`        |
| `public/assets/effects/explosion.png`         | `effects/explosion`  |
| `public/assets/ui/heart.png`                  | `ui/heart`           |

Example:

```ts
import { assets } from '@/game/assets';

const img = assets.getImage('characters/knight'); // HTMLImageElement | null
if (img) {
  ctx.drawImage(img, x, y);
} else {
  drawKnightProcedurally(ctx, x, y); // graceful fallback
}
```

Only PNG images are handled by `assets.getImage`. Audio files below are
documented for the eventual audio pipeline.

## Folder layout

```
public/assets/
├── characters/   player + NPC sprites
├── enemies/      standard enemy sprites
├── bosses/       boss sprites
├── tiles/        map / terrain tiles
├── weapons/      weapon sprites & icons
├── armor/        armor sprites & icons
├── effects/      visual FX (explosions, particles, hits)
├── ui/           HUD / interface art
├── music/        background music tracks
└── sounds/       sound effects
```

Each folder contains a `.gitkeep` so the (currently empty) structure is tracked
in git. Drop real assets in following the key convention above and the game will
start using them automatically.
