import { useEffect, useState } from 'react';
import { Copy, Check, X, Link2, QrCode as QrCodeIcon, Hash, Share2, AlertTriangle, UserPlus, RefreshCw } from 'lucide-react';
import { connectionsApi, type Connection, type ConnectPreview } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { QrCode } from '../components/QrCode';
import { Button, SectionHeading, EmptyState, ProgressBar, inputClassText } from '../components/Bits';
import { buildConnectLink } from '../lib/inviteLink';
import { useSnapshotRates } from '../lib/useSnapshotRates';

function fmtAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function ConnectionCard({
  conn,
  onRemove,
  convert,
  ratesLoading,
}: {
  conn: Connection;
  onRemove: (id: string, name: string) => void;
  convert: (amountUsd: number, currency: string) => { amount: number; currency: string };
  ratesLoading: boolean;
}) {
  const goalsPct = conn.goalsTarget > 0 ? Math.min(100, (conn.goalsSaved / conn.goalsTarget) * 100) : 0;
  const overspent = conn.overspentCategoryCount > 0;
  // Every raw figure from the snapshot API is in USD (see server/src/snapshot.ts) — convert
  // each one into this connection's own currency before formatting it, rather than
  // formatting the raw USD number with their currency symbol slapped on top of it.
  const spent = convert(conn.spentThisMonth, conn.currency);
  const savedAmt = convert(conn.actualSavedThisMonth, conn.currency);
  const netWorthAmt = convert(conn.netWorth, conn.currency);
  const overspentAmt = convert(conn.overspentTotal, conn.currency);
  const goalsSavedAmt = convert(conn.goalsSaved, conn.currency);
  const goalsTargetAmt = convert(conn.goalsTarget, conn.currency);
  return (
    <div className="card-lift bg-paper border border-line rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <Avatar emoji={conn.avatarEmoji} color={conn.avatarColor} image={conn.avatarImage} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[15px]">{conn.name}</div>
          <div className="text-xs text-mute">
            {conn.currency}
            {ratesLoading && <span className="ml-1.5 text-mute/70">· converting…</span>}
          </div>
        </div>
        {overspent && (
          <span
            title={`${conn.overspentCategoryCount} ${conn.overspentCategoryCount === 1 ? 'category is' : 'categories are'} over budget`}
            className="shrink-0 flex items-center gap-1 text-[10.5px] font-semibold text-red bg-red-soft px-2 py-1 rounded-full"
          >
            <AlertTriangle size={11} /> Over budget
          </span>
        )}
        <button
          onClick={() => onRemove(conn.id, conn.name)}
          className="text-mute hover:text-red transition-colors shrink-0"
          title={`Remove connection with ${conn.name}`}
        >
          <X size={15} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mute font-medium">Spent this month</div>
          <div className="font-num text-sm font-semibold mt-0.5">{fmtAmount(spent.amount, spent.currency)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mute font-medium">Saved this month</div>
          <div className="font-num text-sm font-semibold mt-0.5 text-emerald-deep">{fmtAmount(savedAmt.amount, savedAmt.currency)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mute font-medium">Savings rate</div>
          <div className="font-num text-sm font-semibold mt-0.5">{(conn.savingsRate * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mute font-medium">Net worth</div>
          <div className={`font-num text-sm font-semibold mt-0.5 ${netWorthAmt.amount < 0 ? 'text-red' : ''}`}>{fmtAmount(netWorthAmt.amount, netWorthAmt.currency)}</div>
        </div>
      </div>

      {overspent && (
        <div className="text-[11px] text-red bg-red-soft rounded-lg px-2.5 py-1.5 mb-3">
          {conn.overspentCategoryCount} {conn.overspentCategoryCount === 1 ? 'category is' : 'categories are'} over budget, by{' '}
          {fmtAmount(overspentAmt.amount, overspentAmt.currency)} total — no line items shared, just the heads-up.
        </div>
      )}

      {conn.goalsCount > 0 && (
        <div>
          <div className="flex justify-between text-[11px] text-ink-soft mb-1">
            <span>Goals ({conn.goalsCount})</span>
            <span className="font-num">{fmtAmount(goalsSavedAmt.amount, goalsSavedAmt.currency)} of {fmtAmount(goalsTargetAmt.amount, goalsTargetAmt.currency)}</span>
          </div>
          <ProgressBar pct={goalsPct} colorClass="gradient-money" height="h-1.5" />
        </div>
      )}
    </div>
  );
}

type ShareTab = 'code' | 'link' | 'qr';

function SharePanel({ code, onRegenerate, busy }: { code: string; onRegenerate: () => void; busy: boolean }) {
  const [tab, setTab] = useState<ShareTab>('code');
  const [copied, setCopied] = useState<ShareTab | null>(null);
  const link = buildConnectLink(code);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  function copy(text: string, which: ShareTab) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: 'Connect with me on Amana', text: `Use my connect code ${code} to link accounts on Amana.`, url: link });
    } catch {
      // user cancelled the share sheet
    }
  }

  const tabs: { id: ShareTab; label: string; icon: React.ElementType }[] = [
    { id: 'code', label: 'Code', icon: Hash },
    { id: 'link', label: 'Link', icon: Link2 },
    { id: 'qr', label: 'QR code', icon: QrCodeIcon },
  ];

  return (
    <div className="card-lift bg-paper border border-line rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold">Your connect code</div>
        <button onClick={onRegenerate} disabled={busy} className="text-xs text-mute hover:text-brand flex items-center gap-1 transition-colors">
          <RefreshCw size={11} /> New code
        </button>
      </div>
      <div className="flex gap-1 mb-4 bg-cloud rounded-xl p-1 w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active ? 'bg-paper shadow-sm text-ink' : 'text-mute hover:text-ink-soft'
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'code' && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="font-num text-xl font-bold tracking-[0.2em] bg-cloud border border-line rounded-xl px-4 py-2.5">{code}</div>
          <Button onClick={() => copy(code, 'code')}>
            {copied === 'code' ? <Check size={13} className="inline mr-1.5 -mt-0.5" /> : <Copy size={13} className="inline mr-1.5 -mt-0.5" />}
            {copied === 'code' ? 'Copied' : 'Copy code'}
          </Button>
          <p className="text-xs text-mute">Give this to anyone — they enter it on their own Connections page to pair with you.</p>
        </div>
      )}

      {tab === 'link' && (
        <div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={`${inputClassText} flex-1 font-num text-xs`} />
            <div className="flex gap-2">
              <Button onClick={() => copy(link, 'link')}>
                {copied === 'link' ? <Check size={13} className="inline mr-1.5 -mt-0.5" /> : <Copy size={13} className="inline mr-1.5 -mt-0.5" />}
                {copied === 'link' ? 'Copied' : 'Copy'}
              </Button>
              {canShare && (
                <Button onClick={nativeShare} variant="primary">
                  <Share2 size={13} className="inline mr-1.5 -mt-0.5" /> Share
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-mute mt-2.5">Opening this link takes them straight to sign-up (or sign-in), ready to connect with you.</p>
        </div>
      )}

      {tab === 'qr' && (
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <QrCode value={link} />
          <p className="text-xs text-mute max-w-xs">Scan this with a phone camera to open the connect link directly.</p>
        </div>
      )}
    </div>
  );
}

