---
name: Seven Realms module architecture & save semantics
description: How the ARPG engine is decomposed and the rules for adding state/systems and persisting runs.
---

# Seven Realms — engine decomposition & save rules

The game (`artifacts/seven-realms/src/game/`) was refactored from a monolithic
`engine.ts` into focused modules. Follow these conventions for new work.

## Where state lives
- `engine.ts` is the **single central state container** + main loop + input. All
  shared arrays (enemies, particles, floaters, projectiles, decals, droppedItems,
  levelUpNotices), `camX/camY`, `phase`, `tick`, `player`, `boss` stay as engine fields.
- **Function modules operate ON the engine**: `camera.ts` (updateCamera), `combat.ts`
  (hitEntitiesInArc/updateProjectiles), `game.ts` (spawning/waves/boss/dead-enemy
  processing + save integration), `particles.ts` (FX step/draw). They take the engine
  (`import type { GameEngine }`) and mutate its fields.
- **Encapsulated classes own self-contained state**: `Lighting` owns torches,
  `Weather` owns snow. Engine holds one instance each.

**Why:** keeps behavior identical to the old monolith with minimal churn; new systems
plug in without engine bloat. **How to apply:** add engine-wide state as an engine field
+ a function module; add self-contained state as a small class the engine instantiates.

## Save/load (`save.ts`) — progression only
- Persist **player progression** (level/xp/xpToNext/kills/stats/equipped gear); regen
  map + enemies fresh on load. Record best-run stats on death/victory.
- **Persist on ANY material progression change**, not just level-up: `persistRun` runs
  after every processed kill in `processDeadEnemies`, and on auto-equip pickup. A save
  only on level-up silently loses XP/kills earned between levels on refresh/crash.
- **Restore equipment by direct field assignment** (`player.equippedWeapon = ...`), NOT
  `equipItem()`. `totalDamage/totalDefense/totalCrit` are getters derived from base
  stats + equipped items, so restored base stats + direct equip refs are correct;
  going through `equipItem` risks side effects / double-counting. **Why:** verified in
  review — direct assignment is the faithful restore.

## Engine teardown
- `stop()` must run all `cleanupFns` (DOM listener removers) — listeners are added with
  named handlers whose removers are pushed to `cleanupFns`. **Why:** remounting the
  engine otherwise stacks duplicate keyboard/mouse/touch handlers.

## Assets (`assets.ts`) + audio (`audio.ts`)
- `assets.ts` is the single asset loader with procedural fallback; `sprites.ts` delegates
  to it. Real image files live under `public/assets/<category>/` (e.g.
  `characters/knight.png`), keyed as `characters/knight`.
- Audio is fully procedural WebAudio (no files). Unlock + start music on first user
  gesture; mute on `KeyM`; stop music on death.
