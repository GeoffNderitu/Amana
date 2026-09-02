import { LayoutGrid, Wallet, Receipt, Repeat, Target, BookOpen, Settings as SettingsIcon, TrendingUp, CreditCard, FileBarChart, Send, Flame, Users, UserPlus, Search, UploadCloud } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Avatar } from './Avatar';

export type Page =
  | 'dashboard'
  | 'budget'
  | 'transactions'
  | 'import'
  | 'subscriptions'
  | 'goals'
  | 'networth'
  | 'debt'
  | 'family'
  | 'household'
  | 'connections'
  | 'reports'
  | 'learn'
  | 'settings';

const NAV: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'budget', label: 'Budget', icon: Wallet },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'import', label: 'Import Statement', icon: UploadCloud },
  { id: 'subscriptions', label: 'Subscriptions', icon: Repeat },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'networth', label: 'Net Worth', icon: TrendingUp },
  { id: 'debt', label: 'Debt Payoff', icon: CreditCard },
  { id: 'family', label: 'Family & Remittances', icon: Send },
  { id: 'household', label: 'Household', icon: Users },
  { id: 'connections', label: 'Connections', icon: UserPlus },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'learn', label: 'Learn', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar({
  page,
  setPage,
  streak,
  level,
}: {
  page: Page;
  setPage: (p: Page) => void;
  streak?: number;
  level?: number;
}) {
  const { user } = useAuth();

  return (
    <aside className="app-sidebar md:w-64 w-full md:h-screen md:sticky md:top-0 bg-paper border-b md:border-b-0 md:border-r border-line flex md:flex-col shrink-0 z-20">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-line">
        <div className="w-9 h-9 rounded-2xl gradient-brand flex items-center justify-center relative overflow-hidden shadow-sm shadow-brand/30">
          <div className="w-3.5 h-3.5 rounded-full bg-white/90 -mr-1.5" />
          <div className="w-3.5 h-3.5 rounded-full bg-white/40 -ml-1.5" />
        </div>
        <span className="font-extrabold text-[19px] tracking-[-0.04em] text-gradient-brand">Amana</span>
        {!!streak && streak > 1 && (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-clay bg-clay-softer px-2 py-1 rounded-full">
            <Flame size={12} className="fill-clay text-clay" />
            {streak}
          </span>
        )}
      </div>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('amana:open-palette'))}
        className="hidden md:flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded-xl text-[13px] text-mute bg-cloud border border-line hover:border-brand-bright hover:text-brand transition-colors"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Quick search</span>
        <kbd className="text-[10px] font-num bg-paper border border-line rounded px-1.5 py-0.5">⌘K</kbd>
      </button>
      {/* min-h-0 is required here: without it, a flex child inside this h-screen column
          refuses to shrink below its content size, so overflow-y-auto below would never
          actually kick in — the nav would just silently overflow the sidebar's box
          (and visually spill into whatever sits below/beside it) instead of scrolling. */}
      <nav className="flex md:flex-col flex-row overflow-x-auto md:overflow-x-visible md:overflow-y-auto scroll-thin px-3 py-4 gap-1 flex-1 min-h-0">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-150
                ${active ? 'gradient-brand text-white shadow-sm shadow-brand/25' : 'text-ink-soft hover:bg-cloud hover:translate-x-0.5'}`}
            >
              <Icon size={16} strokeWidth={2.25} className={active ? '' : 'group-hover:text-brand transition-colors'} />
              {label}
            </button>
          );
        })}
      </nav>
      <button
        onClick={() => setPage('settings')}
        className="hidden md:flex items-center gap-2.5 px-5 py-4 border-t border-line text-left hover:bg-cloud transition-colors"
      >
        <div className="relative shrink-0">
          <Avatar emoji={user?.avatarEmoji} color={user?.avatarColor} image={user?.avatarImage} size={32} />
          {!!level && (
            <span className="absolute -bottom-1 -right-1 gradient-brand text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-paper">
              {level}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate">{user?.name ?? 'Account'}</div>
          <div className="text-[11px] text-mute truncate">{user?.currency ?? 'USD'}</div>
        </div>
      </button>
    </aside>
  );
}
