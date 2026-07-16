// Inventory panel: equipment slots + a stats/progression summary, shown while
// the player holds the inventory open.
import { Item } from './types';
import { RARITY_COLORS } from './constants';
import { roundRect } from './utils';
import type { Player } from './player';

export function renderInventory(
  ctx: CanvasRenderingContext2D,
  vpW: number,
  vpH: number,
  player: Player,
  droppedItems: Array<{ item: Item; x: number; y: number }>,
): void {
  const panelW = 360;
  const panelH = 340;
  const px = vpW / 2 - panelW / 2;
  const py = vpH / 2 - panelH / 2;

  // Overlay
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, vpW, vpH);

  // Panel
  ctx.fillStyle = '#0a0614';
  roundRect(ctx, px, py, panelW, panelH, 12);
  ctx.fill();
  ctx.strokeStyle = '#6622aa';
  ctx.lineWidth = 2;
  roundRect(ctx, px, py, panelW, panelH, 12);
  ctx.stroke();

  // Title
  ctx.fillStyle = '#cc88ff';
  ctx.font = 'bold 18px "Georgia", serif';
  ctx.textAlign = 'center';
  ctx.fillText('📦 INVENTARIO', vpW / 2, py + 28);

  // Close hint
  ctx.fillStyle = '#666666';
  ctx.font = '12px sans-serif';
  ctx.fillText('[TAB] Cerrar', vpW / 2, py + 46);

  // Equipment slots
  renderEquipSlot(ctx, px + 30, py + 60, 'ARMA', player.equippedWeapon, '⚔');
  renderEquipSlot(ctx, px + 190, py + 60, 'ARMADURA', player.equippedArmor, '🛡');

  // Divider
  ctx.strokeStyle = '#331155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 10, py + 180);
  ctx.lineTo(px + panelW - 10, py + 180);
  ctx.stroke();

  // Stats summary
  ctx.fillStyle = '#aaaaaa';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  const statLines = [
    `Nivel: ${player.level}   XP: ${player.xp} / ${player.xpToNext}`,
    `Daño total: ${player.totalDamage}   Defensa total: ${player.totalDefense}`,
    `Crítico: ${Math.round(player.totalCrit * 100)}%   Velocidad: ${Math.round(player.stats.speed)}`,
    `Kills: ${player.kills}   Tiempo: ${player.getElapsedSeconds()}s`,
  ];
  statLines.forEach((l, i) => {
    ctx.fillText(l, px + 18, py + 198 + i * 22);
  });

  // Ground items hint
  const nearCount = droppedItems.length;
  if (nearCount > 0) {
    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${nearCount} objeto(s) en el suelo — acércate para recoger`, vpW / 2, py + panelH - 18);
  }
}

function renderEquipSlot(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  label: string,
  item: Item | null,
  icon: string,
): void {
  const W = 140, H = 110;

  ctx.fillStyle = 'rgba(30,10,50,0.9)';
  roundRect(ctx, x, y, W, H, 8);
  ctx.fill();
  ctx.strokeStyle = item ? RARITY_COLORS[item.rarity] : '#441166';
  ctx.lineWidth = item ? 2 : 1;
  roundRect(ctx, x, y, W, H, 8);
  ctx.stroke();

  ctx.fillStyle = '#cc88ff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + W / 2, y + 14);

  if (item) {
    const rarColor = RARITY_COLORS[item.rarity];
    ctx.fillStyle = rarColor;
    ctx.font = '28px serif';
    ctx.fillText(icon, x + W / 2, y + 46);

    ctx.fillStyle = rarColor;
    ctx.font = 'bold 10px sans-serif';
    const nameLines = item.name.length > 18 ? [item.name.slice(0, 18), item.name.slice(18)] : [item.name];
    nameLines.forEach((nl, i) => ctx.fillText(nl, x + W / 2, y + 60 + i * 13));

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '10px sans-serif';
    const stats: string[] = [];
    if (item.damage != null) stats.push(`+${item.damage} daño`);
    if (item.defense != null) stats.push(`+${item.defense} def`);
    if (item.critChance != null) stats.push(`+${Math.round(item.critChance * 100)}% crit`);
    stats.forEach((s, i) => ctx.fillText(s, x + W / 2, y + H - 28 + i * 14));
  } else {
    ctx.fillStyle = '#444444';
    ctx.font = '32px serif';
    ctx.fillText(icon, x + W / 2, y + 60);
    ctx.fillStyle = '#444444';
    ctx.font = '11px sans-serif';
    ctx.fillText('Vacío', x + W / 2, y + H - 16);
  }
}
