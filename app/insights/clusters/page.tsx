import { getCurrentProject } from '@/lib/data';
import { getClusters } from '@/lib/insights';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ClusterTreemap } from '@/components/insight-charts';
import { GenerateRefresh } from '@/components/generate-refresh';

export const metadata = { title: 'Clusters de conversación' };

const SENT_STYLE: Record<string, string> = {
  positive: 'text-emerald-400', neutral: 'text-slate-400', negative: 'text-red-400',
};

export default async function ClustersPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const clusters = await getClusters(project.id);
  const aiOn = await claudeAvailable();

  return (
    <>
      <PageHeader
        title={t('ins.clusters.title', 'Clusters de conversación')}
        info="Las familias de discurso (los encuadres) en que se divide tu conversación, dimensionadas por participación. Datos: un clustering de IA de tus temas y contenidos, actualizado a diario. Periodo: ventana reciente. Fuente: las menciones recopiladas en todas las fuentes activas (agrupación generada por IA)."
        subtitle="Las familias de discurso con las que se habla del asunto: no el tema, sino el encuadre (precio, escándalo, ironía, calidad, política, servicio al cliente…). Tamaño = peso en la conversación, color = tono."
      />
      {!clusters ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12">
          <p className="text-sm text-slate-400">
            {aiOn
              ? 'Genera el mapa de familias de discurso (una vez al día, ~2 centavos de dólar).'
              : 'Necesitas la clave de API de Claude para los clusters.'}
          </p>
          {aiOn && (
            <GenerateRefresh endpoint="/api/insights/clusters" label="Generar clusters" busyLabel="Analizando conversaciones…" />
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel px-4 py-5 lg:col-span-2">
            <ClusterTreemap clusters={clusters} />
          </section>
          <section className="panel px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Detalle por familia</h2>
            <div className="flex flex-col gap-3">
              {clusters.map((c) => (
                <div key={c.family}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium capitalize">{c.family}</span>
                    <span className={`text-xs ${SENT_STYLE[c.sentiment] ?? 'text-slate-400'}`}>{c.share}% · {c.sentiment}</span>
                  </div>
                  {c.example && <p className="mt-0.5 text-xs italic text-slate-500">«{c.example}»</p>}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <GenerateRefresh endpoint="/api/insights/clusters" label="Regenerar" busyLabel="Reanalizando…" />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
