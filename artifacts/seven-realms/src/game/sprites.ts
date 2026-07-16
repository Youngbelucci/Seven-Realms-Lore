// Lazy-loaded image sprites. Returns the HTMLImageElement only once decoded,
// so callers can fall back to procedural drawing until it is ready.

let knightImg: HTMLImageElement | null = null;
let knightReady = false;

export function getKnightSprite(): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  if (!knightImg) {
    knightImg = new Image();
    knightImg.onload = () => { knightReady = true; };
    knightImg.onerror = () => { knightReady = false; }; // fall back to procedural draw
    knightImg.src = `${import.meta.env.BASE_URL}knight.png`;
  }
  return knightReady ? knightImg : null;
}
