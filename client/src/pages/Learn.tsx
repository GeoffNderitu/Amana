import type { FullState } from '../lib/api';
import { buildInsights } from '../lib/insights';
import { computeSavings } from '../lib/savings';
import { useCurrency } from '../lib/CurrencyContext';
import { SectionHeading, InsightCard, EmptyState } from '../components/Bits';

const TIPS = [
  {
    title: 'Zero-based budgeting, in one line',
    body: "Every dollar you have gets assigned a job before you spend it — not after. That's the whole method. If money is unassigned, it doesn't have a job yet.",
  },
  {
    title: 'Track subscriptions separately from spending',
    body: "Recurring charges are easy to lose track of because they don't feel like a decision each month. Reviewing them on their own — like the Subscriptions page here — catches the ones you forgot you had.",
  },
  {
    title: '"Available" beats "average"',
    body: "Knowing what's left in a category right now is more useful than knowing what you spent on average last year. Real-time available balances are what actually stop overspending.",
  },
  {
    title: 'A 10% savings job is a strong start',
    body: 'If income allows it, assigning at least 10% to savings or an emergency fund before anything discretionary builds a real cushion faster than saving "whatever\'s left."',
  },
  {
    title: 'Why "actual savings" beats a manual figure',
    body: "Typing in what you think you saved is guesswork — it drifts from reality within a month. Amana instead calculates it: income minus everything that actually left your accounts. That number can't lie to you the way a spreadsheet cell you forgot to update can.",
  },
  {
    title: 'Pay yourself first, automatically',
    body: 'If your bank or employer supports it, an automatic transfer to savings on payday — before you ever see the money in checking — removes the willpower requirement entirely. Assign the category here to match what actually moves.',
  },
  {
    title: 'Avalanche vs. snowball for debt',
    body: 'Avalanche (highest interest rate first) saves the most money mathematically. Snowball (smallest balance first) tends to keep people motivated with quicker wins. Neither is wrong — the one you actually stick with is the right one.',
  },
  {
    title: 'A remittance has two numbers, not one',
    body: "What you send and what arrives are rarely the same once fees and exchange spreads are counted. Logging both on the Family & Remittances page is the only way to see your real, effective rate over a year — not just what the transfer app advertised that day.",
  },
  {
    title: 'Net worth smooths out a rough month',
    body: "A single bad spending week feels big in the moment. Net worth — everything you own minus everything you owe — is slower-moving and harder to fool yourself with, which makes it the better number to check when you want the real picture.",
  },
  {
    title: 'Multi-currency accounts need one home currency',
    body: "If income, spending, and remittances happen in more than one currency, picking a single 'home' display currency (Settings) and converting everything into it is what makes categories and totals comparable at all.",
  },
];

function InsightsSection({ state, format }: { state: FullState; format: (n: number) => string }) {
  const insights = buildInsights(state, format);
  return (
    <>
      <SectionHeading>Based on your data</SectionHeading>
      {insights.length ? insights.map((i, idx) => <InsightCard key={idx} text={i} />) : <EmptyState>Nothing flagged — keep logging transactions and we'll surface patterns here.</EmptyState>}
    </>
  );
}

function renderWithBold(text: string) {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <b key={idx} className="text-ink">
          {part.slice(2, -2)}
        </b>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function SnapshotSection({ state, format }: { state: FullState; format: (n: number) => string }) {
  const savings = computeSavings(state);
  if (!savings.hasData) return null;

  const topCategory = [...state.categories].sort((a, b) => b.spent - a.spent)[0];
  const activeSubs = state.subscriptions.length;
  const subsTotal = state.subscriptions.reduce((a, s) => a + s.amount, 0);
  const remittanceCount = state.remittances.length;
  const remittanceTotal = state.remittances.reduce((a, r) => a + r.fee, 0);

  const facts: string[] = [];
  facts.push(`You're saving ${format(savings.actualSaved)} this month (${(savings.savingsRate * 100).toFixed(0)}% of income), calculated from real transactions — not a manual entry.`);
  if (topCategory && topCategory.spent > 0) {
    facts.push(`**${topCategory.name}** is your biggest category this month at ${format(topCategory.spent)}.`);
  }
  if (activeSubs > 0) {
    facts.push(`You're tracking ${activeSubs} subscription${activeSubs === 1 ? '' : 's'} costing ${format(subsTotal)}/month combined.`);
  }
  if (remittanceCount > 0) {
    facts.push(`You've logged ${remittanceCount} transfer${remittanceCount === 1 ? '' : 's'} home, with ${format(remittanceTotal)} total in fees so far.`);
  }

  return (
    <>
      <SectionHeading>Your numbers, in words</SectionHeading>
      <div className="grid sm:grid-cols-2 gap-3.5">
        {facts.map((f, idx) => (
          <div key={idx} className="card-lift bg-paper border border-line rounded-2xl p-4">
            <div className="text-[13px] text-ink-soft leading-relaxed">{renderWithBold(f)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

export function Learn({ state }: { state: FullState }) {
  const { format } = useCurrency();

  return (
    <>
      <InsightsSection state={state} format={format} />
      <SnapshotSection state={state} format={format} />

      <SectionHeading>Money basics</SectionHeading>
      <div className="grid sm:grid-cols-2 gap-3.5">
        {TIPS.map((t) => (
          <div key={t.title} className="card-lift bg-paper border border-line rounded-2xl p-4">
            <div className="font-semibold text-sm mb-1.5">{t.title}</div>
            <div className="text-[13px] text-ink-soft leading-relaxed">{t.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}
