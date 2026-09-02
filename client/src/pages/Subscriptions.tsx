import { useState } from 'react';
import type { FullState, Subscription } from '../lib/api';
import { useCurrency } from '../lib/CurrencyContext';
import { StatCard, SectionHeading, InsightCard, Button, Field, EmptyState, inputClass, inputClassText } from '../components/Bits';

const UNUSED_DAYS = 60;
const RENEWAL_WARNING_DAYS = 7;

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function lastMatchingTransactionDate(sub: Subscription, state: FullState): string | null {
  const needle = sub.name.trim().toLowerCase();
  const matches = state.transactions.filter((t) => t.payee.toLowerCase().includes(needle));
  if (matches.length === 0) return null;
  return matches.reduce((latest, t) => (t.date > latest ? t.date : latest), matches[0].date);
}

function SubscriptionCard({
  sub,
  state,
  onUpdate,
  onDelete,
}: {
  sub: Subscription;
  state: FullState;
  onUpdate: (id: string, patch: { amount?: number; nextBillingDate?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const { format, toUsd, convert } = useCurrency();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(() => convert(sub.amount).toFixed(2));
  const [nextDate, setNextDate] = useState(sub.nextBillingDate || '');

  const today = new Date();
  const lastUsed = lastMatchingTransactionDate(sub, state);
  const daysSinceUsed = lastUsed ? daysBetween(today, new Date(lastUsed + 'T00:00:00')) : null;
  const isUnused = daysSinceUsed === null || daysSinceUsed >= UNUSED_DAYS;
  const priceHiked = sub.previousAmount != null && sub.previousAmount !== sub.amount;
  const daysToRenewal = sub.nextBillingDate ? daysBetween(new Date(sub.nextBillingDate + 'T00:00:00'), today) : null;
  const renewingSoon = daysToRenewal !== null && daysToRenewal >= 0 && daysToRenewal <= RENEWAL_WARNING_DAYS;

  function save() {
    const amt = parseFloat(amount);
    const patch: { amount?: number; nextBillingDate?: string } = {};
    if (!isNaN(amt) && amt >= 0) patch.amount = toUsd(amt);
    patch.nextBillingDate = nextDate || undefined;
    onUpdate(sub.id, patch);
    setEditing(false);
  }

  return (
    <div className="card-lift bg-paper border border-line rounded-2xl px-5 py-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-cloud flex items-center justify-center font-semibold text-sm text-ink-soft shrink-0">
            {sub.name.charAt(0)}
          </div>
          <div>
            <div className="font-semibold text-[14.5px]">{sub.name}</div>
            <div className="text-xs text-mute mt-0.5">
              {sub.cadence}
              {sub.nextBillingDate && <span> · renews {sub.nextBillingDate}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {editing ? (
            <>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} w-24`} />
              <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={`${inputClass} w-36`} />
              <Button onClick={save} variant="primary">Save</Button>
            </>
          ) : (
            <>
              <span className="font-num font-semibold">{format(sub.amount)}</span>
              <Button onClick={() => setEditing(true)} variant="default">Edit</Button>
            </>
          )}
          <Button onClick={() => onDelete(sub.id)} variant="danger">Cancel</Button>
        </div>
      </div>

      {(priceHiked || renewingSoon || isUnused) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {priceHiked && (
            <span className="text-[11px] font-medium bg-red-soft text-red px-2.5 py-1 rounded-full">
              Price went up from {format(sub.previousAmount!)} to {format(sub.amount)}
            </span>
          )}
          {renewingSoon && (
            <span className="text-[11px] font-medium bg-emerald-soft text-emerald-deep px-2.5 py-1 rounded-full">
              Renews in {daysToRenewal} day{daysToRenewal === 1 ? '' : 's'}
            </span>
          )}
          {isUnused && (
            <span className="text-[11px] font-medium bg-cloud-dim text-ink-soft px-2.5 py-1 rounded-full">
              {lastUsed ? `No matching transaction in ${daysSinceUsed}+ days` : 'No matching transaction logged yet'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function Subscriptions({
  state,
  onAdd,
  onUpdate,
  onDelete,
}: {
  state: FullState;
  onAdd: (s: { name: string; amount: number; cadence: string; nextBillingDate: string | null }) => void;
  onUpdate: (id: string, patch: { amount?: number; nextBillingDate?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const { format, toUsd, currency } = useCurrency();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [nextDate, setNextDate] = useState('');
  const total = state.subscriptions.reduce((a, s) => a + s.amount, 0);

  const alerts = state.subscriptions.filter((s) => {
    const lastUsed = lastMatchingTransactionDate(s, state);
    const days = lastUsed ? daysBetween(new Date(), new Date(lastUsed + 'T00:00:00')) : null;
    return (s.previousAmount != null && s.previousAmount !== s.amount) || days === null || days >= UNUSED_DAYS;
  });

  function submit() {
    const amt = parseFloat(amount);
    if (!name.trim() || isNaN(amt)) return;
    onAdd({ name: name.trim(), amount: toUsd(amt), cadence: 'Monthly', nextBillingDate: nextDate || null });
    setName('');
    setAmount('');
    setNextDate('');
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6 max-w-md">
        <StatCard label="Monthly total" value={format(total)} detail={`${format(total * 12)} a year`} accent="warm" />
        <StatCard label="Active subscriptions" value={String(state.subscriptions.length)} detail="Review anything unused" accent="brand" />
      </div>

      {alerts.length > 0 && (
        <div className="mb-6">
          <SectionHeading>Worth a look</SectionHeading>
          {alerts.slice(0, 3).map((s) => (
            <InsightCard
              key={s.id}
              text={
                s.previousAmount != null && s.previousAmount !== s.amount
                  ? `**${s.name}** went up from ${format(s.previousAmount)} to ${format(s.amount)} — worth deciding if it's still worth it.`
                  : `**${s.name}** doesn't have a matching transaction in your log recently — check if you still use it.`
              }
            />
          ))}
        </div>
      )}

      <div className="card-lift bg-paper border border-line rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-6">
        <Field label="Name">
          <input type="text" placeholder="e.g. Disney+" value={name} onChange={(e) => setName(e.target.value)} className={`${inputClassText} w-48`} />
        </Field>
        <Field label={`Amount / mo (${currency})`}>
          <input type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} w-28`} />
        </Field>
        <Field label="Next billing date">
          <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={`${inputClass} w-40`} />
        </Field>
        <Button onClick={submit} variant="primary">Add</Button>
      </div>

      {state.subscriptions.length === 0 ? (
        <EmptyState>No subscriptions tracked yet.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {state.subscriptions.map((s) => (
            <SubscriptionCard key={s.id} sub={s} state={state} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}
    </>
  );
}
