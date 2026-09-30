import type { Connector, RawMention } from './types';
import { booleanQuery } from './types';
import { truncate } from './util';
import { cfg } from '@/lib/connector-config';

// AEDO — Web y blogs: páginas públicas de toda la web (blogs, portales locales,
// foros, TripAdvisor, sitios de noticias pequeños que Google News no indexa)
// encontradas con el índice de búsqueda de Tavily. Usa la misma clave que
// "LinkedIn (web)" (TAVILY_API_KEY; plan gratuito de 1.000 búsquedas/mes).
//
// Las redes sociales se excluyen: cada una tiene su propio conector, y aquí
// solo llegarían fragmentos sin métricas que duplicarían esa conversación.

type TavilyResult = { title?: string; url?: string; content?: string; published_date?: string };

const EXCLUDED = [
  'linkedin.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com',
  'youtube.com', 'pinterest.com', 'threads.net',
];

// Tavily acepta el nombre del país en inglés para priorizar resultados locales.
const COUNTRY_NAME: Record<string, string> = {
  CO: 'colombia', MX: 'mexico', AR: 'argentina', CL: 'chile', PE: 'peru', EC: 'ecuador',
  VE: 'venezuela', PA: 'panama', CR: 'costa rica', GT: 'guatemala', DO: 'dominican republic',
  US: 'united states', ES: 'spain', BR: 'brazil', UY: 'uruguay', PY: 'paraguay', BO: 'bolivia',
};

export const web: Connector = {
  id: 'web',
  label: 'Web y blogs',
  tier: 'freekey',
  enabled: () => Boolean(cfg('TAVILY_API_KEY')),
  disabledReason: 'Requiere la clave gratuita de Tavily (la misma de LinkedIn web): ingrésala en LinkedIn (web)',
  async fetchMentions(q) {
    const query = booleanQuery({ ...q, excludeTerms: q.excludeTerms.slice(0, 8) });
    if (!query) return [];
    const country = q.countries.length === 1 ? COUNTRY_NAME[q.countries[0].toUpperCase()] : undefined;

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg('TAVILY_API_KEY')}` },
      body: JSON.stringify({
        query: truncate(query, 390),
        topic: 'general',
        time_range: 'month',
        max_results: 20,
        search_depth: 'basic',
        exclude_domains: EXCLUDED,
        ...(country ? { country } : {}),
      }),
      signal: AbortSignal.timeout(25000),
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) {
      let reason = '';
      try {
        const body = JSON.parse(text) as { detail?: { error?: string } | string; error?: string };
        reason = typeof body.detail === 'string' ? body.detail : body.detail?.error ?? body.error ?? '';
      } catch { /* cuerpo no JSON */ }
      throw new Error(`Tavily HTTP ${res.status}${reason ? `: ${truncate(reason, 200)}` : ''}`);
    }
    const data = JSON.parse(text) as { results?: TavilyResult[] };

    const out: RawMention[] = [];
    for (const r of data.results ?? []) {
      if (!r.url) continue;
      let host = '';
      try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch { continue; }
      if (EXCLUDED.some((d) => host === d || host.endsWith(`.${d}`))) continue;
      const pub = r.published_date ? new Date(r.published_date) : null;
      const content = truncate(r.content ?? '', 1200);
      if (!content && !r.title) continue;
      out.push({
        source: 'web',
        externalId: r.url,
        url: r.url,
        title: truncate(r.title ?? host, 300),
        content: content || truncate(r.title ?? '', 300),
        community: host,
        // Sin fecha publicada (páginas estáticas, reseñas) se usa la fecha de hallazgo.
        publishedAt: pub && !Number.isNaN(pub.getTime()) ? pub : new Date(),
      });
    }
    return out;
  },
};
