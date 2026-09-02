import { useState } from 'react';
import type { FullState, Transaction } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useCurrency } from '../lib/CurrencyContext';
import { Button, Field, EmptyState, inputClass, inputClassText } from '../components/Bits';
import { X, RotateCcw, Sparkles, Pencil, Check } from 'lucide-react';

function TransactionRow({
  t,
  isLast,
  categories,
  onUpdate,
  onDelete,
  onToggleRefund,
}: {
  t: Transaction;
  isLast: boolean;
  categories: FullState['categories'];
  onUpdate: (id: string, patch: { date?: string; payee?: string; amount?: number; categoryId?: string }) => void;
  onDelete: (id: string) => void;
  onToggleRefund: (id: string, refundExpected: boolean) => void;
}) {
  const { format, toUsd, convert, currency } = useCurrency();
  const [editing, setEditing] = useState(false);
  const [eDate, setEDate] = useState(t.date);
  const [ePayee, setEPayee] = useState(t.payee);
  const [eAmount, setEAmount] = useState(() => convert(t.amount).toFixed(2));
  const [eCategoryId, setECategoryId] = useState(t.categoryId);

  function startEdit() {
    setEDate(t.date);
    setEPayee(t.payee);
    setEAmount(convert(t.amount).toFixed(2));
    setECategoryId(t.categoryId);
    setEditing(true);
  }

  function saveEdit() {
    const amt = parseFloat(eAmount);
    if (!ePayee.trim() || isNaN(amt) || !eCategoryId) return;
    onUpdate(t.id, { date: eDate, payee: ePayee.trim(), amount: toUsd(amt), categoryId: eCategoryId });
    setEditing(false);
  }

  const cat = categories.find((c) => c.id === t.categoryId);

  if (editing) {
    return (
      <div className={`flex flex-wrap gap-2.5 items-end px-4 py-3 bg-brand-softer ${!isLast ? 'border-b border-line' : ''}`}>
        <Field label="Date">
          <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} className={`${inputClass} w-36`} />
        </Field>
        <Field label="Payee">
          <input type="text" value={ePayee} onChange={(e) => setEPayee(e.target.value)} className={`${inputClassText} w-36`} />
        </Field>
        <Field label={`Amount (${currency})`}>
          <input type="number" step="0.01" value={eAmount} onChange={(e) => setEAmount(e.target.value)} className={`${inputClass} w-24`} />
        </Field>
        <Field label="Category">
          <select value={eCategoryId} onChange={(e) => setECategoryId(e.target.value)} className={`${inputClassText} w-36`}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <div className="flex gap-1.5 pb-0.5">
          <button onClick={saveEdit} className="text-emerald-deep hover:bg-emerald-soft rounded-md p-1.5 transition-colors" title="Save">
            <Check size={15} />
          </button>
          <button onClick={() => setEditing(false)} className="text-mute hover:bg-cloud-dim rounded-md p-1.5 transition-colors" title="Cancel">
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`transaction-grid group grid grid-cols-[80px_1fr_140px_100px_80px] gap-3 px-4 py-3 items-center text-sm hover:bg-cloud/60 transition-colors ${!isLast ? 'border-b border-line' : ''}`}>
      <span className="font-num text-ink-soft text-xs">{fmtDate(t.date)}</span>
      <span className="font-medium truncate flex items-center gap-1.5 min-w-0">
        <span className="truncate">{t.payee}</span>
        {t.refundExpected && (
          <span className="shrink-0 text-[10px] font-semibold text-brand bg-brand-softer px-1.5 py-0.5 rounded-full">Refund pending</span>
        )}
      </span>
      <span className="hidden sm:block text-ink-soft text-xs">{cat?.name ?? '—'}</span>
      <span className="font-num font-semibold text-right">{format(t.amount)}</span>
      <span className="flex items-center gap-2 justify-self-end">
        <button
          onClick={startEdit}
          className="text-mute hover:text-brand opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          title="Edit"
          aria-label={`Edit ${t.payee}`}
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onToggleRefund(t.id, !t.refundExpected)}
          className={`transition-colors ${t.refundExpected ? 'text-brand' : 'text-mute hover:text-brand'}`}
          title={t.refundExpected ? 'Clear refund flag' : 'Mark as expecting a refund'}
        >
          <RotateCcw size={14} />
        </button>
        <button onClick={() => onDelete(t.id)} className="text-mute hover:text-red" title="Delete"><X size={15} /></button>
      </span>
    </div>
  );
}

