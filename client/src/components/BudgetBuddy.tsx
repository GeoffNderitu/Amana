import { useMemo, useRef, useState, useEffect } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import type { FullState } from '../lib/api';
import { buildInsights, readyToAssign } from '../lib/insights';
import { computeSavings } from '../lib/savings';

type Mood = 'great' | 'good' | 'meh' | 'worried';

const MOOD_COPY: Record<Mood, { face: string; lines: string[] }> = {
  great: {
    face: '˘◡˘',
    lines: [
      "You're crushing it — every category's on track.",
      'Zero overspending. This is the good stuff.',
      "I've got nothing to worry about today. Nice work.",
    ],
  },
  good: {
    face: '◡‿◡',
    lines: [
      'Looking solid. Keep an eye on the close ones.',
      'Mostly smooth sailing this month.',
      "You're doing better than most people who never check.",
    ],
  },
  meh: {
    face: '•‿•',
    lines: [
      'A category or two is running hot — worth a peek.',
      "Nothing alarming, but let's tighten up before month-end.",
      'Small drift is normal. Just keep an eye on it.',
    ],
  },
  worried: {
    face: '◉﹏◉',
    lines: [
      'A few categories are over. Want to move some money around?',
      "This is fixable — let's rebalance before it snowballs.",
      "I'm not panicking. You shouldn't either — just adjust.",
    ],
  },
};

interface ChatMsg {
  from: 'buddy' | 'user';
  text: string;
}

/** Builds a reply from real budget data for a given quick-reply topic or free-text question —
 * everything here is derived from `state`, never invented, so Buddy never says anything that
 * isn't actually true of the user's numbers. */
function answer(topic: string, state: FullState, format: (n: number) => string): string {
  const rta = readyToAssign(state);
  const overspent = state.categories.filter((c) => c.spent > c.assigned && c.assigned > 0);
  const savings = computeSavings(state);
  const debts = state.accounts.filter((a) => a.type === 'liability' && a.balance > 0);
  const goals = state.goals.filter((g) => g.target > 0);
  const t = topic.toLowerCase();

  if (t.includes('how am i doing') || t.includes('overview') || t.includes('status')) {
    if (overspent.length === 0 && rta >= 0) {
      return `Genuinely good shape: nothing's overspent, and you've still got ${format(rta)} unassigned to put to work.`;
    }
    if (overspent.length > 0) {
      return `${overspent.length} categor${overspent.length === 1 ? 'y is' : 'ies are'} running over right now: ${overspent
        .slice(0, 3)
        .map((c) => c.name)
        .join(', ')}${overspent.length > 3 ? ', and more' : ''}. Nothing urgent, but worth a rebalance.`;
    }
    return `You're ${rta < 0 ? `over-assigned by ${format(Math.abs(rta))}` : `on track`} — pull back a category or two to zero it out.`;
  }
  if (t.includes('cut') || t.includes('trim') || t.includes('save more')) {
    if (overspent.length > 0) {
      const worst = [...overspent].sort((a, b) => b.spent - b.assigned - (a.spent - a.assigned))[0];
      return `Start with **${worst.name}** — it's ${format(worst.spent - worst.assigned)} over budget, the biggest gap right now. Trimming there does the most good fastest.`;
    }
    const subsTotal = state.subscriptions.reduce((a, s) => a + s.amount, 0);
    if (subsTotal > 0) {
      return `Nothing's overspent, so look at recurring costs instead — you've got ${format(subsTotal)}/mo in subscriptions. Even cancelling one unused one adds up over a year.`;
    }
    return "Nothing obvious to cut — you're already lean. Nice problem to have.";
  }
  if (t.includes('debt')) {
    if (debts.length === 0) return "You're debt-free in what I can see here. Nothing to plan around.";
    const priciest = [...debts].sort((a, b) => (b.interestRate ?? 0) - (a.interestRate ?? 0))[0];
    return `**${priciest.name}** is your priciest balance at ${priciest.interestRate ?? 0}% APR on ${format(
      priciest.balance
    )}. Throwing extra at that one first (avalanche method) usually saves the most in interest — check the Debt Payoff page for a real timeline.`;
  }
  if (t.includes('saving') || t.includes('savings rate')) {
    if (!savings.hasData) return "Set a monthly income on the Budget page and I can tell you your real savings rate.";
    return `You're saving ${format(savings.actualSaved)} this month — about ${(savings.savingsRate * 100).toFixed(
      0
    )}% of income. ${savings.savingsRate < 0.15 ? 'Even a small bump here compounds a lot over time.' : "That's a solid rate — keep it up."}`;
  }
  if (t.includes('goal')) {
    if (goals.length === 0) return "No goals set yet — add one on the Goals page and I'll track progress for you.";
    const closest = [...goals].sort((a, b) => b.saved / b.target - a.saved / a.target)[0];
    const pct = (closest.saved / closest.target) * 100;
    return `**${closest.name}** is your closest goal at ${pct.toFixed(0)}% funded — ${format(
      closest.target - closest.saved
    )} left to go.`;
  }
  if (t.includes('win') || t.includes('good news') || t.includes('praise')) {
    const wins: string[] = [];
    if (overspent.length === 0) wins.push('nothing is overspent');
    if (rta >= 0) wins.push('every dollar has a job');
    if (savings.hasData && savings.savingsRate >= 0.15) wins.push(`you're saving ${(savings.savingsRate * 100).toFixed(0)}% of income`);
    const nearDone = goals.find((g) => g.saved / g.target >= 0.85);
    if (nearDone) wins.push(`**${nearDone.name}** is almost fully funded`);
    if (wins.length === 0) return "Nothing to brag about yet this month — but showing up and checking counts for something.";
    return `Here's what's going right: ${wins.join('; ')}.`;
  }

  // Fallback: surface the single most relevant computed insight.
  const insights = buildInsights(state, format);
  if (insights.length > 0) return insights[0];
  return "Everything looks calm — no flags in your numbers right now.";
}

