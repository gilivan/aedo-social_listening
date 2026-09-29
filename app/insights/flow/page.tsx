import { getCurrentProject } from '@/lib/data';
import { conversationFlow } from '@/lib/insights';
import { SOURCE_META } from '@/lib/connectors';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { SankeyFlow } from '@/components/insight-charts';

export const metadata = { title: 'Flujo de la conversación' };

const sourceColors = Object.fromEntries(
  Object.values(SOURCE_META).map((m) => [m.label, m.color]),
);

export default async function FlowInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const { nodes, links } = await conversationFlow(project.id, 14);

  return (
    <>
      <PageHeader
        title={t('ins.flow.title', 'Flujo de la conversación')}
        info="Cómo fluye la conversación de Fuente → Tema → Sentimiento; ancho de la banda = número de menciones. Datos: tus menciones analizadas. Periodo: últimos 14 días. Fuente: las menciones recopiladas en todas las fuentes activas."
        subtitle="Cómo fluye la conversación de la fuente al tema y al sentimiento (últimos 14 días). Sigue las cintas para ver de un vistazo qué fuentes impulsan qué temas y dónde se concentra la negatividad."
      />
      {nodes.length < 3 || links.length === 0 ? (
        <EmptyState message="No hay suficientes menciones analizadas por IA para construir el flujo." />
      ) : (
        <section className="panel px-4 py-5">
          <div className="mb-3 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <span>Fuente</span><span>Tema</span><span>Sentimiento</span>
          </div>
          <SankeyFlow nodes={nodes} links={links} sourceColors={sourceColors} />
          <p className="mt-3 text-xs text-slate-500">Grosor de la cinta = número de menciones. Pasa el cursor sobre un nodo para ver su total.</p>
        </section>
      )}
    </>
  );
}
