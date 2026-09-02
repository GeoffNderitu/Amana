import { useState } from 'react';
import type { FullState } from '../lib/api';
import { groupBy } from '../lib/format';
import { readyToAssign } from '../lib/insights';
import { useCurrency } from '../lib/CurrencyContext';
import { SectionHeading, Button, Field, EmptyState, inputClass } from '../components/Bits';
import { CategoryCard } from '../components/CategoryCard';

export function Budget({
  state,
  onAssign,
  onUpdateIncome,
  onAddCategory,
  onDeleteCategory,
}: {
  state: FullState;
  onAssign: (id: string, amount: number) => void;
  onUpdateIncome: (income: number) => void;
  onAddCategory: (name: string) => void;
  onDeleteCategory?: (id: string, name: string, hasSpend: boolean) => void;
}) {
  const { format, convert, currency, rate } = useCurrency();
  const rta = readyToAssign(state);
  const groups = groupBy(state.categories, (c) => c.group);
  const [income, setIncome] = useState(String(Math.round(convert(state.settings.income) * 100) / 100));
  const assigned = state.categories.reduce((a, c) => a + c.assigned, 0);
  const allocatedPct = state.settings.income > 0 ? Math.min(100, (assigned / state.settings.income) * 100) : 0;

  return (
    <>
      <div className="gradient-brand rounded-2xl px-6 py-5 mb-6 text-white relative overflow-hidden animate-fade-up">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 animate-float" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-white/70 mb-1 font-medium">Ready to assign</div>
            <div className={`font-num text-[30px] font-extrabold ${rta < 0 ? 'text-red-300' : 'text-white'}`}>{format(rta)}</div>
            <div className="text-xs text-white/75 mt-1">{allocatedPct.toFixed(0)}% of income given a job</div>
          </div>
          <Field label={`Monthly income (${currency})`}>
            <input
              type="number"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              onBlur={() => {
                const v = parseFloat(income);
                if (!isNaN(v) && v >= 0) onUpdateIncome(v / rate);
              }}
              className={`${inputClass} w-36 !bg-white/95 !text-[#171332] !border-white/40 [color-scheme:light]`}
            />
          </Field>
          <Button
            onClick={() => {
              const name = prompt('New category name:');
              if (name && name.trim()) onAddCategory(name.trim());
            }}
          >
            + New category
          </Button>
        </div>
      </div>

      {state.categories.length === 0 ? (
        <EmptyState>No categories yet — add your first one above, or load sample data from Settings.</EmptyState>
      ) : (
        Object.entries(groups).map(([group, cats]) => (
          <div key={group}>
            <SectionHeading>{group}</SectionHeading>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {cats.map((c) => (
                <CategoryCard
                  key={c.id}
                  category={c}
                  onAssign={onAssign}
                  onDelete={onDeleteCategory ? (cat) => onDeleteCategory(cat.id, cat.name, cat.spent !== 0 || cat.assigned !== 0) : undefined}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
