import { useEffect, useState, useCallback, useMemo } from 'react';
import { Sidebar, type Page } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Budget } from './pages/Budget';
import { Transactions } from './pages/Transactions';
import { Import } from './pages/Import';
import { Subscriptions } from './pages/Subscriptions';
import { Goals } from './pages/Goals';
import { NetWorth } from './pages/NetWorth';
import { Debt } from './pages/Debt';
import { Family } from './pages/Family';
import { Household } from './pages/Household';
import { Connections } from './pages/Connections';
import { Reports } from './pages/Reports';
import { Learn } from './pages/Learn';
import { Settings } from './pages/Settings';
import { AuthPage } from './pages/Auth';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { CurrencyProvider, useCurrency } from './lib/CurrencyContext';
import { api, type FullState, type AccountType } from './lib/api';
import { readyToAssign } from './lib/insights';
import { recordVisit, buildAchievements, computeLevel } from './lib/gamification';
import { ToastProvider, useToast } from './components/Toast';
import { QuickAdd } from './components/QuickAdd';
import { CommandPalette } from './components/CommandPalette';
import { NotificationBell } from './components/NotificationBell';
import { SplashScreen } from './components/SplashScreen';
import { Confetti } from './components/Confetti';
import { applyTheme, applyAccent } from './lib/themes';
import { applyColorMode, watchSystemColorMode, getLocalColorMode } from './lib/colorMode';
import { playLevelUp, playSuccess } from './lib/sounds';
import { enqueueTransaction, flushQueue, getQueue, isNetworkError } from './lib/offlineQueue';
import { readInviteCodeFromUrl, clearInviteCodeFromUrl, readConnectCodeFromUrl, readResetTokenFromUrl } from './lib/inviteLink';

const PAGE_META: Record<Page, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: "Everything at a glance — what's assigned, what's spent, what needs attention." },
  budget: { title: 'Budget', sub: 'Give every dollar a job. Assign your income to categories before you spend it.' },
  transactions: { title: 'Transactions', sub: 'Log what you spend and where it goes.' },
  import: { title: 'Import a Statement', sub: 'Upload a CSV export and let auto-categorization sort it out — nothing leaves your browser until you approve it.' },
  subscriptions: { title: 'Subscriptions', sub: 'Every recurring charge, in one place, reviewed on purpose.' },
  goals: { title: 'Goals', sub: 'Save toward something specific — and watch it fill up.' },
  networth: { title: 'Net Worth', sub: 'Everything you own minus everything you owe, tracked over time.' },
  debt: { title: 'Debt Payoff', sub: 'Plan the fastest, cheapest route to debt-free with avalanche or snowball.' },
  family: { title: 'Family & Remittances', sub: 'Track who you support, what actually arrives after fees, and what it costs you over a year.' },
  household: { title: 'Household', sub: 'Share a high-level view of income, spending, and savings with a partner or family member.' },
  connections: { title: 'Connections', sub: 'Pair with anyone — no group needed — to share a high-level view of your money.' },
  reports: { title: 'Reports', sub: 'Slice your spending however you like, and export it whenever you like.' },
  learn: { title: 'Learn', sub: 'Short, practical notes tied to your own numbers.' },
  settings: { title: 'Settings', sub: 'Your profile, currency, and account.' },
};

