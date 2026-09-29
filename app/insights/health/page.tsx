import Link from 'next/link';
import { getCurrentProject } from '@/lib/data';
import { brandHealthReport } from '@/lib/insights';
import { PageHeader, EmptyState, InfoTip } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { BrandHealthGauge, HealthBars, CompareBars, Sparkline } from '@/components/insight-charts';

export const metadata = { title: 'Índice de salud' };

export default async function HealthInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const { theme, brand, compare } = await brandHealthReport(project.id, 14);

  if (theme.total === 0) {
    return (
      <>
        <PageHeader title={t('ins.health.title', 'Índice de salud')} subtitle="Cómo va la conversación, en un solo puntaje de 0 a 100."
          info="Un indicador compuesto de 0 a 100 sobre la salud de la conversación, que combina sentimiento, proporción positiva, momentum y resonancia. Datos: tus menciones analizadas. Periodo: últimos 14 días. Fuente: las menciones recopiladas en todas las fuentes activas." />
        <EmptyState message="No hay suficientes menciones en los últimos 14 días para calcular el índice." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={brand ? t('ins.health.brand', 'Índice de salud de marca') : t('ins.health.market', 'Índice de salud del mercado')}
        subtitle={brand
          ? `Cómo va tu marca “${brand.name}” frente al mercado y los competidores (últimos 14 días). Un puntaje de 0 a 100 que combina sentimiento, proporción positiva, momentum y resonancia.`
          : 'Cómo va toda la conversación sobre tu tema (últimos 14 días): la salud del mercado/tema en un puntaje de 0 a 100. Marca una entidad de benchmark como “tu marca” en Configuración para activar la comparación marca vs. mercado.'}
      />

      {/* ── Market/Theme health (sempre) ── */}
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-300">Salud del mercado <span className="text-slate-600">· todo el tema</span></h2>
        <InfoTip title="Salud del mercado">
          La salud de <b>toda la conversación</b> sobre tu tema: todas las menciones, todas las marcas. Te dice cómo va el mercado/sector a nivel de comunicación, independientemente de una marca en particular.
        </InfoTip>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <section className="panel flex flex-col items-center justify-center px-5 py-6">
          <BrandHealthGauge score={theme.score} grade={theme.grade} label="Salud del mercado" />
          <p className="mt-2 text-xs text-slate-500">{theme.total.toLocaleString('es-CO')} menciones analizadas</p>
        </section>
        <section className="panel px-5 py-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-300">Qué impulsa el puntaje</h2>
            <InfoTip title="Indicador compuesto">
              Mezcla ponderada: Sentimiento 35 %, Proporción positiva 25 %, Momentum 20 %, Resonancia 20 %.
              El momentum compara los últimos 7 días con los 7 anteriores; la resonancia es la proporción de menciones que obtuvieron algún engagement.
            </InfoTip>
          </div>
          <HealthBars components={theme.components} />
          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-300">Tendencia de sentimiento a 14 días</h2>
          <Sparkline values={theme.spark} />
        </section>
      </div>

      {/* ── Brand health + confronto (solo se un brand è definito) ── */}
      {brand ? (
        <>
          <div className="mb-2 mt-8 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-amber-300">Salud de marca · {brand.name}</h2>
            <InfoTip title="Salud de marca">
              El mismo índice de 0 a 100, pero calculado solo sobre las menciones que citan <b>{brand.name}</b>. Compáralo con la salud del mercado de arriba: una marca muy por encima del mercado supera la conversación del sector; por debajo, se está quedando atrás.
            </InfoTip>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <section className="panel flex flex-col items-center justify-center px-5 py-6">
              <BrandHealthGauge score={brand.health.score} grade={brand.health.grade} label={brand.name} />
              <p className="mt-2 text-xs text-slate-500">
                {brand.health.total.toLocaleString('es-CO')} menciones de marca ·{' '}
                <span className={brand.health.score >= theme.score ? 'text-emerald-400' : 'text-red-400'}>
                  {brand.health.score >= theme.score ? '+' : ''}{brand.health.score - theme.score} vs. mercado
                </span>
              </p>
            </section>
            <section className="panel px-5 py-5">
              <HealthBars components={brand.health.components} />
              <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-300">Tendencia de sentimiento a 14 días</h2>
              <Sparkline values={brand.health.spark} />
            </section>
          </div>

          {compare.length > 1 && (
            <section className="panel mt-4 px-5 py-5">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-300">Ranking de salud · tu marca vs. competidores</h2>
                <InfoTip title="Ranking competitivo">
                  Cada entidad de benchmark se califica con el mismo índice y se ordena. Tu marca aparece resaltada en ámbar: ve de un vistazo si lideras o vas detrás.
                </InfoTip>
              </div>
              <CompareBars items={compare} />
            </section>
          )}
        </>
      ) : (
        <p className="mt-6 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
          ¿Quieres ver cómo va <b>tu marca</b> frente al mercado y los competidores? Ve a{' '}
          <Link href="/settings" className="underline hover:text-amber-100">Configuración</Link>, agrega tu marca y tus competidores como entidades de
          benchmark y marca una con la ★ como “tu marca”. Aquí aparecerán el Índice de salud de marca y el ranking competitivo.
        </p>
      )}
    </>
  );
}
