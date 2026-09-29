import { getCurrentProject } from '@/lib/data';
import { semanticConstellation } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { SemanticConstellation } from '@/components/insight-charts';

export const metadata = { title: 'Constelación semántica' };

export default async function ConstellationInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const { nodes, edges } = await semanticConstellation(project.id, 14);

  return (
    <>
      <PageHeader
        title={t('ins.constellation.title', 'Constelación semántica')}
        info="Los términos clave como un mapa de estrellas: tamaño = frecuencia del término, color = su sentimiento, enlaces = términos que aparecen juntos. Datos: tus menciones analizadas. Periodo: últimos 14 días. Fuente: las menciones recopiladas en todas las fuentes activas."
        subtitle="El lenguaje de la conversación como un mapa de estrellas: cada término dimensionado por frecuencia, coloreado por sentimiento y unido a los términos con los que aparece (últimos 14 días). Los grupos de estrellas conectadas revelan los encuadres recurrentes."
      />
      {nodes.length < 3 ? (
        <EmptyState message="Se necesitan más temas analizados por IA para construir la constelación." />
      ) : (
        <section className="panel px-4 py-5">
          <SemanticConstellation nodes={nodes} edges={edges} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-400/70" /> positivo</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400/70" /> neutro</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-red-400/70" /> negativo</span>
            <span className="ml-auto">Tamaño de la estrella = frecuencia · grosor de la línea = qué tan seguido aparecen juntos dos términos.</span>
          </div>
        </section>
      )}
    </>
  );
}
