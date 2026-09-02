export interface Settings {
  income: number;
  unassignedExtra: number;
}
export interface Category {
  id: string;
  group: string;
  name: string;
  assigned: number;
  spent: number;
  isSystem?: boolean;
}
export interface CategoryRule {
  id: string;
  payeeKey: string;
  categoryId: string;
  categoryName: string;
  categoryGroup: string;
  hits: number;
  updatedAt: string;
}
export interface Transaction {
  id: string;
  date: string;
  payee: string;
  amount: number;
  categoryId: string;
  refundExpected: boolean;
}
export interface Subscription {
  id: string;
  name: string;
  amount: number;
  cadence: string;
  nextBillingDate: string | null;
  previousAmount: number | null;
}
export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
}
export type AccountType = 'asset' | 'liability';
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  category: string;
  balance: number;
  interestRate: number | null;
  minPayment: number | null;
}
export interface NetWorthSnapshot {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}
export interface Recipient {
  id: string;
  name: string;
  relationship: string | null;
  country: string | null;
  currency: string;
  monthlyTarget: number | null;
}
export interface Remittance {
  id: string;
  recipientId: string;
  date: string;
  amountSent: number;
  currencySent: string;
  amountReceived: number | null;
  currencyReceived: string | null;
  fee: number;
  method: string | null;
  note: string | null;
}
export interface FullState {
  settings: Settings;
  categories: Category[];
  transactions: Transaction[];
  subscriptions: Subscription[];
  goals: Goal[];
  accounts: Account[];
  netWorthSnapshots: NetWorthSnapshot[];
  recipients: Recipient[];
  remittances: Remittance[];
}
export interface ReportRow {
  label: string;
  total: number;
}
export interface ReportSummary {
  data: ReportRow[];
  count: number;
  total: number;
}
export type ColorMode = 'light' | 'dark' | 'system';

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none';
export interface StatementRow {
  date: string;
  payee: string;
  amount: number;
}
export interface CategorySuggestion {
  date: string;
  payee: string;
  amount: number;
  categoryId: string | null;
  confidence: MatchConfidence;
  reason: 'learned' | 'keyword' | 'unmatched';
  suggestedGroup?: string;
  isDuplicate: boolean;
  duplicateOf?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  currency: string;
  income: number;
  unassignedExtra: number;
  theme: string;
  avatarEmoji: string;
  avatarColor: string;
  avatarImage: string | null;
  accentColor: string | null;
  colorMode: ColorMode;
  householdId: string | null;
  householdRole: 'owner' | 'member' | null;
}

export interface ForgotPasswordResponse {
  message: string;
  resetUrl?: string;
  devNote?: string;
}

export interface ProfilePatch {
  name?: string;
  currency?: string;
  income?: number;
  theme?: string;
  avatarEmoji?: string;
  avatarColor?: string;
  avatarImage?: string;
  accentColor?: string;
  clearAvatarImage?: boolean;
  clearAccentColor?: boolean;
  colorMode?: ColorMode;
}

export interface HouseholdMember {
  id: string;
  name: string;
  currency: string;
  avatarEmoji: string;
  avatarColor: string;
  avatarImage: string | null;
  income: number;
  spentThisMonth: number;
  actualSavedThisMonth: number;
  savingsRate: number;
  netWorth: number;
  goalsSaved: number;
  goalsTarget: number;
  goalsCount: number;
  overspentCategoryCount: number;
  overspentTotal: number;
}

