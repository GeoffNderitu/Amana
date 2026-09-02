import { useEffect, useState } from 'react';
import { api, type ReportSummary } from '../lib/api';
import { useCurrency } from '../lib/CurrencyContext';
import { useToast } from '../components/Toast';
import { StatCard, Button, Field, EmptyState, ProgressBar, inputClass, inputClassText } from '../components/Bits';
import { Download, FileSpreadsheet } from 'lucide-react';

type GroupBy = 'category' | 'group' | 'month' | 'payee';

const BAR_COLORS = ['gradient-brand', 'gradient-money', 'gradient-warm'];

export function Reports() {
  const { format, currency } = useCurrency();
  const { show } = useToast();
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getReportSummary({ from: from || undefined, to: to || undefined, groupBy })
      .then((r) => !cancelled && setReport(r))
      .catch(() => !cancelled && setError('Could not load report.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to, groupBy]);

  async function handleExport() {
    setExporting(true);
    try {
      await api.exportTransactionsCsv({ from: from || undefined, to: to || undefined });
      show(`CSV downloaded — amounts in ${currency}.`, 'success');
    } catch {
      setError('Export failed — try again.');
      show('Export failed — try again', 'error');
    } finally {
      setExporting(false);
    }
  }

  const max = report ? Math.max(1, ...report.data.map((r) => r.total)) : 1;

  return (
    <>
      <div className="card-lift bg-paper border border-line rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-6">
        <Field label="Group by">
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={`${inputClassText} w-40`}>
            <option value="category">Category</option>
            <option value="group">Budget group</option>
            <option value="month">Month</option>
            <option value="payee">Payee</option>
          </select>
        </Field>
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} w-40`} />
        </Field>
        <Field label="To">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} w-40`} />
        </Field>
        <Button onClick={handleExport} variant="primary">
          <span className="flex items-center gap-1.5">
            {exporting ? 'Preparing…' : <><Download size={14} /> Export CSV</>}
          </span>
        </Button>
      </div>

      <div className="flex items-start gap-2 text-xs text-ink-soft bg-brand-softer border border-brand/20 rounded-xl px-3.5 py-2.5 mb-6">
        <FileSpreadsheet size={15} className="text-brand shrink-0 mt-0.5" />
        <span>Exports are in {currency}, matching your account currency — no exchange rate involved.</span>
      </div>

      {error && <div className="text-sm text-red mb-4">{error}</div>}

      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6 max-w-md">
          <StatCard label="Total spent" value={format(report.total)} numericValue={report.total} format={format} accent="warm" />
          <StatCard label="Transactions" value={String(report.count)} accent="brand" />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-mute">Loading…</div>
      ) : !report || report.data.length === 0 ? (
        <EmptyState>No transactions match these filters.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {report.data.map((row, i) => (
            <div key={row.label} className="card-lift bg-paper border border-line rounded-xl px-5 py-3">
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="font-medium">{row.label}</span>
                <span className="font-num font-semibold">{format(row.total)}</span>
              </div>
              <ProgressBar pct={(row.total / max) * 100} colorClass={BAR_COLORS[i % BAR_COLORS.length]} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
