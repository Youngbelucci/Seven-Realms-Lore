import { generateMap, renderMap, isSolid } from './tilemap';
import type { TileGrid } from './tilemap';
import { Player } from './player';
import { Enemy, EnemyType } from './enemy';
import { Boss } from './boss';
import { rollLoot } from './loot';
import { renderHUD, renderInventory, getSkillSlotRects } from './hud';
import {
  FloatingNumber, Particle, DroppedItem, Projectile, LevelUpNotice, Input, GamePhase
} from './types';
import { dist, clamp, circlesOverlap, randRange } from './utils';
import { MAP_W, MAP_H, TILE_SIZE, WAVE_INTERVAL, MAX_ENEMIES_ON_MAP } from './constants';

const DUNGEON_X = Math.floor(40 / 2) * TILE_SIZE;
const DUNGEON_Y = (30 - 5) * TILE_SIZE;

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  grid: TileGrid;

  player: Player;
  enemies: Enemy[] = [];
  boss: Boss | null = null;
  bossSpawned: boolean = false;

  droppedItems: DroppedItem[] = [];
  floaters: FloatingNumber[] = [];
  particles: Particle[] = [];
  projectiles: Projectile[] = [];
  snow: { x: number; y: number; r: number; spd: number; sway: number; phase: number; alpha: number }[] = [];
  levelUpNotices: LevelUpNotice[] = [];

  input: Input;
  camX: number = 0;
  camY: number = 0;
  tick: number = 0;

  phase: GamePhase = 'playing';
  inventoryOpen: boolean = false;
  lastWaveTime: number = Date.now();
  gameStartTime: number = Date.now();

  gameOverAlpha: number = 0;
  victoryAlpha: number = 0;
  runStats = { kills: 0, level: 1, time: 0 };

  rafId: number = 0;
  lastTime: number = 0;

  // Touch controls
  touchEnabled: boolean = false;
  joystick = { active: false, id: -1, baseX: 0, baseY: 0, knobX: 0, knobY: 0 };
  attackTouchId: number = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.grid = generateMap();

    const spawnX = MAP_W / 2;
    const spawnY = MAP_H / 3;
    this.player = new Player(spawnX, spawnY);

    this.input = {
      keys: new Set(),
      justPressed: new Set(),
      mouse: { x: 0, y: 0 },
      mouseWorld: { x: spawnX, y: spawnY },
      mouseDown: false,
      mouseJustDown: false,
      moveVec: { x: 0, y: 0 },
      isTouch: false,
    };

    // Show touch controls on touch-capable devices
    this.touchEnabled =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0);

    this.spawnInitialEnemies();
    this.attachListeners();
  }

  spawnInitialEnemies(): void {
    // Spawn first wave
    const types: EnemyType[] = ['wolf', 'wolf', 'warrior', 'wolf', 'archer'];
    for (const type of types) {
      this.spawnEnemy(type);
    }
  }

  spawnEnemy(type: EnemyType, cx?: number, cy?: number): void {
    if (this.enemies.filter(e => !e.dead).length >= MAX_ENEMIES_ON_MAP) return;
    let x: number, y: number;
    if (cx !== undefined && cy !== undefined) {
      x = cx + randRange(-20, 20);
      y = cy + randRange(-20, 20);
    } else {
      // Spawn off-screen edges
      const edge = Math.floor(Math.random() * 4);
      const vpW = this.canvas.width, vpH = this.canvas.height;
      switch (edge) {
        case 0: x = this.camX + randRange(0, vpW); y = this.camY - 60; break;
        case 1: x = this.camX + randRange(0, vpW); y = this.camY + vpH + 60; break;
        case 2: x = this.camX - 60; y = this.camY + randRange(0, vpH); break;
        default: x = this.camX + vpW + 60; y = this.camY + randRange(0, vpH); break;
      }
    }
    x = clamp(x, 80, MAP_W - 80);
    y = clamp(y, 80, MAP_H - 80);
    if (!isSolid(this.grid, x, y)) {
      const enemy = new Enemy(x, y, type);
      this.enemies.push(enemy);
    }
  }

  spawnWave(): void {
    const now = Date.now();
    if (now - this.lastWaveTime < WAVE_INTERVAL) return;
    this.lastWaveTime = now;

    const waveSize = 4 + Math.floor(this.player.level / 2);
    const typePool: EnemyType[] = this.player.level >= 5
      ? ['wolf', 'warrior', 'warrior', 'archer', 'wolf', 'archer']
      : ['wolf', 'wolf', 'warrior', 'wolf'];

    for (let i = 0; i < waveSize; i++) {
      const t = typePool[Math.floor(Math.random() * typePool.length)];
      this.spawnEnemy(t);
    }
  }

  checkBossSpawn(): void {
    if (this.bossSpawned) return;
    if (this.player.kills >= 15 || this.player.level >= 4) {
      this.bossSpawned = true;
      this.boss = new Boss(DUNGEON_X, DUNGEON_Y);
      this.boss.spawnRequestCallback = (type, x, y) => this.spawnEnemy(type, x, y);
      this.floaters.push({
        x: this.canvas.width / 2,
        y: this.canvas.height / 3,
        value: 0,
        isCrit: false,
        damageType: 'darkness',
        alpha: 1,
        vy: -0.5,
        life: 180,
        maxLife: 180,
        text: '👑 ¡EL GUARDIÁN DEL HIELO DESPIERTA!',
      });
    }
  }

  attachListeners(): void {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      // Allow Tab to toggle inventory; prevent other browser defaults in-game
      if (e.code !== 'Tab') e.preventDefault();
      if (down) {
        // Only mark justPressed on the first keydown (not key-repeat)
        if (!this.input.keys.has(e.code)) {
          this.input.justPressed.add(e.code);
        }
        this.input.keys.add(e.code);
        if (e.code === 'Tab') {
          e.preventDefault();
          this.inventoryOpen = !this.inventoryOpen;
        }
      } else {
        this.input.keys.delete(e.code);
      }
    };

    window.addEventListener('keydown', e => onKey(e, true));
    window.addEventListener('keyup', e => onKey(e, false));

    this.canvas.addEventListener('mousemove', e => {
      const rect = this.canvas.getBoundingClientRect();
      this.input.mouse.x = e.clientX - rect.left;
      this.input.mouse.y = e.clientY - rect.top;
      // Real mouse movement switches back to pointer aiming (dynamic modality)
      this.input.isTouch = false;
    });

    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 0) {
        this.input.mouseDown = true;
        this.input.mouseJustDown = true;
        this.input.isTouch = false;
      }
    });

    this.canvas.addEventListener('mouseup', e => {
      if (e.button === 0) this.input.mouseDown = false;
    });

    // ---- Touch controls ----
    const rectOf = () => this.canvas.getBoundingClientRect();

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      this.touchEnabled = true;
      this.input.isTouch = true;
      const rect = rectOf();
      const vpW = this.canvas.width, vpH = this.canvas.height;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const x = t.clientX - rect.left;
        const y = t.clientY - rect.top;

        // On end screens, any tap restarts the run
        if (this.phase === 'gameover' || this.phase === 'victory') {
          this.restart();
          return;
        }

        // 1) Skill buttons
        const slotIdx = this.skillSlotAt(x, y, vpW, vpH);
        if (slotIdx >= 0) {
          const keyCode = ['KeyQ', 'KeyE', 'KeyR', 'KeyF'][slotIdx];
          if (keyCode) this.input.justPressed.add(keyCode);
          continue;
        }

        // 2) Attack button (bottom-right)
        if (this.attackTouchId === -1 && this.inAttackButton(x, y, vpW, vpH)) {
          this.attackTouchId = t.identifier;
          this.input.mouseDown = true;
          this.input.mouseJustDown = true;
          continue;
        }

        // 3) Otherwise, left side of screen starts the movement joystick
        if (!this.joystick.active && x < vpW * 0.55) {
          this.joystick.active = true;
          this.joystick.id = t.identifier;
          this.joystick.baseX = x;
          this.joystick.baseY = y;
          this.joystick.knobX = x;
          this.joystick.knobY = y;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = rectOf();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== this.joystick.id || !this.joystick.active) continue;
        const x = t.clientX - rect.left;
        const y = t.clientY - rect.top;
        const dx = x - this.joystick.baseX;
        const dy = y - this.joystick.baseY;
        const len = Math.hypot(dx, dy);
        const maxR = 55;
        const clamped = Math.min(len, maxR);
        const nx = len > 0 ? dx / len : 0;
        const ny = len > 0 ? dy / len : 0;
        this.joystick.knobX = this.joystick.baseX + nx * clamped;
        this.joystick.knobY = this.joystick.baseY + ny * clamped;
        // Deadzone
        if (len > 10) {
          this.input.moveVec = { x: nx, y: ny };
        } else {
          this.input.moveVec = { x: 0, y: 0 };
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystick.id) {
          this.joystick.active = false;
          this.joystick.id = -1;
          this.input.moveVec = { x: 0, y: 0 };
        }
        if (t.identifier === this.attackTouchId) {
          this.attackTouchId = -1;
          this.input.mouseDown = false;
        }
      }
    };

    this.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
  }

  // Returns skill slot index (0-3) at the given screen point, or -1
  skillSlotAt(x: number, y: number, vpW: number, vpH: number): number {
    const rects = getSkillSlotRects(vpW, vpH, this.player.skills.length);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      // Pad the hit area a little for finger-friendliness
      if (x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6) return i;
    }
    return -1;
  }

  attackButtonCenter(vpW: number, vpH: number): { x: number; y: number; r: number } {
    // Sit above the centered skill bar so it never overlaps on narrow phones
    return { x: vpW - 72, y: vpH - 172, r: 50 };
  }

  inAttackButton(x: number, y: number, vpW: number, vpH: number): boolean {
    const c = this.attackButtonCenter(vpW, vpH);
    return (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r;
  }

  update(dt: number): void {
    if (this.phase !== 'playing') return;
    const now = Date.now();
    this.tick++;

    // Clear edge-triggered set — consumed once per frame before any system reads it
    const justPressed = new Set(this.input.justPressed);
    this.input.justPressed.clear();

    // Update mouse world position
    this.input.mouseWorld = {
      x: this.input.mouse.x + this.camX,
      y: this.input.mouse.y + this.camY,
    };

    // Touch mode auto-aim: attacks/skills target the nearest living enemy
    if (this.input.isTouch) {
      const px = this.player.x, py = this.player.y;
      let best: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = (e.x - px) ** 2 + (e.y - py) ** 2;
        if (d < bestD) { bestD = d; best = e; }
      }
      if (this.boss && !this.boss.dead) {
        const d = (this.boss.x - px) ** 2 + (this.boss.y - py) ** 2;
        if (d < bestD) { bestD = d; best = this.boss; }
      }
      if (best) {
        this.input.mouseWorld = { x: best.x, y: best.y };
      } else {
        this.input.mouseWorld = {
          x: px + Math.cos(this.player.facing) * 100,
          y: py + Math.sin(this.player.facing) * 100,
        };
      }
    }

    // Basic attack on mouse click or spacebar
    const attacking = this.input.mouseJustDown || this.input.mouseDown || this.input.keys.has('Space');
    this.input.mouseJustDown = false;

    if (attacking) {
      this.player.doBasicAttack(this.floaters, this.particles, (ax, ay, range, angle, dmg, isCrit) => {
        this.hitEntitiesInArc(ax, ay, range, angle, 1.2, dmg, isCrit);
      });
    }

    // Player update — pass the snapshot of justPressed for this frame
    this.player.update(dt, this.input, this.grid, this.floaters, this.particles,
      this.boss ? this.boss.bossAttacks : [], justPressed);

    // Handle skill effects
    const sk = this.player.skills;
    const spinSk = sk.find(s => s.id === 'spinAttack');
    if (spinSk && this.player.spinFrames > 20) {
      this.hitEntitiesInArc(this.player.x, this.player.y, 80, 0, Math.PI * 2, this.player.totalDamage * 0.8, false);
    }
    const chargeSk = sk.find(s => s.id === 'warriorCharge');
    if (chargeSk && this.player.chargeActive) {
      this.hitEntitiesInArc(this.player.x, this.player.y, 50, this.player.attackAngle, 0.8, this.player.totalDamage * 1.2, false);
    }
    const heavySk = sk.find(s => s.id === 'heavyStrike');
    if (heavySk && this.player.attackFrames === 16) {
      this.hitEntitiesInArc(this.player.x, this.player.y, 100, this.player.attackAngle, 0.7, this.player.totalDamage * 2.0, Math.random() < this.player.totalCrit);
    }

    // Enemy updates
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.update(dt, this.player, this.grid, this.floaters, this.particles, this.projectiles);

      // Enemy-enemy separation
      for (const other of this.enemies) {
        if (other === enemy || other.dead) continue;
        if (circlesOverlap(enemy.x, enemy.y, enemy.size, other.x, other.y, other.size)) {
          const dx = enemy.x - other.x, dy = enemy.y - other.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const push = 1.5;
          enemy.x += (dx / len) * push;
          enemy.y += (dy / len) * push;
        }
      }
    }

    // Handle dead enemies
    const justDead = this.enemies.filter(e => e.dead && !('_processed' in e));
    for (const e of justDead) {
      (e as any)._processed = true;
      const loot = rollLoot(e.tier);
      if (loot) {
        this.droppedItems.push({ item: loot, x: e.x + randRange(-20, 20), y: e.y + randRange(-20, 20), glowPhase: 0 });
      }
      const leveled = this.player.gainXP(e.xpValue);
      if (leveled) {
        this.levelUpNotices.push({ level: this.player.level, alpha: 1, life: 180, maxLife: 180 });
      }
      this.player.kills++;
    }
    this.enemies = this.enemies.filter(e => !e.dead || !(e as any)._processed || this.droppedItems.length > 0);
    this.enemies = this.enemies.filter(e => e.dead ? (e as any)._processed === undefined : true)
      .concat(this.enemies.filter(e => e.dead && (e as any)._processed === undefined));
    // Simpler: just remove fully dead processed enemies after a tick
    this.enemies = this.enemies.filter(e => !e.dead);

    // Boss update
    if (this.boss && !this.boss.dead) {
      this.boss.update(dt, this.player, this.floaters, this.particles, this.projectiles);

      // Player attacks hit boss
    } else if (this.boss?.dead && !this.boss.defeated) {
      // noop - handled in boss
    }

    // Check victory
    if (this.boss?.dead) {
      this.phase = 'victory';
    }

    // Projectile update
    for (const proj of this.projectiles) {
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.life -= dt;

      if (proj.fromEnemy && !this.player.dead) {
        if (circlesOverlap(proj.x, proj.y, proj.size, this.player.x, this.player.y, this.player.size)) {
          if (this.player.invincibleFrames <= 0) {
            this.player.takeDamage(proj.damage, proj.damageType, false, this.floaters, this.particles);
            this.player.invincibleFrames = 30;
          }
          proj.life = 0;
        }
      } else if (!proj.fromEnemy) {
        // Player projectiles (not currently used)
      }

      // Particles trail
      if (Math.random() < 0.4) {
        this.particles.push({
          x: proj.x, y: proj.y,
          vx: randRange(-0.5, 0.5), vy: randRange(-0.5, 0.5),
          life: 8, maxLife: 8,
          color: proj.color, size: proj.size * 0.5,
        });
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);

    // Loot pickup
    for (let i = this.droppedItems.length - 1; i >= 0; i--) {
      const di = this.droppedItems[i];
      di.glowPhase += 0.08;
      const d = dist({ x: di.x, y: di.y }, { x: this.player.x, y: this.player.y });
      if (d < 35) {
        // Auto-equip if better
        const existing = di.item.slot === 'weapon' ? this.player.equippedWeapon : this.player.equippedArmor;
        const newScore = (di.item.damage ?? 0) + (di.item.defense ?? 0) + (di.item.critChance ?? 0) * 50;
        const oldScore = existing ? ((existing.damage ?? 0) + (existing.defense ?? 0) + (existing.critChance ?? 0) * 50) : 0;
        if (!existing || newScore > oldScore) {
          this.player.equipItem(di.item);
          this.floaters.push({
            x: this.player.x, y: this.player.y - 40,
            value: 0, isCrit: false, damageType: 'physical',
            alpha: 1, vy: -1, life: 120, maxLife: 120,
            text: `✨ ${di.item.name}`,
          });
        }
        this.droppedItems.splice(i, 1);
      }
    }

    // Floater update
    for (const f of this.floaters) {
      f.y += f.vy;
      f.life--;
      f.alpha = Math.min(1, f.life / (f.maxLife * 0.4));
    }
    this.floaters = this.floaters.filter(f => f.life > 0);

    // Particle update
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.life--;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // Level up notice update
    for (const n of this.levelUpNotices) {
      n.life--;
      n.alpha = n.life / n.maxLife;
    }
    this.levelUpNotices = this.levelUpNotices.filter(n => n.life > 0);

    // Wave & boss spawn
    this.spawnWave();
    this.checkBossSpawn();

    // Player death
    if (this.player.dead) {
      this.runStats = { kills: this.player.kills, level: this.player.level, time: this.player.getElapsedSeconds() };
      this.phase = 'gameover';
    }
  }

  hitEntitiesInArc(ax: number, ay: number, range: number, angle: number, arcWidth: number, damage: number, isCrit: boolean): void {
    const targets = [
      ...this.enemies.filter(e => !e.dead),
      ...(this.boss && !this.boss.dead ? [this.boss] : []),
    ];

    for (const target of targets) {
      const d = dist({ x: ax, y: ay }, { x: target.x, y: target.y });
      if (d > range + target.size) continue;

      if (arcWidth >= Math.PI * 2) {
        // Full circle (spin)
        target.takeDamage(damage, 'physical', isCrit, this.floaters, this.particles);
        if (target instanceof Enemy && target.dead) {
          // will be processed next frame
        }
      } else {
        // Directional arc
        const toTarget = Math.atan2(target.y - ay, target.x - ax);
        let diff = toTarget - angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= arcWidth) {
          target.takeDamage(damage, 'physical', isCrit, this.floaters, this.particles);
          if (target instanceof Enemy && target.stunFrames !== undefined) {
            target.stunFrames = 15;
          }
        }
      }
    }
  }

  updateCamera(): void {
    const vpW = this.canvas.width;
    const vpH = this.canvas.height;
    const targetX = this.player.x - vpW / 2;
    const targetY = this.player.y - vpH / 2;
    this.camX += (targetX - this.camX) * 0.12;
    this.camY += (targetY - this.camY) * 0.12;
    this.camX = clamp(this.camX, 0, MAP_W - vpW);
    this.camY = clamp(this.camY, 0, MAP_H - vpH);
  }

  draw(): void {
    const { ctx, canvas } = this;
    const vpW = canvas.width;
    const vpH = canvas.height;

    // Clear — dark, near-black background matching the moody map palette
    ctx.fillStyle = '#0d1018';
    ctx.fillRect(0, 0, vpW, vpH);

    if (this.phase === 'playing' || this.phase === 'victory') {
      // Map
      renderMap(ctx, this.grid, this.camX, this.camY, vpW, vpH, this.tick);

      // Dropped items
      for (const di of this.droppedItems) {
        this.drawDroppedItem(di);
      }

      // Drifting ground mist for depth, then a warm hero light over the floor
      this.drawGroundMist(vpW, vpH);
      this.drawHeroLight(this.player.x - this.camX, this.player.y - this.camY);

      // Entities (sorted by Y for depth)
      const entities = [
        ...this.enemies.filter(e => !e.dead),
        ...(this.boss && !this.boss.dead ? [this.boss] : []),
        this.player,
      ].sort((a, b) => a.y - b.y);

      for (const entity of entities) {
        if (entity === this.boss && this.boss && !this.boss.dead) {
          this.boss.drawAtScreen(ctx, this.boss.x - this.camX, this.boss.y - this.camY);
        } else {
          entity.draw(ctx, this.camX, this.camY);
        }
      }

      // Projectiles
      for (const proj of this.projectiles) {
        const px = proj.x - this.camX;
        const py = proj.y - this.camY;
        ctx.save();
        ctx.fillStyle = proj.color;
        ctx.shadowColor = proj.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, proj.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Floaters & particles (in screen space but floaters have world coords)
      for (const f of this.floaters) {
        const sx = f.x - this.camX;
        const sy = f.y - this.camY;
        const fCopy = { ...f, x: sx, y: sy };
        this.drawFloater(fCopy);
      }
      for (const p of this.particles) {
        const sx = p.x - this.camX;
        const sy = p.y - this.camY;
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.5, p.size * (p.life / p.maxLife)), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Vignette — radial dark overlay at screen edges for atmosphere
      this.drawVignette(vpW, vpH);

      // Falling snow on top of the world for a blizzard atmosphere
      this.drawSnow(vpW, vpH);

      // Dungeon marker (if boss not yet spawned)
      if (!this.bossSpawned) {
        this.drawDungeonHint();
      }

      // HUD
      if (!this.inventoryOpen) {
        renderHUD(ctx, vpW, vpH, this.player, this.boss, [], [], this.levelUpNotices, false);
      } else {
        renderInventory(ctx, vpW, vpH, this.player, this.droppedItems);
      }

      // Touch controls overlay (joystick + attack button)
      if (this.touchEnabled && !this.inventoryOpen) {
        this.drawTouchControls(vpW, vpH);
      }

      if (this.phase === 'victory') {
        this.drawVictory(vpW, vpH);
      }
    } else if (this.phase === 'gameover') {
      this.drawGameOver(vpW, vpH);
    }
  }

  drawFloater(f: FloatingNumber & { x: number; y: number }): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = f.alpha;

    if (f.text) {
      ctx.fillStyle = '#ffdd44';
      ctx.font = 'bold 14px "Georgia", serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur = 6;
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
    } else {
      const color = { physical: '#ffffff', fire: '#ff6a00', ice: '#00cfff', poison: '#7fff00', darkness: '#c070ff' }[f.damageType] ?? '#fff';
      ctx.fillStyle = f.isCrit ? '#ffdd00' : color;
      ctx.font = f.isCrit ? `bold ${20}px "Georgia", serif` : 'bold 14px "Georgia", serif';
      ctx.textAlign = 'center';
      if (f.isCrit) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
      ctx.fillText(f.isCrit ? `⚡${f.value}` : String(f.value), f.x, f.y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  drawDroppedItem(di: DroppedItem): void {
    const { ctx } = this;
    const sx = di.x - this.camX;
    const sy = di.y - this.camY;
    const glow = Math.sin(di.glowPhase) * 0.3 + 0.7;
    const rarColors: Record<string, string> = { common: '#aaaaaa', magic: '#6fa8ff', rare: '#ffd700', legendary: '#ff8c00' };
    const c = rarColors[di.item.rarity] ?? '#ffffff';

    ctx.save();
    ctx.shadowColor = c;
    ctx.shadowBlur = 12 * glow;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(sx, sy, 6 + glow * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Item name tooltip if nearby
    const d = dist({ x: di.x, y: di.y }, { x: this.player.x, y: this.player.y });
    if (d < 80) {
      ctx.fillStyle = c;
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(di.item.name, sx, sy - 12);
    }
    ctx.restore();
  }

  drawHeroLight(px: number, py: number): void {
    const { ctx } = this;
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

  drawGroundMist(vpW: number, vpH: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const span = vpW + 500;
      const mx = ((this.tick * (0.25 + i * 0.05) + i * 640) % span) - 250;
      const my = vpH * (0.32 + 0.2 * i) + Math.sin(this.tick * 0.01 + i * 2) * 22;
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

  private ensureSnow(vpW: number, vpH: number): void {
    if (this.snow.length > 0) return;
    const layers = [
      { count: 45, r: 2.2, spd: 1.5, sway: 0.7, alpha: 0.9 },
      { count: 55, r: 1.4, spd: 1.0, sway: 0.5, alpha: 0.6 },
      { count: 60, r: 0.9, spd: 0.6, sway: 0.35, alpha: 0.35 },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.count; i++) {
        this.snow.push({
          x: Math.random() * vpW,
          y: Math.random() * vpH,
          r: L.r * (0.7 + Math.random() * 0.6),
          spd: L.spd * (0.8 + Math.random() * 0.5),
          sway: L.sway,
          phase: Math.random() * 1000,
          alpha: L.alpha,
        });
      }
    }
  }

  drawSnow(vpW: number, vpH: number): void {
    const { ctx } = this;
    this.ensureSnow(vpW, vpH);
    ctx.save();
    ctx.fillStyle = '#e2edf7';
    for (const f of this.snow) {
      f.y += f.spd;
      f.x += Math.sin((this.tick + f.phase) * 0.02) * f.sway;
      if (f.y > vpH + 6) { f.y = -6; f.x = Math.random() * vpW; }
      if (f.x > vpW + 6) f.x = -6;
      else if (f.x < -6) f.x = vpW + 6;
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawVignette(vpW: number, vpH: number): void {
    const { ctx } = this;
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
    const coldAlpha = Math.sin(this.tick * 0.008) * 0.025 + 0.045;
    coldGrad.addColorStop(0, 'rgba(0,0,0,0)');
    coldGrad.addColorStop(1, `rgba(40,80,130,${coldAlpha})`);
    ctx.fillStyle = coldGrad;
    ctx.fillRect(0, 0, vpW, vpH);
  }

  drawTouchControls(vpW: number, vpH: number): void {
    const { ctx } = this;

    // ---- Movement joystick (only while active) ----
    if (this.joystick.active) {
      const bx = this.joystick.baseX, by = this.joystick.baseY;
      ctx.save();
      // Base ring
      ctx.beginPath();
      ctx.arc(bx, by, 55, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,30,50,0.35)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(120,160,220,0.5)';
      ctx.stroke();
      // Knob
      ctx.beginPath();
      ctx.arc(this.joystick.knobX, this.joystick.knobY, 26, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(140,180,240,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,220,255,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // ---- Attack button (bottom-right) ----
    const c = this.attackButtonCenter(vpW, vpH);
    ctx.save();
    const held = this.attackTouchId !== -1;
    const grad = ctx.createRadialGradient(c.x, c.y - 10, 6, c.x, c.y, c.r);
    grad.addColorStop(0, held ? '#ff8866' : '#cc3322');
    grad.addColorStop(1, held ? '#992211' : '#661410');
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = held ? 'rgba(255,200,150,0.9)' : 'rgba(255,120,90,0.7)';
    ctx.stroke();
    // Sword glyph
    ctx.fillStyle = '#ffe0c0';
    ctx.font = '30px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚔', c.x, c.y);
    ctx.restore();
  }

  drawDungeonHint(): void {
    const { ctx } = this;
    const sx = DUNGEON_X - this.camX;
    const sy = DUNGEON_Y - this.camY;
    const pulse = Math.sin(this.tick * 0.05) * 0.3 + 0.7;

    ctx.save();
    ctx.globalAlpha = pulse * 0.7;
    ctx.fillStyle = '#cc44ff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ Mata 15 enemigos para despertar al Guardián', sx, sy - 55);
    ctx.fillText(`Kills: ${this.player.kills}/15`, sx, sy - 38);
    ctx.restore();
  }

  drawGameOver(vpW: number, vpH: number): void {
    const { ctx } = this;
    this.gameOverAlpha = Math.min(1, this.gameOverAlpha + 0.01);

    ctx.fillStyle = `rgba(5,0,10,${this.gameOverAlpha * 0.92})`;
    ctx.fillRect(0, 0, vpW, vpH);

    if (this.gameOverAlpha < 0.5) return;
    const a = (this.gameOverAlpha - 0.5) / 0.5;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';

    ctx.font = 'bold 56px "Georgia", serif';
    ctx.fillStyle = '#cc2222';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 30;
    ctx.fillText('HAS CAÍDO', vpW / 2, vpH / 2 - 80);
    ctx.shadowBlur = 0;

    ctx.font = '22px "Georgia", serif';
    ctx.fillStyle = '#aa8888';
    ctx.fillText('El mundo de los Siete Reinos llora tu pérdida', vpW / 2, vpH / 2 - 30);

    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ccaaaa';
    ctx.fillText(`Nivel alcanzado: ${this.runStats.level}   ·   Muertes causadas: ${this.runStats.kills}   ·   Tiempo: ${this.runStats.time}s`, vpW / 2, vpH / 2 + 20);

    // Restart button
    const bW = 200, bH = 48;
    const bX = vpW / 2 - bW / 2, bY = vpH / 2 + 60;
    ctx.fillStyle = '#3a0a0a';
    ctx.strokeStyle = '#cc2222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bX, bY, bW, bH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Georgia", serif';
    ctx.fillText('⚔ REINTENTAR', vpW / 2, bY + bH / 2 + 6);

    ctx.restore();
  }

  drawVictory(vpW: number, vpH: number): void {
    const { ctx } = this;
    this.victoryAlpha = Math.min(1, this.victoryAlpha + 0.008);

    ctx.save();
    ctx.globalAlpha = this.victoryAlpha * 0.7;
    ctx.fillStyle = '#020008';
    ctx.fillRect(0, 0, vpW, vpH);

    if (this.victoryAlpha < 0.3) { ctx.restore(); return; }
    ctx.globalAlpha = (this.victoryAlpha - 0.3) / 0.7;
    ctx.textAlign = 'center';

    ctx.font = 'bold 52px "Georgia", serif';
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ff8c00';
    ctx.shadowBlur = 30;
    ctx.fillText('¡VICTORIA!', vpW / 2, vpH / 2 - 70);
    ctx.shadowBlur = 0;

    ctx.font = '22px "Georgia", serif';
    ctx.fillStyle = '#ddcc88';
    ctx.fillText('¡El Guardián del Hielo ha sido derrotado!', vpW / 2, vpH / 2 - 25);

    ctx.font = '16px "Georgia", serif';
    ctx.fillStyle = '#bbaa77';
    ctx.fillText('Los Siete Reinos están a salvo... por ahora.', vpW / 2, vpH / 2 + 15);

    const bW = 220, bH = 48;
    const bX = vpW / 2 - bW / 2, bY = vpH / 2 + 60;
    ctx.fillStyle = '#2a2000';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bX, bY, bW, bH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px "Georgia", serif';
    ctx.fillText('⚔ JUGAR DE NUEVO', vpW / 2, bY + bH / 2 + 6);

    ctx.restore();
  }

  handleClick(screenX: number, screenY: number): void {
    const vpW = this.canvas.width;
    const vpH = this.canvas.height;

    if (this.phase === 'gameover') {
      // Restart button
      const bW = 200, bH = 48;
      const bX = vpW / 2 - bW / 2, bY = vpH / 2 + 60;
      if (screenX >= bX && screenX <= bX + bW && screenY >= bY && screenY <= bY + bH) {
        this.restart();
      }
    } else if (this.phase === 'victory') {
      const bW = 220, bH = 48;
      const bX = vpW / 2 - bW / 2, bY = vpH / 2 + 60;
      if (screenX >= bX && screenX <= bX + bW && screenY >= bY && screenY <= bY + bH) {
        this.restart();
      }
    }
  }

  restart(): void {
    const spawnX = MAP_W / 2;
    const spawnY = MAP_H / 3;
    this.player = new Player(spawnX, spawnY);
    this.enemies = [];
    this.boss = null;
    this.bossSpawned = false;
    this.droppedItems = [];
    this.floaters = [];
    this.particles = [];
    this.projectiles = [];
    this.levelUpNotices = [];
    this.tick = 0;
    this.phase = 'playing';
    this.inventoryOpen = false;
    this.gameOverAlpha = 0;
    this.victoryAlpha = 0;
    this.lastWaveTime = Date.now();
    this.grid = generateMap();
    this.spawnInitialEnemies();
    this.input.keys.clear();
    this.input.moveVec = { x: 0, y: 0 };
    this.input.mouseDown = false;
    this.joystick.active = false;
    this.joystick.id = -1;
    this.attackTouchId = -1;
  }

  start(): void {
    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - this.lastTime) / 1000);
      this.lastTime = time;

      this.updateCamera();
      this.update(dt);
      this.draw();

      this.rafId = requestAnimationFrame(loop);
    };
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', () => {});
    window.removeEventListener('keyup', () => {});
  }
}
