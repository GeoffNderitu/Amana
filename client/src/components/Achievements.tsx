import { Award, Lock } from 'lucide-react';
import type { Achievement } from '../lib/gamification';
import { ProgressBar } from './Bits';

export function AchievementsRow({ achievements }: { achievements: Achievement[] }) {
  const unlocked = achievements.filter((a) => a.unlocked);
  const locked = achievements.filter((a) => !a.unlocked).sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0));
  const ordered = [...unlocked, ...locked];

  return (
    <div className="bg-paper border border-line rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <Award size={16} className="text-brand" />
          <span className="text-[13px] font-bold">Achievements</span>
        </div>
        <span className="text-xs text-mute font-num">
          {unlocked.length}/{achievements.length}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {ordered.map((a) => (
          <div
            key={a.id}
            className={`card-lift shrink-0 w-40 rounded-xl border p-3 ${
              a.unlocked ? 'border-brand-bright bg-brand-softer animate-pop' : 'border-line bg-cloud/60'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
                a.unlocked ? 'gradient-brand text-white' : 'bg-cloud-dim text-mute'
              }`}
            >
              {a.unlocked ? <Award size={15} /> : <Lock size={13} />}
            </div>
            <div className="text-[12.5px] font-semibold leading-tight mb-1">{a.label}</div>
            <div className="text-[10.5px] text-mute leading-snug mb-2">{a.description}</div>
            {!a.unlocked && a.progress !== undefined && a.progress > 0 && (
              <ProgressBar pct={a.progress * 100} colorClass="gradient-brand" height="h-1.5" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
