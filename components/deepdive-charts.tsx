'use client';

import {
  Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

// Grafici del deep-dive per fonte: confrontano il canale con il totale del
// progetto sugli STESSI dati (il canale è sempre un sottoinsieme del totale).

type VolRow = { day: string; total: number; src: number };

export function SourceVolumeCompare({ data, color, label }: {
  data: VolRow[]; color: string; label: string;
}) {
  if (!data.length) return <p className="py-8 text-center text-sm text-slate-600">Sin datos en los últimos 14 días.</p>;
  const rows = data.map((r) => ({ ...r, dayShort: r.day.slice(5).split('-').reverse().join('/') }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
        <XAxis dataKey="dayShort" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as VolRow & { dayShort: string };
            const pct = p.total > 0 ? Math.round((p.src / p.total) * 100) : 0;
            return (
              <div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
                <p className="font-semibold text-slate-200">{p.dayShort}</p>
                <p style={{ color }}>{label}: {p.src} menciones</p>
                <p className="text-slate-400">todo el proyecto: {p.total} menciones</p>
                <p className="mt-0.5 text-slate-500">participación de {label} en el día: {pct}%</p>
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="total" name="todo el proyecto" fill="rgba(148,163,184,0.12)"
          stroke="rgba(148,163,184,0.45)" strokeWidth={1.5} />
        <Bar dataKey="src" name={label} fill={color} radius={[3, 3, 0, 0]} maxBarSize={22} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const SENT_COLORS = { positive: '#34d399', neutral: '#64748b', negative: '#f87171' } as const;
const SENT_LABELS = { positive: 'positivo', neutral: 'neutral', negative: 'negativo' } as const;

export function SentimentCompareBars({ src, all, label }: {
  src: { positive: number; neutral: number; negative: number };
  all: { positive: number; neutral: number; negative: number };
  label: string;
}) {
  const rows = [
    { name: label, d: src },
    { name: 'todo el proyecto', d: all },
  ];
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const tot = r.d.positive + r.d.neutral + r.d.negative;
        return (
          <div key={r.name}>
            <p className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-slate-300">{r.name}</span>
              <span className="text-slate-600">{tot} menciones analizadas</span>
            </p>
            {tot === 0 ? (
              <div className="h-4 rounded bg-white/5" />
            ) : (
              <div className="flex h-4 overflow-hidden rounded" title={
                `positivo ${Math.round((r.d.positive / tot) * 100)}% · neutral ${Math.round((r.d.neutral / tot) * 100)}% · negativo ${Math.round((r.d.negative / tot) * 100)}%`
              }>
                {(['positive', 'neutral', 'negative'] as const).map((s) => (
                  r.d[s] > 0 && (
                    <div key={s} style={{ width: `${(r.d[s] / tot) * 100}%`, background: SENT_COLORS[s] }}
                      title={`${SENT_LABELS[s]}: ${r.d[s]} (${Math.round((r.d[s] / tot) * 100)}%)`} />
                  )
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-slate-600">
        <span className="text-emerald-400">■</span> positivo ·{' '}
        <span className="text-slate-400">■</span> neutral ·{' '}
        <span className="text-red-400">■</span> negativo: participación de las menciones analizadas por la IA en los últimos 7 días.
      </p>
    </div>
  );
}
