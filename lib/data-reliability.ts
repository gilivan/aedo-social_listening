import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions, projects } from '@/lib/db/schema';
import {
  delta, fmtNumber, meanSd, RETENTION_DAYS, SMALL_SAMPLE, nss, type Kpi, type KpiId, type Lang, type StandardKpis,
} from '@/lib/kpi-standard';

// ---------------------------------------------------------------------------
// Analisi critica, livello 1: i numeri reggono?
//
// Un report non si rovina con un numero sbagliato: si rovina con un numero
// giusto letto male. "+12% di menzioni" è vero, ed è anche la normale
// oscillazione di una settimana qualunque. "Engagement raddoppiato" è vero,
// ed è un solo post. Qui si mettono in discussione i KPI prima che qualcuno li
// porti in riunione.
//
// Tutto è calcolato: nessuna chiamata al modello, nessuna spesa. Quello che
// non si può calcolare — il tasso d'errore del sentiment, per esempio, che
// richiede di leggere le menzioni — non si stima: si dichiara come verifica da
// fare a mano.
//
// Ogni rilievo segue lo stesso schema, perché una critica senza evidenza è
// un'opinione e una critica senza verifica non porta da nessuna parte:
// osservazione → evidenza → perché è un problema → confidenza → verifica.
// ---------------------------------------------------------------------------

const L = (lang: Lang, it: string, en: string) => (lang === 'it' ? it : en);

export type Confidence = 'high' | 'medium' | 'low';
export type Severity = 'info' | 'caution' | 'critical';
export type Verdict = 'reliable' | 'caution' | 'unusable';

export type Finding = {
  id: string;
  area: 'validity' | 'coherence' | 'extremes' | 'significance' | 'sentiment' | 'comparison' | 'completeness';
  severity: Severity;
  observation: string;
  evidence: string;
  why: string;
  confidence: Confidence;
  verify: string;
};

export type KpiVerdict = { id: KpiId; label: string; verdict: Verdict; reason: string };

export type Reliability = {
  overall: 'suitable' | 'caution' | 'unsuitable';
  overallReason: string;
  findings: Finding[];
  verdicts: KpiVerdict[];
  /** Affermazioni che con questi dati NON si possono fare. */
  cannotSay: string[];
  /** Quanti periodi di pari durata c'erano per misurare l'oscillazione normale. */
  historyWindows: number;
};

/** Oltre questa quota un solo autore rende sospetto il volume. */
const DOMINANT_AUTHOR = 0.2;
/** Oltre questa quota i tre post migliori sono l'engagement del periodo. */
const TOP3_SHARE = 0.5;

// --- Pezzi puri, verificabili ------------------------------------------------

/**
 * Una variazione è "normale" se sta entro una deviazione standard delle
 * variazioni fra periodi consecutivi. Con meno di quattro periodi non si dice
 * niente: tre numeri non fanno una distribuzione.
 */
export function withinNoise(change: number, history: number[]): { noise: boolean | null; sd: number } {
  if (history.length < 4) return { noise: null, sd: 0 };
  const steps = history.slice(1).map((v, i) => v - history[i]);
  const { sd } = meanSd(steps);
  if (sd === 0) return { noise: change === 0, sd };
  return { noise: Math.abs(change) <= sd, sd };
}

/** La variazione cambia verso, o cambia molto, togliendo i post estremi? */
export function extremesDriven(
  withTop: { cur: number; prev: number }, withoutTop: { cur: number; prev: number },
): { driven: boolean; pctWith: number | null; pctWithout: number | null } {
  const a = delta(withTop.cur, withTop.prev).pct;
  const b = delta(withoutTop.cur, withoutTop.prev).pct;
  if (a === null || b === null) return { driven: false, pctWith: a, pctWithout: b };
  // Due casi, e solo questi: togliendo i post estremi la variazione cambia
  // verso, oppure si riduce a meno della metà. Una differenza in punti non
  // basta: fra +6.400% e +9.900% ci sono 3.500 punti e nessuna storia diversa.
  const flips = Math.sign(a) !== Math.sign(b) && Math.abs(a - b) > 5;
  const shrinks = Math.sign(a) === Math.sign(b) && Math.abs(a) > 5 && Math.abs(b) < Math.abs(a) / 2;
  return { driven: flips || shrinks, pctWith: a, pctWithout: b };
}

// --- Le interrogazioni -------------------------------------------------------

const ENG = sql`(coalesce((${mentions.engagement}->>'likes')::float8, 0)
  + coalesce((${mentions.engagement}->>'comments')::float8, 0)
  + coalesce((${mentions.engagement}->>'shares')::float8, 0))`;
const HAS_ENG = sql`(${mentions.engagement} is not null and (
  ${mentions.engagement} ? 'likes' or ${mentions.engagement} ? 'comments' or ${mentions.engagement} ? 'shares'))`;

