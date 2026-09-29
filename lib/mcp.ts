import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects, mentions as mentionsTable } from '@/lib/db/schema';
import { dashboardData, listeningData, briefList, normSentimentValue } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { getNarratives } from '@/lib/narratives';
import { cfg } from '@/lib/connector-config';
import { standardKpis } from '@/lib/kpi-standard';
import { assessReliability } from '@/lib/data-reliability';
import { factCheckData } from '@/lib/factcheck';
import { trialsData } from '@/lib/trials';
import { crossCheckData } from '@/lib/crosscheck';
import { getContentLocale } from '@/lib/content-locale';
import { MCP_PROMPTS, renderPrompt } from '@/lib/mcp-prompts';

// ---------------------------------------------------------------------------
// Radar come server MCP.
//
// Un endpoint solo (/api/mcp, streamable HTTP) per due mondi: Claude lo aggiunge
// come server remoto, Copilot Studio lo importa come custom connector — è
// l'unico transport che Copilot Studio parla.
//
// Tutti i tool sono in SOLA LETTURA e a costo zero: leggono quello che la
// pipeline ha già calcolato, non chiamano né l'AI né le fonti esterne. Nessuno
// di essi spende budget Claude o credits Talkwalker.
// ---------------------------------------------------------------------------

export const MCP_TOKEN_ENV = 'RADAR_MCP_TOKEN';

/** Il token che protegge l'endpoint. Assente = MCP spento (non "aperto"). */
export function mcpToken(): string | undefined {
  return cfg(MCP_TOKEN_ENV);
}

/** Confronto a tempo costante: un token si verifica, non si "controlla". */
export function tokenMatches(given: string | null | undefined, expected: string): boolean {
  const a = given ?? '';
  let diff = a.length ^ expected.length;
  for (let i = 0; i < Math.max(a.length, expected.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Estrae il bearer/api-key dalla richiesta, nelle due forme che i client usano. */
export function readToken(headers: Headers): string | null {
  const auth = headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return headers.get('x-api-key');
}

type ToolText = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function ok(payload: unknown, note?: string): ToolText {
  const body = JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text: note ? `${note}\n\n${body}` : body }] };
}

