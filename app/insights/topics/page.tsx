import { getCurrentProject } from '@/lib/data';
import { topicSentimentMap } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { TopicSentimentBubble } from '@/components/insight-charts';

export const metadata = { title: 'Temas × Sentimiento' };

export default async function TopicsInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const data = await topicSentimentMap(project.id, 14);

  return (
    <>
      <PageHeader
        title={t('ins.topics.title', 'Mapa de temas × sentimiento')}
        info="Cada burbuja es un tema, ubicado según su sentimiento (izquierda–derecha) y su peso relativo (arriba–abajo); tamaño de la burbuja = volumen. Datos: las etiquetas de tema y sentimiento que la IA asigna a tus menciones. Periodo: últimos 14 días. Fuente: las menciones recopiladas en todas las fuentes activas."
        subtitle="Cada burbuja es un tema: horizontal = sentimiento, vertical = cuánto peso gana o pierde en la conversación, tamaño = volumen. Los temas que ganan importancia están arriba; los que decaen, abajo."
      />
      {data.length < 3 ? (
        <EmptyState message="Se necesitan más temas analizados por IA para construir el mapa." />
      ) : (
        <section className="panel px-4 py-5">
          <TopicSentimentBubble data={data} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-400/70" /> positivo</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400/70" /> neutro</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-red-400/70" /> negativo</span>
            <span className="ml-auto">Peso relativo: participación en la conversación en la segunda mitad frente a la primera mitad del periodo analizado.</span>
          </div>
        </section>
      )}
    </>
  );
}