async function engagementShape(projectId: number, from: Date, to: Date) {
  const db = await getDb();
  const where = and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, from), lt(mentions.publishedAt, to), HAS_ENG);
  const [stats] = await db.select({
    total: sql<number>`coalesce(sum(${ENG}), 0)`,
    mean: sql<number | null>`avg(${ENG})`,
    median: sql<number | null>`percentile_cont(0.5) within group (order by ${ENG})`,
  }).from(mentions).where(where);
  const top = await db.select({ v: sql<number>`${ENG}` }).from(mentions).where(where)
    .orderBy(sql`1 desc`).limit(3);
  const top3 = top.reduce((s, r) => s + Number(r.v), 0);
  return {
    total: Number(stats?.total ?? 0),
    mean: stats?.mean === null || stats?.mean === undefined ? null : Number(stats.mean),
    median: stats?.median === null || stats?.median === undefined ? null : Number(stats.median),
    top3,
  };
}

/**
 * Contenuti uguali ripetuti: il segnale più semplice di bot e ripubblicazioni.
 *
 * Si contano le copie IN PIÙ, non i gruppi interi: un testo pubblicato tre
 * volte aggiunge due menzioni al volume, non tre. E si riporta il caso
 * peggiore, perché è quello che dice che cosa escludere: sui dati veri era un
 * account Mastodon che pubblicava lo stesso post ottantatré volte.
 */
async function duplicates(projectId: number, from: Date, to: Date): Promise<{
  extra: number; top: { text: string; n: number; authors: number; sources: string } | null;
}> {
  const db = await getDb();
  const res = await db.execute(sql`
    select count(*)::int as n,
           count(distinct coalesce(author_handle, author))::int as authors,
           string_agg(distinct source, ', ') as sources,
           left(min(content), 80) as text
    from mentions
    where project_id = ${projectId}
      and published_at >= ${from.toISOString()}::timestamptz
      and published_at < ${to.toISOString()}::timestamptz
      and length(content) > 30
    group by lower(left(regexp_replace(content, '\\s+', ' ', 'g'), 200))
    having count(*) > 1
    order by 1 desc`);
  const rows = res.rows as { n: number; authors: number; sources: string; text: string }[];
  const extra = rows.reduce((s, r) => s + Number(r.n) - 1, 0);
  const t = rows[0];
  return {
    extra,
    top: t ? { text: t.text, n: Number(t.n), authors: Number(t.authors), sources: t.sources } : null,
  };
}

/**
 * I periodi di pari durata prima di quello corrente, fin dove i dati ci sono.
 * Un periodo che comincia prima della prima menzione, o oltre la
 * conservazione, non è un periodo "tranquillo": è un periodo senza memoria, e
 * metterlo nella storia farebbe sembrare anomala qualunque cosa.
 */
async function history(
  projectId: number, currentFrom: Date, days: number, limit: Date,
): Promise<{ n: number; pos: number; neg: number }[]> {
  const db = await getDb();
  const [first] = await db.select({ at: sql<string | null>`min(${mentions.publishedAt})` })
    .from(mentions).where(eq(mentions.projectId, projectId));
  const firstAt = first?.at ? new Date(first.at) : null;
  if (!firstAt) return [];

  const span = days * 86400_000;
  const windows: { from: Date; to: Date }[] = [];
  for (let i = 1; i <= 8; i++) {
    const from = new Date(currentFrom.getTime() - i * span);
    if (from < firstAt || from < limit) break;
    windows.push({ from, to: new Date(from.getTime() + span) });
  }
  if (!windows.length) return [];

  const rows = await Promise.all(windows.map(async (w) => {
    const [r] = await db.select({
      n: sql<number>`count(*)`,
      pos: sql<number>`count(*) filter (where lower(${mentions.sentiment}) in ('positive','positivo'))`,
      neg: sql<number>`count(*) filter (where lower(${mentions.sentiment}) in ('negative','negativo'))`,
    }).from(mentions).where(and(
      eq(mentions.projectId, projectId), gte(mentions.publishedAt, w.from), lt(mentions.publishedAt, w.to),
    ));
    return { n: Number(r?.n ?? 0), pos: Number(r?.pos ?? 0), neg: Number(r?.neg ?? 0) };
  }));
  // Dal più vecchio al più recente: le variazioni si leggono in avanti.
  return rows.reverse();
}

// --- Il giudizio -------------------------------------------------------------

