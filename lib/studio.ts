import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { studioCharts } from '@/lib/db/schema';
import { sourceLabel } from '@/lib/source-label';
import { countryName } from '@/lib/country-codes';
import { PALETTES, type PaletteId } from '@/lib/entity-colors';
import type { StudioRendered } from '@/lib/report-pdf';

// ---------------------------------------------------------------------------
// Studio Graph: costruire un grafico scegliendo i campi.
//
// Radar ha due tipi di dato con forme diverse — le MENTION (righe con un testo
// e delle metriche) e le MISURE (serie chi/che cosa/quando/quanto). Qui
// vengono presentate come un unico catalogo di campi, divisi in DIMENSIONI
// (come tagliare) e MISURE (che cosa contare), così la scelta si fa nel
// linguaggio della domanda e non in quello delle tabelle.
//
// Nessun campo arriva dal client come frammento di SQL: si sceglie da un
// elenco chiuso, e il server traduce l'id in espressione. È l'unica difesa
// seria contro un'iniezione, e vale anche a proteggere l'utente da sé stesso.
// ---------------------------------------------------------------------------

export type StudioSource = 'mentions' | 'metrics';

export type ChartKind = 'line' | 'area' | 'bar' | 'hbar' | 'scatter' | 'bubble' | 'pie' | 'map';

export type Aggregation = 'count' | 'sum' | 'avg' | 'max' | 'min' | 'last';

export type Field = {
  id: string;
  label: string;
  /** dimension = come tagliare · measure = che cosa contare */
  role: 'dimension' | 'measure';
  /** Note per l'utente: cosa contiene, quando ha senso usarlo. */
  hint?: string;
  /** Quanti valori distinti: una dimensione con 3.000 valori non è leggibile. */
  distinct?: number;
};

export type StudioSpec = {
  source: StudioSource;
  chart: ChartKind;
  /** Asse X: la dimensione lungo cui si dispone il grafico. */
  x: string;
  /** Asse Y: la misura, con la sua aggregazione. */
  y: string;
  yAgg: Aggregation;
  /** Asse Z: una seconda dimensione (serie/colore) o una seconda misura (dimensione della bolla). */
  z?: string;
  zAgg?: Aggregation;
  days: number;
  limit: number;
  palette: string;
};

export type StudioResult = {
  /** Righe già pronte per il grafico: x, valore, e la serie di appartenenza. */
  rows: {
    x: string; y: number; z?: string; size?: number;
    /** Codice del paese (ISO alpha-2), quando l'asse X è geografico: è la
     *  chiave con cui la mappa trova il confine da colorare. */
    code?: string;
  }[];
  /** I nomi delle serie, nell'ordine in cui prendono i colori. */
  series: string[];
  xLabel: string;
  yLabel: string;
  zLabel?: string;
  total: number;
  /**
   * Le righe che l'asse X non sa collocare — su una mappa, le mention di cui
   * non si conosce il paese — e da dove vengono.
   *
   * Sparivano in silenzio. Ma il paese non è un dato che manca per sbaglio:
   * manca perché le piattaforme social non dicono da dove scrive chi pubblica.
   * Dirlo con i nomi delle fonti è l'unico modo perché una mappa quasi vuota
   * si capisca invece di sembrare rotta.
   */
  unplaced?: { n: number; sources: { source: string; n: number }[] };
  /** Avvertenze oneste sulla combinazione scelta. */
  warnings: string[];
};

// --- Il catalogo -----------------------------------------------------------

