import { SkillDef, FloatingNumber, Particle, LevelUpNotice, Item } from './types';
import { getSkillCooldownFraction } from './skills';
import { DAMAGE_COLORS, RARITY_COLORS } from './constants';
import type { Player } from './player';
import type { Boss } from './boss';

export function renderHUD(
  ctx: CanvasRenderingContext2D,
  vpW: number,
  vpH: number,
  player: Player,
  boss: Boss | null,
  floaters: FloatingNumber[],
  particles: Particle[],
  levelUpNotices: LevelUpNotice[],
  inventoryOpen: boolean
): void {
  // Floating damage numbers
  for (const f of floaters) {
    ctx.save();
    ctx.globalAlpha = f.alpha;
    const color = DAMAGE_COLORS[f.damageType] ?? '#ffffff';
    ctx.fillStyle = f.isCrit ? '#ffdd00' : color;
    ctx.font = f.isCrit ? `bold ${22 + Math.floor((f.maxLife - f.life) * 0.3)}px 'Georgia', serif` : 'bold 15px "Georgia", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (f.isCrit) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillText(`⚡${f.value}`, f.x, f.y);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillText(f.text ?? String(f.value), f.x, f.y);
    }
    ctx.restore();
  }

  // Particles
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0, p.size * (p.life / p.maxLife)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // HP bar
  const barW = 200;
  const barH = 20;
  const barX = 14;
  const barY = vpH - 100;

  drawBar(ctx, barX, barY, barW, barH, player.stats.hp / player.stats.maxHp, '#cc2222', '#440808', '#880808', 'HP');

  // Energy bar
  const ebarY = barY + 28;
  drawBar(ctx, barX, ebarY, barW, barH, player.stats.energy / player.stats.maxEnergy, '#2266cc', '#081844', '#083088', 'Energía');

  // XP bar (thin)
  const xpY = ebarY + 26;
  drawBar(ctx, barX, xpY, barW, 8, player.xp / player.xpToNext, '#8844dd', '#220033', '#441166', '');

  // Level badge
  ctx.save();
  ctx.fillStyle = '#1a0a2a';
  roundRect(ctx, barX, vpH - 148, 44, 40, 8);
  ctx.fill();
  ctx.strokeStyle = '#8844dd';
  ctx.lineWidth = 2;
  roundRect(ctx, barX, vpH - 148, 44, 40, 8);
  ctx.stroke();
  ctx.fillStyle = '#ddaaff';
  ctx.font = 'bold 11px "Georgia", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NIV', barX + 22, vpH - 140);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px "Georgia", serif';
  ctx.fillText(String(player.level), barX + 22, vpH - 122);
  ctx.restore();

  // HP / Energy numbers
  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffbbbb';
  ctx.fillText(`${Math.ceil(player.stats.hp)}/${player.stats.maxHp}`, barX + barW, barY + barH / 2);
  ctx.fillStyle = '#aabbff';
  ctx.fillText(`${Math.ceil(player.stats.energy)}/${player.stats.maxEnergy}`, barX + barW, ebarY + barH / 2);
  ctx.restore();

  // Skill hotbar
  renderSkillBar(ctx, vpW, vpH, player.skills);

  // Boss health bar
  if (boss && !boss.dead) {
    renderBossBar(ctx, vpW, boss);
  }

  // Level up notices
  for (const notice of levelUpNotices) {
    ctx.save();
    ctx.globalAlpha = notice.alpha;
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px "Georgia", serif';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`¡NIVEL ${notice.level}!`, vpW / 2, vpH / 2 - 80);
    ctx.shadowBlur = 0;
    ctx.font = '18px "Georgia", serif';
    ctx.fillStyle = '#ffee88';
    ctx.fillText('¡Estadísticas aumentadas!', vpW / 2, vpH / 2 - 48);
    ctx.restore();
  }

  // Shield indicator
  if (player.shieldActive) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.globalAlpha = 0.9 + Math.sin(Date.now() * 0.01) * 0.1;
    ctx.fillText('🛡 ESCUDO ACTIVO', barX, barY - 20);
    ctx.restore();
  }

  // Minimap
  renderMinimap(ctx, vpW, vpH, player);

  // Stats panel (top-right)
  renderStatsPanel(ctx, vpW, player);

  // Inventory hint
  if (!inventoryOpen) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('[TAB] Inventario  [Space/Click] Atacar  [Q/E/R/F] Habilidades', vpW / 2, vpH - 14);
    ctx.restore();
  }
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  frac: number,
  fillColor: string, bgColor: string, borderColor: string,
  label: string
): void {
  ctx.save();
  // Background
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  // Fill
  if (frac > 0) {
    ctx.fillStyle = fillColor;
    roundRect(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2);
    ctx.fill();
  }
  // Border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.stroke();
  // Label
  if (label) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 8, y + h / 2);
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function renderSkillBar(ctx: CanvasRenderingContext2D, vpW: number, vpH: number, skills: SkillDef[]): void {
  const now = Date.now();
  const slotSize = 56;
  const gap = 8;
  const totalW = skills.length * slotSize + (skills.length - 1) * gap;
  const startX = vpW / 2 - totalW / 2;
  const startY = vpH - 80;

  for (let i = 0; i < skills.length; i++) {
    const sk = skills[i];
    const x = startX + i * (slotSize + gap);
    const y = startY;
    const frac = getSkillCooldownFraction(sk, now);
    const ready = frac >= 1;

    // Slot background
    ctx.fillStyle = ready ? 'rgba(20,10,30,0.88)' : 'rgba(10,5,15,0.88)';
    roundRect(ctx, x, y, slotSize, slotSize, 8);
    ctx.fill();
    ctx.strokeStyle = ready ? sk.color : '#333333';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, slotSize, slotSize, 8);
    ctx.stroke();

    // Cooldown pie overlay
    if (!ready) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.moveTo(x + slotSize / 2, y + slotSize / 2);
      ctx.arc(x + slotSize / 2, y + slotSize / 2, slotSize / 2, -Math.PI / 2, -Math.PI / 2 + (1 - frac) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Skill icon / name
    ctx.save();
    ctx.fillStyle = ready ? '#ffffff' : '#666666';
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sk.icon, x + slotSize / 2, y + slotSize / 2 - 6);
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = ready ? sk.color : '#555555';
    ctx.fillText(sk.key, x + slotSize / 2, y + slotSize - 8);
    ctx.restore();

    // Name tooltip on hover (we'll just show name below)
    ctx.save();
    ctx.fillStyle = '#888888';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sk.name.substring(0, 10), x + slotSize / 2, y + slotSize + 12);
    ctx.restore();
  }
}

