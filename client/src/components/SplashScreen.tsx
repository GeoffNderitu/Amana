import { useEffect, useState } from 'react';

const VISIBLE_MS = 1900;
const EXIT_MS = 350;

/**
 * A brief, on-brand mascot intro shown once when the app first loads (see App.tsx — it's
 * skipped on later in-session navigations, not shown on every page change). Reuses the
 * "Amana buddy" character look from BudgetBuddy.tsx so the personality feels consistent
 * rather than like a bolted-on loading screen. Respects prefers-reduced-motion by cutting
 * straight to the exit fade instead of relying on the CSS override (which would leave the
 * component mounted at 0.01ms animation-duration, i.e. invisible but still blocking).
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const visibleFor = reduced ? 400 : VISIBLE_MS;
    const exitFor = reduced ? 0 : EXIT_MS;
    const t1 = setTimeout(() => setExiting(true), visibleFor);
    const t2 = setTimeout(onDone, visibleFor + exitFor);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[2000] gradient-brand flex flex-col items-center justify-center ${exiting ? 'animate-splash-exit' : ''}`}
      onClick={onDone}
      role="presentation"
    >
      <div className="relative w-28 h-28 mb-6 animate-splash-mascot">
        {/* orbiting coins */}
        <div className="absolute inset-0 flex items-center justify-center animate-splash-coin" style={{ animationDelay: '0s' }}>
          <span className="w-4 h-4 rounded-full bg-gold shadow-md flex items-center justify-center text-[8px] font-bold text-white">$</span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center animate-splash-coin" style={{ animationDelay: '-1.6s' }}>
          <span className="w-3 h-3 rounded-full bg-white/80 shadow-md" />
        </div>
        {/* the mascot body */}
        <div className="absolute inset-0 rounded-full bg-white shadow-xl flex items-center justify-center">
          <div className="flex flex-col items-center animate-splash-wink">
            <div className="flex gap-3.5 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-deep block" />
              <span className="w-2.5 h-2.5 rounded-full bg-brand-deep block" />
            </div>
            <div className="w-6 h-3 border-b-[3px] border-brand-deep rounded-b-full" />
          </div>
        </div>
      </div>
      <div className="animate-splash-text text-center">
        <div className="font-extrabold text-[26px] tracking-tight text-white">Amana</div>
        <div className="text-[13px] text-white/80 mt-1">money you trust, wherever home is</div>
      </div>
    </div>
  );
}
