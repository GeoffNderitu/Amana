export interface ThemeDef {
  id: string;
  label: string;
  description: string;
  /** Swatch colors for the picker UI — brand, then accent — sampled from the actual theme vars. */
  swatch: [string, string];
}

export const THEMES: ThemeDef[] = [
  { id: 'violet', label: 'Amana Violet', description: 'The original — indigo and emerald', swatch: ['#6d28d9', '#0ea975'] },
  { id: 'ocean', label: 'Ocean', description: 'Teal and amber, calm and clear', swatch: ['#0e7490', '#f59e0b'] },
  { id: 'sunset', label: 'Sunset', description: 'Rose and gold, warm energy', swatch: ['#e11d48', '#f59e0b'] },
  { id: 'forest', label: 'Forest', description: 'Deep green and teal, grounded', swatch: ['#15803d', '#0d9488'] },
  { id: 'rose', label: 'Rose', description: 'Pink and orange, playful', swatch: ['#be185d', '#f97316'] },
  { id: 'midnight', label: 'Midnight', description: 'Dark mode — easy on the eyes at night', swatch: ['#131226', '#8b5cf6'] },
  { id: 'sand', label: 'Sand', description: 'Warm terracotta and olive, easygoing', swatch: ['#b45309', '#4d7c0f'] },
  { id: 'berry', label: 'Berry', description: 'Deep magenta and violet, bold and rich', swatch: ['#a21caf', '#6d28d9'] },
];

export function applyTheme(themeId: string | undefined | null) {
  const valid = THEMES.some((t) => t.id === themeId);
  document.documentElement.setAttribute('data-theme', valid ? (themeId as string) : 'violet');
}

// A curated set of accent hexes to pick from quickly, plus a "custom" native color input
// in Settings for anything else. Kept separate from THEMES: an accent recolors just the
// brand hue on top of whichever theme (light/dark, palette) the user already picked.
export const ACCENT_PRESETS: string[] = [
  '#6d28d9', '#0e7490', '#e11d48', '#15803d', '#be185d', '#d69e18', '#0ea975', '#4338ca',
];

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Mixes toward white (t>0) or black (t<0) — a quick, dependency-free way to derive a
// bright/deep/soft/softer ramp from a single accent hex so custom colors still get the
// same four-step token set every theme preset uses.
function mix(hex: string, target: [number, number, number], t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [tr, tg, tb] = target;
  return rgbToHex(r + (tr - r) * t, g + (tg - g) * t, b + (tb - b) * t);
}

/**
 * Applies (or clears) a custom brand-color override on top of whichever theme preset is
 * active. Sets inline CSS custom properties on <html>, which win over the theme-preset
 * rules in index.css since inline style has higher specificity than a class/attribute
 * selector — no extra theme variant needed per accent.
 */
export function applyAccent(hex: string | undefined | null) {
  const root = document.documentElement.style;
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    root.removeProperty('--color-brand');
    root.removeProperty('--color-brand-deep');
    root.removeProperty('--color-brand-bright');
    root.removeProperty('--color-brand-soft');
    root.removeProperty('--color-brand-softer');
    return;
  }
  root.setProperty('--color-brand', hex);
  root.setProperty('--color-brand-deep', mix(hex, [0, 0, 0], 0.35));
  root.setProperty('--color-brand-bright', mix(hex, [255, 255, 255], 0.3));
  root.setProperty('--color-brand-soft', mix(hex, [255, 255, 255], 0.85));
  root.setProperty('--color-brand-softer', mix(hex, [255, 255, 255], 0.94));
}

export const AVATAR_EMOJI_OPTIONS = [
  '🙂', '😎', '🥳', '🤓', '😌', '🦁', '🐼', '🦊', '🐨', '🐸',
  '🌸', '🌵', '🍀', '⭐', '🔥', '🌙', '☕', '🎯', '💡', '🚀',
];

export const AVATAR_COLOR_OPTIONS: { id: string; label: string }[] = [
  { id: 'brand', label: 'Brand' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'clay', label: 'Clay' },
  { id: 'gold', label: 'Gold' },
  { id: 'rose', label: 'Rose' },
  { id: 'sky', label: 'Sky' },
];

// A few avatar colors (rose, sky) aren't theme-driven tokens — keep them fixed so the
// avatar stays recognizable as "you" even when the app-wide theme changes.
export const AVATAR_COLOR_HEX: Record<string, string> = {
  brand: 'var(--color-brand)',
  emerald: 'var(--color-emerald)',
  clay: 'var(--color-clay)',
  gold: 'var(--color-gold)',
  rose: '#e11d48',
  sky: '#0284c7',
};