const MENTION_DIMENSIONS: Field[] = [
  { id: 'day', label: 'Día', role: 'dimension', hint: 'la fecha de publicación, día por día' },
  { id: 'week', label: 'Semana', role: 'dimension', hint: 'agrupa por semana: menos ruido que por día' },
  { id: 'month', label: 'Mes', role: 'dimension', hint: 'agrupa por mes: la vista de conjunto' },
  { id: 'hour', label: 'Hora del día', role: 'dimension', hint: 'de 0 a 23: cuándo se publica y cuándo funciona' },
  { id: 'weekday', label: 'Día de la semana', role: 'dimension', hint: 'lunes…domingo' },
  { id: 'source', label: 'Fuente', role: 'dimension', hint: 'la plataforma o el medio' },
  { id: 'author', label: 'Autor', role: 'dimension' },
  { id: 'community', label: 'Comunidad', role: 'dimension' },
  { id: 'language', label: 'Idioma', role: 'dimension' },
  { id: 'sentiment', label: 'Sentimiento', role: 'dimension', hint: 'positivo / neutro / negativo' },
  { id: 'emotion', label: 'Emoción', role: 'dimension' },
  { id: 'kind', label: 'Tipo', role: 'dimension', hint: 'artículo o post' },
  {
    id: 'country', label: 'País', role: 'dimension',
    hint: 'de dónde viene: declarado por la fuente o deducido del dominio nacional del enlace. El idioma NO es el país: el español se habla en Madrid y en Ciudad de México',
  },
];

const MENTION_MEASURES: Field[] = [
  { id: 'count', label: 'Número de contenidos', role: 'measure', hint: 'cuántas filas: la medida más sólida, siempre está' },
  { id: 'engagement_score', label: 'Engagement', role: 'measure', hint: 'likes + 2×comentarios + 3×compartidos + vistas/200' },
  { id: 'reach', label: 'Alcance', role: 'measure' },
  { id: 'likes', label: 'Likes', role: 'measure' },
  { id: 'comments', label: 'Comentarios', role: 'measure' },
  { id: 'shares', label: 'Compartidos', role: 'measure' },
  { id: 'views', label: 'Visualizaciones', role: 'measure' },
  { id: 'sentiment_score', label: 'Puntaje de sentimiento', role: 'measure', hint: 'de -1 a +1: se promedia, no se suma' },
];

const METRIC_DIMENSIONS: Field[] = [
  { id: 'day', label: 'Día', role: 'dimension' },
  { id: 'month', label: 'Mes', role: 'dimension' },
  { id: 'entity', label: 'Entidad', role: 'dimension', hint: 'quién: un canal, un directivo, una marca' },
  { id: 'metric', label: 'Métrica', role: 'dimension', hint: 'qué: seguidores, impresiones, engagement…' },
];

const METRIC_MEASURES: Field[] = [
  { id: 'value', label: 'Valor', role: 'measure', hint: 'el número de la medición' },
  { id: 'count', label: 'Número de mediciones', role: 'measure' },
];

/**
 * Il catalogo REALE del progetto: alle dimensioni fisse si aggiungono i campi
 * conservati dagli Excel (pillar, campagna, area semantica) e le dimensioni
 * delle misure. Offrire un campo che il progetto non ha significa costruire un
 * grafico vuoto e non capire perché.
 */
export async function studioFields(projectId: number, source: StudioSource): Promise<Field[]> {
  const db = await getDb();

  if (source === 'metrics') {
    const dims = await db.execute(sql`
      select distinct jsonb_object_keys(dims) as k from metric_points where project_id = ${projectId}
    `);
    const extra: Field[] = (dims.rows as { k: string }[])
      .filter((r) => r.k)
      .map((r) => ({ id: `dim:${r.k}`, label: r.k, role: 'dimension' as const, hint: 'dimensión de la hoja importada' }));
    return [...METRIC_DIMENSIONS, ...extra, ...METRIC_MEASURES];
  }

  const custom = await db.execute(sql`
    select distinct jsonb_object_keys(custom) as k from mentions
    where project_id = ${projectId} and custom is not null
  `);
  const extra: Field[] = (custom.rows as { k: string }[])
    .filter((r) => r.k)
    .map((r) => ({ id: `custom:${r.k}`, label: r.k, role: 'dimension' as const, hint: 'campo conservado del archivo importado' }));

  return [...MENTION_DIMENSIONS, ...extra, ...MENTION_MEASURES];
}

// --- Dalla scelta all'SQL --------------------------------------------------

