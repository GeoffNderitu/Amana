import { useEffect, useRef, useState } from 'react';
import { Bell, AlertTriangle, Info, PartyPopper, CloudOff } from 'lucide-react';
import type { FullState } from '../lib/api';
import { buildAlerts, type AlertSeverity } from '../lib/alerts';
import { useCurrency } from '../lib/CurrencyContext';
import { useAuth } from '../lib/AuthContext';

const ICONS: Record<AlertSeverity, React.ElementType> = {
  warning: AlertTriangle,
  info: Info,
  success: PartyPopper,
};
const ICON_CLASS: Record<AlertSeverity, string> = {
  warning: 'text-red',
  info: 'text-brand',
  success: 'text-emerald-deep',
};

const PENDING_SYNC_ID = 'pending-sync';

export function NotificationBell({ state, pendingSync = 0 }: { state: FullState; pendingSync?: number }) {
  const { format } = useCurrency();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const alerts = buildAlerts(state, format);
  const currentIds = alerts.map((a) => a.id).concat(pendingSync > 0 ? [PENDING_SYNC_ID] : []);

  // Read/unread, tracked per user in localStorage: once the dropdown has been opened, every
  // notification visible at that moment is marked seen, so the badge only counts ones that
  // are genuinely new since the last time it was checked — not the full list every time.
  const seenKey = user ? `amana:seen-notifications:${user.id}` : null;
  const [seenIds, setSeenIds] = useState<string[]>(() => {
    if (!seenKey) return [];
    try {
      return JSON.parse(localStorage.getItem(seenKey) || '[]');
    } catch {
      return [];
    }
  });

  const unseenIds = currentIds.filter((id) => !seenIds.includes(id));
  const unseenAlerts = alerts.filter((a) => unseenIds.includes(a.id));
  const warningCount = unseenAlerts.filter((a) => a.severity === 'warning').length;
  const totalCount = unseenIds.length;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Opening the panel is what "reads" it — mark everything currently listed as seen, so the
  // badge count reflects only what's new the next time something changes.
  function handleToggle() {
    setOpen((o) => {
      const next = !o;
      if (next && seenKey) {
        const merged = Array.from(new Set([...seenIds, ...currentIds]));
        setSeenIds(merged);
        try {
          localStorage.setItem(seenKey, JSON.stringify(merged));
        } catch {
          // ignore — worst case the badge re-shows already-seen items next reload
        }
      }
      return next;
    });
  }

  return (
    <div className="relative z-20" ref={ref}>
      <button
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative card-lift bg-paper border border-line rounded-xl w-10 h-10 flex items-center justify-center text-ink-soft hover:text-brand transition-colors"
      >
        <Bell size={17} />
        {totalCount > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${
              warningCount > 0 ? 'bg-red' : 'gradient-brand'
            }`}
          >
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto scroll-thin bg-paper border border-line rounded-2xl shadow-2xl shadow-brand/20 z-40 animate-pop">
          <div className="px-4 py-3 border-b border-line text-[13px] font-bold">Notifications</div>
          {alerts.length === 0 && pendingSync === 0 ? (
            <div className="px-4 py-8 text-sm text-mute text-center">You're all caught up — nothing needs attention.</div>
          ) : (
            <div className="py-1.5">
              {pendingSync > 0 && (
                <div className="flex items-start gap-2.5 px-4 py-2.5 text-[12.5px] text-ink-soft leading-snug border-b border-line/60">
                  <CloudOff size={14} className="shrink-0 mt-0.5 text-clay" />
                  <span>
                    {pendingSync} {pendingSync === 1 ? 'transaction is' : 'transactions are'} saved offline and will sync automatically once you're back online.
                  </span>
                </div>
              )}
              {alerts.map((a) => {
                const Icon = ICONS[a.severity];
                return (
                  <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5 text-[12.5px] text-ink-soft leading-snug border-b border-line/60 last:border-b-0">
                    <Icon size={14} className={`shrink-0 mt-0.5 ${ICON_CLASS[a.severity]}`} />
                    <span>{a.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