function Shell({
  inviteCode,
  onConsumedInvite,
  connectCode,
  onConsumedConnect,
}: {
  inviteCode?: string | null;
  onConsumedInvite?: () => void;
  connectCode?: string | null;
  onConsumedConnect?: () => void;
}) {
  const [page, setPage] = useState<Page>('dashboard');
  const [state, setState] = useState<FullState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { format } = useCurrency();
  const { user } = useAuth();
  const { show } = useToast();

  const streakInfo = useMemo(() => (user ? recordVisit(user.id) : { current: 0, best: 0, isNewToday: false }), [user]);
  const streak = streakInfo.current;
  const achievements = useMemo(() => (state ? buildAchievements(state, streakInfo) : []), [state, streakInfo]);
  const level = useMemo(() => computeLevel(achievements, streakInfo), [achievements, streakInfo]);
  const [levelUpFire, setLevelUpFire] = useState(0);
  const [pendingSync, setPendingSync] = useState(0);

  const refreshPendingCount = useCallback(() => {
    if (user) setPendingSync(getQueue(user.id).length);
  }, [user]);

  useEffect(() => {
    applyTheme(user?.theme);
  }, [user?.theme]);

  useEffect(() => {
    applyAccent(user?.accentColor);
  }, [user?.accentColor]);

  useEffect(() => {
    applyColorMode(user?.colorMode);
    watchSystemColorMode(() => user?.colorMode);
  }, [user?.colorMode]);

  // Celebrate leveling up and newly-unlocked achievements — both are derived purely from
  // the user's own data (see lib/gamification.ts), so "new" just means higher than what
  // we last saw for this user, tracked locally rather than needing a server-side event log.
  useEffect(() => {
    if (!user || !state || achievements.length === 0) return;
    const levelKey = `amana:seen-level:${user.id}`;
    const achKey = `amana:seen-achievements:${user.id}`;
    let seenLevel = 0;
    let seenAch: string[] = [];
    try {
      seenLevel = Number(localStorage.getItem(levelKey) || 0);
      seenAch = JSON.parse(localStorage.getItem(achKey) || '[]');
    } catch {
      seenAch = [];
    }

    const unlockedIds = achievements.filter((a) => a.unlocked).map((a) => a.id);
    const newAchievements = seenAch.length ? unlockedIds.filter((id) => !seenAch.includes(id)) : [];

    if (seenLevel && level.level > seenLevel) {
      show(`Level up! You're now a "${level.title}" 🎉`, 'celebrate');
      playLevelUp();
      setLevelUpFire((n) => n + 1);
    } else if (newAchievements.length > 0) {
      const first = achievements.find((a) => a.id === newAchievements[0]);
      if (first) {
        show(`Achievement unlocked: ${first.label} 🏅`, 'celebrate');
        playSuccess();
        setLevelUpFire((n) => n + 1);
      }
    }

    localStorage.setItem(levelKey, String(level.level));
    localStorage.setItem(achKey, JSON.stringify(unlockedIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, level.level, achievements.map((a) => a.unlocked).join(',')]);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getState();
      setState(s);
      setError(null);
    } catch (e) {
      setError('Could not reach the Amana API. Is the server running?');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A ?invite=CODE link should land the signed-in user straight on the Household page with
  // the code ready to go, rather than making them find it themselves after signing up.
  useEffect(() => {
    if (inviteCode && user && !user.householdId) {
      setPage('household');
    }
  }, [inviteCode, user]);

  // A ?connect=CODE link works the same way, but for the Connections page — no membership
  // check needed since a user can have any number of connections.
  useEffect(() => {
    if (connectCode && user) {
      setPage('connections');
    }
  }, [connectCode, user]);

  // Any transaction logged while offline sits in a local queue (lib/offlineQueue.ts).
  // Flush it whenever we regain connectivity — and once on load in case the tab was left
  // open through a reconnect — so it reaches the server without the user doing anything.
  useEffect(() => {
    if (!user) return;
    refreshPendingCount();

    let cancelled = false;
    async function trySync() {
      if (!navigator.onLine) return;
      const before = getQueue(user!.id).length;
      if (before === 0) return;
      const { synced, failed } = await flushQueue(user!.id);
      if (cancelled) return;
      refreshPendingCount();
      if (synced > 0) {
        show(`Synced ${synced} offline ${synced === 1 ? 'transaction' : 'transactions'}`, 'success');
        refresh();
      }
      if (failed > 0) {
        show(`${failed} offline ${failed === 1 ? 'transaction' : 'transactions'} couldn't be saved and ${failed === 1 ? 'was' : 'were'} discarded`, 'error');
      }
    }

    trySync();
    window.addEventListener('online', trySync);
    return () => {
      cancelled = true;
      window.removeEventListener('online', trySync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (user && streak > 1) {
      show(`Welcome back — ${streak}-day streak! 🔥`, 'celebrate');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function handleAssign(id: string, amountUsd: number) {
    await api.assignCategory(id, amountUsd);
    refresh();
    show('Category updated', 'success');
  }
  async function handleUpdateIncome(incomeUsd: number) {
    await api.updateIncome(incomeUsd);
    refresh();
    show('Income updated', 'success');
  }
  async function handleAddCategory(name: string) {
    await api.addCategory(name);
    refresh();
    show(`Added "${name}"`, 'success');
  }
  async function handleDeleteCategory(id: string, name: string, hasSpend: boolean) {
    const confirmMsg = hasSpend
      ? `Delete "${name}"? Its transactions will be moved to "Uncategorized" — nothing is deleted from your history.`
      : `Delete "${name}"?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const { reassignedTransactions } = await api.deleteCategory(id);
      refresh();
      show(
        reassignedTransactions > 0
          ? `Deleted "${name}" — ${reassignedTransactions} transaction${reassignedTransactions === 1 ? '' : 's'} moved to Uncategorized`
          : `Deleted "${name}"`,
        'success'
      );
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not delete category', 'error');
    }
  }
  async function handleAddTransaction(t: { date: string; payee: string; amount: number; categoryId: string; refundExpected?: boolean }) {
    const payload = { ...t, refundExpected: t.refundExpected ?? false };
    try {
      await api.addTransaction(payload);
      refresh();
      show('Transaction logged', 'success');
    } catch (e) {
      if (user && isNetworkError(e)) {
        enqueueTransaction(user.id, payload);
        refreshPendingCount();
        show("You're offline — transaction saved and will sync automatically", 'info');
        return;
      }
      show(e instanceof Error ? e.message : 'Could not log that transaction', 'error');
    }
  }
  async function handleRecategorize() {
    try {
      const { recategorized } = await api.recategorizeUncategorized();
      refresh();
      show(
        recategorized > 0
          ? `Moved ${recategorized} transaction${recategorized === 1 ? '' : 's'} out of Uncategorized using rules you've taught it`
          : 'Nothing new to recategorize right now',
        recategorized > 0 ? 'success' : 'info'
      );
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not recategorize', 'error');
    }
  }
  async function handleDeleteTransaction(id: string) {
    await api.deleteTransaction(id);
    refresh();
  }
  async function handleUpdateTransaction(id: string, patch: { date?: string; payee?: string; amount?: number; categoryId?: string; refundExpected?: boolean }) {
    try {
      await api.updateTransaction(id, patch);
      refresh();
      show('Transaction updated', 'success');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not update that transaction', 'error');
    }
  }
  async function handleToggleRefund(id: string, refundExpected: boolean) {
    await api.setRefundExpected(id, refundExpected);
    refresh();
    show(refundExpected ? 'Marked as expecting a refund' : 'Refund flag cleared', 'success');
  }
  async function handleAddSubscription(s: { name: string; amount: number; cadence: string; nextBillingDate: string | null }) {
    await api.addSubscription(s);
    refresh();
    show(`Tracking "${s.name}"`, 'success');
  }
  async function handleUpdateSubscription(id: string, patch: { amount?: number; nextBillingDate?: string }) {
    await api.updateSubscription(id, patch);
    refresh();
  }
  async function handleDeleteSubscription(id: string) {
    await api.deleteSubscription(id);
    refresh();
  }
  async function handleAddAccount(a: { name: string; type: AccountType; category: string; balanceUsd: number; interestRate?: number; minPayment?: number }) {
    await api.addAccount({ name: a.name, type: a.type, category: a.category, balance: a.balanceUsd, interestRate: a.interestRate ?? null, minPayment: a.minPayment ?? null });
    refresh();
    show('Account added', 'success');
  }
  async function handleUpdateAccount(id: string, patch: { name?: string; balanceUsd?: number; interestRate?: number | null; minPaymentUsd?: number | null }) {
    try {
      await api.updateAccount(id, {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.balanceUsd !== undefined ? { balance: patch.balanceUsd } : {}),
        ...(patch.interestRate !== undefined ? { interestRate: patch.interestRate } : {}),
        ...(patch.minPaymentUsd !== undefined ? { minPayment: patch.minPaymentUsd } : {}),
      });
      refresh();
      show('Account updated', 'success');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not update that account', 'error');
    }
  }
  async function handleDeleteAccount(id: string) {
    await api.deleteAccount(id);
    refresh();
  }
  async function handleAddGoal(name: string, targetUsd: number) {
    await api.addGoal(name, targetUsd);
    refresh();
    show(`Goal "${name}" created`, 'success');
  }
  async function handleUpdateGoal(id: string, patch: { name?: string; target?: number; saved?: number }) {
    try {
      await api.updateGoal(id, patch);
      refresh();
      show('Goal updated', 'success');
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not update that goal', 'error');
    }
  }
  async function handleDeleteGoal(id: string) {
    await api.deleteGoal(id);
    refresh();
  }
  async function handleAddFunds(id: string, amountUsd: number) {
    const before = state?.goals.find((g) => g.id === id);
    await api.addToGoal(id, amountUsd);
    refresh();
    if (before && before.target > 0 && before.saved < before.target && before.saved + amountUsd >= before.target) {
      show(`🎉 "${before.name}" goal reached!`, 'celebrate');
    } else {
      show('Funds added', 'success');
    }
  }
  async function handleAddRecipient(r: { name: string; relationship?: string; country?: string; currency: string; monthlyTarget?: number | null }) {
    await api.addRecipient(r);
    refresh();
    show(`Now tracking transfers to ${r.name}`, 'success');
  }
  async function handleDeleteRecipient(id: string) {
    await api.deleteRecipient(id);
    refresh();
  }
  async function handleAddRemittance(r: {
    recipientId: string;
    date: string;
    amountSent: number;
    currencySent: string;
    amountReceived?: number | null;
    currencyReceived?: string | null;
    fee: number;
    method?: string;
    note?: string;
  }) {
    await api.addRemittance({
      recipientId: r.recipientId,
      date: r.date,
      amountSent: r.amountSent,
      currencySent: r.currencySent,
      amountReceived: r.amountReceived ?? null,
      currencyReceived: r.currencyReceived ?? null,
      fee: r.fee,
      method: r.method ?? null,
      note: r.note ?? null,
    });
    refresh();
    show('Transfer logged', 'success');
  }
  async function handleDeleteRemittance(id: string) {
    await api.deleteRemittance(id);
    refresh();
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-6">
        <div className="max-w-sm text-center">
          <div className="text-lg font-semibold mb-2">Can't reach the server</div>
          <p className="text-sm text-ink-soft leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="font-num text-sm text-mute">Loading your budget…</div>
      </div>
    );
  }

  const rta = readyToAssign(state);
  const meta = PAGE_META[page];

  return (
    <div className="app-shell min-h-screen flex flex-col md:flex-row bg-cloud text-ink">
      <Confetti fire={levelUpFire} count={70} />
      <CommandPalette setPage={setPage} />
      <Sidebar page={page} setPage={setPage} streak={streak} level={level.level} />
      <main className="flex-1 min-w-0 px-5 md:px-10 py-6 md:py-9 pb-16">
        <div className="page-header relative z-30 flex justify-between items-start gap-5 flex-wrap mb-8 animate-fade-up">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
            <p className="text-[13.5px] text-ink-soft mt-1 max-w-lg">{meta.sub}</p>
          </div>
          {page !== 'settings' && (
            <div className="flex items-center gap-3">
              <NotificationBell state={state} pendingSync={pendingSync} />
              <div className="card-lift bg-paper border border-line rounded-xl px-4 py-2.5 min-w-[170px]">
                <div className="text-[10px] uppercase tracking-wide text-mute font-medium">Ready to assign</div>
                <div className={`font-num text-lg font-bold ${rta > 0 ? 'text-emerald-deep' : rta < 0 ? 'text-red' : 'text-ink-soft'}`}>{format(rta)}</div>
              </div>
            </div>
          )}
        </div>

        {page === 'dashboard' && <Dashboard state={state} onAssign={handleAssign} />}
        {page === 'budget' && (
          <Budget
            state={state}
            onAssign={handleAssign}
            onUpdateIncome={handleUpdateIncome}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
          />
        )}
        {page === 'transactions' && (
          <Transactions
            state={state}
            onAdd={handleAddTransaction}
            onUpdate={handleUpdateTransaction}
            onDelete={handleDeleteTransaction}
            onToggleRefund={handleToggleRefund}
            onRecategorize={handleRecategorize}
          />
        )}
        {page === 'import' && <Import state={state} onImported={refresh} />}
        {page === 'subscriptions' && (
          <Subscriptions state={state} onAdd={handleAddSubscription} onUpdate={handleUpdateSubscription} onDelete={handleDeleteSubscription} />
        )}
        {page === 'goals' && (
          <Goals state={state} onAddGoal={handleAddGoal} onAddFunds={handleAddFunds} onUpdateGoal={handleUpdateGoal} onDeleteGoal={handleDeleteGoal} />
        )}
        {page === 'networth' && (
          <NetWorth state={state} onAddAccount={handleAddAccount} onUpdateAccount={handleUpdateAccount} onDeleteAccount={handleDeleteAccount} />
        )}
        {page === 'debt' && <Debt state={state} />}
        {page === 'family' && (
          <Family
            state={state}
            onAddRecipient={handleAddRecipient}
            onDeleteRecipient={handleDeleteRecipient}
            onAddRemittance={handleAddRemittance}
            onDeleteRemittance={handleDeleteRemittance}
          />
        )}
        {page === 'household' && <Household inviteCodeFromLink={inviteCode} onConsumedInvite={onConsumedInvite} />}
        {page === 'connections' && <Connections connectCodeFromLink={connectCode} onConsumedConnect={onConsumedConnect} />}
        {page === 'reports' && <Reports />}
        {page === 'learn' && <Learn state={state} />}
        {page === 'settings' && <Settings state={state} onDataChanged={refresh} />}
      </main>
      {page !== 'settings' && <QuickAdd state={state} onAdd={handleAddTransaction} />}
    </div>
  );
}

function Gate({
  inviteCode,
  onConsumedInvite,
  connectCode,
  onConsumedConnect,
  resetToken,
  onConsumedReset,
}: {
  inviteCode: string | null;
  onConsumedInvite: () => void;
  connectCode: string | null;
  onConsumedConnect: () => void;
  resetToken: string | null;
  onConsumedReset: () => void;
}) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      applyTheme(null);
      applyColorMode(getLocalColorMode());
      watchSystemColorMode(() => getLocalColorMode());
    }
  }, [loading, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="font-num text-sm text-mute">Loading…</div>
      </div>
    );
  }

  // A `?reset=TOKEN` link takes over the auth screen regardless of the invite/connect
  // codes above — someone resetting a password isn't trying to join a household in the
  // same click. Once the reset actually succeeds, resetPassword() logs the user in and
  // this branch stops applying on the next render, dropping straight into the app.
  if (!user) return <AuthPage inviteCode={inviteCode} connectCode={connectCode} resetToken={resetToken} onConsumedReset={onConsumedReset} />;

  return (
    <CurrencyProvider>
      <ToastProvider>
        <Shell inviteCode={inviteCode} onConsumedInvite={onConsumedInvite} connectCode={connectCode} onConsumedConnect={onConsumedConnect} />
      </ToastProvider>
    </CurrencyProvider>
  );
}