/** L'espressione di una DIMENSIONE. Solo id noti: niente SQL dal client. */
function dimExpr(source: StudioSource, id: string) {
  if (id.startsWith('custom:')) return sql`custom ->> ${id.slice(7)}`;
  if (id.startsWith('dim:')) return sql`dims ->> ${id.slice(4)}`;
  const dateCol = source === 'mentions' ? sql`published_at` : sql`date`;
  switch (id) {
    case 'day': return sql`to_char(${dateCol}, 'YYYY-MM-DD')`;
    case 'week': return sql`to_char(date_trunc('week', ${dateCol}), 'YYYY-MM-DD')`;
    case 'month': return sql`to_char(date_trunc('month', ${dateCol}), 'YYYY-MM')`;
    case 'hour': return sql`lpad(extract(hour from ${dateCol})::text, 2, '0')`;
    case 'weekday': return sql`trim(to_char(${dateCol}, 'Day'))`;
    case 'source': return sql`source`;
    case 'author': return sql`author`;
    case 'community': return sql`community`;
    case 'language': return sql`language`;
    case 'sentiment': return sql`sentiment`;
    case 'emotion': return sql`emotion`;
    case 'kind': return sql`kind`;
    case 'country': return sql`country`;
    case 'entity': return sql`entity`;
    case 'metric': return sql`metric`;
    default: return null;
  }
}

/** L'espressione di una MISURA, già aggregata. */
function measureExpr(source: StudioSource, id: string, agg: Aggregation) {
  if (id === 'count') return sql`count(*)::float`;
  const col = source === 'metrics'
    ? (id === 'value' ? sql`value` : null)
    : id === 'engagement_score' ? sql`engagement_score`
      : id === 'reach' ? sql`reach::float`
        : id === 'sentiment_score' ? sql`sentiment_score`
          : ['likes', 'comments', 'shares', 'views'].includes(id)
            ? sql`(engagement ->> ${id})::float`
            : null;
  if (!col) return null;
  switch (agg) {
    case 'avg': return sql`avg(${col})`;
    case 'max': return sql`max(${col})`;
    case 'min': return sql`min(${col})`;
    case 'last': return sql`(array_agg(${col} order by ${source === 'mentions' ? sql`published_at` : sql`date`} desc))[1]`;
    default: return sql`sum(${col})`;
  }
}

// Le etichette dipendono dalla SORGENTE: `count` sui contenuti è "Numero di
// contenuti", sulle misure è "Numero di rilevazioni". Con una mappa sola la
// seconda schiacciava la prima, e il titolo del grafico contraddiceva il
// campo appena scelto.
const LABELS: Record<StudioSource, Map<string, string>> = {
  mentions: new Map([...MENTION_DIMENSIONS, ...MENTION_MEASURES].map((f) => [f.id, f.label])),
  metrics: new Map([...METRIC_DIMENSIONS, ...METRIC_MEASURES].map((f) => [f.id, f.label])),
};

export function fieldLabel(source: StudioSource, id: string): string {
  if (id.startsWith('custom:')) return id.slice(7);
  if (id.startsWith('dim:')) return id.slice(4);
  return LABELS[source].get(id) ?? id;
}

/**
 * Avvertenze oneste sulla combinazione scelta.
 *
 * Non si impedisce niente — a volte una scelta insolita è quella giusta — ma
 * non si lascia nemmeno costruire in silenzio un grafico che mente.
 */
