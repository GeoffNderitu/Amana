import { useEffect, useState } from 'react';
import { Copy, Check, LogOut, RefreshCw, Users, Link2, QrCode as QrCodeIcon, Hash, Share2, AlertTriangle, PartyPopper } from 'lucide-react';
import { householdApi, type HouseholdInfo, type HouseholdMember, type HouseholdPreview } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { Avatar } from '../components/Avatar';
import { QrCode } from '../components/QrCode';
import { Button, SectionHeading, EmptyState, ProgressBar, inputClassText } from '../components/Bits';
import { buildInviteLink } from '../lib/inviteLink';
import { useSnapshotRates } from '../lib/useSnapshotRates';

function fmtAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function MemberCard({
  member,
  isYou,
  convert,
  ratesLoading,
}: {
  member: HouseholdMember;
  isYou: boolean;
  convert: (amountUsd: number, currency: string) => { amount: number; currency: string };
  ratesLoading: boolean;
}) {
  const goalsPct = member.goalsTarget > 0 ? Math.min(100, (member.goalsSaved / member.goalsTarget) * 100) : 0;
  const overspent = member.overspentCategoryCount > 0;
  // Every raw figure from the snapshot API is in USD (see server/src/snapshot.ts) —
  // convert *each one* into this member's own currency before it's ever formatted, rather
  // than formatting the raw USD number with this member's currency symbol slapped on it.
  const spent = convert(member.spentThisMonth, member.currency);
  const savedAmt = convert(member.actualSavedThisMonth, member.currency);
  const netWorthAmt = convert(member.netWorth, member.currency);
  const overspentAmt = convert(member.overspentTotal, member.currency);
  const goalsSavedAmt = convert(member.goalsSaved, member.currency);
  const goalsTargetAmt = convert(member.goalsTarget, member.currency);
  return (
    <div className="card-lift bg-paper border border-line rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <Avatar emoji={member.avatarEmoji} color={member.avatarColor} image={member.avatarImage} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[15px] flex items-center gap-1.5">
            {member.name}
            {isYou && <span className="text-[10px] font-medium text-mute bg-cloud-dim px-1.5 py-0.5 rounded-full">You</span>}
          </div>
          <div className="text-xs text-mute">
            {member.currency}
            {ratesLoading && <span className="ml-1.5 text-mute/70">· converting…</span>}
          </div>
        </div>
        {overspent && (
          <span
            title={`${member.overspentCategoryCount} ${member.overspentCategoryCount === 1 ? 'category is' : 'categories are'} over budget`}
            className="shrink-0 flex items-center gap-1 text-[10.5px] font-semibold text-red bg-red-soft px-2 py-1 rounded-full"
          >
            <AlertTriangle size={11} /> Over budget
          </span>
        )}
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
          <div className="font-num text-sm font-semibold mt-0.5">{(member.savingsRate * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mute font-medium">Net worth</div>
          <div className={`font-num text-sm font-semibold mt-0.5 ${netWorthAmt.amount < 0 ? 'text-red' : ''}`}>{fmtAmount(netWorthAmt.amount, netWorthAmt.currency)}</div>
        </div>
      </div>

      {overspent && (
        <div className="text-[11px] text-red bg-red-soft rounded-lg px-2.5 py-1.5 mb-3">
          {member.overspentCategoryCount} {member.overspentCategoryCount === 1 ? 'category is' : 'categories are'} over budget, by{' '}
          {fmtAmount(overspentAmt.amount, overspentAmt.currency)} total — no line items shared, just the heads-up.
        </div>
      )}

      {member.goalsCount > 0 && (
        <div>
          <div className="flex justify-between text-[11px] text-ink-soft mb-1">
            <span>Goals ({member.goalsCount})</span>
            <span className="font-num">{fmtAmount(goalsSavedAmt.amount, goalsSavedAmt.currency)} of {fmtAmount(goalsTargetAmt.amount, goalsTargetAmt.currency)}</span>
          </div>
          <ProgressBar pct={goalsPct} colorClass="gradient-money" height="h-1.5" />
        </div>
      )}
    </div>
  );
}

type InviteTab = 'code' | 'link' | 'qr';

function InvitePanel({ code }: { code: string }) {
  const [tab, setTab] = useState<InviteTab>('code');
  const [copied, setCopied] = useState<InviteTab | null>(null);
  const link = buildInviteLink(code);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  function copy(text: string, which: InviteTab) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: 'Join our household on Amana', text: `Use invite code ${code} to join our household on Amana.`, url: link });
    } catch {
      // user cancelled the share sheet — nothing to do
    }
  }

  const tabs: { id: InviteTab; label: string; icon: React.ElementType }[] = [
    { id: 'code', label: 'Code', icon: Hash },
    { id: 'link', label: 'Link', icon: Link2 },
    { id: 'qr', label: 'QR code', icon: QrCodeIcon },
  ];

  return (
    <div className="card-lift bg-paper border border-line rounded-2xl p-5 mb-6">
      <div className="text-[13px] font-semibold mb-3">Invite others</div>
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
          <p className="text-xs text-mute">Anyone can enter this on their own Household page to join.</p>
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
          <p className="text-xs text-mute mt-2.5">
            Opening this link takes them straight to sign-up (or sign-in) with your household ready to join.
          </p>
        </div>
      )}

      {tab === 'qr' && (
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <QrCode value={link} />
          <p className="text-xs text-mute max-w-xs">
            Scan this with a phone camera to open the invite link directly — handy for inviting someone who's standing right next to you.
          </p>
        </div>
      )}
    </div>
  );
}

