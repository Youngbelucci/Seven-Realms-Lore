# The Seven Realms: Blood & Ice

A 2D dark-fantasy Action RPG demo playable in the browser, inspired by Diablo and Path of Exile. Set in the frozen Frozen Pass, players control the Caballero del Norte (Knight of the North) fighting through waves of enemies to defeat the Ice Guardian boss.

## Run & Operate

- `pnpm --filter @workspace/seven-realms run dev` — run the game frontend
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000, not required for gameplay)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Game: React + Vite + HTML5 Canvas 2D (no external game engine)
- API: Express 5 (health check only, game is frontend-only)
- DB: PostgreSQL + Drizzle ORM (provisioned but unused in v0.1)

## Game Controls

- **WASD** — move the Knight
- **Mouse / Space / Click** — basic attack
- **Q** — Golpe Pesado (Heavy Strike)
- **W** — Ataque Giratorio (Spin Attack)
- **E** — Carga del Guerrero (Warrior Charge)
- **R** — Escudo Ancestral (Ancestral Shield)
- **TAB** — open/close Inventory

## Where Things Live

- `artifacts/seven-realms/src/game/` — all game code
  - `engine.ts` — main game loop, entity management, wave spawning
  - `player.ts` — Knight class, WASD movement, skills, XP/leveling. Draws the `public/knight.png` pixel-art sprite (via `sprites.ts`), with procedural drawing kept as a fallback until the image loads
  - `sprites.ts` — lazy image-sprite loader (served from `public/`)
  - `enemy.ts` — Ice Wolf, Fallen Warrior, Spectral Archer AI
  - `boss.ts` — Ice Guardian with 3 phases
  - `tilemap.ts` — Frozen Pass map generation and rendering
  - `hud.ts` — HP/Energy bars, skill hotbar, boss health bar, inventory panel
  - `loot.ts` — item rarity system, loot tables, weapon/armor drops
  - `skills.ts` — skill definitions and cooldown logic
  - `entity.ts` — base entity class with damage, floaters, particles
  - `types.ts` — shared TypeScript interfaces
  - `constants.ts` — all tunable game constants

## Architecture Decisions

- Pure Canvas 2D for all game rendering — React only provides the `<canvas>` element shell
- Entity system with abstract `Entity` base class; all combat goes through `takeDamage()`
- Loot auto-equips if better than current equipped item (score = damage + defense + crit*50)
- Boss spawns after 15 kills or player reaching level 4, whichever comes first
- Wave spawning every 18s with enemy tier scaling by player level
- localStorage autosave deferred to v0.2

## Product

A fully playable ARPG demo loop: spawn on the Frozen Pass → fight Ice Wolves, Fallen Warriors, and Spectral Archers → level up, collect loot → face the Ice Guardian boss across 3 phases → victory or defeat screen with restart.

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do not modify `artifacts/api-server` for game features — game is frontend-only
- Tile collision uses `isSolid()` from `tilemap.ts` — FOREST and WALL tiles block movement
- Boss attacks use world-space coordinates; screen conversion happens in `drawAtScreen()`
- Floaters/particles are stored in world-space and converted in `engine.ts`'s `draw()` loop