function renderBossBar(ctx: CanvasRenderingContext2D, vpW: number, boss: Boss): void {
  const barW = Math.min(500, vpW * 0.55);
  const barH = 26;
  const bx = vpW / 2 - barW / 2;
  const by = 16;
  const frac = Math.max(0, boss.stats.hp / boss.stats.maxHp);

  // Background panel
  ctx.fillStyle = 'rgba(8,3,15,0.9)';
  roundRect(ctx, bx - 10, by - 6, barW + 20, barH + 32, 8);
  ctx.fill();
  ctx.strokeStyle = '#4a1a6a';
  ctx.lineWidth = 2;
  roundRect(ctx, bx - 10, by - 6, barW + 20, barH + 32, 8);
  ctx.stroke();

  // Name
  ctx.save();
  ctx.fillStyle = '#cc88ff';
  ctx.font = 'bold 13px "Georgia", serif';
  ctx.textAlign = 'center';
  ctx.fillText('👑 El Guardián del Hielo', vpW / 2, by + 8);
  ctx.restore();

  // Bar background
  ctx.fillStyle = '#220033';
  roundRect(ctx, bx, by + 16, barW, barH - 8, 4);
  ctx.fill();

  // Bar fill (gradient by HP)
  if (frac > 0) {
    const gradient = ctx.createLinearGradient(bx, 0, bx + barW * frac, 0);
    gradient.addColorStop(0, boss.getPhase() === 3 ? '#aa00ff' : boss.getPhase() === 2 ? '#0044ff' : '#0088ff');
    gradient.addColorStop(1, boss.getPhase() === 3 ? '#ff44ff' : boss.getPhase() === 2 ? '#44aaff' : '#88ddff');
    ctx.fillStyle = gradient;
    roundRect(ctx, bx, by + 16, barW * frac, barH - 8, 4);
    ctx.fill();
  }

  // Phase markers
  const p2x = bx + barW * (boss.stats.maxHp - 1200) / boss.stats.maxHp;
  const p3x = bx + barW * (boss.stats.maxHp - 600) / boss.stats.maxHp;
  ctx.strokeStyle = '#ffffff44';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p2x, by + 14); ctx.lineTo(p2x, by + barH + 8);
  ctx.moveTo(p3x, by + 14); ctx.lineTo(p3x, by + barH + 8);
  ctx.stroke();

  // Bar border
  ctx.strokeStyle = '#6622aa';
  ctx.lineWidth = 1.5;
  roundRect(ctx, bx, by + 16, barW, barH - 8, 4);
  ctx.stroke();

  // HP numbers
  ctx.save();
  ctx.fillStyle = '#ddbbff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.ceil(boss.stats.hp)} / ${boss.stats.maxHp}  [Fase ${boss.getPhase()}]`, vpW / 2, by + 16 + (barH - 8) / 2 + 1);
  ctx.restore();
}

