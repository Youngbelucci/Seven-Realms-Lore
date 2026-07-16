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
        if (n < 0.62) grid[r][c] = TILE.SNOW;
        else if (n < 0.76) grid[r][c] = TILE.SNOW2;
        else if (n < 0.87) grid[r][c] = TILE.SNOW3;
        else if (n < 0.92) grid[r][c] = TILE.ICE;
        else grid[r][c] = TILE.RUIN;
      }
    }
  }

  // Forest cluster top-left
  for (let r = 2; r < 10; r++)
    for (let c = 2; c < 8; c++)
      if (rand() < 0.7) grid[r][c] = TILE.FOREST;

  // Stone ruins top-right
  for (let r = 3; r < 9; r++)
    for (let c = MAP_COLS - 10; c < MAP_COLS - 2; c++)
      if (rand() < 0.5) grid[r][c] = TILE.WALL;

  // Dungeon entrance bottom-center
  const dungeonC = Math.floor(MAP_COLS / 2);
  const dungeonR = MAP_ROWS - 5;
  for (let r = dungeonR - 2; r <= dungeonR + 2; r++)
    for (let c = dungeonC - 3; c <= dungeonC + 3; c++)
      grid[r][c] = TILE.DUNGEON_FLOOR;

  grid[dungeonR][dungeonC] = TILE.DUNGEON;
  grid[dungeonR][dungeonC - 1] = TILE.DUNGEON;
  grid[dungeonR][dungeonC + 1] = TILE.DUNGEON;

  // Ice patches
  for (let r = 12; r < 20; r++)
    for (let c = 15; c < 25; c++)
      if (rand() < 0.35) grid[r][c] = TILE.ICE;

  return grid;
}

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
      const sx = Math.round(c * TILE_SIZE - camX);
      const sy = Math.round(r * TILE_SIZE - camY);
      // Always isolate each tile draw — prevents stroke/fill state bleed between tiles
      ctx.save();
      drawTile(ctx, t, sx, sy, c, r, tick);
      ctx.restore();
    }
  }
}

