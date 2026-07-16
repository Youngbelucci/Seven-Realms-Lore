// Particle / floater / blood-decal FX. The arrays live on the engine (they are
// threaded through player/enemy/boss update signatures); this module owns the
// stepping, drawing and spawn helpers.
import { randRange } from './utils';
import { DAMAGE_COLORS } from './constants';
import type { FloatingNumber, Particle, BloodDecal } from './types';

// --- Blood decals ---------------------------------------------------------

// Leave a lingering blood pool where something dies (fades over its lifetime).
export function spawnBloodDecal(decals: BloodDecal[], x: number, y: number, big: boolean): void {
  const n = big ? 5 : 3;
  const spread = big ? 1.4 : 1;
  const blobs: { dx: number; dy: number; rr: number }[] = [];
  for (let i = 0; i < n; i++) {
    blobs.push({
      dx: randRange(-10, 10) * spread,
      dy: randRange(-7, 7) * spread,
      rr: randRange(3, big ? 9 : 6),
    });
  }
  const maxLife = big ? 1400 : 800;
  decals.push({ x, y, rot: Math.random() * Math.PI, life: maxLife, maxLife, blobs });
  // Bound the decal count so long runs never accumulate unboundedly
  while (decals.length > 46) decals.shift();
}

export function updateDecals(decals: BloodDecal[]): BloodDecal[] {
  for (const d of decals) d.life--;
  return decals.filter(d => d.life > 0);
}

export function drawDecals(ctx: CanvasRenderingContext2D, decals: BloodDecal[], camX: number, camY: number, vpW: number, vpH: number): void {
  for (const d of decals) {
    const sx = d.x - camX, sy = d.y - camY;
    if (sx < -40 || sx > vpW + 40 || sy < -40 || sy > vpH + 40) continue;
    const fade = Math.min(1, d.life / (d.maxLife * 0.35)); // fade out over the final 35%
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(d.rot);
    // Splatter
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = '#5a0d0d';
    for (const b of d.blobs) {
      ctx.beginPath();
      ctx.ellipse(b.dx, b.dy, b.rr, b.rr * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Darker central pool
    ctx.globalAlpha = 0.6 * fade;
    ctx.fillStyle = '#3a0808';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- Particles ------------------------------------------------------------

export function updateParticles(particles: Particle[]): Particle[] {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.life--;
  }
  return particles.filter(p => p.life > 0);
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], camX: number, camY: number): void {
  for (const p of particles) {
    const sx = p.x - camX;
    const sy = p.y - camY;
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(0.5, p.size * (p.life / p.maxLife)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- Floating combat text -------------------------------------------------

export function updateFloaters(floaters: FloatingNumber[]): FloatingNumber[] {
  for (const f of floaters) {
    f.y += f.vy;
    f.life--;
    f.alpha = Math.min(1, f.life / (f.maxLife * 0.4));
  }
  return floaters.filter(f => f.life > 0);
}

export function drawFloaters(ctx: CanvasRenderingContext2D, floaters: FloatingNumber[], camX: number, camY: number): void {
  for (const f of floaters) {
    const x = f.x - camX;
    const y = f.y - camY;
    ctx.save();
    ctx.globalAlpha = f.alpha;
    if (f.text) {
      ctx.fillStyle = '#ffdd44';
      ctx.font = 'bold 14px "Georgia", serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur = 6;
      ctx.fillText(f.text, x, y);
      ctx.shadowBlur = 0;
    } else {
      const color = DAMAGE_COLORS[f.damageType] ?? '#fff';
      ctx.fillStyle = f.isCrit ? '#ffdd00' : color;
      ctx.font = f.isCrit ? 'bold 20px "Georgia", serif' : 'bold 14px "Georgia", serif';
      ctx.textAlign = 'center';
      if (f.isCrit) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
      ctx.fillText(f.isCrit ? `⚡${f.value}` : String(f.value), x, y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}
