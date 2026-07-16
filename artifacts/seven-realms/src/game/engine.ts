// GameEngine — the orchestrator. Owns the canvas, input, the shared game state
// and the main loop, and delegates the actual work to focused systems:
//   camera / lighting / weather / particles / combat / game (rules) / ui.
import { generateMap, renderMap } from './world';
import type { TileGrid } from './world';
import { Player } from './player';
import { Enemy } from './enemy';
import { Boss } from './boss';
import {
  renderHUD, renderInventory, getSkillSlotRects,
  renderDungeonHint, renderGameOver, renderVictory,
} from './ui';
import {
  FloatingNumber, Particle, DroppedItem, Projectile, LevelUpNotice, Input, GamePhase, BloodDecal,
} from './types';
import { dist, circlesOverlap } from './utils';
import { MAP_W, MAP_H } from './constants';
import { updateCamera } from './camera';
import { Lighting } from './lighting';
import { Weather } from './weather';
import {
  updateParticles, updateFloaters, updateDecals, drawParticles, drawFloaters, drawDecals,
} from './particles';
import { hitEntitiesInArc, updateProjectiles } from './combat';
import {
  spawnInitialEnemies, spawnWave, checkBossSpawn, processDeadEnemies, persistRun,
  DUNGEON_X, DUNGEON_Y,
} from './game';
import { audio } from './audio';
import { assets } from './assets';
import { loadRun, hasRun, clearRun, recordResult, loadBest } from './save';
import type { RunSnapshot, BestRecord } from './save';

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
  decals: BloodDecal[] = [];
  levelUpNotices: LevelUpNotice[] = [];

  // Rendering / atmosphere systems
  lighting = new Lighting();
  weather = new Weather();

  input: Input;
  camX: number = 0;
  camY: number = 0;
  tick: number = 0;

  phase: GamePhase = 'playing';
  inventoryOpen: boolean = false;
  lastWaveTime: number = Date.now();

  gameOverAlpha: number = 0;
  victoryAlpha: number = 0;
  runStats = { kills: 0, level: 1, time: 0 };
  bestRecord: BestRecord;

  rafId: number = 0;
  lastTime: number = 0;
  private musicStarted = false;
  private prevAttackFrames = 0;
  // Removers for every attached DOM listener, so stop() can fully tear down and
  // recreating/remounting the engine never stacks duplicate handlers.
  private cleanupFns: Array<() => void> = [];

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

    this.bestRecord = loadBest();
    // Resume a saved character (progression only) if one exists.
    const saved = hasRun() ? loadRun() : null;
    if (saved) this.applyRun(saved);

    // Show touch controls on touch-capable devices
    this.touchEnabled =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0);

    // Kick off sprite loading up front so art pops in before combat starts
    assets.preload([
      'characters/knight',
      'enemies/wolf', 'enemies/warrior', 'enemies/archer',
      'bosses/guardian',
    ]);

    spawnInitialEnemies(this);
    this.lighting.init(this.grid);
    this.attachListeners();
  }

  // Restore progression from a saved run. Equipment is assigned directly rather
  // than via equipItem() because item bonuses are derived (totalDamage etc.),
  // so re-equipping would not double-count — direct assignment avoids any
  // heal/side-effects and keeps the restore faithful to what was saved.
  private applyRun(s: RunSnapshot): void {
    const p = this.player;
    p.level = s.level;
    p.xp = s.xp;
    p.xpToNext = s.xpToNext;
    p.kills = s.kills;
    Object.assign(p.stats, s.stats);
    p.equippedWeapon = s.equippedWeapon;
    p.equippedArmor = s.equippedArmor;
  }

  // Lazily start audio on the first user gesture (browsers block it earlier).
  private ensureAudio(): void {
    audio.unlock();
    if (!this.musicStarted) {
      this.musicStarted = true;
      audio.startMusic();
    }
  }

  attachListeners(): void {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      // Allow Tab to toggle inventory; prevent other browser defaults in-game
      if (e.code !== 'Tab') e.preventDefault();
      if (down) {
        this.ensureAudio();
        // Only mark justPressed on the first keydown (not key-repeat)
        if (!this.input.keys.has(e.code)) {
          this.input.justPressed.add(e.code);
        }
        this.input.keys.add(e.code);
        if (e.code === 'Tab') {
          e.preventDefault();
          this.inventoryOpen = !this.inventoryOpen;
        }
        if (e.code === 'KeyM') audio.toggleMute();
      } else {
        this.input.keys.delete(e.code);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.cleanupFns.push(() => window.removeEventListener('keydown', onKeyDown));
    this.cleanupFns.push(() => window.removeEventListener('keyup', onKeyUp));

    const onMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.input.mouse.x = e.clientX - rect.left;
      this.input.mouse.y = e.clientY - rect.top;
      // Real mouse movement switches back to pointer aiming (dynamic modality)
      this.input.isTouch = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        this.ensureAudio();
        this.input.mouseDown = true;
        this.input.mouseJustDown = true;
        this.input.isTouch = false;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.input.mouseDown = false;
    };

    this.canvas.addEventListener('mousemove', onMouseMove);
    this.canvas.addEventListener('mousedown', onMouseDown);
    this.canvas.addEventListener('mouseup', onMouseUp);
    this.cleanupFns.push(() => this.canvas.removeEventListener('mousemove', onMouseMove));
    this.cleanupFns.push(() => this.canvas.removeEventListener('mousedown', onMouseDown));
    this.cleanupFns.push(() => this.canvas.removeEventListener('mouseup', onMouseUp));

    // ---- Touch controls ----
    const rectOf = () => this.canvas.getBoundingClientRect();

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      this.ensureAudio();
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
    this.cleanupFns.push(() => this.canvas.removeEventListener('touchstart', onTouchStart));
    this.cleanupFns.push(() => this.canvas.removeEventListener('touchmove', onTouchMove));
    this.cleanupFns.push(() => this.canvas.removeEventListener('touchend', onTouchEnd));
    this.cleanupFns.push(() => this.canvas.removeEventListener('touchcancel', onTouchEnd));
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
        hitEntitiesInArc(this, ax, ay, range, angle, 1.2, dmg, isCrit);
      });
      // A fresh swing starts when attackFrames rises from rest — cue the whoosh
      if (this.player.attackFrames > this.prevAttackFrames && this.prevAttackFrames === 0) {
        audio.play('swing');
      }
    }
    this.prevAttackFrames = this.player.attackFrames;

    // Player update — pass the snapshot of justPressed for this frame
    this.player.update(dt, this.input, this.grid, this.floaters, this.particles,
      this.boss ? this.boss.bossAttacks : [], justPressed);

    // Handle skill effects
    const sk = this.player.skills;
    const spinSk = sk.find(s => s.id === 'spinAttack');
    if (spinSk && this.player.spinFrames > 20) {
      hitEntitiesInArc(this, this.player.x, this.player.y, 80, 0, Math.PI * 2, this.player.totalDamage * 0.8, false);
    }
    const chargeSk = sk.find(s => s.id === 'warriorCharge');
    if (chargeSk && this.player.chargeActive) {
      hitEntitiesInArc(this, this.player.x, this.player.y, 50, this.player.attackAngle, 0.8, this.player.totalDamage * 1.2, false);
    }
    const heavySk = sk.find(s => s.id === 'heavyStrike');
    if (heavySk && this.player.attackFrames === 16) {
      hitEntitiesInArc(this, this.player.x, this.player.y, 100, this.player.attackAngle, 0.7, this.player.totalDamage * 2.0, Math.random() < this.player.totalCrit);
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

    // Dead enemies → gore, loot, XP, level-ups
    processDeadEnemies(this);

    // Boss update
    if (this.boss && !this.boss.dead) {
      this.boss.update(dt, this.player, this.floaters, this.particles, this.projectiles);
    }

    // Victory
    if (this.boss?.dead) this.onVictory();

    // Projectiles
    updateProjectiles(this, dt);

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
          audio.play('pickup');
          persistRun(this);
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

    // FX stepping (arrays live here; logic lives in the particle system)
    this.floaters = updateFloaters(this.floaters);
    this.lighting.spawnEmbers(this.particles, this.camX, this.camY, this.canvas.width, this.canvas.height);
    this.particles = updateParticles(this.particles);
    this.decals = updateDecals(this.decals);

    // Level up notice update
    for (const n of this.levelUpNotices) {
      n.life--;
      n.alpha = n.life / n.maxLife;
    }
    this.levelUpNotices = this.levelUpNotices.filter(n => n.life > 0);

    // Wave & boss spawn
    spawnWave(this);
    checkBossSpawn(this);

    // Player death
    if (this.player.dead) this.onGameOver();
  }

  private onVictory(): void {
    if (this.phase === 'victory') return;
    this.phase = 'victory';
    this.runStats = { kills: this.player.kills, level: this.player.level, time: this.player.getElapsedSeconds() };
    this.bestRecord = recordResult(this.runStats.level, this.runStats.kills, this.runStats.time);
    clearRun();
  }

  private onGameOver(): void {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    this.runStats = { kills: this.player.kills, level: this.player.level, time: this.player.getElapsedSeconds() };
    this.bestRecord = recordResult(this.runStats.level, this.runStats.kills, this.runStats.time);
    clearRun();
    audio.stopMusic();
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

      // Blood pools sit on the ground, above the tiles but below everything else
      drawDecals(ctx, this.decals, this.camX, this.camY, vpW, vpH);

      // Dropped items
      for (const di of this.droppedItems) {
        this.drawDroppedItem(di);
      }

      // Drifting ground mist for depth, then warm light pools over the floor
      this.lighting.drawGroundMist(ctx, vpW, vpH, this.tick);
      this.lighting.drawTorchLights(ctx, this.camX, this.camY, vpW, vpH, this.tick);
      this.lighting.drawHeroLight(ctx, this.player.x - this.camX, this.player.y - this.camY);

      // Torch props (posts + flames) anchor into the ground before entities
      this.lighting.drawTorchProps(ctx, this.camX, this.camY, vpW, vpH, this.tick);

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

      // Floaters & particles (world coords, drawn offset by the camera)
      drawFloaters(ctx, this.floaters, this.camX, this.camY);
      drawParticles(ctx, this.particles, this.camX, this.camY);

      // Vignette — radial dark overlay at screen edges for atmosphere
      this.lighting.drawVignette(ctx, vpW, vpH, this.tick);

      // Falling snow on top of the world for a blizzard atmosphere
      this.weather.draw(ctx, vpW, vpH, this.tick);

      // Dungeon marker (if boss not yet spawned)
      if (!this.bossSpawned) {
        renderDungeonHint(ctx, DUNGEON_X - this.camX, DUNGEON_Y - this.camY, this.tick, this.player.kills);
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
        this.victoryAlpha = renderVictory(ctx, vpW, vpH, this.victoryAlpha, this.runStats, this.bestRecord);
      }
    } else if (this.phase === 'gameover') {
      this.gameOverAlpha = renderGameOver(ctx, vpW, vpH, this.gameOverAlpha, this.runStats, this.bestRecord);
    }
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

  // Clicking anywhere on an end screen restarts the run.
  handleClick(_screenX: number, _screenY: number): void {
    if (this.phase === 'gameover' || this.phase === 'victory') {
      this.restart();
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
    this.decals = [];
    this.levelUpNotices = [];
    this.tick = 0;
    this.phase = 'playing';
    this.inventoryOpen = false;
    this.gameOverAlpha = 0;
    this.victoryAlpha = 0;
    this.prevAttackFrames = 0;
    this.lastWaveTime = Date.now();
    this.grid = generateMap();
    spawnInitialEnemies(this);
    this.lighting.init(this.grid);
    this.weather.reset();
    this.input.keys.clear();
    this.input.moveVec = { x: 0, y: 0 };
    this.input.mouseDown = false;
    this.joystick.active = false;
    this.joystick.id = -1;
    this.attackTouchId = -1;
    if (this.musicStarted) audio.startMusic();
  }

  start(): void {
    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - this.lastTime) / 1000);
      this.lastTime = time;

      // On end screens, [SPACE] restarts (matches the on-screen prompt)
      if ((this.phase === 'gameover' || this.phase === 'victory') && this.input.keys.has('Space')) {
        this.restart();
      }

      updateCamera(this);
      this.update(dt);
      this.draw();

      this.rafId = requestAnimationFrame(loop);
    };
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    audio.stopMusic();
    for (const off of this.cleanupFns) off();
    this.cleanupFns = [];
  }
}
