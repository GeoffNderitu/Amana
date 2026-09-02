export type ColorMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'amana:color-mode';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies the resolved light/dark mode to <html data-mode="...">, which every theme's dark
 * override in index.css keys off. Call whenever the user's stored preference (or the OS
 * preference, when following "system") could have changed. */
export function applyColorMode(mode: ColorMode | undefined | null) {
  const m = mode || 'system';
  const dark = m === 'dark' || (m === 'system' && systemPrefersDark());
  document.documentElement.setAttribute('data-mode', dark ? 'dark' : 'light');
}

let listenerAttached = false;

/** Keeps "system" mode live — if the user is following the OS setting and flips their OS
 * from light to dark (or vice versa) without reloading the app, this re-applies immediately. */
export function watchSystemColorMode(getCurrentMode: () => ColorMode | undefined | null) {
  if (listenerAttached || typeof window === 'undefined' || !window.matchMedia) return;
  listenerAttached = true;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if ((getCurrentMode() || 'system') === 'system') applyColorMode('system');
  };
  // Safari <14 only supports the deprecated addListener; fall back for compatibility.
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if ((mq as any).addListener) (mq as any).addListener(handler);
}

/** Used before login, when there's no user record yet to store a preference on. */
export function getLocalColorMode(): ColorMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // ignore
  }
  return 'system';
}

export function setLocalColorMode(mode: ColorMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore — worst case the preference doesn't persist across sessions
  }
}