export function Household({ inviteCodeFromLink, onConsumedInvite }: { inviteCodeFromLink?: string | null; onConsumedInvite?: () => void }) {
  const { user } = useAuth();
  const { convert, loading: ratesLoading } = useSnapshotRates();
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [invitePreview, setInvitePreview] = useState<HouseholdPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { household } = await householdApi.get();
      setHousehold(household);
    } catch (e: any) {
      setError(e.message || 'Could not load household');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Arriving via a shared invite link/QR code — prefill the join field and show a preview
  // of what they're being invited into before they commit.
  useEffect(() => {
    if (!inviteCodeFromLink) return;
    setCode(inviteCodeFromLink);
    householdApi
      .preview(inviteCodeFromLink)
      .then(setInvitePreview)
      .catch((e: any) => setPreviewError(e.message || "That invite link doesn't look valid"));
  }, [inviteCodeFromLink]);

  async function createHousehold() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { household } = await householdApi.create(name.trim());
      setHousehold(household);
      setName('');
    } catch (e: any) {
      setError(e.message || 'Could not create household');
    } finally {
      setBusy(false);
    }
  }

  async function joinHousehold(withCode?: string) {
    const target = (withCode ?? code).trim();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const { household } = await householdApi.join(target);
      setHousehold(household);
      setCode('');
      setInvitePreview(null);
      onConsumedInvite?.();
    } catch (e: any) {
      setError(e.message || 'Could not join household');
    } finally {
      setBusy(false);
    }
  }

  async function leaveHousehold() {
    if (!confirm('Leave this household? Other members will keep sharing without you.')) return;
    setBusy(true);
    try {
      await householdApi.leave();
      setHousehold(null);
    } catch (e: any) {
      setError(e.message || 'Could not leave household');
    } finally {
      setBusy(false);
    }
  }

  async function regenerateCode() {
    setBusy(true);
    try {
      const { household } = await householdApi.regenerateCode();
      setHousehold(household);
    } catch (e: any) {
      setError(e.message || 'Could not regenerate the invite code');
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    if (!household) return;
    navigator.clipboard?.writeText(household.inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (loading) {
    return <div className="font-num text-sm text-mute">Loading…</div>;
  }

  if (!household) {
    return (
      <>
        {error && <div className="text-xs text-red mb-4">{error}</div>}

        {inviteCodeFromLink && (
          <div className="card-lift gradient-brand rounded-2xl px-6 py-5 mb-6 text-white relative overflow-hidden animate-fade-up max-w-2xl">
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 animate-float" />
            <div className="relative">
              <div className="text-[11px] uppercase tracking-wide text-white/70 mb-1 font-medium">You've been invited</div>
              {previewError ? (
                <div className="text-sm text-white/90">{previewError} — you can still enter a code manually below.</div>
              ) : invitePreview ? (
                <>
                  <div className="text-lg font-bold">{invitePreview.name}</div>
                  <div className="text-xs text-white/80 mt-1 mb-4">
                    {invitePreview.memberCount} {invitePreview.memberCount === 1 ? 'member' : 'members'} already sharing here
                  </div>
                  <Button onClick={() => joinHousehold(inviteCodeFromLink)} disabled={busy}>
                    {busy ? 'Joining…' : `Join ${invitePreview.name}`}
                  </Button>
                </>
              ) : (
                <div className="text-sm text-white/90 font-num">Loading invite…</div>
              )}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 max-w-2xl">
          <div className="card-lift bg-paper border border-line rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-brand" />
              <div className="text-[13px] font-semibold">Start a household</div>
            </div>
            <p className="text-xs text-mute leading-relaxed mb-3.5">
              Create a shared space so a partner or family member can see your income, spending, savings, and net worth at a
              glance — never the individual transactions or categories behind them.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. The Ochieng household"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createHousehold()}
                className={`${inputClassText} flex-1`}
              />
              <Button onClick={createHousehold} variant="primary">
                {busy ? '…' : 'Create'}
              </Button>
            </div>
          </div>

          <div className="card-lift bg-paper border border-line rounded-2xl p-5">
            <div className="text-[13px] font-semibold mb-1">Join with an invite code</div>
            <p className="text-xs text-mute leading-relaxed mb-3.5">
              Already have a code, link, or QR code from someone else? Enter the code here to join their household.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. K7QP2M"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && joinHousehold()}
                className={`${inputClassText} flex-1 font-num tracking-wider`}
                maxLength={6}
              />
              <Button onClick={() => joinHousehold()} variant="primary">
                {busy ? '…' : 'Join'}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const isOwner = user?.id === household.ownerId;
  const overspentMembers = household.members.filter((m) => m.overspentCategoryCount > 0).length;

  return (
    <>
      {error && <div className="text-xs text-red mb-4">{error}</div>}

      <div className="gradient-brand rounded-2xl px-6 py-5 mb-6 text-white relative overflow-hidden animate-fade-up">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 animate-float" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-white/70 mb-1 font-medium">Household</div>
            <div className="text-lg font-bold">{household.name}</div>
            <div className="text-xs text-white/80 mt-1 flex items-center gap-2">
              <span>{household.members.length} {household.members.length === 1 ? 'member' : 'members'}</span>
              {overspentMembers > 0 ? (
                <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5">
                  <AlertTriangle size={11} /> {overspentMembers} over budget
                </span>
              ) : (
                <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5">
                  <PartyPopper size={11} /> Everyone's on track
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-[11px] text-white/75">Invite code</div>
            <button
              onClick={copyCode}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 transition rounded-lg px-3 py-1.5 font-num text-sm font-bold tracking-widest"
            >
              {household.inviteCode}
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {isOwner && (
          <Button onClick={regenerateCode} disabled={busy}>
            <RefreshCw size={13} className="inline mr-1.5 -mt-0.5" /> New invite code
          </Button>
        )}
        <Button onClick={leaveHousehold} variant="danger" disabled={busy}>
          <LogOut size={13} className="inline mr-1.5 -mt-0.5" /> Leave household
        </Button>
      </div>

      <InvitePanel code={household.inviteCode} />

      <SectionHeading>Members</SectionHeading>
      {household.members.length === 0 ? (
        <EmptyState>No members yet.</EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3.5">
          {household.members.map((m) => (
            <MemberCard key={m.id} member={m} isYou={m.id === user?.id} convert={convert} ratesLoading={ratesLoading} />
          ))}
        </div>
      )}
    </>
  );
}
