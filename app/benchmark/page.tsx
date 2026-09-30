import Link from 'next/link';
import { benchmarkData, getCurrentProject } from '@/lib/data';
import { searchInterestData } from '@/lib/search-interest';
import { PageHeader, EmptyState, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ShareOfVoicePie, BenchmarkTrend, SearchInterestTrend } from '@/components/charts';
import { entityColor, OVERFLOW_COLOR } from '@/lib/entity-colors';
import { reviewsByPlace, socialContentByAccount } from '@/lib/aedo-benchmark';

export const metadata = { title: 'Benchmark' };

export default async function BenchmarkPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const [results, searchInterest, places, content] = await Promise.all([
    benchmarkData(project.id), searchInterestData(project.id),
    reviewsByPlace(project.id), socialContentByAccount(project.id),
  ]);
  const hasSearchInterest = searchInterest.some((s) => s.points.length > 0);

  if (results.length === 0) {
    return (
      <>
        <PageHeader title={t('page.benchmark.title', 'Benchmark')} />
        <EmptyState message={t('bench.noEntities', 'No hay entidades para comparar. Agrégalas en Proyectos (p. ej., marcas o competidores del sector).')} />
      </>
    );
  }

  const total = results.reduce((s, r) => s + r.total, 0);

  // La palette si assegna alle sole entità che compaiono davvero nei grafici.
  // Assegnandola su TUTTE le entità configurate, un progetto con dodici
  // concorrenti mandava dall'ottava in poi nel grigio di riserva: bastava che
  // tre di quelle avessero dati per ritrovarsi tre serie dello stesso grigio.
  // L'ordine resta quello di creazione (stabile), non la classifica: se cambia
  // il ranking, chi resta non cambia colore.
  const colorById = new Map(
    results.filter((r) => r.total > 0).map((r, i) => [r.entity.id, entityColor(i)]),
  );
  const colorOf = (id: number) => colorById.get(id) ?? OVERFLOW_COLOR;

  return (
    <>
      <PageHeader
        title="Benchmark"
        subtitle={t('page.benchmark.subtitle', 'Comparación de Share of Voice y sentimiento entre las entidades del sector (últimos 14 días)')}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Share of Voice</h2>
          {/* Il colore segue l'ENTITÀ (la sua posizione stabile in elenco),
              non il suo rango: se cambia la classifica, chi resta non cambia colore. */}
          <ShareOfVoicePie data={results.map((r) => ({ name: r.entity.name, value: r.total, color: colorOf(r.entity.id) }))} />
        </section>

        <section className="panel px-5 py-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Tendencia de volumen</h2>
          <BenchmarkTrend series={results.map((r) => ({ name: r.entity.name, points: r.byDay, color: colorOf(r.entity.id) }))} />
        </section>
      </div>

      {hasSearchInterest && (
        <section className="panel mt-4 px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('page.benchmark.searchInterest', 'Share of search')}</h2>
          <p className="mb-3 text-[11px] text-slate-600">
            Con qué frecuencia las personas buscan cada entidad en Google, en escala relativa entre ellas (100 = el pico entre todas). Vía la API interna de Google Trends: no oficial, sin garantías, consultada como máximo una vez al día.
          </p>
          <SearchInterestTrend series={searchInterest.filter((s) => s.points.length > 0)} />
        </section>
      )}

      {places.length > 0 && (
        <section className="panel mt-4 overflow-x-auto px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">Reputación en Google Maps</h2>
          <p className="mb-3 text-[11px] text-slate-600">Reseñas de los últimos 6 meses por lugar. Las fechas son aproximadas: Google solo dice «hace 2 meses». Agrega lugares en Reseñas.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Lugar</th>
                <th className="pb-2 text-right">Reseñas</th>
                <th className="pb-2 text-right">Promedio</th>
                <th className="pb-2 text-right">% de 1–2★</th>
                <th className="pb-2 text-right">Últimos 30 días</th>
              </tr>
            </thead>
            <tbody>
              {places.map((pl) => (
                <tr key={pl.label} className="border-b border-[var(--border)]/50 last:border-0">
                  <td className="py-2.5 font-medium">{pl.label}</td>
                  <td className="py-2.5 text-right">{fmtNum(pl.total)}</td>
                  <td className="py-2.5 text-right">{pl.total ? `${pl.avg.toFixed(2)}★` : <span className="text-slate-600">pendiente</span>}</td>
                  <td className={`py-2.5 text-right ${pl.total && pl.negative / pl.total > 0.1 ? 'text-red-400' : ''}`}>{pl.total ? `${((pl.negative / pl.total) * 100).toFixed(1)}%` : '—'}</td>
                  <td className="py-2.5 text-right text-slate-400">{pl.recent ? `${pl.recent} · ${pl.recentAvg!.toFixed(2)}★` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {content.length > 0 && (
        <section className="panel mt-4 overflow-x-auto px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">Contenido de las marcas en redes</h2>
          <p className="mb-3 text-[11px] text-slate-600">Publicaciones propias de cada cuenta en los últimos 30 días, leídas por Apify. Interacción = likes + 3 × comentarios.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Cuenta</th>
                <th className="pb-2 text-right">Publicaciones</th>
                <th className="pb-2 text-right">Likes prom.</th>
                <th className="pb-2 text-right">Comentarios prom.</th>
                <th className="pb-2 pl-4">Publicación con más interacción</th>
              </tr>
            </thead>
            <tbody>
              {content.map((a) => (
                <tr key={`${a.network}-${a.label}`} className="border-b border-[var(--border)]/50 last:border-0">
                  <td className="py-2.5 font-medium">{a.label} <span className="text-xs text-slate-500">· {a.network === 'instagram' ? 'Instagram' : 'Facebook'}</span></td>
                  <td className="py-2.5 text-right">{fmtNum(a.posts)}</td>
                  <td className="py-2.5 text-right">{fmtNum(Math.round(a.avgLikes))}</td>
                  <td className="py-2.5 text-right">{a.avgComments.toFixed(1)}</td>
                  <td className="max-w-xs truncate py-2.5 pl-4 text-xs text-slate-400">
                    {a.topUrl ? <a href={a.topUrl} target="_blank" rel="noreferrer" className="hover:text-sky-300">{(a.topCaption ?? '').slice(0, 90) || a.topUrl}</a> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel mt-4 overflow-x-auto px-5 py-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">Detalle</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2">Entidad</th>
              <th className="pb-2">Palabras clave</th>
              <th className="pb-2 text-right">Menciones</th>
              <th className="pb-2 text-right">Share of Voice</th>
              <th className="pb-2 text-right">Sentimiento prom.</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.entity.id} className="border-b border-[var(--border)]/50 last:border-0">
                <td className="py-2.5 font-medium">
                  <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: colorOf(r.entity.id) }} />
                  {r.entity.name}
                </td>
                <td className="py-2.5 text-xs text-slate-500">{r.entity.keywords.join(', ')}</td>
                <td className="py-2.5 text-right">{fmtNum(r.total)}</td>
                <td className="py-2.5 text-right">{total > 0 ? `${((r.total / total) * 100).toFixed(1)}%` : '—'}</td>
                <td className="py-2.5 text-right">
                  {r.avgSentiment === null ? <span className="text-slate-600">pendiente</span> : (
                    <span className={r.avgSentiment > 0.15 ? 'text-emerald-400' : r.avgSentiment < -0.15 ? 'text-red-400' : 'text-slate-400'}>
                      {r.avgSentiment.toFixed(2)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-600">
          Gestiona las entidades comparadas en <Link href="/settings" className="text-sky-400">Proyectos</Link>.
        </p>
      </section>
    </>
  );
}
