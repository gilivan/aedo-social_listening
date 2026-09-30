import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { getDb, getMeta, setMeta } from '@/lib/db';
import { benchmarkEntities, projects, reviewSources, reviews } from '@/lib/db/schema';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';
import { reviewsByPlace, socialContentByAccount, type PlaceReputation, type AccountContent } from '@/lib/aedo-benchmark';

// ---------------------------------------------------------------------------
// AEDO — Resumen ejecutivo.
//
// Junta en una sola vista lo que el resto de AEDO reparte en muchas pantallas:
// reputación (reseñas), temas de las reseñas por lugar, conversación (prensa,
// redes, búsquedas) y una síntesis de la IA con hallazgos y oportunidades.
// Los datos se calculan en cada visita; la síntesis de IA se genera a pedido
// y queda guardada (meta exec_summary:{proyecto}) hasta la próxima.
// ---------------------------------------------------------------------------

export const EXEC_DAYS = 90;
const DAY = 86_400_000;

/** Temas típicos de la experiencia en un lugar físico (centros comerciales, tiendas, restaurantes). */
export const REVIEW_THEMES: { key: string; label: string; re: RegExp }[] = [
  { key: 'parqueo', label: 'Parqueadero', re: /parque(adero|o)|parking|estaciona/i },
  { key: 'pago', label: 'Pago del parqueo / máquinas', re: /m[aá]quina|cajero de pago|\bqr\b|pagar el parq|fila.{0,20}pag/i },
  { key: 'motos', label: 'Motos', re: /\bmotos?\b|motociclis/i },
  { key: 'seguridad', label: 'Seguridad y vigilancia', re: /segur|vigilan|guarda|robo|ladr/i },
  { key: 'atencion', label: 'Atención y servicio', re: /atenci[oó]n|servicio|amable|grosero|personal/i },
  { key: 'limpieza', label: 'Limpieza y baños', re: /limpi|aseo|baño|sucio/i },
  { key: 'comida', label: 'Comida y restaurantes', re: /comida|restaurant|plazoleta|gastro|caf[eé]/i },
  { key: 'variedad', label: 'Variedad de tiendas y marcas', re: /variedad|tiendas|marcas|almacen|locales/i },
  { key: 'ambiente', label: 'Ambiente y espacios', re: /bonit|hermos|agradable|ambiente|espacio|amplio|natural|verde|aire libre/i },
  { key: 'familia', label: 'Niños y familia', re: /niñ|famili|beb[eé]|juegos/i },
  { key: 'mascotas', label: 'Mascotas', re: /mascota|perr|pet friendly/i },
  { key: 'eventos', label: 'Eventos y actividades', re: /evento|concierto|show|actividad|feria|pesebre/i },
  { key: 'precios', label: 'Precios', re: /precio|caro|barato|costos?\b|cobr/i },
  { key: 'acceso', label: 'Ubicación y acceso', re: /ubicaci|acceso|llegar|transporte|v[ií]a|tr[aá]fico|tranc/i },
  { key: 'confort', label: 'Clima y confort', re: /aire acondicionado|calor|fr[ií]o|ruido|silla/i },
  { key: 'servicios', label: 'Bancos, cine y servicios', re: /banco|cine|supermercado|[ée]xito|farmacia|oficina/i },
];

export type ThemeCell = { n: number; avg: number | null };
export type ThemeMatrix = { places: string[]; rows: { key: string; label: string; cells: ThemeCell[] }[] };
export type Quote = { place: string; rating: number; date: string; text: string };
export type EntityVoice = {
  name: string; total: number; articles: number; posts: number; positive: number; negative: number; neutral: number;
};
export type PressItem = { entity: string; title: string; outlet: string | null; url: string | null; date: string; sentiment: string | null };
export type SocialAccount = { network: string; account: string; comments: number; positive: number; negative: number; neutral: number; pending: number };
export type SocialQuote = { account: string; text: string; likes: number };
export type SearchPeak = { entity: string; date: string; value: number };

export type ExecFacts = {
  projectName: string;
  days: number;
  since: string;
  scope: { mentions: number; articles: number; posts: number; reviews: number; places: number; socialComments: number; sources: { source: string; n: number }[] };
  places: PlaceReputation[];
  themes: ThemeMatrix;
  negativeQuotes: Quote[];
  positiveQuotes: Quote[];
  voices: EntityVoice[];
  press: PressItem[];
  social: SocialAccount[];
  socialQuotes: SocialQuote[];
  content: AccountContent[];
  searchPeaks: SearchPeak[];
  gaps: string[];
};

const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const emojiOnly = (t: string) => !/[a-záéíóúñü]{3,}/i.test(t);

