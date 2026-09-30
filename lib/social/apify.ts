import { getDb, getMeta, setMeta } from '@/lib/db';
import { mentions, type projects } from '@/lib/db/schema';
import { cfg } from '@/lib/connector-config';
import { compilePlan, queriesMatching, validatePlan, type QueryPlan } from '@/lib/query-plan';

// ---------------------------------------------------------------------------
// Instagram y Facebook vía Apify (extractores oficiales de Apify).
//
// Por qué Apify: Meta no deja leer comentarios de cuentas de terceros con su
// API, y leerlos con una cuenta propia expone esa cuenta a bloqueos. Apify
// corre los extractores en su infraestructura; AEDO solo necesita un token.
//
// Qué se escucha: los COMENTARIOS del público en las publicaciones de las
// cuentas configuradas en el proyecto (la marca y sus competidores). Cada
// comentario entra como una mención; el título lleva el nombre de la cuenta
// para que el benchmark lo atribuya a la entidad correcta.
//
// Costo bajo control:
//  - primera carga: publicaciones de los últimos APIFY_FIRST_DAYS (60) días;
//  - después: publicaciones de los últimos 14 días (siguen recibiendo
//    comentarios) y comentarios solo de las publicaciones cuyo contador de
//    comentarios subió desde la última vez;
//  - cada ejecución en Apify lleva un tope de gasto (APIFY_MAX_USD_PER_RUN, 3 USD).
// ---------------------------------------------------------------------------

export type SocialNetwork = 'instagram' | 'facebook';
export type SocialAccount = { network: SocialNetwork; handle: string; label: string };

const API = 'https://api.apify.com/v2';
const ACTORS = {
  igPosts: 'apify~instagram-post-scraper',
  igComments: 'apify~instagram-comment-scraper',
  fbPosts: 'apify~facebook-posts-scraper',
  fbComments: 'apify~facebook-comments-scraper',
} as const;

