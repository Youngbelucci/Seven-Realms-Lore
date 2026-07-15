import { TILE, TILE_SIZE, MAP_COLS, MAP_ROWS } from './constants';

export type TileGrid = number[][];

const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
};

export function generateMap(): TileGrid {
  const rand = rng(42);
  const grid: TileGrid = [];

  for (let r = 0; r < MAP_ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < MAP_COLS; c++) {
      const isBorder = r < 2 || r >= MAP_ROWS - 2 || c < 2 || c >= MAP_COLS - 2;
      if (isBorder) {
        grid[r][c] = TILE.FOREST;
      } else {
        const n = rand();
        if (n < 0.65) {
          grid[r][c] = TILE.SNOW;
        } else if (n < 0.78) {
          grid[r][c] = TILE.SNOW2;
        } else if (n < 0.88) {
          grid[r][c] = TILE.SNOW3;
        } else if (n < 0.92) {
          grid[r][c] = TILE.ICE;
        } else {
          grid[r][c] = TILE.RUIN;
        }
      }
    }
  }

  // Forest cluster in top-left area
  for (let r = 2; r < 10; r++) {
    for (let c = 2; c < 8; c++) {
      if (rand() < 0.7) grid[r][c] = TILE.FOREST;
    }
  }

  // Stone ruins cluster top-right
  for (let r = 3; r < 9; r++) {
    for (let c = MAP_COLS - 10; c < MAP_COLS - 2; c++) {
      if (rand() < 0.5) grid[r][c] = TILE.WALL;
    }
  }

  // Dungeon entrance bottom-center
  const dungeonC = Math.floor(MAP_COLS / 2);
  const dungeonR = MAP_ROWS - 5;
  for (let r = dungeonR - 2; r <= dungeonR + 2; r++) {
    for (let c = dungeonC - 3; c <= dungeonC + 3; c++) {
      grid[r][c] = TILE.DUNGEON_FLOOR;
    }
  }
  // The actual gate
  grid[dungeonR][dungeonC] = TILE.DUNGEON;
  grid[dungeonR][dungeonC - 1] = TILE.DUNGEON;
  grid[dungeonR][dungeonC + 1] = TILE.DUNGEON;

  // Ice patches
  for (let r = 12; r < 20; r++) {
    for (let c = 15; c < 25; c++) {
      if (rand() < 0.35) grid[r][c] = TILE.ICE;
    }
  }

  return grid;
}

// Collision check: is a world-space point blocked?
export function isSolid(grid: TileGrid, wx: number, wy: number): boolean {
  const c = Math.floor(wx / TILE_SIZE);
  const r = Math.floor(wy / TILE_SIZE);
  if (r < 0 || r >= MAP_ROWS || c < 0 || c >= MAP_COLS) return true;
  const t = grid[r][c];
  return t === TILE.FOREST || t === TILE.WALL;
}