function renderMinimap(ctx: CanvasRenderingContext2D, vpW: number, vpH: number, player: Player): void {
  const mmW = 100, mmH = 75;
  const mmX = vpW - mmW - 14;
  const mmY = 14;
  const mapW = 40 * 48, mapH = 30 * 48;

  ctx.save();
  ctx.fillStyle = 'rgba(5,10,20,0.8)';
  roundRect(ctx, mmX - 2, mmY - 2, mmW + 4, mmH + 4, 4);
  ctx.fill();
  ctx.strokeStyle = '#334455';
  ctx.lineWidth = 1;
  roundRect(ctx, mmX - 2, mmY - 2, mmW + 4, mmH + 4, 4);
  ctx.stroke();

  // Player dot
  const px = mmX + (player.x / mapW) * mmW;
  const py = mmY + (player.y / mapH) * mmH;
  ctx.fillStyle = '#00ff88';
  ctx.beginPath();
  ctx.arc(px, py, 3, 0, Math.PI * 2);
  ctx.fill();

  // Boss position (if exists)
  ctx.restore();
}

function renderStatsPanel(ctx: CanvasRenderingContext2D, vpW: number, player: Player): void {
  ctx.save();
  ctx.fillStyle = 'rgba(8,5,16,0.82)';
  roundRect(ctx, vpW - 130, 100, 120, 90, 6);
  ctx.fill();
  ctx.strokeStyle = '#334';
  ctx.lineWidth = 1;
  roundRect(ctx, vpW - 130, 100, 120, 90, 6);
  ctx.stroke();

  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';

  const lines = [
    { label: '⚔ Daño', val: `${player.totalDamage}`, color: '#ff8888' },
    { label: '🛡 Defensa', val: `${player.totalDefense}`, color: '#88aaff' },
    { label: '💎 Crítico', val: `${Math.round(player.totalCrit * 100)}%`, color: '#ffdd44' },
    { label: '💀 Kills', val: `${player.kills}`, color: '#cc88ff' },
  ];

  lines.forEach((l, i) => {
    ctx.fillStyle = '#888888';
    ctx.fillText(l.label, vpW - 124, 116 + i * 20);
    ctx.fillStyle = l.color;
    ctx.textAlign = 'right';
    ctx.fillText(l.val, vpW - 18, 116 + i * 20);
    ctx.textAlign = 'left';
  });
  ctx.restore();
}

export function renderInventory(
  ctx: CanvasRenderingContext2D,
  vpW: number,
  vpH: number,
  player: Player,
  droppedItems: Array<{ item: Item; x: number; y: number }>
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
  icon: string
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
