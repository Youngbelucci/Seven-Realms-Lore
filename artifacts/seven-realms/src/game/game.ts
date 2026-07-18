// Game rules & progression: enemy spawning, wave pacing, boss triggering, and
// processing of dead enemies (loot, XP, level-ups). The engine owns the loop
// and rendering; this module owns "what happens" during play.
import { Enemy, EnemyType } from './enemy';
import { Boss } from './boss';
import { rollLoot } from './loot';
import { isSolid } from './world';
import { clamp, randRange } from './utils';
import { spawnBloodDecal } from './particles';
import { saveRun } from './save';
import type { RunSnapshot } from './save';
import { audio } from './audio';
import {
  MAP_W, MAP_H, TILE_SIZE, MAP_COLS, MAP_ROWS, WAVE_INTERVAL, MAX_ENEMIES_ON_MAP,
} from './constants';
import type { GameEngine } from './engine';

export const DUNGEON_X = Math.floor(MAP_COLS / 2) * TILE_SIZE;
export const DUNGEON_Y = (MAP_ROWS - 5) * TILE_SIZE;

export function spawnInitialEnemies(g: GameEngine): void {
  const types: EnemyType[] = ['wolf', 'wolf', 'warrior', 'wolf', 'archer'];
  for (const type of types) spawnEnemy(g, type);
}

export function spawnEnemy(g: GameEngine, type: EnemyType, cx?: number, cy?: number): void {
  if (g.enemies.filter(e => !e.dead).length >= MAX_ENEMIES_ON_MAP) return;
  let x: number, y: number;
  if (cx !== undefined && cy !== undefined) {
    x = cx + randRange(-20, 20);
    y = cy + randRange(-20, 20);
  } else {
    // Spawn off-screen edges
    const edge = Math.floor(Math.random() * 4);
    const vpW = g.canvas.width, vpH = g.canvas.height;
    switch (edge) {
      case 0: x = g.camX + randRange(0, vpW); y = g.camY - 60; break;
      case 1: x = g.camX + randRange(0, vpW); y = g.camY + vpH + 60; break;
      case 2: x = g.camX - 60; y = g.camY + randRange(0, vpH); break;
      default: x = g.camX + vpW + 60; y = g.camY + randRange(0, vpH); break;
    }
  }
  x = clamp(x, 80, MAP_W - 80);
  y = clamp(y, 80, MAP_H - 80);
  if (!isSolid(g.grid, x, y)) {
    g.enemies.push(new Enemy(x, y, type, g.realm));
  }
}

export function spawnWave(g: GameEngine): void {
  const now = Date.now();
  if (now - g.lastWaveTime < WAVE_INTERVAL) return;
  g.lastWaveTime = now;

  const waveSize = 4 + Math.floor(g.player.level / 2);
  const typePool: EnemyType[] = g.player.level >= 5
    ? ['wolf', 'warrior', 'warrior', 'archer', 'wolf', 'archer']
    : ['wolf', 'wolf', 'warrior', 'wolf'];

  for (let i = 0; i < waveSize; i++) {
    const t = typePool[Math.floor(Math.random() * typePool.length)];
    spawnEnemy(g, t);
  }
}

export function checkBossSpawn(g: GameEngine): void {
  if (g.bossSpawned) return;
  // Kills within the current realm gate the boss (total level only counts in
  // Realm 1, so later realms always require fighting through the new world).
  if (g.realmKills >= 15 || (g.realm === 1 && g.player.level >= 4)) {
    g.bossSpawned = true;
    g.boss = new Boss(DUNGEON_X, DUNGEON_Y, g.realm);
    g.boss.spawnRequestCallback = (type, x, y) => spawnEnemy(g, type, x, y);
    audio.play('bossRoar');
    audio.startBossMusic();
    g.floaters.push({
      x: g.canvas.width / 2,
      y: g.canvas.height / 3,
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

// Process enemies that died this frame: gore, loot, XP and level-ups.
export function processDeadEnemies(g: GameEngine): void {
  const justDead = g.enemies.filter(e => e.dead && !('_processed' in e));
  for (const e of justDead) {
    (e as unknown as { _processed: boolean })._processed = true;
    spawnBloodDecal(g.decals, e.x, e.y, e.tier >= 2);
    audio.play('enemyDeath');

    const loot = rollLoot(e.tier);
    if (loot) {
      g.droppedItems.push({ item: loot, x: e.x + randRange(-20, 20), y: e.y + randRange(-20, 20), glowPhase: 0 });
    }

    // Health orbs: ~35% of kills drop a healing orb (stronger enemies heal more)
    if (Math.random() < 0.35) {
      g.healthOrbs.push({
        x: e.x + randRange(-15, 15),
        y: e.y + randRange(-15, 15),
        heal: 15 + e.tier * 10,
        glowPhase: Math.random() * Math.PI * 2,
        life: 60 * 12, // lingers ~12 seconds
      });
    }
    const leveled = g.player.gainXP(e.xpValue);
    if (leveled) {
      g.levelUpNotices.push({ level: g.player.level, alpha: 1, life: 180, maxLife: 180 });
      audio.play('levelUp');
    }
    g.player.kills++;
    g.realmKills++;
  }
  g.enemies = g.enemies.filter(e => !e.dead);

  // Persist progression whenever it materially changed (any kill/XP gain), not
  // just on level-up, so a refresh/crash never rolls back earned progress.
  if (justDead.length > 0) persistRun(g);
}

// --- Save integration -----------------------------------------------------

export function snapshotPlayer(g: GameEngine): RunSnapshot {
  const p = g.player;
  return {
    realm: g.realm,
    level: p.level,
    xp: p.xp,
    xpToNext: p.xpToNext,
    kills: p.kills,
    stats: { ...p.stats },
    equippedWeapon: p.equippedWeapon,
    equippedArmor: p.equippedArmor,
  };
}

export function persistRun(g: GameEngine): void {
  saveRun(snapshotPlayer(g));
}
