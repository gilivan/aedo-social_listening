'use client';

import {
  ResponsiveContainer, ComposedChart, LineChart, ScatterChart, Scatter, Cell,
  Line, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import type { SeasonPoint, AnatomyPoint, ScatterPoint } from '@/lib/sport';

const TOOLTIP = { backgroundColor: '#16203c', border: '1px solid #1e2a4a', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

const C = {
  win: '#34d399', draw: '#94a3b8', loss: '#f87171',
  form: '#38bdf8', sentiment: '#a78bfa', stock: '#fbbf24',
  grid: '#1e2a4a', axis: '#7c8cab',
};
const RESULT_COLOR: Record<'W' | 'D' | 'L', string> = { W: C.win, D: C.draw, L: C.loss };

const RESULT_STYLE: Record<'W' | 'D' | 'L', string> = {
  W: 'bg-emerald-500/20 text-emerald-300',
  D: 'bg-slate-500/20 text-slate-300',
  L: 'bg-red-500/20 text-red-300',
};
const RESULT_LABEL: Record<'W' | 'D' | 'L', string> = { W: 'Victoria', D: 'Empate', L: 'Derrota' };

export function ResultBadge({ result }: { result: 'W' | 'D' | 'L' }) {
  return (
    <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${RESULT_STYLE[result]}`}
      title={RESULT_LABEL[result]}>
      {result}
    </span>
  );
}

/** Barra bidirezionale centrata sullo zero: verde a destra (positivo), rosso a
 *  sinistra (negativo). Usata sia per la variazione di sentiment sia per quella
 *  del titolo, così le due si leggono con lo stesso linguaggio visivo. */
export function ShiftBar({ value, max, suffix = '' }: { value: number | null; max: number; suffix?: string }) {
  if (value === null) return <span className="text-xs text-slate-600">—</span>;
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  const positive = value >= 0;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-white/5">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
        <div
          className={`absolute inset-y-0 ${positive ? 'left-1/2 rounded-r-full bg-emerald-400/80' : 'right-1/2 rounded-l-full bg-red-400/80'}`}
          style={{ width: `${pct / 2}%` }}
        />
      </div>
      <span className={`w-14 shrink-0 text-xs tabular-nums ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
        {positive ? '+' : ''}{value}{suffix}
      </span>
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="size-2 rounded-full" style={{ background: i.color }} />{i.label}
        </span>
      ))}
    </div>
  );
}

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', timeZone: 'UTC' });

/**
 * La stagione su un solo asse: punti in classifica, umore dei tifosi e titolo
 * in borsa. Tre grandezze incomparabili fra loro (punti, -1..1, euro) quindi
 * tre assi verticali nascosti: quello che conta è se le curve si muovono
 * INSIEME, non il valore assoluto di ciascuna. I pallini sulla linea della
 * forma sono le partite, colorati per risultato.
 */
