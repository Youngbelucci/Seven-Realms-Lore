// Combat resolution: melee arc hit detection and projectile stepping/collision.
// Operates on the engine's shared state so damage, floaters and particles all
// flow through the same pools.
import { dist, circlesOverlap, randRange } from './utils';
import { Enemy } from './enemy';
import { audio } from './audio';
import type { GameEngine } from './engine';

export function hitEntitiesInArc(
  g: GameEngine,
  ax: number, ay: number, range: number, angle: number,
  arcWidth: number, damage: number, isCrit: boolean,
): void {
  const targets = [
    ...g.enemies.filter(e => !e.dead),
    ...(g.boss && !g.boss.dead ? [g.boss] : []),
  ];

  let landed = false;
  for (const target of targets) {
    const d = dist({ x: ax, y: ay }, { x: target.x, y: target.y });
    if (d > range + target.size) continue;

    if (arcWidth >= Math.PI * 2) {
      // Full circle (spin)
      target.takeDamage(damage, 'physical', isCrit, g.floaters, g.particles);
      landed = true;
    } else {
      // Directional arc
      const toTarget = Math.atan2(target.y - ay, target.x - ax);
      let diff = toTarget - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= arcWidth) {
        target.takeDamage(damage, 'physical', isCrit, g.floaters, g.particles);
        landed = true;
        if (target instanceof Enemy && target.stunFrames !== undefined) {
          target.stunFrames = 15;
        }
      }
    }
  }

  if (landed) audio.play(isCrit ? 'crit' : 'hit');
}

export function updateProjectiles(g: GameEngine, dt: number): void {
  for (const proj of g.projectiles) {
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    proj.life -= dt;

    if (proj.fromEnemy && !g.player.dead) {
      if (circlesOverlap(proj.x, proj.y, proj.size, g.player.x, g.player.y, g.player.size)) {
        if (g.player.invincibleFrames <= 0) {
          g.player.takeDamage(proj.damage, proj.damageType, false, g.floaters, g.particles);
          g.player.invincibleFrames = 30;
          audio.play('playerHurt');
        }
        proj.life = 0;
      }
    }

    // Particle trail
    if (Math.random() < 0.4) {
      g.particles.push({
        x: proj.x, y: proj.y,
        vx: randRange(-0.5, 0.5), vy: randRange(-0.5, 0.5),
        life: 8, maxLife: 8,
        color: proj.color, size: proj.size * 0.5,
      });
    }
  }
  g.projectiles = g.projectiles.filter(p => p.life > 0);
}
