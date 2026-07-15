import { Stats, FloatingNumber, Particle, DamageType } from './types';
import { DAMAGE_COLORS } from './constants';
import { randRange, uid } from './utils';

export abstract class Entity {
  id: string = uid();
  x: number;
  y: number;
  size: number;
  stats: Stats;
  facing: number = 0; // angle in radians
  hitFlash: number = 0; // frames of red flash remaining
  dead: boolean = false;
  shieldActive: boolean = false;

  constructor(x: number, y: number, size: number, stats: Stats) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.stats = { ...stats };
  }

  takeDamage(
    amount: number,
    type: DamageType,
    isCrit: boolean,
    floaters: FloatingNumber[],
    particles: Particle[]
  ): number {
    if (this.dead) return 0;
    let dmg = Math.max(1, amount - (this.stats.defense * 0.3 | 0));
    if (this.shieldActive) dmg = Math.max(1, dmg - 15);
    if (isCrit) dmg = Math.round(dmg * 2.2);

    this.stats.hp = Math.max(0, this.stats.hp - dmg);
    this.hitFlash = 8;

    // Floating number
    floaters.push({
      x: this.x + randRange(-20, 20),
      y: this.y - this.size,
      value: dmg,
      isCrit,
      damageType: type,
      alpha: 1,
      vy: -1.8,
      life: 90,
      maxLife: 90,
    });

    // Particles
    const color = DAMAGE_COLORS[type] ?? '#ffffff';
    for (let i = 0; i < (isCrit ? 8 : 4); i++) {
      particles.push({
        x: this.x,
        y: this.y,
        vx: randRange(-3, 3),
        vy: randRange(-4, 1),
        life: randRange(15, 30),
        maxLife: 30,
        color,
        size: randRange(2, isCrit ? 6 : 4),
      });
    }

    if (this.stats.hp <= 0) this.onDeath(particles);
    return dmg;
  }

  onDeath(particles: Particle[]): void {
    this.dead = true;
    for (let i = 0; i < 16; i++) {
      particles.push({
        x: this.x,
        y: this.y,
        vx: randRange(-5, 5),
        vy: randRange(-6, 2),
        life: randRange(20, 40),
        maxLife: 40,
        color: '#cc4444',
        size: randRange(3, 8),
      });
    }
  }

  get rect() {
    return { x: this.x - this.size, y: this.y - this.size, w: this.size * 2, h: this.size * 2 };
  }

  abstract update(dt: number, ...args: unknown[]): void;
  abstract draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void;

  drawHealthBar(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
    const barW = this.size * 2 + 4;
    const barH = 5;
    const bx = sx - barW / 2;
    const by = sy - this.size - 12;
    ctx.fillStyle = '#400';
    ctx.fillRect(bx, by, barW, barH);
    const frac = Math.max(0, this.stats.hp / this.stats.maxHp);
    const barColor = frac > 0.5 ? '#44cc44' : frac > 0.25 ? '#ddaa00' : '#dd2222';
    ctx.fillStyle = barColor;
    ctx.fillRect(bx, by, barW * frac, barH);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, barH);
  }
}
