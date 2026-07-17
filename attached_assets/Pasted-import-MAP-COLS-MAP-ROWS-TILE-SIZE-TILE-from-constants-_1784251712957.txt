import { MAP_COLS, MAP_ROWS, TILE_SIZE, TILE } from './constants';
import type { TileGrid } from './world';

export type DecorationType =
  | 'deadTree'
  | 'rock'
  | 'iceCrystal'
  | 'bones'
  | 'brokenWood'
  | 'snowBush';

export interface WorldDecoration {
  x: number;
  y: number;
  width: number;
  height: number;
  type: DecorationType;
  seed: number;
  blocksMovement: boolean;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function isDecorationTile(tile: number): boolean {
  return (
    tile === TILE.SNOW ||
    tile === TILE.SNOW2 ||
    tile === TILE.SNOW3 ||
    tile === TILE.ICE ||
    tile === TILE.RUIN
  );
}

function decorationDimensions(type: DecorationType): {
  width: number;
  height: number;
  blocksMovement: boolean;
} {
  switch (type) {
    case 'deadTree':
      return {
        width: 34,
        height: 72,
        blocksMovement: true,
      };

    case 'rock':
      return {
        width: 32,
        height: 26,
        blocksMovement: true,
      };

    case 'iceCrystal':
      return {
        width: 30,
        height: 48,
        blocksMovement: true,
      };

    case 'bones':
      return {
        width: 35,
        height: 18,
        blocksMovement: false,
      };

    case 'brokenWood':
      return {
        width: 42,
        height: 22,
        blocksMovement: false,
      };

    case 'snowBush':
      return {
        width: 30,
        height: 28,
        blocksMovement: false,
      };
  }
}

function selectDecorationType(
  tile: number,
  random: () => number,
): DecorationType {
  const value = random();

  if (tile === TILE.ICE) {
    if (value < 0.58) return 'iceCrystal';
    if (value < 0.82) return 'rock';
    return 'bones';
  }

  if (tile === TILE.RUIN) {
    if (value < 0.35) return 'brokenWood';
    if (value < 0.65) return 'bones';
    if (value < 0.85) return 'rock';
    return 'deadTree';
  }

  if (value < 0.25) return 'deadTree';
  if (value < 0.50) return 'rock';
  if (value < 0.68) return 'snowBush';
  if (value < 0.84) return 'bones';

  return 'brokenWood';
}

export function generateDecorations(
  grid: TileGrid,
  seed = 7821,
): WorldDecoration[] {
  const random = seededRandom(seed);
  const decorations: WorldDecoration[] = [];

  for (let row = 3; row < MAP_ROWS - 3; row++) {
    for (let column = 3; column < MAP_COLS - 3; column++) {
      const tile = grid[row]?.[column];

      if (!isDecorationTile(tile)) {
        continue;
      }

      /*
       * Lower this number for fewer decorations.
       * Raise it for a denser world.
       */
      let spawnChance = 0.075;

      if (tile === TILE.RUIN) {
        spawnChance = 0.13;
      }

      if (tile === TILE.ICE) {
        spawnChance = 0.1;
      }

      if (random() > spawnChance) {
        continue;
      }

      const type = selectDecorationType(tile, random);
      const dimensions = decorationDimensions(type);

      const centerX = column * TILE_SIZE + TILE_SIZE / 2;
      const centerY = row * TILE_SIZE + TILE_SIZE / 2;

      const offsetX = (random() - 0.5) * TILE_SIZE * 0.55;
      const offsetY = (random() - 0.5) * TILE_SIZE * 0.45;

      decorations.push({
        x: centerX + offsetX,
        y: centerY + offsetY,
        width: dimensions.width,
        height: dimensions.height,
        blocksMovement: dimensions.blocksMovement,
        type,
        seed: Math.floor(random() * 100000),
      });
    }
  }

  return decorations;
}

export function drawDecorationShadow(
  ctx: CanvasRenderingContext2D,
  decoration: WorldDecoration,
  camX: number,
  camY: number,
): void {
  const screenX = decoration.x - camX;
  const screenY = decoration.y - camY;

  const shadowWidth =
    decoration.type === 'deadTree'
      ? decoration.width * 0.8
      : decoration.width * 0.65;

  const shadowHeight =
    decoration.type === 'deadTree'
      ? 8
      : 6;

  ctx.save();

  const gradient = ctx.createRadialGradient(
    screenX,
    screenY,
    0,
    screenX,
    screenY,
    shadowWidth,
  );

  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.ellipse(
    screenX,
    screenY,
    shadowWidth,
    shadowHeight,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.restore();
}

export function drawDecoration(
  ctx: CanvasRenderingContext2D,
  decoration: WorldDecoration,
  camX: number,
  camY: number,
  tick: number,
): void {
  const screenX = decoration.x - camX;
  const screenY = decoration.y - camY;

  ctx.save();
  ctx.translate(screenX, screenY);

  switch (decoration.type) {
    case 'deadTree':
      drawDeadTree(ctx, decoration);
      break;

    case 'rock':
      drawRock(ctx, decoration);
      break;

    case 'iceCrystal':
      drawIceCrystal(ctx, decoration, tick);
      break;

    case 'bones':
      drawBones(ctx, decoration);
      break;

    case 'brokenWood':
      drawBrokenWood(ctx, decoration);
      break;

    case 'snowBush':
      drawSnowBush(ctx, decoration);
      break;
  }

  ctx.restore();
}

function drawDeadTree(
  ctx: CanvasRenderingContext2D,
  decoration: WorldDecoration,
): void {
  const variation = decoration.seed % 5;
  const lean = (variation - 2) * 0.035;

  ctx.rotate(lean);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Trunk outline
  ctx.strokeStyle = '#171310';
  ctx.lineWidth = 13;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-2, -42);
  ctx.lineTo(2, -65);
  ctx.stroke();

  // Main trunk
  ctx.strokeStyle = '#382a20';
  ctx.lineWidth = 8;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-2, -42);
  ctx.lineTo(2, -65);
  ctx.stroke();

