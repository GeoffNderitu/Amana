import { useState } from 'react';
import type { FullState, Recipient, Remittance } from '../lib/api';
import { CURRENCIES } from '../lib/currencies';
import { StatCard, SectionHeading, InsightCard, Button, Field, EmptyState, inputClass, inputClassText } from '../components/Bits';
import { useDisplayCurrency } from '../lib/useDisplayCurrency';
import { useCurrency } from '../lib/CurrencyContext';

function fmtAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

const currentYear = new Date().toISOString().slice(0, 4);

function CurrencySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClassText} w-24`}>
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code}
        </option>
      ))}
    </select>
  );
}

function RecipientCard({
  recipient,
  remittances,
  onDelete,
  onLogTransfer,
}: {
  recipient: Recipient;
  remittances: Remittance[];
  onDelete: (id: string) => void;
  onLogTransfer: (recipientId: string) => void;
}) {
  const mine = remittances.filter((r) => r.recipientId === recipient.id);
  const sentThisYear = mine.filter((r) => r.date.startsWith(currentYear)).reduce((s, r) => s + r.amountSent, 0);
  const lastTransfer = mine[0]; // remittances arrive sorted by date desc from the API
  const monthlySoFar = mine
    .filter((r) => r.date.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((s, r) => s + r.amountSent, 0);
  const pct = recipient.monthlyTarget ? Math.min(100, (monthlySoFar / recipient.monthlyTarget) * 100) : null;

  return (
    <div className="card-lift bg-paper border border-line rounded-2xl p-5">
      <div className="flex justify-between items-start gap-3 mb-3">
        <div>
          <div className="font-semibold text-[15.5px]">{recipient.name}</div>
          <div className="text-xs text-mute mt-0.5">
            {[recipient.relationship, recipient.country].filter(Boolean).join(' · ') || 'No details added'}
          </div>
        </div>
        <span className="text-[11px] font-medium bg-clay-soft text-clay-deep px-2.5 py-1 rounded-full shrink-0">{recipient.currency}</span>
      </div>

      {recipient.monthlyTarget != null && pct !== null && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-ink-soft mb-1.5">
            <span>This month</span>
            <span className="font-num">
              {fmtAmount(monthlySoFar, recipient.currency)} <span className="text-mute">of</span> {fmtAmount(recipient.monthlyTarget, recipient.currency)}
            </span>
          </div>
          <div className="h-2 bg-cloud-dim rounded-full overflow-hidden">
            <div className="h-full rounded-full gradient-warm transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="text-xs text-ink-soft mb-3.5">
        {fmtAmount(sentThisYear, recipient.currency)} sent in {currentYear}
        {lastTransfer && <span> · last sent {lastTransfer.date}</span>}
      </div>

      <div className="flex gap-2">
        <Button onClick={() => onLogTransfer(recipient.id)} variant="primary">
          Log a transfer
        </Button>
        <Button onClick={() => onDelete(recipient.id)} variant="danger">
          Remove
        </Button>
      </div>
    </div>
  );
}

export function Family({
  state,
  onAddRecipient,
  onDeleteRecipient,
  onAddRemittance,
  onDeleteRemittance,
}: {
  state: FullState;
  onAddRecipient: (r: { name: string; relationship?: string; country?: string; currency: string; monthlyTarget?: number | null }) => void;
  onDeleteRecipient: (id: string) => void;
  onAddRemittance: (r: {
    recipientId: string;
    date: string;
    amountSent: number;
    currencySent: string;
    amountReceived?: number | null;
    currencyReceived?: string | null;
    fee: number;
    method?: string;
    note?: string;
  }) => void;
  onDeleteRemittance: (id: string) => void;
}) {
  const { recipients, remittances } = state;
  const { currency: accountCurrency } = useCurrency();
  const display = useDisplayCurrency(accountCurrency);

  // Add recipient form
  const [rName, setRName] = useState('');
  const [rRelationship, setRRelationship] = useState('');
  const [rCountry, setRCountry] = useState('');
  const [rCurrency, setRCurrency] = useState('KES');
  const [rTarget, setRTarget] = useState('');

  // Log transfer form
  const [tRecipientId, setTRecipientId] = useState('');
  const [tDate, setTDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tSent, setTSent] = useState('');
  const [tSentCurrency, setTSentCurrency] = useState('USD');
  const [tReceived, setTReceived] = useState('');
  const [tReceivedCurrency, setTReceivedCurrency] = useState('KES');
  const [tFee, setTFee] = useState('');
  const [tMethod, setTMethod] = useState('');

  const sentThisYearByCurrency = new Map<string, number>();
  const feesThisYearByCurrency = new Map<string, number>();
  for (const r of remittances) {
    if (!r.date.startsWith(currentYear)) continue;
    sentThisYearByCurrency.set(r.currencySent, (sentThisYearByCurrency.get(r.currencySent) || 0) + r.amountSent);
    // Fees are logged in the same currency as the amount sent (see the "Log a transfer"
    // form below — there's no separate fee-currency picker), so they have to be bucketed
    // the same way totals are, not summed into one raw number and labeled with whichever
    // currency happened to have the largest total *sent* this year. Someone who mostly
    // sends KES but paid a $5 fee on one USD transfer would otherwise see that $5 silently
    // added into a KES-labeled total — a completely different, much larger-looking number.
    if (r.fee > 0) feesThisYearByCurrency.set(r.currencySent, (feesThisYearByCurrency.get(r.currencySent) || 0) + r.fee);
  }
  const topCurrency = [...sentThisYearByCurrency.entries()].sort((a, b) => b[1] - a[1])[0];
  const feesTopCurrency = [...feesThisYearByCurrency.entries()].sort((a, b) => b[1] - a[1])[0];

  // Converts every currency logged this year into the chosen display currency and sums
  // them — useful the moment someone supports more than one person in more than one
  // currency, since "top currency" alone hides the real total.
  const totalThisYearInDisplayCurrency = [...sentThisYearByCurrency.entries()].reduce(
    (sum, [cur, amount]) => sum + display.convert(amount, cur),
    0
  );
  const totalFeesInDisplayCurrency = [...feesThisYearByCurrency.entries()].reduce(
    (sum, [cur, amount]) => sum + display.convert(amount, cur),
    0
  );
  const multiCurrency = sentThisYearByCurrency.size > 1;
  const multiCurrencyFees = feesThisYearByCurrency.size > 1;

  function submitRecipient() {
    if (!rName.trim()) return;
    onAddRecipient({
      name: rName.trim(),
      relationship: rRelationship.trim() || undefined,
      country: rCountry.trim() || undefined,
      currency: rCurrency,
      monthlyTarget: rTarget ? parseFloat(rTarget) : null,
    });
    setRName('');
    setRRelationship('');
    setRCountry('');
    setRTarget('');
  }

  function submitTransfer() {
    const sent = parseFloat(tSent);
    if (!tRecipientId || isNaN(sent) || sent <= 0) return;
    onAddRemittance({
      recipientId: tRecipientId,
      date: tDate,
      amountSent: sent,
      currencySent: tSentCurrency,
      amountReceived: tReceived ? parseFloat(tReceived) : null,
      currencyReceived: tReceived ? tReceivedCurrency : null,
      fee: tFee ? parseFloat(tFee) : 0,
      method: tMethod.trim() || undefined,
    });
    setTSent('');
    setTReceived('');
    setTFee('');
    setTMethod('');
  }

  const hasFees = feesThisYearByCurrency.size > 0;
  // Prefer showing fees in whatever single currency they were actually paid in — that's
  // always exact, no conversion involved. Only fall back to a converted, display-currency
  // total once more than one fee currency is in play (and only once live rates are
  // actually available — never silently label an unconverted number with the wrong
  // currency, which was the original bug here).
  const feesLabel = !hasFees
    ? null
    : !multiCurrencyFees
      ? fmtAmount(feesTopCurrency![1], feesTopCurrency![0])
      : !display.ratesLoading && !display.ratesError
        ? `≈ ${fmtAmount(totalFeesInDisplayCurrency, display.currency)}`
        : null;

  function startTransferFor(recipientId: string) {
    setTRecipientId(recipientId);
    const recipient = recipients.find((r) => r.id === recipientId);
    if (recipient) setTReceivedCurrency(recipient.currency);
    document.getElementById('log-transfer-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <>
      <div className="gradient-warm rounded-2xl px-6 py-5 mb-6 text-white relative overflow-hidden animate-fade-up">
        <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-white/10 animate-float" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-white/75 mb-1 font-medium">Sent in {currentYear}</div>
            <div className="font-num text-[28px] font-extrabold">{topCurrency ? fmtAmount(topCurrency[1], topCurrency[0]) : '—'}</div>
            <div className="text-xs text-white/85 mt-1">
              {recipients.length} {recipients.length === 1 ? 'person' : 'people'} supported
              {feesLabel && ` · ${feesLabel} in fees this year`}
            </div>
            {multiCurrency && !display.ratesLoading && !display.ratesError && (
              <div className="text-xs text-white/85 mt-1">
                ≈ {fmtAmount(totalThisYearInDisplayCurrency, display.currency)} total across all currencies
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <label className="text-[10px] uppercase tracking-wide text-white/70 font-medium">View totals in</label>
            <select
              value={display.currency}
              onChange={(e) => display.setCurrency(e.target.value)}
              className="bg-white/15 hover:bg-white/25 transition text-white text-sm font-semibold rounded-lg px-2.5 py-1.5 outline-none border border-white/20"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code} className="text-ink">
                  {c.code}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6 max-w-md">
        <StatCard label="Fees paid" value={feesLabel ?? '—'} detail="This year, across transfers" accent="warm" />
        <StatCard label="People supported" value={String(recipients.length)} accent="brand" />
      </div>

      {recipients.length > 0 && remittances.length === 0 && (
        <div className="mb-6">
          <InsightCard text="Add your first transfer below to start seeing real totals — what you sent, what actually arrived, and what fees cost you over time." />
        </div>
      )}

      <SectionHeading>People you support</SectionHeading>
      <div className="responsive-form card-lift bg-paper border border-line rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-5">
        <Field label="Name">
          <input type="text" placeholder="e.g. Mama" value={rName} onChange={(e) => setRName(e.target.value)} className={`${inputClassText} w-36`} />
        </Field>
        <Field label="Relationship">
          <input type="text" placeholder="e.g. Mother" value={rRelationship} onChange={(e) => setRRelationship(e.target.value)} className={`${inputClassText} w-36`} />
        </Field>
        <Field label="Country">
          <input type="text" placeholder="e.g. Kenya" value={rCountry} onChange={(e) => setRCountry(e.target.value)} className={`${inputClassText} w-32`} />
        </Field>
        <Field label="Their currency">
          <CurrencySelect value={rCurrency} onChange={setRCurrency} />
        </Field>
        <Field label="Monthly target (optional)">
          <input type="number" step="1" placeholder="0" value={rTarget} onChange={(e) => setRTarget(e.target.value)} className={`${inputClass} w-28`} />
        </Field>
        <Button onClick={submitRecipient} variant="primary">
          Add
        </Button>
      </div>

      {recipients.length === 0 ? (
        <EmptyState>No one added yet — add a family member or friend you regularly support above.</EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3.5 mb-2">
          {recipients.map((r) => (
            <RecipientCard key={r.id} recipient={r} remittances={remittances} onDelete={onDeleteRecipient} onLogTransfer={startTransferFor} />
          ))}
        </div>
      )}

      {recipients.length > 0 && (
        <>
          <SectionHeading>Log a transfer</SectionHeading>
          <div id="log-transfer-form" className="responsive-form card-lift bg-paper border border-line rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-6">
            <Field label="Recipient">
              <select value={tRecipientId} onChange={(e) => setTRecipientId(e.target.value)} className={`${inputClassText} w-40`}>
                <option value="">Choose…</option>
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} className={`${inputClass} w-36`} />
            </Field>
            <Field label="You sent">
              <div className="flex gap-1.5">
                <input type="number" step="0.01" placeholder="0.00" value={tSent} onChange={(e) => setTSent(e.target.value)} className={`${inputClass} w-24`} />
                <CurrencySelect value={tSentCurrency} onChange={setTSentCurrency} />
              </div>
            </Field>
            <Field label="They received (optional)">
              <div className="flex gap-1.5">
                <input type="number" step="0.01" placeholder="0.00" value={tReceived} onChange={(e) => setTReceived(e.target.value)} className={`${inputClass} w-24`} />
                <CurrencySelect value={tReceivedCurrency} onChange={setTReceivedCurrency} />
              </div>
            </Field>
            <Field label="Fee">
              <input type="number" step="0.01" placeholder="0.00" value={tFee} onChange={(e) => setTFee(e.target.value)} className={`${inputClass} w-20`} />
            </Field>
            <Field label="Method (optional)">
              <input type="text" placeholder="e.g. Wise" value={tMethod} onChange={(e) => setTMethod(e.target.value)} className={`${inputClassText} w-28`} />
            </Field>
            <Button onClick={submitTransfer} variant="primary">
              Save transfer
            </Button>
          </div>
        </>
      )}

      {remittances.length > 0 && (
        <>
          <SectionHeading>Recent transfers</SectionHeading>
          <div className="flex flex-col gap-2">
            {remittances.slice(0, 25).map((r) => {
              const recipient = recipients.find((rec) => rec.id === r.recipientId);
              return (
                <div key={r.id} className="card-lift bg-paper border border-line rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">{recipient?.name ?? 'Unknown recipient'}</div>
                    <div className="text-xs text-mute mt-0.5">
                      {r.date}
                      {r.method && <span> · {r.method}</span>}
                      {r.fee > 0 && <span> · fee {fmtAmount(r.fee, r.currencySent)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-num text-sm font-semibold">{fmtAmount(r.amountSent, r.currencySent)}</div>
                      {r.amountReceived != null && r.currencyReceived && (
                        <div className="font-num text-xs text-mute">→ {fmtAmount(r.amountReceived, r.currencyReceived)}</div>
                      )}
                    </div>
                    <Button onClick={() => onDeleteRemittance(r.id)} variant="danger">
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
