import type { Account } from './api';

export type PayoffStrategy = 'avalanche' | 'snowball';

export interface DebtPayoffOrderItem {
  id: string;
  name: string;
  balance: number;
  interestRate: number;
  payoffMonth: number; // 1-indexed month this debt hits zero
  totalInterestPaid: number;
}

export interface DebtPayoffResult {
  months: number;
  totalInterestPaid: number;
  totalPaid: number;
  order: DebtPayoffOrderItem[];
  /** running total balance across all debts, index 0 = today, useful for a chart */
  balanceOverTime: number[];
}

/**
 * Simulates paying off a set of debts month-by-month using the classic snowball (smallest
 * balance first) or avalanche (highest interest rate first) method, applying minimum payments
 * to every debt and directing all extra budget at the top-priority debt.
 */
export function simulatePayoff(debts: Account[], extraPerMonth: number, strategy: PayoffStrategy): DebtPayoffResult | null {
  const live = debts
    .filter((d) => d.type === 'liability' && d.balance > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: d.balance,
      rate: d.interestRate ?? 0,
      minPayment: d.minPayment ?? Math.max(10, d.balance * 0.02),
    }));
  if (live.length === 0) return null;

  const order: DebtPayoffOrderItem[] = [];
  const interestPaid = new Map(live.map((d) => [d.id, 0]));
  const balanceOverTime: number[] = [live.reduce((s, d) => s + d.balance, 0)];

  let month = 0;
  const MAX_MONTHS = 600; // 50 years — safety cap so a too-small payment can't loop forever
  while (live.some((d) => d.balance > 0.01) && month < MAX_MONTHS) {
    month++;

    // Priority order recalculated each month since balances change (snowball especially).
    const active = live.filter((d) => d.balance > 0.01);
    active.sort((a, b) => (strategy === 'avalanche' ? b.rate - a.rate : a.balance - b.balance));

    // Accrue interest, then apply minimum payments to everyone.
    for (const d of active) {
      const interest = (d.rate / 100 / 12) * d.balance;
      d.balance += interest;
      interestPaid.set(d.id, (interestPaid.get(d.id) || 0) + interest);
      const pay = Math.min(d.minPayment, d.balance);
      d.balance -= pay;
    }

    // Throw all extra budget at the top-priority debt that still has a balance.
    let extra = extraPerMonth;
    for (const d of active) {
      if (extra <= 0) break;
      if (d.balance <= 0.01) continue;
      const pay = Math.min(extra, d.balance);
      d.balance -= pay;
      extra -= pay;
    }

    for (const d of active) {
      if (d.balance <= 0.01 && !order.some((o) => o.id === d.id)) {
        order.push({ id: d.id, name: d.name, balance: 0, interestRate: d.rate, payoffMonth: month, totalInterestPaid: interestPaid.get(d.id) || 0 });
      }
    }

    balanceOverTime.push(Math.max(0, live.reduce((s, d) => s + Math.max(0, d.balance), 0)));
  }

  const totalInterestPaid = [...interestPaid.values()].reduce((a, b) => a + b, 0);
  const totalPaid = live.reduce((s, d) => s + (debts.find((x) => x.id === d.id)?.balance || 0), 0) + totalInterestPaid;

  return {
    months: month >= MAX_MONTHS ? -1 : month,
    totalInterestPaid,
    totalPaid,
    order,
    balanceOverTime,
  };
}

export function monthsToLabel(months: number): string {
  if (months < 0) return "won't pay off at this rate";
  if (months === 0) return 'already paid off';
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} yr${y > 1 ? 's' : ''}`);
  if (m > 0) parts.push(`${m} mo${m > 1 ? 's' : ''}`);
  return parts.join(' ') || '0 mo';
}