export function Connections({ connectCodeFromLink, onConsumedConnect }: { connectCodeFromLink?: string | null; onConsumedConnect?: () => void }) {
  const { convert, loading: ratesLoading } = useSnapshotRates();
  const [code, setCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [list, setList] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectPreview, setConnectPreview] = useState<ConnectPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await connectionsApi.get();
      setCode(res.code);
      setList(res.connections);
    } catch (e: any) {
      setError(e.message || 'Could not load your connections');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!connectCodeFromLink) return;
    setJoinInput(connectCodeFromLink);
    connectionsApi
      .preview(connectCodeFromLink)
      .then(setConnectPreview)
      .catch((e: any) => setPreviewError(e.message || "That connect link doesn't look valid"));
  }, [connectCodeFromLink]);

  async function join(withCode?: string) {
    const target = (withCode ?? joinInput).trim();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await connectionsApi.join(target);
      setCode(res.code);
      setList(res.connections);
      setJoinInput('');
      setConnectPreview(null);
      onConsumedConnect?.();
    } catch (e: any) {
      setError(e.message || 'Could not connect with that code');
    } finally {
      setBusy(false);
    }
  }

  async function remove(otherId: string, name: string) {
    if (!confirm(`Remove your connection with ${name}?`)) return;
    setBusy(true);
    try {
      const res = await connectionsApi.remove(otherId);
      setList(res.connections);
    } catch (e: any) {
      setError(e.message || 'Could not remove that connection');
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const res = await connectionsApi.regenerateCode();
      setCode(res.code);
    } catch (e: any) {
      setError(e.message || 'Could not generate a new code');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="font-num text-sm text-mute">Loading…</div>;
  }

  return (
    <>
      {error && <div className="text-xs text-red mb-4">{error}</div>}

      {connectCodeFromLink && (
        <div className="card-lift gradient-brand rounded-2xl px-6 py-5 mb-6 text-white relative overflow-hidden animate-fade-up max-w-2xl">
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 animate-float" />
          <div className="relative">
            <div className="text-[11px] uppercase tracking-wide text-white/70 mb-1 font-medium">Connection request</div>
            {previewError ? (
              <div className="text-sm text-white/90">{previewError} — you can still enter a code manually below.</div>
            ) : connectPreview ? (
              <div className="flex items-center gap-3">
                <Avatar emoji={connectPreview.avatarEmoji} color={connectPreview.avatarColor} image={connectPreview.avatarImage} size={40} />
                <div>
                  <div className="text-lg font-bold">{connectPreview.name}</div>
                  <div className="text-xs text-white/80 mb-2">wants to connect with you on Amana</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-white/90 font-num">Loading…</div>
            )}
            {connectPreview && !previewError && (
              <Button onClick={() => join(connectCodeFromLink)} disabled={busy}>
                {busy ? 'Connecting…' : `Connect with ${connectPreview.name}`}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="card-lift bg-paper border border-line rounded-2xl p-5 mb-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus size={16} className="text-brand" />
          <div className="text-[13px] font-semibold">Connect with anyone</div>
        </div>
        <p className="text-xs text-mute leading-relaxed mb-3.5">
          Unlike a household, a connection is one-to-one and there's no limit — pair with a partner, a friend, a parent, or
          anyone you want keeping an eye on the same high-level numbers as you: income, spend, savings, and net worth. Never
          the transactions behind them.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter their connect code"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            className={`${inputClassText} flex-1 font-num tracking-wider`}
            maxLength={6}
          />
          <Button onClick={() => join()} variant="primary" disabled={busy}>
            {busy ? '…' : 'Connect'}
          </Button>
        </div>
      </div>

      <SharePanel code={code} onRegenerate={regenerate} busy={busy} />

      <SectionHeading>Your connections</SectionHeading>
      {list.length === 0 ? (
        <EmptyState>No connections yet — share your code above, or enter someone else's to pair up.</EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3.5">
          {list.map((c) => (
            <ConnectionCard key={c.id} conn={c} onRemove={remove} convert={convert} ratesLoading={ratesLoading} />
          ))}
        </div>
      )}
    </>
  );
}
