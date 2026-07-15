import { Entity } from './entity';
import { FloatingNumber, Particle, BossAttack, Projectile } from './types';
import { BOSS_HP, BOSS_PHASE2_HP, BOSS_PHASE3_HP, BOSS_SIZE } from './constants';
import { dist, angleBetween, vecFromAngle, randRange, circlesOverlap } from './utils';
import type { Player } from './player';
import type { Enemy, EnemyType } from './enemy';

type BossPhase = 1 | 2 | 3;

export class Boss extends Entity {
  phase: BossPhase = 1;
  attackTimer: number = 0;
  phaseAttackIndex: number = 0;
  bossAttacks: BossAttack[] = [];
  rotatAngle: number = 0;
  introFrames: number = 90;
  defeated: boolean = false;
  spawnRequestCallback: ((type: EnemyType, x: number, y: number) => void) | null = null;

  constructor(x: number, y: number) {
    super(x, y, BOSS_SIZE, {
      hp: BOSS_HP,
      maxHp: BOSS_HP,
      energy: 0,
      maxEnergy: 0,
      damage: 30,
      defense: 15,
      speed: 65,
      critChance: 0.07,
      critMultiplier: 2.0,
    });
  }

  getPhase(): BossPhase {
    if (this.stats.hp > BOSS_PHASE2_HP) return 1;
    if (this.stats.hp > BOSS_PHASE3_HP) return 2;
    return 3;
  }

  update(dt: number, player: Player, floaters: FloatingNumber[], particles: Particle[], projectiles: Projectile[]): void {
    if (this.dead || this.defeated) return;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.introFrames > 0) { this.introFrames--; return; }

    this.phase = this.getPhase();
    this.rotatAngle += dt * (this.phase === 3 ? 2.5 : this.phase === 2 ? 1.5 : 1.0);
    this.attackTimer -= dt * 1000;

    // Move toward player
    const d = dist({ x: this.x, y: this.y }, { x: player.x, y: player.y });
    if (d > 80) {
      const angle = angleBetween({ x: this.x, y: this.y }, { x: player.x, y: player.y });
      this.facing = angle;
      const v = vecFromAngle(angle, this.stats.speed * dt);
      this.x += v.x;
      this.y += v.y;
    }

    // Update existing boss attacks
    for (const atk of this.bossAttacks) {
      atk.life--;
      atk.alpha = atk.life / atk.maxLife;
    }
    this.bossAttacks = this.bossAttacks.filter(a => a.life > 0);

    const attackInterval = this.phase === 3 ? 1800 : this.phase === 2 ? 2400 : 3000;

    if (this.attackTimer <= 0) {
      this.attackTimer = attackInterval;
      this.executeAttack(player, projectiles, particles);
    }

    // Melee damage
    if (d < BOSS_SIZE + 25 && this.attackTimer > attackInterval - 200) {
      const isCrit = Math.random() < this.stats.critChance;
      if (!player.shieldActive || Math.random() > 0.3) {
        player.takeDamage(this.stats.damage, 'ice', isCrit, floaters, particles);
        player.invincibleFrames = 40;
      }
    }

    // Orbit particles
    for (let i = 0; i < 2; i++) {
      const a = this.rotatAngle + (i / 2) * Math.PI * 2;
      particles.push({
        x: this.x + Math.cos(a) * (BOSS_SIZE + 8),
        y: this.y + Math.sin(a) * (BOSS_SIZE + 8),
        vx: randRange(-0.5, 0.5),
        vy: randRange(-1, 0),
        life: 20,
        maxLife: 20,
        color: this.phase === 3 ? '#cc22ff' : this.phase === 2 ? '#4488ff' : '#88ccff',
        size: 4,
      });
    }

