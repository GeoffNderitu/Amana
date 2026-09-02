import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  LayoutGrid,
  Wallet,
  Receipt,
  Repeat,
  Target,
  BookOpen,
  Settings as SettingsIcon,
  TrendingUp,
  CreditCard,
  FileBarChart,
  Send,
  Users,
  UserPlus,
  Plus,
  Moon,
  Sun,
  Monitor,
  LogOut,
  Download,
  CornerDownLeft,
  UploadCloud,
} from 'lucide-react';
import type { Page } from './Sidebar';
import { useAuth } from '../lib/AuthContext';
import { setLocalColorMode, applyColorMode, type ColorMode } from '../lib/colorMode';

/** Fired so any listener (currently QuickAdd) can open its own panel without the palette
 * needing to know about that component's internal state. Keeps the palette decoupled from
 * the specific UI it's triggering. */
export function fireQuickAdd() {
  window.dispatchEvent(new CustomEvent('amana:quick-add'));
}

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: React.ElementType;
  action: () => void;
  section: 'Navigate' | 'Actions' | 'Appearance' | 'Account';
}

export function CommandPalette({ setPage, onExportCsv }: { setPage: (p: Page) => void; onExportCsv?: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { logout, user, updateProfile } = useAuth();

  const close = () => {
    setOpen(false);
    setQuery('');
    setActiveIdx(0);
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape' && open) {
        close();
      }
    }
    function onExternalOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('amana:open-palette', onExternalOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('amana:open-palette', onExternalOpen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  function setMode(mode: ColorMode) {
    setLocalColorMode(mode);
    applyColorMode(mode);
    if (user) updateProfile({ colorMode: mode }).catch(() => {});
  }

  const items = useMemo<CommandItem[]>(() => {
    const nav: [Page, string, React.ElementType][] = [
      ['dashboard', 'Dashboard', LayoutGrid],
      ['budget', 'Budget', Wallet],
      ['transactions', 'Transactions', Receipt],
      ['import', 'Import Statement', UploadCloud],
      ['subscriptions', 'Subscriptions', Repeat],
      ['goals', 'Goals', Target],
      ['networth', 'Net Worth', TrendingUp],
      ['debt', 'Debt Payoff', CreditCard],
      ['family', 'Family & Remittances', Send],
      ['household', 'Household', Users],
      ['connections', 'Connections', UserPlus],
      ['reports', 'Reports', FileBarChart],
      ['learn', 'Learn', BookOpen],
      ['settings', 'Settings', SettingsIcon],
    ];
    const navItems: CommandItem[] = nav.map(([id, label, icon]) => ({
      id: `nav-${id}`,
      label,
      hint: 'Go to page',
      icon,
      action: () => setPage(id),
      section: 'Navigate',
    }));

    const actionItems: CommandItem[] = [
      {
        id: 'quick-add',
        label: 'Add a transaction',
        hint: 'Quick add',
        keywords: 'log spend new expense',
        icon: Plus,
        action: () => fireQuickAdd(),
        section: 'Actions',
      },
      ...(onExportCsv
        ? [
            {
              id: 'export-csv',
              label: 'Export transactions to CSV',
              hint: 'Reports',
              icon: Download,
              action: onExportCsv,
              section: 'Actions' as const,
            },
          ]
        : []),
    ];

    const appearanceItems: CommandItem[] = [
      { id: 'mode-light', label: 'Switch to light mode', icon: Sun, action: () => setMode('light'), section: 'Appearance' },
      { id: 'mode-dark', label: 'Switch to dark mode', icon: Moon, action: () => setMode('dark'), section: 'Appearance' },
      { id: 'mode-system', label: 'Match system appearance', icon: Monitor, action: () => setMode('system'), section: 'Appearance' },
    ];

    const accountItems: CommandItem[] = [
      { id: 'sign-out', label: 'Sign out', icon: LogOut, action: () => logout(), section: 'Account' },
    ];

    return [...navItems, ...actionItems, ...appearanceItems, ...accountItems];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPage, onExportCsv, user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.keywords || ''} ${i.section}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => setActiveIdx(0), [query]);

  function run(item: CommandItem) {
    item.action();
    close();
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIdx]) run(filtered[activeIdx]);
    }
  }

  if (!open) return null;

  let runningIdx = -1;
  const sections: CommandItem['section'][] = ['Navigate', 'Actions', 'Appearance', 'Account'];

  return (
    <div
      className="fixed inset-0 bg-ink/30 backdrop-blur-[2px] z-50 flex items-start justify-center pt-[12vh] px-4"
      onClick={close}
    >
      <div
        className="animate-pop bg-paper border border-line rounded-2xl w-full max-w-lg shadow-2xl shadow-brand/25 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
          <Search size={16} className="text-mute shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Jump to a page, add a transaction, switch theme…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-mute"
          />
          <kbd className="hidden sm:block text-[10px] font-num text-mute bg-cloud border border-line rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 && <div className="px-4 py-6 text-sm text-mute text-center">No matches</div>}
          {sections.map((section) => {
            const inSection = filtered.filter((i) => i.section === section);
            if (inSection.length === 0) return null;
            return (
              <div key={section} className="mb-1">
                <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wide text-mute font-semibold">{section}</div>
                {inSection.map((item) => {
                  runningIdx++;
                  const idx = runningIdx;
                  const active = idx === activeIdx;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => run(item)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors ${
                        active ? 'bg-brand-softer text-ink' : 'text-ink-soft hover:bg-cloud'
                      }`}
                    >
                      <Icon size={15} className={active ? 'text-brand' : 'text-mute'} />
                      <span className="flex-1">{item.label}</span>
                      {item.hint && <span className="text-[10.5px] text-mute">{item.hint}</span>}
                      {active && <CornerDownLeft size={13} className="text-brand" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
