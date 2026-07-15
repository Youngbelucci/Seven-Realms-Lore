import { Item, ItemRarity, DamageType } from './types';
import { weightedRandom, uid, randRange, randInt } from './utils';

interface ItemTemplate {
  name: string;
  slot: 'weapon' | 'armor';
  baseDamage?: [number, number];
  baseDefense?: [number, number];
  baseCrit?: [number, number];
  effect?: string;
  damageType?: DamageType;
  minRarity: ItemRarity;
}

const WEAPON_TEMPLATES: ItemTemplate[] = [
  { name: 'Espada del Invierno Perdido', slot: 'weapon', baseDamage: [20, 30], baseCrit: [0.08, 0.12], effect: 'congela enemigos', damageType: 'ice', minRarity: 'rare' },
  { name: 'Hacha de Hielo Oscuro', slot: 'weapon', baseDamage: [18, 26], damageType: 'ice', minRarity: 'common' },
  { name: 'Espada Llameante', slot: 'weapon', baseDamage: [22, 32], damageType: 'fire', effect: 'quema al impacto', minRarity: 'magic' },
  { name: 'Daga de la Sombra', slot: 'weapon', baseDamage: [15, 22], baseCrit: [0.12, 0.18], damageType: 'darkness', minRarity: 'common' },
  { name: 'Lanza Envenenada', slot: 'weapon', baseDamage: [14, 20], effect: 'envenena al golpe', damageType: 'poison', minRarity: 'magic' },
  { name: 'Mandoble de Hierro', slot: 'weapon', baseDamage: [28, 38], minRarity: 'common' },
  { name: 'Filo del Abismo', slot: 'weapon', baseDamage: [30, 45], baseCrit: [0.15, 0.22], damageType: 'darkness', effect: 'absorbe vida', minRarity: 'legendary' },
  { name: 'Tormenta de Cristal', slot: 'weapon', baseDamage: [25, 35], damageType: 'ice', effect: 'explosión de hielo', minRarity: 'rare' },
  { name: 'Espada de las Ruinas', slot: 'weapon', baseDamage: [16, 24], minRarity: 'common' },
  { name: 'Sable del Cazador', slot: 'weapon', baseDamage: [13, 19], baseCrit: [0.10, 0.15], minRarity: 'common' },
];

const ARMOR_TEMPLATES: ItemTemplate[] = [
  { name: 'Armadura del Guardián', slot: 'armor', baseDefense: [18, 28], minRarity: 'rare' },
  { name: 'Cota de Mallas Helada', slot: 'armor', baseDefense: [12, 18], damageType: 'ice', minRarity: 'magic' },
  { name: 'Peto de Acero Negro', slot: 'armor', baseDefense: [22, 34], minRarity: 'magic' },
  { name: 'Escamas de Dragón', slot: 'armor', baseDefense: [30, 45], effect: 'resistencia al fuego', minRarity: 'legendary' },
  { name: 'Capa de Sombras', slot: 'armor', baseDefense: [8, 14], baseCrit: [0.06, 0.10], minRarity: 'common' },
  { name: 'Coraza del Norte', slot: 'armor', baseDefense: [16, 24], minRarity: 'common' },
  { name: 'Veste de Veneno', slot: 'armor', baseDefense: [10, 16], effect: 'refleja veneno', damageType: 'poison', minRarity: 'magic' },
  { name: 'Manto Espectral', slot: 'armor', baseDefense: [14, 20], minRarity: 'common' },
];

const RARITY_ORDER: ItemRarity[] = ['common', 'magic', 'rare', 'legendary'];

function rarityIndex(r: ItemRarity): number {
  return RARITY_ORDER.indexOf(r);
}

function rollRarity(enemyTier: number): ItemRarity {
  // Higher tier enemies drop better loot
  const weights = [
    Math.max(0.1, 0.7 - enemyTier * 0.1),   // common
    Math.max(0.05, 0.22 - enemyTier * 0.02), // magic
    Math.max(0.02, 0.07 + enemyTier * 0.04), // rare
    Math.max(0.01, 0.01 + enemyTier * 0.02), // legendary
  ];
  return weightedRandom(RARITY_ORDER, weights);
}

export function rollLoot(enemyTier: number): Item | null {
  // ~55% drop chance, higher for boss tier
  const dropChance = 0.55 + enemyTier * 0.1;
  if (Math.random() > dropChance) return null;

  const rarity = rollRarity(enemyTier);
  const rarIdx = rarityIndex(rarity);

  // Pick template: only templates at or below required rarity
  const pool = Math.random() < 0.5 ? WEAPON_TEMPLATES : ARMOR_TEMPLATES;
  const eligible = pool.filter(t => rarityIndex(t.minRarity) <= rarIdx);
  if (eligible.length === 0) return null;

  const template = eligible[randInt(0, eligible.length - 1)];

  const item: Item = {
    id: uid(),
    name: template.name,
    rarity,
    slot: template.slot,
  };

  if (template.baseDamage) {
    const scale = 1 + rarIdx * 0.3;
    item.damage = Math.round(randRange(template.baseDamage[0], template.baseDamage[1]) * scale);
  }
  if (template.baseDefense) {
    const scale = 1 + rarIdx * 0.3;
    item.defense = Math.round(randRange(template.baseDefense[0], template.baseDefense[1]) * scale);
  }
  if (template.baseCrit) {
    item.critChance = parseFloat(randRange(template.baseCrit[0], template.baseCrit[1]).toFixed(2));
  }
  if (template.effect) item.effect = template.effect;
  if (template.damageType) item.damageType = template.damageType;

  return item;
}

export function getItemStatLines(item: Item): string[] {
  const lines: string[] = [];
  if (item.damage != null) lines.push(`+${item.damage} daño`);
  if (item.defense != null) lines.push(`+${item.defense} defensa`);
  if (item.critChance != null) lines.push(`+${Math.round(item.critChance * 100)}% crítico`);
  if (item.damageType) {
    const typeNames: Record<string, string> = { fire: 'Fuego', ice: 'Hielo', poison: 'Veneno', darkness: 'Oscuridad' };
    lines.push(`Daño: ${typeNames[item.damageType] ?? item.damageType}`);
  }
  if (item.effect) lines.push(`Efecto: ${item.effect}`);
  return lines;
}
