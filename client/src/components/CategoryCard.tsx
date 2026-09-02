import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Category } from '../lib/api';
import { useCurrency } from '../lib/CurrencyContext';
import { Button, ProgressBar, inputClass } from './Bits';

export function CategoryCard({
  category,
  onAssign,
  onDelete,
}: {
  category: Category;
  onAssign: (id: string, amountUsd: number) => void;
  onDelete?: (category: Category) => void;
}) {
  const { format, toUsd } = useCurrency();
  const [value, setValue] = useState('');
  const pct = category.assigned > 0 ? Math.min(100, (category.spent / category.assigned) * 100) : category.spent > 0 ? 100 : 0;
  const over = category.spent > category.assigned;
  const remaining = category.assigned - category.spent;
  const empty = category.assigned === 0 && category.spent === 0;

  const statusLabel = empty ? 'unassigned' : over ? 'over' : 'on track';
  const statusClass = empty ? 'bg-cloud text-mute' : over ? 'bg-red-soft text-red' : 'bg-emerald-soft text-emerald-deep';

  function submit() {
    const val = parseFloat(value);
    if (!isNaN(val) && val >= 0) {
      onAssign(category.id, toUsd(val));
      setValue('');
    }
  }

  return (
    <div className="card-lift bg-paper border border-line rounded-2xl p-4">
      <div className="flex justify-between items-start mb-2.5">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mute font-num">{category.group}</div>
          <div className="text-[15px] font-semibold mt-0.5">{category.name}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusClass}`}>
            {statusLabel}
          </span>
          {onDelete && !category.isSystem && (
            <button
              type="button"
              onClick={() => onDelete(category)}
              title="Delete category"
              aria-label={`Delete ${category.name}`}
              className="text-mute hover:text-red hover:bg-red-soft rounded-md p-1 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="flex justify-between font-num text-[13px] text-ink-soft mb-2">
        <span>
          Spent <b className="text-ink">{format(category.spent)}</b>
        </span>
        <span>
          Job <b className="text-ink">{format(category.assigned)}</b>
        </span>
      </div>
      <div className="mb-3">
        <ProgressBar pct={pct} colorClass={over ? 'bg-red' : 'gradient-money'} />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="1"
          placeholder="Assign"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className={`${inputClass} w-24`}
        />
        <Button onClick={submit} variant="primary">
          Assign
        </Button>
        <span className={`ml-auto font-num text-xs font-medium ${remaining >= 0 ? 'text-ink-soft' : 'text-red'}`}>
          {remaining >= 0 ? `${format(remaining)} left` : `${format(remaining)} short`}
        </span>
      </div>
    </div>
  );
}
