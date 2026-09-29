import { getCurrentProject } from '@/lib/data';
import { momentumQuadrant } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { MomentumQuadrant } from '@/components/insight-charts';

export const metadata = { title: 'Cuadrante de momentum' };

export default async function MomentumInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const points = await momentumQuadrant(project.id, 14);

  return (
    <>
      <PageHeader
        title={t('ins.momentum.title', 'Cuadrante de momentum')}
        info="Muestra cada tema según su tamaño (volumen) y qué tan rápido se mueve (aceleración). Datos: las etiquetas de tema y las fechas de publicación de tus menciones; los últimos 14 días se dividen en dos mitades para medir la aceleración. Fuente: las menciones recopiladas en todas las fuentes activas."
        subtitle="Una matriz estratégica 2×2 de temas por volumen (qué tan grandes) y aceleración (qué tan rápido se mueven), últimos 14 días. Estrellas en ascenso: grandes y aún creciendo; Emergentes: pequeños pero en auge; Estables: grandes pero planos; En declive: se están apagando."
      />
      {points.length < 3 ? (
        <EmptyState message="Se necesitan más temas analizados por IA para construir el cuadrante." />
      ) : (
        <section className="panel px-4 py-5">
          <MomentumQuadrant points={points} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-400/70" /> Estrellas en ascenso</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-sky-400/70" /> Emergentes</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-violet-400/70" /> Estables</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-red-400/70" /> En declive</span>
            <span className="ml-auto">Tamaño de la burbuja = volumen · pasa el cursor para leer una etiqueta · usa los botones de zoom cuando una esquina esté saturada.</span>
          </div>
        </section>
      )}
    </>
  );
}