export function renderMap(
  ctx: CanvasRenderingContext2D,
  grid: TileGrid,
  camX: number,
  camY: number,
  vpW: number,
  vpH: number,
  tick: number
): void {
  const startC = Math.max(0, Math.floor(camX / TILE_SIZE) - 1);
  const startR = Math.max(0, Math.floor(camY / TILE_SIZE) - 1);
  const endC = Math.min(MAP_COLS, startC + Math.ceil(vpW / TILE_SIZE) + 2);
  const endR = Math.min(MAP_ROWS, startR + Math.ceil(vpH / TILE_SIZE) + 2);

  for (let r = startR; r < endR; r++) {
    for (let c = startC; c < endC; c++) {
      const t = grid[r][c];
      const sx = c * TILE_SIZE - camX;
      const sy = r * TILE_SIZE - camY;

      drawTile(ctx, t, sx, sy, c, r, tick);
    }
  }
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: number,
  x: number,
  y: number,
  c: number,
  r: number,
  tick: number
): void {
  const S = TILE_SIZE;
  const seed = c * 37 + r * 13;

  switch (tile) {
    case TILE.SNOW:
      ctx.fillStyle = '#dce8f0';
      ctx.fillRect(x, y, S, S);
      // subtle variation
      if ((seed % 5) === 0) {
        ctx.fillStyle = '#ccd8e4';
        ctx.fillRect(x + 4, y + 4, S - 8, S - 8);
      }
      break;

    case TILE.SNOW2:
      ctx.fillStyle = '#c8d8e8';
      ctx.fillRect(x, y, S, S);
      // small snow texture dots
      ctx.fillStyle = '#e8f4ff';
      for (let i = 0; i < 3; i++) {
        const dx = ((seed * (i + 1) * 17) % (S - 6)) + 3;
        const dy = ((seed * (i + 1) * 31) % (S - 6)) + 3;
        ctx.fillRect(x + dx, y + dy, 3, 2);
      }
      break;

    case TILE.SNOW3:
      ctx.fillStyle = '#b8cce0';
      ctx.fillRect(x, y, S, S);
      break;

    case TILE.ICE:
      ctx.fillStyle = '#8fc8e8';
      ctx.fillRect(x, y, S, S);
      // shimmering
      const shimmer = Math.sin(tick * 0.002 + seed) * 0.15 + 0.6;
      ctx.fillStyle = `rgba(200,240,255,${shimmer})`;
      ctx.fillRect(x + 8, y + 8, S - 16, S - 16);
      ctx.strokeStyle = 'rgba(150,220,255,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, S - 2, S - 2);
      break;

    case TILE.FOREST:
      ctx.fillStyle = '#1a2a1a';
      ctx.fillRect(x, y, S, S);
      // tree canopy
      ctx.fillStyle = '#2a3d1e';
      ctx.beginPath();
      ctx.arc(x + S / 2, y + S / 2, S / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d2e15';
      ctx.beginPath();
      ctx.arc(x + S / 2 - 4, y + S / 2 - 4, S / 3, 0, Math.PI * 2);
      ctx.fill();
      // Snow on top of trees
      ctx.fillStyle = 'rgba(220,240,255,0.35)';
      ctx.beginPath();
      ctx.arc(x + S / 2, y + S / 2 - 6, S / 4, 0, Math.PI * 2);
      ctx.fill();
      break;

    case TILE.WALL:
      ctx.fillStyle = '#3a3030';
      ctx.fillRect(x, y, S, S);
      ctx.fillStyle = '#4a3838';
      ctx.fillRect(x + 2, y + 2, S / 2 - 2, S / 2 - 2);
      ctx.fillRect(x + S / 2 + 1, y + S / 2 + 1, S / 2 - 3, S / 2 - 3);
      ctx.fillStyle = '#2a2020';
      ctx.fillRect(x + S / 2 + 1, y + 2, S / 2 - 3, S / 2 - 2);
      ctx.fillRect(x + 2, y + S / 2 + 1, S / 2 - 2, S / 2 - 3);
      break;

    case TILE.RUIN:
      ctx.fillStyle = '#c4c0b8';
      ctx.fillRect(x, y, S, S);
      ctx.fillStyle = '#a8a0a0';
      ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
      // ruin cracks
      ctx.strokeStyle = '#888080';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 5);
      ctx.lineTo(x + 14, y + 20);
      ctx.lineTo(x + 10, y + 30);
      ctx.stroke();
      break;

    case TILE.DUNGEON_FLOOR:
      ctx.fillStyle = '#201820';
      ctx.fillRect(x, y, S, S);
      ctx.fillStyle = '#2a2030';
      ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
      // glowing runes
      const runeGlow = Math.sin(tick * 0.003 + seed * 0.5) * 0.3 + 0.5;
      ctx.fillStyle = `rgba(140,60,200,${runeGlow * 0.4})`;
      ctx.fillRect(x + S / 4, y + S / 4, S / 2, S / 2);
      break;

    case TILE.DUNGEON:
      ctx.fillStyle = '#100810';
      ctx.fillRect(x, y, S, S);
      // dungeon gate arch
      ctx.fillStyle = '#1a0a1a';
      ctx.beginPath();
      ctx.arc(x + S / 2, y + S / 2, S / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      // glowing purple inside
      const gateGlow = Math.sin(tick * 0.004) * 0.4 + 0.6;
      ctx.fillStyle = `rgba(160,40,255,${gateGlow})`;
      ctx.beginPath();
      ctx.arc(x + S / 2, y + S / 2, S / 2 - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(200,100,255,${gateGlow * 0.7})`;
      ctx.beginPath();
      ctx.arc(x + S / 2, y + S / 2, S / 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚔', x + S / 2, y + S / 2 + 4);
      break;
  }
}
