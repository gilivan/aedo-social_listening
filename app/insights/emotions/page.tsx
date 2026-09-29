import { getCurrentProject } from '@/lib/data';
import { emotionDistribution } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { EmotionRadar } from '@/components/insight-charts';

export const metadata = { title: 'Radar de emociones' };

const LABEL: Record<string, string> = {
  joy: 'Alegría', trust: 'Confianza', fear: 'Miedo', anger: 'Ira', sadness: 'Tristeza', surprise: 'Sorpresa',
};

export default async function EmotionsInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const data = await emotionDistribution(project.id, 30);
  const top = [...data].sort((a, b) => b.value - a.value)[0];

  return (
    <>
      <PageHeader
        title={t('ins.emotions.title', 'Radar de emociones')}
        info="La huella emocional de la conversación más allá del sentimiento (alegría, confianza, miedo, ira, tristeza, sorpresa). Datos: la etiqueta de emoción que la IA asigna a cada mención. Periodo: últimos 30 días. Fuente: las menciones recopiladas en todas las fuentes activas."
        subtitle="Más allá de positivo/negativo: la huella emocional de la conversación (últimos 30 días). Distingue una crisis impulsada por el miedo de una impulsada por la ira, que requieren respuestas muy distintas. La IA etiqueta las emociones en las menciones recién analizadas."
      />
      {data.length === 0 ? (
        <EmptyState message="Todavía no hay menciones etiquetadas con emociones. El etiquetado se ejecuta automáticamente a medida que se analizan nuevas menciones." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="panel px-4 py-5">
            <EmotionRadar data={data} />
          </section>
          <section className="panel px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Desglose</h2>
            {top && (
              <p className="mb-3 text-xs text-slate-500">
                Emoción dominante: <span className="text-violet-300">{LABEL[top.emotion] ?? top.emotion}</span> ({top.share}%).
              </p>
            )}
            <div className="flex flex-col gap-2.5">
              {[...data].sort((a, b) => b.value - a.value).map((d) => (
                <div key={d.emotion} className="flex items-center gap-2 text-sm">
                  <span className="w-20 shrink-0 text-slate-300">{LABEL[d.emotion] ?? d.emotion}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700/40">
                    <div className="h-full rounded-full bg-violet-400/70" style={{ width: `${d.share}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs text-slate-500">{d.share}%</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
