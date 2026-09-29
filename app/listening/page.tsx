import Link from 'next/link';
import { cookies } from 'next/headers';
import { getCurrentProject, listeningData } from '@/lib/data';
import { PageHeader, MentionCard, EmptyState, fmtNum } from '@/components/ui';
import { articleCoverage } from '@/lib/article-enrich';
import { getT } from '@/lib/i18n';
import { projectSources } from '@/lib/metrics-data';
import { sourceLabel } from '@/lib/source-label';
import { SearchBox } from '@/components/search-box';
import { TranslateBar } from '@/components/translate-bar';
import { translateMentions, TRANSLATE_LANGS, type Translated } from '@/lib/translate';

const SENTIMENTS = ['positive', 'neutral', 'negative'];
const PERIODS = [
  { v: 1, l: '24 horas', k: 'listening.h24' }, { v: 7, l: '7 días', k: 'listening.d7' },
  { v: 30, l: '30 días', k: 'listening.d30' }, { v: 90, l: '90 días', k: 'listening.d90' },
];

function buildQS(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const metadata = { title: 'Escucha' };

export default async function ListeningPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const sp = await searchParams;
  const semanticTerms = sp.st ? sp.st.split('|').filter(Boolean) : undefined;
  const filters = {
    source: sp.fonte, sentiment: sp.sentiment, language: sp.lingua,
    q: sp.q, days: sp.giorni ? Number(sp.giorni) : undefined,
    page: sp.pagina ? Number(sp.pagina) : 1,
    semanticTerms,
    minRelevance: sp.rilevanza ? Number(sp.rilevanza) : undefined,
    author: sp.autore,
    authors: sp.autori ? sp.autori.split('|').filter(Boolean) : undefined,
    ids: sp.ids ? sp.ids.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0) : undefined,
    kind: (sp.tipo === 'article' || sp.tipo === 'post' ? sp.tipo : undefined) as 'article' | 'post' | undefined,
    sortBy: (sp.ordina as 'data' | 'engagement' | 'rilevanza' | undefined) ?? 'data',
    queryId: sp.query,
  };
  const planQueries = (project.queryPlan?.queries ?? []).filter((q) => q.enabled);
  const data = await listeningData(project.id, filters);
  const coverage = await articleCoverage(project.id);
  // Le fonti del FILTRO sono quelle che il progetto contiene davvero: un
  // progetto nato da file ha 'linkedin' o 'instagram-feed', che nell'elenco
  // dei connettori non esistono e restavano invisibili.
  const sources = await projectSources(project.id);

  // Reading language chosen by the user: translates the current page (cached in DB)
  const readLang = (await cookies()).get('sr_translate')?.value ?? null;
  const translations: Map<number, Translated> = readLang
    ? await translateMentions(data.rows, readLang)
    : new Map();

  const current = {
    fonte: sp.fonte, sentiment: sp.sentiment, lingua: sp.lingua, q: sp.q, st: sp.st,
    giorni: sp.giorni, rilevanza: sp.rilevanza, autore: sp.autore, autori: sp.autori, ids: sp.ids,
    tipo: sp.tipo,
    ordina: sp.ordina,
    query: sp.query,
  };
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <>
      <PageHeader title={t('page.listening.title', 'Escucha')} subtitle={`${fmtNum(data.total)} ${t('listening.found', 'menciones encontradas')}`} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <div className="mr-2"><SearchBox /></div>
        <TranslateBar current={readLang} langs={TRANSLATE_LANGS} />
        {semanticTerms && (
          <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-violet-300"
            title={semanticTerms.join(', ')}>
            ✨ búsqueda semántica: {semanticTerms.length} términos
          </span>
        )}

        <FilterGroup label={t('ui.kind', 'Tipo')} items={[
          { value: 'article', label: t('ui.articles', 'artículos') },
          { value: 'post', label: t('ui.posts', 'publicaciones') },
        ]} param="tipo" current={current} />
        {planQueries.length > 0 && (
          <FilterGroup label="Consulta" items={planQueries.map((q) => ({ value: q.id, label: q.name }))}
            param="query" current={current} />
        )}
        <FilterGroup label={t('ui.source', 'Fuente')} items={sources.map((s) => ({ value: s.id, label: sourceLabel(s.id) }))}
          param="fonte" current={current} />
        <FilterGroup label={t('ui.sentiment', 'Sentimiento')} items={SENTIMENTS.map((s) => ({ value: s, label: ({ positive: 'positivo', neutral: 'neutral', negative: 'negativo' } as Record<string, string>)[s] ?? s }))}
          param="sentiment" current={current} />
        <FilterGroup label={t('ui.period', 'Periodo')} items={PERIODS.map((p) => ({ value: String(p.v), label: t(p.k, p.l) }))}
          param="giorni" current={current} />
        <FilterGroup label={t('ui.language', 'Idioma')} items={data.languages.map((l) => ({ value: l.language!, label: l.language!.toUpperCase() }))}
          param="lingua" current={current} />
        <FilterGroup label={t('ui.relevance', 'Relevancia')} items={[{ value: '4', label: '★ ≥ 4' }, { value: '5', label: '★ 5' }]}
          param="rilevanza" current={current} />
        <FilterGroup label={t('ui.sort', 'Ordenar')} items={[
          { value: 'engagement', label: 'engagement' }, { value: 'rilevanza', label: 'relevancia' },
        ]} param="ordina" current={current} />
        {sp.fonte && sources.some((s) => s.id === sp.fonte) && (
          <Link href={`/source/${sp.fonte}`}
            className="flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 font-semibold text-sky-300 transition hover:bg-sky-500/25"
            title={`Análisis completo del canal ${sourceLabel(sp.fonte)}: volumen, sentimiento, temas y autores comparados con todo el proyecto`}>
            {/* Il nome va preso dal vocabolario, non dal catalogo dei connettori:
                una fonte arrivata da un foglio Excel non ha una voce lì, e
                leggerla faceva cadere l'intera pagina. */}
            🔬 {t('listening.deepdive', 'Análisis a fondo')} {sourceLabel(sp.fonte)} →
          </Link>
        )}
        {sp.autore && (
          <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-300">
            autor: {sp.autore}
          </span>
        )}
        {sp.ids && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300">
            un conjunto específico de {filters.ids?.length ?? 0} publicaciones (de una narrativa)
          </span>
        )}
        {sp.autori && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300">
            publicaciones de {filters.authors?.length ?? 0} cuentas (de una narrativa)
          </span>
        )}

        {(sp.query || sp.tipo || sp.fonte || sp.sentiment || sp.lingua || sp.q || sp.st || sp.giorni || sp.rilevanza || sp.autore || sp.autori || sp.ids || sp.ordina) && (
          <Link href="/listening"
            className="flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-3.5 py-1.5 font-semibold text-sky-300 transition hover:bg-sky-500/25">
            ↺ {t('ui.showAll', 'Ver todo')}
          </Link>
        )}
      </div>

      {/* Copertura del testo pieno: senza questa riga, un progetto alimentato
          solo da Google News sembrerebbe semplicemente rotto. */}
      {coverage.articles > 0 && (
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          <span className="text-slate-400">
            {fmtNum(coverage.withText)} de {fmtNum(coverage.articles)} artículos se pueden leer completos aquí.
          </span>
          {coverage.opaque > 0 && (
            <> {fmtNum(coverage.opaque)} vienen de Google News, cuyos enlaces no llevan al editor,
              así que su texto no se puede recuperar: agrega el feed RSS de ese medio en Proyectos para obtener las piezas completas.</>
          )}
          {coverage.withText === 0 && coverage.opaque < coverage.articles && (
            <> La extracción corre con el ciclo diario: pulsa “Actualizar ahora” para traerlos de inmediato.</>
          )}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {data.rows.length
          ? data.rows.map((m) => (
              <MentionCard key={m.id} m={m} translated={translations.get(m.id)}
                highlight={semanticTerms ?? (sp.q ? [sp.q] : [])} keywords={project.keywords} />
            ))
          : <EmptyState message={t('listening.noMentions', 'No hay menciones con estos filtros.')} />}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {data.page > 1 && (
            <Link className="text-sky-400 hover:text-sky-300" href={`/listening${buildQS({ ...current, pagina: data.page - 1 })}`}>← {t('ui.previous', 'anterior')}</Link>
          )}
          <span className="text-slate-500">{t('ui.page', 'página')} {data.page} {t('ui.of', 'de')} {totalPages}</span>
          {data.page < totalPages && (
            <Link className="text-sky-400 hover:text-sky-300" href={`/listening${buildQS({ ...current, pagina: data.page + 1 })}`}>{t('ui.next', 'siguiente')} →</Link>
          )}
        </div>
      )}
    </>
  );
}

function FilterGroup({ label, items, param, current }: {
  label: string;
  items: { value: string; label: string }[];
  param: string;
  current: Record<string, string | undefined>;
}) {
  const active = current[param];
  return (
    <span className="flex items-center gap-1">
      <span className="text-slate-500">{label}:</span>
      {items.map((it) => {
        const isActive = active === it.value;
        const next = { ...current, [param]: isActive ? undefined : it.value };
        return (
          <Link
            key={it.value}
            href={`/listening${buildQS(next)}`}
            className={`rounded-full px-2.5 py-1 transition ${
              isActive ? 'bg-sky-500/20 text-sky-300' : 'bg-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </span>
  );
}