export async function execFacts(projectId: number, days = EXEC_DAYS): Promise<ExecFacts> {
  const db = await getDb();
  const since = new Date(Date.now() - days * DAY);
  const sinceIso = since.toISOString();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  const entities = await db.select().from(benchmarkEntities).where(eq(benchmarkEntities.projectId, projectId)).orderBy(asc(benchmarkEntities.id));

  // ── Alcance ──
  const srcRows = (await db.execute(sql`
    SELECT source, kind, count(*)::int AS n FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${sinceIso}::timestamptz
    GROUP BY source, kind ORDER BY n DESC`)).rows as { source: string; kind: string; n: number }[];
  const bySource = new Map<string, number>();
  for (const r of srcRows) bySource.set(r.source, (bySource.get(r.source) ?? 0) + Number(r.n));

  // ── Reseñas ──
  const places = await reviewsByPlace(projectId, days * 2);
  const revs = await db.select({
    rating: reviews.rating, content: reviews.content, publishedAt: reviews.publishedAt, label: reviewSources.label,
  }).from(reviews).innerJoin(reviewSources, eq(reviewSources.id, reviews.sourceId))
    .where(and(eq(reviews.projectId, projectId), gte(reviews.publishedAt, new Date(Date.now() - days * 2 * DAY))));
  const placeNames = places.filter((p) => p.total > 0).map((p) => p.label);
  const themes: ThemeMatrix = {
    places: placeNames,
    rows: REVIEW_THEMES.map((t) => ({
      key: t.key, label: t.label,
      cells: placeNames.map((pl) => {
        const hits = revs.filter((r) => r.label === pl && r.content && t.re.test(r.content));
        return { n: hits.length, avg: hits.length ? hits.reduce((s, h) => s + h.rating, 0) / hits.length : null };
      }),
    })).filter((row) => row.cells.some((c) => c.n > 0)),
  };
  const quote = (r: typeof revs[number]): Quote => ({ place: r.label, rating: r.rating, date: iso(r.publishedAt), text: r.content.replace(/\s+/g, ' ').slice(0, 320) });
  const byNewest = [...revs].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const perPlace = (list: typeof revs, n: number) => placeNames.flatMap((pl) => list.filter((r) => r.label === pl).slice(0, n));
  const negativeQuotes = perPlace(byNewest.filter((r) => r.rating <= 2 && r.content.trim().length > 25), 4).map(quote);
  const positiveQuotes = perPlace(byNewest.filter((r) => r.rating === 5 && r.content.trim().length > 60), 2).map(quote);

  // ── Voz por entidad (prensa + redes + web) ──
  const voices: EntityVoice[] = [];
  const press: PressItem[] = [];
  for (const e of entities) {
    if (!e.keywords.length) continue;
    const pats = sql.join(e.keywords.map((k) => sql`${`%${k}%`}`), sql`, `);
    const match = sql`(coalesce(title,'') || ' ' || content) ILIKE ANY (ARRAY[${pats}])`;
    const [v] = (await db.execute(sql`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE kind = 'article')::int AS articles,
        count(*) FILTER (WHERE kind <> 'article')::int AS posts,
        count(*) FILTER (WHERE sentiment = 'positive')::int AS positive,
        count(*) FILTER (WHERE sentiment = 'negative')::int AS negative,
        count(*) FILTER (WHERE sentiment = 'neutral')::int AS neutral
      FROM mentions WHERE project_id = ${projectId} AND published_at >= ${sinceIso}::timestamptz AND ${match}`)).rows as Record<string, number>[];
    voices.push({
      name: e.name, total: Number(v.total), articles: Number(v.articles), posts: Number(v.posts),
      positive: Number(v.positive), negative: Number(v.negative), neutral: Number(v.neutral),
    });
    const arts = (await db.execute(sql`
      SELECT title, community, url, published_at, sentiment FROM mentions
      WHERE project_id = ${projectId} AND kind = 'article' AND published_at >= ${sinceIso}::timestamptz AND ${match}
      ORDER BY published_at DESC LIMIT 6`)).rows as { title: string; community: string | null; url: string | null; published_at: string; sentiment: string | null }[];
    for (const a of arts) press.push({ entity: e.name, title: a.title, outlet: a.community, url: a.url, date: iso(a.published_at), sentiment: a.sentiment });
  }

  // ── Redes (comentarios vía Apify) ──
  const social = ((await db.execute(sql`
    SELECT source AS network, community AS account, count(*)::int AS comments,
      count(*) FILTER (WHERE sentiment = 'positive')::int AS positive,
      count(*) FILTER (WHERE sentiment = 'negative')::int AS negative,
      count(*) FILTER (WHERE sentiment = 'neutral')::int AS neutral,
      count(*) FILTER (WHERE sentiment IS NULL)::int AS pending
    FROM mentions
    WHERE project_id = ${projectId} AND source IN ('instagram', 'facebook') AND published_at >= ${sinceIso}::timestamptz
    GROUP BY source, community ORDER BY comments DESC`)).rows as Record<string, unknown>[]).map((r) => ({
    network: String(r.network), account: String(r.account), comments: Number(r.comments),
    positive: Number(r.positive), negative: Number(r.negative), neutral: Number(r.neutral), pending: Number(r.pending),
  }));
  const sq = (await db.execute(sql`
    SELECT community, content, coalesce((engagement->>'likes')::int, 0) AS likes FROM mentions
    WHERE project_id = ${projectId} AND source IN ('instagram', 'facebook') AND published_at >= ${sinceIso}::timestamptz
    ORDER BY published_at DESC LIMIT 600`)).rows as { community: string; content: string; likes: number }[];
  const socialQuotes: SocialQuote[] = [];
  for (const acc of social) {
    socialQuotes.push(...sq.filter((r) => r.community === acc.account && r.content.length > 12 && !emojiOnly(r.content))
      .sort((a, b) => Number(b.likes) - Number(a.likes)).slice(0, 6)
      .map((r) => ({ account: acc.account, text: r.content.replace(/\s+/g, ' ').slice(0, 220), likes: Number(r.likes) })));
  }
  const content = await socialContentByAccount(projectId, days);

  // ── Búsquedas en Google ──
  const searchPeaks = ((await db.execute(sql`
    SELECT e.name AS entity, s.date, s.value FROM search_interest s
    JOIN benchmark_entities e ON e.id = s.entity_id
    WHERE e.project_id = ${projectId} AND s.date >= ${iso(since)}::date AND s.value >= 20
    ORDER BY s.value DESC LIMIT 8`)).rows as Record<string, unknown>[]).map((r) => ({
    entity: String(r.entity), date: iso(r.date as string), value: Number(r.value),
  }));

  // ── Vacíos de cobertura ──
  const gaps: string[] = [];
  const accounts = (project?.socialAccounts ?? []) as { network: string; handle: string; label: string }[];
  for (const a of accounts) {
    const key = a.network === 'instagram' ? `@${a.handle}` : a.label;
    if (!social.some((s) => s.network === a.network && s.account === key)) {
      gaps.push(`${a.network === 'instagram' ? 'Instagram' : 'Facebook'} ${key}: sin comentarios en el periodo (aún no se ha leído o no tuvo comentarios).`);
    }
  }
  for (const e of entities) if (!places.some((p) => p.label.toLowerCase().includes(e.name.toLowerCase().split(' (')[0].replace(/^centro comercial /i, '').toLowerCase()))) {
    gaps.push(`${e.name}: sin reseñas de Google Maps configuradas.`);
  }
  const pendingSent = social.reduce((s, a) => s + a.pending, 0);
  if (pendingSent) gaps.push(`${pendingSent} comentarios en redes aún sin análisis de sentimiento.`);

  return {
    projectName: project?.name ?? '', days, since: iso(since),
    scope: {
      mentions: srcRows.reduce((s, r) => s + Number(r.n), 0),
      articles: srcRows.filter((r) => r.kind === 'article').reduce((s, r) => s + Number(r.n), 0),
      posts: srcRows.filter((r) => r.kind !== 'article').reduce((s, r) => s + Number(r.n), 0),
      reviews: revs.length, places: placeNames.length,
      socialComments: social.reduce((s, a) => s + a.comments, 0),
      sources: [...bySource.entries()].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n),
    },
    places, themes, negativeQuotes, positiveQuotes, voices, press, social, socialQuotes, content, searchPeaks, gaps,
  };
}