  // Trunk highlight
  ctx.strokeStyle = 'rgba(110, 90, 70, 0.45)';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-2, -3);
  ctx.lineTo(-4, -40);
  ctx.lineTo(0, -61);
  ctx.stroke();

  // Left branch
  ctx.strokeStyle = '#201813';
  ctx.lineWidth = 7;

  ctx.beginPath();
  ctx.moveTo(-2, -35);
  ctx.lineTo(-18, -49);
  ctx.lineTo(-25, -57);
  ctx.stroke();

  ctx.strokeStyle = '#463329';
  ctx.lineWidth = 4;

  ctx.beginPath();
  ctx.moveTo(-2, -35);
  ctx.lineTo(-18, -49);
  ctx.lineTo(-25, -57);
  ctx.stroke();

  // Right branch
  ctx.strokeStyle = '#201813';
  ctx.lineWidth = 7;

  ctx.beginPath();
  ctx.moveTo(0, -47);
  ctx.lineTo(17, -56);
  ctx.lineTo(24, -67);
  ctx.stroke();

  ctx.strokeStyle = '#463329';
  ctx.lineWidth = 4;

  ctx.beginPath();
  ctx.moveTo(0, -47);
  ctx.lineTo(17, -56);
  ctx.lineTo(24, -67);
  ctx.stroke();

  // Snow on branches
  ctx.strokeStyle = 'rgba(195, 220, 240, 0.75)';
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(-5, -38);
  ctx.lineTo(-18, -50);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(2, -49);
  ctx.lineTo(17, -58);
  ctx.stroke();

  // Snow around base
  ctx.fillStyle = 'rgba(155, 185, 210, 0.65)';

  ctx.beginPath();
  ctx.ellipse(0, 1, 15, 6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  decoration: WorldDecoration,
): void {
  const variation = decoration.seed % 4;
  const width = decoration.width + variation * 2;
  const height = decoration.height;

  const gradient = ctx.createLinearGradient(
    -width / 2,
    -height,
    width / 2,
    0,
  );

  gradient.addColorStop(0, '#536477');
  gradient.addColorStop(0.45, '#374554');
  gradient.addColorStop(1, '#1b222b');

  ctx.fillStyle = gradient;
  ctx.strokeStyle = '#151a20';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-width / 2, 0);
  ctx.lineTo(-width * 0.4, -height * 0.65);
  ctx.lineTo(-width * 0.1, -height);
  ctx.lineTo(width * 0.34, -height * 0.78);
  ctx.lineTo(width / 2, -height * 0.25);
  ctx.lineTo(width * 0.35, 0);
  ctx.closePath();

  ctx.fill();
  ctx.stroke();

  // Snow cap
  ctx.fillStyle = 'rgba(190, 215, 235, 0.7)';

  ctx.beginPath();
  ctx.moveTo(-width * 0.38, -height * 0.62);
  ctx.lineTo(-width * 0.08, -height * 0.94);
  ctx.lineTo(width * 0.28, -height * 0.74);
  ctx.lineTo(width * 0.15, -height * 0.58);
  ctx.lineTo(-width * 0.14, -height * 0.7);
  ctx.closePath();
  ctx.fill();

  // Crack
  ctx.strokeStyle = 'rgba(20, 25, 30, 0.7)';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(2, -height * 0.65);
  ctx.lineTo(-2, -height * 0.38);
  ctx.lineTo(4, -height * 0.2);
  ctx.stroke();
}

