import { and, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { benchmarkEntities, mentions, projects } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// I KPI standard del social listening, con le formule scritte.
//
// Radar aveva molti numeri e nessun glossario: il sentiment medio su una scala
// -1..+1, un punteggio di engagement pesato, la quota di voce solo in grafico.
// Chi porta un report in riunione deve poter dire COME è calcolato ogni
// numero, e confrontarlo con quello che gli arriva da Talkwalker o da
// un'agenzia. Qui le formule sono quelle del glossario di settore (NSS, SOV,
// SOE, ER sulla reach…), calcolate dal database e mai dal modello.
//
// Tre regole di onestà, che contano quanto le formule:
//
//   UN DATO CHE MANCA SI CHIAMA "n.d." E DICE PERCHÉ. Le fonti gratuite non
//   danno quasi mai la reach, gli articoli non hanno like: un engagement rate
//   calcolato su un denominatore mezzo vuoto è un numero plausibile e falso.
//   Quando un KPI si calcola solo su una parte delle menzioni, lo dice.
//
//   LA REACH È POTENZIALE, IL SENTIMENT È AUTOMATICO. Lo dice l'etichetta,
//   non una nota a piè di pagina.
//
//   UN CAMPIONE PICCOLO SI SEGNALA. Sotto le cento menzioni una percentuale
//   si muove di cinque punti per tre post.
// ---------------------------------------------------------------------------

export type Lang = 'it' | 'en';
const L = (lang: Lang, it: string, en: string) => (lang === 'it' ? it : en);

/** Sotto questa base una percentuale va letta con cautela. */
export const SMALL_SAMPLE = 100;

export type KpiUnit = 'count' | 'pct' | 'ratio' | 'points' | 'index' | 'perDay';

export type Kpi = {
  id: KpiId;
  label: string;
  /** null = non disponibile: `note` dice perché. */
  value: number | null;
  previous: number | null;
  delta: number | null;
  /** Variazione percentuale; per i KPI già in percentuale si usa `delta` in punti. */
  deltaPct: number | null;
  unit: KpiUnit;
  /** Valore letto dai dati, o ricavato con una formula. */
  kind: 'absolute' | 'calculated';
  formula?: string;
  note?: string;
  /** Su quante menzioni poggia il valore. */
  base: number;
  smallSample: boolean;
};

export type KpiId =
  | 'mentions' | 'perDay' | 'authors' | 'reach' | 'engagement' | 'likes' | 'comments' | 'shares'
  | 'engPerMention' | 'erReach' | 'amplification' | 'conversation'
  | 'positive' | 'neutral' | 'negative' | 'nss' | 'authorConcentration' | 'peakIndex';

// --- Formule pure ------------------------------------------------------------
// Separate dal database perché sono la parte che deve restare giusta, ed è
// l'unica che si può verificare con un test senza dati veri.

/** Rapporto, o null quando il denominatore non c'è: mai uno zero inventato. */
export function ratio(num: number | null, den: number | null, scale = 1): number | null {
  if (num === null || den === null || !Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return (num / den) * scale;
}

/** Net Sentiment Score = (Positive − Negative) / (Positive + Negative) × 100. */
export function nss(positive: number, negative: number): number | null {
  return ratio(positive - negative, positive + negative, 100);
}

/** Δ e Δ%: la percentuale non esiste se il periodo di confronto era zero. */
export function delta(cur: number | null, prev: number | null): { abs: number | null; pct: number | null } {
  if (cur === null || prev === null) return { abs: null, pct: null };
  return { abs: cur - prev, pct: prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100 };
}

export function meanSd(values: number[]): { mean: number; sd: number } {
  if (!values.length) return { mean: 0, sd: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) };
}

/**
 * I giorni oltre μ + kσ del periodo.
 *
 * Con σ = 0 (un periodo piatto) non c'è anomalia per definizione: un giorno
 * uguale agli altri non è un picco, e dividere per zero lo farebbe sembrare.
 */
export function anomalies<T extends { value: number }>(days: T[], k = 2): (T & { z: number })[] {
  const { mean, sd } = meanSd(days.map((d) => d.value));
  if (sd === 0) return [];
  return days
    .map((d) => ({ ...d, z: (d.value - mean) / sd }))
    .filter((d) => d.z > k);
}

/** Quota delle menzioni prodotte dai primi dieci autori. */
export function concentration(topCounts: number[], total: number): number | null {
  return ratio(topCounts.slice(0, 10).reduce((s, n) => s + n, 0), total, 100);
}

// --- Periodi ----------------------------------------------------------------

export type Period = { from: Date; to: Date; days: number };

/** Gli ultimi N giorni e gli N giorni prima: il confronto di pari durata. */
export function periodsFor(days: number, now = new Date()): { current: Period; previous: Period } {
  const to = now;
  const from = new Date(to.getTime() - days * 86400_000);
  const pFrom = new Date(from.getTime() - days * 86400_000);
  return {
    current: { from, to, days },
    previous: { from: pFrom, to: from, days },
  };
}

/** Quanto a lungo restano in archivio le menzioni raccolte (lib/pipeline.ts). */
export const RETENTION_DAYS = 90;

// --- Le interrogazioni -------------------------------------------------------

type Agg = {
  n: number; authors: number; withAuthor: number;
  withReach: number; reach: number;
  withEng: number; likes: number; comments: number; shares: number;
  bothN: number; engBoth: number; reachBoth: number;
  positive: number; negative: number; neutral: number; withSentiment: number;
};

const EMPTY: Agg = {
  n: 0, authors: 0, withAuthor: 0, withReach: 0, reach: 0, withEng: 0, likes: 0, comments: 0, shares: 0,
  bothN: 0, engBoth: 0, reachBoth: 0, positive: 0, negative: 0, neutral: 0, withSentiment: 0,
};

// Engagement STANDARD: like + commenti + condivisioni. Non è l'engagement
// score dell'app, che pesa i commenti due volte e le condivisioni tre: quello
// serve a ordinare i contenuti, questo a confrontarsi con altri strumenti.
const ENG = sql`(coalesce((${mentions.engagement}->>'likes')::float8, 0)
  + coalesce((${mentions.engagement}->>'comments')::float8, 0)
  + coalesce((${mentions.engagement}->>'shares')::float8, 0))`;
const HAS_ENG = sql`(${mentions.engagement} is not null and (
  ${mentions.engagement} ? 'likes' or ${mentions.engagement} ? 'comments' or ${mentions.engagement} ? 'shares'))`;
const AUTHOR = sql`coalesce(nullif(trim(${mentions.authorHandle}), ''), nullif(trim(${mentions.author}), ''))`;
const POS = sql`lower(${mentions.sentiment}) in ('positive', 'positivo')`;
const NEG = sql`lower(${mentions.sentiment}) in ('negative', 'negativo')`;
const NEU = sql`lower(${mentions.sentiment}) in ('neutral', 'neutro')`;

function aggColumns() {
  return {
    n: sql<number>`count(*)`,
    authors: sql<number>`count(distinct ${AUTHOR})`,
    withAuthor: sql<number>`count(${AUTHOR})`,
    withReach: sql<number>`count(*) filter (where ${mentions.reach} > 0)`,
    reach: sql<number>`coalesce(sum(${mentions.reach}) filter (where ${mentions.reach} > 0), 0)`,
    withEng: sql<number>`count(*) filter (where ${HAS_ENG})`,
    likes: sql<number>`coalesce(sum((${mentions.engagement}->>'likes')::float8), 0)`,
    comments: sql<number>`coalesce(sum((${mentions.engagement}->>'comments')::float8), 0)`,
    shares: sql<number>`coalesce(sum((${mentions.engagement}->>'shares')::float8), 0)`,
    bothN: sql<number>`count(*) filter (where ${HAS_ENG} and ${mentions.reach} > 0)`,
    engBoth: sql<number>`coalesce(sum(${ENG}) filter (where ${HAS_ENG} and ${mentions.reach} > 0), 0)`,
    reachBoth: sql<number>`coalesce(sum(${mentions.reach}) filter (where ${HAS_ENG} and ${mentions.reach} > 0), 0)`,
    positive: sql<number>`count(*) filter (where ${POS})`,
    negative: sql<number>`count(*) filter (where ${NEG})`,
    neutral: sql<number>`count(*) filter (where ${NEU})`,
    withSentiment: sql<number>`count(*) filter (where ${POS} or ${NEG} or ${NEU})`,
  };
}

const toAgg = (r: Record<string, unknown> | undefined): Agg => {
  if (!r) return { ...EMPTY };
  const out = { ...EMPTY };
  for (const k of Object.keys(EMPTY) as (keyof Agg)[]) out[k] = Number(r[k] ?? 0);
  return out;
};

const inPeriod = (projectId: number, p: Period, extra?: SQL) => and(
  eq(mentions.projectId, projectId),
  gte(mentions.publishedAt, p.from),
  lt(mentions.publishedAt, p.to),
  ...(extra ? [extra] : []),
);

async function aggregate(projectId: number, p: Period, extra?: SQL): Promise<Agg> {
  const db = await getDb();
  const [row] = await db.select(aggColumns()).from(mentions).where(inPeriod(projectId, p, extra));
  return toAgg(row);
}

async function aggregateBySource(projectId: number, p: Period): Promise<Map<string, Agg>> {
  const db = await getDb();
  const rows = await db.select({ source: mentions.source, ...aggColumns() })
    .from(mentions).where(inPeriod(projectId, p)).groupBy(mentions.source);
  return new Map(rows.map((r) => [r.source, toAgg(r)]));
}

/** Menzioni per giorno, con i giorni a zero: senza, media e σ mentono. */
async function dailyCounts(projectId: number, p: Period): Promise<{ day: string; value: number }[]> {
  const db = await getDb();
  const res = await db.execute(sql`
    with giorni as (
      select generate_series(
        (${p.from.toISOString()}::timestamptz at time zone 'America/Bogota')::date,
        ((${p.to.toISOString()}::timestamptz - interval '1 millisecond') at time zone 'America/Bogota')::date,
        interval '1 day')::date as day
    ), conti as (
      select (published_at at time zone 'America/Bogota')::date as day, count(*) as n
      from mentions
      where project_id = ${projectId}
        and published_at >= ${p.from.toISOString()}::timestamptz
        and published_at < ${p.to.toISOString()}::timestamptz
      group by 1
    )
    select to_char(g.day, 'YYYY-MM-DD') as day, coalesce(c.n, 0)::int as n
    from giorni g left join conti c on c.day = g.day
    order by g.day`);
  return (res.rows as { day: string; n: number }[]).map((r) => ({ day: r.day, value: Number(r.n) }));
}

async function topAuthors(projectId: number, p: Period): Promise<{ author: string; n: number }[]> {
  const db = await getDb();
  const rows = await db.select({ author: sql<string>`${AUTHOR}`, n: sql<number>`count(*)` })
    .from(mentions)
    .where(and(inPeriod(projectId, p), sql`${AUTHOR} is not null`))
    .groupBy(sql`1`).orderBy(sql`2 desc`).limit(10);
  return rows.map((r) => ({ author: r.author, n: Number(r.n) }));
}

// --- Il quadro --------------------------------------------------------------

export type ChannelRow = {
  source: string;
  mentions: number; previousMentions: number;
  share: number | null; reach: number | null;
  engagement: number | null; engPerMention: number | null; erReach: number | null;
  nss: number | null; deltaMentionsPct: number | null;
  smallSample: boolean;
};

export type CompetitiveRow = {
  name: string; isOwnBrand: boolean;
  mentions: number; sov: number | null; sovPrev: number | null; sovDeltaPoints: number | null;
  engagement: number; soe: number | null;
  positive: number; spv: number | null;
  nss: number | null;
  /** Menzioni positive + negative: la base del NSS. */
  sentimentBase: number;
};

/** Sotto questa base il NSS di un'entità non si mostra: tre post fanno ±100. */
export const MIN_NSS_BASE = 10;

export type StandardKpis = {
  lang: Lang;
  current: Period; previous: Period;
  kpis: Kpi[];
  channels: ChannelRow[];
  daily: { day: string; value: number }[];
  peaks: { day: string; value: number; index: number | null }[];
  anomalies: { day: string; value: number; z: number }[];
  topAuthors: { author: string; n: number }[];
  competitive: CompetitiveRow[];
  /** Note sul perimetro: menzioni contate per più entità, confronto incompleto… */
  notes: string[];
  /** Il confronto cade in parte oltre la conservazione dei dati raccolti. */
  previousIncomplete: boolean;
  /** Le aggregazioni grezze, per l'analisi di affidabilità. */
  raw: { cur: Agg; prev: Agg };
};

function kpi(
  id: KpiId, label: string, value: number | null, previous: number | null,
  o: { unit: KpiUnit; kind?: Kpi['kind']; formula?: string; note?: string; base: number; pctAsPoints?: boolean },
): Kpi {
  const d = delta(value, previous);
  return {
    id, label, value, previous,
    delta: d.abs,
    // Le percentuali si confrontano in punti: "da 20% a 25%" è +5 punti, e
    // scriverlo come +25% confonde chiunque legga in fretta.
    deltaPct: o.pctAsPoints ? null : d.pct,
    unit: o.unit, kind: o.kind ?? 'calculated',
    formula: o.formula, note: o.note, base: o.base,
    smallSample: o.base < SMALL_SAMPLE,
  };
}

/** "calcolato sul 34% delle menzioni", o niente se la copertura è piena. */
function coverage(lang: Lang, part: number, total: number): string | undefined {
  if (!total || part >= total) return undefined;
  const pct = Math.round((part / total) * 100);
  return L(lang, `calcolato sul ${pct}% delle menzioni (${part} su ${total}): le altre non riportano il dato`,
    `calculado sobre el ${pct}% de las menciones (${part} de ${total}): las demás no reportan el dato`);
}

export async function standardKpis(
  projectId: number, days = 30, lang: Lang = 'en', now = new Date(),
): Promise<StandardKpis> {
  const { current, previous } = periodsFor(days, now);
  const db = await getDb();

  const [cur, prev, curBySource, prevBySource, daily, dailyPrev, authors, [project], entities] = await Promise.all([
    aggregate(projectId, current),
    aggregate(projectId, previous),
    aggregateBySource(projectId, current),
    aggregateBySource(projectId, previous),
    dailyCounts(projectId, current),
    dailyCounts(projectId, previous),
    topAuthors(projectId, current),
    db.select({ mode: projects.mode }).from(projects).where(eq(projects.id, projectId)),
    db.select().from(benchmarkEntities).where(eq(benchmarkEntities.projectId, projectId)),
  ]);

  const notes: string[] = [];
  // Le menzioni raccolte da Radar restano novanta giorni: un confronto che
  // comincia prima non è più piccolo, è incompleto. I file importati invece
  // restano tutti (lib/pipeline.ts), quindi lì il confronto regge.
  const retentionCut = new Date(now.getTime() - RETENTION_DAYS * 86400_000);
  const previousIncomplete = project?.mode !== 'upload' && previous.from < retentionCut;
  if (previousIncomplete) {
    notes.push(L(lang,
      `Il periodo di confronto comincia oltre i ${RETENTION_DAYS} giorni di conservazione delle menzioni raccolte: i suoi valori sono incompleti e le variazioni non vanno comunicate.`,
      `El periodo de comparación empieza antes de los ${RETENTION_DAYS} días de conservación de las menciones recopiladas: sus valores están incompletos y las variaciones no deben comunicarse.`));
  }

  const nd = (why: string) => L(lang, `n.d. — ${why}`, `n/d — ${why}`);
  const noReach = L(lang, 'nessuna menzione del periodo riporta la reach', 'ninguna mención del periodo reporta alcance');
  const noEng = L(lang, 'nessuna menzione del periodo riporta like, commenti o condivisioni',
    'ninguna mención del periodo reporta likes, comentarios ni compartidos');
  const noSent = L(lang, 'il sentiment non è ancora stato calcolato', 'el sentimiento aún no se ha calculado');

  const engTot = (a: Agg) => (a.withEng ? a.likes + a.comments + a.shares : null);
  const reachTot = (a: Agg) => (a.withReach ? a.reach : null);
  const pctOf = (x: number, a: Agg) => (a.withSentiment ? (x / a.withSentiment) * 100 : null);

  // Indice di picco: il giorno più alto del periodo sulla media giornaliera
  // del confronto. Senza confronto non c'è indice: un picco su che cosa?
  const prevDailyAvg = dailyPrev.length ? dailyPrev.reduce((s, d) => s + d.value, 0) / dailyPrev.length : 0;
  const maxDay = daily.reduce((m, d) => (d.value > m.value ? d : m), { day: '', value: 0 });
  const peakIdx = previousIncomplete || maxDay.value === 0 ? null : ratio(maxDay.value, prevDailyAvg);

  const kpis: Kpi[] = [
    kpi('mentions', L(lang, 'Menzioni', 'Menciones'), cur.n, prev.n, {
      unit: 'count', kind: 'absolute', base: cur.n,
      formula: L(lang, 'contenuti che corrispondono al progetto nel periodo', 'contenidos que coinciden con el proyecto en el periodo'),
    }),
    kpi('perDay', L(lang, 'Velocità (menzioni/giorno)', 'Velocidad (menciones/día)'), cur.n / days, prev.n / days, {
      unit: 'perDay', base: cur.n, formula: L(lang, 'Menzioni / giorni del periodo', 'Menciones / días del periodo'),
    }),
    kpi('authors', L(lang, 'Autori unici', 'Autores únicos'), cur.withAuthor ? cur.authors : null, prev.withAuthor ? prev.authors : null, {
      unit: 'count', kind: 'absolute', base: cur.withAuthor,
      formula: L(lang, 'account distinti (handle, altrimenti nome)', 'cuentas distintas (handle o, si no, nombre)'),
      note: cur.withAuthor ? coverage(lang, cur.withAuthor, cur.n) : nd(L(lang, 'le fonti non riportano l’autore', 'las fuentes no reportan el autor')),
    }),
    kpi('reach', L(lang, 'Reach potenziale', 'Alcance potencial'), reachTot(cur), reachTot(prev), {
      unit: 'count', kind: 'absolute', base: cur.withReach,
      formula: L(lang, 'somma della reach stimata dalle fonti: è un pubblico potenziale, non persone raggiunte',
        'suma del alcance estimado por las fuentes: es una audiencia potencial, no personas alcanzadas'),
      note: cur.withReach ? coverage(lang, cur.withReach, cur.n) : nd(noReach),
    }),
    kpi('engagement', L(lang, 'Engagement totale', 'Engagement total'), engTot(cur), engTot(prev), {
      unit: 'count', kind: 'calculated', base: cur.withEng,
      formula: L(lang, 'like/reaction + commenti + condivisioni (salvataggi n.d.: nessuna fonte li riporta)',
        'likes/reacciones + comentarios + compartidos (guardados n/d: ninguna fuente los reporta)'),
      note: cur.withEng ? coverage(lang, cur.withEng, cur.n) : nd(noEng),
    }),
    kpi('likes', L(lang, '· like / reaction', '· likes / reacciones'), cur.withEng ? cur.likes : null, prev.withEng ? prev.likes : null, {
      unit: 'count', kind: 'absolute', base: cur.withEng,
    }),
    kpi('comments', L(lang, '· commenti', '· comentarios'), cur.withEng ? cur.comments : null, prev.withEng ? prev.comments : null, {
      unit: 'count', kind: 'absolute', base: cur.withEng,
    }),
    kpi('shares', L(lang, '· condivisioni', '· compartidos'), cur.withEng ? cur.shares : null, prev.withEng ? prev.shares : null, {
      unit: 'count', kind: 'absolute', base: cur.withEng,
    }),
    kpi('engPerMention', L(lang, 'Engagement medio per menzione', 'Engagement promedio por mención'),
      ratio(engTot(cur), cur.withEng), ratio(engTot(prev), prev.withEng), {
        unit: 'ratio', base: cur.withEng,
        // Scostamento dichiarato dalla formula di manuale (÷ tutte le menzioni):
        // un articolo di giornale non ha like, e contarlo abbasserebbe la media
        // di chi invece li ha.
        formula: L(lang, 'Engagement totale / menzioni che riportano l’engagement',
          'Engagement total / menciones que reportan engagement'),
        note: cur.withEng ? undefined : nd(noEng),
      }),
    kpi('erReach', L(lang, 'Engagement rate sulla reach', 'Engagement rate sobre el alcance'),
      ratio(cur.engBoth, cur.reachBoth, 100), ratio(prev.engBoth, prev.reachBoth, 100), {
        unit: 'pct', base: cur.bothN, pctAsPoints: true,
        formula: L(lang, 'Engagement / Reach potenziale × 100, sulle sole menzioni che riportano entrambi',
          'Engagement / Alcance potencial × 100, solo en menciones que reportan ambos'),
        note: cur.bothN ? coverage(lang, cur.bothN, cur.n)
          : nd(L(lang, 'nessuna menzione riporta insieme reach ed engagement', 'ninguna mención reporta alcance y engagement a la vez')),
      }),
    kpi('amplification', L(lang, 'Tasso di amplificazione', 'Tasa de amplificación'),
      ratio(cur.withEng ? cur.shares : null, cur.withEng), ratio(prev.withEng ? prev.shares : null, prev.withEng), {
        unit: 'ratio', base: cur.withEng,
        formula: L(lang, 'Condivisioni / menzioni che riportano l’engagement', 'Compartidos / menciones que reportan engagement'),
        note: cur.withEng ? undefined : nd(noEng),
      }),
    kpi('conversation', L(lang, 'Tasso di conversazione', 'Tasa de conversación'),
      ratio(cur.withEng ? cur.comments : null, cur.withEng), ratio(prev.withEng ? prev.comments : null, prev.withEng), {
        unit: 'ratio', base: cur.withEng,
        formula: L(lang, 'Commenti / menzioni che riportano l’engagement', 'Comentarios / menciones que reportan engagement'),
        note: cur.withEng ? undefined : nd(noEng),
      }),
    kpi('positive', L(lang, 'Positive (sentiment automatico)', 'Positivas (sentimiento automático)'), pctOf(cur.positive, cur), pctOf(prev.positive, prev), {
      unit: 'pct', base: cur.withSentiment, pctAsPoints: true,
      formula: L(lang, 'positive / menzioni con sentiment × 100', 'positivas / menciones con sentimiento × 100'),
      note: cur.withSentiment ? coverage(lang, cur.withSentiment, cur.n) : nd(noSent),
    }),
    kpi('neutral', L(lang, 'Neutre (sentiment automatico)', 'Neutras (sentimiento automático)'), pctOf(cur.neutral, cur), pctOf(prev.neutral, prev), {
      unit: 'pct', base: cur.withSentiment, pctAsPoints: true,
      note: cur.withSentiment ? undefined : nd(noSent),
    }),
    kpi('negative', L(lang, 'Negative (sentiment automatico)', 'Negativas (sentimiento automático)'), pctOf(cur.negative, cur), pctOf(prev.negative, prev), {
      unit: 'pct', base: cur.withSentiment, pctAsPoints: true,
      note: cur.withSentiment ? undefined : nd(noSent),
    }),
    kpi('nss', 'Net Sentiment Score (NSS)', nss(cur.positive, cur.negative), nss(prev.positive, prev.negative), {
      unit: 'points', base: cur.positive + cur.negative, pctAsPoints: true,
      formula: '(Positivas − Negativas) / (Positivas + Negativas) × 100',
      note: cur.positive + cur.negative ? undefined
        : nd(L(lang, 'nessuna menzione positiva o negativa nel periodo', 'ninguna mención positiva o negativa en el periodo')),
    }),
    kpi('authorConcentration', L(lang, 'Concentrazione autori (top 10)', 'Concentración de autores (top 10)'),
      cur.withAuthor ? concentration(authors.map((a) => a.n), cur.n) : null, null, {
        unit: 'pct', base: cur.n, pctAsPoints: true,
        formula: L(lang, 'menzioni dei primi 10 autori / menzioni × 100', 'menciones de los 10 primeros autores / menciones × 100'),
        note: cur.withAuthor ? undefined : nd(L(lang, 'le fonti non riportano l’autore', 'las fuentes no reportan el autor')),
      }),
    kpi('peakIndex', L(lang, 'Indice di picco', 'Índice de pico'), peakIdx, null, {
      unit: 'index', base: cur.n,
      formula: L(lang, 'menzioni del giorno più alto / media giornaliera del periodo di confronto',
        'menciones del día más alto / promedio diario del periodo de comparación'),
      note: peakIdx !== null ? (maxDay.day ? L(lang, `giorno di picco: ${maxDay.day}`, `día pico: ${maxDay.day}`) : undefined)
        : nd(previousIncomplete
          ? L(lang, 'periodo di confronto incompleto', 'periodo de comparación incompleto')
          : L(lang, 'nessuna menzione nel periodo di confronto', 'ninguna mención en el periodo de comparación')),
    }),
  ];

  // Le variazioni di un confronto incompleto non si mostrano: sarebbero una
  // crescita che è solo la memoria che finisce.
  if (previousIncomplete) {
    for (const k of kpis) { k.delta = null; k.deltaPct = null; }
  }

  // --- Per canale ---
  const channels: ChannelRow[] = [...curBySource.entries()]
    .map(([source, a]) => {
      const p = prevBySource.get(source);
      return {
        source,
        mentions: a.n,
        previousMentions: p?.n ?? 0,
        share: ratio(a.n, cur.n, 100),
        reach: reachTot(a),
        engagement: engTot(a),
        engPerMention: ratio(engTot(a), a.withEng),
        erReach: ratio(a.engBoth, a.reachBoth, 100),
        nss: nss(a.positive, a.negative),
        deltaMentionsPct: previousIncomplete ? null : delta(a.n, p?.n ?? 0).pct,
        smallSample: a.n < SMALL_SAMPLE,
      };
    })
    .sort((x, y) => y.mentions - x.mentions);

  // --- Picchi e anomalie ---
  const peaks = [...daily].sort((a, b) => b.value - a.value).slice(0, 3)
    .filter((d) => d.value > 0)
    .map((d) => ({ ...d, index: previousIncomplete ? null : ratio(d.value, prevDailyAvg) }));
  const anom = anomalies(daily).map((d) => ({ day: d.day, value: d.value, z: Math.round(d.z * 10) / 10 }));

  // --- Competitivo ---
  const competitive = await competitiveKpis(projectId, current, previous, entities, lang, notes);

  return {
    lang, current, previous, kpis, channels, daily, peaks, anomalies: anom,
    topAuthors: authors, competitive, notes, previousIncomplete,
    raw: { cur, prev },
  };
}

async function competitiveKpis(
  projectId: number, current: Period, previous: Period,
  entities: (typeof benchmarkEntities.$inferSelect)[], lang: Lang, notes: string[],
): Promise<CompetitiveRow[]> {
  const usable = entities.filter((e) => e.keywords.length > 0);
  if (usable.length < 2) return [];

  const match = (kw: string[]) => or(...kw.flatMap((k) => [
    ilike(mentions.content, `%${k}%`), ilike(mentions.title, `%${k}%`),
  ]))!;

  const rows = await Promise.all(usable.map(async (e) => {
    const [c, p] = await Promise.all([
      aggregate(projectId, current, match(e.keywords)),
      aggregate(projectId, previous, match(e.keywords)),
    ]);
    return { e, c, p };
  }));

  // Una menzione che nomina due brand conta per entrambi: è la definizione
  // usata dagli strumenti di settore, ma va detta, perché le quote allora
  // si riferiscono alle "citazioni", non ai contenuti.
  const union = await aggregate(projectId, current, or(...usable.map((e) => match(e.keywords))));
  const sumN = rows.reduce((s, r) => s + r.c.n, 0);
  if (sumN > union.n) {
    notes.push(L(lang,
      `${fmtNumber(sumN - union.n, 'it')} menzioni citano più di un’entità del set e contano per ciascuna: le quote (SOV, SOE) sono calcolate sulle citazioni.`,
      `${fmtNumber(sumN - union.n, 'en')} menciones nombran más de una entidad del set y cuentan para cada una: las cuotas (SOV, SOE) se calculan sobre las citas.`));
  }

  const thin = rows.filter((r) => r.c.positive + r.c.negative < MIN_NSS_BASE).map((r) => r.e.name);
  if (thin.length) {
    notes.push(L(lang,
      `NSS non mostrato per ${thin.join(', ')}: meno di ${MIN_NSS_BASE} menzioni positive o negative.`,
      `NSS no mostrado para ${thin.join(', ')}: menos de ${MIN_NSS_BASE} menciones positivas o negativas.`));
  }
  const small = rows.filter((r) => {
    const b = r.c.positive + r.c.negative;
    return b >= MIN_NSS_BASE && b < SMALL_SAMPLE;
  });
  if (small.length) {
    notes.push(L(lang,
      `NSS su campione limitato (meno di ${SMALL_SAMPLE} menzioni con sentiment): ${small.map((r) => `${r.e.name} ${r.c.positive + r.c.negative}`).join(', ')}.`,
      `NSS sobre una muestra limitada (menos de ${SMALL_SAMPLE} menciones con sentimiento): ${small.map((r) => `${r.e.name} ${r.c.positive + r.c.negative}`).join(', ')}.`));
  }

  const totN = sumN;
  const totPrev = rows.reduce((s, r) => s + r.p.n, 0);
  const eng = (a: Agg) => a.likes + a.comments + a.shares;
  const totEng = rows.reduce((s, r) => s + eng(r.c), 0);
  const totPos = rows.reduce((s, r) => s + r.c.positive, 0);

  return rows.map(({ e, c, p }) => {
    const sov = ratio(c.n, totN, 100);
    const sovPrev = ratio(p.n, totPrev, 100);
    return {
      name: e.name, isOwnBrand: e.isOwnBrand === 1,
      mentions: c.n,
      sov, sovPrev,
      sovDeltaPoints: sov !== null && sovPrev !== null ? sov - sovPrev : null,
      engagement: eng(c),
      soe: ratio(eng(c), totEng, 100),
      positive: c.positive,
      spv: ratio(c.positive, totPos, 100),
      nss: c.positive + c.negative >= MIN_NSS_BASE ? nss(c.positive, c.negative) : null,
      sentimentBase: c.positive + c.negative,
    };
  }).sort((a, b) => b.mentions - a.mentions);
}

// --- Formattazione ------------------------------------------------------------

/**
 * Un numero nel formato della lingua, con il separatore delle migliaia SEMPRE.
 *
 * L'italiano standard (CLDR) non raggruppa i numeri a quattro cifre: scrive
 * "1234,5". In una tabella accanto a "12.345" si legge male, e le linee guida
 * dei report chiedono "1.234,5".
 */
export function fmtNumber(v: number, lang: Lang, digits = 0): string {
  return v.toLocaleString(lang === 'it' ? 'it-IT' : 'es-CO', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
    useGrouping: 'always',
  } as Intl.NumberFormatOptions);
}

