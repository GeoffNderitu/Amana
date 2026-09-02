import { useMemo, useState } from 'react';
import type { FullState } from '../lib/api';
import { useCurrency } from '../lib/CurrencyContext';
import { SectionHeading, Field, EmptyState, inputClass } from '../components/Bits';
import { simulatePayoff, monthsToLabel, type PayoffStrategy } from '../lib/debt';

export function Debt({ state }: { state: FullState }) {
  const { format, toUsd, currency } = useCurrency();
  const [strategy, setStrategy] = useState<PayoffStrategy>('avalanche');
  const [extra, setExtra] = useState('0');

  const debts = state.accounts.filter((a) => a.type === 'liability' && a.balance > 0);
  const extraUsd = toUsd(parseFloat(extra) || 0);

  const result = useMemo(() => simulatePayoff(state.accounts, extraUsd, strategy), [state.accounts, extraUsd, strategy]);
  const minOnlyResult = useMemo(() => simulatePayoff(state.accounts, 0, strategy), [state.accounts, strategy]);

  if (debts.length === 0) {
    return <EmptyState>No debts tracked — add a liability account on the Net Worth page to plan a payoff.</EmptyState>;
  }

  const orderedDebts = result
    ? [...debts].sort((a, b) => {
        const ao = result.order.find((o) => o.id === a.id)?.payoffMonth ?? 999;
        const bo = result.order.find((o) => o.id === b.id)?.payoffMonth ?? 999;
        return ao - bo;
      })
    : debts;

  return (
    <>
      <div className="responsive-form card-lift bg-paper border border-line rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-6">
        <Field label="Strategy">
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as PayoffStrategy)} className={`${inputClass} w-52`}>
            <option value="avalanche">Avalanche — highest interest first</option>
            <option value="snowball">Snowball — smallest balance first</option>
          </select>
        </Field>
        <Field label={`Extra per month (${currency})`}>
          <input type="number" step="1" value={extra} onChange={(e) => setExtra(e.target.value)} className={`${inputClass} w-32`} />
        </Field>
      </div>

      {result && (
        <div className="gradient-brand rounded-2xl px-6 py-5 mb-6 text-white relative overflow-hidden animate-fade-up">
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 animate-float" />
          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/70 mb-1 font-medium">Debt-free in</div>
              <div className="font-num text-[22px] font-extrabold">{monthsToLabel(result.months)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/70 mb-1 font-medium">Total interest paid</div>
              <div className="font-num text-[22px] font-extrabold">{format(result.totalInterestPaid)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/70 mb-1 font-medium">Interest saved</div>
              <div className="font-num text-[22px] font-extrabold text-emerald-soft">
                {minOnlyResult ? format(Math.max(0, minOnlyResult.totalInterestPaid - result.totalInterestPaid)) : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      <SectionHeading>Payoff order</SectionHeading>
      <div className="flex flex-col gap-2.5">
        {orderedDebts.map((d, i) => {
          const item = result?.order.find((o) => o.id === d.id);
          return (
            <div key={d.id} className="flex items-center justify-between card-lift bg-paper border border-line rounded-2xl px-5 py-3.5">
              <div className="flex items-center gap-3.5">
                <div className="w-7 h-7 rounded-lg bg-cloud flex items-center justify-center font-num font-semibold text-xs text-ink-soft shrink-0">
                  {i + 1}
                </div>
                <div>
                  <div className="font-semibold text-[14.5px]">{d.name}</div>
                  <div className="text-xs text-mute mt-0.5">
                    {format(d.balance)} balance · {d.interestRate ?? 0}% APR
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-num text-sm font-semibold">
                  {item ? monthsToLabel(item.payoffMonth) : '—'}
                </div>
                {item && <div className="text-xs text-mute mt-0.5">{format(item.totalInterestPaid)} interest</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
