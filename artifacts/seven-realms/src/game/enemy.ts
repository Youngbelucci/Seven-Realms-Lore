import { Entity } from './entity';
import { FloatingNumber, Particle, Projectile, EnemyState } from './types';
import { ENEMY_AGGRO_RANGE, ENEMY_ATTACK_RANGE_MELEE, ENEMY_ATTACK_RANGE_RANGED } from './constants';
import { dist, normalize, clamp, randRange, angleBetween, vecFromAngle } from './utils';
import { isSolid } from './tilemap';
import type { TileGrid } from './tilemap';
import type { Player } from './player';

export type EnemyType = 'wolf' | 'warrior' | 'archer';

export class Enemy extends Entity {
  type: EnemyType;
  state: EnemyState = 'idle';
  attackCooldown: number = 0;
  attackRange: number;
  xpValue: number;
  tier: number;
  movePhase: number = 0;
  wanderAngle: number = Math.random() * Math.PI * 2;
  stunFrames: number = 0;

  constructor(x: number, y: number, type: EnemyType) {
    const stats = Enemy.statsFor(type);
    super(x, y, Enemy.sizeFor(type), stats);
    this.type = type;
    this.attackRange = type === 'archer' ? ENEMY_ATTACK_RANGE_RANGED : ENEMY_ATTACK_RANGE_MELEE;
    this.xpValue = Enemy.xpFor(type);
    this.tier = Enemy.tierFor(type);
  }

  static statsFor(type: EnemyType) {
    switch (type) {
      case 'wolf':    return { hp: 60,  maxHp: 60,  energy: 0, maxEnergy: 0, damage: 12, defense: 2,  speed: 140, critChance: 0.05, critMultiplier: 1.5 };
      case 'warrior': return { hp: 140, maxHp: 140, energy: 0, maxEnergy: 0, damage: 20, defense: 10, speed: 80,  critChance: 0.06, critMultiplier: 1.5 };
      case 'archer':  return { hp: 80,  maxHp: 80,  energy: 0, maxEnergy: 0, damage: 15, defense: 4,  speed: 90,  critChance: 0.08, critMultiplier: 1.8 };
    }
  }

  static sizeFor(type: EnemyType): number {
    switch (type) {
      case 'wolf':    return 14;
      case 'warrior': return 18;
      case 'archer':  return 15;
    }
  }

  static xpFor(type: EnemyType): number {
    switch (type) { case 'wolf': return 18; case 'warrior': return 32; case 'archer': return 25; }
  }

  static tierFor(type: EnemyType): number {
    switch (type) { case 'wolf': return 1; case 'warrior': return 2; case 'archer': return 1; }
  }

  update(dt: number, player: Player, grid: TileGrid, floaters: FloatingNumber[], particles: Particle[], projectiles: Projectile[]): void {
    if (this.dead) return;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.stunFrames > 0) { this.stunFrames--; return; }
    if (this.attackCooldown > 0) this.attackCooldown -= dt * 1000;

    const d = dist({ x: this.x, y: this.y }, { x: player.x, y: player.y });

    // State machine
    if (this.state === 'dead') return;
    if (d < ENEMY_AGGRO_RANGE) this.state = 'aggro';
    else if (this.state === 'aggro' && d > ENEMY_AGGRO_RANGE * 1.5) this.state = 'idle';

    if (this.state === 'idle') {
      this.wander(dt, grid);
    } else {
      this.pursue(dt, player, grid);
      if (d < this.attackRange && this.attackCooldown <= 0) {
        this.doAttack(player, floaters, particles, projectiles);
      }
    }

