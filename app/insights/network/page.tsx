import { getCurrentProject } from '@/lib/data';
import { influencerNetwork } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { InfluencerNetwork } from '@/components/insight-charts';

export const metadata = { title: 'Red de influenciadores' };

export default async function NetworkInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const { nodes, edges, communities } = await influencerNetwork(project.id, 14);

  return (
    <>
      <PageHeader
        title={t('ins.network.title', 'Red de influenciadores')}
        info="Los autores más activos como un grafo. Tamaño del punto = engagement, color de relleno = el tema en el que más se enfocan y anillo exterior = su sentimiento promedio (verde positivo, rojo negativo). Los enlaces unen a personas que se enfocan en el mismo tema: los grupos son tus tribus temáticas. Haz clic en cualquier autor para leer sus publicaciones. Periodo: últimos 14 días, en todas las fuentes activas."
        subtitle="Las personas que impulsan la conversación (últimos 14 días). Cada punto es un autor, dimensionado por engagement, relleno según el tema en el que se enfoca y con un anillo según su sentimiento promedio. Los enlaces unen a personas alrededor del mismo tema: los grupos son las tribus que se forman en torno a cada asunto. Haz clic en cualquiera (punto o lista) para abrir sus publicaciones."
      />
      {nodes.length < 3 ? (
        <EmptyState message="Todavía no hay suficientes autores para construir la red." />
      ) : (
        <section className="panel px-4 py-5">
          <InfluencerNetwork nodes={nodes} edges={edges} communities={communities} />
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border)] pt-3 text-xs text-slate-500">
            <span className="text-slate-600">Grupos por tema:</span>
            {communities.slice(0, 8).map((c, i) => (
              <span key={c} className="flex items-center gap-1" title={`Autores enfocados en “${c}”`}>
                <span className="size-2.5 rounded-full" style={{ backgroundColor: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#22d3ee', '#c084fc'][i % 8] }} />
                {c}
              </span>
            ))}
            <span className="ml-auto">Relleno = tema · anillo = sentimiento · tamaño = engagement</span>
          </div>
        </section>
      )}
    </>
  );
}
