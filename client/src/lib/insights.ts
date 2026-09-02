import type { FullState } from './api';
import { computeSavings } from './savings';

export function readyToAssign(state: FullState): number {
  const assigned = state.categories.reduce((a, c) => a + c.assigned, 0);
  return state.settings.income + state.settings.unassignedExtra - assigned;
}

export function buildInsights(state: FullState, fmt: (n: number) => string): string[] {
  const out: string[] = [];

  // --- Overspent categories ---
  const overspent = state.categories.filter((c) => c.spent > c.assigned && c.assigned > 0);
  overspent.forEach((c) => {
    const over = c.spent - c.assigned;
    out.push(
      `**${c.name}** is ${fmt(over)} over its assigned amount this month. Move money from a category with room, or adjust next month's job for it.`
    );
  });

  // --- Subscriptions costing more than assigned, or that quietly went up ---
  const subsTotal = state.subscriptions.reduce((a, s) => a + s.amount, 0);
  const subsCat = state.categories.find((c) => c.id.startsWith('subs'));
  if (subsCat && subsTotal > subsCat.assigned) {
    out.push(
      `Your recurring subscriptions (${fmt(subsTotal)}/mo) now cost more than the **Subscriptions** job you assigned. Worth a quick audit — cancel what you don't use weekly.`
    );
  }
  const hikedSubs = state.subscriptions.filter((s) => s.previousAmount != null && s.previousAmount !== s.amount && s.amount > s.previousAmount);
  hikedSubs.forEach((s) => {
    out.push(`**${s.name}** went up from ${fmt(s.previousAmount as number)} to ${fmt(s.amount)}. A price hike is a good moment to decide if it's still worth it.`);
  });

  // --- Real, computed savings — the whole point being that this isn't a manual guess ---
  const savings = computeSavings(state);
  if (savings.hasData) {
    if (savings.savingsRate < 0.1) {
      out.push(
        `Based on what actually came in and went out, you're saving ${fmt(savings.actualSaved)} this month — about ${(savings.savingsRate * 100).toFixed(0)}% of income. Even a little more assigned to **savings** compounds — small, consistent jobs beat big irregular ones.`
      );
    } else {
      out.push(
        `You're on track to save ${fmt(savings.actualSaved)} this month (${(savings.savingsRate * 100).toFixed(0)}% of income) once everything's accounted for — nice work.`
      );
    }
  }

  // --- Debt: highlight the highest-interest balance as the priority ---
  const debts = state.accounts.filter((a) => a.type === 'liability' && a.balance > 0);
  if (debts.length > 0) {
    const priciest = [...debts].sort((a, b) => (b.interestRate ?? 0) - (a.interestRate ?? 0))[0];
    if (priciest.interestRate && priciest.interestRate >= 15) {
      out.push(
        `**${priciest.name}** is carrying a ${priciest.interestRate}% rate on ${fmt(priciest.balance)}. High-interest debt like this usually beats other goals for priority — see the Debt Payoff planner for a payoff timeline.`
      );
    }
  }

  // --- Goals nearing completion ---
  const nearlyThere = state.goals.filter((g) => g.target > 0 && g.saved < g.target && g.saved / g.target >= 0.85);
  nearlyThere.forEach((g) => {
    const remaining = g.target - g.saved;
    out.push(`**${g.name}** is ${((g.saved / g.target) * 100).toFixed(0)}% funded — just ${fmt(remaining)} left to reach it.`);
  });

  // --- Net worth trend, if there's enough history to say something about it ---
  if (state.netWorthSnapshots.length >= 2) {
    const sorted = [...state.netWorthSnapshots].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const delta = last.netWorth - first.netWorth;
    if (Math.abs(delta) >= 1) {
      out.push(
        delta > 0
          ? `Net worth is up ${fmt(delta)} since ${first.date} — the trend line is heading the right way.`
          : `Net worth is down ${fmt(Math.abs(delta))} since ${first.date}. Worth a look at what changed — a big purchase, market dip, or new debt all show up here.`
      );
    }
  }

  // --- Remittance fees, if the person sends money abroad ---
  if (state.remittances.length >= 3) {
    const totalFees = state.remittances.reduce((a, r) => a + r.fee, 0);
    const totalSent = state.remittances.reduce((a, r) => a + r.amountSent, 0);
    if (totalSent > 0) {
      const feeRate = totalFees / totalSent;
      if (feeRate >= 0.02) {
        out.push(
          `Transfer fees have eaten roughly ${(feeRate * 100).toFixed(1)}% of what you've sent so far. Comparing providers on the Family & Remittances page for your next transfer could be worth more than it feels like.`
        );
      }
    }
  }

  return out;
}
