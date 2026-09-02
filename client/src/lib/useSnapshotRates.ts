/**
 * Household and connection "snapshot" figures (spend, savings, net worth, goal totals —
 * see server/src/snapshot.ts) are read straight from each member's own categories,
 * transactions, goals, and accounts, so they're already in that member's own currency —
 * there's nothing to convert. This hook used to fetch a USD rate table and convert each
 * snapshot figure into the member's currency, back from when every amount was canonically
 * stored in USD; now that amounts are stored exactly as entered, in the currency the person
 * actually uses, that conversion step would just double-apply an exchange rate that was
 * never involved in the first place. Kept as a hook (rather than deleting it) purely so
 * Household.tsx and Connections.tsx — which pass each member's own currency straight back
 * in as the "target" — don't need to change; it's now an identity pass-through.
 */
export function useSnapshotRates() {
  function convert(amount: number, currency: string): { amount: number; currency: string } {
    return { amount, currency };
  }

  return { convert, loading: false, error: null as string | null };
}
