'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  ScatterChart, Scatter, PieChart, Pie, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, Legend, Cell,
} from 'recharts';
import {
  Loader2, Save, Trash2, AlertTriangle, LineChart as LineIcon, BarChart3,
  ScatterChart as ScatterIcon, PieChart as PieIcon, AreaChart as AreaIcon, Info, Plus, Globe,
  Sparkles, X,
} from 'lucide-react';
import { StudioMap } from '@/components/studio-map';
import { PALETTES, paletteColor, OVERFLOW_COLOR, type PaletteId } from '@/lib/entity-colors';

// ---------------------------------------------------------------------------
// Studio Graph.
//
// Un grafico si costruisce rispondendo a tre domande, non scegliendo tre
// colonne: lungo che cosa lo dispongo (X), che cosa conto (Y), come lo divido
// (Z). I campi vengono dal progetto vero — mention e misure importate insieme —
// così la stessa schermata serve un progetto di listening e uno nato da Excel.
//
// Radar non impedisce combinazioni insolite: a volte sono quelle giuste. Ma
// non lascia costruire in silenzio un grafico che mente, e lo dice in chiaro
// sotto al titolo: una media sommata, una torta con dodici fette, una linea
// fra categorie che non hanno un ordine.
// ---------------------------------------------------------------------------

type Field = { id: string; label: string; role: 'dimension' | 'measure'; hint?: string };
type Spec = {
  source: 'mentions' | 'metrics';
  chart: 'line' | 'area' | 'bar' | 'hbar' | 'scatter' | 'bubble' | 'pie' | 'map';
  x: string; y: string; yAgg: string;
  z?: string; zAgg?: string;
  days: number; limit: number; palette: PaletteId;
};
type Result = {
  rows: { x: string; y: number; z?: string; size?: number; code?: string }[];
  series: string[]; xLabel: string; yLabel: string; zLabel?: string;
  total: number;
  unplaced?: { n: number; sources: { source: string; n: number }[] };
  warnings: string[];
};
type Saved = { id: number; title: string; spec: Spec };

const CHARTS: { id: Spec['chart']; label: string; icon: typeof LineIcon; when: string }[] = [
  { id: 'line', label: 'Línea', icon: LineIcon, when: 'una evolución en el tiempo' },
  { id: 'area', label: 'Área', icon: AreaIcon, when: 'una evolución en la que también importa el volumen' },
  { id: 'bar', label: 'Barras', icon: BarChart3, when: 'comparar categorías o periodos' },
  { id: 'hbar', label: 'Barras horizontales', icon: BarChart3, when: 'un ranking con nombres largos' },
  { id: 'scatter', label: 'Dispersión', icon: ScatterIcon, when: 'la relación entre dos métricas' },
  { id: 'bubble', label: 'Burbujas', icon: ScatterIcon, when: 'dos métricas más una tercera en el tamaño' },
  { id: 'pie', label: 'Torta', icon: PieIcon, when: 'cuánto pesa cada elemento, si son pocos' },
  { id: 'map', label: 'Mapa', icon: Globe, when: 'dónde: el color indica una métrica; el eje Z, el desglose país por país' },
];

const AGGS: { id: string; label: string; hint: string }[] = [
  { id: 'sum', label: 'Suma', hint: 'el total: adecuado para conteos y volúmenes' },
  { id: 'avg', label: 'Promedio', hint: 'obligatorio para tasas, puntajes y promedios: sumarlos no significa nada' },
  { id: 'count', label: 'Conteo', hint: 'cuántas filas, sin importar el valor' },
  { id: 'max', label: 'Máximo', hint: 'el valor más alto del grupo' },
  { id: 'min', label: 'Mínimo', hint: 'el valor más bajo del grupo' },
  { id: 'last', label: 'Último valor', hint: 'para totales acumulados como los seguidores' },
];

const DEFAULT: Spec = {
  source: 'mentions', chart: 'bar', x: 'source', y: 'count', yAgg: 'count',
  days: 90, limit: 30, palette: 'categorical',
};

