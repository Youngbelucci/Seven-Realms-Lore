// Camera: a smoothed follow camera clamped to the map bounds. State (camX/camY)
// lives on the engine so the many world-to-screen conversions stay terse.
import { clamp } from './utils';
import { MAP_W, MAP_H } from './constants';
import type { GameEngine } from './engine';

export function updateCamera(g: GameEngine): void {
  const vpW = g.canvas.width;
  const vpH = g.canvas.height;
  const targetX = g.player.x - vpW / 2;
  const targetY = g.player.y - vpH / 2;
  g.camX += (targetX - g.camX) * 0.12;
  g.camY += (targetY - g.camY) * 0.12;
  g.camX = clamp(g.camX, 0, MAP_W - vpW);
  g.camY = clamp(g.camY, 0, MAP_H - vpH);
}
