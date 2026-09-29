import { getCurrentProject } from '@/lib/data';
import { conversationGalaxy } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ConversationGalaxy } from '@/components/conversation-galaxy';

export const metadata = { title: 'Galaxia de la conversación' };

export default async function GalaxyInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const g = await conversationGalaxy(project.id, 14);

  return (
    <>
      <PageHeader
        title={t('ins.galaxy.title', 'Galaxia de la conversación')}
        info="Toda la conversación como un sistema solar: el sol es tu Índice de salud, los planetas son las fuentes (tamaño = volumen) y las tres lunas de cada planeta se dimensionan según su reparto positivo/neutro/negativo. Un cinturón exterior muestra los temas dominantes y unos cometas dorados pulsantes marcan las tendencias emergentes; ambos se pueden activar o desactivar. Datos: tus menciones analizadas, últimos 14 días, en todas las fuentes activas."
        subtitle="Tu conversación como un verdadero sistema solar (últimos 14 días). Cada planeta es una fuente, dimensionada por volumen, que orbita alrededor del sol, cuyo brillo refleja tu Índice de salud. Cada planeta tiene tres lunas de tamaño 1–10 según su reparto de sentimiento. Alrededor, un cinturón exterior de temas (lo que se comenta) y cometas dorados para las tendencias emergentes; activa o desactiva cualquier capa. Arrastra para orbitar y desplázate para acercarte."
      />
      {g.stars.length < 5 ? (
        <EmptyState message="Todavía no hay suficientes menciones para mostrar la galaxia." />
      ) : (
        <section className="panel px-4 py-4">
          <ConversationGalaxy {...g} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            <span className="text-slate-400">Constelaciones (fuentes):</span>
            {g.sources.slice(0, 10).map((s) => (
              <span key={s.id} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label} <span className="text-slate-600">{s.count}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
