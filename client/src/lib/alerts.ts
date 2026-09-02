import type { FullState } from './api';
import { projectUpcomingCharges } from './forecast';

export type AlertSeverity = 'warning' | 'info' | 'success';

export interface AlertItem {
  id: string;
  text: string;
  severity: AlertSeverity;
}

/**
 * A compact, notification-center-style feed — distinct from the longer prose insights on
 * the Dashboard. Each item is short enough to sit in a dropdown and link back to the page
 * where it can be acted on.
 */
export function buildAlerts(state: FullState, fmt: (n: number) => string): AlertItem[] {
  const out: AlertItem[] = [];

  const overspent = state.categories.filter((c) => c.spent > c.assigned && c.assigned > 0);
  overspent.forEach((c) => {
    out.push({
      id: `overspent-${c.id}`,
      text: `${c.name} is ${fmt(c.spent - c.assigned)} over budget this month.`,
      severity: 'warning',
    });
  });

  const hikedSubs = state.subscriptions.filter((s) => s.previousAmount != null && s.amount > s.previousAmount);
  hikedSubs.forEach((s) => {
    out.push({
      id: `hike-${s.id}`,
      text: `${s.name} went up from ${fmt(s.previousAmount as number)} to ${fmt(s.amount)}.`,
      severity: 'warning',
    });
  });

  const upcoming = projectUpcomingCharges(state.subscriptions, 7);
  upcoming.forEach((c) => {
    const when = new Date(c.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    out.push({
      id: `renew-${c.subscriptionId}-${c.date}`,
      text: `${c.name} renews ${when} for ${fmt(c.amount)}.`,
      severity: 'info',
    });
  });

  const nearlyThere = state.goals.filter((g) => g.target > 0 && g.saved < g.target && g.saved / g.target >= 0.85);
  nearlyThere.forEach((g) => {
    out.push({
      id: `goal-${g.id}`,
      text: `${g.name} is ${((g.saved / g.target) * 100).toFixed(0)}% funded — almost there.`,
      severity: 'success',
    });
  });

  const pendingRefunds = state.transactions.filter((t) => t.refundExpected);
  if (pendingRefunds.length > 0) {
    const total = pendingRefunds.reduce((a, t) => a + t.amount, 0);
    out.push({
      id: 'refunds-pending',
      text: `${fmt(total)} across ${pendingRefunds.length} transaction${pendingRefunds.length === 1 ? '' : 's'} is marked as expecting a refund.`,
      severity: 'info',
    });
  }

  return out;
}