// ── Síntesis con IA ──────────────────────────────────────────────────────

export type ExecSummary = {
  generatedAt: string;
  titular: string;
  contexto: string;
  hallazgos: { titulo: string; detalle: string; evidencia: string }[];
  dolores: { tema: string; detalle: string }[];
  fortalezas: { tema: string; detalle: string }[];
  comparativo: { entidad: string; lectura: string }[];
  oportunidades: { titulo: string; accion: string; prioridad: 'alta' | 'media' | 'baja' }[];
  riesgos: string[];
  limitaciones: string[];
};

const SYSTEM = `Eres analista senior de social listening en una agencia de comunicaciones de Medellín (Colombia).
Recibes datos agregados de un listening (reseñas de Google Maps, prensa, web, comentarios en Instagram/Facebook y búsquedas en Google) sobre una marca y sus competidores.
Escribe en español de Colombia, claro y directo, para un equipo de estrategia y para el cliente.
Reglas:
- Usa SOLO lo que está en los datos; cada hallazgo debe citar cifras o ejemplos concretos del payload (evidencia).
- No inventes causas: si algo es hipótesis, dilo ("posible", "a validar").
- La marca principal es la primera de "voces"; compárala con las demás.
- Distingue volumen de calidad: pocos datos = lectura tentativa.
- Oportunidades accionables (qué hacer, no generalidades), con prioridad alta/media/baja.
- Nada de oportunismo con tragedias de la competencia.
Responde ÚNICAMENTE con JSON válido con esta forma:
{"titular": string (una frase), "contexto": string (2-3 frases),
 "hallazgos": [{"titulo","detalle","evidencia"}] (4-7),
 "dolores": [{"tema","detalle"}] (2-5), "fortalezas": [{"tema","detalle"}] (2-5),
 "comparativo": [{"entidad","lectura"}] (una por entidad con datos),
 "oportunidades": [{"titulo","accion","prioridad"}] (4-7),
 "riesgos": [string] (1-4), "limitaciones": [string] (1-4)}`;

