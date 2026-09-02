import { useEffect, useState } from 'react';

const COLORS = ['#8b5cf6', '#0ea975', '#f2724a', '#d69e18', '#6d28d9', '#16a34a'];

interface Piece {
  id: number;
  left: number;
  color: string;
  delay: number;
  drift: number;
  size: number;
}

/**
 * A short, self-cleaning confetti burst for celebratory moments — a goal fully funded,
 * a debt paid off, a streak milestone. `fire` is a trigger key: increment it (or flip a
 * boolean-as-0/1) each time you want a fresh burst — the effect only cares that the value
 * changed, so it never gets stuck by a caller resetting it back to a falsy value quickly.
 */
export function Confetti({ fire, count = 42 }: { fire: boolean | number; count?: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (!fire) return;
    const next: Piece[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 0.3,
      drift: (Math.random() - 0.5) * 80,
      size: 6 + Math.random() * 6,
    }));
    setPieces(next);
    const t = setTimeout(() => setPieces([]), 2000);
    return () => clearTimeout(t);
  }, [fire, count]);

  if (pieces.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 h-0 z-[999] overflow-visible">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti absolute block rounded-sm"
          style={{
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            // @ts-expect-error custom property used only for the drift keyframe fallback
            '--drift': `${p.drift}px`,
            transform: `translateX(${p.drift}px)`,
          }}
        />
      ))}
    </div>
  );
}