/** Numeri all'italiana (1.234,5) o all'inglese, con le cifre giuste per unità. */
export function formatKpi(v: number | null, unit: KpiUnit, lang: Lang): string {
  if (v === null || !Number.isFinite(v)) return lang === 'it' ? 'n.d.' : 'n/d';
  const f = (digits: number) => fmtNumber(v, lang, digits);
  switch (unit) {
    case 'count': return f(0);
    case 'pct': return `${f(1)}%`;
    case 'points': return f(1);
    case 'ratio': return f(2);
    case 'index': return `×${f(1)}`;
    case 'perDay': return f(1);
  }
}

/** Δ nel formato giusto: punti per le percentuali, valore per il resto. */
export function formatDelta(k: Pick<Kpi, 'delta' | 'unit'>, lang: Lang): string {
  if (k.delta === null) return '—';
  const sign = k.delta > 0 ? '+' : k.delta < 0 ? '−' : '±';
  const abs = Math.abs(k.delta);
  if (k.unit === 'pct' || k.unit === 'points') {
    return `${sign}${formatKpi(abs, 'points', lang)} ${lang === 'it' ? 'pt' : 'pts'}`;
  }
  return `${sign}${formatKpi(abs, k.unit === 'index' ? 'points' : k.unit, lang)}`;
}

export function formatPct(v: number | null, lang: Lang): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const s = fmtNumber(Math.abs(v), lang, 1);
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${s}%`;
}