const QUICK_REPLIES = ['How am I doing?', 'What should I cut?', 'Debt advice', 'Savings rate', 'My goals', 'Any wins?'];

/**
 * Amana Buddy — an interactive, data-grounded budget companion. Tapping it opens a small
 * chat panel with quick-reply prompts (and free text) that get answered entirely from the
 * user's own computed budget data — no network call, no invented numbers.
 */
export function BudgetBuddy({ state, format }: { state: FullState; format: (n: number) => string }) {
  const rta = readyToAssign(state);
  const overspent = state.categories.filter((c) => c.spent > c.assigned && c.assigned > 0);
  const totalCategories = state.categories.length;

  const mood: Mood = useMemo(() => {
    if (totalCategories === 0) return 'good';
    const ratio = overspent.length / totalCategories;
    if (overspent.length === 0 && rta >= 0) return 'great';
    if (ratio <= 0.15) return 'good';
    if (ratio <= 0.35) return 'meh';
    return 'worried';
  }, [overspent.length, totalCategories, rta]);

  const copy = MOOD_COPY[mood];
  const line = useMemo(() => copy.lines[new Date().getDate() % copy.lines.length], [copy]);

  const bodyClass =
    mood === 'great' ? 'gradient-money' : mood === 'good' ? 'gradient-brand' : mood === 'meh' ? 'gradient-warm' : 'bg-red';

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ from: 'buddy', text: `${line} Ask me anything about your budget, or tap a suggestion below.` }]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  function ask(text: string) {
    if (!text.trim()) return;
    const reply = answer(text, state, format);
    setMessages((m) => [...m, { from: 'user', text: text.trim() }, { from: 'buddy', text: reply }]);
    setDraft('');
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left card-lift bg-paper border border-line rounded-2xl p-4 flex items-center gap-3.5 hover:border-brand-bright transition-colors"
      >
        <div className={`w-12 h-12 rounded-full ${bodyClass} flex items-center justify-center shrink-0 animate-float shadow-sm`}>
          <span className="text-white font-bold text-[15px] select-none" style={{ fontFamily: 'ui-monospace, monospace' }}>
            {copy.face}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-mute font-medium mb-0.5 flex items-center gap-1.5">
            Amana buddy
            <MessageCircle size={11} className="text-brand" />
          </div>
          <div className="text-[13.5px] text-ink-soft leading-snug truncate">{line}</div>
        </div>
        <span className="text-[11px] text-brand font-semibold shrink-0 hidden sm:block">{open ? 'Close' : 'Ask me'}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-2 left-0 right-0 sm:right-auto sm:w-[380px] bg-paper border border-line rounded-2xl shadow-xl shadow-ink/10 overflow-hidden animate-fade-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line gradient-brand text-white">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[11px]" style={{ fontFamily: 'ui-monospace, monospace' }}>
                {copy.face}
              </span>
              Amana buddy
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div ref={scrollRef} className="max-h-72 overflow-y-auto scroll-thin px-4 py-3 flex flex-col gap-2.5 bg-cloud">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-snug ${
                    m.from === 'user' ? 'gradient-brand text-white rounded-br-sm' : 'bg-paper border border-line text-ink rounded-bl-sm'
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: m.text.replace(/\*\*(.+?)\*\*/g, m.from === 'user' ? '<b>$1</b>' : '<b class="text-brand-deep">$1</b>'),
                  }}
                />
              </div>
            ))}
          </div>

          <div className="px-3 pt-2.5 pb-1 flex flex-wrap gap-1.5 border-t border-line">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="text-[11.5px] font-medium text-brand bg-brand-softer hover:bg-brand-soft rounded-full px-2.5 py-1 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="flex items-center gap-2 px-3 py-2.5"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about your budget…"
              className="flex-1 bg-cloud border border-line rounded-lg px-3 py-2 text-[13px] text-ink placeholder:text-mute focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="shrink-0 w-9 h-9 rounded-lg gradient-brand text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
