import { useEffect, useRef, useCallback } from 'react';
import { GameEngine } from './game/engine';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    resize();
    window.addEventListener('resize', resize);

    const engine = new GameEngine(canvas);
    engineRef.current = engine;
    engine.start();

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      engine.handleClick(e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener('click', handleClick);

    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    return () => {
      engine.stop();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', handleClick);
    };
  }, [resize]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#000',
        cursor: 'crosshair',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        tabIndex={0}
      />
    </div>
  );
}