export function specWarnings(spec: StudioSpec, result: { series: string[]; rows: unknown[] }): string[] {
  const w: string[] = [];
  const isRate = /(rate|%|perc|medi|avg|score|punteggio|puntaje|tasa)/i.test(fieldLabel(spec.source, spec.y));

  if (isRate && spec.yAgg === 'sum') {
    w.push(`"${fieldLabel(spec.source, spec.y)}" parece un promedio o una tasa: sumarlo da un número sin sentido. Mejor usa el promedio.`);
  }
  if (spec.chart === 'pie' && result.rows.length > 4) {
    w.push(`Una torta con ${result.rows.length} porciones se lee mal: comparar ángulos es difícil. Con barras horizontales se lee de un vistazo.`);
  }
  if ((spec.chart === 'line' || spec.chart === 'area') && !/(day|week|month|hour)/.test(spec.x)) {
    w.push(`La línea sugiere una continuidad que "${fieldLabel(spec.source, spec.x)}" no tiene: entre dos categorías no hay un recorrido. Con barras la comparación es correcta.`);
  }
  if (spec.chart === 'map' && spec.x !== 'country') {
    w.push(`Un mapa necesita el PAÍS en el eje X: con "${fieldLabel(spec.source, spec.x)}" no hay nada que colorear. Elige "País" u otra forma.`);
  }
  if (spec.chart === 'map' && /(medi|avg|rate|%)/i.test(fieldLabel(spec.source, spec.y)) && spec.yAgg === 'sum') {
    w.push('En un mapa, una tasa sumada oscurece los países con más filas, no los que están mejor.');
  }
  if (result.series.length > 8) {
    w.push(`${result.series.length} series: con más de ocho los colores ya no se distinguen. Las menores se agrupan en "Otros".`);
  }
  return w;
}

/** Esegue la specifica e restituisce righe pronte per il grafico. */
export async function runStudio(projectId: number, spec: StudioSpec): Promise<StudioResult> {
  const db = await getDb();
  const table = spec.source === 'mentions' ? sql`mentions` : sql`metric_points`;
  const dateCol = spec.source === 'mentions' ? sql`published_at` : sql`date`;

  const x = dimExpr(spec.source, spec.x);
  const y = measureExpr(spec.source, spec.y, spec.yAgg);
  if (!x || !y) throw new Error('Campos no válidos para esta fuente');

  // Z può essere una seconda dimensione (una serie per colore) oppure una
  // seconda misura (la dimensione della bolla): dipende dal tipo di grafico.
  const zIsSize = spec.chart === 'bubble';
  const z = spec.z ? (zIsSize
    ? measureExpr(spec.source, spec.z, spec.zAgg ?? 'sum')
    : dimExpr(spec.source, spec.z)) : null;

  const since = new Date(Date.now() - spec.days * 86400_000);
  const limit = Math.min(500, Math.max(1, spec.limit));

  // Il raggruppamento usa le POSIZIONI, non le espressioni: due parametri
  // distinti che portano lo stesso testo (`dims ->> $1` nella select e
  // `dims ->> $4` nel group by) per Postgres non sono la stessa cosa, e la
  // query fallisce con "column must appear in the GROUP BY clause".
  const rows = await db.execute(sql`
    select ${x} as x, ${y} as y ${z ? sql`, ${z} as z` : sql``}
    from ${table}
    where project_id = ${projectId} and ${dateCol} >= ${since.toISOString()}
      and ${x} is not null
    group by 1${z && !zIsSize ? sql`, 3` : sql``}
    order by ${/(day|week|month|hour)/.test(spec.x) ? sql`1 asc` : sql`2 desc`}
    limit ${limit}
  `);

  type Raw = { x: string; y: number; z?: string | number };
  const raw = (rows.rows as Raw[]).filter((r) => r.x !== null && r.y !== null);

  const out: StudioResult['rows'] = raw.map((r) => ({
    x: String(r.x),
    y: Number(r.y),
    ...(z && !zIsSize ? { z: r.z === null || r.z === undefined ? '—' : String(r.z) } : {}),
    ...(z && zIsSize ? { size: Number(r.z ?? 0) } : {}),
  }));

  const series = z && !zIsSize
    ? [...new Set(out.map((r) => r.z as string))]
    : [fieldLabel(spec.source, spec.y)];

  // Le fonti si mostrano con il loro nome leggibile, non con lo slug tecnico.
  if (spec.x === 'source') for (const r of out) r.x = sourceLabel(r.x);
  if (spec.z === 'source') for (const r of out) if (r.z) r.z = sourceLabel(r.z);

  // Il paese viaggia in due forme: il NOME per chi legge, il CODICE per la
  // mappa, che con "Italia" non saprebbe quale confine colorare.
  if (spec.x === 'country') {
    for (const r of out) { r.code = r.x.toLowerCase(); r.x = countryName(r.code); }
  }
  if (spec.z === 'country') for (const r of out) if (r.z) r.z = countryName(r.z.toLowerCase());

  const result: StudioResult = {
    rows: out,
    series: spec.z === 'source' ? [...new Set(out.map((r) => r.z as string))] : series,
    xLabel: fieldLabel(spec.source, spec.x),
    yLabel: fieldLabel(spec.source, spec.y),
    zLabel: spec.z ? fieldLabel(spec.source, spec.z) : undefined,
    total: out.reduce((s, r) => s + r.y, 0),
    warnings: [],
  };
  // Quante righe l'asse X non colloca: si conta solo dove la domanda ha senso
  // (il paese), perché è lì che il vuoto è un'informazione e non rumore.
  if (spec.x === 'country') {
    const miss = (await db.execute(sql`
      select source, count(*)::int as n from ${table}
      where project_id = ${projectId} and ${dateCol} >= ${since.toISOString()}
        and (country is null or country = '')
      group by 1 order by 2 desc limit 6
    `)).rows as { source: string; n: number }[];
    const n = miss.reduce((s2, r) => s2 + Number(r.n), 0);
    if (n) {
      result.unplaced = {
        n,
        sources: miss.map((r) => ({ source: sourceLabel(r.source), n: Number(r.n) })),
      };
    }
  }

  result.warnings = specWarnings(spec, result);
  return result;
}

