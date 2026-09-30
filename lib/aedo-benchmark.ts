import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { comparisonProjectIds } from '@/lib/competitor-split';

// AEDO — comparaciones que no salen de las menciones: reputación en Google Maps
// (reseñas por lugar) y rendimiento del contenido propio de cada marca en redes
// (publicaciones leídas por Apify).

export type PlaceReputation = {
  label: string; total: number; avg: number; negative: number; recent: number; recentAvg: number | null;
};

export async function reviewsByPlace(projectId: number, days = 180): Promise<PlaceReputation[]> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const recent = new Date(Date.now() - 30 * 86400_000).toISOString();
  const ids = sql.join((await comparisonProjectIds(projectId)).map((i) => sql`${i}`), sql`, `);
  const res = await db.execute(sql`
    SELECT rs.label,
      count(r.id)::int AS total,
      avg(r.rating)::float AS avg,
      count(r.id) FILTER (WHERE r.rating <= 2)::int AS negative,
      count(r.id) FILTER (WHERE r.published_at >= ${recent}::timestamptz)::int AS recent,
      avg(r.rating) FILTER (WHERE r.published_at >= ${recent}::timestamptz)::float AS recent_avg
    FROM review_sources rs
    LEFT JOIN reviews r ON r.source_id = rs.id AND r.published_at >= ${since}::timestamptz
    WHERE rs.project_id IN (${ids})
    GROUP BY rs.id, rs.label
    ORDER BY total DESC`);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    label: String(r.label), total: Number(r.total), avg: Number(r.avg ?? 0), negative: Number(r.negative),
    recent: Number(r.recent), recentAvg: r.recent_avg == null ? null : Number(r.recent_avg),
  }));
}

export type AccountContent = {
  network: string; label: string; posts: number; avgLikes: number; avgComments: number;
  topUrl: string | null; topCaption: string | null; topEngagement: number;
};

export async function socialContentByAccount(projectId: number, days = 30): Promise<AccountContent[]> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const res = await db.execute(sql`
    SELECT network, label, count(*)::int AS posts,
      avg(likes)::float AS avg_likes, avg(comments)::float AS avg_comments,
      (array_agg(url ORDER BY likes + comments * 3 DESC))[1] AS top_url,
      (array_agg(caption ORDER BY likes + comments * 3 DESC))[1] AS top_caption,
      max(likes + comments * 3)::int AS top_eng
    FROM social_posts
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    GROUP BY network, label
    ORDER BY network, avg(likes + comments * 3) DESC`);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    network: String(r.network), label: String(r.label), posts: Number(r.posts),
    avgLikes: Number(r.avg_likes ?? 0), avgComments: Number(r.avg_comments ?? 0),
    topUrl: (r.top_url as string) ?? null, topCaption: (r.top_caption as string) ?? null, topEngagement: Number(r.top_eng ?? 0),
  }));
}
