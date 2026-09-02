import { useRef, useState } from 'react';
import { ShieldCheck, Upload, FileText, AlertTriangle, MessageSquareOff, CheckCircle2, X } from 'lucide-react';
import type { FullState, StatementRow, CategorySuggestion } from '../lib/api';
import { api } from '../lib/api';
import { useCurrency } from '../lib/CurrencyContext';
import { Button, EmptyState, inputClassText } from '../components/Bits';
import { parseCSV, guessColumns, normalizeDate, normalizeAmount, type ColumnGuess } from '../lib/csv';

type Step = 'upload' | 'map' | 'review' | 'done';

interface DraftRow extends CategorySuggestion {
  include: boolean;
}

export function Import({ state, onImported }: { state: FullState; onImported: () => void }) {
  const { format, toUsd } = useCurrency();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [guess, setGuess] = useState<ColumnGuess | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const [duplicatesSkipped, setDuplicatesSkipped] = useState(0);
  const [newCategoryFor, setNewCategoryFor] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categories, setCategories] = useState(state.categories);

  function reset() {
    setStep('upload');
    setFileName('');
    setRawRows([]);
    setGuess(null);
    setRows([]);
    setError('');
    setImportedCount(0);
    setDuplicatesSkipped(0);
    if (fileRef.current) fileRef.current.value = '';
  }

  function onFile(file: File) {
    setError('');
    setFileName(file.name);
    const reader = new FileReader();
    // Everything from here down happens in the browser: the file itself is read into
    // memory, parsed, and shown to the user. Nothing is sent anywhere until the user
    // reviews and confirms the extracted rows in the Review step below.
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setError("Couldn't find any rows in that file. Make sure it's a CSV export from your bank or mobile money app.");
        return;
      }
      const g = guessColumns(parsed);
      setRawRows(parsed);
      setGuess(g);
      setStep('map');
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  }

  async function buildDraftRows(g: ColumnGuess) {
    setBusy(true);
    setError('');
    const dataRows = g.hasHeader ? rawRows.slice(1) : rawRows;
    const parsedRows: StatementRow[] = [];
    let bad = 0;
    for (const r of dataRows) {
      const dateRaw = r[g.dateCol];
      const payeeRaw = r[g.payeeCol];
      const amountRaw = r[g.amountCol];
      const date = dateRaw ? normalizeDate(dateRaw) : null;
      const amount = amountRaw ? normalizeAmount(amountRaw) : null;
      if (!date || amount === null || !payeeRaw || !payeeRaw.trim()) {
        bad++;
        continue;
      }
      parsedRows.push({ date, payee: payeeRaw.trim(), amount: Math.abs(toUsd(amount)) });
    }
    setSkipped(bad);
    if (parsedRows.length === 0) {
      setBusy(false);
      setError('No valid transaction rows found — try mapping the columns manually below.');
      return;
    }
    try {
      const { suggestions } = await api.categorizeStatement(parsedRows.slice(0, 1000));
      const draft: DraftRow[] = suggestions.map((s) => ({
        ...s,
        // Pre-uncheck rows we're not confident about, or that look like duplicates or
        // income/deposits — the user opts each of those in rather than us assuming.
        include: !s.isDuplicate && s.confidence !== 'none' && s.reason !== 'unmatched',
      }));
      setRows(draft);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not categorize those rows.');
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function createCategoryForRow(i: number) {
    if (!newCategoryName.trim()) return;
    try {
      const updated = await api.addCategory(newCategoryName.trim(), rows[i].suggestedGroup || 'Custom');
      setCategories(updated);
      const created = updated[updated.length - 1];
      updateRow(i, { categoryId: created.id, include: true });
      setNewCategoryFor(null);
      setNewCategoryName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create category');
    }
  }

  async function confirmImport() {
    const finalRows = rows.filter((r) => r.include && r.categoryId).map((r) => ({ date: r.date, payee: r.payee, amount: r.amount, categoryId: r.categoryId as string }));
    if (finalRows.length === 0) {
      setError('Pick at least one row with a category to import.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { imported } = await api.importStatement(finalRows);
      setImportedCount(imported);
      setDuplicatesSkipped(rows.filter((r) => r.isDuplicate).length);
      setStep('done');
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  const includedCount = rows.filter((r) => r.include).length;

  return (
    <>
      <div className="gradient-brand rounded-2xl px-6 py-5 mb-6 text-white relative overflow-hidden animate-fade-up">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 animate-float" />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-wide text-white/70 mb-1 font-medium">Import a statement</div>
          <div className="font-num text-[22px] font-extrabold">Upload once, categorize instantly</div>
          <div className="text-xs text-white/80 mt-1 max-w-lg">
            We read the file in your browser and only send the transaction rows you approve — never the file itself.
          </div>
        </div>
      </div>

      <div className="card-lift bg-brand-softer border-l-[3px] border-brand rounded-r-xl px-4 py-3 mb-5 flex gap-3 items-start">
        <ShieldCheck size={18} className="text-brand shrink-0 mt-0.5" />
        <div className="text-[13px] text-ink-soft leading-relaxed">
          <b className="text-ink font-semibold">Your statement stays on your device.</b> The CSV is parsed locally in your
          browser. We never store the original file — only the date, payee, and amount of the rows you choose to
          import, after you've reviewed them below. See our{' '}
          <span className="underline decoration-dotted cursor-default">Privacy Policy</span> for the full data-handling
          details.
        </div>
      </div>

      {step === 'upload' && (
        <div className="card-lift bg-paper border border-line rounded-2xl p-8 text-center">
          <Upload size={28} className="mx-auto text-brand mb-3" />
          <div className="text-sm font-semibold mb-1">Upload a CSV statement</div>
          <div className="text-xs text-mute mb-4 max-w-sm mx-auto">
            Most banks and mobile money apps let you export recent transactions as a CSV file. Drop it here or choose a
            file below.
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button variant="primary" onClick={() => fileRef.current?.click()}>
            Choose CSV file
          </Button>
          {error && <div className="text-xs text-red mt-3">{error}</div>}

          <div className="mt-8 pt-6 border-t border-line text-left max-w-sm mx-auto">
            <div className="flex items-center gap-2 text-xs font-semibold text-mute mb-1">
              <MessageSquareOff size={13} /> SMS auto-import
            </div>
            <div className="text-xs text-mute">
              Reading transaction alerts straight from SMS is on our roadmap — it needs careful handling to get right,
              so for now, statement upload is the fastest way in.{' '}
              <span className="inline-block ml-1 px-1.5 py-0.5 rounded-full bg-cloud text-[10px] font-bold uppercase tracking-wide">
                Coming soon
              </span>
            </div>
          </div>
        </div>
      )}

      {step === 'map' && guess && (
        <div className="card-lift bg-paper border border-line rounded-2xl p-5">
          <div className="text-sm font-semibold mb-1 flex items-center gap-2">
            <FileText size={15} className="text-brand" /> {fileName}
          </div>
          <div className="text-xs text-mute mb-4">
            We matched these columns automatically. Check the preview below, then continue — you can still edit every
            row's category on the next screen.
          </div>
          <ColumnMapPreview rows={rawRows} guess={guess} onChange={setGuess} />
          {error && <div className="text-xs text-red mt-3">{error}</div>}
          <div className="flex gap-2 mt-4">
            <Button onClick={reset} variant="ghost">
              Cancel
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => guess && buildDraftRows(guess)}>
              {busy ? 'Reading rows…' : 'Continue'}
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="card-lift bg-paper border border-line rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div className="text-sm font-semibold">Review {rows.length} transactions</div>
            <div className="text-xs text-mute">{includedCount} selected to import</div>
          </div>
          {skipped > 0 && (
            <div className="text-xs text-mute mb-3">{skipped} row{skipped === 1 ? '' : 's'} couldn't be read and were skipped.</div>
          )}
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-mute uppercase text-[10px] tracking-wide">
                  <th className="px-2 py-1.5 w-8"></th>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Payee</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                  <th className="px-2 py-1.5">Category</th>
                  <th className="px-2 py-1.5">Match</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-t border-line ${!r.include ? 'opacity-50' : ''}`}>
                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={r.include} onChange={(e) => updateRow(i, { include: e.target.checked })} />
                    </td>
                    <td className="px-2 py-1.5 font-num whitespace-nowrap">{r.date}</td>
                    <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.payee}>
                      {r.payee}
                    </td>
                    <td className="px-2 py-1.5 font-num text-right whitespace-nowrap">{format(r.amount)}</td>
                    <td className="px-2 py-1.5">
                      {newCategoryFor === i ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && createCategoryForRow(i)}
                            placeholder={r.suggestedGroup || 'New category'}
                            className={`${inputClassText} !py-1 !text-xs w-28`}
                          />
                          <button onClick={() => createCategoryForRow(i)} className="text-brand" title="Create">
                            <CheckCircle2 size={15} />
                          </button>
                          <button onClick={() => setNewCategoryFor(null)} className="text-mute" title="Cancel">
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <select
                          value={r.categoryId ?? ''}
                          onChange={(e) => {
                            if (e.target.value === '__new__') {
                              setNewCategoryFor(i);
                              setNewCategoryName('');
                            } else {
                              updateRow(i, { categoryId: e.target.value || null, include: true });
                            }
                          }}
                          className={`${inputClassText} !py-1 !text-xs`}
                        >
                          <option value="">Choose…</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                          <option value="__new__">+ New category{r.suggestedGroup ? ` (${r.suggestedGroup})` : ''}</option>
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <MatchBadge r={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <div className="text-xs text-red mt-3">{error}</div>}
          <div className="flex gap-2 mt-4">
            <Button onClick={reset} variant="ghost">
              Start over
            </Button>
            <Button variant="primary" disabled={busy || includedCount === 0} onClick={confirmImport}>
              {busy ? 'Importing…' : `Import ${includedCount} transaction${includedCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="card-lift bg-paper border border-line rounded-2xl p-8 text-center">
          <CheckCircle2 size={28} className="mx-auto text-emerald-deep mb-3" />
          <div className="text-sm font-semibold mb-1">
            Imported {importedCount} transaction{importedCount === 1 ? '' : 's'}
          </div>
          {duplicatesSkipped > 0 && (
            <div className="text-xs text-mute mb-2">
              {duplicatesSkipped} likely duplicate{duplicatesSkipped === 1 ? ' was' : 's were'} left unchecked and skipped.
            </div>
          )}
          <div className="text-xs text-mute mb-4">The next import from this payee will be recognized automatically.</div>
          <Button variant="primary" onClick={reset}>
            Import another statement
          </Button>
        </div>
      )}

      {categories.length === 0 && step === 'upload' && (
        <div className="mt-4">
          <EmptyState>Tip: add a few budget categories first so we have something to auto-match transactions to.</EmptyState>
        </div>
      )}
    </>
  );
}

function MatchBadge({ r }: { r: DraftRow }) {
  if (r.isDuplicate) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-soft text-red">
        <AlertTriangle size={10} /> Possible duplicate
      </span>
    );
  }
  const label =
    r.confidence === 'high' ? 'Auto-matched' : r.confidence === 'medium' ? 'Suggested' : r.reason === 'keyword' ? 'Suggested group' : 'Needs review';
  const cls =
    r.confidence === 'high'
      ? 'bg-emerald-soft text-emerald-deep'
      : r.confidence === 'medium'
      ? 'bg-brand-softer text-brand'
      : 'bg-cloud text-mute';
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function ColumnMapPreview({
  rows,
  guess,
  onChange,
}: {
  rows: string[][];
  guess: ColumnGuess;
  onChange: (g: ColumnGuess) => void;
}) {
  const ncols = Math.max(...rows.slice(0, 5).map((r) => r.length));
  const preview = rows.slice(guess.hasHeader ? 1 : 0, guess.hasHeader ? 4 : 3);
  const cols = [...Array(ncols).keys()];

  function select(field: 'dateCol' | 'payeeCol' | 'amountCol', label: string) {
    return (
      <select
        value={guess[field]}
        onChange={(e) => onChange({ ...guess, [field]: Number(e.target.value) })}
        className={`${inputClassText} !py-1 !text-xs`}
      >
        {cols.map((c) => (
          <option key={c} value={c}>
            {label} = column {c + 1}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {select('dateCol', 'Date')}
        {select('payeeCol', 'Payee')}
        {select('amountCol', 'Amount')}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border border-line rounded-lg overflow-hidden">
          <tbody>
            {preview.map((r, i) => (
              <tr key={i} className="border-t border-line first:border-t-0">
                {cols.map((c) => (
                  <td
                    key={c}
                    className={`px-2 py-1 whitespace-nowrap ${
                      c === guess.dateCol || c === guess.payeeCol || c === guess.amountCol ? 'bg-brand-softer font-medium' : ''
                    }`}
                  >
                    {r[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