// ---------------------------------------------------------------------------
// Studio Graph dentro il report.
//
// Il report salva l'ID del grafico, non i suoi numeri: rigenerato fra un mese
// risponde con i dati di quel mese, come ogni altra sezione. Qui i grafici
// citati da una scaletta vengono eseguiti tutti insieme, prima di disegnare.
// ---------------------------------------------------------------------------

/** Esegue i grafici di Studio Graph citati da una scaletta di report. */
export async function resolveStudioBlocks(
  projectId: number,
  ids: number[],
): Promise<Map<number, StudioRendered>> {
  const out = new Map<number, StudioRendered>();
  const unique = [...new Set(ids)].filter((n) => Number.isFinite(n) && n > 0);
  if (!unique.length) return out;

  const db = await getDb();
  const charts = await db.select().from(studioCharts)
    .where(and(eq(studioCharts.projectId, projectId), inArray(studioCharts.id, unique)));

  for (const chart of charts) {
    const spec = chart.spec as unknown as StudioSpec;
    try {
      const res = await runStudio(projectId, spec);
      const paletteId = (spec.palette in PALETTES ? spec.palette : 'categorical') as PaletteId;
      out.set(chart.id, {
        title: chart.title,
        xLabel: res.xLabel,
        yLabel: res.yLabel,
        zLabel: res.zLabel,
        days: spec.days,
        palette: PALETTES[paletteId].colors,
        rows: res.rows.map((r) => ({ x: r.x, y: r.y, z: r.z })),
      });
    } catch {
      // Un grafico rotto (un campo personalizzato sparito dopo una
      // reimportazione) non deve far fallire l'intero PDF: la pagina lo dirà.
    }
  }
  return out;
}

/**
 * Le cifre di un grafico di Studio Graph, in righe brevi.
 *
 * È l'unica cosa che il modello vede quando deve commentarlo: gli stessi
 * numeri che il lettore ha davanti, mai le righe originali. Vale qui la regola
 * di tutto il report — i numeri vengono dal database, il modello scrive solo
 * la prosa.
 */
