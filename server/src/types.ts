export interface Settings {
  income: number;
  unassignedExtra: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  currency: string;
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

// A single row extracted from an uploaded bank/mobile-money statement, before it has
// been reviewed or saved as a real Transaction.
export interface StatementRow {
  date: string;
  payee: string;
  amount: number;
}

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none';

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
