import { useEffect, useState } from 'react';
import { ratesApi } from './api';

const STORAGE_KEY = 'amana:remittance-display-currency';

/**
 * A lightweight, page-scoped alternative to CurrencyContext: lets a page show totals in
 * any currency the person picks (e.g. "show me everything in KES") regardless of their
 * account's main display currency — useful on Family & Remittances where amounts are
 * already logged in a mix of currencies rather than a single home currency.
 */
export function useDisplayCurrency(defaultCurrency: string) {
  const [currency, setCurrencyState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || defaultCurrency;
    } catch {
      return defaultCurrency;
    }
  });
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ratesApi
      .get('USD')
      .then((res) => {
        if (!cancelled) setRates(res.rates);
      })
      .catch(() => {
        if (!cancelled) setError('Could not fetch live exchange rates — showing original amounts.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setCurrency(code: string) {
    setCurrencyState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore
    }
  }

  // Converts an amount from its original currency into the selected display currency,
  // pivoting through USD since that's the base the rates endpoint returns.
  function convert(amount: number, fromCurrency: string): number {
    if (!rates || fromCurrency === currency) return amount;
    const fromRate = fromCurrency === 'USD' ? 1 : rates[fromCurrency];
    const toRate = currency === 'USD' ? 1 : rates[currency];
    if (!fromRate || !toRate) return amount;
    return (amount / fromRate) * toRate;
  }

  return { currency, setCurrency, convert, ratesLoading: loading, ratesError: error };
}