const SPLASH_SEEN_KEY = 'amana:splash-seen';

export default function App() {
  // Captured once on load from ?reset=TOKEN — read before the splash-screen decision below,
  // since someone who just clicked a password-reset link from their email shouldn't have to
  // sit through a splash animation before they can act on it.
  const [resetToken, setResetToken] = useState<string | null>(() => readResetTokenFromUrl());

  // Shown once per browser session on first load — not on every internal navigation
  // (App only mounts once per page load anyway) and not again on a same-session refresh,
  // so it stays a delightful first impression rather than an annoying speed bump. Skipped
  // entirely for a password-reset link, for the same reason.
  const [showSplash, setShowSplash] = useState(() => {
    if (readResetTokenFromUrl()) return false;
    try {
      return sessionStorage.getItem(SPLASH_SEEN_KEY) !== '1';
    } catch {
      return true;
    }
  });
  // Captured once on load from ?invite=CODE, then cleared from the address bar the moment
  // it's actually been used (joined, or the person navigates away from Household) so a
  // refresh or a re-share of the URL doesn't keep re-triggering the flow.
  const [inviteCode, setInviteCode] = useState<string | null>(() => readInviteCodeFromUrl());
  // Same idea for a personal ?connect=CODE link — kept as a separate piece of state since
  // the two can, in principle, both be handled in a single session without interfering.
  const [connectCode, setConnectCode] = useState<string | null>(() => readConnectCodeFromUrl());

  function consumeInvite() {
    setInviteCode(null);
    clearInviteCodeFromUrl();
  }

  function consumeConnect() {
    setConnectCode(null);
    clearInviteCodeFromUrl();
  }

  function consumeReset() {
    setResetToken(null);
    clearInviteCodeFromUrl();
  }

  function dismissSplash() {
    try {
      sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
    } catch {
      // ignore — worst case splash reappears next load in this session
    }
    setShowSplash(false);
  }

  return (
    <AuthProvider>
      {showSplash && <SplashScreen onDone={dismissSplash} />}
      <Gate
        inviteCode={inviteCode}
        onConsumedInvite={consumeInvite}
        connectCode={connectCode}
        onConsumedConnect={consumeConnect}
        resetToken={resetToken}
        onConsumedReset={consumeReset}
      />
    </AuthProvider>
  );
}
