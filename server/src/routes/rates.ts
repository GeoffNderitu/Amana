import { Router } from 'express';

export const rates = Router();

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { data: any; fetchedAt: number }>();

export async function getRatesCached(base: string): Promise<{ base: string; rates: Record<string, number>; fetchedAt: number }> {
  const normalized = base.toUpperCase();
  const cached = cache.get(normalized);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const upstream = await fetch(`https://open.er-api.com/v6/latest/${normalized}`);
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);
    const json = await upstream.json();
    if (json.result !== 'success') throw new Error('Upstream reported failure');
    const data = { base: normalized, rates: json.rates, fetchedAt: Date.now() };
    cache.set(normalized, { data, fetchedAt: Date.now() });
    return data;
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }
}

rates.get('/', async (req, res) => {
  const base = ((req.query.base as string) || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) return res.status(400).json({ error: 'Invalid base currency' });

  try {
    const data = await getRatesCached(base);
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Could not fetch exchange rates right now' });
  }
});

