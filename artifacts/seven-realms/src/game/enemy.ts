import { Entity } from './entity';
import { FloatingNumber, Particle, Projectile, EnemyState } from './types';
import { ENEMY_AGGRO_RANGE, ENEMY_ATTACK_RANGE_MELEE, ENEMY_ATTACK_RANGE_RANGED } from './constants';
import { dist, normalize, clamp, randRange, angleBetween, vecFromAngle } from './utils';
import { isSolid } from './world';
import { assets } from './assets';
import type { TileGrid } from './world';
import type { Player } from './player';

export type EnemyType = 'wolf' | 'warrior' | 'archer';

export class Enemy extends Entity {
  type: EnemyType;
  state: EnemyState = 'idle';
  attackCooldown: number = 0;
  attackRange: number;
  xpValue: number;
  tier: number;
  movePhase: number = Math.random() * Math.PI * 2; // random start phase
  wanderAngle: number = Math.random() * Math.PI * 2;
  stunFrames: number = 0;

  constructor(x: number, y: number, type: EnemyType, realm: number = 1) {
    const stats = Enemy.statsFor(type);
    // Realm scaling: each realm past the first makes enemies tougher and stronger.
    const hpMul = 1 + (realm - 1) * 0.35;
    const dmgMul = 1 + (realm - 1) * 0.22;
    stats.hp = Math.round(stats.hp * hpMul);
    stats.maxHp = stats.hp;
    stats.damage = Math.round(stats.damage * dmgMul);
    stats.defense += (realm - 1) * 2;
    super(x, y, Enemy.sizeFor(type), stats);
    this.type = type;
    this.attackRange = type === 'archer' ? ENEMY_ATTACK_RANGE_RANGED : ENEMY_ATTACK_RANGE_MELEE;
    this.xpValue = Math.round(Enemy.xpFor(type) * (1 + (realm - 1) * 0.3));
    // Higher realms drop better loot (tier feeds the rarity weights).
    this.tier = Enemy.tierFor(type) + Math.min(realm - 1, 2);
  }

  static statsFor(type: EnemyType) {
    switch (type) {
      case 'wolf':    return { hp: 60,  maxHp: 60,  energy: 0, maxEnergy: 0, damage: 12, defense: 2,  speed: 140, critChance: 0.05, critMultiplier: 1.5 };
      case 'warrior': return { hp: 140, maxHp: 140, energy: 0, maxEnergy: 0, damage: 20, defense: 10, speed: 80,  critChance: 0.06, critMultiplier: 1.5 };
      case 'archer':  return { hp: 80,  maxHp: 80,  energy: 0, maxEnergy: 0, damage: 15, defense: 4,  speed: 90,  critChance: 0.08, critMultiplier: 1.8 };
    }
  }

  static sizeFor(type: EnemyType): number {
    switch (type) { case 'wolf': return 14; case 'warrior': return 20; case 'archer': return 15; }
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

    this.movePhase += dt * (this.type === 'wolf' ? 10 : 7);
  }

