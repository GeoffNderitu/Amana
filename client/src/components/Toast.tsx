import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, PartyPopper, AlertCircle, Sparkles } from 'lucide-react';

type ToastKind = 'success' | 'celebrate' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastKind, React.ElementType> = {
  success: CheckCircle2,
  celebrate: PartyPopper,
  error: AlertCircle,
  info: Sparkles,
};

const STYLES: Record<ToastKind, string> = {
  success: 'bg-emerald text-white',
  celebrate: 'gradient-brand text-white',
  error: 'bg-red text-white',
  info: 'bg-ink text-paper',
};

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++idCounter;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-[1000] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              className={`animate-toast-in pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg shadow-brand/10 text-sm font-medium max-w-xs ${STYLES[t.kind]}`}
            >
              <Icon size={17} strokeWidth={2.25} className="shrink-0" />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