export interface HouseholdInfo {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  members: HouseholdMember[];
}
export interface HouseholdPreview {
  name: string;
  memberCount: number;
}
export interface Connection {
  id: string;
  name: string;
  currency: string;
  avatarEmoji: string;
  avatarColor: string;
  avatarImage: string | null;
  income: number;
  spentThisMonth: number;
  actualSavedThisMonth: number;
  savingsRate: number;
  netWorth: number;
  goalsSaved: number;
  goalsTarget: number;
  goalsCount: number;
  overspentCategoryCount: number;
  overspentTotal: number;
}
export interface ConnectPreview {
  name: string;
  avatarEmoji: string;
  avatarColor: string;
  avatarImage: string | null;
}
export interface RatesResponse {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

const BASE = '/api';

// Sessions now live in an httpOnly cookie set by the server (see server/src/auth.ts) instead
// of localStorage, so a client-side script — including an injected/XSS one — can never read
// the session token. Every request just needs to carry cookies along.
async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const auth = {
  signup: (email: string, password: string, name: string) =>
    req<{ user: User }>('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    req<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req<void>('/auth/logout', { method: 'POST' }),
  me: () => req<{ user: User }>('/auth/me'),
  updateProfile: (patch: ProfilePatch) =>
    req<{ user: User }>('/auth/profile', { method: 'PUT', body: JSON.stringify(patch) }),
  changeEmail: (newEmail: string, currentPassword: string) =>
    req<{ user: User }>('/auth/change-email', { method: 'POST', body: JSON.stringify({ newEmail, currentPassword }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<void>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  forgotPassword: (email: string) =>
    req<ForgotPasswordResponse>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    req<{ user: User }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  deleteAccount: (password: string) =>
    req<void>('/auth/delete-account', { method: 'POST', body: JSON.stringify({ password }) }),
};

export const ratesApi = {
  get: (base: string) => req<RatesResponse>(`/rates?base=${encodeURIComponent(base)}`),
};

export const householdApi = {
  get: () => req<{ household: HouseholdInfo | null }>('/household'),
  preview: (code: string) => req<HouseholdPreview>(`/household/preview/${encodeURIComponent(code)}`),
  create: (name: string) => req<{ household: HouseholdInfo }>('/household/create', { method: 'POST', body: JSON.stringify({ name }) }),
  join: (inviteCode: string) => req<{ household: HouseholdInfo }>('/household/join', { method: 'POST', body: JSON.stringify({ inviteCode }) }),
  leave: () => req<void>('/household/leave', { method: 'POST' }),
  regenerateCode: () => req<{ household: HouseholdInfo }>('/household/regenerate-code', { method: 'POST' }),
};

export const connectionsApi = {
  get: () => req<{ code: string; connections: Connection[] }>('/connections'),
  preview: (code: string) => req<ConnectPreview>(`/connections/preview/${encodeURIComponent(code)}`),
  join: (code: string) => req<{ code: string; connections: Connection[] }>('/connections/join', { method: 'POST', body: JSON.stringify({ code }) }),
  remove: (otherId: string) => req<{ connections: Connection[] }>(`/connections/${otherId}`, { method: 'DELETE' }),
  regenerateCode: () => req<{ code: string; connections: Connection[] }>('/connections/regenerate-code', { method: 'POST' }),
};

export const api = {
  getState: () => req<FullState>('/state'),
  updateIncome: (income: number) => req<Settings>('/settings', { method: 'PUT', body: JSON.stringify({ income }) }),

  addCategory: (name: string, group?: string) =>
    req<Category[]>('/categories', { method: 'POST', body: JSON.stringify({ name, group }) }),
  assignCategory: (id: string, assigned: number) =>
    req<Category[]>(`/categories/${id}/assign`, { method: 'PUT', body: JSON.stringify({ assigned }) }),
  deleteCategory: (id: string) =>
    req<{ categories: Category[]; reassignedTransactions: number }>(`/categories/${id}`, { method: 'DELETE' }),

  getCategoryRules: () => req<{ rules: CategoryRule[] }>('/categories/rules'),
  deleteCategoryRule: (id: string) => req<{ deleted: boolean }>(`/categories/rules/${id}`, { method: 'DELETE' }),

  recategorizeUncategorized: () =>
    req<{ transactions: Transaction[]; categories: Category[]; recategorized: number }>('/transactions/recategorize', { method: 'POST' }),

  addTransaction: (t: Omit<Transaction, 'id'>) =>
    req<{ transactions: Transaction[]; categories: Category[] }>('/transactions', {
      method: 'POST',
      body: JSON.stringify(t),
    }),
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, 'id'>>) =>
    req<{ transactions: Transaction[]; categories: Category[] }>(`/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  deleteTransaction: (id: string) =>
    req<{ transactions: Transaction[]; categories: Category[] }>(`/transactions/${id}`, { method: 'DELETE' }),
  setRefundExpected: (id: string, refundExpected: boolean) =>
    req<{ transactions: Transaction[] }>(`/transactions/${id}/refund`, { method: 'PUT', body: JSON.stringify({ refundExpected }) }),

  addSubscription: (s: Omit<Subscription, 'id' | 'previousAmount'>) =>
    req<Subscription[]>('/subscriptions', { method: 'POST', body: JSON.stringify(s) }),
  updateSubscription: (id: string, patch: Partial<Omit<Subscription, 'id' | 'previousAmount'>>) =>
    req<Subscription[]>(`/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteSubscription: (id: string) => req<Subscription[]>(`/subscriptions/${id}`, { method: 'DELETE' }),

  addGoal: (name: string, target: number) =>
    req<Goal[]>('/goals', { method: 'POST', body: JSON.stringify({ name, target }) }),
  addToGoal: (id: string, amount: number) =>
    req<Goal[]>(`/goals/${id}/add`, { method: 'PUT', body: JSON.stringify({ amount }) }),
  updateGoal: (id: string, patch: Partial<Omit<Goal, 'id'>>) =>
    req<Goal[]>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteGoal: (id: string) => req<Goal[]>(`/goals/${id}`, { method: 'DELETE' }),

  getAccounts: () => req<Account[]>('/accounts'),
  addAccount: (a: Omit<Account, 'id'>) =>
    req<{ accounts: Account[]; netWorthSnapshots: NetWorthSnapshot[] }>('/accounts', { method: 'POST', body: JSON.stringify(a) }),
  updateAccount: (id: string, patch: Partial<Omit<Account, 'id' | 'type' | 'category'>>) =>
    req<{ accounts: Account[]; netWorthSnapshots: NetWorthSnapshot[] }>(`/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  deleteAccount: (id: string) =>
    req<{ accounts: Account[]; netWorthSnapshots: NetWorthSnapshot[] }>(`/accounts/${id}`, { method: 'DELETE' }),
  getSnapshots: () => req<NetWorthSnapshot[]>('/networth/snapshots'),

  addRecipient: (r: { name: string; relationship?: string; country?: string; currency: string; monthlyTarget?: number | null }) =>
    req<{ recipients: Recipient[]; remittances: Remittance[] }>('/recipients', { method: 'POST', body: JSON.stringify(r) }),
  updateRecipient: (id: string, patch: Partial<Omit<Recipient, 'id'>>) =>
    req<{ recipients: Recipient[]; remittances: Remittance[] }>(`/recipients/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteRecipient: (id: string) =>
    req<{ recipients: Recipient[]; remittances: Remittance[] }>(`/recipients/${id}`, { method: 'DELETE' }),

  addRemittance: (r: Omit<Remittance, 'id'>) =>
    req<{ recipients: Recipient[]; remittances: Remittance[] }>('/remittances', { method: 'POST', body: JSON.stringify(r) }),
  deleteRemittance: (id: string) =>
    req<{ recipients: Recipient[]; remittances: Remittance[] }>(`/remittances/${id}`, { method: 'DELETE' }),

  getReportSummary: (params: { from?: string; to?: string; groupBy?: 'category' | 'group' | 'month' | 'payee' }) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.groupBy) qs.set('groupBy', params.groupBy);
    return req<ReportSummary>(`/reports/summary?${qs.toString()}`);
  },
  exportTransactionsCsv: async (params: { from?: string; to?: string; categoryId?: string }) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.categoryId) qs.set('categoryId', params.categoryId);
    const res = await fetch(`${BASE}/export/transactions.csv?${qs.toString()}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'amana-transactions.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  seedDemo: () => req<FullState>('/demo/seed', { method: 'POST' }),

  categorizeStatement: (rows: StatementRow[]) =>
    req<{ suggestions: CategorySuggestion[] }>('/statements/categorize', { method: 'POST', body: JSON.stringify({ rows }) }),
  importStatement: (rows: (StatementRow & { categoryId: string })[]) =>
    req<{ transactions: Transaction[]; categories: Category[]; imported: number }>('/statements/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),
};
