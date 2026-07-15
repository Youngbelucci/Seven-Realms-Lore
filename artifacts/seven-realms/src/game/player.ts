import { Entity } from './entity';
import { FloatingNumber, Particle, Item, SkillDef, Input, BossAttack } from './types';
import { PLAYER_SIZE, PLAYER_BASE_SPEED, PLAYER_BASE_HP, PLAYER_BASE_ENERGY, MAP_W, MAP_H, ENERGY_REGEN } from './constants';
import { createSkills, isSkillReady, getSkillCooldownFraction } from './skills';
import { clamp, angleBetween, circlesOverlap, normalize, vecFromAngle, randRange } from './utils';
import { isSolid } from './tilemap';
import type { TileGrid } from './tilemap';

export class Player extends Entity {
  skills: SkillDef[] = createSkills();
  xp: number = 0;
  level: number = 1;
  xpToNext: number = 100;
  kills: number = 0;
  equippedWeapon: Item | null = null;
  equippedArmor: Item | null = null;

  attackCooldown: number = 0;
  attackRange: number = 55;
  attackAngle: number = 0;
  attackFrames: number = 0; // visual swing frames
  isAttacking: boolean = false;

  chargeActive: boolean = false;
  chargeVx: number = 0;
  chargeVy: number = 0;
  chargeFrames: number = 0;

  spinFrames: number = 0;

  shieldFrames: number = 0;
  invincibleFrames: number = 0;
  startTime: number = Date.now();

  runPhase: number = 0; // animation phase

  constructor(x: number, y: number) {
    super(x, y, PLAYER_SIZE, {
      hp: PLAYER_BASE_HP,
      maxHp: PLAYER_BASE_HP,
      energy: PLAYER_BASE_ENERGY,
      maxEnergy: PLAYER_BASE_ENERGY,
      damage: 22,
      defense: 5,
      speed: PLAYER_BASE_SPEED,
      critChance: 0.1,
      critMultiplier: 2.2,
    });
  }

  get totalDamage(): number {
    return this.stats.damage + (this.equippedWeapon?.damage ?? 0);
  }
  get totalDefense(): number {
    return this.stats.defense + (this.equippedArmor?.defense ?? 0);
  }
  get totalCrit(): number {
    return this.stats.critChance + (this.equippedWeapon?.critChance ?? 0);
  }

  update(dt: number, input: Input, grid: TileGrid, floaters: FloatingNumber[], particles: Particle[], bossAttacks: BossAttack[], justPressed?: Set<string>): void {
    if (this.dead) return;
    const now = Date.now();

    // Energy regen
    this.stats.energy = Math.min(this.stats.maxEnergy, this.stats.energy + ENERGY_REGEN * dt);

    // Hit flash
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.invincibleFrames > 0) this.invincibleFrames--;

    // Shield
    if (this.shieldFrames > 0) {
      this.shieldFrames--;
      this.shieldActive = this.shieldFrames > 0;
    }

    // Charge movement
    if (this.chargeActive && this.chargeFrames > 0) {
      this.chargeFrames--;
      const nx = this.x + this.chargeVx * 8;
      const ny = this.y + this.chargeVy * 8;
      if (!isSolid(grid, nx, ny)) {
        this.x = clamp(nx, PLAYER_SIZE, MAP_W - PLAYER_SIZE);
        this.y = clamp(ny, PLAYER_SIZE, MAP_H - PLAYER_SIZE);
      }
      if (this.chargeFrames <= 0) this.chargeActive = false;
      this.runPhase += 0.4;
      return;
    }