export function apifyEnabled(): boolean {
  return Boolean(cfg('APIFY_TOKEN'));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

/** "@usuario", "usuario" o una URL de perfil → "usuario". */
export function igUsername(raw: string): string {
  const s = raw.trim();
  const m = s.match(/instagram\.com\/([^/?#]+)/i);
  return (m ? m[1] : s).replace(/^@/, '').replace(/\/+$/, '').toLowerCase();
}

/** URL de página de Facebook (o su nombre corto) → URL completa. */
export function fbPageUrl(raw: string): string {
  const s = raw.trim().replace(/#.*$/, '');
  if (/^https?:\/\//i.test(s)) {
    // Páginas sin nombre corto: https://www.facebook.com/profile.php?id=123 (se conserva el id)
    const id = s.match(/profile\.php\?(?:.*&)?id=(\d+)/i)?.[1];
    if (id) return `https://www.facebook.com/profile.php?id=${id}`;
    return s.replace(/[?].*$/, '').replace(/\/+$/, '') + '/';
  }
  return `https://www.facebook.com/${s.replace(/^@/, '').replace(/\/+$/, '')}/`;
}

/** Forma comparable de una URL de Facebook (conserva el id de profile.php). */
function fbKeyOf(u?: string): string {
  if (!u) return '';
  const id = u.match(/profile\.php\?(?:.*&)?id=(\d+)/i)?.[1] ?? u.match(/facebook\.com\/(\d{8,})/)?.[1];
  if (id) return `id:${id}`;
  return u.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^https?:\/\/(www\.|m\.)?/i, '').toLowerCase();
}

/** Líneas "cuenta | Nombre" → cuentas limpias (sin duplicados). */
export function parseAccounts(network: SocialNetwork, text: string): SocialAccount[] {
  const out = new Map<string, SocialAccount>();
  for (const line of text.split(/\r?\n/)) {
    const [rawHandle, ...rest] = line.split('|');
    if (!rawHandle?.trim()) continue;
    const handle = network === 'instagram' ? igUsername(rawHandle) : fbPageUrl(rawHandle);
    if (!handle || handle.length > 200) continue;
    const label = rest.join('|').trim() || (network === 'instagram' ? `@${handle}` : handle);
    out.set(`${network}|${handle}`, { network, handle, label: label.slice(0, 80) });
  }
  return [...out.values()].slice(0, 20);
}

// ── Cliente mínimo de la API de Apify ─────────────────────────────────────

async function runActor<T>(actor: string, input: unknown, log: (m: string) => void): Promise<T[]> {
  const token = cfg('APIFY_TOKEN');
  if (!token) throw new Error('Falta el token de Apify (Ajustes → Fuentes).');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const maxUsd = Number(cfg('APIFY_MAX_USD_PER_RUN') ?? '') || 3;

  const start = await fetch(`${API}/acts/${actor}/runs?maxTotalChargeUsd=${maxUsd}`, {
    method: 'POST', headers, body: JSON.stringify(input),
  });
  if (!start.ok) {
    const body = (await start.text()).slice(0, 300);
    throw new Error(`Apify ${actor}: HTTP ${start.status} ${body}`);
  }
  const run = (await start.json()).data as { id: string; status: string; defaultDatasetId: string };
  let status = run.status;
  const deadline = Date.now() + 20 * 60_000;
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
    if (Date.now() > deadline) throw new Error(`Apify ${actor}: la ejecución tardó más de 20 minutos`);
    await sleep(5000);
    const r = await fetch(`${API}/actor-runs/${run.id}`, { headers });
    status = ((await r.json()).data as { status: string }).status;
  }
  if (status !== 'SUCCEEDED') log(`Apify ${actor}: la ejecución terminó en ${status}; se usa lo que alcanzó a traer`);

  const items = await fetch(`${API}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, { headers });
  if (!items.ok) throw new Error(`Apify ${actor}: no se pudieron leer los resultados (HTTP ${items.status})`);
  return (await items.json()) as T[];
}

// ── Tipos de salida de los extractores (solo los campos usados) ───────────

type IgPost = {
  url?: string; shortCode?: string; caption?: string; timestamp?: string;
  commentsCount?: number; likesCount?: number; ownerUsername?: string; inputUrl?: string;
};
type IgComment = {
  id?: string; text?: string; ownerUsername?: string; timestamp?: string;
  likesCount?: number; repliesCount?: number; postUrl?: string; inputUrl?: string; url?: string;
};
type FbPost = {
  url?: string; postId?: string; text?: string; time?: string; timestamp?: number;
  likes?: number; comments?: number; shares?: number; pageName?: string; facebookUrl?: string; inputUrl?: string;
};
type FbComment = {
  id?: string; text?: string; date?: string; profileName?: string; profileUrl?: string;
  likesCount?: number | string; postUrl?: string; facebookUrl?: string; inputUrl?: string; commentUrl?: string;
};

const igCode = (u?: string) => u?.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|tv)\/([^/?#]+)/i)?.[1];
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

type Row = typeof mentions.$inferInsert;

function title(acc: SocialAccount, caption: string | undefined): string {
  const who = acc.network === 'instagram' ? `@${acc.handle}` : acc.label;
  const cap = (caption ?? '').replace(/\s+/g, ' ').trim();
  return `Comentario en ${who} (${acc.label})${cap ? ` · “${cap.slice(0, 90)}${cap.length > 90 ? '…' : ''}”` : ''}`.slice(0, 300);
}

// ── Ingesta por proyecto ──────────────────────────────────────────────────

export async function ingestSocialApify(
  project: typeof projects.$inferSelect,
  log: (m: string) => void = (m) => console.log(`[apify] ${m}`),
): Promise<{ tried: number; inserted: number; errors: string[] }> {
  const accounts = ((project as { socialAccounts?: SocialAccount[] }).socialAccounts ?? []);
  if (!accounts.length || !apifyEnabled()) return { tried: 0, inserted: 0, errors: [] };

  const now = new Date();
  const firstDays = Number(cfg('APIFY_FIRST_DAYS') ?? '') || 60;
  const lastKey = `apify_last_run:${project.id}`;
  const lastIso = await getMeta<string>(lastKey);
  const last = lastIso ? new Date(lastIso) : null;
  const floor = new Date(now.getTime() - firstDays * DAY);
  // Publicaciones: en la primera carga, todo el periodo; después, las de los últimos 14 días.
  const postsSince = last ? new Date(Math.max(floor.getTime(), now.getTime() - 14 * DAY)) : floor;
  // Comentarios: desde un día antes de la última ejecución (margen), o todo el periodo la primera vez.
  const commentsSince = last ? new Date(Math.max(floor.getTime(), last.getTime() - DAY)) : floor;

  const compiled = (() => {
    try { return project.queryPlan ? compilePlan(validatePlan(project.queryPlan as QueryPlan).plan) : null; } catch { return null; }
  })();
  const rows: Row[] = [];
  const errors: string[] = [];
  const countKey = (code: string) => `apify_cc:${project.id}:${code}`;

  const push = (acc: SocialAccount, r: {
    id: string; text: string; author?: string; handle?: string; at: Date; url?: string;
    likes: number; replies: number; caption?: string;
  }) => {
    if (!r.text.trim() || Number.isNaN(r.at.getTime()) || r.at < commentsSince || r.at > new Date(now.getTime() + 3600_000)) return;
    const t = title(acc, r.caption);
    rows.push({
      projectId: project.id,
      source: acc.network,
      kind: 'post',
      externalId: `${acc.network === 'instagram' ? 'igc' : 'fbc'}-${r.id}`.slice(0, 500),
      url: r.url,
      title: t,
      content: r.text.slice(0, 4000),
      author: r.author,
      authorHandle: r.handle,
      community: acc.network === 'instagram' ? `@${acc.handle}` : acc.label,
      publishedAt: r.at,
      language: 'es',
      country: project.countries?.length === 1 ? project.countries[0] : undefined,
      engagement: { likes: r.likes, comments: r.replies },
      engagementScore: r.likes + 2 * r.replies,
      queryIds: compiled ? queriesMatching(compiled, `${t} ${r.text}`) : [],
    } as Row);
  };

  // ── Instagram ──
  const ig = accounts.filter((a) => a.network === 'instagram');
  if (ig.length) {
    try {
      const posts = await runActor<IgPost>(ACTORS.igPosts, {
        username: ig.map((a) => a.handle),
        onlyPostsNewerThan: ymd(postsSince),
        resultsLimit: 100,
        skipPinnedPosts: false,
      }, log);
      log(`Instagram: ${posts.length} publicaciones desde ${ymd(postsSince)}`);
      const byCode = new Map<string, { post: IgPost; acc: SocialAccount }>();
      const toFetch: string[] = [];
      for (const p of posts) {
        const code = p.shortCode ?? igCode(p.url);
        const owner = (p.ownerUsername ?? igUsername(p.inputUrl ?? '')).toLowerCase();
        const acc = ig.find((a) => a.handle === owner);
        if (!code || !acc || !p.url) continue;
        byCode.set(code, { post: p, acc });
        const prev = (await getMeta<number>(countKey(code))) ?? 0;
        if (num(p.commentsCount) > prev) toFetch.push(p.url);
      }
      if (toFetch.length) {
        const comments = await runActor<IgComment>(ACTORS.igComments, {
          directUrls: toFetch, resultsLimit: 150, includeNestedComments: false,
        }, log);
        log(`Instagram: ${comments.length} comentarios de ${toFetch.length} publicaciones con comentarios nuevos`);
        for (const c of comments) {
          const code = igCode(c.postUrl ?? c.inputUrl ?? c.url);
          const ctx = code ? byCode.get(code) : undefined;
          if (!ctx || !c.id || !c.text) continue;
          push(ctx.acc, {
            id: c.id, text: c.text, author: c.ownerUsername, handle: c.ownerUsername ? `@${c.ownerUsername}` : undefined,
            at: new Date(c.timestamp ?? ''), url: ctx.post.url, likes: num(c.likesCount), replies: num(c.repliesCount),
            caption: ctx.post.caption,
          });
        }
        for (const [code, { post }] of byCode) await setMeta(countKey(code), num(post.commentsCount));
      } else {
        log('Instagram: sin comentarios nuevos');
      }
    } catch (e) {
      errors.push(`Instagram: ${(e as Error).message}`);
    }
  }

  // ── Facebook ──
  const fb = accounts.filter((a) => a.network === 'facebook').map((a) => ({ ...a, handle: fbPageUrl(a.handle) }));
  if (fb.length) {
    try {
      const posts = await runActor<FbPost>(ACTORS.fbPosts, {
        startUrls: fb.map((a) => ({ url: a.handle })),
        onlyPostsNewerThan: ymd(postsSince),
        resultsLimit: 60,
      }, log);
      log(`Facebook: ${posts.length} publicaciones desde ${ymd(postsSince)}`);
      const norm = (u?: string) => (u ?? '').replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
      const withComments = posts.filter((p) => p.url && num(p.comments) > 0);
      const accFor = (p: FbPost) => {
        const src = fbKeyOf(p.inputUrl ?? p.facebookUrl);
        return fb.find((a) => fbKeyOf(a.handle) === src) ?? (fb.length === 1 ? fb[0] : undefined);
      };
      if (withComments.length) {
        const comments = await runActor<FbComment>(ACTORS.fbComments, {
          startUrls: withComments.map((p) => ({ url: p.url })),
          onlyCommentsNewerThan: ymd(commentsSince),
          resultsLimit: Math.min(3000, 150 * withComments.length),
          includeNestedComments: false,
          viewOption: 'RECENT_ACTIVITY',
        }, log);
        log(`Facebook: ${comments.length} comentarios de ${withComments.length} publicaciones`);
        for (const c of comments) {
          // inputUrl es exactamente la URL de publicación que se le pasó al extractor.
          const cands = [c.inputUrl, c.postUrl, c.facebookUrl].filter(Boolean).map((u) => norm(u));
          const post = withComments.find((p) => cands.includes(norm(p.url)));
          const acc = post ? accFor(post) : undefined;
          if (!post || !acc || !c.id || !c.text) continue;
          push(acc, {
            id: c.id, text: c.text, author: c.profileName, at: new Date(c.date ?? ''),
            url: c.commentUrl ?? post.url, likes: num(c.likesCount), replies: 0, caption: post.text,
          });
        }
      } else {
        log('Facebook: ninguna publicación con comentarios en el periodo');
      }
    } catch (e) {
      errors.push(`Facebook: ${(e as Error).message}`);
    }
  }

  // ── Guardar ──
  let inserted = 0;
  if (rows.length) {
    const db = await getDb();
    const unique = [...new Map(rows.map((r) => [`${r.source}|${r.externalId}`, r])).values()];
    for (let i = 0; i < unique.length; i += 100) {
      const res = await db.insert(mentions).values(unique.slice(i, i + 100)).onConflictDoNothing().returning({ id: mentions.id });
      inserted += res.length;
    }
  }
  // Solo se avanza la marca de tiempo si al menos una red funcionó.
  if (errors.length < (ig.length ? 1 : 0) + (fb.length ? 1 : 0)) await setMeta(lastKey, now.toISOString());
  for (const e of errors) log(`ERROR ${e}`);
  log(`${inserted} comentarios nuevos guardados`);
  return { tried: accounts.length, inserted, errors };
}
