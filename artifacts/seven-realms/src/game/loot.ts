// Loot drop logic: decides whether something drops, at what rarity, and which
// template. Item definitions and construction live in items.ts.
import { Item, ItemRarity } from './types';
import { weightedRandom, randInt } from './utils';
import {
  WEAPON_TEMPLATES, ARMOR_TEMPLATES, RARITY_ORDER, rarityIndex, buildItem,
} from './items';

export { getItemStatLines } from './items';

function rollRarity(enemyTier: number): ItemRarity {
  // Higher tier enemies drop better loot
  const weights = [
    Math.max(0.1, 0.7 - enemyTier * 0.1),    // common
    Math.max(0.05, 0.22 - enemyTier * 0.02), // magic
    Math.max(0.02, 0.07 + enemyTier * 0.04), // rare
    Math.max(0.01, 0.01 + enemyTier * 0.02), // legendary
  ];
  return weightedRandom(RARITY_ORDER, weights);
}

export function rollLoot(enemyTier: number): Item | null {
  // ~55% drop chance, higher for boss tier
  const dropChance = Math.min(0.75, 0.55 + enemyTier * 0.1);
  if (Math.random() > dropChance) return null;

  const rarity = rollRarity(enemyTier);
  const rarIdx = rarityIndex(rarity);

  // Pick template: only templates at or below required rarity
  const pool = Math.random() < 0.5 ? WEAPON_TEMPLATES : ARMOR_TEMPLATES;
  const eligible = pool.filter(t => rarityIndex(t.minRarity) <= rarIdx);
  if (eligible.length === 0) return null;

  const template = eligible[randInt(0, eligible.length - 1)];
  return buildItem(template, rarity);
}

// Guaranteed legendary drop — the boss always rewards a legendary item.
export function rollBossLoot(): Item | null {
  const pool = Math.random() < 0.5 ? WEAPON_TEMPLATES : ARMOR_TEMPLATES;
  const eligible = pool.filter(t => rarityIndex(t.minRarity) <= rarityIndex('legendary'));
  if (eligible.length === 0) return null;
  const template = eligible[randInt(0, eligible.length - 1)];
  return buildItem(template, 'legendary');
}