    // WASD Movement
    let mvx = 0, mvy = 0;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) mvy -= 1;
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) mvy += 1;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) mvx -= 1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) mvx += 1;

    const mv = normalize({ x: mvx, y: mvy });
    const spd = this.stats.speed;

    const nx = this.x + mv.x * spd * dt;
    const ny = this.y + mv.y * spd * dt;

    if (!isSolid(grid, nx, this.y) && nx > PLAYER_SIZE && nx < MAP_W - PLAYER_SIZE) {
      this.x = nx;
    }
    if (!isSolid(grid, this.x, ny) && ny > PLAYER_SIZE && ny < MAP_H - PLAYER_SIZE) {
      this.y = ny;
    }

    if (mvx !== 0 || mvy !== 0) {
      this.facing = Math.atan2(mv.y, mv.x);
      this.runPhase += 0.25;
    }

    // Face mouse
    this.attackAngle = angleBetween({ x: this.x, y: this.y }, input.mouseWorld);

    // Basic attack cooldown
    if (this.attackCooldown > 0) this.attackCooldown -= dt * 1000;
    if (this.attackFrames > 0) { this.attackFrames--; this.isAttacking = true; } else this.isAttacking = false;

    // Spin attack animation
    if (this.spinFrames > 0) this.spinFrames--;

    // Skill activation — Q/E/R/F, none of which conflict with WASD movement keys
    // Use justPressed (edge-triggered) so tapping a key fires the skill exactly once
    const skillKeys: Record<string, number> = { KeyQ: 0, KeyE: 1, KeyR: 2, KeyF: 3 };
    const keySource = justPressed ?? input.keys;
    for (const [key, idx] of Object.entries(skillKeys)) {
      if (keySource.has(key)) {
        this.activateSkill(idx, now, input, particles);
        if (justPressed) justPressed.delete(key);
      }
    }

    // Take damage from boss attacks
    if (this.invincibleFrames <= 0) {
      for (const atk of bossAttacks) {
        if (circlesOverlap(this.x, this.y, this.size, atk.x, atk.y, atk.radius)) {
          this.takeDamage(atk.damage, 'ice', false, floaters, particles);
          this.invincibleFrames = 60;
          break;
        }
      }
    }
  }

  activateSkill(idx: number, now: number, input: Input, particles: Particle[]): void {
    const sk = this.skills[idx];
    if (!isSkillReady(sk, now, this.stats.energy)) return;
    sk.lastUsed = now;
    this.stats.energy -= sk.energyCost;

    switch (sk.id) {
      case 'warriorCharge':
        const dir = vecFromAngle(this.attackAngle, 1);
        this.chargeVx = dir.x;
        this.chargeVy = dir.y;
        this.chargeFrames = 14;
        this.chargeActive = true;
        // Charge particles
        for (let i = 0; i < 12; i++) {
          particles.push({
            x: this.x,
            y: this.y,
            vx: -dir.x * randRange(2, 5) + randRange(-1, 1),
            vy: -dir.y * randRange(2, 5) + randRange(-1, 1),
            life: randRange(10, 20),
            maxLife: 20,
            color: '#00aaff',
            size: randRange(3, 6),
          });
        }
        break;
      case 'spinAttack':
        this.spinFrames = 25;
        // Lots of orange particles
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          particles.push({
            x: this.x + Math.cos(a) * 30,
            y: this.y + Math.sin(a) * 30,
            vx: Math.cos(a) * randRange(1, 4),
            vy: Math.sin(a) * randRange(1, 4),
            life: randRange(15, 30),
            maxLife: 30,
            color: '#ff9900',
            size: randRange(3, 7),
          });
        }
        break;
      case 'heavyStrike':
        this.attackFrames = 18;
        this.isAttacking = true;
        for (let i = 0; i < 12; i++) {
          const a = this.attackAngle + randRange(-0.5, 0.5);
          particles.push({
            x: this.x + Math.cos(a) * 40,
            y: this.y + Math.sin(a) * 40,
            vx: Math.cos(a) * randRange(2, 5),
            vy: Math.sin(a) * randRange(2, 5),
            life: randRange(10, 25),
            maxLife: 25,
            color: '#ff4444',
            size: randRange(4, 9),
          });
        }
        break;
      case 'ancestralShield':
        this.shieldFrames = 180; // 3 seconds
        this.shieldActive = true;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          particles.push({
            x: this.x + Math.cos(a) * 28,
            y: this.y + Math.sin(a) * 28,
            vx: Math.cos(a) * randRange(0.5, 2),
            vy: Math.sin(a) * randRange(0.5, 2),
            life: 40,
            maxLife: 40,
            color: '#ffd700',
            size: randRange(4, 8),
          });
        }
        break;
    }
  }

  doBasicAttack(floaters: FloatingNumber[], particles: Particle[], targetCallback: (ax: number, ay: number, range: number, angle: number, damage: number, crit: boolean) => void): void {
    if (this.attackCooldown > 0 || this.dead) return;
    this.attackCooldown = 480;
    this.attackFrames = 10;
    this.isAttacking = true;

    const isCrit = Math.random() < this.totalCrit;
    targetCallback(this.x, this.y, this.attackRange, this.attackAngle, this.totalDamage, isCrit);
  }

  gainXP(amount: number): boolean {
    this.xp += amount;
    if (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.round(this.xpToNext * 1.4);
      // Stat upgrades
      this.stats.maxHp += 25;
      this.stats.hp = Math.min(this.stats.hp + 50, this.stats.maxHp);
      this.stats.maxEnergy += 10;
      this.stats.damage += 4;
      this.stats.speed += 6;
      return true;
    }
    return false;
  }

  equipItem(item: Item): void {
    if (item.slot === 'weapon') this.equippedWeapon = item;
    else this.equippedArmor = item;
  }

  getElapsedSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  update2(_dt: number, ..._args: unknown[]): void {}

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const sx = this.x - camX;
    const sy = this.y - camY;

    // Shield aura
    if (this.shieldActive) {
      const pulse = Math.sin(Date.now() * 0.01) * 3;
      ctx.beginPath();
      ctx.arc(sx, sy, this.size + 10 + pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(sx, sy);

    // Shadow
    ctx.beginPath();
    ctx.ellipse(0, this.size - 2, this.size * 0.8, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    // Body
    const flash = this.hitFlash > 0;
    ctx.fillStyle = flash ? '#ff6666' : '#c8a060';
    ctx.beginPath();
    ctx.arc(0, 0, this.size, 0, Math.PI * 2);
    ctx.fill();

    // Armor plate
    ctx.fillStyle = flash ? '#ff4444' : (this.equippedArmor ? '#7090c0' : '#506080');
    ctx.beginPath();
    ctx.arc(0, -3, this.size * 0.72, Math.PI, Math.PI * 2);
    ctx.fill();

    // Helmet
    ctx.fillStyle = flash ? '#ff5555' : '#405070';
    ctx.beginPath();
    ctx.arc(0, -8, this.size * 0.5, Math.PI, 0);
    ctx.fill();

    // Eyes
    const eyeAngle = this.attackAngle;
    const ex = Math.cos(eyeAngle) * 8;
    const ey = Math.sin(eyeAngle) * 8 - 6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a5aff';
    ctx.beginPath();
    ctx.arc(ex + Math.cos(eyeAngle), ey + Math.sin(eyeAngle), 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Sword / weapon
    const weaponAngle = this.isAttacking
      ? this.attackAngle + (this.attackFrames > 5 ? -0.6 : 0.6)
      : this.attackAngle;
    const wx = Math.cos(weaponAngle) * (this.size + 2);
    const wy = Math.sin(weaponAngle) * (this.size + 2);
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(weaponAngle);
    // Blade
    ctx.fillStyle = this.equippedWeapon ? '#88ccff' : '#c0c0c0';
    ctx.fillRect(-3, -16, 6, 32);
    ctx.fillStyle = '#ffdd88';
    ctx.fillRect(-5, -4, 10, 5); // guard
    ctx.restore();

    // Spin attack visual
    if (this.spinFrames > 0) {
      ctx.strokeStyle = `rgba(255,153,0,${this.spinFrames / 25})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, this.size + 15, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // Attack swing arc
    if (this.isAttacking && this.attackFrames > 0) {
      ctx.save();
      ctx.globalAlpha = this.attackFrames / 12;
      ctx.strokeStyle = '#ffffffcc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, this.attackRange, this.attackAngle - 0.6, this.attackAngle + 0.6);
      ctx.stroke();
      ctx.restore();
    }
  }
}
