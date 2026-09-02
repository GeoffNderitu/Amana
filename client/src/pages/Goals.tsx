import { useState } from 'react';
import type { FullState, Goal } from '../lib/api';
import { useCurrency } from '../lib/CurrencyContext';
import { Button, Field, EmptyState, ProgressBar, inputClass, inputClassText } from '../components/Bits';
import { Confetti } from '../components/Confetti';
import { playSuccess } from '../lib/sounds';
import { PartyPopper, Pencil, Trash2 } from 'lucide-react';

function GoalCard({
  goal,
  onAdd,
  onUpdate,
  onDelete,
}: {
  goal: Goal;
  onAdd: (id: string, amountUsd: number) => void;
  onUpdate: (id: string, patch: { name?: string; target?: number; saved?: number }) => void;
  onDelete: (id: string) => void;
}) {
  const { format, toUsd, convert } = useCurrency();
  const [value, setValue] = useState('');
  const [celebrate, setCelebrate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(goal.name);
  const [editTarget, setEditTarget] = useState(() => convert(goal.target).toFixed(0));
  const [editSaved, setEditSaved] = useState(() => convert(goal.saved).toFixed(0));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const pct = goal.target > 0 ? Math.min(100, (goal.saved / goal.target) * 100) : 0;
  const complete = goal.target > 0 && goal.saved >= goal.target;

  function submit() {
    const v = parseFloat(value);
    if (!isNaN(v) && v > 0) {
      const wasComplete = goal.target > 0 && goal.saved >= goal.target;
      onAdd(goal.id, toUsd(v));
      setValue('');
      if (!wasComplete && goal.saved + toUsd(v) >= goal.target) {
        setCelebrate(true);
        playSuccess();
      }
    }
  }

  function startEdit() {
    setEditName(goal.name);
    setEditTarget(convert(goal.target).toFixed(0));
    setEditSaved(convert(goal.saved).toFixed(0));
    setConfirmingDelete(false);
    setEditing(true);
  }

  function saveEdit() {
    const t = parseFloat(editTarget);
    const s = parseFloat(editSaved);
    if (!editName.trim() || isNaN(t) || t <= 0 || isNaN(s) || s < 0) return;
    onUpdate(goal.id, { name: editName.trim(), target: toUsd(t), saved: toUsd(s) });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="card-lift relative bg-paper border border-brand-bright rounded-2xl p-5">
        <div className="flex flex-col gap-3">
          <Field label="Goal name">
            <input type="text" autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className={`${inputClassText} w-full`} />
          </Field>
          <div className="flex gap-3">
            <Field label="Target">
              <input type="number" step="1" value={editTarget} onChange={(e) => setEditTarget(e.target.value)} className={`${inputClass} w-full`} />
            </Field>
            <Field label="Saved so far">
              <input type="number" step="1" value={editSaved} onChange={(e) => setEditSaved(e.target.value)} className={`${inputClass} w-full`} />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex gap-2">
              <Button onClick={saveEdit} variant="primary">Save</Button>
              <Button onClick={() => setEditing(false)} variant="ghost">Cancel</Button>
            </div>
            {confirmingDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-ink-soft">Delete this goal?</span>
                <button onClick={() => onDelete(goal.id)} className="font-semibold text-red hover:underline">Yes, delete</button>
                <button onClick={() => setConfirmingDelete(false)} className="text-mute hover:text-ink">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1 text-xs text-mute hover:text-red transition-colors"
                title="Delete goal"
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`card-lift group relative bg-paper border rounded-2xl p-5 ${complete ? 'border-emerald' : 'border-line'}`}>
      <Confetti fire={celebrate} />
      <button
        onClick={startEdit}
        className="absolute top-4 right-4 text-mute hover:text-brand opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        title="Edit goal"
        aria-label={`Edit ${goal.name}`}
      >
        <Pencil size={14} />
      </button>
      <div className="flex justify-between mb-2.5 items-center pr-6">
        <div className="font-semibold text-[15.5px] flex items-center gap-1.5">
          {goal.name}
          {complete && <PartyPopper size={15} className="text-emerald" />}
        </div>
        <div className="font-num text-sm text-ink-soft">
          {format(goal.saved)} <span className="text-mute">of</span> {format(goal.target)}
        </div>
      </div>
      <div className="mb-4">
        <ProgressBar pct={pct} colorClass={complete ? 'gradient-money' : 'gradient-brand'} height="h-2.5" />
      </div>
      {complete ? (
        <div className="text-xs font-semibold text-emerald-deep bg-emerald-softer inline-block px-3 py-1.5 rounded-full">
          Goal reached — nice work 🎉
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="number"
            step="1"
            placeholder="Add amount"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className={`${inputClass} w-32`}
          />
          <Button onClick={submit} variant="primary">
            Add funds
          </Button>
        </div>
      )}
    </div>
  );
}

export function Goals({
  state,
  onAddGoal,
  onAddFunds,
  onUpdateGoal,
  onDeleteGoal,
}: {
  state: FullState;
  onAddGoal: (name: string, targetUsd: number) => void;
  onAddFunds: (id: string, amountUsd: number) => void;
  onUpdateGoal: (id: string, patch: { name?: string; target?: number; saved?: number }) => void;
  onDeleteGoal: (id: string) => void;
}) {
  const { toUsd, currency } = useCurrency();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');

  function submit() {
    const t = parseFloat(target);
    if (!name.trim() || isNaN(t)) return;
    onAddGoal(name.trim(), toUsd(t));
    setName('');
    setTarget('');
  }

  return (
    <>
      <div className="bg-paper border border-line rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-6">
        <Field label="Goal name">
          <input type="text" placeholder="e.g. New laptop" value={name} onChange={(e) => setName(e.target.value)} className={`${inputClassText} w-48`} />
        </Field>
        <Field label={`Target (${currency})`}>
          <input type="number" step="1" placeholder="0" value={target} onChange={(e) => setTarget(e.target.value)} className={`${inputClass} w-28`} />
        </Field>
        <Button onClick={submit} variant="primary">Create goal</Button>
      </div>

      {state.goals.length === 0 ? (
        <EmptyState>No goals yet — set your first one above.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3.5">
          {state.goals.map((g) => (
            <GoalCard key={g.id} goal={g} onAdd={onAddFunds} onUpdate={onUpdateGoal} onDelete={onDeleteGoal} />
          ))}
        </div>
      )}
    </>
  );
}