export function studioFacts(chart: StudioRendered): string {
  if (!chart.rows.length) return '';
  const n = (v: number) => (Number.isInteger(v) ? v.toLocaleString('it-IT')
    : v.toLocaleString('it-IT', { maximumFractionDigits: 2 }));

  const total = chart.rows.reduce((s, r) => s + r.y, 0);
  const lines = [
    `grafico "${chart.title}": ${chart.yLabel} per ${chart.xLabel}${chart.zLabel ? `, diviso per ${chart.zLabel}` : ''}`,
    `periodo del grafico: ultimi ${chart.days} giorni`,
    `totale: ${n(total)} su ${chart.rows.length} valori`,
  ];

  const series = [...new Set(chart.rows.map((r) => r.z).filter(Boolean))] as string[];
  if (series.length > 1) {
    // Con più serie contano i pesi relativi, non le singole celle.
    for (const z of series.slice(0, 8)) {
      const sum = chart.rows.filter((r) => r.z === z).reduce((s, r) => s + r.y, 0);
      lines.push(`serie "${z}": ${n(sum)} (${Math.round((sum / (total || 1)) * 100)}% del totale)`);
    }
  }

  // Le prime voci per valore, più gli estremi: bastano a scrivere un commento
  // onesto senza spedire al modello duecento righe.
  const byValue = [...chart.rows].sort((a, b) => b.y - a.y);
  for (const r of byValue.slice(0, 12)) {
    lines.push(`${r.x}${r.z ? ` · ${r.z}` : ''}: ${n(r.y)}`);
  }
  if (byValue.length > 12) {
    const last = byValue[byValue.length - 1];
    lines.push(`valore più basso — ${last.x}${last.z ? ` · ${last.z}` : ''}: ${n(last.y)}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Il commento al grafico, e la sua scadenza.
//
// Un commento parla di numeri precisi. Se i numeri si muovono — perché è
// arrivata una raccolta, perché un file è stato reimportato, perché è passato
// un giorno e il periodo scorre — quel testo non diventa vecchio: diventa
// falso. Per questo insieme al commento si conserva l'IMPRONTA dei dati che
// descriveva, e alla prima esecuzione in cui l'impronta non torna il commento
// viene tolto, dicendo perché.
// ---------------------------------------------------------------------------

/** Impronta stabile dei numeri di un grafico. Cambia se cambia un valore. */
export function fingerprint(spec: StudioSpec, result: StudioResult): string {
  const body = [
    spec.source, spec.chart, spec.x, spec.y, spec.yAgg, spec.z ?? '', spec.zAgg ?? '',
    String(spec.days),
    ...result.rows.map((r) => `${r.x}|${r.z ?? ''}|${Math.round(r.y * 1000) / 1000}`),
  ].join('§');
  // djb2: non serve una funzione crittografica, serve che due insiemi di
  // numeri diversi diano stringhe diverse.
  let h = 5381;
  for (let i = 0; i < body.length; i++) h = ((h * 33) ^ body.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}-${result.rows.length}`;
}

export type ChartComment = {
  text: string;
  /** Quando è stato scritto. */
  at: string;
  /** I dati sono cambiati da allora: il commento non vale più. */
  stale: boolean;
};

/**
 * Il commento salvato di un grafico, se ancora valido.
 *
 * Quando non lo è lo cancella dall'archivio: lasciarlo lì "solo segnato come
 * scaduto" significa che prima o poi qualcuno lo legge.
 */
export async function chartComment(
  chartId: number, projectId: number, current: string,
): Promise<ChartComment | null> {
  const db = await getDb();
  const [row] = await db.select().from(studioCharts)
    .where(and(eq(studioCharts.id, chartId), eq(studioCharts.projectId, projectId)));
  if (!row?.comment || !row.commentAt) return null;

  if (row.commentFor !== current) {
    await db.update(studioCharts)
      .set({ comment: null, commentAt: null, commentFor: null })
      .where(eq(studioCharts.id, chartId));
    return { text: row.comment, at: row.commentAt.toISOString(), stale: true };
  }
  return { text: row.comment, at: row.commentAt.toISOString(), stale: false };
}

export async function saveChartComment(
  chartId: number, projectId: number, text: string, forData: string,
): Promise<string> {
  const db = await getDb();
  const at = new Date();
  // Testo vuoto significa "togli": si svuota tutto, non si lascia una data
  // senza un commento a cui appartenga.
  const empty = !text.trim();
  await db.update(studioCharts)
    .set(empty
      ? { comment: null, commentAt: null, commentFor: null }
      : { comment: text, commentAt: at, commentFor: forData })
    .where(and(eq(studioCharts.id, chartId), eq(studioCharts.projectId, projectId)));
  return at.toISOString();
}