export function SeasonTimeline({ data, hasStock }: { data: SeasonPoint[]; hasStock: boolean }) {
  if (data.length < 2) return <p className="py-6 text-center text-xs text-slate-600">Aún no hay suficiente historial — se completa a medida que se juegan partidos.</p>;
  const hasSentiment = data.some((d) => d.sentiment !== null);
  const byDate = new Map(data.map((d) => [d.date, d]));

  return (
    <div className="flex flex-col gap-2">
      <Legend items={[
        { color: C.form, label: 'puntos (forma en la liga)' },
        ...(hasSentiment ? [{ color: C.sentiment, label: 'sentimiento de hinchas (prom. 7 días)' }] : []),
        ...(hasStock ? [{ color: C.stock, label: 'precio de la acción (indexado)' }] : []),
      ]} />
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -24 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={44}
            tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} />
          <YAxis yAxisId="form" hide domain={['dataMin', 'dataMax']} />
          <YAxis yAxisId="sent" hide domain={[-1, 1]} />
          <YAxis yAxisId="stock" hide domain={['dataMin - 2', 'dataMax + 2']} />
          <Tooltip
            cursor={{ stroke: '#334155' }}
            content={({ payload, label, active }) => {
              if (!active) return null;
              // Il datum si cerca per data invece di leggerlo dal payload:
              // quando in un giorno tutte e tre le serie sono nulle recharts
              // consegna un payload vuoto e il riquadro non comparirebbe.
              const p = (payload?.[0]?.payload as SeasonPoint | undefined) ?? byDate.get(String(label));
              if (!p) return null;
              return (
                <div style={TOOLTIP} className="px-3 py-2">
                  <p className="mb-1 font-semibold text-slate-100">{shortDate(p.date)}</p>
                  {p.match && (
                    <p className="mb-1 flex items-center gap-1.5" style={{ color: RESULT_COLOR[p.match.result] }}>
                      <span className="font-bold">{p.match.result}</span> {p.match.label}
                    </p>
                  )}
                  {p.form !== null && <p style={{ color: C.form }}>{p.form} puntos</p>}
                  {p.sentiment !== null && <p style={{ color: C.sentiment }}>sentimiento {p.sentiment > 0 ? '+' : ''}{p.sentiment}</p>}
                  {p.stockIndex !== null && <p style={{ color: C.stock }}>acción {p.stockIndex} (100 = inicio)</p>}
                </div>
              );
            }} />
          {hasStock && (
            <Line yAxisId="stock" type="monotone" dataKey="stockIndex" stroke={C.stock} strokeWidth={1.6}
              strokeOpacity={0.75} dot={false} connectNulls isAnimationActive={false} />
          )}
          {hasSentiment && (
            <Line yAxisId="sent" type="monotone" dataKey="sentiment" stroke={C.sentiment} strokeWidth={1.8}
              dot={false} connectNulls isAnimationActive={false} />
          )}
          <Line yAxisId="form" type="stepAfter" dataKey="form" stroke={C.form} strokeWidth={2.2}
            connectNulls isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; payload?: SeasonPoint; index?: number }) => {
              const { cx, cy, payload, index } = props;
              if (!payload?.match || cx === undefined || cy === undefined) {
                return <g key={`empty-${index}`} />;
              }
              return (
                <circle key={`m-${payload.date}`} cx={cx} cy={cy} r={3.6}
                  fill={RESULT_COLOR[payload.match.result]} stroke="#0b1020" strokeWidth={1} />
              );
            }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Anatomia della partita: quanto si muove l'umore nei giorni PRIMA e DOPO,
 * rispetto al livello della settimana precedente (linea zero). Non risponde a
 * "quanto sono contenti" ma a "quanto dura l'euforia, e quanto lo sconforto".
 */
