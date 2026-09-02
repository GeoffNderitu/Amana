import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { FullState } from '../lib/api';
import { useCurrency } from '../lib/CurrencyContext';
import { Button, Field, inputClass, inputClassText } from './Bits';
import { playCoin } from '../lib/sounds';

/**
 * A persistent floating action button, visible on every page, for logging a transaction
 * in two taps. The single biggest lever for daily-habit apps is reducing the friction of
 * the core repeated action — this puts it one tap away no matter where the user is,
 * instead of requiring a trip to the Transactions page every time.
 */
export function QuickAdd({
  state,
  onAdd,
}: {
  state: FullState;
  onAdd: (t: { date: string; payee: string; amount: number; categoryId: string }) => void;
}) {
  const { toUsd, currency } = useCurrency();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');

  // Lets the command palette (Cmd/Ctrl+K → "Add a transaction") open this panel without any
  // direct coupling — it just dispatches a DOM event and this is the one place listening.
  useEffect(() => {
    function onExternalOpen() {
      openPanel();
    }
    window.addEventListener('amana:quick-add', onExternalOpen);
    return () => window.removeEventListener('amana:quick-add', onExternalOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.categories]);

  if (state.categories.length === 0) return null;

  function openPanel() {
    setCategoryId((prev) => prev || state.categories[0]?.id || '');
    setOpen(true);
  }

  function submit() {
    const amt = parseFloat(amount);
    if (!payee.trim() || isNaN(amt) || amt <= 0 || !categoryId) return;
    onAdd({ date, payee: payee.trim(), amount: toUsd(amt), categoryId });
    playCoin();
    setPayee('');
    setAmount('');
    setOpen(false);
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-ink/20 backdrop-blur-[2px] z-40 flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="animate-pop bg-paper border border-line rounded-2xl p-5 w-full max-w-sm shadow-2xl shadow-brand/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-[15px] font-bold">Quick add</div>
              <button onClick={() => setOpen(false)} className="text-mute hover:text-ink transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="Payee">
                <input
                  type="text"
                  autoFocus
                  placeholder="Where'd it go?"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  className={`${inputClassText} w-full`}
                />
              </Field>
              <div className="flex gap-3">
                <Field label={`Amount (${currency})`}>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    className={`${inputClass} w-full`}
                  />
                </Field>
                <Field label="Date">
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} w-full`} />
                </Field>
              </div>
              <Field label="Category">
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${inputClassText} w-full`}>
                  {state.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button onClick={submit} variant="primary">
                <span className="w-full block text-center">Log transaction</span>
              </Button>
            </div>
          </div>
        </div>
      )}
      <button
        onClick={openPanel}
        aria-label="Quick add transaction"
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full gradient-brand text-white shadow-lg shadow-brand/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>
    </>
  );
}