const TOOLTIP = {
  backgroundColor: '#16203c', border: '1px solid #1e2a4a',
  borderRadius: 8, fontSize: 12, color: '#e2e8f0',
};
const GRID = '#1e2a4a';
const AXIS = '#7c8cab';
const MAX_SERIES = 8;

const fmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}k`;
  if (a > 0 && a < 1) return n.toFixed(2);
  return String(Math.round(n));
};

/**
 * La mappa senza paesi.
 *
 * "Nessun dato" sarebbe falso: i dati ci sono, è il PAESE che quelle fonti non
 * dicono. Un post su Bluesky o su Hacker News non porta con sé da dove scrive
 * chi lo ha scritto, e dedurlo dalla lingua sarebbe inventare. Qui si dice con
 * i nomi e con i numeri, così una mappa vuota si capisce invece di sembrare
 * rotta.
 */
function NoCountries({ unplaced, onRecovered }: {
  unplaced: { n: number; sources: { source: string; n: number }[] };
  onRecovered: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const recover = async () => {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/studio/countries', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error ?? 'No se pudo'); return; }
      if (d.recovered > 0) { onRecovered(); return; }
      setMsg('No hay países que obtener: en estas menciones no hay una dirección o un dominio que lo indique.');
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="px-6 py-10 text-center">
      <Globe className="mx-auto mb-3 size-7 text-slate-700" />
      <p className="mb-1 text-sm text-slate-300">
        De estas {unplaced.n.toLocaleString('es-CO')} menciones no se conoce el país.
      </p>
      <p className="mx-auto mb-3 max-w-md text-xs leading-relaxed text-slate-500">
        El país se conoce cuando la fuente lo declara (las noticias de GDELT) o cuando
        la dirección tiene un dominio nacional (<span className="text-slate-400">.co</span>,{' '}
        <span className="text-slate-400">.com.mx</span>). Las plataformas sociales no dicen desde dónde
        escribe quien publica, y deducirlo del idioma sería inventar: el español se habla en
        Madrid igual que en Ciudad de México.
      </p>
      <div className="mb-3 flex flex-col items-center gap-1.5">
        <button onClick={recover} disabled={busy}
          title="Revisa las menciones que ya están en el archivo y obtiene el país a partir del dominio del medio. No recolecta nada nuevo ni consume cuota de IA."
          className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
          Obtener los países de lo que ya tengo
        </button>
        <span className="text-[11px] text-slate-600">
          Solo lee el archivo: no recolecta nada nuevo ni consume cuota.
        </span>
        {msg && <span className="max-w-md text-[11px] text-amber-300/90">{msg}</span>}
      </div>
      <div className="mx-auto flex max-w-md flex-wrap justify-center gap-1.5">
        {unplaced.sources.map((s) => (
          <span key={s.source} className="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-slate-500">
            {s.source} <span className="text-slate-600">{s.n.toLocaleString('es-CO')}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Un campo scelto porta con sé la spiegazione di cosa succede se lo scegli. */
function Tip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Info className="size-3 cursor-help text-slate-600 hover:text-sky-300" />
      {open && (
        <span className="absolute left-4 top-0 z-50 w-72 rounded-lg border border-[var(--border)] bg-[#0c1226] px-3 py-2 text-[11px] leading-relaxed text-slate-300 shadow-2xl">
          {text}
        </span>
      )}
    </span>
  );
}

/** Da dove si parte quando si arriva chiedendo una mappa. */
const MAP_PRESET: Spec = {
  source: 'mentions', chart: 'map', x: 'country', y: 'count', yAgg: 'count',
  z: 'language', days: 90, limit: 200, palette: 'sequential',
};

export function StudioGraph({ initial, preset }: {
  initial?: { id: number; title: string; spec: Spec };
  preset?: 'map';
}) {
  const [spec, setSpec] = useState<Spec>(
    preset === 'map' ? MAP_PRESET : initial?.spec ?? DEFAULT,
  );
  const [title, setTitle] = useState(preset === 'map' ? '' : initial?.title ?? '');
  const [savedId, setSavedId] = useState<number | null>(preset === 'map' ? null : initial?.id ?? null);
  const [fields, setFields] = useState<Field[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [comment, setComment] = useState<{ text: string; at: string; stale: boolean } | null>(null);
  const [commenting, setCommenting] = useState(false);

  const dims = fields.filter((f) => f.role === 'dimension');
  const measures = fields.filter((f) => f.role === 'measure');
  const fieldOf = (id?: string) => fields.find((f) => f.id === id);

  const loadFields = useCallback(async () => {
    const res = await fetch(`/api/studio?source=${spec.source}`);
    const d = await res.json();
    if (res.ok) { setFields(d.fields ?? []); setSaved(d.saved ?? []); }
    else setError(d.error ?? 'Error');
  }, [spec.source]);

  useEffect(() => { loadFields(); }, [loadFields]);

  // Il grafico si ridisegna a ogni scelta: costruire alla cieca e premere
  // "aggiorna" alla fine è il modo più veloce per non capire cosa fa un campo.
  useEffect(() => {
    if (!spec.x || !spec.y) return;
    let alive = true;
    setBusy(true); setError('');
    fetch('/api/studio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!alive) return;
        if (!ok) { setResult(null); setComment(null); setError(d.error ?? 'Error'); return; }
        setResult(d);
        // Il commento salvato vale solo se descrive QUESTI numeri: l'impronta
        // la calcola il server, che è l'unico a poterla confrontare.
        if (savedId && d.fingerprint) {
          fetch(`/api/studio/comment?id=${savedId}&for=${encodeURIComponent(d.fingerprint)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((c) => alive && setComment(c?.comment ?? null))
            .catch(() => {});
        } else setComment(null);
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [spec]);

  const save = async () => {
    const res = await fetch('/api/studio', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      // Senza titolo si usa quello che il grafico dice già di sé: meglio
      // "Interazioni per canale" di "Grafico senza titolo".
      body: JSON.stringify({
        id: savedId,
        title: title.trim() || (result ? `${result.yLabel} por ${result.xLabel}` : 'Gráfico'),
        spec,
      }),
    });
    const d = await res.json();
    if (res.ok) { setSavedId(d.id); loadFields(); }
    else setError(d.error ?? 'No se pudo guardar');
  };

  const set = <K extends keyof Spec>(k: K, v: Spec[K]) => setSpec((s) => ({ ...s, [k]: v }));

  /** Chiede il commento all'AI. Vive attaccato al grafico salvato. */
  const askComment = async () => {
    if (!savedId) { setError('Primero guarda el gráfico: el comentario queda asociado a él.'); return; }
    setCommenting(true); setError('');
    try {
      const res = await fetch('/api/studio/comment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: savedId, spec, title }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'No se pudo generar el comentario'); return; }
      setComment(d.comment);
    } catch (e) { setError((e as Error).message); }
    finally { setCommenting(false); }
  };

  const dropComment = async () => {
    if (!savedId) return;
    await fetch(`/api/studio/comment?id=${savedId}`, { method: 'DELETE' });
    setComment(null);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      {/* ---- Le scelte ---- */}
      <section className="panel h-fit px-5 py-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">De dónde</p>
        <div className="mb-4 flex gap-1.5">
          {(['mentions', 'metrics'] as const).map((s) => (
            <button key={s} onClick={() => setSpec({ ...DEFAULT, source: s, x: s === 'metrics' ? 'month' : 'source', y: s === 'metrics' ? 'value' : 'count', yAgg: s === 'metrics' ? 'sum' : 'count' })}
              title={s === 'mentions'
                ? 'Los contenidos: publicaciones, artículos, filas con texto — del listening o de archivos importados'
                : 'Las métricas: series de números en el tiempo importadas de hojas de cálculo'}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${spec.source === s
                ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
                : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>
              {s === 'mentions' ? 'Contenidos' : 'Métricas'}
            </button>
          ))}
        </div>

        <Axis label="Eje X" sub="a lo largo de qué lo ordeno"
          value={spec.x} onChange={(v) => set('x', v)} options={dims} field={fieldOf(spec.x)} />

        <div className="mt-3">
          <Axis label="Eje Y" sub="qué cuento"
            value={spec.y} onChange={(v) => {
              const f = fields.find((x) => x.id === v);
              // Un tasso o una media si media: la scelta giusta si propone da sola.
              const isRate = /(rate|%|perc|medi|avg|score|punteggio)/i.test(f?.label ?? '');
              setSpec((s) => ({ ...s, y: v, yAgg: v === 'count' ? 'count' : isRate ? 'avg' : 'sum' }));
            }} options={measures} field={fieldOf(spec.y)} />
          {spec.y !== 'count' && (
            <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              como
              <select value={spec.yAgg} onChange={(e) => set('yAgg', e.target.value)}
                className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1.5 py-0.5 text-slate-300">
                {AGGS.filter((a) => a.id !== 'count').map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              <Tip text={AGGS.find((a) => a.id === spec.yAgg)?.hint ?? ''} />
            </label>
          )}
        </div>

        <div className="mt-3">
          <Axis label="Eje Z" sub={spec.chart === 'bubble' ? 'el tamaño de la burbuja' : 'cómo lo divido en series'}
            value={spec.z ?? ''} onChange={(v) => set('z', v || undefined)}
            options={spec.chart === 'bubble' ? measures : dims} allowEmpty
            field={fieldOf(spec.z)} />
        </div>

        <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Qué forma</p>
        <div className="grid grid-cols-2 gap-1.5">
          {CHARTS.map((c) => {
            const Icon = c.icon;
            return (
              <button key={c.id} onClick={() => set('chart', c.id)} title={`Úsalo para: ${c.when}`}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] ${spec.chart === c.id
                  ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
                  : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>
                <Icon className="size-3.5 shrink-0" /> {c.label}
              </button>
            );
          })}
        </div>

        <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Color</p>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(PALETTES) as PaletteId[]).map((p) => (
            <button key={p} onClick={() => set('palette', p)} title={PALETTES[p].use}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${spec.palette === p
                ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
                : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>
              <span className="flex shrink-0 gap-0.5">
                {PALETTES[p].colors.slice(0, 6).map((c) => (
                  <span key={c} className="size-2.5 rounded-sm" style={{ backgroundColor: c }} />
                ))}
              </span>
              {PALETTES[p].label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-600">{PALETTES[spec.palette].use}</p>

        <div className="mt-5 flex items-center gap-2 text-[11px] text-slate-500">
          periodo
          <select value={spec.days} onChange={(e) => set('days', Number(e.target.value))}
            className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1.5 py-0.5 text-slate-300">
            {[7, 30, 90, 180, 365, 1095].map((d) => (
              <option key={d} value={d}>{d >= 365 ? `${Math.round(d / 365)} años` : `${d} días`}</option>
            ))}
          </select>
          max
          <select value={spec.limit} onChange={(e) => set('limit', Number(e.target.value))}
            className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1.5 py-0.5 text-slate-300">
            {[10, 20, 30, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </section>

      {/* ---- Il grafico ---- */}
      <section className="flex flex-col gap-3">
        <div className="panel px-5 py-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={result ? `${result.yLabel} por ${result.xLabel}` : 'Título del gráfico'}
              className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-1.5 text-sm text-slate-100" />
            {busy && <Loader2 className="size-4 animate-spin text-sky-400" />}
            <button onClick={save} disabled={!result}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40">
              <Save className="size-3.5" /> {savedId ? 'Actualizar' : 'Guardar'}
            </button>
          </div>

          {error && <p className="mb-2 text-xs text-amber-300">{error}</p>}

          {result?.warnings.map((w) => (
            <p key={w} className="mb-1.5 flex items-start gap-1.5 text-[11px] text-amber-300/90">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}
            </p>
          ))}

          {result && result.rows.length > 0
            ? <Chart spec={spec} result={result} />
            : !busy && (
              spec.chart === 'map' && result?.unplaced?.n
                ? <NoCountries unplaced={result.unplaced} onRecovered={() => setSpec({ ...spec })} />
                : <p className="py-10 text-center text-xs text-slate-600">
                  No hay datos con estas opciones en el periodo seleccionado.
                </p>
            )}

          {result && result.rows.length > 0 && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-white/[0.02] px-4 py-3">
              {comment && !comment.stale ? (
                <>
                  <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-violet-300">
                    <Sparkles className="size-3" /> Comentario · IA
                    <span className="font-normal normal-case tracking-normal text-slate-600">
                      escrito el {new Date(comment.at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    <button onClick={dropComment} title="Quitar el comentario"
                      className="ml-auto text-slate-600 hover:text-red-300"><X className="size-3.5" /></button>
                  </p>
                  <p className="text-sm leading-relaxed text-slate-300">{comment.text}</p>
                  <p className="mt-1.5 text-[10px] text-slate-600">
                    Desaparece solo en cuanto cambian los números: un comentario que describe datos que ya no existen no es viejo, es falso.
                  </p>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={askComment} disabled={commenting || !savedId}
                    title={savedId ? 'Pídele a la IA que escriba qué dice este gráfico' : 'Primero guarda el gráfico'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-40">
                    {commenting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    {comment?.stale ? 'Reescribir el comentario' : 'Comentar con IA'}
                  </button>
                  <span className="text-[11px] text-slate-600">
                    {comment?.stale
                      ? `Los datos cambiaron desde el ${new Date(comment.at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}: se quitó el comentario.`
                      : savedId
                        ? 'La IA solo lee las cifras de este gráfico, nunca las filas.'
                        : 'Guarda el gráfico y podrás pedir un comentario.'}
                  </span>
                </div>
              )}
            </div>
          )}

          {result && result.rows.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-600">
              {result.rows.length} valores · total {fmt(result.total)} · {result.xLabel} × {result.yLabel}
              {result.zLabel ? ` × ${result.zLabel}` : ''}
            </p>
          )}
        </div>

        {saved.length > 0 && (
          <div className="panel px-5 py-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Gráficos guardados <span className="normal-case tracking-normal text-slate-600">— los encuentras en el reporte personalizado</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {saved.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px]">
                  <button onClick={() => { setSpec(s.spec); setTitle(s.title); setSavedId(s.id); }}
                    className="text-slate-300 hover:text-sky-300">{s.title}</button>
                  <button onClick={async () => {
                    await fetch(`/api/studio?id=${s.id}`, { method: 'DELETE' });
                    if (savedId === s.id) setSavedId(null);
                    loadFields();
                  }} className="text-slate-600 hover:text-red-300"><Trash2 className="size-3" /></button>
                </span>
              ))}
              <button onClick={() => { setSpec(DEFAULT); setTitle(''); setSavedId(null); }}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[var(--border)] px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300">
                <Plus className="size-3" /> nuevo
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Axis({ label, sub, value, onChange, options, allowEmpty, field }: {
  label: string; sub: string; value: string; onChange: (v: string) => void;
  options: Field[]; allowEmpty?: boolean; field?: Field;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs text-slate-300">
        {label}
        {field?.hint && <Tip text={field.hint} />}
        <span className="text-slate-600">· {sub}</span>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100">
        {allowEmpty && <option value="">— ninguno —</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Il disegno vero. Una forma per tipo, tutte con la stessa grammatica. */
function Chart({ spec, result }: { spec: Spec; result: Result }) {
  const { rows, series } = result;

  // Oltre otto serie non si inventano colori: le minori diventano "Altro".
  const kept = useMemo(() => series.slice(0, MAX_SERIES - (series.length > MAX_SERIES ? 1 : 0)), [series]);
  const colorOf = (name: string) => {
    const i = kept.indexOf(name);
    return i < 0 ? OVERFLOW_COLOR : paletteColor(spec.palette, i, Math.max(1, kept.length));
  };

  // Da righe lunghe a righe larghe: una colonna per serie, com'è comodo a recharts.
  const data: Record<string, string | number | undefined>[] = useMemo(() => {
    if (!result.zLabel || spec.chart === 'bubble') {
      return rows.map((r) => ({ x: r.x, [result.yLabel]: r.y, size: r.size }));
    }
    const byX = new Map<string, Record<string, string | number>>();
    for (const r of rows) {
      if (!byX.has(r.x)) byX.set(r.x, { x: r.x });
      const name = kept.includes(r.z ?? '') ? (r.z as string) : 'Otros';
      const row = byX.get(r.x)!;
      row[name] = ((row[name] as number) ?? 0) + r.y;
    }
    return [...byX.values()];
  }, [rows, kept, result.zLabel, result.yLabel, spec.chart]);

  const names = result.zLabel && spec.chart !== 'bubble'
    ? [...kept, ...(series.length > kept.length ? ['Otros'] : [])]
    : [result.yLabel];

  const axes = (
    <>
      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="x" stroke={AXIS} fontSize={11} tickLine={false}
        interval="preserveStartEnd" minTickGap={20} />
      <YAxis tickFormatter={fmt} stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} width={52} />
      <Tooltip contentStyle={TOOLTIP} formatter={(v) => [Number(v).toLocaleString('es-CO'), '']} />
      {names.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />}
    </>
  );

  const H = 340;

  if (spec.chart === 'map') {
    // Il sentiment ha due versi attorno allo zero: la mappa lo colora a due
    // poli, tutto il resto con un'intensità sola.
    const diverging = /sentiment|punteggio/i.test(result.yLabel) && spec.yAgg !== 'count';
    return (
      <StudioMap
        rows={rows} yLabel={result.yLabel} zLabel={result.zLabel}
        palette={spec.palette} diverging={diverging} unplaced={result.unplaced?.n}
      />
    );
  }

  if (spec.chart === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={H}>
        <PieChart>
          <Tooltip contentStyle={TOOLTIP} formatter={(v) => [Number(v).toLocaleString('es-CO'), '']} />
          <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
          <Pie data={rows} dataKey="y" nameKey="x" innerRadius="45%" outerRadius="75%" paddingAngle={2}>
            {rows.map((r, i) => (
              <Cell key={r.x} fill={paletteColor(spec.palette, i, rows.length)} stroke="#0f172a" strokeWidth={2} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (spec.chart === 'scatter' || spec.chart === 'bubble') {
    return (
      <ResponsiveContainer width="100%" height={H}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="x" name={result.xLabel} stroke={AXIS} fontSize={11} tickLine={false} />
          <YAxis dataKey={result.yLabel} name={result.yLabel} tickFormatter={fmt}
            stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} width={52} />
          {spec.chart === 'bubble' && <ZAxis dataKey="size" range={[40, 500]} name={result.zLabel} />}
          <Tooltip contentStyle={TOOLTIP} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill={paletteColor(spec.palette, 0, 1)} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (spec.chart === 'hbar') {
    return (
      <ResponsiveContainer width="100%" height={Math.max(H, data.length * 26)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={fmt} stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="x" width={150} stroke={AXIS} fontSize={11}
            tickLine={false} axisLine={false} interval={0} />
          <Tooltip contentStyle={TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            formatter={(v) => [Number(v).toLocaleString('es-CO'), '']} />
          {names.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />}
          {names.map((n) => (
            <Bar key={n} dataKey={n} stackId={names.length > 1 ? 'a' : undefined}
              radius={[0, 4, 4, 0]} barSize={14}>
              {names.length === 1 && data.map((r, i) => (
                <Cell key={String(r.x)} fill={paletteColor(spec.palette, i, data.length)} />
              ))}
              {names.length > 1 && <Cell fill={colorOf(n)} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (spec.chart === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={H}>
        <BarChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          {axes}
          {names.map((n) => (
            <Bar key={n} dataKey={n} stackId={names.length > 1 ? 'a' : undefined}
              fill={colorOf(n)} radius={[4, 4, 0, 0]} maxBarSize={40}>
              {names.length === 1 && data.map((r, i) => (
                <Cell key={String(r.x)} fill={paletteColor(spec.palette, i, data.length)} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (spec.chart === 'area') {
    return (
      <ResponsiveContainer width="100%" height={H}>
        <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          {axes}
          {names.map((n) => (
            <Area key={n} type="monotone" dataKey={n} stackId="a"
              stroke={colorOf(n)} fill={colorOf(n)} fillOpacity={0.25} strokeWidth={2} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={H}>
      <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
        {axes}
        {names.map((n) => (
          <Line key={n} type="monotone" dataKey={n} connectNulls
            stroke={colorOf(n)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
