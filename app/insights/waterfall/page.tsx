import { getCurrentProject } from '@/lib/data';
import { sentimentWaterfall } from '@/lib/insights';
import { PageHeader, EmptyState, SentimentBadge } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { SentimentWaterfall } from '@/components/insight-charts';
import { ExternalLink } from 'lucide-react';

export const metadata = { title: 'Cascada de sentimiento' };

export default async function WaterfallPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const { steps, swings } = await sentimentWaterfall(project.id, 14);

  return (
    <>
      <PageHeader
        title={t('ins.waterfall.title', 'Cascada de sentimiento')}
        info="Muestra cómo se movió el sentimiento día a día: cada barra es el neto del día (publicaciones positivas − negativas) y la línea es el saldo acumulado. Datos: la etiqueta de sentimiento de cada mención. Periodo: últimos 14 días. Fuente: las menciones recopiladas en todas las fuentes activas."
        subtitle="Cómo se movió el sentimiento día a día: las barras verdes/rojas son el aporte neto de cada día y la línea azul, el saldo acumulado. Abajo, el contenido que más pesó en los días de quiebre."
      />
      {steps.length < 2 ? (
        <EmptyState message="Se necesitan más días de datos con sentimiento analizado." />
      ) : (
        <>
          <section className="panel px-4 py-5">
            <SentimentWaterfall steps={steps} />
            <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-emerald-400/80" /> barra verde = ese día hubo más publicaciones positivas que negativas</span>
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-red-400/80" /> barra roja = más negativas que positivas</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded bg-sky-400" /> línea azul = saldo acumulado desde el inicio del periodo</span>
              <span className="ml-auto text-slate-600">Pasa el cursor sobre cualquier día para ver las cifras exactas.</span>
            </div>
          </section>
          {swings.length > 0 && (
            <section className="panel mt-4 px-5 py-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-300">Qué movió el sentimiento</h2>
              <div className="flex flex-col gap-2.5">
                {swings.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0 text-xs text-slate-500">{new Date(s.day).toLocaleDateString('es-CO')}</span>
                    <SentimentBadge sentiment={s.sentiment} />
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-1 text-slate-300 hover:text-sky-300">
                        <span className="truncate">{s.title}</span>
                        <ExternalLink className="size-3 shrink-0 text-slate-600" />
                      </a>
                    ) : <span className="truncate text-slate-300">{s.title}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
