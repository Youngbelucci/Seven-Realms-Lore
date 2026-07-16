import { SkillDef, FloatingNumber, Particle, LevelUpNotice } from './types';
import { getSkillCooldownFraction } from './skills';
import { DAMAGE_COLORS } from './constants';
import { roundRect } from './utils';
import { renderMinimap } from './minimap';
import type { BestRecord } from './save';
import type { Player } from './player';
import type { Boss } from './boss';

export { renderInventory } from './inventory';

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

  // Bottom-left HUD panel background
  const barW = 210;
  const barH = 18;
  const barX = 60;
  const panelX = 8;
  const panelY = vpH - 115;
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,18,0.82)';
  roundRect(ctx, panelX, panelY, barW + 58, 104, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,80,120,0.5)';
  ctx.lineWidth = 1;
  roundRect(ctx, panelX, panelY, barW + 58, 104, 10);
  ctx.stroke();
  ctx.restore();

  const barY = vpH - 98;
  drawBarGradient(ctx, barX, barY, barW, barH,
    player.stats.hp / player.stats.maxHp,
    '#ff1a1a', '#cc0000', '#7a0000', 'HP',
    `${Math.ceil(player.stats.hp)}/${player.stats.maxHp}`);

  const ebarY = barY + 26;
  drawBarGradient(ctx, barX, ebarY, barW, barH,
    player.stats.energy / player.stats.maxEnergy,
    '#4488ff', '#1155cc', '#082266', 'EN',
    `${Math.ceil(player.stats.energy)}/${player.stats.maxEnergy}`);

  // XP bar (thin, below energy)
  const xpY = ebarY + 24;
  ctx.save();
  ctx.fillStyle = 'rgba(30,10,50,0.8)';
  roundRect(ctx, barX, xpY, barW, 7, 3);
  ctx.fill();
  const xpFrac = Math.min(1, player.xp / player.xpToNext);
  if (xpFrac > 0) {
    const xpGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    xpGrad.addColorStop(0, '#6622cc');
    xpGrad.addColorStop(1, '#cc44ff');
    ctx.fillStyle = xpGrad;
    roundRect(ctx, barX, xpY, barW * xpFrac, 7, 3);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(130,60,200,0.6)';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`XP ${player.xp}/${player.xpToNext}`, barX + 4, xpY + 3);
  ctx.restore();

  // Level badge
  ctx.save();
  const lvlGrad = ctx.createLinearGradient(panelX + 4, panelY + 4, panelX + 4, panelY + 95);
  lvlGrad.addColorStop(0, '#1e0838');
  lvlGrad.addColorStop(1, '#0e0420');
  ctx.fillStyle = lvlGrad;
  roundRect(ctx, panelX + 4, panelY + 4, 48, 95, 8);
  ctx.fill();
  ctx.strokeStyle = '#6622aa';
  ctx.lineWidth = 1.5;
  roundRect(ctx, panelX + 4, panelY + 4, 48, 95, 8);
  ctx.stroke();
  // Star icon
  ctx.fillStyle = '#9944dd';
  ctx.font = '18px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', panelX + 28, panelY + 28);
  ctx.fillStyle = '#bbaaff';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('NIV', panelX + 28, panelY + 48);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${player.level >= 10 ? '16' : '20'}px "Georgia", serif`;
  ctx.shadowColor = '#aa44ff';
  ctx.shadowBlur = 8;
  ctx.fillText(String(player.level), panelX + 28, panelY + 68);
  ctx.shadowBlur = 0;
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
  renderMinimap(ctx, vpW, vpH, player, boss);

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

function drawBarGradient(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  frac: number,
  fillColorA: string, fillColorB: string, bgColor: string,
  label: string, valueText: string
): void {
  ctx.save();
  const r = h / 2;

  // Background
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  // Filled portion with gradient
  const filled = Math.max(h, w * Math.min(1, frac));
  if (frac > 0) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, fillColorA);
    grad.addColorStop(1, fillColorB);
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, filled, h, r);
    ctx.fill();

    // Shine streak on top third
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, x, y, filled, Math.ceil(h / 3), r);
    ctx.fill();
  }

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();

  // Label (left)
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `bold ${h - 5}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 6, y + h / 2);

  // Value (right)
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `${h - 6}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(valueText, x + w - 4, y + h / 2);

  ctx.restore();
}

export interface SlotRect { x: number; y: number; w: number; h: number; }

// Shared layout so rendering and touch hit-testing stay in sync.
export function getSkillSlotRects(vpW: number, vpH: number, count: number): SlotRect[] {
  const slotSize = 56;
  const gap = 8;
  const totalW = count * slotSize + (count - 1) * gap;
  const startX = vpW / 2 - totalW / 2;
  const startY = vpH - 80;
  const rects: SlotRect[] = [];
  for (let i = 0; i < count; i++) {
    rects.push({ x: startX + i * (slotSize + gap), y: startY, w: slotSize, h: slotSize });
  }
  return rects;
}

function renderSkillBar(ctx: CanvasRenderingContext2D, vpW: number, vpH: number, skills: SkillDef[]): void {
  const now = Date.now();
  const slotSize = 56;
  const rects = getSkillSlotRects(vpW, vpH, skills.length);

  for (let i = 0; i < skills.length; i++) {
    const sk = skills[i];
    const x = rects[i].x;
    const y = rects[i].y;
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

// --- Dungeon hint & end screens ------------------------------------------

export function renderDungeonHint(ctx: CanvasRenderingContext2D, sx: number, sy: number, tick: number, kills: number): void {
  const pulse = Math.sin(tick * 0.05) * 0.3 + 0.7;
  ctx.save();
  ctx.globalAlpha = pulse * 0.7;
  ctx.fillStyle = '#cc44ff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⚠ Mata 15 enemigos para despertar al Guardián', sx, sy - 55);
  ctx.fillText(`Kills: ${kills}/15`, sx, sy - 38);
  ctx.restore();
}

function drawBestRecord(ctx: CanvasRenderingContext2D, cx: number, y: number, best: BestRecord): void {
  if (best.runs <= 0) return;
  ctx.fillStyle = '#8899bb';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `Mejor: Nivel ${best.bestLevel} · ${best.bestKills} kills · ${best.bestTimeSeconds}s  (${best.runs} partidas)`,
    cx, y,
  );
}

export function renderGameOver(
  ctx: CanvasRenderingContext2D,
  vpW: number, vpH: number,
  alpha: number,
  runStats: { kills: number; level: number; time: number },
  best: BestRecord,
): number {
  const a = Math.min(1, alpha + 0.02);
  ctx.save();
  ctx.fillStyle = `rgba(10,0,0,${a * 0.82})`;
  ctx.fillRect(0, 0, vpW, vpH);

  ctx.globalAlpha = a;
  ctx.fillStyle = '#cc2233';
  ctx.font = 'bold 54px "Georgia", serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#660000';
  ctx.shadowBlur = 20;
  ctx.fillText('HAS CAÍDO', vpW / 2, vpH / 2 - 40);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#dddddd';
  ctx.font = '18px "Georgia", serif';
  ctx.fillText(
    `Nivel ${runStats.level} · ${runStats.kills} enemigos · ${runStats.time}s`,
    vpW / 2, vpH / 2 + 6,
  );

  drawBestRecord(ctx, vpW / 2, vpH / 2 + 34, best);

  ctx.fillStyle = '#ffcc44';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Pulsa [ESPACIO] para renacer', vpW / 2, vpH / 2 + 70);
  ctx.restore();
  return a;
}

export function renderVictory(
  ctx: CanvasRenderingContext2D,
  vpW: number, vpH: number,
  alpha: number,
  runStats: { kills: number; level: number; time: number },
  best: BestRecord,
): number {
  const a = Math.min(1, alpha + 0.02);
  ctx.save();
  ctx.fillStyle = `rgba(4,10,24,${a * 0.82})`;
  ctx.fillRect(0, 0, vpW, vpH);

  ctx.globalAlpha = a;
  ctx.fillStyle = '#ffdd66';
  ctx.font = 'bold 52px "Georgia", serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#aa8822';
  ctx.shadowBlur = 24;
  ctx.fillText('¡VICTORIA!', vpW / 2, vpH / 2 - 40);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#cfe3ff';
  ctx.font = '18px "Georgia", serif';
  ctx.fillText('El Guardián del Hielo ha caído', vpW / 2, vpH / 2 + 2);

  ctx.fillStyle = '#dddddd';
  ctx.font = '16px "Georgia", serif';
  ctx.fillText(
    `Nivel ${runStats.level} · ${runStats.kills} enemigos · ${runStats.time}s`,
    vpW / 2, vpH / 2 + 30,
  );

  drawBestRecord(ctx, vpW / 2, vpH / 2 + 56, best);

  ctx.fillStyle = '#ffcc44';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Pulsa [ESPACIO] para jugar de nuevo', vpW / 2, vpH / 2 + 92);
  ctx.restore();
  return a;
}
