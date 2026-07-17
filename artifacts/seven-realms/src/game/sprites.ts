// Lazy-loaded image sprites. Delegates to the asset pipeline (assets.ts), which
// returns the HTMLImageElement only once decoded so callers can fall back to
// procedural drawing until it is ready (or forever, if the file is absent).
import { assets } from './assets';

export function getKnightSprite(): HTMLImageElement | null {
  return assets.getImage('characters/knight');
}

// --- Knight sprite sheet -----------------------------------------------
// public/assets/characters/knight-sheet.png — 128x128 frames:
//   row 0: 4 idle frames, row 1: 6 walk frames, row 2: 6 attack frames
export const SHEET_FRAME = 128;

export const KNIGHT_ANIM = {
  idle: { row: 0, frames: 4, ticksPerFrame: 14 },
  walk: { row: 1, frames: 6, ticksPerFrame: 6 },
  attack: { row: 2, frames: 6 },
} as const;

export function getKnightSheet(): HTMLImageElement | null {
  return assets.getImage('characters/knight-sheet');
}
