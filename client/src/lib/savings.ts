import type { FullState } from './api';

// Heuristic: a category counts as "dedicated savings" if its group or name reads that way.
// Catches the common labels people actually use (Savings, Emergency Fund, Sinking Fund, ...)
// without requiring a rigid, hidden category type the user has to know about up front.
const SAVINGS_PATTERN = /saving|emergency|sinking fund|rainy.day/i;

export interface SavingsSummary {
  /** Everything currently in the household's monthly plan that isn't being spent — the real,
   * intelligent figure: income minus what has actually gone out the door this month. This is
   * what's "going into savings" whether or not it sits in a category labeled that way. */
  actualSaved: number;
  /** Same figure as a share of income, for a quick health-check ("saving 18% this month"). */
  savingsRate: number;
  /** The subset of actualSaved that's been deliberately assigned to a savings-flavored
   * category (Savings, Emergency Fund, etc.), so the user can see intentional vs. incidental. */
  dedicatedAssigned: number;
  /** Cumulative progress across all Goals — separate from the monthly figures above since
   * goal funds may have built up over many months, not just this one. */
  goalsSaved: number;
  goalsTarget: number;
  /** True once there's enough data (an income set) to make the numbers meaningful. */
  hasData: boolean;
}

export function computeSavings(state: FullState): SavingsSummary {
  const income = state.settings.income;
  const spentTotal = state.transactions.reduce((a, t) => a + t.amount, 0);
  const actualSaved = Math.max(0, income - spentTotal);
  const savingsRate = income > 0 ? actualSaved / income : 0;

  const dedicatedAssigned = state.categories
    .filter((c) => SAVINGS_PATTERN.test(c.group) || SAVINGS_PATTERN.test(c.name))
    .reduce((a, c) => a + c.assigned, 0);

  const goalsSaved = state.goals.reduce((a, g) => a + g.saved, 0);
  const goalsTarget = state.goals.reduce((a, g) => a + g.target, 0);

  return {
    actualSaved,
    savingsRate,
    dedicatedAssigned,
    goalsSaved,
    goalsTarget,
    hasData: income > 0,
  };
}