    if (this.stats.hp <= 0) this.onBossDeath(particles);
  }

  private executeAttack(player: Player, projectiles: Projectile[], particles: Particle[]): void {
    switch (this.phase) {
      case 1:
        this.attackSlam(player, particles);
        break;
      case 2:
        if (this.phaseAttackIndex % 2 === 0) this.attackSlam(player, particles);
        else this.attackSummonWolves();
        this.phaseAttackIndex++;
        break;
      case 3:
        if (this.phaseAttackIndex % 3 === 0) this.attackIceStorm(projectiles);
        else if (this.phaseAttackIndex % 3 === 1) this.attackSlam(player, particles);
        else this.attackSummonWolves();
        this.phaseAttackIndex++;
        break;
    }
  }

  private attackSlam(player: Player, particles: Particle[]): void {
    const angle = angleBetween({ x: this.x, y: this.y }, { x: player.x, y: player.y });
    // Predict player position slightly
    const targetX = player.x + Math.cos(player.facing) * 30;
    const targetY = player.y + Math.sin(player.facing) * 30;

    this.bossAttacks.push({
      type: 'slam',
      x: targetX,
      y: targetY,
      radius: 70,
      alpha: 1,
      life: 45,
      maxLife: 45,
      damage: this.stats.damage * 1.5,
    });

    // Warning particles
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      particles.push({
        x: targetX + Math.cos(a) * 60,
        y: targetY + Math.sin(a) * 60,
        vx: -Math.cos(a) * 1.5,
        vy: -Math.sin(a) * 1.5,
        life: 40,
        maxLife: 40,
        color: '#88ccff',
        size: 5,
      });
    }
    void angle;
  }

  private attackSummonWolves(): void {
    if (!this.spawnRequestCallback) return;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 80 + Math.random() * 40;
      this.spawnRequestCallback('wolf', this.x + Math.cos(a) * r, this.y + Math.sin(a) * r);
    }
  }

  private attackIceStorm(projectiles: Projectile[]): void {
    const count = this.phase === 3 ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 200;
      projectiles.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: 18,
        damageType: 'ice',
        fromEnemy: true,
        life: 2.5,
        maxLife: 2.5,
        color: '#88ddff',
        size: 8,
      });
    }
    this.bossAttacks.push({
      type: 'iceStorm',
      x: this.x,
      y: this.y,
      radius: 0,
      alpha: 1,
      life: 30,
      maxLife: 30,
      damage: 0, // handled via projectiles
    });
  }

  private onBossDeath(particles: Particle[]): void {
    this.dead = true;
    this.defeated = true;
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: this.x + randRange(-20, 20),
        y: this.y + randRange(-20, 20),
        vx: randRange(-8, 8),
        vy: randRange(-10, 3),
        life: randRange(30, 60),
        maxLife: 60,
        color: i % 2 === 0 ? '#88ccff' : '#cc44ff',
        size: randRange(5, 15),
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    this.drawAtScreen(ctx, this.x - camX, this.y - camY);
  }

  drawAtScreen(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
    if (this.dead) return;
    const camX = this.x - sx;
    const camY = this.y - sy;

    // Draw boss attack indicators FIRST (behind boss)
    for (const atk of this.bossAttacks) {
      const ax = atk.x - camX;
      const ay = atk.y - camY;
      if (atk.type === 'slam') {
        ctx.beginPath();
        ctx.arc(ax, ay, atk.radius, 0, Math.PI * 2);
        const isWarn = atk.life > atk.maxLife / 2;
        ctx.strokeStyle = `rgba(${isWarn ? '136,204,255' : '255,80,80'},${atk.alpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = `rgba(${isWarn ? '136,204,255' : '255,80,80'},${atk.alpha * 0.12})`;
        ctx.fill();
      } else if (atk.type === 'iceStorm') {
        const growRadius = (1 - atk.life / atk.maxLife) * 200;
        ctx.beginPath();
        ctx.arc(ax, ay, Math.max(1, growRadius), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(136,220,255,${atk.alpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (this.introFrames > 0) {
      const yOff = (this.introFrames / 90) * 60;
      const a = 1 - this.introFrames / 90;
      ctx.save();
      ctx.globalAlpha = a;
      this.drawBossSprite(ctx, sx, sy - yOff);
      ctx.restore();
      return;
    }

    this.drawBossSprite(ctx, sx, sy);
  }

  private drawBossSprite(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
    if (this.dead) return;
    const flash = this.hitFlash > 0;
    const S = BOSS_SIZE;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + S - 2, S * 1.1, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    ctx.save();
    ctx.translate(sx, sy);

    // Rotating aura
    const phaseColor = this.phase === 3 ? '#cc22ff' : this.phase === 2 ? '#4488ff' : '#88ccff';
    const auraAlpha = 0.2 + Math.sin(this.rotatAngle * 2) * 0.08;
    ctx.beginPath();
    ctx.arc(0, 0, S + 20, 0, Math.PI * 2);
    ctx.fillStyle = phaseColor + Math.floor(auraAlpha * 255).toString(16).padStart(2, '0');
    ctx.fill();

    // Rotating ice shards
    for (let i = 0; i < 6; i++) {
      const a = this.rotatAngle + (i / 6) * Math.PI * 2;
      const rx = Math.cos(a) * (S + 14);
      const ry = Math.sin(a) * (S + 14);
      ctx.fillStyle = flash ? '#ffffff' : phaseColor;
      ctx.beginPath();
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(a + Math.PI / 4);
      ctx.fillRect(-4, -8, 8, 16);
      ctx.restore();
    }

    // Main body - armor plated giant
    ctx.fillStyle = flash ? '#ffffff' : '#304060';
    ctx.beginPath();
    ctx.arc(0, 0, S, 0, Math.PI * 2);
    ctx.fill();

    // Chest plate
    ctx.fillStyle = flash ? '#ddddff' : (this.phase === 3 ? '#6020a0' : this.phase === 2 ? '#204080' : '#206080');
    ctx.beginPath();
    ctx.arc(0, -4, S * 0.75, Math.PI, 0);
    ctx.fill();

    // Helmet
    ctx.fillStyle = flash ? '#ccccff' : '#182838';
    ctx.beginPath();
    ctx.arc(0, -S * 0.6, S * 0.55, Math.PI, 0);
    ctx.fill();

    // Glowing eyes (phase-colored)
    const eyeGlow = 0.7 + Math.sin(this.rotatAngle * 3) * 0.3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = phaseColor;
    ctx.fillStyle = flash ? '#ffffff' : phaseColor;
    ctx.beginPath();
    ctx.arc(-7, -S * 0.55, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7, -S * 0.55, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    void eyeGlow;

    // Great sword
    ctx.save();
    ctx.rotate(this.rotatAngle * 0.3 + this.facing);
    ctx.fillStyle = flash ? '#ffffff' : '#8899bb';
    ctx.fillRect(-4, -(S + 28), 8, S + 28);
    ctx.fillStyle = '#ddcc88';
    ctx.fillRect(-10, -10, 20, 8); // guard
    ctx.fillStyle = '#ccddff';
    ctx.fillRect(-3, -(S + 38), 6, 12); // tip
    ctx.restore();

    // Phase indicator crown
    if (this.phase >= 2) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.fillStyle = this.phase === 3 ? '#ff44ff' : '#4499ff';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (S - 4), Math.sin(a) * (S - 4) - 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
