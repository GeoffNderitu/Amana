import { useMemo, useState } from 'react';
import { X, Sparkles, TrendingUp, Flame, Award } from 'lucide-react';
import type { FullState } from '../lib/api';
import { Button } from './Bits';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function WeeklyRecapButton({
  state,
  format,
  streak,
  achievementsUnlocked,
}: {
  state: FullState;
  format: (n: number) => string;
  streak: number;
  achievementsUnlocked: number;
}) {
  const [open, setOpen] = useState(false);
  const since = useMemo(() => daysAgo(7), []);

  const weekTx = state.transactions.filter((t) => t.date >= since);
  const weekTotal = weekTx.reduce((a, t) => a + t.amount, 0);

  const byCategory = new Map<string, number>();
  for (const t of weekTx) {
    const cat = state.categories.find((c) => c.id === t.categoryId);
    const label = cat?.name || 'Uncategorized';
    byCategory.set(label, (byCategory.get(label) || 0) + t.amount);
  }
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  const byPayee = new Map<string, number>();
  for (const t of weekTx) byPayee.set(t.payee, (byPayee.get(t.payee) || 0) + 1);
  const topPayee = [...byPayee.entries()].sort((a, b) => b[1] - a[1])[0];

  const avgPerDay = weekTx.length ? weekTotal / 7 : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="card-lift w-full text-left gradient-brand rounded-2xl px-5 py-4 text-white flex items-center justify-between gap-3 relative overflow-hidden"
      >
        <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-wide text-white/75 font-medium mb-0.5">New</div>
          <div className="text-[15px] font-bold flex items-center gap-1.5">
            <Sparkles size={15} /> Your week in review
          </div>
        </div>
        <span className="relative text-xs bg-white/20 px-2.5 py-1 rounded-full font-medium">View →</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="animate-pop gradient-brand text-white rounded-3xl p-7 w-full max-w-sm relative overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
            <div className="absolute -left-10 -bottom-10 w-32 h-32 rounded-full bg-white/10" />
            <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors">
              <X size={20} />
            </button>

            <div className="relative">
              <div className="text-[11px] uppercase tracking-widest text-white/70 font-semibold mb-1">Your week with Amana</div>
              <div className="text-2xl font-extrabold mb-6">The last 7 days</div>

              <div className="space-y-4">
                <div>
                  <div className="text-[11px] text-white/70 uppercase tracking-wide mb-0.5">Total spent</div>
                  <div className="font-num text-3xl font-extrabold">{format(weekTotal)}</div>
                  <div className="text-xs text-white/75 mt-0.5">{format(avgPerDay)} a day on average</div>
                </div>

                {topCategory && (
                  <div className="flex items-center gap-2.5 bg-white/10 rounded-xl px-3.5 py-2.5">
                    <TrendingUp size={16} className="shrink-0" />
                    <div className="text-sm">
                      Most spent on <b>{topCategory[0]}</b> — {format(topCategory[1])}
                    </div>
                  </div>
                )}

                {topPayee && (
                  <div className="flex items-center gap-2.5 bg-white/10 rounded-xl px-3.5 py-2.5">
                    <Sparkles size={16} className="shrink-0" />
                    <div className="text-sm">
                      Your most frequent stop: <b>{topPayee[0]}</b> ({topPayee[1]}×)
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <div className="flex-1 bg-white/10 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                    <Flame size={16} className="shrink-0" />
                    <div className="text-sm">
                      <b>{streak}</b>-day streak
                    </div>
                  </div>
                  <div className="flex-1 bg-white/10 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                    <Award size={16} className="shrink-0" />
                    <div className="text-sm">
                      <b>{achievementsUnlocked}</b> badges
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <Button onClick={() => setOpen(false)}>
                  <span className="w-full block text-center text-ink">Nice, thanks</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