export async function assessReliability(projectId: number, k: StandardKpis, now = new Date()): Promise<Reliability> {
  const { lang } = k;
  const db = await getDb();
  const [project] = await db.select({ mode: projects.mode }).from(projects).where(eq(projects.id, projectId));
  const isUpload = project?.mode === 'upload';
  const { cur, prev } = k.raw;
  const days = k.current.days;
  const fmt = (v: number, d = 0) => fmtNumber(v, lang, d);

  const findings: Finding[] = [];
  const cannotSay: string[] = [];
  const cautions = new Map<KpiId, string>();
  const caution = (id: KpiId, why: string) => { if (!cautions.has(id)) cautions.set(id, why); };

  if (cur.n === 0) {
    return {
      overall: 'unsuitable',
      overallReason: L(lang, 'Nessuna menzione nel periodo: non c’è niente da leggere.', 'No hay menciones en el periodo: no hay nada que leer.'),
      findings: [], verdicts: k.kpis.map((x) => ({ id: x.id, label: x.label, verdict: 'unusable', reason: L(lang, 'nessun dato', 'sin datos') })),
      cannotSay: [], historyWindows: 0,
    };
  }

  const retentionCut = new Date(now.getTime() - RETENTION_DAYS * 86400_000);
  const [engCur, engPrev, dup, hist] = await Promise.all([
    engagementShape(projectId, k.current.from, k.current.to),
    engagementShape(projectId, k.previous.from, k.previous.to),
    duplicates(projectId, k.current.from, k.current.to),
    history(projectId, k.current.from, days, isUpload ? new Date(0) : retentionCut),
  ]);

  // 1. COMPLETEZZA — giorni senza dati dove i dati dovrebbero esserci.
  // Il primo e l'ultimo giorno sono quasi sempre parziali (il periodo comincia
  // e finisce a un'ora qualunque): uno zero lì non è un buco nella raccolta.
  const zeroDays = k.daily.slice(1, -1).filter((d) => d.value === 0);
  const avgDaily = cur.n / Math.max(1, k.daily.length);
  if (!isUpload && zeroDays.length && avgDaily >= 5) {
    findings.push({
      id: 'gaps', area: 'completeness', severity: 'caution',
      observation: L(lang,
        zeroDays.length === 1 ? 'Un giorno senza nessuna menzione' : `${zeroDays.length} giorni senza nessuna menzione`,
        zeroDays.length === 1 ? 'Un día sin ninguna mención' : `${zeroDays.length} días sin ninguna mención`),
      evidence: L(lang, `media di ${fmt(avgDaily, 1)} menzioni al giorno; giorni a zero: ${zeroDays.slice(0, 5).map((d) => d.day).join(', ')}`,
        `promedio de ${fmt(avgDaily, 1)} menciones al día; días en cero: ${zeroDays.slice(0, 5).map((d) => d.day).join(', ')}`),
      why: L(lang, 'con questo volume un giorno a zero è più probabilmente una raccolta interrotta che un silenzio: abbassa totali e medie.',
        'con este volumen, un día en cero es más probablemente una recopilación interrumpida que un silencio: baja totales y promedios.'),
      confidence: 'medium',
      verify: L(lang, 'controlla lo stato delle fonti in Impostazioni per quei giorni.', 'revisa el estado de las fuentes en Ajustes para esos días.'),
    });
    caution('mentions', L(lang, 'giorni senza raccolta nel periodo', 'días sin recopilación en el periodo'));
  }

  // 2. VALIDITÀ — metriche coperte solo in parte, e metriche non omogenee.
  const covEng = cur.withEng / cur.n;
  if (cur.withEng && covEng < 0.5) {
    findings.push({
      id: 'engCoverage', area: 'validity', severity: 'caution',
      observation: L(lang, 'L’engagement copre meno della metà delle menzioni', 'El engagement cubre menos de la mitad de las menciones'),
      evidence: L(lang, `${fmt(cur.withEng)} menzioni su ${fmt(cur.n)} riportano like, commenti o condivisioni (${fmt(covEng * 100)}%)`,
        `${fmt(cur.withEng)} de ${fmt(cur.n)} menciones reportan likes, comentarios o compartidos (${fmt(covEng * 100)}%)`),
      why: L(lang, 'i KPI di engagement descrivono solo i canali che lo misurano: non sono l’engagement della conversazione.',
        'los KPI de engagement describen solo los canales que lo miden: no son el engagement de toda la conversación.'),
      confidence: 'high',
      verify: L(lang, 'leggi l’engagement per canale, non in totale.', 'lee el engagement por canal, no como total.'),
    });
    for (const id of ['engagement', 'engPerMention', 'amplification', 'conversation'] as KpiId[]) {
      caution(id, L(lang, `copre il ${fmt(covEng * 100)}% delle menzioni`, `cubre el ${fmt(covEng * 100)}% de las menciones`));
    }
  }
  const engSources = k.channels.filter((c) => c.engagement !== null && c.engagement > 0);
  if (engSources.length > 1) {
    findings.push({
      id: 'engMixed', area: 'validity', severity: 'info',
      observation: L(lang, 'L’engagement totale somma metriche di canali diversi', 'El engagement total suma métricas de canales distintos'),
      evidence: L(lang, `canali con engagement: ${engSources.map((c) => c.source).join(', ')}`,
        `canales con engagement: ${engSources.map((c) => c.source).join(', ')}`),
      why: L(lang, 'una reaction di Facebook, un like di Instagram e un upvote non valgono lo stesso: il totale è un indicatore, non una misura omogenea.',
        'una reacción de Facebook, un like de Instagram y un upvote no valen lo mismo: el total es un indicador, no una medida homogénea.'),
      confidence: 'high',
      verify: L(lang, 'confronta i canali fra loro solo sulla loro variazione, non sul valore assoluto.', 'compara los canales por su variación, no por su valor absoluto.'),
    });
  }
  const covReach = cur.withReach / cur.n;
  if (cur.withReach && covReach < 0.5) {
    caution('reach', L(lang, `copre il ${fmt(covReach * 100)}% delle menzioni`, `cubre el ${fmt(covReach * 100)}% de las menciones`));
    caution('erReach', L(lang, 'reach disponibile solo su una parte delle menzioni', 'alcance disponible solo para una parte de las menciones'));
  }
  if (cur.withReach) {
    cannotSay.push(L(lang,
      `Non si può dire che il messaggio ha raggiunto ${fmt(cur.reach)} persone: la reach è potenziale, stimata dalle fonti${covReach < 1 ? `, e manca per il ${fmt((1 - covReach) * 100)}% delle menzioni` : ''}.`,
      `No se puede decir que el mensaje llegó a ${fmt(cur.reach)} personas: el alcance es potencial, estimado por las fuentes${covReach < 1 ? `, y falta en el ${fmt((1 - covReach) * 100)}% de las menciones` : ''}.`));
  }

  // 3. COERENZA — un autore che fa il volume, testi ripetuti.
  const top = k.topAuthors[0];
  if (top && top.n / cur.n > DOMINANT_AUTHOR && cur.n >= 20) {
    findings.push({
      id: 'dominantAuthor', area: 'coherence', severity: 'caution',
      observation: L(lang, `Un solo autore produce il ${fmt((top.n / cur.n) * 100)}% delle menzioni`, `Un solo autor produce el ${fmt((top.n / cur.n) * 100)}% de las menciones`),
      evidence: L(lang, `${top.author}: ${fmt(top.n)} menzioni su ${fmt(cur.n)}`, `${top.author}: ${fmt(top.n)} de ${fmt(cur.n)} menciones`),
      why: L(lang, 'il volume misura quanto scrive quell’account, non quanto si parla del tema; può essere una testata prolifica, un bot o un aggregatore.',
        'el volumen mide cuánto publica esa cuenta, no cuánto se habla del tema; puede ser un medio prolífico, un bot o un agregador.'),
      confidence: 'high',
      verify: L(lang, 'apri le sue menzioni in Ascolto e decidi se escluderlo dalla query.', 'abre sus menciones en Escucha y decide si excluirlo de la consulta.'),
    });
    caution('mentions', L(lang, 'volume concentrato su un autore', 'volumen concentrado en un autor'));
    caution('perDay', L(lang, 'volume concentrato su un autore', 'volumen concentrado en un autor'));
  }
  const dups = dup.extra;
  if (dups / cur.n > 0.1 && dups >= 10) {
    const worst = dup.top
      ? L(lang, `; il più ripetuto (${fmt(dup.top.n)} volte, ${fmt(dup.top.authors)} ${dup.top.authors === 1 ? 'account' : 'account'}, ${dup.top.sources}): «${dup.top.text}…»`,
        `; el más repetido (${fmt(dup.top.n)} veces, ${fmt(dup.top.authors)} cuenta${dup.top.authors === 1 ? '' : 's'}, ${dup.top.sources}): “${dup.top.text}…”`)
      : '';
    findings.push({
      id: 'duplicates', area: 'coherence', severity: 'caution',
      observation: L(lang, 'Molti contenuti hanno lo stesso testo', 'Muchos contenidos tienen el mismo texto'),
      evidence: L(lang, `${fmt(dups)} menzioni (${fmt((dups / cur.n) * 100)}%) ripetono un testo già presente${worst}`,
        `${fmt(dups)} menciones (${fmt((dups / cur.n) * 100)}%) repiten un texto ya presente${worst}`),
      why: L(lang, 'ripubblicazioni, lanci d’agenzia copiati o bot gonfiano il volume senza aggiungere voci.',
        'republicaciones, notas de agencia copiadas o bots inflan el volumen sin sumar voces.'),
      confidence: 'medium',
      verify: L(lang, 'cerca in Ascolto le frasi ripetute e valuta un’esclusione.', 'busca en Escucha las frases repetidas y evalúa una exclusión.'),
    });
    caution('mentions', L(lang, 'testi duplicati nel volume', 'textos duplicados en el volumen'));
  }

  // 4. VALORI ESTREMI — quanto pesano i tre post migliori.
  if (engCur.total > 0) {
    const share = engCur.top3 / engCur.total;
    const d = extremesDriven(
      { cur: engCur.total, prev: engPrev.total },
      { cur: engCur.total - engCur.top3, prev: engPrev.total - engPrev.top3 },
    );
    if (share > TOP3_SHARE || (d.driven && !k.previousIncomplete)) {
      findings.push({
        id: 'top3', area: 'extremes', severity: 'caution',
        observation: L(lang, 'L’engagement dipende da pochissimi contenuti', 'El engagement depende de muy pocos contenidos'),
        evidence: L(lang,
          `i 3 contenuti migliori valgono il ${fmt(share * 100)}% dell’engagement`
            + (d.pctWith !== null && d.pctWithout !== null ? `; variazione ${fmt(d.pctWith, 1)}% con loro, ${fmt(d.pctWithout, 1)}% senza` : ''),
          `los 3 mejores contenidos suman el ${fmt(share * 100)}% del engagement`
            + (d.pctWith !== null && d.pctWithout !== null ? `; variación de ${fmt(d.pctWith, 1)}% con ellos, ${fmt(d.pctWithout, 1)}% sin ellos` : '')),
        why: L(lang, 'la variazione racconta tre post, non l’andamento del periodo.', 'la variación cuenta la historia de tres posts, no la del periodo.'),
        confidence: 'high',
        verify: L(lang, 'nel report cita i tre contenuti per nome invece di dare la variazione in totale.', 'en el reporte, cita los tres contenidos por nombre en lugar de dar la variación total.'),
      });
      caution('engagement', L(lang, 'guidato dai 3 contenuti principali', 'impulsado por los 3 contenidos principales'));
      if (d.driven && d.pctWith !== null) {
        cannotSay.push(L(lang,
          `Non si può dire che l’engagement è ${d.pctWith >= 0 ? 'cresciuto' : 'calato'} del ${fmt(Math.abs(d.pctWith), 1)}%: senza i 3 contenuti principali la variazione è ${fmt(d.pctWithout ?? 0, 1)}%.`,
          `No se puede decir que el engagement ${d.pctWith >= 0 ? 'creció' : 'cayó'} un ${fmt(Math.abs(d.pctWith), 1)}%: sin los 3 contenidos principales la variación es de ${fmt(d.pctWithout ?? 0, 1)}%.`));
      }
    }
    if (engCur.mean !== null && engCur.median !== null && engCur.median > 0 && engCur.mean > 3 * engCur.median) {
      findings.push({
        id: 'meanMedian', area: 'extremes', severity: 'info',
        observation: L(lang, 'La media dell’engagement non rappresenta il contenuto tipico', 'El engagement promedio no representa el contenido típico'),
        evidence: L(lang, `media ${fmt(engCur.mean, 1)}, mediana ${fmt(engCur.median, 1)} per contenuto`,
          `promedio ${fmt(engCur.mean, 1)}, mediana ${fmt(engCur.median, 1)} por contenido`),
        why: L(lang, 'pochi contenuti molto forti alzano la media: il contenuto tipico ne fa molto meno.',
          'unos pocos contenidos muy fuertes suben el promedio: el contenido típico obtiene mucho menos.'),
        confidence: 'high',
        verify: L(lang, 'riporta la mediana come “engagement del contenuto tipico”.', 'reporta la mediana como “engagement del contenido típico”.'),
      });
      caution('engPerMention', L(lang, `usa la mediana (${fmt(engCur.median, 1)})`, `usa la mediana (${fmt(engCur.median, 1)})`));
    }
  }

  // 5. SIGNIFICATIVITÀ — la variazione è fuori dalla norma?
  const historyWindows = hist.length;
  if (!k.previousIncomplete && prev.n > 0) {
    const series = [...hist.map((h) => h.n), cur.n];
    const change = cur.n - prev.n;
    const { noise, sd } = withinNoise(change, series);
    const pct = delta(cur.n, prev.n).pct;
    if (noise === true && change !== 0 && pct !== null) {
      findings.push({
        id: 'mentionsNoise', area: 'significance', severity: 'caution',
        observation: L(lang, 'La variazione delle menzioni sta nella normale oscillazione', 'La variación de las menciones está dentro de la oscilación normal'),
        evidence: L(lang, `${change > 0 ? '+' : ''}${fmt(change)} menzioni (${fmt(pct, 1)}%); oscillazione tipica fra periodi: ±${fmt(sd)} (su ${historyWindows + 1} periodi)`,
          `${change > 0 ? '+' : ''}${fmt(change)} menciones (${fmt(pct, 1)}%); oscilación típica entre periodos: ±${fmt(sd)} (en ${historyWindows + 1} periodos)`),
        why: L(lang, 'una variazione di questa ampiezza capita anche senza che succeda niente: comunicarla come cambiamento è rumore.',
          'una oscilación de este tamaño ocurre aunque no pase nada: comunicarla como cambio es ruido.'),
        confidence: historyWindows >= 6 ? 'high' : 'medium',
        verify: L(lang, 'guarda se la tendenza continua nel prossimo periodo prima di commentarla.', 'revisa si la tendencia continúa en el próximo periodo antes de comentarla.'),
      });
      caution('mentions', L(lang, 'il valore è solido, la variazione è nella norma', 'el valor es sólido, la variación está dentro de lo normal'));
      cannotSay.push(L(lang,
        `Non si può dire che le menzioni sono ${change > 0 ? 'cresciute' : 'calate'} del ${fmt(Math.abs(pct), 1)}%: la variazione sta dentro l’oscillazione normale (±${fmt(sd)}).`,
        `No se puede decir que las menciones ${change > 0 ? 'crecieron' : 'cayeron'} un ${fmt(Math.abs(pct), 1)}%: la variación está dentro de la oscilación normal (±${fmt(sd)}).`));
    } else if (noise === null) {
      findings.push({
        id: 'shortHistory', area: 'significance', severity: 'info',
        observation: L(lang, 'Storico troppo corto per dire se una variazione è normale', 'Histórico demasiado corto para saber si una variación es normal'),
        evidence: L(lang, `${historyWindows + 1} periodi di ${days} giorni disponibili; ne servono almeno 5`,
          `${historyWindows + 1} periodos de ${days} días disponibles; se necesitan al menos 5`),
        why: L(lang, 'senza una misura dell’oscillazione abituale ogni variazione sembra un segnale.',
          'sin una medida de la oscilación habitual, cualquier variación parece una señal.'),
        confidence: 'high',
        verify: L(lang, isUpload ? 'importa un periodo più lungo, o usa un periodo più breve.' : `usa un periodo più breve: le menzioni raccolte restano ${RETENTION_DAYS} giorni.`,
          isUpload ? 'importa un periodo más largo o usa uno más corto.' : `usa un periodo más corto: las menciones recopiladas se conservan ${RETENTION_DAYS} días.`),
      });
    }

    const nssSeries = [...hist.map((h) => nss(h.pos, h.neg)), nss(cur.positive, cur.negative)]
      .filter((v): v is number => v !== null);
    const nssNow = nss(cur.positive, cur.negative);
    const nssPrev = nss(prev.positive, prev.negative);
    if (nssNow !== null && nssPrev !== null) {
      const n = withinNoise(nssNow - nssPrev, nssSeries);
      if (n.noise === true && Math.abs(nssNow - nssPrev) >= 1) {
        caution('nss', L(lang, `variazione dentro l’oscillazione normale (±${fmt(n.sd, 1)} punti)`, `variación dentro de la oscilación normal (±${fmt(n.sd, 1)} puntos)`));
        cannotSay.push(L(lang,
          `Non si può dire che il sentiment è ${nssNow > nssPrev ? 'migliorato' : 'peggiorato'}: lo scarto di ${fmt(Math.abs(nssNow - nssPrev), 1)} punti di NSS è nella norma.`,
          `No se puede decir que el sentimiento ${nssNow > nssPrev ? 'mejoró' : 'empeoró'}: el cambio de ${fmt(Math.abs(nssNow - nssPrev), 1)} puntos de NSS está dentro de lo normal.`));
      }
    }
  }

  // 6. SENTIMENT — copertura e margine d'errore.
  const covSent = cur.withSentiment / cur.n;
  if (cur.withSentiment && covSent < 0.9) {
    findings.push({
      id: 'sentimentPending', area: 'sentiment', severity: 'caution',
      observation: L(lang, 'Una parte delle menzioni non ha ancora il sentiment', 'Una parte de las menciones aún no tiene sentimiento'),
      evidence: L(lang, `sentiment calcolato su ${fmt(cur.withSentiment)} menzioni su ${fmt(cur.n)} (${fmt(covSent * 100)}%)`,
        `sentimiento calculado sobre ${fmt(cur.withSentiment)} de ${fmt(cur.n)} menciones (${fmt(covSent * 100)}%)`),
      why: L(lang, 'le percentuali si riferiscono alle sole menzioni analizzate: le altre possono spostarle.',
        'los porcentajes se refieren solo a las menciones analizadas: las demás pueden moverlos.'),
      confidence: 'high',
      verify: L(lang, 'lancia l’analisi delle menzioni in attesa e ricontrolla.', 'ejecuta el análisis de las menciones pendientes y vuelve a revisar.'),
    });
    for (const id of ['positive', 'neutral', 'negative', 'nss'] as KpiId[]) {
      caution(id, L(lang, `sentiment su ${fmt(covSent * 100)}% delle menzioni`, `sentimiento sobre el ${fmt(covSent * 100)}% de las menciones`));
    }
  }
  if (cur.withSentiment) {
    findings.push({
      id: 'sentimentError', area: 'sentiment', severity: 'info',
      observation: L(lang, 'Il tasso d’errore del sentiment automatico non è misurato', 'La tasa de error del sentimiento automático no está medida'),
      evidence: L(lang, `${fmt(cur.withSentiment)} menzioni classificate dal modello, nessuna verificata a mano`,
        `${fmt(cur.withSentiment)} menciones clasificadas por el modelo, ninguna verificada a mano`),
      why: L(lang, 'ironia, sarcasmo e dialetto ingannano la classificazione; senza una verifica non si sa in che direzione sbaglia.',
        'la ironía, el sarcasmo y el lenguaje coloquial engañan al clasificador; sin una verificación no sabes hacia dónde se equivoca.'),
      confidence: 'medium',
      verify: L(lang, 'leggi 30 menzioni a caso e conta quante hanno il sentiment giusto; se l’accordo è sotto l’80%, presenta il NSS come indicativo.',
        'lee 30 menciones al azar y cuenta cuántas tienen el sentimiento correcto; si la coincidencia es menor al 80%, presenta el NSS como indicativo.'),
    });
  }

  // 7. CONFRONTO — il periodo precedente è confrontabile?
  //
  // Prima domanda: si stanno confrontando le stesse fonti? Una fonte attivata
  // a metà mese produce una crescita che è solo il perimetro che si allarga.
  // È il caso più comune di "boom" che non è successo.
  const newSources = k.channels.filter((c) => c.previousMentions === 0 && c.mentions > 0);
  const fromNew = newSources.reduce((s2, c) => s2 + c.mentions, 0);
  if (!k.previousIncomplete && prev.n > 0 && fromNew / cur.n > 0.2) {
    const growth = delta(cur.n, prev.n).pct;
    findings.push({
      id: 'newSources', area: 'comparison', severity: 'critical',
      observation: L(lang, 'Una parte del periodo viene da fonti che prima non c’erano', 'Una parte del periodo viene de fuentes que antes no existían'),
      evidence: L(lang,
        `${fmt(fromNew)} menzioni su ${fmt(cur.n)} (${fmt((fromNew / cur.n) * 100)}%) da fonti assenti nel periodo precedente: ${newSources.slice(0, 5).map((c) => `${c.source} ${fmt(c.mentions)}`).join(', ')}`,
        `${fmt(fromNew)} de ${fmt(cur.n)} menciones (${fmt((fromNew / cur.n) * 100)}%) de fuentes ausentes en el periodo anterior: ${newSources.slice(0, 5).map((c) => `${c.source} ${fmt(c.mentions)}`).join(', ')}`),
      why: L(lang, 'la variazione misura il perimetro della raccolta che si è allargato, non la conversazione che cresce.',
        'la variación mide un alcance de recopilación más amplio, no una conversación que crece.'),
      confidence: 'high',
      verify: L(lang, 'confronta i due periodi sulle sole fonti presenti in entrambi (tabella per canale).',
        'compara los dos periodos solo con las fuentes presentes en ambos (tabla por canal).'),
    });
    for (const id of ['mentions', 'perDay', 'engagement', 'reach', 'authors', 'peakIndex'] as KpiId[]) {
      caution(id, L(lang, 'il confronto include fonti nuove', 'la comparación incluye fuentes nuevas'));
    }
    if (growth !== null) {
      cannotSay.push(L(lang,
        `Non si può attribuire alla conversazione la variazione delle menzioni (${growth >= 0 ? '+' : '−'}${fmt(Math.abs(growth), 1)}%): il ${fmt((fromNew / cur.n) * 100)}% del periodo viene da fonti che prima non c’erano.`,
        `La variación de las menciones (${growth >= 0 ? '+' : '−'}${fmt(Math.abs(growth), 1)}%) no se puede atribuir a la conversación: el ${fmt((fromNew / cur.n) * 100)}% del periodo viene de fuentes que antes no existían.`));
    }
  }

  if (k.previousIncomplete) {
    findings.push({
      id: 'comparisonRetention', area: 'comparison', severity: 'critical',
      observation: L(lang, 'Il periodo di confronto è incompleto', 'El periodo de comparación está incompleto'),
      evidence: L(lang, `comincia il ${k.previous.from.toISOString().slice(0, 10)}, oltre i ${RETENTION_DAYS} giorni di conservazione delle menzioni raccolte`,
        `empieza el ${k.previous.from.toISOString().slice(0, 10)}, más allá de los ${RETENTION_DAYS} días de conservación de las menciones recopiladas`),
      why: L(lang, 'ogni variazione sembrerebbe una crescita: è solo la parte di archivio che non c’è più.',
        'cualquier variación parecería crecimiento: es solo la parte del archivo que ya no existe.'),
      confidence: 'high',
      verify: L(lang, 'usa un periodo di 30 giorni o meno per i confronti.', 'usa un periodo de 30 días o menos para las comparaciones.'),
    });
    cannotSay.push(L(lang, 'Non si può confrontare questo periodo con il precedente: il precedente è incompleto.',
      'Este periodo no se puede comparar con el anterior: el anterior está incompleto.'));
  } else if (prev.n > 0 && prev.n < cur.n * 0.2 && historyWindows === 1) {
    findings.push({
      id: 'comparisonThin', area: 'comparison', severity: 'caution',
      observation: L(lang, 'Il periodo di confronto è molto più povero', 'El periodo de comparación es mucho más pobre'),
      evidence: L(lang, `${fmt(prev.n)} menzioni contro ${fmt(cur.n)}, e nessun periodo più vecchio`,
        `${fmt(prev.n)} menciones frente a ${fmt(cur.n)}, y ningún periodo más antiguo`),
      why: L(lang, 'quando il progetto è appena nato, la crescita è la raccolta che si avvia, non la conversazione che aumenta.',
        'cuando el proyecto acaba de empezar, el crecimiento es la recopilación que arranca, no la conversación que aumenta.'),
      confidence: 'medium',
      verify: L(lang, 'controlla la data di creazione del progetto e delle fonti.', 'revisa cuándo se configuraron el proyecto y sus fuentes.'),
    });
    caution('mentions', L(lang, 'confronto con un periodo quasi vuoto', 'comparado con un periodo casi vacío'));
  }

  // Chi nasce da un altro KPI ne eredita i dubbi: la velocità è il volume
  // diviso per i giorni, like e commenti sono pezzi dell'engagement.
  const inherits: [KpiId, KpiId][] = [
    ['perDay', 'mentions'], ['likes', 'engagement'], ['comments', 'engagement'], ['shares', 'engagement'],
  ];
  for (const [child, parent] of inherits) {
    const why = cautions.get(parent);
    if (why) caution(child, why);
  }

  // --- Verdetto per KPI ---
  const verdicts: KpiVerdict[] = k.kpis.map((x: Kpi) => {
    if (x.value === null) {
      return { id: x.id, label: x.label, verdict: 'unusable', reason: x.note ?? L(lang, 'non disponibile', 'no disponible') };
    }
    if (x.base < 30) {
      return { id: x.id, label: x.label, verdict: 'unusable', reason: L(lang, `base di ${x.base} menzioni: troppo piccola`, `base de ${x.base} menciones: demasiado pequeña`) };
    }
    const c = cautions.get(x.id);
    if (c) return { id: x.id, label: x.label, verdict: 'caution', reason: c };
    if (x.smallSample) {
      return { id: x.id, label: x.label, verdict: 'caution', reason: L(lang, `campione limitato (${x.base} menzioni, sotto ${SMALL_SAMPLE})`, `muestra limitada (${x.base} menciones, menos de ${SMALL_SAMPLE})`) };
    }
    return { id: x.id, label: x.label, verdict: 'reliable', reason: L(lang, 'base ampia, nessun rilievo', 'base amplia, sin observaciones') };
  });

  const criticals = findings.filter((f) => f.severity === 'critical').length;
  const cautionsN = findings.filter((f) => f.severity === 'caution').length;
  const overall: Reliability['overall'] = cur.n < 30 ? 'unsuitable' : criticals || cautionsN ? 'caution' : 'suitable';
  const overallReason = cur.n < 30
    ? L(lang, `solo ${cur.n} menzioni nel periodo: troppo poche per un report`, `solo ${cur.n} menciones en el periodo: muy pocas para un reporte`)
    : overall === 'suitable'
      ? L(lang, 'nessun rilievo sui dati del periodo', 'sin observaciones sobre los datos del periodo')
      : L(lang, `${criticals + cautionsN} ${criticals + cautionsN === 1 ? 'rilievo' : 'rilievi'} da dichiarare nel report`,
        `${criticals + cautionsN} ${criticals + cautionsN === 1 ? 'observación' : 'observaciones'} para declarar en el reporte`);

  const order: Record<Severity, number> = { critical: 0, caution: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return { overall, overallReason, findings, verdicts, cannotSay: cannotSay.slice(0, 5), historyWindows };
}
