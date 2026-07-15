import { SkillDef, SkillId } from './types';

export function createSkills(): SkillDef[] {
  return [
    {
      id: 'heavyStrike',
      name: 'Golpe Pesado',
      key: 'Q',
      cooldown: 3500,
      energyCost: 20,
      lastUsed: 0,
      description: 'Golpe devastador de gran área',
      color: '#ff4444',
      icon: '⚡',
    },
    {
      id: 'spinAttack',
      name: 'Ataque Giratorio',
      key: 'E',
      cooldown: 5000,
      energyCost: 30,
      lastUsed: 0,
      description: 'Gira causando daño en 360°',
      color: '#ff9900',
      icon: '🌀',
    },
    {
      id: 'warriorCharge',
      name: 'Carga del Guerrero',
      key: 'R',
      cooldown: 6000,
      energyCost: 25,
      lastUsed: 0,
      description: 'Carga hacia los enemigos',
      color: '#00aaff',
      icon: '⚔',
    },
    {
      id: 'ancestralShield',
      name: 'Escudo Ancestral',
      key: 'F',
      cooldown: 8000,
      energyCost: 40,
      lastUsed: 0,
      description: 'Escudo mágico temporal',
      color: '#ffd700',
      icon: '🛡',
    },
  ];
}

export function isSkillReady(skill: SkillDef, now: number, energy: number): boolean {
  return now - skill.lastUsed >= skill.cooldown && energy >= skill.energyCost;
}

export function getSkillCooldownFraction(skill: SkillDef, now: number): number {
  const elapsed = now - skill.lastUsed;
  if (elapsed >= skill.cooldown) return 1;
  return elapsed / skill.cooldown;
}
