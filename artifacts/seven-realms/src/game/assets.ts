// Lazy image asset manager with graceful procedural fallback.
//
// The Seven Realms draws everything procedurally by default. This manager lets
// real PNG assets be dropped into `public/assets/<folder>/<name>.png` later and
// used automatically. Until an image has decoded, `getImage` returns null, and
// if an image fails to load it is marked failed and `getImage` returns null
// forever after (no retries, no console spam). Callers MUST treat a null result
// as "keep drawing procedurally".
//
// Keys omit the `assets/` prefix and `.png` extension, e.g. the file
// `public/assets/characters/knight.png` is loaded with key `characters/knight`.

type AssetState = 'loading' | 'ready' | 'failed';

interface AssetEntry {
  img: HTMLImageElement;
  state: AssetState;
}

class AssetManager {
  private cache = new Map<string, AssetEntry>();

  private srcFor(key: string): string {
    const base =
      (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    return `${base}assets/${key}.png`;
  }

  private ensure(key: string): AssetEntry | null {
    // SSR-safe: no DOM available means nothing to load.
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      return null;
    }

    const existing = this.cache.get(key);
    if (existing) return existing;

    const img = new Image();
    const entry: AssetEntry = { img, state: 'loading' };
    this.cache.set(key, entry);

    img.onload = () => {
      entry.state = 'ready';
    };
    img.onerror = () => {
      // Mark failed and stop trying; callers fall back to procedural rendering.
      entry.state = 'failed';
    };

    try {
      img.src = this.srcFor(key);
    } catch {
      entry.state = 'failed';
    }

    return entry;
  }

  /**
   * Returns the decoded image element for `key`, or null if it is still
   * loading, has failed, or the environment has no DOM. Never throws.
   */
  getImage(key: string): HTMLImageElement | null {
    const entry = this.ensure(key);
    if (!entry) return null;
    return entry.state === 'ready' ? entry.img : null;
  }

  /** True only once the image for `key` has decoded successfully. */
  isReady(key: string): boolean {
    const entry = this.cache.get(key);
    return entry?.state === 'ready';
  }

  /** Kick off loading a batch of keys without waiting on them. */
  preload(keys: string[]): void {
    for (const key of keys) {
      this.ensure(key);
    }
  }
}

export const assets = new AssetManager();
