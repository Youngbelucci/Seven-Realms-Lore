// Lazy-loaded image sprites. Delegates to the asset pipeline (assets.ts), which
// returns the HTMLImageElement only once decoded so callers can fall back to
// procedural drawing until it is ready (or forever, if the file is absent).
import { assets } from './assets';

export function getKnightSprite(): HTMLImageElement | null {
  return assets.getImage('characters/knight');
}
