export type DamageType = 'physical' | 'fire' | 'ice' | 'poison' | 'darkness';
export type ItemRarity = 'common' | 'magic' | 'rare' | 'legendary';
export type EnemyState = 'idle' | 'aggro' | 'attack' | 'dead';
export type SkillId = 'heavyStrike' | 'spinAttack' | 'warriorCharge' | 'ancestralShield';
export type GamePhase = 'playing' | 'gameover' | 'paused' | 'victory';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Stats {
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  damage: number;
  defense: number;
  speed: number;
  critChance: number;
  critMultiplier: number;
}

export interface Item {
  id: string;
  name: string;
  rarity: ItemRarity;
  slot: 'weapon' | 'armor';
  damage?: number;
  defense?: number;
  critChance?: number;
  effect?: string;
  damageType?: DamageType;
}

export interface DroppedItem {
  item: Item;
  x: number;
  y: number;
  glowPhase: number;
}

export interface FloatingNumber {
  x: number;
  y: number;
  value: number;
  isCrit: boolean;
  damageType: DamageType;
  alpha: number;
  vy: number;
  life: number;
  maxLife: number;
  text?: string;
}

export interface SkillDef {
  id: SkillId;
  name: string;
  key: string;
  cooldown: number;
  energyCost: number;
  lastUsed: number;
  description: string;
  color: string;
  icon: string;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  damageType: DamageType;
  fromEnemy: boolean;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface LevelUpNotice {
  level: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface BossAttack {
  type: 'slam' | 'iceStorm' | 'summonWolves';
  x: number;
  y: number;
  radius: number;
  alpha: number;
  life: number;
  maxLife: number;
  damage: number;
}

export interface Input {
  keys: Set<string>;
  justPressed: Set<string>; // edge-triggered: only set on the frame the key first went down
  mouse: Vec2;
  mouseWorld: Vec2;
  mouseDown: boolean;
  mouseJustDown: boolean;
  moveVec: Vec2;    // normalized movement from touch joystick; (0,0) when unused
  isTouch: boolean; // true once touch input has been detected/used
}
