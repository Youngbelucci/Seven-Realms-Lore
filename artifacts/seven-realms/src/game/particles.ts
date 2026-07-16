import { randRange } from './utils';
import { DAMAGE_COLORS } from './constants';
import type { FloatingNumber, Particle, BloodDecal } from './types';

export function spawnBloodDecal(decals: BloodDecal[], x: number, y: number, big: boolean): void {
  const n = big ? 6 : 4;
  const spread = big ? 1.5 : 1;
  const blobs: { dx: number; dy: number; rr: number }[] = [];
  for (let i = 0; i < n; i++) {
    blobs.push({ dx: randRange(-11, 11) * spread, dy: randRange(-8, 8) * spread, rr: randRange(3, big ? 10 : 6) });
  }
  const maxLife = big ? 1500 : 900;
  decals.push({ x, y, rot: Math.random() * Math.PI, life: maxLife, maxLife, blobs });
  while (decals.length > 52) decals.shift();
}

export function updateDecals(decals: BloodDecal[]): BloodDecal[] {
  for (const d of decals) d.life--;
  return decals.filter(d => d.life > 0);
}

export function drawDecals(ctx: CanvasRenderingContext2D, decals: BloodDecal[], camX: number, camY: number, vpW: number, vpH: number): void {
  for (const d of decals) {
    const sx = d.x - camX, sy = d.y - camY;
    if (sx < -40 || sx > vpW + 40 || sy < -40 || sy > vpH + 40) continue;
    const fade = Math.min(1, d.life / (d.maxLife * 0.35));
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(d.rot);
    ctx.globalAlpha = 0.48 * fade;
    ctx.fillStyle = '#5a0d0d';
    for (const b of d.blobs) {
      ctx.beginPath();
      ctx.ellipse(b.dx, b.dy, b.rr, b.rr * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.64 * fade;
    ctx.fillStyle = '#300606';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function spawnHitBurst(particles: Particle[], x: number, y: number, color: string, critical = false): void {
  const count = critical ? 18 : 10;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randRange(1.8, critical ? 7 : 4.6);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: randRange(10, critical ? 26 : 20),
      maxLife: critical ? 26 : 20,
      color,
      size: randRange(1.5, critical ? 4 : 3),
      kind: 'spark',
      drag: 0.9,
      gravity: 0.02,
      rotation: angle,
      length: randRange(5, critical ? 14 : 10),
    });
  }
}

export function spawnSlashTrail(particles: Particle[], x: number, y: number, angle: number, color = '#d8ecff'): void {
  for (let i = -4; i <= 4; i++) {
    const a = angle + i * 0.08;
    particles.push({
      x: x + Math.cos(a) * 34,
      y: y + Math.sin(a) * 34,
      vx: Math.cos(a) * 0.9,
      vy: Math.sin(a) * 0.9,
      life: 10,
      maxLife: 10,
      color,
      size: 2.5,
      kind: 'slash',
      rotation: a,
      length: 18 + Math.abs(i) * 2,
      drag: 0.88,
      gravity: 0,
    });
  }
}

export function updateParticles(particles: Particle[]): Particle[] {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    const drag = p.drag ?? 0.98;
    p.vx *= drag;
    p.vy *= drag;
    p.vy += p.gravity ?? 0.08;
    p.rotation = (p.rotation ?? 0) + (p.spin ?? 0);
    p.life--;
  }
  return particles.filter(p => p.life > 0);
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], camX: number, camY: number): void {
  for (const p of particles) {
    const sx = p.x - camX;
    const sy = p.y - camY;
    const t = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    ctx.shadowColor = p.color;

    if (p.kind === 'spark' || p.kind === 'slash') {
      ctx.translate(sx, sy);
      ctx.rotate(p.rotation ?? 0);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, p.size * t);
      ctx.shadowBlur = p.kind === 'slash' ? 10 : 5;
      ctx.beginPath();
      ctx.moveTo(-(p.length ?? 8) * 0.5, 0);
      ctx.lineTo((p.length ?? 8) * 0.5, 0);
      ctx.stroke();
    } else if (p.kind === 'blood') {
      ctx.beginPath();
      ctx.ellipse(sx, sy, Math.max(0.7, p.size * t), Math.max(0.5, p.size * 0.65 * t), p.rotation ?? 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.5, p.size * t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function updateFloaters(floaters: FloatingNumber[]): FloatingNumber[] {
  for (const f of floaters) {
    f.y += f.vy;
    f.vy *= 0.985;
    f.life--;
    f.alpha = Math.min(1, f.life / (f.maxLife * 0.4));
  }
  return floaters.filter(f => f.life > 0);
}

export function drawFloaters(ctx: CanvasRenderingContext2D, floaters: FloatingNumber[], camX: number, camY: number): void {
  for (const f of floaters) {
    const x = f.x - camX;
    const y = f.y - camY;
    const rise = 1 - f.life / f.maxLife;
    const scale = f.isCrit ? 1 + Math.sin(Math.min(1, rise * 5) * Math.PI) * 0.35 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = f.alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    if (f.text) {
      ctx.font = 'bold 14px Georgia, serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,10,0,.85)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = '#ffdd66';
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur = 8;
      ctx.fillText(f.text, 0, 0);
    } else {
      const color = DAMAGE_COLORS[f.damageType] ?? '#fff';
      ctx.font = f.isCrit ? 'bold 22px Georgia, serif' : 'bold 15px Georgia, serif';
      ctx.lineWidth = f.isCrit ? 5 : 4;
      ctx.strokeStyle = 'rgba(0,0,0,.9)';
      const label = f.isCrit ? `CRIT ${f.value}` : String(f.value);
      ctx.strokeText(label, 0, 0);
      ctx.fillStyle = f.isCrit ? '#ffe45c' : color;
      ctx.shadowColor = color;
      ctx.shadowBlur = f.isCrit ? 12 : 5;
      ctx.fillText(label, 0, 0);
    }
    ctx.restore();
  }
}
