import Link from 'next/link';
import { marked } from 'marked';
import { Flame, UploadCloud } from 'lucide-react';
import { dashboardData, getCurrentProject } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { PageHeader, KpiCard, MentionCard, EmptyState, fmtCompact, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { BriefFreshness } from '@/components/brief-freshness';
import { VolumeChart, SentimentPie } from '@/components/charts';

export default async function DashboardPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('dash.noProject', 'No hay ningún proyecto configurado. Ve a Proyectos para crear uno.')} />;
  const [data, trends] = await Promise.all([dashboardData(project.id), getTrends(project.id)]);

  const sentimentLabel = data.kpi.avgSentiment === null
    ? '—'
    : data.kpi.avgSentiment > 0.15 ? 'positivo' : data.kpi.avgSentiment < -0.15 ? 'negativo' : 'neutro';

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={project.mode === 'upload'
          ? 'Datos importados, analizados con todo el motor de AEDO'
          : `Monitoreando: ${project.keywords.join(', ')}`}
      />

      {project.mode === 'upload' && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.05] px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-sky-200"><UploadCloud className="size-4" /> Proyecto de importación</span>
          <span className="text-xs text-slate-400">— agrega más filas cuando quieras desde un archivo Excel/CSV.</span>
          <Link href={`/import?project=${project.id}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-sky-400">
            <UploadCloud className="size-3.5" /> Importar un archivo
          </Link>
        </div>
      )}

      {trends.length > 0 && (
        <section className="panel mb-5 border-orange-500/30 px-5 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-orange-300">
            <Flame className="size-4" /> AEDO — tendencias emergentes de las últimas 24 horas
          </h2>
          <div className="flex flex-col gap-2">
            {trends.map((t) => (
              <div key={t.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-bold text-orange-300">
                  ×{t.score.toFixed(1)}
                </span>
                <span className="font-semibold">{t.topic}</span>
                <span className="text-xs text-slate-500">
                  {t.n24} menciones en 24 h (normal {t.baseline.toFixed(1)}/día)
                </span>
                {t.explanation && <span className="w-full text-xs text-slate-400 sm:w-auto">— {t.explanation}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label={t('dash.kpi.mentions', 'Menciones (7 días)')} value={fmtCompact(data.kpi.total7)}
          exact={`${fmtNum(data.kpi.total7)} menciones`} />
        <KpiCard
          label={t('dash.kpi.sentiment', 'Sentimiento promedio')}
          value={sentimentLabel}
          hint={data.kpi.avgSentiment !== null ? `puntaje ${data.kpi.avgSentiment.toFixed(2)}` : 'pendiente de análisis'}
        />
        <KpiCard label={t('dash.kpi.sources', 'Fuentes activas')} value={String(data.kpi.sources)} />
        <KpiCard label={t('dash.kpi.topics', 'Temas detectados')} value={String(data.topTopics.length)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="panel px-5 py-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Volumen por fuente (14 días)</h2>
          {data.volumeByDay.length
            ? <VolumeChart data={data.volumeByDay.map((r) => ({ ...r, n: Number(r.n) }))} />
            : <p className="py-16 text-center text-sm text-slate-500">Sin datos: presiona “Actualizar ahora”</p>}
        </section>
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Sentimiento (7 días)</h2>
          {data.sentimentDist.length
            ? <SentimentPie data={data.sentimentDist} />
            : <p className="py-16 text-center text-sm text-slate-500">{t('dash.awaiting', 'Pendiente del análisis de IA')}</p>}
        </section>
      </div>

      {data.topTopics.length > 0 && (
        <section className="panel mt-4 px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">{t('dash.emerging', 'Temas emergentes')}</h2>
          <div className="flex flex-wrap gap-2">
            {data.topTopics.map((t) => (
              <span key={t.topic} className="rounded-full bg-sky-500/10 px-3 py-1 text-xs text-sky-300">
                {t.topic} <span className="text-sky-500/70">{fmtNum(Number(t.n))}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-300">{t('dash.latestMentions', 'Últimas menciones')}</h2>
            <Link href="/listening" className="text-xs text-sky-400 hover:text-sky-300">ver todas →</Link>
          </div>
          <div className="flex flex-col gap-2">
            {data.latest.length
              ? data.latest.map((m) => <MentionCard key={m.id} m={m} />)
              : <EmptyState message={t('dash.noMentions', 'Todavía no se han recopilado menciones.')} />}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-300">{t('dash.latestBrief', 'Último brief')}</h2>
            <Link href="/brief" className="text-xs text-sky-400 hover:text-sky-300">archivo →</Link>
          </div>
          <BriefFreshness latestDate={data.latestBrief?.briefDate ?? null} />
          {data.latestBrief ? (
            <div className="panel px-5 py-4">
              <p className="mb-2 text-xs text-slate-500">
                {new Date(data.latestBrief.briefDate).toLocaleDateString('es-CO', { dateStyle: 'full' })}
              </p>
              <div
                className="brief-md text-sm text-slate-300"
                dangerouslySetInnerHTML={{ __html: marked.parse(data.latestBrief.content) as string }}
              />
            </div>
          ) : (
            <EmptyState message="El primer brief diario se generará en la ejecución programada de la mañana (requiere la clave de API de Claude)." />
          )}
        </section>
      </div>
    </>
  );
}
