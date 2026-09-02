import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface CurrencyContextValue {
  currency: string;
  /** @deprecated Always 1 now — kept only so existing call sites don't need to change. */
  rate: number;
  ratesLoading: boolean;
  ratesError: string | null;
  /** Identity function: amounts are stored exactly as entered, in the user's own currency,
   * so there is nothing to convert. Kept so existing call sites (Budget, Goals, Transactions,
   * etc.) don't all need editing — every one of them now just passes the amount through. */
  convert: (amount: number) => number;
  /** Identity function, same reasoning as `convert`. */
  toUsd: (amount: number) => number;
  format: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

/**
 * Amounts used to be stored in USD and converted to/from the user's chosen currency using
 * whatever the live exchange rate happened to be at that moment — which meant a figure you
 * typed today could look different tomorrow purely because the rate moved, even though
 * nothing about the transaction changed. That's fixed now: every amount is stored exactly
 * as the user enters it, in their own account currency, and this provider no longer fetches
 * or applies any exchange rate for personal figures. It exists purely to format numbers with
 * the right currency symbol.
 *
 * (Cross-member comparisons on the Family page are a different, legitimate use of exchange
 * rates — two different people's own money, each already in their own currency — and are
 * handled separately in useSnapshotRates.ts, not here.)
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const currency = user?.currency || 'USD';

  function format(amount: number): string {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        rate: 1,
        ratesLoading: false,
        ratesError: null,
        convert: (amount) => amount,
        toUsd: (amount) => amount,
        format,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
