import type { FullState, Subscription } from './api';
import { readyToAssign } from './insights';

export interface ForecastPoint {
  date: string; // yyyy-mm-dd
  label: string;
  projected: number; // cumulative projected "ready to assign" balance on this day
  charge: number; // total charges landing on this exact day
}

export interface UpcomingCharge {
  subscriptionId: string;
  name: string;
  date: string;
  amount: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Best-effort cadence -> interval-in-days, since cadence is free text in this schema. */
function cadenceDays(cadence: string): number {
  const c = cadence.trim().toLowerCase();
  if (c.startsWith('week')) return 7;
  if (c.startsWith('biweek') || c.startsWith('bi-week') || c.startsWith('fortnight')) return 14;
  if (c.startsWith('quarter')) return 91;
  if (c.startsWith('year') || c.startsWith('annual')) return 365;
  if (c.startsWith('daily') || c.startsWith('day')) return 1;
  return 30; // monthly, or anything unrecognized
}

/**
 * Projects every subscription's future billing dates that land within [today, today+days),
 * rolling a stale nextBillingDate forward by its cadence until it's back in range. This turns
 * a flat list of subscriptions into an actual forward-looking bill calendar.
 */
export function projectUpcomingCharges(subscriptions: Subscription[], days = 30): UpcomingCharge[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + days * DAY);
  const out: UpcomingCharge[] = [];

  for (const s of subscriptions) {
    if (!s.nextBillingDate) continue;
    let next = new Date(s.nextBillingDate + 'T00:00:00');
    if (isNaN(next.getTime())) continue;
    const step = cadenceDays(s.cadence);
    if (step <= 0) continue;

    // Roll forward past dates so a stale nextBillingDate still projects sensibly.
    let guard = 0;
    while (next < today && guard < 500) {
      next = new Date(next.getTime() + step * DAY);
      guard++;
    }

    while (next <= horizon && guard < 500) {
      out.push({
        subscriptionId: s.id,
        name: s.name,
        date: next.toISOString().slice(0, 10),
        amount: s.amount,
      });
      next = new Date(next.getTime() + step * DAY);
      guard++;
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Builds a day-by-day projection of "ready to assign" cash draining down as known charges hit,
 * starting from today's real balance. This is the forward-looking counterpart to the backward-
 * looking spending trend chart — it answers "what's coming", not just "what happened".
 */
export function buildCashFlowForecast(state: FullState, days = 30): { points: ForecastPoint[]; charges: UpcomingCharge[]; totalUpcoming: number } {
  const charges = projectUpcomingCharges(state.subscriptions, days);
  const byDate = new Map<string, number>();
  for (const c of charges) byDate.set(c.date, (byDate.get(c.date) || 0) + c.amount);

  const start = readyToAssign(state);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const points: ForecastPoint[] = [];
  let running = start;
  for (let i = 0; i <= days; i++) {
    const d = new Date(today.getTime() + i * DAY);
    const iso = d.toISOString().slice(0, 10);
    const charge = byDate.get(iso) || 0;
    if (i > 0) running -= charge;
    points.push({
      date: iso,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      projected: running,
      charge,
    });
  }

  const totalUpcoming = charges.reduce((a, c) => a + c.amount, 0);
  return { points, charges, totalUpcoming };
}
