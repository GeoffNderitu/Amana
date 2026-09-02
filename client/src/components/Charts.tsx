import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area, ReferenceLine } from 'recharts';
import type { Category, Transaction, NetWorthSnapshot } from '../lib/api';
import { fmtDate } from '../lib/format';
import type { ForecastPoint } from '../lib/forecast';

const SLICE_COLORS = ['#8b5cf6', '#0ea975', '#f2724a', '#6d28d9', '#d69e18', '#06b6d4', '#e5484d', '#c4b5fd'];

export function CategoryDonut({ categories, format }: { categories: Category[]; format: (n: number) => string }) {
  const data = categories.filter((c) => c.spent > 0).map((c) => ({ name: c.name, value: c.spent }));

  if (data.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-sm text-mute border border-dashed border-line rounded-xl">
        No spending logged yet
      </div>
    );
  }

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => format(Number(value))}
            contentStyle={{ background: '#ffffff', border: '1px solid #e3ddf7', borderRadius: 12, fontSize: 12.5, fontFamily: 'Inter, sans-serif', boxShadow: '0 8px 24px -8px rgba(76,29,149,0.25)' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryLegend({ categories, format }: { categories: Category[]; format: (n: number) => string }) {
  const data = categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  if (data.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-3">
      {data.map((c, i) => (
        <div key={c.id} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
            <span className="text-ink-soft">{c.name}</span>
          </div>
          <span className="font-num text-ink">{format(c.spent)}</span>
        </div>
      ))}
    </div>
  );
}

export function SpendingTrend({ transactions, format }: { transactions: Transaction[]; format: (n: number) => string }) {
  const byDate = new Map<string, number>();
  transactions.forEach((t) => {
    byDate.set(t.date, (byDate.get(t.date) || 0) + t.amount);
  });
  const data = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, amount]) => ({ date, amount, label: fmtDate(date) }));

  if (data.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-sm text-mute border border-dashed border-line rounded-xl">
        No transactions yet
      </div>
    );
  }

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e3ddf7" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8e87ac', fontFamily: 'IBM Plex Mono, monospace' }} axisLine={{ stroke: '#e3ddf7' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#8e87ac', fontFamily: 'IBM Plex Mono, monospace' }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => format(v)} />
          <Tooltip
            formatter={(value) => format(Number(value))}
            contentStyle={{ background: '#ffffff', border: '1px solid #e3ddf7', borderRadius: 12, fontSize: 12.5, fontFamily: 'Inter, sans-serif', boxShadow: '0 8px 24px -8px rgba(76,29,149,0.25)' }}
          />
          <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NetWorthTrend({ snapshots, format }: { snapshots: NetWorthSnapshot[]; format: (n: number) => string }) {
  const data = snapshots.map((s) => ({ ...s, label: fmtDate(s.date) }));

  if (data.length < 2) {
    return (
      <div className="h-[220px] flex items-center justify-center text-sm text-mute border border-dashed border-line rounded-xl text-center px-6">
        Net worth history builds up day by day — check back after adding a few account updates.
      </div>
    );
  }

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e3ddf7" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8e87ac', fontFamily: 'IBM Plex Mono, monospace' }} axisLine={{ stroke: '#e3ddf7' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#8e87ac', fontFamily: 'IBM Plex Mono, monospace' }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => format(v)} />
          <Tooltip
            formatter={(value) => format(Number(value))}
            contentStyle={{ background: '#ffffff', border: '1px solid #e3ddf7', borderRadius: 12, fontSize: 12.5, fontFamily: 'Inter, sans-serif', boxShadow: '0 8px 24px -8px rgba(76,29,149,0.25)' }}
          />
          <Line type="monotone" dataKey="netWorth" stroke="#6d28d9" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashFlowChart({ points, format }: { points: ForecastPoint[]; format: (n: number) => string }) {
  if (points.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-mute border border-dashed border-line rounded-xl">
        Not enough data to forecast yet
      </div>
    );
  }
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="cashFlowFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea975" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#0ea975" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e3ddf7" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#8e87ac', fontFamily: 'IBM Plex Mono, monospace' }}
            axisLine={{ stroke: '#e3ddf7' }}
            tickLine={false}
            interval={Math.max(0, Math.floor(points.length / 6) - 1)}
          />
          <YAxis tick={{ fontSize: 11, fill: '#8e87ac', fontFamily: 'IBM Plex Mono, monospace' }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => format(v)} />
          <ReferenceLine y={0} stroke="#e5484d" strokeDasharray="3 3" />
          <Tooltip
            formatter={(value, name) => [format(Number(value)), name === 'projected' ? 'Projected balance' : name]}
            labelFormatter={(label) => label}
            contentStyle={{ background: '#ffffff', border: '1px solid #e3ddf7', borderRadius: 12, fontSize: 12.5, fontFamily: 'Inter, sans-serif', boxShadow: '0 8px 24px -8px rgba(76,29,149,0.25)' }}
          />
          <Area type="monotone" dataKey="projected" stroke="#0ea975" strokeWidth={2.5} fill="url(#cashFlowFill)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
