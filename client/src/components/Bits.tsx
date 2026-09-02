import type { ReactNode } from 'react';
import { AnimatedNumber } from './AnimatedNumber';

export function StatCard({
  label,
  value,
  numericValue,
  format,
  valueClass = '',
  detail,
  accent = 'brand',
}: {
  label: string;
  value: string;
  numericValue?: number;
  format?: (n: number) => string;
  valueClass?: string;
  detail?: string;
  accent?: 'brand' | 'money' | 'warm' | 'none';
}) {
  const bar: Record<string, string> = {
    brand: 'gradient-brand',
    money: 'gradient-money',
    warm: 'gradient-warm',
    none: '',
  };
  return (
    <div className="card-lift relative bg-paper border border-line rounded-[1.35rem] px-5 py-5 overflow-hidden">
      {accent !== 'none' && <div className={`absolute top-0 left-0 bottom-0 w-1 ${bar[accent]}`} />}
      <div className="text-[10px] uppercase tracking-[0.13em] text-mute mb-2.5 font-bold">{label}</div>
      <div className={`font-num text-[23px] font-bold tracking-tight ${valueClass}`}>
        {numericValue !== undefined && format ? <AnimatedNumber value={numericValue} format={format} /> : value}
      </div>
      {detail && <div className="text-xs text-ink-soft mt-1.5">{detail}</div>}
    </div>
  );
}

export function SectionHeading({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-10 mb-3.5">
      {icon && <span className="text-brand">{icon}</span>}
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink-soft whitespace-nowrap">{children}</h2>
      <div className="h-px bg-line flex-1" />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="text-center text-sm text-mute border border-dashed border-line rounded-2xl py-9 px-5 bg-paper/60">
      {children}
    </div>
  );
}

export function InsightCard({ text }: { text: string }) {
  const html = text.replace(/\*\*(.+?)\*\*/g, '<b class="text-ink font-semibold">$1</b>');
  return (
    <div
      className="card-lift bg-brand-softer border-l-[3px] border-brand rounded-r-xl px-4 py-3 mb-2.5 text-sm text-ink-soft leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function ProgressBar({
  pct,
  colorClass = 'gradient-money',
  height = 'h-2',
}: {
  pct: number;
  colorClass?: string;
  height?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={`${height} bg-cloud-dim rounded-full overflow-hidden`}>
      <div
        className={`h-full rounded-full ${colorClass} transition-[width] duration-700 ease-out`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  type = 'button',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const styles: Record<string, string> = {
    default: 'bg-paper border border-line text-ink hover:border-brand-bright hover:text-brand hover:bg-brand-softer',
    primary: 'gradient-brand text-white border border-transparent shadow-md shadow-brand/20 hover:brightness-110 active:scale-[0.97]',
    danger: 'bg-paper border border-line text-mute hover:border-red hover:text-red hover:bg-red-soft',
    ghost: 'bg-transparent text-mute hover:text-ink',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] uppercase tracking-[0.12em] text-mute font-bold">{label}</label>
      {children}
    </div>
  );
}

export const inputClass =
  'bg-cloud border border-line rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-mute focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none font-num transition-colors';
export const inputClassText =
  'bg-cloud border border-line rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-mute focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none transition-colors';
