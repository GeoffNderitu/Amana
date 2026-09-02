import { CURRENCIES } from './currencies';

// Country -> currency for every currency Amana supports, plus enough extra countries that
// share a currency (the euro zone, the US-dollar zone, etc.) to make detection useful well
// beyond the 20 headline currencies in the picker.
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // KES
  KE: 'KES',
  // NGN
  NG: 'NGN',
  // ZAR
  ZA: 'ZAR', LS: 'ZAR', SZ: 'ZAR', NA: 'ZAR',
  // GHS
  GH: 'GHS',
  // UGX
  UG: 'UGX',
  // TZS
  TZ: 'TZS',
  // EGP
  EG: 'EGP',
  // INR
  IN: 'INR',
  // PKR
  PK: 'PKR',
  // PHP
  PH: 'PHP',
  // JPY
  JP: 'JPY',
  // CNY
  CN: 'CNY',
  // AED
  AE: 'AED',
  // BRL
  BR: 'BRL',
  // MXN
  MX: 'MXN',
  // CAD
  CA: 'CAD',
  // AUD
  AU: 'AUD', NZ: 'AUD',
  // GBP
  GB: 'GBP',
  // EUR (euro zone)
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', IE: 'EUR', PT: 'EUR',
  AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR',
  LT: 'EUR', CY: 'EUR', MT: 'EUR', HR: 'EUR',
  // USD (US and countries that use it officially or as a de facto/secondary currency)
  US: 'USD', EC: 'USD', SV: 'USD', PA: 'USD', ZW: 'USD', LR: 'USD',
};

export interface CurrencyDetection {
  currency: string;
  countryCode: string;
  source: 'geolocation' | 'locale';
}

function currencySupported(code: string): boolean {
  return CURRENCIES.some((c) => c.code === code);
}

/** Best-effort region guess from the browser's own language setting — no permission
 * prompt, works instantly, but less reliable than real location (e.g. "en" alone doesn't
 * imply a country). Used as a fallback when geolocation is denied or unavailable. */
export function countryFromLocale(): string | null {
  try {
    const loc = new (Intl as any).Locale(navigator.language).maximize();
    return loc.region || null;
  } catch {
    // Older browsers without Intl.Locale, or an unparsable locale string.
    const parts = navigator.language?.split('-');
    return parts && parts.length > 1 ? parts[1].toUpperCase() : null;
  }
}

/** Asks the browser for the device's location (triggers the native permission prompt the
 * first time) and reverse-geocodes it to a country using BigDataCloud's free, keyless
 * client-side endpoint. Resolves to null on any denial, timeout, or network failure —
 * callers should treat that as "couldn't detect" and fall back, never as an error to surface. */
export function detectCountryViaGeolocation(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          if (!res.ok) throw new Error('reverse geocode failed');
          const data = await res.json();
          resolve(typeof data?.countryCode === 'string' ? data.countryCode.toUpperCase() : null);
        } catch {
          resolve(null);
        }
      },
      () => resolve(null),
      { timeout: 8000, maximumAge: 1000 * 60 * 60 }
    );
  });
}

/**
 * Detects the currency Amana should default to: tries device geolocation first (asking
 * permission), falls back to the browser's language/region, and returns null if neither
 * yields a currency Amana supports — callers should leave the existing setting untouched
 * in that case rather than force USD.
 */
export async function detectCurrency(): Promise<CurrencyDetection | null> {
  const geoCountry = await detectCountryViaGeolocation();
  const country = geoCountry || countryFromLocale();
  if (!country) return null;

  const code = COUNTRY_TO_CURRENCY[country];
  if (!code || !currencySupported(code)) return null;

  return { currency: code, countryCode: country, source: geoCountry ? 'geolocation' : 'locale' };
}
