import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { benchmarkEntities, projects, reviewSources, reviews } from '@/lib/db/schema';
import type { QueryPlan } from '@/lib/query-plan';

// ---------------------------------------------------------------------------
// AEDO — la competencia vive en un proyecto aparte.
//
// En Radar las menciones de los competidores comparten proyecto con la marca,
// así que Tablero, Escucha, KPI, Audiencia, Insights o Reseñas mezclaban
// ambas cosas. Aquí cada proyecto de marca tiene un proyecto "· Competencia"
// (projects.competitor_of = id de la marca) que recibe:
//   - las menciones que SOLO coinciden con consultas de tipo competidor;
//   - las fuentes de reseñas cuyo nombre no corresponde a la marca principal.
// Todas las vistas del proyecto de marca quedan solo con la marca. El
// Benchmark y el Resumen ejecutivo leen ambos proyectos para comparar, y el
// proyecto de competencia se puede abrir en el selector para explorarla.
// ---------------------------------------------------------------------------

type Project = typeof projects.$inferSelect;

export async function competitorProjectId(projectId: number): Promise<number | null> {
  const db = await getDb();
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.competitorOf, projectId));
  return row?.id ?? null;
}

/** Proyectos que se leen para comparar: la marca y, si existe, su competencia. */
export async function comparisonProjectIds(projectId: number): Promise<number[]> {
  const shadow = await competitorProjectId(projectId);
  return shadow ? [projectId, shadow] : [projectId];
}

async function ensureCompetitorProject(project: Project, labels: string[]): Promise<number> {
  const existing = await competitorProjectId(project.id);
  if (existing) return existing;
  const db = await getDb();
  const [row] = await db.insert(projects).values({
    name: `${project.name} · Competencia`,
    mode: 'listening',
    ownerId: project.ownerId,
    visibility: project.visibility,
    countries: project.countries,
    languages: project.languages,
    competitorOf: project.id,
    semanticContext: `Competidores de ${project.name}: ${labels.join(', ')}. Menciones y reseñas de estas marcas, para compararlas con ${project.name}.`,
  }).returning({ id: projects.id });
  return row.id;
}

/**
 * Mueve al proyecto de competencia lo que es solo de la competencia. Es
 * idempotente y se ejecuta en cada corrida del pipeline, después de la ingesta:
 * lo que la ingesta vuelva a insertar en la marca (porque ya no lo encuentra
 * allí) se borra si ya existe en la competencia, antes de gastar IA en ello.
 */
export async function splitCompetitorMentions(project: Project): Promise<{ moved: number; duplicates: number; reviewSources: number }> {
  if (project.competitorOf) return { moved: 0, duplicates: 0, reviewSources: 0 };
  const plan = project.queryPlan as QueryPlan | null;
  const compQueries = (plan?.queries ?? []).filter((q) => q.kind === 'competitor').map((q) => q.id);
  const db = await getDb();
  const entities = await db.select().from(benchmarkEntities)
    .where(eq(benchmarkEntities.projectId, project.id)).orderBy(benchmarkEntities.id);
  const main = entities[0];
  const sources = await db.select().from(reviewSources).where(eq(reviewSources.projectId, project.id));
  const isMainPlace = (label: string) => !main || [main.name, ...main.keywords]
    .some((k) => k && label.toLowerCase().includes(k.toLowerCase()));
  const compSources = sources.filter((s) => s.type !== 'upload' && !isMainPlace(s.label));
  if (!compQueries.length && !compSources.length) return { moved: 0, duplicates: 0, reviewSources: 0 };

  const shadow = await ensureCompetitorProject(project, entities.slice(1).map((e) => e.name));

  let moved = 0;
  let duplicates = 0;
  if (compQueries.length) {
    const list = sql.join(compQueries.map((q) => sql`${q}`), sql`, `);
    const onlyCompetitor = sql`jsonb_array_length(coalesce(query_ids, '[]'::jsonb)) > 0
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(query_ids) q WHERE q NOT IN (${list}))`;
    const del = await db.execute(sql`
      DELETE FROM mentions m
      WHERE m.project_id = ${project.id} AND ${onlyCompetitor}
        AND EXISTS (SELECT 1 FROM mentions s WHERE s.project_id = ${shadow} AND s.source = m.source AND s.external_id = m.external_id)`);
    duplicates = Number((del as { affectedRows?: number }).affectedRows ?? 0);
    const upd = await db.execute(sql`
      UPDATE mentions SET project_id = ${shadow}, story_id = NULL
      WHERE project_id = ${project.id} AND ${onlyCompetitor}`);
    moved = Number((upd as { affectedRows?: number }).affectedRows ?? 0);
  }

  if (compSources.length) {
    const ids = compSources.map((s) => s.id);
    await db.update(reviewSources).set({ projectId: shadow }).where(inArray(reviewSources.id, ids));
    await db.update(reviews).set({ projectId: shadow }).where(and(inArray(reviews.sourceId, ids)));
  }
  return { moved, duplicates, reviewSources: compSources.length };
}