// Deterministic per-tile noise helper (no shared state, no bleed)
function tileSeed(c: number, r: number): number {
  return Math.abs((c * 374761393 + r * 1073741789) | 0);
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
  const seed = tileSeed(c, r);

  switch (tile) {
    case TILE.SNOW: {
      // Base — dark slate-blue snow, not blinding white
      ctx.fillStyle = '#2a3545';
      ctx.fillRect(x, y, S, S);

      // Subtle lighter patch for variation
      const variant = seed % 4;
      if (variant === 0) {
        ctx.fillStyle = '#303d50';
        ctx.fillRect(x + 6, y + 6, S - 12, S - 12);
      } else if (variant === 1) {
        ctx.fillStyle = '#243040';
        ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
      }

      // Fine snow speckles
      ctx.fillStyle = 'rgba(180,210,240,0.18)';
      const speckleCount = (seed % 3) + 2;
      for (let i = 0; i < speckleCount; i++) {
        const sx2 = ((seed * (i + 7) * 31) % (S - 4)) + 2;
        const sy2 = ((seed * (i + 3) * 53) % (S - 4)) + 2;
        ctx.fillRect(x + sx2, y + sy2, 2, 2);
      }

      break;
    }

    case TILE.SNOW2: {
      // Slightly lighter variation with cracked ice surface
      ctx.fillStyle = '#324055';
      ctx.fillRect(x, y, S, S);

      // Inner panel
      ctx.fillStyle = '#3a4a60';
      ctx.fillRect(x + 3, y + 3, S - 6, S - 6);

      // Crack lines
      ctx.strokeStyle = 'rgba(100,140,180,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const cx1 = x + (seed % 20) + 8;
      const cy1 = y + ((seed >> 4) % 12) + 4;
      ctx.moveTo(cx1, cy1);
      ctx.lineTo(cx1 + ((seed >> 8) % 16) - 8, cy1 + ((seed >> 12) % 20) + 4);
      ctx.stroke();

      break;
    }

    case TILE.SNOW3: {
      // Darker, windswept snow
      ctx.fillStyle = '#1e2a38';
      ctx.fillRect(x, y, S, S);

      // Snow drift shapes
      ctx.fillStyle = 'rgba(60,80,100,0.4)';
      ctx.beginPath();
      ctx.ellipse(
        x + (seed % 20) + 10,
        y + ((seed >> 5) % 16) + 8,
        (seed % 14) + 8,
        (seed % 8) + 4,
        ((seed >> 9) % 10) * 0.3,
        0, Math.PI * 2
      );
      ctx.fill();

      break;
    }

    case TILE.ICE: {
      // Deep teal ice
      ctx.fillStyle = '#1a3a4a';
      ctx.fillRect(x, y, S, S);

      // Glassy inner panel
      ctx.fillStyle = '#1e4458';
      ctx.fillRect(x + 4, y + 4, S - 8, S - 8);

      // Animated shimmer
      const shimmer = Math.sin(tick * 0.025 + seed * 0.7) * 0.15 + 0.12;
      ctx.fillStyle = `rgba(80,180,220,${shimmer})`;
      ctx.fillRect(x + 8, y + 8, S - 16, S - 16);

      // Highlight streak
      const streakAlpha = Math.sin(tick * 0.015 + seed * 1.3) * 0.08 + 0.08;
      ctx.fillStyle = `rgba(150,220,255,${streakAlpha})`;
      ctx.fillRect(x + 6, y + 6, S / 3, 3);

      // Soft border glow
      ctx.strokeStyle = `rgba(60,160,200,0.16)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, S - 2, S - 2);
      break;
    }

    case TILE.FOREST: {
      // Deep shadow ground
      ctx.fillStyle = '#0e160e';
      ctx.fillRect(x, y, S, S);

      // Tree canopy — layered
      ctx.fillStyle = '#1a2812';
      ctx.beginPath();
      ctx.arc(x + S / 2, y + S / 2, S / 2 - 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f1e0a';
      ctx.beginPath();
      ctx.arc(x + S / 2 - 4, y + S / 2 - 4, S / 3 + 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#162010';
      ctx.beginPath();
      ctx.arc(x + S / 2 + 3, y + S / 2 + 2, S / 4, 0, Math.PI * 2);
      ctx.fill();

      // Snow cap on tree
      ctx.fillStyle = 'rgba(150,185,210,0.28)';
      ctx.beginPath();
      ctx.arc(x + S / 2, y + S / 2 - 7, S / 4 - 1, 0, Math.PI * 2);
      ctx.fill();

      // Faint ambient occlusion ring at edge
      ctx.strokeStyle = 'rgba(5,8,5,0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, S, S);
      break;
    }

    case TILE.WALL: {
      // Dark stone blocks
      ctx.fillStyle = '#1c1818';
      ctx.fillRect(x, y, S, S);

      // Stone block pattern (2x2 grid offset per row)
      const offset = (r % 2) * (S / 2);
      ctx.fillStyle = '#252020';
      // Top-left block
      ctx.fillRect(x + offset % S, y + 2, S / 2 - 2, S / 2 - 2);
      // Top-right
      ctx.fillRect(x + (offset + S / 2) % S, y + 2, S / 2 - 2, S / 2 - 2);
      // Bottom-left
      ctx.fillRect(x + ((offset + S / 4) % S), y + S / 2 + 1, S / 2 - 2, S / 2 - 3);
      // Bottom-right  
      ctx.fillRect(x + ((offset + S * 3 / 4) % S), y + S / 2 + 1, S / 2 - 2, S / 2 - 3);

      // Mortar gaps
      ctx.strokeStyle = '#111010';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, S - 1, S - 1);
      ctx.beginPath();
      ctx.moveTo(x, y + S / 2); ctx.lineTo(x + S, y + S / 2);
      ctx.stroke();

      // Moss/lichen hint
      ctx.fillStyle = `rgba(20,30,15,${(seed % 10) * 0.03 + 0.05})`;
      ctx.fillRect(x + (seed % 10) + 2, y + (seed % 12) + 2, (seed % 8) + 4, (seed % 6) + 3);
      break;
    }

    case TILE.RUIN: {
      // Ruined stone floor
      ctx.fillStyle = '#1e1a18';
      ctx.fillRect(x, y, S, S);

      // Worn inner surface
      ctx.fillStyle = '#252018';
      ctx.fillRect(x + 3, y + 3, S - 6, S - 6);

      // Ruin crack — properly isolated
      ctx.strokeStyle = 'rgba(80,65,55,0.6)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const rx1 = x + (seed % 12) + 6;
      const ry1 = y + 4;
      const rx2 = x + ((seed >> 3) % 16) + 4;
      const ry2 = y + S / 2;
      const rx3 = x + ((seed >> 7) % 14) + 4;
      const ry3 = y + S - 5;
      ctx.moveTo(rx1, ry1);
      ctx.lineTo(rx2, ry2);
      ctx.lineTo(rx3, ry3);
      ctx.stroke();

      // Second crack
      if (seed % 3 === 0) {
        ctx.strokeStyle = 'rgba(60,50,40,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + ((seed >> 10) % 20) + 8);
        ctx.lineTo(x + S - 4, y + ((seed >> 14) % 20) + 8);
        ctx.stroke();
      }

      break;
    }

    case TILE.DUNGEON_FLOOR: {
      ctx.fillStyle = '#120d18';
      ctx.fillRect(x, y, S, S);

      // Stone tile
      ctx.fillStyle = '#18121f';
      ctx.fillRect(x + 2, y + 2, S - 4, S - 4);

      // Glowing runes
      const runeGlow = Math.sin(tick * 0.04 + seed * 0.5) * 0.2 + 0.25;
      const runeGlow2 = Math.sin(tick * 0.04 + seed * 0.5 + Math.PI) * 0.15 + 0.15;

      // Central rune glow
      const g = ctx.createRadialGradient(x + S / 2, y + S / 2, 0, x + S / 2, y + S / 2, S / 2);
      g.addColorStop(0, `rgba(120,40,200,${runeGlow})`);
      g.addColorStop(1, `rgba(80,20,140,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, S, S);

      // Small rune mark
      ctx.strokeStyle = `rgba(160,80,255,${runeGlow2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + S / 2, y + 8);
      ctx.lineTo(x + S / 2, y + S - 8);
      ctx.moveTo(x + 8, y + S / 2);
      ctx.lineTo(x + S - 8, y + S / 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(10,6,16,0.7)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, S - 1, S - 1);
      break;
    }

    case TILE.DUNGEON: {
      ctx.fillStyle = '#080510';
      ctx.fillRect(x, y, S, S);

      // Deep void circle
      ctx.fillStyle = '#0d0818';
      ctx.beginPath();
      ctx.arc(x + S / 2, y + S / 2, S / 2 - 1, 0, Math.PI * 2);
      ctx.fill();

      // Portal glow — pulsing
      const gateGlow = Math.sin(tick * 0.05) * 0.3 + 0.55;
      const pg = ctx.createRadialGradient(x + S / 2, y + S / 2, 2, x + S / 2, y + S / 2, S / 2 - 3);
      pg.addColorStop(0, `rgba(200,80,255,${gateGlow})`);
      pg.addColorStop(0.5, `rgba(120,20,200,${gateGlow * 0.6})`);
      pg.addColorStop(1, 'rgba(60,10,100,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(x + S / 2, y + S / 2, S / 2 - 3, 0, Math.PI * 2);
      ctx.fill();

      // Rotating particle ring
      const spinAngle = tick * 0.04;
      ctx.fillStyle = `rgba(220,120,255,${gateGlow * 0.8})`;
      for (let i = 0; i < 6; i++) {
        const a = spinAngle + (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + S / 2 + Math.cos(a) * 10, y + S / 2 + Math.sin(a) * 10, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center symbol
      ctx.fillStyle = `rgba(255,200,255,${gateGlow * 0.9})`;
      ctx.font = 'bold 14px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚔', x + S / 2, y + S / 2);
      break;
    }
  }
}
