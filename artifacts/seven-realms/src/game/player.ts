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
  attackFrames: number = 0;
  isAttacking: boolean = false;

  chargeActive: boolean = false;
  chargeVx: number = 0;
  chargeVy: number = 0;
  chargeFrames: number = 0;

  spinFrames: number = 0;
  shieldFrames: number = 0;
  invincibleFrames: number = 0;
  startTime: number = Date.now();
  runPhase: number = 0;

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

  get totalDamage(): number { return this.stats.damage + (this.equippedWeapon?.damage ?? 0); }
  get totalDefense(): number { return this.stats.defense + (this.equippedArmor?.defense ?? 0); }
  get totalCrit(): number { return this.stats.critChance + (this.equippedWeapon?.critChance ?? 0); }

  update(dt: number, input: Input, grid: TileGrid, floaters: FloatingNumber[], particles: Particle[], bossAttacks: BossAttack[], justPressed?: Set<string>): void {
    if (this.dead) return;
    const now = Date.now();

    this.stats.energy = Math.min(this.stats.maxEnergy, this.stats.energy + ENERGY_REGEN * dt);
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.invincibleFrames > 0) this.invincibleFrames--;
    if (this.shieldFrames > 0) { this.shieldFrames--; this.shieldActive = this.shieldFrames > 0; }

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

    let mvx = 0, mvy = 0;
    // Touch joystick takes priority when active; otherwise fall back to keyboard
    if (input.moveVec && (input.moveVec.x !== 0 || input.moveVec.y !== 0)) {
      mvx = input.moveVec.x;
      mvy = input.moveVec.y;
    } else {
      if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) mvy -= 1;
      if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) mvy += 1;
      if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) mvx -= 1;
      if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) mvx += 1;
    }

    const mv = normalize({ x: mvx, y: mvy });
    const spd = this.stats.speed;
    const nx = this.x + mv.x * spd * dt;
    const ny = this.y + mv.y * spd * dt;
    if (!isSolid(grid, nx, this.y) && nx > PLAYER_SIZE && nx < MAP_W - PLAYER_SIZE) this.x = nx;
    if (!isSolid(grid, this.x, ny) && ny > PLAYER_SIZE && ny < MAP_H - PLAYER_SIZE) this.y = ny;

    if (mvx !== 0 || mvy !== 0) { this.facing = Math.atan2(mv.y, mv.x); this.runPhase += 0.25; }

    this.attackAngle = angleBetween({ x: this.x, y: this.y }, input.mouseWorld);
    if (this.attackCooldown > 0) this.attackCooldown -= dt * 1000;
    if (this.attackFrames > 0) { this.attackFrames--; this.isAttacking = true; } else this.isAttacking = false;
    if (this.spinFrames > 0) this.spinFrames--;

    const skillKeys: Record<string, number> = { KeyQ: 0, KeyE: 1, KeyR: 2, KeyF: 3 };
    const keySource = justPressed ?? input.keys;
    for (const [key, idx] of Object.entries(skillKeys)) {
      if (keySource.has(key)) {
        this.activateSkill(idx, now, input, particles);
        if (justPressed) justPressed.delete(key);
      }
    }

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
      case 'warriorCharge': {
        const dir = vecFromAngle(this.attackAngle, 1);
        this.chargeVx = dir.x; this.chargeVy = dir.y;
        this.chargeFrames = 14; this.chargeActive = true;
        for (let i = 0; i < 16; i++) {
          particles.push({
            x: this.x, y: this.y,
            vx: -dir.x * randRange(2, 6) + randRange(-1.5, 1.5),
            vy: -dir.y * randRange(2, 6) + randRange(-1.5, 1.5),
            life: randRange(10, 22), maxLife: 22,
            color: i % 2 === 0 ? '#44aaff' : '#88ccff', size: randRange(3, 7),
          });
        }
        break;
      }
      case 'spinAttack': {
        this.spinFrames = 25;
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          particles.push({
            x: this.x + Math.cos(a) * 30, y: this.y + Math.sin(a) * 30,
            vx: Math.cos(a) * randRange(1.5, 5), vy: Math.sin(a) * randRange(1.5, 5),
            life: randRange(18, 35), maxLife: 35,
            color: i % 3 === 0 ? '#ffaa22' : i % 3 === 1 ? '#ff6600' : '#ffdd44',
            size: randRange(3, 8),
          });
        }
        break;
      }
      case 'heavyStrike': {
        this.attackFrames = 18; this.isAttacking = true;
        for (let i = 0; i < 16; i++) {
          const a = this.attackAngle + randRange(-0.6, 0.6);
          particles.push({
            x: this.x + Math.cos(a) * 40, y: this.y + Math.sin(a) * 40,
            vx: Math.cos(a) * randRange(2, 6), vy: Math.sin(a) * randRange(2, 6),
            life: randRange(12, 28), maxLife: 28,
            color: i % 2 === 0 ? '#ff3300' : '#ff8800', size: randRange(4, 10),
          });
        }
        break;
      }
      case 'ancestralShield': {
        this.shieldFrames = 180; this.shieldActive = true;
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          particles.push({
            x: this.x + Math.cos(a) * 28, y: this.y + Math.sin(a) * 28,
            vx: Math.cos(a) * randRange(0.5, 2.5), vy: Math.sin(a) * randRange(0.5, 2.5),
            life: 45, maxLife: 45,
            color: i % 2 === 0 ? '#ffd700' : '#fff0a0', size: randRange(4, 9),
          });
        }
        break;
      }
    }
    void input;
  }

  doBasicAttack(floaters: FloatingNumber[], particles: Particle[], targetCallback: (ax: number, ay: number, range: number, angle: number, damage: number, crit: boolean) => void): void {
    if (this.attackCooldown > 0 || this.dead) return;
    this.attackCooldown = 480;
    this.attackFrames = 10;
    this.isAttacking = true;
    const isCrit = Math.random() < this.totalCrit;
    targetCallback(this.x, this.y, this.attackRange, this.attackAngle, this.totalDamage, isCrit);
    void floaters; void particles;
  }

  gainXP(amount: number): boolean {
    this.xp += amount;
    if (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.round(this.xpToNext * 1.4);
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
    const flash = this.hitFlash > 0;
    const isMoving = this.runPhase > 0;
    const squash = isMoving ? (1 + Math.sin(this.runPhase * 2) * 0.06) : 1;
    const S = this.size;

    // Shield aura
    if (this.shieldActive) {
      const pulse = Math.sin(Date.now() * 0.008) * 4;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, S + 14 + pulse, 0, Math.PI * 2);
      const shieldGrad = ctx.createRadialGradient(sx, sy, S + 4, sx, sy, S + 18 + pulse);
      shieldGrad.addColorStop(0, 'rgba(255,220,50,0.35)');
      shieldGrad.addColorStop(1, 'rgba(255,180,0,0)');
      ctx.fillStyle = shieldGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,0,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy);

    // Drop shadow
    ctx.save();
    ctx.scale(squash, 1 / squash);
    const shadowGrad = ctx.createRadialGradient(0, S - 2, 0, 0, S + 2, S * 0.85);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.45)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(0, S - 2, S * 0.85, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.scale(squash, 1 / squash);

    // — LEGS (behind body, left/right feet) —
    if (!this.chargeActive) {
      const legSwing = Math.sin(this.runPhase * 2) * 5;
      ctx.fillStyle = flash ? '#ff5555' : '#2a3a55';
      // Left leg
      ctx.beginPath();
      ctx.ellipse(-5, S * 0.6 + legSwing * 0.4, 4, 6, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Right leg
      ctx.beginPath();
      ctx.ellipse(5, S * 0.6 - legSwing * 0.4, 4, 6, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // — BODY / TORSO —
    const bodyColor = flash ? '#ff6666' : (this.equippedArmor ? '#4a7acc' : '#8a6830');
    // Main body
    ctx.beginPath();
    ctx.arc(0, 0, S, 0, Math.PI * 2);
    const bodyGrad = ctx.createRadialGradient(-S * 0.3, -S * 0.3, 0, 0, 0, S);
    bodyGrad.addColorStop(0, flash ? '#ff9999' : (this.equippedArmor ? '#6699ee' : '#b08040'));
    bodyGrad.addColorStop(1, flash ? '#cc2222' : (this.equippedArmor ? '#2a5aa0' : '#6a4820'));
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Armor chest plate
    const plateColor = flash ? '#ff4444' : (this.equippedArmor ? '#3a6aaa' : '#4a5a70');
    ctx.fillStyle = plateColor;
    ctx.beginPath();
    ctx.arc(0, -4, S * 0.74, Math.PI, Math.PI * 2);
    ctx.fill();

    // Chest detail — rivets
    if (!flash) {
      ctx.fillStyle = this.equippedArmor ? '#88aadd' : '#6a7a8a';
      ctx.beginPath(); ctx.arc(-S * 0.3, -S * 0.25, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(S * 0.3, -S * 0.25, 2, 0, Math.PI * 2); ctx.fill();
    }

    // Pauldrons (shoulder guards)
    const pauldronColor = flash ? '#ff5555' : (this.equippedArmor ? '#2a5898' : '#3a4860');
    ctx.fillStyle = pauldronColor;
    ctx.beginPath(); ctx.ellipse(-S * 0.85, -S * 0.3, 6, 8, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(S * 0.85, -S * 0.3, 6, 8, 0.4, 0, Math.PI * 2); ctx.fill();

    // — HELMET —
    const helmColor = flash ? '#ff5555' : '#2a3848';
    // Helm base
    ctx.fillStyle = helmColor;
    ctx.beginPath();
    ctx.arc(0, -S * 0.55, S * 0.52, Math.PI, Math.PI * 2);
    ctx.fill();
    // Helm top ridge
    ctx.fillStyle = flash ? '#ff6666' : '#1e2c3c';
    ctx.beginPath();
    ctx.moveTo(-S * 0.3, -S * 0.55);
    ctx.lineTo(0, -S - 4);
    ctx.lineTo(S * 0.3, -S * 0.55);
    ctx.fill();
    // Visor strip
    ctx.fillStyle = flash ? '#ffaaaa' : '#151f2c';
    ctx.beginPath();
    ctx.rect(-S * 0.35, -S * 0.72, S * 0.7, 5);
    ctx.fill();

    // — EYES visible through visor —
    const eyeAngle = this.attackAngle;
    const eyeOffX = Math.cos(eyeAngle) * 6;
    const eyeOffY = Math.sin(eyeAngle) * 6 - S * 0.62;
    ctx.fillStyle = flash ? '#ffff88' : '#00aaff';
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur = flash ? 0 : 6;
    ctx.beginPath();
    ctx.ellipse(eyeOffX - Math.sin(eyeAngle) * 3.5, eyeOffY + Math.cos(eyeAngle) * 3.5, 2.5, 1.8, eyeAngle, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(eyeOffX + Math.sin(eyeAngle) * 3.5, eyeOffY - Math.cos(eyeAngle) * 3.5, 2.5, 1.8, eyeAngle, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // — WEAPON / SWORD —
    const swingOffset = this.isAttacking
      ? (this.attackFrames > 5 ? -0.8 : 0.8)
      : Math.sin(this.runPhase * 0.5) * 0.12;
    const weapAngle = this.attackAngle + swingOffset;
    const wHand = S + 1;
    ctx.save();
    ctx.translate(Math.cos(weapAngle) * wHand, Math.sin(weapAngle) * wHand);
    ctx.rotate(weapAngle + Math.PI / 2);

    const hasWeapon = !!this.equippedWeapon;
    const bladeColor = hasWeapon ? '#aaddff' : '#b0b8c0';
    const edgeColor = hasWeapon ? '#ddf0ff' : '#d0d8e0';

    // Pommel
    ctx.fillStyle = '#aa8830';
    ctx.beginPath(); ctx.arc(0, 12, 4, 0, Math.PI * 2); ctx.fill();
    // Grip
    ctx.fillStyle = '#6a3a18';
    ctx.fillRect(-2, -2, 4, 14);
    // Guard
    ctx.fillStyle = '#c8a040';
    ctx.fillRect(-8, -4, 16, 5);
    // Blade
    ctx.fillStyle = bladeColor;
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(3, -5);
    ctx.lineTo(1.5, -26);
    ctx.lineTo(0, -32);
    ctx.lineTo(-1.5, -26);
    ctx.closePath();
    ctx.fill();
    // Blade edge highlight
    ctx.fillStyle = edgeColor;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(1.5, -24); ctx.lineTo(0, -31);
    ctx.closePath();
    ctx.fill();
    // Blade glow if equipped
    if (hasWeapon) {
      ctx.shadowColor = '#88ddff';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(120,200,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // — SPIN ATTACK ring —
    if (this.spinFrames > 0) {
      const spinAlpha = this.spinFrames / 25;
      ctx.strokeStyle = `rgba(255,140,0,${spinAlpha * 0.9})`;
      ctx.lineWidth = 6;
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, S + 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Inner ring
      ctx.strokeStyle = `rgba(255,220,80,${spinAlpha * 0.6})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, S + 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // — ATTACK SWING ARC (screen space) —
    if (this.isAttacking && this.attackFrames > 0) {
      const swingAlpha = this.attackFrames / 11;
      ctx.save();
      ctx.globalAlpha = swingAlpha;
      // White arc
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#88ccff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(sx, sy, this.attackRange, this.attackAngle - 0.65, this.attackAngle + 0.65);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Outer flash ring
      ctx.strokeStyle = 'rgba(200,230,255,0.4)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(sx, sy, this.attackRange + 4, this.attackAngle - 0.5, this.attackAngle + 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }
}
