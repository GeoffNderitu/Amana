import { useMemo } from 'react';
import type { FullState } from '../lib/api';
import { buildInsights, readyToAssign } from '../lib/insights';
import { computeSavings } from '../lib/savings';
import { useCurrency } from '../lib/CurrencyContext';
import { useAuth } from '../lib/AuthContext';
import { recordVisit, buildAchievements, computeLevel } from '../lib/gamification';
import { StatCard, SectionHeading, InsightCard, EmptyState } from '../components/Bits';
import { CategoryCard } from '../components/CategoryCard';
import { CategoryDonut, CategoryLegend, SpendingTrend, CashFlowChart } from '../components/Charts';
import { AchievementsRow } from '../components/Achievements';
import { BudgetBuddy } from '../components/BudgetBuddy';
import { WeeklyRecapButton } from '../components/WeeklyRecap';
import { buildCashFlowForecast } from '../lib/forecast';
import { Sparkles, CalendarClock } from 'lucide-react';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good evening';
}

const TIPS = [
  'Give every incoming dollar a job the moment it arrives — decisions made in advance are easier than decisions made under pressure.',
  'A small, boring, automatic transfer to savings beats a big one you only remember sometimes.',
  'Review subscriptions monthly — the ones you forgot about are exactly the ones costing you.',
  "If a category runs over, don't panic — move money from one with room. That's the whole system.",
  'Track what actually arrives after transfer fees, not just what you sent — fees compound over a year.',
  'Net worth is the number that matters most. It smooths out a rough spending month into the bigger picture.',
];