  wander(dt: number, grid: TileGrid): void {
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
        x: this.x, y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: this.stats.damage,
        damageType: 'darkness',
        fromEnemy: true,
        life: 2.0, maxLife: 2.0,
        color: '#cc44ff', size: 6,
      });
    } else {
      const isCrit = Math.random() < this.stats.critChance;
      if (!player.shieldActive || Math.random() > 0.4) {
        player.takeDamage(this.stats.damage, this.type === 'wolf' ? 'ice' : 'physical', isCrit, floaters, particles);
      }
    }
    void particles;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (this.dead) return;
    const sx = this.x - camX;
    const sy = this.y - camY;
    const flash = this.hitFlash > 0;
    const isAggro = this.state === 'aggro';

    // Aggro pulse ring
    if (isAggro) {
      const pulseR = this.size + 8 + Math.sin(this.movePhase * 2) * 3;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, pulseR, 0, Math.PI * 2);
      const auraColor = this.type === 'wolf' ? '0,180,255' : this.type === 'warrior' ? '200,60,20' : '160,50,255';
      ctx.strokeStyle = `rgba(${auraColor},0.25)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(sx, sy + this.size - 2, this.size * 0.85, 5, 0, 0, Math.PI * 2);
    const shadowGrad = ctx.createRadialGradient(sx, sy + this.size, 0, sx, sy + this.size + 2, this.size * 0.85);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGrad;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(sx, sy);

    const sprite = assets.getImage(`enemies/${this.type}`);
    if (sprite) {
      this.drawSpriteImage(ctx, sprite, flash);
    } else if (this.type === 'wolf') this.drawWolf(ctx, flash);
    else if (this.type === 'warrior') this.drawWarrior(ctx, flash);
    else this.drawArcher(ctx, flash);

    ctx.restore();
    this.drawHealthBar(ctx, sx, sy);
  }

  // — IMAGE SPRITE — drawn when the asset pipeline has the art; otherwise the
  // procedural drawXxx fallbacks below keep working exactly as before.
  private drawSpriteImage(ctx: CanvasRenderingContext2D, sprite: HTMLImageElement, flash: boolean): void {
    const targetH = this.size * 3.4;
    const targetW = targetH * (sprite.width / sprite.height);
    const bob = Math.sin(this.movePhase) * 2;
    const feetY = this.size + 2;
    // Mirror the art to match movement direction (wolf art faces left; the
    // humanoids face slightly right).
    const facingRight = Math.cos(this.facing) >= 0;
    const flip = this.type === 'wolf' ? facingRight : !facingRight;

    ctx.save();
    if (flip) ctx.scale(-1, 1);
    if (flash) ctx.filter = 'brightness(1.9) saturate(1.4)';
    ctx.drawImage(sprite, -targetW / 2, feetY - targetH + bob, targetW, targetH);
    ctx.restore();
  }

  private drawWolf(ctx: CanvasRenderingContext2D, flash: boolean): void {
    const S = this.size;
    // Gallop bob — more dynamic
    const bob = Math.sin(this.movePhase) * 2.5;
    const tilt = Math.sin(this.movePhase * 0.5) * 0.08;

    ctx.save();
    ctx.rotate(tilt);

    // ICE WOLF body — elongated low-slung predator shape
    const bodyGrad = ctx.createRadialGradient(-S * 0.2, bob - S * 0.2, 0, 0, bob, S);
    bodyGrad.addColorStop(0, flash ? '#ffaaaa' : '#7ab8d8');
    bodyGrad.addColorStop(1, flash ? '#cc2222' : '#2a5878');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, bob, S * 1.1, S * 0.72, this.facing * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Fur texture — dark back stripe
    if (!flash) {
      ctx.fillStyle = 'rgba(20,50,80,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, bob - S * 0.15, S * 0.4, S * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head — pointed snout
    const hx = Math.cos(this.facing) * S * 0.75;
    const hy = Math.sin(this.facing) * S * 0.75 + bob;
    ctx.fillStyle = flash ? '#ff8888' : '#8ac8e0';
    ctx.beginPath();
    ctx.arc(hx, hy, S * 0.52, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    const snoutX = hx + Math.cos(this.facing) * S * 0.45;
    const snoutY = hy + Math.sin(this.facing) * S * 0.45;
    ctx.fillStyle = flash ? '#ff6666' : '#5a9ab8';
    ctx.beginPath();
    ctx.ellipse(snoutX, snoutY, S * 0.28, S * 0.2, this.facing, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    const earL = this.facing - Math.PI / 3;
    const earR = this.facing + Math.PI / 3;
    ctx.fillStyle = flash ? '#ff5555' : '#6aaac0';
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(earL) * S * 0.3, hy + Math.sin(earL) * S * 0.3);
    ctx.lineTo(hx + Math.cos(this.facing - 0.8) * (S * 0.55), hy + Math.sin(this.facing - 0.8) * (S * 0.55));
    ctx.lineTo(hx + Math.cos(this.facing - 0.3) * S * 0.35, hy + Math.sin(this.facing - 0.3) * S * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(earR) * S * 0.3, hy + Math.sin(earR) * S * 0.3);
    ctx.lineTo(hx + Math.cos(this.facing + 0.8) * (S * 0.55), hy + Math.sin(this.facing + 0.8) * (S * 0.55));
    ctx.lineTo(hx + Math.cos(this.facing + 0.3) * S * 0.35, hy + Math.sin(this.facing + 0.3) * S * 0.35);
    ctx.closePath();
    ctx.fill();

    // Glowing ice eyes
    const ex = hx + Math.cos(this.facing) * S * 0.35;
    const ey = hy + Math.sin(this.facing) * S * 0.35;
    ctx.save();
    ctx.shadowColor = '#00eeff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = flash ? '#ffffff' : '#00ddff';
    ctx.beginPath();
    ctx.arc(ex + Math.sin(this.facing) * 4, ey - Math.cos(this.facing) * 4, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - Math.sin(this.facing) * 4, ey + Math.cos(this.facing) * 4, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Ice breath when attacking
    if (this.attackCooldown > 700) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#88eeff';
      ctx.shadowColor = '#00ccff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(snoutX + Math.cos(this.facing) * 8, snoutY + Math.sin(this.facing) * 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Tail
    const tailAngle = this.facing + Math.PI + Math.sin(this.movePhase) * 0.4;
    ctx.strokeStyle = flash ? '#ff5555' : '#5a9ab8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-Math.cos(this.facing) * S, -Math.sin(this.facing) * S + bob);
    ctx.quadraticCurveTo(
      Math.cos(tailAngle) * S * 1.2, Math.sin(tailAngle) * S * 1.2 + bob,
      Math.cos(tailAngle) * S * 1.6, Math.sin(tailAngle) * S * 1.6 + bob
    );
    ctx.stroke();

    ctx.restore();
  }

  private drawWarrior(ctx: CanvasRenderingContext2D, flash: boolean): void {
    const S = this.size;
    const bob = Math.sin(this.movePhase) * 1.8;

    // FALLEN WARRIOR — undead armored brute

    // Heavy cape/cloak behind
    ctx.fillStyle = flash ? '#992222' : '#2a1810';
    ctx.beginPath();
    ctx.arc(0, bob + 3, S * 0.95, 0.3, Math.PI - 0.3);
    ctx.fill();

    // Body — armored torso
    const bodyGrad = ctx.createRadialGradient(-S * 0.3, bob - S * 0.3, 0, 0, bob, S);
    bodyGrad.addColorStop(0, flash ? '#ff9966' : '#8c5028');
    bodyGrad.addColorStop(1, flash ? '#cc3300' : '#3c2010');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, bob, S, 0, Math.PI * 2);
    ctx.fill();

    // Chest plate — heavy armor
    ctx.fillStyle = flash ? '#ff5533' : '#4a3018';
    ctx.beginPath();
    ctx.arc(0, bob - 2, S * 0.82, Math.PI, Math.PI * 2);
    ctx.fill();

    // Pauldrons
    ctx.fillStyle = flash ? '#ff4422' : '#382208';
    ctx.beginPath(); ctx.ellipse(-S * 0.88, bob - S * 0.2, 7, 9, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(S * 0.88, bob - S * 0.2, 7, 9, 0.3, 0, Math.PI * 2); ctx.fill();

    // Skull face
    const fx = Math.cos(this.facing) * S * 0.55;
    const fy = Math.sin(this.facing) * S * 0.55 + bob;
    ctx.fillStyle = flash ? '#ffeecc' : '#d8cfc0';
    ctx.beginPath();
    ctx.arc(fx, fy, S * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Dark helm top
    ctx.fillStyle = flash ? '#ff3300' : '#1a1208';
    ctx.beginPath();
    ctx.arc(fx, fy - S * 0.25, S * 0.3, Math.PI, Math.PI * 2);
    ctx.fill();

    // Empty eye sockets — glowing red
    const skullEyeL = { x: fx + Math.sin(this.facing) * 5, y: fy - Math.cos(this.facing) * 5 - 2 };
    const skullEyeR = { x: fx - Math.sin(this.facing) * 5, y: fy + Math.cos(this.facing) * 5 - 2 };
    ctx.save();
    ctx.shadowColor = '#ff2200';
    ctx.shadowBlur = 8;
    ctx.fillStyle = flash ? '#ffaa00' : '#cc1100';
    ctx.beginPath(); ctx.ellipse(skullEyeL.x, skullEyeL.y, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(skullEyeR.x, skullEyeR.y, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill();
    // Black pupils
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(skullEyeL.x, skullEyeL.y, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(skullEyeR.x, skullEyeR.y, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Skull jaw marks / teeth
    if (!flash) {
      ctx.fillStyle = '#111';
      for (let t = -1; t <= 1; t++) {
        ctx.fillRect(fx + t * 5 - 1.5, fy + S * 0.2, 3, 5);
      }
    }

    // Weapon — rusted battle axe
    const weapAngle = this.facing - 1.1 + Math.sin(this.movePhase) * 0.15;
    const wpx = Math.cos(weapAngle) * (S * 0.7);
    const wpy = Math.sin(weapAngle) * (S * 0.7) + bob;
    ctx.save();
    ctx.translate(wpx, wpy);
    ctx.rotate(weapAngle - Math.PI / 2);
    // Shaft
    ctx.strokeStyle = flash ? '#ffaaaa' : '#5a3a18';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(0, -26);
    ctx.stroke();
    // Axe head
    ctx.fillStyle = flash ? '#ff7755' : '#887060';
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(-12, -30);
    ctx.lineTo(-8, -38);
    ctx.lineTo(4, -30);
    ctx.closePath();
    ctx.fill();
    // Axe highlight
    ctx.fillStyle = flash ? '#ffaa88' : '#b09080';
    ctx.beginPath();
    ctx.moveTo(-3, -24);
    ctx.lineTo(-10, -32);
    ctx.lineTo(-7, -37);
    ctx.lineTo(-1, -28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawArcher(ctx: CanvasRenderingContext2D, flash: boolean): void {
    const S = this.size;
    const bob = Math.sin(this.movePhase * 0.6) * 2.5;
    const drift = Math.sin(this.movePhase * 0.3) * 1.5;

    // SPECTRAL ARCHER — ghostly hovering wraith

    // Ghost trail / ectoplasm drips beneath
    ctx.save();
    ctx.globalAlpha = 0.3;
    for (let i = 1; i <= 3; i++) {
      ctx.fillStyle = '#6633cc';
      ctx.beginPath();
      ctx.ellipse(drift * i * 0.3, S * 0.5 + i * 7, S * 0.4 * (1 - i * 0.2), 6 - i, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Main spectral body — fading at bottom
    const ghostGrad = ctx.createRadialGradient(0, bob, 0, 0, bob + S * 0.3, S * 1.1);
    ghostGrad.addColorStop(0, flash ? 'rgba(255,160,200,0.95)' : 'rgba(100,50,180,0.95)');
    ghostGrad.addColorStop(0.6, flash ? 'rgba(200,80,120,0.7)' : 'rgba(60,20,120,0.7)');
    ghostGrad.addColorStop(1, 'rgba(30,0,80,0)');
    ctx.fillStyle = ghostGrad;
    ctx.beginPath();
    ctx.arc(0, bob, S, 0, Math.PI * 2);
    ctx.fill();

    // Robe — dark underlayer
    ctx.fillStyle = flash ? 'rgba(180,40,80,0.8)' : 'rgba(30,10,70,0.8)';
    ctx.beginPath();
    ctx.arc(0, bob + 3, S * 0.82, 0.15, Math.PI - 0.15);
    ctx.fill();

    // Deep hood
    ctx.fillStyle = flash ? '#cc2255' : '#1a0840';
    ctx.beginPath();
    ctx.arc(0, bob - S * 0.45, S * 0.55, Math.PI, Math.PI * 2);
    ctx.fill();
    // Hood rim
    ctx.fillStyle = flash ? '#aa1144' : '#2a1060';
    ctx.beginPath();
    ctx.arc(0, bob - S * 0.36, S * 0.55, Math.PI + 0.2, Math.PI * 2 - 0.2);
    ctx.fill();

    // Face shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(Math.cos(this.facing) * 3, bob - S * 0.42 + Math.sin(this.facing) * 3, S * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Glowing purple eyes
    const ex = Math.cos(this.facing) * S * 0.28;
    const ey = Math.sin(this.facing) * S * 0.28 + bob - S * 0.38;
    ctx.save();
    ctx.shadowColor = '#cc00ff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = flash ? '#ff88ff' : '#cc44ff';
    ctx.beginPath();
    ctx.arc(ex + Math.sin(this.facing) * 3.5, ey - Math.cos(this.facing) * 3.5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - Math.sin(this.facing) * 3.5, ey + Math.cos(this.facing) * 3.5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Pupil glint
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(ex + Math.sin(this.facing) * 3.5 + 1, ey - Math.cos(this.facing) * 3.5 - 1, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Spectral bow
    const bowAngle = this.facing + Math.PI / 2;
    const bowCX = Math.cos(this.facing) * (S + 4);
    const bowCY = Math.sin(this.facing) * (S + 4) + bob;
    ctx.save();
    ctx.translate(bowCX, bowCY);
    ctx.rotate(bowAngle);
    // Bow arc
    ctx.strokeStyle = flash ? '#ff88ff' : '#aa55ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#8800ff';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 14, -1.1, 1.1);
    ctx.stroke();
    // Bow string
    ctx.strokeStyle = flash ? '#ffccff' : 'rgba(180,120,255,0.6)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(Math.sin(-1.1) * 14, -Math.cos(1.1) * 14);
    ctx.lineTo(0, 3);
    ctx.lineTo(Math.sin(1.1) * 14, Math.cos(1.1) * 14);
    ctx.stroke();
    ctx.restore();

    // Ready-to-fire glow
    if (this.attackCooldown < 300) {
      const readyAlpha = (300 - this.attackCooldown) / 300 * 0.7;
      ctx.save();
      ctx.globalAlpha = readyAlpha;
      ctx.fillStyle = '#cc44ff';
      ctx.shadowColor = '#9900ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(bowCX + Math.cos(this.facing) * 4, bowCY + Math.sin(this.facing) * 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
}