export function Transactions({
  state,
  onAdd,
  onUpdate,
  onDelete,
  onToggleRefund,
  onRecategorize,
}: {
  state: FullState;
  onAdd: (t: { date: string; payee: string; amount: number; categoryId: string; refundExpected: boolean }) => void;
  onUpdate: (id: string, patch: { date?: string; payee?: string; amount?: number; categoryId?: string }) => void;
  onDelete: (id: string) => void;
  onToggleRefund: (id: string, refundExpected: boolean) => void;
  onRecategorize?: () => Promise<void> | void;
}) {
  const { format, toUsd, currency } = useCurrency();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState(state.categories[0]?.id ?? '');
  const [refundExpected, setRefundExpected] = useState(false);

  const [recategorizing, setRecategorizing] = useState(false);

  const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const pending = sorted.filter((t) => t.refundExpected);
  const pendingTotal = pending.reduce((a, t) => a + t.amount, 0);
  const uncategorizedBucket = state.categories.find((c) => c.isSystem);
  const uncategorizedCount = uncategorizedBucket ? sorted.filter((t) => t.categoryId === uncategorizedBucket.id).length : 0;

  async function runRecategorize() {
    if (!onRecategorize) return;
    setRecategorizing(true);
    try {
      await onRecategorize();
    } finally {
      setRecategorizing(false);
    }
  }

  function submit() {
    const amt = parseFloat(amount);
    if (!payee.trim() || isNaN(amt) || !categoryId) return;
    onAdd({ date, payee: payee.trim(), amount: toUsd(amt), categoryId, refundExpected });
    setPayee('');
    setAmount('');
    setRefundExpected(false);
  }

  if (state.categories.length === 0) {
    return <EmptyState>Add a budget category first — then you can log transactions against it.</EmptyState>;
  }

  return (
    <>
      <div className="responsive-form card-lift bg-paper border border-line rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-3">
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} w-40`} />
        </Field>
        <Field label="Payee">
          <input type="text" placeholder="Where'd it go?" value={payee} onChange={(e) => setPayee(e.target.value)} className={`${inputClassText} w-44`} />
        </Field>
        <Field label={`Amount (${currency})`}>
          <input type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} w-28`} />
        </Field>
        <Field label="Category">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${inputClassText} w-40`}>
            {state.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer select-none pb-2">
          <input type="checkbox" checked={refundExpected} onChange={(e) => setRefundExpected(e.target.checked)} className="accent-brand" />
          Expecting a refund
        </label>
        <Button onClick={submit} variant="primary">Log it</Button>
      </div>

      {pending.length > 0 && (
        <div className="text-xs text-ink-soft bg-brand-softer border border-line rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2">
          <RotateCcw size={13} className="text-brand shrink-0" />
          <span>
            {format(pendingTotal)} across {pending.length} {pending.length === 1 ? 'transaction is' : 'transactions is'} marked as expecting a
            refund — still counted in your budget until it actually posts.
          </span>
        </div>
      )}

      {uncategorizedCount > 0 && onRecategorize && (
        <div className="text-xs text-ink-soft bg-brand-softer border border-line rounded-xl px-4 py-2.5 mb-6 flex flex-wrap items-center gap-2 justify-between">
          <span className="flex items-center gap-2">
            <Sparkles size={13} className="text-brand shrink-0" />
            {uncategorizedCount} {uncategorizedCount === 1 ? 'transaction is' : 'transactions are'} sitting in Uncategorized. If any match
            payees you've already categorized elsewhere, we can move them automatically.
          </span>
          <Button onClick={runRecategorize} variant="ghost" disabled={recategorizing}>
            {recategorizing ? 'Checking…' : 'Auto-categorize now'}
          </Button>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState>No transactions yet — log your first one above.</EmptyState>
      ) : (
        <div className="border border-line rounded-2xl overflow-hidden">
          <div className="transaction-grid transaction-header grid grid-cols-[80px_1fr_140px_100px_80px] gap-3 px-4 py-2.5 bg-cloud text-[10.5px] uppercase tracking-wide text-mute font-num">
            <span>Date</span><span>Payee</span><span className="hidden sm:block">Category</span><span className="text-right">Amount</span><span />
          </div>
          {sorted.map((t, idx) => (
            <TransactionRow
              key={t.id}
              t={t}
              isLast={idx === sorted.length - 1}
              categories={state.categories}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onToggleRefund={onToggleRefund}
            />
          ))}
        </div>
      )}
    </>
  );
}
