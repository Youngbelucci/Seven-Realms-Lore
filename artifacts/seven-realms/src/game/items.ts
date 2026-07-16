// Item definitions & construction. The loot drop logic lives in loot.ts;
// this module owns the templates and how a concrete Item is built from them.
import { Item, ItemRarity, DamageType } from './types';
import { uid, randRange } from './utils';

export interface ItemTemplate {
  name: string;
  slot: 'weapon' | 'armor';
  baseDamage?: [number, number];
  baseDefense?: [number, number];
  baseCrit?: [number, number];
  effect?: string;
  damageType?: DamageType;
  minRarity: ItemRarity;
}

export const WEAPON_TEMPLATES: ItemTemplate[] = [
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

export const ARMOR_TEMPLATES: ItemTemplate[] = [
  { name: 'Armadura del Guardián', slot: 'armor', baseDefense: [18, 28], minRarity: 'rare' },
  { name: 'Cota de Mallas Helada', slot: 'armor', baseDefense: [12, 18], damageType: 'ice', minRarity: 'magic' },
  { name: 'Peto de Acero Negro', slot: 'armor', baseDefense: [22, 34], minRarity: 'magic' },
  { name: 'Escamas de Dragón', slot: 'armor', baseDefense: [30, 45], effect: 'resistencia al fuego', minRarity: 'legendary' },
  { name: 'Capa de Sombras', slot: 'armor', baseDefense: [8, 14], baseCrit: [0.06, 0.10], minRarity: 'common' },
  { name: 'Coraza del Norte', slot: 'armor', baseDefense: [16, 24], minRarity: 'common' },
  { name: 'Veste de Veneno', slot: 'armor', baseDefense: [10, 16], effect: 'refleja veneno', damageType: 'poison', minRarity: 'magic' },
  { name: 'Manto Espectral', slot: 'armor', baseDefense: [14, 20], minRarity: 'common' },
];

export const RARITY_ORDER: ItemRarity[] = ['common', 'magic', 'rare', 'legendary'];

export function rarityIndex(r: ItemRarity): number {
  return RARITY_ORDER.indexOf(r);
}

// Build a concrete rolled Item from a template at a given rarity.
export function buildItem(template: ItemTemplate, rarity: ItemRarity): Item {
  const rarIdx = rarityIndex(rarity);
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
