export const TILE_SIZE = 48;
export const MAP_COLS = 40;
export const MAP_ROWS = 30;
export const MAP_W = MAP_COLS * TILE_SIZE;
export const MAP_H = MAP_ROWS * TILE_SIZE;

export const PLAYER_SIZE = 20;
export const PLAYER_BASE_SPEED = 190;
export const PLAYER_BASE_HP = 200;
export const PLAYER_BASE_ENERGY = 100;

export const XP_PER_LEVEL_BASE = 100;
export const XP_SCALE = 1.4;

export const ENEMY_AGGRO_RANGE = 280;
export const ENEMY_ATTACK_RANGE_MELEE = 52;
export const ENEMY_ATTACK_RANGE_RANGED = 320;

export const BOSS_HP = 1800;
export const BOSS_PHASE2_HP = 1200;
export const BOSS_PHASE3_HP = 600;
export const BOSS_SIZE = 36;

// Tile types
export const TILE = {
  SNOW: 0,
  SNOW2: 1,
  SNOW3: 2,
  FOREST: 3,
  WALL: 4,
  RUIN: 5,
  DUNGEON: 6,
  DUNGEON_FLOOR: 7,
  ICE: 8,
} as const;

export const RARITY_COLORS: Record<string, string> = {
  common: '#b0b0b0',
  magic: '#6fa8ff',
  rare: '#ffd700',
  legendary: '#ff8c00',
};

export const DAMAGE_COLORS: Record<string, string> = {
  physical: '#ffffff',
  fire: '#ff6a00',
  ice: '#00cfff',
  poison: '#7fff00',
  darkness: '#c070ff',
};

export const SKILL_COLORS: Record<string, string> = {
  heavyStrike: '#ff4444',
  spinAttack: '#ff9900',
  warriorCharge: '#00aaff',
  ancestralShield: '#ffd700',
};

// Wave spawn intervals (ms)
export const WAVE_INTERVAL = 18000;
export const MAX_ENEMIES_ON_MAP = 12;

// Energy regen per second
export const ENERGY_REGEN = 8;
