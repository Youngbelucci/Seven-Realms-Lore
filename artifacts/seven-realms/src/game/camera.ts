import { clamp, randRange } from './utils';
import { MAP_W, MAP_H } from './constants';
import type { GameEngine } from './engine';

export function addCameraShake(g: GameEngine, strength: number, frames = 10): void {
  g.cameraShakeStrength = Math.max(g.cameraShakeStrength, strength);
  g.cameraShakeFrames = Math.max(g.cameraShakeFrames, frames);
}

export function updateCamera(g: GameEngine): void {
  const vpW = g.canvas.width;
  const vpH = g.canvas.height;
  const lookAhead = 34;
  const targetX = g.player.x - vpW / 2 + Math.cos(g.player.facing) * lookAhead;
  const targetY = g.player.y - vpH / 2 + Math.sin(g.player.facing) * lookAhead;

  g.baseCamX += (targetX - g.baseCamX) * 0.105;
  g.baseCamY += (targetY - g.baseCamY) * 0.105;
  g.baseCamX = clamp(g.baseCamX, 0, Math.max(0, MAP_W - vpW));
  g.baseCamY = clamp(g.baseCamY, 0, Math.max(0, MAP_H - vpH));

  let shakeX = 0;
  let shakeY = 0;
  if (g.cameraShakeFrames > 0) {
    const falloff = g.cameraShakeFrames / Math.max(1, g.cameraShakeMaxFrames);
    const strength = g.cameraShakeStrength * falloff;
    shakeX = randRange(-strength, strength);
    shakeY = randRange(-strength, strength);
    g.cameraShakeFrames--;
    if (g.cameraShakeFrames <= 0) g.cameraShakeStrength = 0;
  }

  g.camX = clamp(g.baseCamX + shakeX, 0, Math.max(0, MAP_W - vpW));
  g.camY = clamp(g.baseCamY + shakeY, 0, Math.max(0, MAP_H - vpH));
}
