import { getCurrentProject } from '@/lib/data';
import { crisisAnatomy } from '@/lib/insights';
import { conversationForecast } from '@/lib/forecast';
import { PageHeader, EmptyState, SourceBadge, fmtDate } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { RiskGauge, ConversationForecastChart } from '@/components/insight-charts';
import { ExternalLink, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Radar de crisis' };

const CONF_STYLE: Record<string, string> = {
  high: 'bg-emerald-500/15 text-emerald-300',
  medium: 'bg-amber-500/15 text-amber-300',
  low: 'bg-slate-500/15 text-slate-400',
};
const CONF_HINT: Record<string, string> = {
  high: 'hay suficiente historial y un ritmo lo bastante claro para confiar en la línea',
  medium: 'hay un ritmo, pero con ruido: lee la banda, no la línea',
  low: 'muy pocos datos para que la tendencia signifique mucho: se muestra solo como contexto',
};

export default async function CrisisInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const { risk, level, drivers, peak } = await crisisAnatomy(project.id, 14);
  const forecast = await conversationForecast(project.id, 30, 7);

  return (
    <>
      <PageHeader
        title={t('ins.crisis.title', 'Radar de crisis y anatomía del pico')}
        info="Un indicador de riesgo, la anatomía del mayor pico de volumen/sentimiento del periodo y una proyección estadística de hacia dónde van el volumen y la negatividad si se mantiene el ritmo reciente. Datos: tus menciones analizadas. Periodo: riesgo y pico en los últimos 14 días, proyección sobre los últimos 30. Fuente: las menciones recopiladas en todas las fuentes activas. Sin IA: todo es aritmética sobre tus propios datos."
        subtitle="Un número de riesgo, la autopsia del mayor pico y hacia dónde lleva la tendencia si nada cambia, con una alerta temprana si la negatividad sube lo bastante rápido como para importar."
      />
      {!peak ? (
        <EmptyState message="No hay suficientes datos en los últimos 14 días para evaluar el riesgo." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <section className="panel flex flex-col items-center justify-center px-5 py-6">
            <RiskGauge risk={risk} level={level} />
            <div className="mt-4 w-full max-w-xs">
              {drivers.map((d) => (
                <div key={d.label} className="mb-2 flex items-center gap-2 text-sm">
                  <span className="w-40 shrink-0 text-slate-400">{d.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700/40">
                    <div className="h-full rounded-full bg-orange-400/70" style={{ width: `${Math.min(100, d.value * 2)}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs text-slate-500">+{d.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel px-5 py-5">
            <h2 className="text-sm font-semibold text-slate-300">Anatomía del pico</h2>
            <p className="mb-3 mt-1 text-xs text-slate-500">
              Día con más volumen: <span className="text-slate-300">{fmtDate(peak.day)}</span> ·{' '}
              <span className="text-slate-300">{peak.volume} menciones</span> ·{' '}
              <span className={peak.negShare > 30 ? 'text-red-400' : 'text-slate-400'}>{peak.negShare}% negativo</span> ·{' '}
              sentimiento prom. <span className="text-slate-300">{peak.sentiment}</span>
            </p>

            {peak.topics.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Qué lo impulsó: temas</p>
                <div className="flex flex-wrap gap-1.5">
                  {peak.topics.map((t) => (
                    <span key={t.topic} className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">{t.topic} · {t.n}</span>
                  ))}
                </div>
              </div>
            )}

            {peak.content.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Contenido que más pesó</p>
                <div className="flex flex-col gap-1.5">
                  {peak.content.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <SourceBadge source={m.source} />
                      {m.sentiment === 'negative' && <span className="shrink-0 text-red-400">●</span>}
                      {m.url ? (
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 truncate text-slate-300 hover:text-sky-300">
                          <span className="truncate">{m.title}</span>
                          <ExternalLink className="size-3 shrink-0 text-slate-600" />
                        </a>
                      ) : <span className="truncate text-slate-300">{m.title}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {forecast.history.some((h) => h.volume > 0) && (
        <section className="panel mt-4 px-5 py-5">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-300">
              {t('ins.crisis.forecast.title', 'Hacia dónde va esto')}
            </h2>
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              forecast.volumeTrend === 'rising' ? 'bg-sky-500/15 text-sky-300'
                : forecast.volumeTrend === 'falling' ? 'bg-orange-500/15 text-orange-300'
                  : 'bg-slate-500/15 text-slate-400'
            }`}>
              {forecast.volumeTrend === 'rising' ? <TrendingUp className="size-3" />
                : forecast.volumeTrend === 'falling' ? <TrendingDown className="size-3" />
                  : <Minus className="size-3" />}
              {forecast.volumeTrend === 'flat'
                ? 'ritmo estable'
                : `${forecast.volumePctPerWeek > 0 ? '+' : ''}${forecast.volumePctPerWeek}%/semana`}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CONF_STYLE[forecast.confidence]}`}
              title={CONF_HINT[forecast.confidence]}>
              confianza {forecast.confidence === 'high' ? 'alta' : forecast.confidence === 'medium' ? 'media' : forecast.confidence === 'low' ? 'baja' : forecast.confidence}
            </span>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            {t('ins.crisis.forecast.subtitle',
              'El ritmo diario reciente, proyectado hacia adelante: no es una predicción de eventos, solo la tendencia si nada cambia. La banda sombreada muestra cuánto variaron realmente los últimos 30 días, así que una proyección fuera de ella sería una verdadera sorpresa.')}
          </p>

          {forecast.negShareWarning && (
            <div className="tv-shine mb-3 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="size-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-200">
                {t('ins.crisis.forecast.warning', 'La proporción negativa viene subiendo de forma constante.')}{' '}
                A este ritmo superaría el <span className="font-semibold">{forecast.negShareWarning.thresholdPct}%</span> alrededor del{' '}
                <span className="font-semibold">{fmtDate(forecast.negShareWarning.etaDay)}</span>: vale la pena vigilarlo antes de que llegue ahí.
              </p>
            </div>
          )}

          <ConversationForecastChart history={forecast.history} projected={forecast.projected} />
        </section>
      )}
    </>
  );
}
