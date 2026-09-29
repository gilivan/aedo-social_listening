import Link from 'next/link';
import { getCurrentProject } from '@/lib/data';
import { sovOverTime } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ShareOfVoiceStream } from '@/components/insight-charts';

export const metadata = { title: 'Share of Voice' };

export default async function SovInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const { entities, days } = await sovOverTime(project.id, 30);
  const hasData = entities.length > 0 && days.some((d) => entities.some((e) => Number(d[e]) > 0));

  const COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#22d3ee', '#c084fc'];
  const totals = entities.map((e, i) => ({
    name: e, color: COLORS[i % COLORS.length],
    total: days.reduce((s, d) => s + Number(d[e] ?? 0), 0),
  }));
  const grand = totals.reduce((s, t) => s + t.total, 0) || 1;
  const ranked = [...totals].sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(1, ...totals.map((t) => t.total));

  return (
    <>
      <PageHeader
        title={t('ins.sov.title', 'Share of Voice en el tiempo')}
        info="Cómo se mueve en el tiempo la presencia de cada entidad en la conversación. Modo Volumen: menciones absolutas por día, apiladas; ves los picos reales. Modo Participación: cada día normalizado al 100 %; ves quién gana terreno. Datos: menciones que coinciden con tus entidades de benchmark, últimos 30 días, en todas las fuentes activas."
        subtitle="Qué parte de la conversación le pertenece a cada entidad en los últimos 30 días. Las barras de arriba son los totales de 30 días; el gráfico de abajo muestra el movimiento día a día. Alterna entre Volumen (menciones absolutas, los picos y caídas reales) y Participación (cada día como 100 %, quién gana terreno). Pasa el cursor sobre cualquier banda para ver las menciones y el porcentaje de ese día."
      />
      {entities.length === 0 ? (
        <EmptyState message="Agrega entidades de benchmark (marcas/competidores) en Configuración para ver el Share of Voice." />
      ) : !hasData ? (
        <EmptyState message="Ninguna mención coincidió con tus entidades en los últimos 30 días." />
      ) : (
        <section className="panel px-4 py-5">
          {/* Riepilogo complessivo esplicito (30 giorni) */}
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-white/[0.02] px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Share of Voice total · últimos 30 días</p>
            <div className="flex flex-col gap-2">
              {ranked.map((t) => (
                <div key={t.name} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 truncate text-slate-300">{t.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-700/40">
                    <div className="h-full rounded-full" style={{ width: `${(t.total / maxTotal) * 100}%`, backgroundColor: t.color }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-400">
                    {Math.round((t.total / grand) * 100)}%
                  </span>
                  <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-600">{t.total.toLocaleString('es-CO')}</span>
                </div>
              ))}
            </div>
          </div>
          <ShareOfVoiceStream entities={entities} days={days} />
          <p className="mt-3 text-xs text-slate-500">
            Cómo leerlo: una pila más alta (Volumen) significa más conversación total ese día; una banda que se ensancha (Participación) significa que esa entidad gana terreno. Los días vacíos al inicio y al final se recortan. Gestiona las entidades en{' '}
            <Link href="/settings" className="text-sky-400 hover:underline">Configuración</Link>.
          </p>
        </section>
      )}
    </>
  );
}
