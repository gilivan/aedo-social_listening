import Link from 'next/link';
import { benchmarkData, getCurrentProject } from '@/lib/data';
import { searchInterestData } from '@/lib/search-interest';
import { PageHeader, EmptyState, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ShareOfVoicePie, BenchmarkTrend, SearchInterestTrend } from '@/components/charts';
import { entityColor, OVERFLOW_COLOR } from '@/lib/entity-colors';

export const metadata = { title: 'Benchmark' };

export default async function BenchmarkPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const [results, searchInterest] = await Promise.all([
    benchmarkData(project.id), searchInterestData(project.id),
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
