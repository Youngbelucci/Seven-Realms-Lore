// Lighting & atmosphere: warm torch light pools, torch props/flames, the hero's
// glow, drifting ground mist and the cinematic vignette. Deliberate warm-vs-cold
// contrast — warm torchlight punching through the cold frozen dark.
import { isSolid } from './world';
import type { TileGrid } from './world';
import { TILE_SIZE } from './constants';
import { randRange } from './utils';
import type { Particle, Torch } from './types';

export class Lighting {
  torches: Torch[] = [];

  // Scatter warm torches around the map (flanking the dungeon and along the
  // approach) for Diablo-style pools of light against the frozen dark.
  init(grid: TileGrid): void {
    this.torches = [];
    const candidates: [number, number][] = [
      [16, 25], [24, 25],           // flank the dungeon gate
      [18, 22], [22, 22],           // the approach
      [10, 14], [30, 12], [14, 20], // scattered across the field
      [28, 20], [20, 9], [33, 22],
    ];
    for (const [c, r] of candidates) {
      const x = c * TILE_SIZE + TILE_SIZE / 2;
      const y = r * TILE_SIZE + TILE_SIZE / 2;
      if (!isSolid(grid, x, y)) {
        this.torches.push({ x, y, phase: Math.random() * Math.PI * 2 });
      }
    }
  }

  // Spill glowing sparks from on-screen torches into the shared particle pool.
  spawnEmbers(particles: Particle[], camX: number, camY: number, vpW: number, vpH: number): void {
    for (const t of this.torches) {
      const sx = t.x - camX, sy = t.y - camY;
      if (sx < -40 || sx > vpW + 40 || sy < -40 || sy > vpH + 40) continue;
      if (Math.random() < 0.09) {
        particles.push({
          x: t.x + randRange(-3, 3), y: t.y - 38,
          vx: randRange(-0.3, 0.3), vy: randRange(-1.3, -0.5),
          life: randRange(20, 42), maxLife: 42,
          color: Math.random() < 0.5 ? '#ffb347' : '#ff7020',
          size: randRange(1, 2.4),
        });
      }
    }
  }

  // Warm, flickering pools of torchlight on the floor. Additive so the light
  // stacks over the ground.
  drawTorchLights(ctx: CanvasRenderingContext2D, camX: number, camY: number, vpW: number, vpH: number, tick: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of this.torches) {
      const sx = t.x - camX, sy = t.y - camY;
      if (sx < -260 || sx > vpW + 260 || sy < -260 || sy > vpH + 260) continue;
      const flicker =
        0.78 + Math.sin(tick * 0.3 + t.phase) * 0.12 + Math.sin(tick * 0.71 + t.phase * 2) * 0.08;
      const radius = 155 * flicker;
      const g = ctx.createRadialGradient(sx, sy - 8, 6, sx, sy - 8, radius);
      g.addColorStop(0, `rgba(255,175,85,${0.34 * flicker})`);
      g.addColorStop(0.5, `rgba(205,110,45,${0.12 * flicker})`);
      g.addColorStop(1, 'rgba(120,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy - 8, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Torch posts, iron bowls and dancing flames.
  drawTorchProps(ctx: CanvasRenderingContext2D, camX: number, camY: number, vpW: number, vpH: number, tick: number): void {
    for (const t of this.torches) {
      const sx = t.x - camX, sy = t.y - camY;
      if (sx < -60 || sx > vpW + 60 || sy < -60 || sy > vpH + 60) continue;
      const flicker = 0.8 + Math.sin(tick * 0.4 + t.phase) * 0.2;
      ctx.save();
      ctx.translate(sx, sy);

      // Ground shadow of the post
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 2, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wooden post with a lit edge
      ctx.fillStyle = '#2b2018';
      ctx.fillRect(-3, -30, 6, 32);
      ctx.fillStyle = '#3a2c20';
      ctx.fillRect(-3, -30, 2, 32);

      // Iron fire-bowl
      ctx.fillStyle = '#3a3a42';
      ctx.beginPath();
      ctx.moveTo(-7, -30);
      ctx.lineTo(7, -30);
      ctx.lineTo(4, -37);
      ctx.lineTo(-4, -37);
      ctx.closePath();
      ctx.fill();

      // Flame
      const fy = -37;
      const fh = 14 * flicker;
      const fg = ctx.createRadialGradient(0, fy - fh * 0.3, 1, 0, fy - fh * 0.3, fh);
      fg.addColorStop(0, 'rgba(255,244,190,0.95)');
      fg.addColorStop(0.4, 'rgba(255,165,55,0.9)');
      fg.addColorStop(1, 'rgba(200,60,20,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-5, fy);
      ctx.quadraticCurveTo(-4, fy - fh, 0, fy - fh - 4);
      ctx.quadraticCurveTo(4, fy - fh, 5, fy);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  drawHeroLight(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(px, py - 6, 10, px, py, 170);
    g.addColorStop(0, 'rgba(125,108,74,0.30)');
    g.addColorStop(0.45, 'rgba(70,82,108,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, 170, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawGroundMist(ctx: CanvasRenderingContext2D, vpW: number, vpH: number, tick: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const span = vpW + 500;
      const mx = ((tick * (0.25 + i * 0.05) + i * 640) % span) - 250;
      const my = vpH * (0.32 + 0.2 * i) + Math.sin(tick * 0.01 + i * 2) * 22;
      const g = ctx.createRadialGradient(mx, my, 10, mx, my, 230);
      g.addColorStop(0, 'rgba(70,92,125,0.07)');
      g.addColorStop(1, 'rgba(70,92,125,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(mx, my, 230, 95, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawVignette(ctx: CanvasRenderingContext2D, vpW: number, vpH: number, tick: number): void {
    // Cinematic radial vignette — transparent centre to deep edges
    const grad = ctx.createRadialGradient(vpW / 2, vpH * 0.46, vpH * 0.30, vpW / 2, vpH / 2, vpH * 0.95);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, 'rgba(4,7,14,0.22)');
    grad.addColorStop(1, 'rgba(2,4,10,0.82)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vpW, vpH);

    // Cold moonlight grade — blue at top, deep shadow at the base
    const topGrad = ctx.createLinearGradient(0, 0, 0, vpH);
    topGrad.addColorStop(0, 'rgba(22,44,80,0.16)');
    topGrad.addColorStop(0.5, 'rgba(10,20,45,0)');
    topGrad.addColorStop(1, 'rgba(6,10,26,0.12)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, vpW, vpH);

    // Subtle animated cold-blue edge shimmer
    const coldGrad = ctx.createRadialGradient(vpW / 2, vpH / 2, vpH * 0.4, vpW / 2, vpH / 2, vpH * 0.95);
    const coldAlpha = Math.sin(tick * 0.008) * 0.025 + 0.045;
    coldGrad.addColorStop(0, 'rgba(0,0,0,0)');
    coldGrad.addColorStop(1, `rgba(40,80,130,${coldAlpha})`);
    ctx.fillStyle = coldGrad;
    ctx.fillRect(0, 0, vpW, vpH);
  }
}
