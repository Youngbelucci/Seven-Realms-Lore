// Weather: a layered falling-snow blizzard drawn in screen space. Flakes are
// lazily seeded to the viewport once and recycled forever.

interface Flake {
  x: number; y: number; r: number; spd: number; sway: number; phase: number; alpha: number;
}

export class Weather {
  private snow: Flake[] = [];

  reset(): void {
    this.snow = [];
  }

  private ensure(vpW: number, vpH: number): void {
    if (this.snow.length > 0) return;
    const layers = [
      { count: 45, r: 2.2, spd: 1.5, sway: 0.7, alpha: 0.9 },
      { count: 55, r: 1.4, spd: 1.0, sway: 0.5, alpha: 0.6 },
      { count: 60, r: 0.9, spd: 0.6, sway: 0.35, alpha: 0.35 },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.count; i++) {
        this.snow.push({
          x: Math.random() * vpW,
          y: Math.random() * vpH,
          r: L.r * (0.7 + Math.random() * 0.6),
          spd: L.spd * (0.8 + Math.random() * 0.5),
          sway: L.sway,
          phase: Math.random() * 1000,
          alpha: L.alpha,
        });
      }
    }
  }

  // Steps flakes forward and draws them. Kept as a single pass so the snow
  // animation stays tied to the render tick.
  draw(ctx: CanvasRenderingContext2D, vpW: number, vpH: number, tick: number): void {
    this.ensure(vpW, vpH);
    ctx.save();
    ctx.fillStyle = '#e2edf7';
    for (const f of this.snow) {
      f.y += f.spd;
      f.x += Math.sin((tick + f.phase) * 0.02) * f.sway;
      if (f.y > vpH + 6) { f.y = -6; f.x = Math.random() * vpW; }
      if (f.x > vpW + 6) f.x = -6;
      else if (f.x < -6) f.x = vpW + 6;
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
