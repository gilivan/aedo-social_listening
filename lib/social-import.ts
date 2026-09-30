import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { benchmarkEntities, mentions, projects } from '@/lib/db/schema';
import { compilePlan, queriesMatching, validatePlan, type QueryPlan } from '@/lib/query-plan';

// ---------------------------------------------------------------------------
// AEDO — importación de redes recorridas a mano (TikTok, X…).
//
// Para redes sin conector propio, las publicaciones y sus comentarios se
// recorren en el navegador de la persona (con su sesión) y se traen aquí en un
// paquete JSON. Cada publicación y cada comentario entra como mención, con la
// consulta del plan que le corresponde para que la separación marca /
// competencia (lib/competitor-split) y el análisis de IA funcionen igual que
// con las demás fuentes.
// ---------------------------------------------------------------------------

export type ImportComment = { id: string; text: string; createdAt?: number; likes?: number; author?: string };
export type ImportItem = {
  id: string; author?: string; nick?: string; text?: string; createdAt?: number; url?: string;
  stats?: { views?: number; likes?: number; comments?: number; shares?: number };
  /** Entidad buscada: '__brand__' para la marca principal o el nombre de un competidor. */
  entity?: string;
  comments?: ImportComment[];
};
export type ImportPackage = { network: 'tiktok' | 'x'; items: ImportItem[] };

const NET_LABEL = { tiktok: 'TikTok', x: 'X' } as const;

export async function importSocialPackage(projectId: number, pkg: ImportPackage): Promise<{ posts: number; comments: number; inserted: number }> {
  if (!pkg || !['tiktok', 'x'].includes(pkg.network) || !Array.isArray(pkg.items)) throw new Error('paquete no válido');
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error('proyecto no encontrado');
  const entities = await db.select().from(benchmarkEntities).where(eq(benchmarkEntities.projectId, projectId)).orderBy(benchmarkEntities.id);
  const plan = project.queryPlan as QueryPlan | null;
  const compiled = (() => { try { return plan ? compilePlan(validatePlan(plan).plan) : []; } catch { return []; } })();

  const brandQuery = plan?.queries.find((q) => q.kind === 'core')?.id;
  const conceptLabel = new Map((plan?.concepts ?? []).map((c) => [c.id, c.label.toLowerCase()]));
  const queryFor = (entity?: string): string[] => {
    if (!entity) return [];
    if (entity === '__brand__') return brandQuery ? [brandQuery] : [];
    const e = entity.toLowerCase();
    const q = plan?.queries.find((qq) => qq.kind === 'competitor'
      && (qq.name.toLowerCase().includes(e) || qq.all.some((cid) => (conceptLabel.get(cid) ?? '').includes(e))));
    return q ? [q.id] : [];
  };
  const entityName = (entity?: string) => (entity === '__brand__' ? entities[0]?.name : entity) ?? '';

  const net = pkg.network;
  const rows: (typeof mentions.$inferInsert)[] = [];
  const now = Date.now();
  const at = (s?: number) => (s && s > 1e9 ? new Date(s * 1000) : new Date(now));
  let posts = 0;
  let comments = 0;

  for (const it of pkg.items.slice(0, 2000)) {
    if (!it?.id) continue;
    const label = entityName(it.entity);
    const caption = (it.text ?? '').replace(/\s+/g, ' ').trim();
    const postUrl = it.url || (net === 'tiktok' && it.author ? `https://www.tiktok.com/@${it.author}/video/${it.id}` : undefined);
    const tag = (text: string) => {
      const m = compiled.length ? queriesMatching(compiled, text) : [];
      return m.length ? m : queryFor(it.entity);
    };
    if (caption) {
      const title = `${NET_LABEL[net]} @${it.author ?? ''}${label ? ` (${label})` : ''} · ${caption.slice(0, 120)}`.slice(0, 300);
      const likes = it.stats?.likes ?? 0;
      const cmts = it.stats?.comments ?? 0;
      rows.push({
        projectId, source: net, kind: 'post', externalId: `${net}-${it.id}`.slice(0, 500), url: postUrl,
        title, content: caption.slice(0, 4000), author: it.nick || it.author, authorHandle: it.author ? `@${it.author}` : undefined,
        community: it.author ? `@${it.author}` : undefined, publishedAt: at(it.createdAt), language: 'es',
        country: project.countries?.length === 1 ? project.countries[0] : undefined,
        engagement: { likes, comments: cmts, shares: it.stats?.shares ?? 0, views: it.stats?.views ?? 0 },
        engagementScore: likes + 2 * cmts + 3 * (it.stats?.shares ?? 0),
        reach: it.stats?.views ?? null,
        queryIds: tag(`${title} ${caption}`),
      } as typeof mentions.$inferInsert);
      posts++;
    }
    for (const c of (it.comments ?? []).slice(0, 200)) {
      const text = (c?.text ?? '').trim();
      if (!c?.id || !text) continue;
      const title = `Comentario en ${NET_LABEL[net]} @${it.author ?? ''}${label ? ` (${label})` : ''} · “${caption.slice(0, 90)}${caption.length > 90 ? '…' : ''}”`.slice(0, 300);
      rows.push({
        projectId, source: net, kind: 'post', externalId: `${net}c-${c.id}`.slice(0, 500), url: postUrl,
        title, content: text.slice(0, 4000), author: c.author, authorHandle: c.author ? `@${c.author}` : undefined,
        community: it.author ? `@${it.author}` : undefined, publishedAt: at(c.createdAt), language: 'es',
        country: project.countries?.length === 1 ? project.countries[0] : undefined,
        engagement: { likes: c.likes ?? 0, comments: 0 }, engagementScore: c.likes ?? 0,
        queryIds: tag(`${title} ${text}`),
      } as typeof mentions.$inferInsert);
      comments++;
    }
  }

  let inserted = 0;
  const unique = [...new Map(rows.map((r) => [r.externalId, r])).values()];
  for (let i = 0; i < unique.length; i += 100) {
    const res = await db.insert(mentions).values(unique.slice(i, i + 100)).onConflictDoNothing().returning({ id: mentions.id });
    inserted += res.length;
  }
  return { posts, comments, inserted };
}
