import { useState } from 'react';
import { Pencil, Trash2, X, Check } from 'lucide-react';
import type { Account, AccountType, FullState } from '../lib/api';
import { useCurrency } from '../lib/CurrencyContext';
import { StatCard, SectionHeading, Button, Field, EmptyState, inputClass, inputClassText } from '../components/Bits';
import { NetWorthTrend } from '../components/Charts';

const ASSET_CATEGORIES = [
  { value: 'cash', label: 'Cash / Checking / Savings' },
  { value: 'investment', label: 'Investment' },
  { value: 'property', label: 'Property' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'other', label: 'Other asset' },
];
const LIABILITY_CATEGORIES = [
  { value: 'credit_card', label: 'Credit card' },
  { value: 'student_loan', label: 'Student loan' },
  { value: 'loan', label: 'Loan' },
  { value: 'other', label: 'Other liability' },
];

function AccountRow({
  account,
  onUpdateAccount,
  onDelete,
}: {
  account: Account;
  onUpdateAccount: (id: string, patch: { name?: string; balanceUsd?: number; interestRate?: number | null; minPaymentUsd?: number | null }) => void;
  onDelete: (id: string) => void;
}) {
  const { format, toUsd, convert } = useCurrency();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(account.name);
  const [balance, setBalance] = useState(() => convert(account.balance).toFixed(2));
  const [rate, setRate] = useState(account.interestRate != null ? String(account.interestRate) : '');
  const [minPay, setMinPay] = useState(account.minPayment != null ? convert(account.minPayment).toFixed(2) : '');

  function startEditing() {
    setName(account.name);
    setBalance(convert(account.balance).toFixed(2));
    setRate(account.interestRate != null ? String(account.interestRate) : '');
    setMinPay(account.minPayment != null ? convert(account.minPayment).toFixed(2) : '');
    setEditing(true);
  }

  function save() {
    const b = parseFloat(balance);
    if (!name.trim() || isNaN(b) || b < 0) return;
    const patch: { name?: string; balanceUsd?: number; interestRate?: number | null; minPaymentUsd?: number | null } = {
      name: name.trim(),
      balanceUsd: toUsd(b),
    };
    if (account.type === 'liability') {
      patch.interestRate = rate.trim() ? parseFloat(rate) : null;
      patch.minPaymentUsd = minPay.trim() ? toUsd(parseFloat(minPay)) : null;
    }
    onUpdateAccount(account.id, patch);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="card-lift bg-paper border border-brand-bright/60 rounded-2xl px-5 py-4 flex flex-col gap-3 animate-fade-up">
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Name">
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className={`${inputClassText} w-40`}
            />
          </Field>
          <Field label="Balance">
            <input
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className={`${inputClass} w-28`}
            />
          </Field>
          {account.type === 'liability' && (
            <>
              <Field label="APR %">
                <input
                  type="number"
                  step="0.1"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  className={`${inputClass} w-20`}
                />
              </Field>
              <Field label="Min pay">
                <input
                  type="number"
                  step="0.01"
                  value={minPay}
                  onChange={(e) => setMinPay(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  className={`${inputClass} w-24`}
                />
              </Field>
            </>
          )}
          <Button onClick={save} variant="primary">
            <span className="flex items-center gap-1.5"><Check size={14} /> Save</span>
          </Button>
          <Button onClick={() => setEditing(false)} variant="ghost">
            <span className="flex items-center gap-1.5"><X size={14} /> Cancel</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between card-lift bg-paper border border-line rounded-2xl px-5 py-3.5">
      <div className="min-w-0">
        <div className="font-semibold text-[14.5px] truncate">{account.name}</div>
        <div className="text-xs text-mute mt-0.5">
          {account.category.replace('_', ' ')}
          {account.interestRate != null && <span> · {account.interestRate}% APR</span>}
          {account.minPayment != null && <span> · {format(account.minPayment)} min/mo</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-num font-semibold text-[14.5px] mr-1">{format(account.balance)}</span>
        <button
          onClick={startEditing}
          aria-label={`Edit ${account.name}`}
          title="Edit account"
          className="p-2 rounded-lg text-mute hover:text-brand hover:bg-brand-softer transition-colors"
        >
          <Pencil size={15} />
        </button>
        {confirmingDelete ? (
          <div className="flex items-center gap-1.5 bg-red-soft rounded-lg px-1.5 py-1">
            <span className="text-[11px] text-red font-medium px-1">Delete?</span>
            <button
              onClick={() => {
                onDelete(account.id);
                setConfirmingDelete(false);
              }}
              className="p-1.5 rounded-md bg-red text-white hover:brightness-110"
              aria-label="Confirm delete"
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="p-1.5 rounded-md text-mute hover:text-ink"
              aria-label="Cancel delete"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${account.name}`}
            title="Delete account"
            className="p-2 rounded-lg text-mute hover:text-red hover:bg-red-soft transition-colors"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export function NetWorth({
  state,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
}: {
  state: FullState;
  onAddAccount: (a: { name: string; type: AccountType; category: string; balanceUsd: number; interestRate?: number; minPayment?: number }) => void;
  onUpdateAccount: (id: string, patch: { name?: string; balanceUsd?: number; interestRate?: number | null; minPaymentUsd?: number | null }) => void;
  onDeleteAccount: (id: string) => void;
}) {
  const { format, toUsd, currency } = useCurrency();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('asset');
  const [category, setCategory] = useState('cash');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [minPayment, setMinPayment] = useState('');

  const assets = state.accounts.filter((a) => a.type === 'asset');
  const liabilities = state.accounts.filter((a) => a.type === 'liability');
  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const netWorth = totalAssets - totalLiabilities;

  function submit() {
    const b = parseFloat(balance);
    if (!name.trim() || isNaN(b) || b < 0) return;
    onAddAccount({
      name: name.trim(),
      type,
      category,
      balanceUsd: toUsd(b),
      interestRate: type === 'liability' && rate ? parseFloat(rate) : undefined,
      minPayment: type === 'liability' && minPayment ? toUsd(parseFloat(minPayment)) : undefined,
    });
    setName('');
    setBalance('');
    setRate('');
    setMinPayment('');
  }

  return (
    <>
      <div className={`rounded-2xl px-6 py-5 mb-6 text-white relative overflow-hidden animate-fade-up ${netWorth >= 0 ? 'gradient-money' : 'gradient-warm'}`}>
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 animate-float" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-white/75 mb-1 font-medium">Net worth</div>
            <div className="font-num text-[30px] font-extrabold">{format(netWorth)}</div>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/70">Assets</div>
              <div className="font-num font-semibold">{format(totalAssets)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/70">Liabilities</div>
              <div className="font-num font-semibold">{format(totalLiabilities)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6 max-w-md">
        <StatCard label="Total assets" value={format(totalAssets)} detail={`${assets.length} account${assets.length === 1 ? '' : 's'}`} accent="money" />
        <StatCard label="Total liabilities" value={format(totalLiabilities)} detail={`${liabilities.length} account${liabilities.length === 1 ? '' : 's'}`} accent="warm" />
      </div>

      <NetWorthTrend snapshots={state.netWorthSnapshots} format={format} />

      <div className="responsive-form card-lift bg-paper border border-line rounded-2xl p-4 flex flex-wrap gap-3 items-end mt-6 mb-2">
        <Field label="Name">
          <input type="text" placeholder="e.g. Checking" value={name} onChange={(e) => setName(e.target.value)} className={`${inputClassText} w-40`} />
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => {
              const t = e.target.value as AccountType;
              setType(t);
              setCategory(t === 'asset' ? 'cash' : 'credit_card');
            }}
            className={`${inputClassText} w-32`}
          >
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
          </select>
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputClassText} w-44`}>
            {(type === 'asset' ? ASSET_CATEGORIES : LIABILITY_CATEGORIES).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label={`Balance (${currency})`}>
          <input type="number" step="0.01" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} className={`${inputClass} w-28`} />
        </Field>
        {type === 'liability' && (
          <>
            <Field label="APR %">
              <input type="number" step="0.1" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} className={`${inputClass} w-20`} />
            </Field>
            <Field label={`Min pay (${currency})`}>
              <input type="number" step="0.01" placeholder="0.00" value={minPayment} onChange={(e) => setMinPayment(e.target.value)} className={`${inputClass} w-24`} />
            </Field>
          </>
        )}
        <Button onClick={submit} variant="primary">Add account</Button>
      </div>

      <SectionHeading>Assets</SectionHeading>
      {assets.length === 0 ? (
        <EmptyState>No assets tracked yet.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {assets.map((a) => (
            <AccountRow key={a.id} account={a} onUpdateAccount={onUpdateAccount} onDelete={onDeleteAccount} />
          ))}
        </div>
      )}

      <SectionHeading>Liabilities</SectionHeading>
      {liabilities.length === 0 ? (
        <EmptyState>No liabilities tracked yet — nice.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {liabilities.map((a) => (
            <AccountRow key={a.id} account={a} onUpdateAccount={onUpdateAccount} onDelete={onDeleteAccount} />
          ))}
        </div>
      )}
    </>
  );
}