export function AnatomyCurve({ data }: { data: AnatomyPoint[] }) {
  const hasWin = data.some((d) => d.win !== null);
  const hasLoss = data.some((d) => d.loss !== null);
  if (!hasWin && !hasLoss) return <p className="py-6 text-center text-xs text-slate-600">Se necesitan menciones analizadas alrededor de los días de partido para trazar la curva.</p>;

  return (
    <div className="flex flex-col gap-2">
      <Legend items={[
        ...(hasWin ? [{ color: C.win, label: 'tras una victoria' }] : []),
        ...(hasLoss ? [{ color: C.loss, label: 'tras una derrota' }] : []),
      ]} />
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="offset" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false}
            tickFormatter={(o: number) => (o === 0 ? 'partido' : o > 0 ? `+${o}` : String(o))} />
          <YAxis tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} width={46}
            tickFormatter={(v: number) => (v > 0 ? `+${v}` : String(v))} />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
          <ReferenceLine x={0} stroke="#475569" strokeDasharray="3 3" />
          <Tooltip
            cursor={{ stroke: '#334155' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as AnatomyPoint | undefined;
              if (!p) return null;
              const day = p.offset === 0 ? 'día de partido' : p.offset > 0 ? `${p.offset} día${p.offset === 1 ? '' : 's'} después` : `${-p.offset} día${p.offset === -1 ? '' : 's'} antes`;
              return (
                <div style={TOOLTIP} className="px-3 py-2">
                  <p className="mb-1 font-semibold text-slate-100">{day}</p>
                  {p.win !== null && <p style={{ color: C.win }}>victoria: {p.win > 0 ? '+' : ''}{p.win} <span className="text-slate-500">({p.nWin} partido{p.nWin === 1 ? '' : 's'})</span></p>}
                  {p.loss !== null && <p style={{ color: C.loss }}>derrota: {p.loss > 0 ? '+' : ''}{p.loss} <span className="text-slate-500">({p.nLoss} partido{p.nLoss === 1 ? '' : 's'})</span></p>}
                </div>
              );
            }} />
          {hasWin && <Line type="monotone" dataKey="win" stroke={C.win} strokeWidth={2.2} dot={{ r: 2.5, fill: C.win, strokeWidth: 0 }} connectNulls isAnimationActive={false} />}
          {hasLoss && <Line type="monotone" dataKey="loss" stroke={C.loss} strokeWidth={2.2} dot={{ r: 2.5, fill: C.loss, strokeWidth: 0 }} connectNulls isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Ogni partita è un punto: a destra le vittorie larghe, a sinistra le sconfitte
 * pesanti; in alto l'umore migliorato, in basso peggiorato. Se i punti salgono
 * da sinistra a destra, il campo muove davvero la conversazione.
 */
export function MarginScatter({ data }: { data: ScatterPoint[] }) {
  if (data.length < 3) return <p className="py-6 text-center text-xs text-slate-600">Se necesitan al menos 3 partidos analizados para graficar esto.</p>;
  const maxAbs = Math.max(2, ...data.map((d) => Math.abs(d.goalDiff)));

  return (
    <ResponsiveContainer width="100%" height={230}>
      <ScatterChart margin={{ top: 8, right: 14, bottom: 18, left: 0 }}>
        <CartesianGrid stroke={C.grid} />
        <XAxis type="number" dataKey="goalDiff" domain={[-maxAbs - 0.5, maxAbs + 0.5]}
          tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} allowDecimals={false}
          tickFormatter={(v: number) => (v > 0 ? `+${v}` : String(v))}
          label={{ value: 'diferencia de gol', position: 'insideBottom', offset: -12, fill: C.axis, fontSize: 11 }} />
        <YAxis type="number" dataKey="sentimentShift" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} width={46}
          tickFormatter={(v: number) => (v > 0 ? `+${v}` : String(v))} />
        <ZAxis range={[70, 70]} />
        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
        <ReferenceLine x={0} stroke="#475569" strokeDasharray="3 3" />
        <Tooltip
          cursor={{ strokeDasharray: '3 3', stroke: '#334155' }}
          content={({ payload }) => {
            const p = payload?.[0]?.payload as ScatterPoint | undefined;
            if (!p) return null;
            return (
              <div style={TOOLTIP} className="px-3 py-2">
                <p className="font-semibold text-slate-100">{p.label}</p>
                <p className="text-slate-500">{shortDate(p.date)}</p>
                <p style={{ color: RESULT_COLOR[p.result] }}>
                  sentimiento {p.sentimentShift > 0 ? '+' : ''}{p.sentimentShift}
                </p>
              </div>
            );
          }} />
        <Scatter data={data} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.id} fill={RESULT_COLOR[d.result]} fillOpacity={0.85} />)}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/**
 * La correlazione da sola non dice nulla se non si sa su quante partite è
 * calcolata: il numero di campioni sta accanto al valore, non in una nota.
 */
export function CorrelationTile({ correlation }: { correlation: { r: number; n: number } | null }) {
  if (!correlation) {
    return (
      <div className="rounded-lg bg-white/[0.03] px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-600">cancha → ánimo</p>
        <p className="mt-1 text-sm text-slate-500">aún no hay suficientes partidos</p>
      </div>
    );
  }
  const { r, n } = correlation;
  const abs = Math.abs(r);
  const strength = abs >= 0.6 ? 'fuerte' : abs >= 0.3 ? 'moderada' : 'débil';
  const dir = r > 0 ? 'positiva' : 'negativa';
  const color = abs < 0.3 ? 'text-slate-400' : r > 0 ? 'text-emerald-300' : 'text-red-300';
  return (
    <div className="rounded-lg bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-600">cancha → ánimo</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{r > 0 ? '+' : ''}{r.toFixed(2)}</p>
      <p className="text-[11px] text-slate-500">
        {strength} {dir} · {n} partido{n === 1 ? '' : 's'}
        {n < 8 && <span className="text-amber-500/80"> · muy pocos para confiar</span>}
      </p>
    </div>
  );
}
