// Minimap: a small top-right overview showing the player (and boss, if awake)
// as dots on a scaled-down map rectangle.
import { roundRect } from './utils';
import { MAP_W, MAP_H } from './constants';
import type { Player } from './player';
import type { Boss } from './boss';

export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  vpW: number,
  _vpH: number,
  player: Player,
  boss: Boss | null = null,
): void {
  const mmW = 100, mmH = 75;
  const mmX = vpW - mmW - 14;
  const mmY = 14;

  ctx.save();
  ctx.fillStyle = 'rgba(5,10,20,0.8)';
  roundRect(ctx, mmX - 2, mmY - 2, mmW + 4, mmH + 4, 4);
  ctx.fill();
  ctx.strokeStyle = '#334455';
  ctx.lineWidth = 1;
  roundRect(ctx, mmX - 2, mmY - 2, mmW + 4, mmH + 4, 4);
  ctx.stroke();

  // Boss position (if awake)
  if (boss && !boss.dead) {
    const bx = mmX + (boss.x / MAP_W) * mmW;
    const by = mmY + (boss.y / MAP_H) * mmH;
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player dot
  const px = mmX + (player.x / MAP_W) * mmW;
  const py = mmY + (player.y / MAP_H) * mmH;
  ctx.fillStyle = '#00ff88';
  ctx.beginPath();
  ctx.arc(px, py, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