export function Dashboard({ state, onAssign }: { state: FullState; onAssign: (id: string, amount: number) => void }) {
  const { format } = useCurrency();
  const { user } = useAuth();
  const rta = readyToAssign(state);
  const spentTotal = state.transactions.reduce((a, t) => a + t.amount, 0);
  const subsTotal = state.subscriptions.reduce((a, s) => a + s.amount, 0);
  const overspent = state.categories.filter((c) => c.spent > c.assigned && c.assigned > 0);
  const insights = buildInsights(state, format);
  const savings = computeSavings(state);
  const forecast = useMemo(() => buildCashFlowForecast(state, 30), [state]);
  const nextCharges = forecast.charges.slice(0, 5);
  const dipsBelowZero = forecast.points.some((p) => p.projected < 0);

  const streak = useMemo(() => (user ? recordVisit(user.id) : { current: 0, best: 0, isNewToday: false }), [user]);
  const achievements = useMemo(() => buildAchievements(state, streak), [state, streak]);
  const level = useMemo(() => computeLevel(achievements, streak), [achievements, streak]);

  const tip = useMemo(() => TIPS[new Date().getDate() % TIPS.length], []);
  const firstName = user?.name?.split(' ')[0];

  if (state.categories.length === 0) {
    return (
      <EmptyState>
        Your budget is empty. Head to the <b className="text-ink">Budget</b> page to set your income and create
        categories, or visit <b className="text-ink">Settings</b> to load sample data and explore first.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="gradient-brand rounded-2xl px-6 py-5 mb-7 text-white relative overflow-hidden animate-fade-up">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10 animate-float" />
        <div className="absolute right-16 bottom-[-2rem] w-16 h-16 rounded-full bg-white/10" />
        <div className="relative">
          <div className="text-[13px] font-medium text-white/80 flex items-center gap-1.5">
            <Sparkles size={13} />
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
            {streak.current > 1 && ` — ${streak.current}-day streak 🔥`}
          </div>
          <div className="text-lg font-semibold mt-1 max-w-xl leading-snug">{tip}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3.5 mb-7">
        <div className="md:col-span-2">
          <BudgetBuddy state={state} format={format} />
        </div>
        <WeeklyRecapButton state={state} format={format} streak={streak.current} achievementsUnlocked={achievements.filter((a) => a.unlocked).length} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 mb-2">
        <StatCard
          label="Ready to assign"
          value={format(rta)}
          numericValue={rta}
          format={format}
          valueClass={rta > 0 ? 'text-emerald-deep' : rta < 0 ? 'text-red' : 'text-ink-soft'}
          detail={rta > 0 ? 'Give it a job below' : rta < 0 ? 'Over-assigned — pull some back' : 'Every dollar has a job'}
          accent="brand"
        />
        <StatCard
          label="Spent this month"
          value={format(spentTotal)}
          numericValue={spentTotal}
          format={format}
          detail={`${state.transactions.length} transactions logged`}
          accent="warm"
        />
        <StatCard
          label="Recurring / mo"
          value={format(subsTotal)}
          numericValue={subsTotal}
          format={format}
          detail={`${state.subscriptions.length} active subscriptions`}
          accent="none"
        />
        <StatCard
          label="Over budget"
          value={String(overspent.length)}
          valueClass={overspent.length ? 'text-red' : 'text-emerald-deep'}
          detail={overspent.length ? overspent.map((c) => c.name).join(', ') : 'All on track'}
          accent={overspent.length ? 'warm' : 'money'}
        />
      </div>

      <SectionHeading>Actual savings this month</SectionHeading>
      <div className="card-lift bg-paper border border-line rounded-2xl p-5 mb-7 flex flex-wrap items-center gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-mute font-medium mb-1">Saved so far</div>
          <div className={`font-num text-2xl font-extrabold ${savings.actualSaved > 0 ? 'text-emerald-deep' : 'text-ink-soft'}`}>
            {format(savings.actualSaved)}
          </div>
          <div className="text-xs text-mute mt-1">Income minus everything actually spent — not a manual guess.</div>
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="flex justify-between text-xs text-ink-soft mb-1.5">
            <span>{(savings.savingsRate * 100).toFixed(0)}% of income</span>
            {savings.dedicatedAssigned > 0 && <span className="text-mute">{format(savings.dedicatedAssigned)} in savings categories</span>}
          </div>
          <div className="h-2 bg-cloud-dim rounded-full overflow-hidden">
            <div
              className="h-full rounded-full gradient-money transition-[width] duration-700 ease-out"
              style={{ width: `${Math.min(100, savings.savingsRate * 100)}%` }}
            />
          </div>
        </div>
        {savings.goalsTarget > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-mute font-medium mb-1">Toward goals</div>
            <div className="font-num text-sm font-semibold">{format(savings.goalsSaved)} <span className="text-mute font-normal">of</span> {format(savings.goalsTarget)}</div>
          </div>
        )}
      </div>

      <SectionHeading>Achievements</SectionHeading>
      <div className="card-lift bg-paper border border-line rounded-2xl p-4 mb-3.5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-full gradient-brand text-white flex items-center justify-center font-extrabold text-[15px] shrink-0">
          {level.level}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-semibold">{level.title}</span>
            <span className="text-[11px] text-mute font-num">{level.xpIntoLevel}/{level.xpForNextLevel} XP</span>
          </div>
          <div className="h-1.5 bg-cloud-dim rounded-full overflow-hidden">
            <div className="h-full rounded-full gradient-brand transition-[width] duration-700 ease-out" style={{ width: `${level.progress * 100}%` }} />
          </div>
        </div>
      </div>
      <AchievementsRow achievements={achievements} />

      <div className="grid md:grid-cols-2 gap-3.5 mt-8">
        <div className="card-lift bg-paper border border-line rounded-2xl p-5">
          <div className="text-[13px] font-semibold mb-1">Spending by category</div>
          <div className="text-xs text-mute mb-2">Where this month's money actually went</div>
          <CategoryDonut categories={state.categories} format={format} />
          <CategoryLegend categories={state.categories} format={format} />
        </div>
        <div className="card-lift bg-paper border border-line rounded-2xl p-5">
          <div className="text-[13px] font-semibold mb-1">Spending trend</div>
          <div className="text-xs text-mute mb-2">Last 14 days with activity</div>
          <SpendingTrend transactions={state.transactions} format={format} />
        </div>
      </div>

      {state.subscriptions.length > 0 && (
        <>
          <SectionHeading icon={<CalendarClock size={14} />}>Cash flow forecast — next 30 days</SectionHeading>
          <div className="card-lift bg-paper border border-line rounded-2xl p-5 mb-7">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-1">
              <div>
                <div className="text-[13px] font-semibold">
                  {format(forecast.totalUpcoming)} in known charges coming up
                </div>
                <div className="text-xs text-mute mt-0.5">
                  Projected from ready-to-assign minus every subscription renewal due in the next 30 days.
                </div>
              </div>
              {dipsBelowZero && (
                <span className="text-[11px] font-semibold text-red bg-red-soft px-2.5 py-1 rounded-full whitespace-nowrap">
                  Dips below zero
                </span>
              )}
            </div>
            <CashFlowChart points={forecast.points} format={format} />
            {nextCharges.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-4 pt-4 border-t border-line">
                {nextCharges.map((c, idx) => (
                  <div key={`${c.subscriptionId}-${c.date}-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-ink-soft">{c.name} · {new Date(c.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span className="font-num text-ink">{format(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <SectionHeading>This week's insights</SectionHeading>
      {insights.length ? insights.map((i, idx) => <InsightCard key={idx} text={i} />) : <EmptyState>No flags right now — you're on top of it.</EmptyState>}

      {state.recipients.length > 0 && <FamilyWidget state={state} />}

      <SectionHeading>Budget snapshot</SectionHeading>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {state.categories.slice(0, 6).map((c) => (
          <CategoryCard key={c.id} category={c} onAssign={onAssign} />
        ))}
      </div>
    </>
  );
}

// Surfaces the Family & Remittances module on the dashboard so it isn't buried behind a nav
// click — this is the app's differentiator for households sending money across borders.
function FamilyWidget({ state }: { state: FullState }) {
  const year = new Date().toISOString().slice(0, 4);
  const byCurrency = new Map<string, number>();
  let recentCount = 0;
  for (const r of state.remittances) {
    if (!r.date.startsWith(year)) continue;
    byCurrency.set(r.currencySent, (byCurrency.get(r.currencySent) || 0) + r.amountSent);
    recentCount++;
  }
  const top = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0];
  const fmt = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };

  return (
    <>
      <SectionHeading>Family & remittances</SectionHeading>
      <div className="card-lift gradient-warm rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap text-white">
        <div>
          <div className="text-[13px] font-semibold mb-1">
            {top ? `${fmt(top[1], top[0])} sent home in ${year}` : 'Track what you send home'}
          </div>
          <div className="text-xs text-white/85">
            {state.recipients.length} {state.recipients.length === 1 ? 'person' : 'people'} supported
            {recentCount > 0 && ` · ${recentCount} transfer${recentCount === 1 ? '' : 's'} this year`}
          </div>
        </div>
      </div>
    </>
  );
}
