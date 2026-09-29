import { getCurrentProject } from '@/lib/data';
import { hourlyHeatmap } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { Heatmap } from '@/components/insight-charts';

export const metadata = { title: 'Mapa de calor por hora' };

export default async function HeatmapPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const grid = await hourlyHeatmap(project.id, 30);
  const total = grid.flat().reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader
        title={t('ins.heatmap.title', 'Mapa de calor por hora y día')}
        info="Cuándo ocurre la conversación, por día de la semana × hora del día (hora local); más brillante = más menciones. Datos: la hora de publicación de cada mención. Periodo: últimos 30 días. Fuente: las menciones recopiladas en todas las fuentes activas."
        subtitle="Cuándo explotan las conversaciones: intensidad por día de la semana y hora (últimos 30 días). Útil para saber cuándo monitorear y cuándo publicar."
      />
      {total === 0 ? (
        <EmptyState message="Todavía no hay menciones en el periodo." />
      ) : (
        <section className="panel px-4 py-5">
          <Heatmap grid={grid} />
        </section>
      )}
    </>
  );
}