function fail(msg: string): ToolText {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

const MAX_EXCERPT = 300;

function compactMention(m: typeof mentionsTable.$inferSelect) {
  return {
    id: m.id,
    date: m.publishedAt?.toISOString() ?? null,
    source: m.source,
    kind: m.kind,
    title: m.title,
    url: m.url,
    author: m.author ?? m.authorHandle,
    language: m.language,
    country: m.country,
    sentiment: m.sentiment ? normSentimentValue(m.sentiment) : null,
    relevance: m.relevance,
    topics: m.topics,
    engagement: m.engagementScore,
    reach: m.reach,
    excerpt: (m.content ?? '').slice(0, MAX_EXCERPT) || null,
  };
}

async function resolveProject(id?: number) {
  const db = await getDb();
  const rows = id
    ? await db.select().from(projects).where(eq(projects.id, id))
    : await db.select().from(projects).orderBy(projects.id).limit(1);
  return rows[0] ?? null;
}

/** Gli strumenti del server, con titolo e descrizione: li legge anche la pagina MCP. */
export const MCP_TOOLS: { name: string; title: string; description: string }[] = [
  { name: 'radar_projects', title: 'Listar proyectos de AEDO', description: 'Lista los proyectos con su id, tipo (listening / upload / talkwalker), palabras clave de la consulta e idiomas. Empieza aquí: todas las demás herramientas requieren un project_id.' },
  { name: 'radar_overview', title: 'Resumen del proyecto', description: 'El tablero en cifras: menciones de los últimos 7 días, sentimiento promedio, fuentes activas, volumen diario por fuente en 14 días, distribución del sentimiento, temas principales y el último brief diario.' },
  { name: 'radar_mentions', title: 'Buscar menciones', description: 'Busca las menciones de un proyecto con los mismos filtros de la página Escucha: texto libre, fuente, sentimiento, idioma, artículo o publicación, relevancia mínima según la IA y ventana de tiempo. Devuelve 40 por página, en formato compacto.' },
  { name: 'radar_trends', title: 'Temas emergentes', description: 'Temas cuya velocidad en las últimas 24 horas es anómala frente a los días anteriores, con la explicación de la IA cuando la ejecución diaria la generó. Calculado con SQL, sin costo.' },
  { name: 'radar_narratives', title: 'Narrativas', description: 'Grupos de mensajes que impulsan la misma tesis, con su postura, las cuentas que los difunden y una señal de coordinación. Los detecta la ejecución diaria; leerlos no cuesta nada.' },
  { name: 'radar_briefs', title: 'Briefs diarios', description: 'Los briefs diarios de IA ya generados para el proyecto, del más reciente al más antiguo. Leerlos es gratis: se pagaron cuando se escribieron.' },
  { name: 'radar_kpis', title: 'KPI estándar', description: 'KPI estándar del sector con su fórmula y una comparación con el periodo anterior de igual duración: menciones, autores únicos, alcance potencial, engagement (likes + comentarios + compartidos), tasa de engagement sobre alcance, tasas de amplificación y conversación, % positivo/negativo, Net Sentiment Score, concentración de autores e índice de pico. También KPI por canal, días pico y días por encima de 2σ, y el set competitivo (SOV, SOE, Share of Positive Voice). Los valores faltantes son null con el motivo en "note". Solo SQL, gratis.' },
  { name: 'radar_reliability', title: 'Confiabilidad de los datos (análisis crítico N1)', description: 'Cuestiona los KPI antes de que alguien los reporte: fluctuación normal, peso de los 3 elementos principales, un solo autor que impulsa el volumen, textos duplicados, vacíos en la recolección, fuentes que no existían en el periodo de comparación, comparaciones incompletas y cobertura del sentimiento. Devuelve un veredicto general, hallazgos (observación, evidencia, porqué, confianza, verificación), un veredicto confiable/precaución/inutilizable por KPI y las frases que el informe NO debe escribir. Solo SQL, gratis. Llámala antes de interpretar.' },
  { name: 'radar_fact_checks', title: 'Verificaciones', description: 'Afirmaciones sobre el tema del proyecto ya verificadas por fact-checkers (Google Fact Check Tools / ClaimReview), con veredicto normalizado, las calificaciones y enlaces de los propios verificadores, y cuánto sigue circulando cada afirmación en las menciones del proyecto (últimos 7 días frente a los 7 anteriores, fuentes, ids de menciones de muestra). Señales: debunked-growing, debunked-circulating, debunked-quiet, contested, confirmed, open.' },
  { name: 'radar_trials', title: 'Ensayos clínicos', description: 'Ensayos clínicos de ClinicalTrials.gov para los términos que sigue el proyecto: estado, fase, patrocinador, finalizaciones previstas en los próximos 12 meses y, para cada tratamiento, cuánto se habla de él en las noticias frente a qué tan madura es la evidencia (hype = noticias por delante de la evidencia, untold = evidencia que nadie cubre).' },
  { name: 'radar_crosscheck', title: 'Cruces de fuentes', description: 'Noticias, verificaciones, evidencia y voces de audio sobre los mismos temas: afirmaciones desmentidas que siguen circulando, temas calientes de la semana que ningún fact-checker ha verificado, tratamientos donde las noticias van por delante de la evidencia, programas que vuelven al tema cada semana y cuáles de estas fuentes están activas.' },
];

const info = (name: string) => {
  const t = MCP_TOOLS.find((x) => x.name === name)!;
  return { title: t.title, description: t.description };
};

export function createRadarMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'aedo', version: '1.0.0' },
    {
      instructions:
        'AEDO: media intelligence and social listening. Projects come in three kinds — ' +
        '"listening" (AEDO collects from the web), "upload" (data imported from files) and ' +
        '"talkwalker" (mentions read from the corporate Talkwalker API). Every tool here is ' +
        'read-only and free: it returns what the pipeline already computed, and never spends ' +
        'AI budget or Talkwalker credits. Start from radar_projects to get the project ids.',
    },
  );

  server.registerTool(
    'radar_projects',
    {
      ...info('radar_projects'),
      inputSchema: {},
    },
    async () => {
      const db = await getDb();
      const rows = await db.select().from(projects).orderBy(projects.id);
      return ok({
        projects: rows.map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.mode,
          keywords: p.keywords,
          all_terms: p.allTerms,
          exclude_terms: p.excludeTerms,
          languages: p.languages,
          talkwalker_project: p.talkwalkerProject ?? undefined,
        })),
      });
    },
  );

  server.registerTool(
    'radar_overview',
    {
      ...info('radar_overview'),
      inputSchema: { project_id: z.number().int().optional().describe('Project id (default: the first one)') },
    },
    async ({ project_id }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const d = await dashboardData(project.id);
      return ok({
        project: { id: project.id, name: project.name, kind: project.mode },
        kpi_7d: d.kpi,
        volume_by_day: d.volumeByDay,
        sentiment: d.sentimentDist,
        top_topics: d.topTopics,
        latest_brief: d.latestBrief ? { date: d.latestBrief.briefDate, content: d.latestBrief.content } : null,
      });
    },
  );

  server.registerTool(
    'radar_mentions',
    {
      ...info('radar_mentions'),
      inputSchema: {
        project_id: z.number().int().optional(),
        q: z.string().optional().describe('Free text searched in title and content'),
        source: z.string().optional().describe('Source id, e.g. googlenews, talkwalker, reddit'),
        sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
        language: z.string().optional().describe('Language code, e.g. it, en'),
        kind: z.enum(['article', 'post']).optional().describe('Press coverage or social post'),
        days: z.number().int().min(1).max(365).optional().describe('Only the last N days'),
        min_relevance: z.number().int().min(1).max(5).optional().describe('Only mentions rated at least N stars by the AI'),
        sort_by: z.enum(['data', 'engagement', 'rilevanza']).optional().describe('date (default), engagement or relevance'),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) => {
      const project = await resolveProject(args.project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const res = await listeningData(project.id, {
        q: args.q, source: args.source, sentiment: args.sentiment, language: args.language,
        kind: args.kind, days: args.days, minRelevance: args.min_relevance,
        sortBy: args.sort_by, page: args.page,
      });
      return ok(
        { total: res.total, page: res.page, page_size: res.pageSize, mentions: res.rows.map(compactMention) },
        `${res.rows.length} mentions of ${res.total} matching, page ${res.page}.`,
      );
    },
  );

  server.registerTool(
    'radar_trends',
    {
      ...info('radar_trends'),
      inputSchema: { project_id: z.number().int().optional() },
    },
    async ({ project_id }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const trends = await getTrends(project.id);
      return ok({
        trends: trends.map((t) => ({
          topic: t.topic, last_24h: t.n24, baseline: t.baseline,
          score: t.score, explanation: t.explanation,
        })),
      });
    },
  );

  server.registerTool(
    'radar_narratives',
    {
      ...info('radar_narratives'),
      inputSchema: { project_id: z.number().int().optional() },
    },
    async ({ project_id }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const narratives = await getNarratives(project.id);
      return ok({
        narratives: narratives.map((n) => ({
          title: n.title, description: n.description, stance: n.stance,
          coordinated: Boolean(n.coordinated), accounts: n.accounts, mentions: n.mentionCount,
        })),
      });
    },
  );

  server.registerTool(
    'radar_briefs',
    {
      ...info('radar_briefs'),
      inputSchema: {
        project_id: z.number().int().optional(),
        limit: z.number().int().min(1).max(30).optional().describe('How many (default 5)'),
      },
    },
    async ({ project_id, limit }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const list = await briefList(project.id);
      return ok({ briefs: list.slice(0, limit ?? 5).map((b) => ({ date: b.briefDate, content: b.content })) });
    },
  );

  const lang = async () => ((await getContentLocale()) === 'it' ? 'it' as const : 'en' as const);

  server.registerTool(
    'radar_kpis',
    {
      ...info('radar_kpis'),
      inputSchema: {
        project_id: z.number().int().optional(),
        days: z.number().int().min(1).max(365).optional().describe('Period length in days (default 30); compared with the previous period of the same length'),
      },
    },
    async ({ project_id, days }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const k = await standardKpis(project.id, days ?? 30, await lang());
      const { raw, ...rest } = k;
      void raw;
      return ok({ project: { id: project.id, name: project.name }, ...rest },
        'Values are null when not available: the reason is in "note". Reach is potential, sentiment is automatic.');
    },
  );

  server.registerTool(
    'radar_reliability',
    {
      ...info('radar_reliability'),
      inputSchema: {
        project_id: z.number().int().optional(),
        days: z.number().int().min(1).max(365).optional().describe('Same period as radar_kpis (default 30)'),
      },
    },
    async ({ project_id, days }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const k = await standardKpis(project.id, days ?? 30, await lang());
      const r = await assessReliability(project.id, k);
      return ok({
        project: { id: project.id, name: project.name },
        period: { from: k.current.from, to: k.current.to, compared_with: k.previous },
        overall: r.overall, overall_reason: r.overallReason,
        findings: r.findings, kpi_verdicts: r.verdicts,
        cannot_say: r.cannotSay, history_periods: r.historyWindows,
      }, 'Do not use KPIs marked "unusable"; disclose the "caution" ones; never write the sentences in "cannot_say".');
    },
  );

  server.registerTool(
    'radar_fact_checks',
    {
      ...info('radar_fact_checks'),
      inputSchema: {
        project_id: z.number().int().optional(),
        only_circulating: z.boolean().optional().describe('Only debunked claims still circulating'),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ project_id, only_circulating, limit }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const d = await factCheckData(project.id);
      const claims = d.claims
        .filter((c) => !only_circulating || c.signal === 'debunked-growing' || c.signal === 'debunked-circulating')
        .slice(0, limit ?? 30)
        .map((c) => ({
          claim: c.claim, claimant: c.claimant, claim_date: c.claimDate, verdict: c.verdict, signal: c.signal,
          reviews: c.reviews, circulation: c.circulation,
        }));
      return ok({
        enabled: d.enabled, total: d.total, still_circulating: d.stillCirculating,
        by_verdict: d.byVerdict, publishers: d.publishers, claims,
      }, d.enabled ? undefined : 'Fact checks are not active: a Google key with the Fact Check Tools API is needed.');
    },
  );

  server.registerTool(
    'radar_trials',
    {
      ...info('radar_trials'),
      inputSchema: { project_id: z.number().int().optional() },
    },
    async ({ project_id }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const d = await trialsData(project.id);
      if (!d.terms.length) return ok({ terms: [] }, 'This project does not follow any clinical trial terms yet (page "Clinical trials").');
      return ok({
        terms: d.terms, total: d.total, cited_in_news: d.withNews,
        by_status: d.byStatus, by_phase: d.byPhase, sponsors: d.sponsors,
        treatments: d.interventions,
        due_within_12_months: d.upcoming.map((t) => ({ nct: t.nctId, title: t.title, status: t.status, phases: t.phases, completion: t.completionDate, sponsor: t.sponsor })),
        recent: d.trials.slice(0, 30).map((t) => ({
          nct: t.nctId, title: t.title, status: t.status, phases: t.phases, sponsor: t.sponsor,
          enrollment: t.enrollment, completion: t.completionDate, has_results: t.hasResults === 1,
          news_mentions: t.news?.total ?? 0, url: `https://clinicaltrials.gov/study/${t.nctId}`,
        })),
      });
    },
  );

  server.registerTool(
    'radar_crosscheck',
    {
      ...info('radar_crosscheck'),
      inputSchema: { project_id: z.number().int().optional() },
    },
    async ({ project_id }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const d = await crossCheckData(project.id);
      return ok({
        active_sources: d.coverage,
        debunked_still_circulating: d.debunked.slice(0, 15).map((c) => ({
          claim: c.claim, verdict: c.verdict, signal: c.signal, last_7_days: c.circulation?.last7 ?? 0,
          checked_by: c.reviews.map((r) => r.publisher), sample_mention_ids: c.circulation?.sampleIds ?? [],
        })),
        debunked_mentions_this_week_upper_bound: d.debunkedWeekly,
        hot_topics: d.topics,
        hot_topics_never_checked: d.unchecked.map((t) => t.topic),
        treatments_news_ahead_of_evidence: d.trials.interventions.filter((i) => i.gap === 'hype'),
        evidence_nobody_covers: d.trials.interventions.filter((i) => i.gap === 'untold').slice(0, 15),
        recurring_shows: d.pods.shows.filter((s) => s.recurring),
      });
    },
  );

  // La libreria di prompt, come prompt del protocollo: i client MCP li
  // mostrano nel loro menù e chiedono gli argomenti.
  for (const def of MCP_PROMPTS) {
    const shape: Record<string, z.ZodTypeAny> = { project: z.string().optional().describe('Nombre o id del proyecto') };
    for (const a of def.args) {
      shape[a.name] = a.required ? z.string().describe(a.description) : z.string().optional().describe(a.description);
    }
    server.registerPrompt(
      def.name,
      { title: def.title, description: `${def.description} (${def.audience} · ${def.cadence})`, argsSchema: shape },
      (args) => ({
        description: def.description,
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: renderPrompt(def, args as Record<string, string | undefined>) },
        }],
      }),
    );
  }

  return server;
}