    this.movePhase += dt * 8;
  }

  wander(dt: number, grid: TileGrid): void {
    // Randomly change direction sometimes
    if (Math.random() < 0.01) this.wanderAngle += randRange(-1, 1);
    const v = vecFromAngle(this.wanderAngle, this.stats.speed * 0.3 * dt);
    const nx = this.x + v.x;
    const ny = this.y + v.y;
    if (!isSolid(grid, nx, this.y)) this.x = clamp(nx, this.size, 9999);
    if (!isSolid(grid, this.x, ny)) this.y = clamp(ny, this.size, 9999);
  }

  pursue(dt: number, player: Player, grid: TileGrid): void {
    const angle = angleBetween({ x: this.x, y: this.y }, { x: player.x, y: player.y });
    this.facing = angle;
    const v = vecFromAngle(angle, this.stats.speed * dt);
    const nx = this.x + v.x;
    const ny = this.y + v.y;
    if (!isSolid(grid, nx, this.y)) this.x = clamp(nx, this.size, 9999);
    if (!isSolid(grid, this.x, ny)) this.y = clamp(ny, this.size, 9999);
  }

  doAttack(player: Player, floaters: FloatingNumber[], particles: Particle[], projectiles: Projectile[]): void {
    const cooldowns = { wolf: 900, warrior: 1400, archer: 2000 };
    this.attackCooldown = cooldowns[this.type];

    if (this.type === 'archer') {
      const angle = angleBetween({ x: this.x, y: this.y }, { x: player.x, y: player.y });
      const speed = 280;
      projectiles.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: this.stats.damage,
        damageType: 'darkness',
        fromEnemy: true,
        life: 2.0,
        maxLife: 2.0,
        color: '#cc44ff',
        size: 6,
      });
    } else {
      // Melee
      const isCrit = Math.random() < this.stats.critChance;
      if (!player.shieldActive || Math.random() > 0.4) {
        player.takeDamage(this.stats.damage, this.type === 'wolf' ? 'ice' : 'physical', isCrit, floaters, particles);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (this.dead) return;
    const sx = this.x - camX;
    const sy = this.y - camY;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + this.size - 2, this.size * 0.8, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    ctx.save();
    ctx.translate(sx, sy);

    const flash = this.hitFlash > 0;

    if (this.type === 'wolf') {
      this.drawWolf(ctx, flash);
    } else if (this.type === 'warrior') {
      this.drawWarrior(ctx, flash);
    } else {
      this.drawArcher(ctx, flash);
    }

    ctx.restore();

    this.drawHealthBar(ctx, sx, sy);
  }

  private drawWolf(ctx: CanvasRenderingContext2D, flash: boolean): void {
    const bob = Math.sin(this.movePhase) * 2;
    // Body
    ctx.fillStyle = flash ? '#ff6666' : '#8ab0c8';
    ctx.beginPath();
    ctx.ellipse(0, bob, this.size, this.size * 0.75, this.facing, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.fillStyle = flash ? '#ff4444' : '#a0c4d8';
    ctx.beginPath();
    ctx.arc(Math.cos(this.facing) * this.size * 0.7, Math.sin(this.facing) * this.size * 0.7 + bob, this.size * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#00ccff';
    const ex = Math.cos(this.facing) * this.size * 0.8;
    const ey = Math.sin(this.facing) * this.size * 0.8 + bob;
    ctx.beginPath();
    ctx.arc(ex + Math.sin(this.facing) * 4, ey - Math.cos(this.facing) * 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - Math.sin(this.facing) * 4, ey + Math.cos(this.facing) * 4, 3, 0, Math.PI * 2);
    ctx.fill();
    // Ice breath particles on attack
    if (this.attackCooldown > 700) {
      ctx.fillStyle = 'rgba(0,200,255,0.5)';
      ctx.beginPath();
      ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawWarrior(ctx: CanvasRenderingContext2D, flash: boolean): void {
    const bob = Math.sin(this.movePhase) * 1.5;
    // Body/armor
    ctx.fillStyle = flash ? '#ff6666' : '#704020';
    ctx.beginPath();
    ctx.arc(0, bob, this.size, 0, Math.PI * 2);
    ctx.fill();
    // Plate
    ctx.fillStyle = flash ? '#ff4444' : '#5a3818';
    ctx.beginPath();
    ctx.arc(0, bob - 2, this.size * 0.8, Math.PI, 0);
    ctx.fill();
    // Skull face
    ctx.fillStyle = '#e8e0d0';
    ctx.beginPath();
    ctx.arc(Math.cos(this.facing) * 7, Math.sin(this.facing) * 7 + bob, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    const fx = Math.cos(this.facing) * 7, fy = Math.sin(this.facing) * 7 + bob;
    ctx.fillRect(fx - 4, fy - 2, 3, 4);
    ctx.fillRect(fx + 1, fy - 2, 3, 4);
    // Weapon
    ctx.strokeStyle = flash ? '#ffaaaa' : '#c0a060';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(this.facing - 1.2) * 5, Math.sin(this.facing - 1.2) * 5 + bob);
    ctx.lineTo(Math.cos(this.facing - 1.2) * 30, Math.sin(this.facing - 1.2) * 30 + bob);
    ctx.stroke();
  }

  private drawArcher(ctx: CanvasRenderingContext2D, flash: boolean): void {
    const bob = Math.sin(this.movePhase) * 2;
    // Ghostly form
    const alpha = 0.85 + Math.sin(this.movePhase * 0.5) * 0.1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = flash ? '#ff8888' : '#6644aa';
    ctx.beginPath();
    ctx.arc(0, bob, this.size, 0, Math.PI * 2);
    ctx.fill();
    // Robe
    ctx.fillStyle = flash ? '#ff6666' : '#4422aa';
    ctx.beginPath();
    ctx.arc(0, bob + 2, this.size * 0.8, 0, Math.PI);
    ctx.fill();
    // Hood/skull
    ctx.fillStyle = flash ? '#ff4444' : '#3311aa';
    ctx.beginPath();
    ctx.arc(0, bob - 5, this.size * 0.55, Math.PI, 0);
    ctx.fill();
    // Glowing eyes
    ctx.fillStyle = '#cc44ff';
    const fx = Math.cos(this.facing) * 6, fy = Math.sin(this.facing) * 6 + bob;
    ctx.beginPath();
    ctx.arc(fx + Math.sin(this.facing) * 3, fy - Math.cos(this.facing) * 3, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx - Math.sin(this.facing) * 3, fy + Math.cos(this.facing) * 3, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Bow
    ctx.strokeStyle = '#cc99ff';
    ctx.lineWidth = 2;
    const ba = this.facing + Math.PI / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(this.facing) * 10, Math.sin(this.facing) * 10 + bob, 12, ba - 1, ba + 1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