export const execSummaryKey = (projectId: number) => `exec_summary:${projectId}`;

export async function getExecSummary(projectId: number): Promise<ExecSummary | null> {
  return getMeta<ExecSummary>(execSummaryKey(projectId));
}

export async function buildExecSummary(projectId: number): Promise<{ summary: ExecSummary | null; error?: string }> {
  if (!await claudeAvailable()) return { summary: null, error: 'falta la clave de IA o se alcanzó el tope de gasto' };
  const f = await execFacts(projectId);
  if (f.scope.mentions + f.scope.reviews < 20) return { summary: null, error: 'todavía no hay suficientes datos para un resumen' };

  const payload = {
    proyecto: f.projectName, periodo: `últimos ${f.days} días (desde ${f.since}); reseñas: ${f.days * 2} días`,
    alcance: f.scope,
    reputacion_google_maps: f.places.map((p) => ({ lugar: p.label, reseñas: p.total, promedio: +p.avg.toFixed(2), negativas_1_2: p.negative, ultimos_30d: p.recent, promedio_30d: p.recentAvg && +p.recentAvg.toFixed(2) })),
    temas_reseñas: f.themes.rows.map((r) => ({ tema: r.label, por_lugar: Object.fromEntries(f.themes.places.map((pl, i) => [pl, r.cells[i].n ? `${r.cells[i].n} menciones, ${r.cells[i].avg!.toFixed(1)}★` : '—'])) })),
    reseñas_negativas: f.negativeQuotes.slice(0, 24),
    reseñas_positivas: f.positiveQuotes.slice(0, 12),
    voces: f.voices,
    prensa: f.press.slice(0, 30).map((p) => ({ entidad: p.entity, titular: p.title.slice(0, 160), medio: p.outlet, fecha: p.date, sentimiento: p.sentiment })),
    redes_comentarios: f.social,
    redes_ejemplos: f.socialQuotes.slice(0, 40),
    redes_contenido_marcas: f.content,
    picos_busqueda: f.searchPeaks,
    vacios: f.gaps,
  };
  let text = JSON.stringify(payload);
  if (text.length > 22000) {
    payload.redes_ejemplos = payload.redes_ejemplos.slice(0, 20);
    payload.reseñas_negativas = payload.reseñas_negativas.slice(0, 14);
    payload.prensa = payload.prensa.slice(0, 18);
    text = JSON.stringify(payload);
  }

  const out = await callClaude(MODELS.sonnet, 'executive_summary', SYSTEM, text, 5000, false, 240_000);
  if (!out) return { summary: null, error: 'el modelo no respondió (tiempo, tope de gasto o error de la API)' };
  try {
    const parsed = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as Omit<ExecSummary, 'generatedAt'>;
    if (!parsed.titular || !Array.isArray(parsed.hallazgos)) throw new Error('forma inesperada');
    const summary: ExecSummary = {
      generatedAt: new Date().toISOString(),
      titular: String(parsed.titular), contexto: String(parsed.contexto ?? ''),
      hallazgos: parsed.hallazgos ?? [], dolores: parsed.dolores ?? [], fortalezas: parsed.fortalezas ?? [],
      comparativo: parsed.comparativo ?? [], oportunidades: parsed.oportunidades ?? [],
      riesgos: parsed.riesgos ?? [], limitaciones: parsed.limitaciones ?? [],
    };
    await setMeta(execSummaryKey(projectId), summary);
    return { summary };
  } catch (e) {
    console.error('[resumen] respuesta no utilizable:', (e as Error).message, out.slice(0, 300));
    return { summary: null, error: 'la respuesta del modelo no se pudo leer; inténtalo de nuevo' };
  }
}