function drawIceCrystal(
  ctx: CanvasRenderingContext2D,
  decoration: WorldDecoration,
  tick: number,
): void {
  const pulse =
    0.72 +
    Math.sin(tick * 0.035 + decoration.seed) * 0.16;

  ctx.save();

  ctx.shadowColor = `rgba(65, 210, 255, ${pulse})`;
  ctx.shadowBlur = 12;

  const crystalGradient = ctx.createLinearGradient(0, -48, 0, 0);

  crystalGradient.addColorStop(0, '#d9fbff');
  crystalGradient.addColorStop(0.35, '#58d9f4');
  crystalGradient.addColorStop(1, '#146a8d');

  ctx.fillStyle = crystalGradient;
  ctx.strokeStyle = 'rgba(195, 245, 255, 0.8)';
  ctx.lineWidth = 1.5;

  // Main crystal
  ctx.beginPath();
  ctx.moveTo(0, -48);
  ctx.lineTo(11, -13);
  ctx.lineTo(7, 0);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-11, -15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Left crystal
  ctx.beginPath();
  ctx.moveTo(-9, -32);
  ctx.lineTo(-17, -9);
  ctx.lineTo(-12, 0);
  ctx.lineTo(-4, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Right crystal
  ctx.beginPath();
  ctx.moveTo(11, -27);
  ctx.lineTo(19, -8);
  ctx.lineTo(13, 0);
  ctx.lineTo(6, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  // Light on the ground
  const floorGlow = ctx.createRadialGradient(
    0,
    0,
    2,
    0,
    0,
    28,
  );

  floorGlow.addColorStop(
    0,
    `rgba(55, 210, 255, ${pulse * 0.32})`,
  );
  floorGlow.addColorStop(1, 'rgba(20, 130, 190, 0)');

  ctx.fillStyle = floorGlow;

  ctx.beginPath();
  ctx.ellipse(0, 1, 29, 11, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBones(
  ctx: CanvasRenderingContext2D,
  decoration: WorldDecoration,
): void {
  const rotation =
    ((decoration.seed % 100) / 100 - 0.5) * 0.7;

  ctx.rotate(rotation);

  ctx.strokeStyle = '#c4c0ab';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.lineTo(13, -9);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-10, -11);
  ctx.lineTo(11, 1);
  ctx.stroke();

  ctx.fillStyle = '#d3ceb8';

  const boneEnds = [
    [-15, -2],
    [14, -9],
    [-11, -11],
    [12, 1],
  ];

  for (const [x, y] of boneEnds) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Small skull
  ctx.fillStyle = '#aaa692';
  ctx.strokeStyle = '#696656';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.ellipse(1, -9, 7, 6, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#24272c';

  ctx.beginPath();
  ctx.arc(-1.5, -10, 1.5, 0, Math.PI * 2);
  ctx.arc(3, -10, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBrokenWood(
  ctx: CanvasRenderingContext2D,
  decoration: WorldDecoration,
): void {
  const rotation =
    ((decoration.seed % 100) / 100 - 0.5) * 0.9;

  ctx.rotate(rotation);

  ctx.fillStyle = '#3b271c';
  ctx.strokeStyle = '#17100c';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-20, -7);
  ctx.lineTo(19, -4);
  ctx.lineTo(16, 5);
  ctx.lineTo(-18, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#5a3926';

  ctx.fillRect(-15, -4, 25, 3);

  // Broken point
  ctx.fillStyle = '#2d1c13';

  ctx.beginPath();
  ctx.moveTo(16, -4);
  ctx.lineTo(24, 0);
  ctx.lineTo(16, 5);
  ctx.closePath();
  ctx.fill();

  // Snow
  ctx.fillStyle = 'rgba(188, 212, 232, 0.56)';
  ctx.fillRect(-16, -8, 24, 3);
}

function drawSnowBush(
  ctx: CanvasRenderingContext2D,
  decoration: WorldDecoration,
): void {
  const sway =
    Math.sin(Date.now() * 0.001 + decoration.seed) * 0.035;

  ctx.rotate(sway);

  ctx.strokeStyle = '#25352c';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  const branches = [
    [-2, 0, -12, -19],
    [1, 0, 2, -25],
    [4, 0, 14, -18],
    [-3, -5, -16, -11],
    [3, -6, 16, -10],
  ];

  for (const [x1, y1, x2, y2] of branches) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(174, 207, 229, 0.8)';

  ctx.beginPath();
  ctx.ellipse(-10, -15, 8, 4, -0.25, 0, Math.PI * 2);
  ctx.ellipse(2, -21, 9, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(12, -14, 8, 4, 0.25, 0, Math.PI * 2);
  ctx.fill();
}

export function decorationIsVisible(
  decoration: WorldDecoration,
  camX: number,
  camY: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const padding = 100;

  const screenX = decoration.x - camX;
  const screenY = decoration.y - camY;

  return (
    screenX > -padding &&
    screenX < viewportWidth + padding &&
    screenY > -padding &&
    screenY < viewportHeight + padding
  );
}