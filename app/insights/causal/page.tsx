import { getCurrentProject } from '@/lib/data';
import { getCausalChains } from '@/lib/insights';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { GenerateRefresh } from '@/components/generate-refresh';
import { Zap, ArrowRight, GitBranch } from 'lucide-react';

export const metadata = { title: 'Causa-efecto' };

export default async function CausalPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const chains = await getCausalChains(project.id);
  const aiOn = await claudeAvailable();

  return (
    <>
      <PageHeader
        title={t('ins.causal.title', 'Gráfico causa-efecto')}
        info="Las cadenas causa → efecto que la IA reconstruye para el periodo: qué eventos produjeron consecuencias medibles (picos, cambios de sentimiento, nuevas narrativas). Datos: tus menciones más el razonamiento de la IA; se muestra como una reconstrucción de IA, no como un hecho medido. Periodo: últimos 14 días. Fuente: las menciones recopiladas en todas las fuentes activas."
        subtitle="La reconstrucción que hace la IA de cómo los eventos produjeron consecuencias: picos de volumen, cambios de sentimiento, nuevas narrativas. Una lectura interpretativa de los vínculos, no una prueba estadística."
      />
      {!chains ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12">
          <p className="text-sm text-slate-400">
            {aiOn
              ? 'Reconstruye las cadenas causa → efecto del periodo (una vez al día, ~3 centavos de dólar).'
              : 'Necesitas la clave de API de Claude.'}
          </p>
          {aiOn && (
            <GenerateRefresh endpoint="/api/insights/causal" label="Generar el gráfico" busyLabel="Reconstruyendo vínculos…" />
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {chains.map((c, i) => (
              <article key={i} className="panel px-5 py-4">
                {/* Causa */}
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 rounded-lg bg-amber-500/15 p-2 text-amber-400"><Zap className="size-4" /></span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-400/80">Causa{c.date ? ` · ${new Date(c.date).toLocaleDateString('es-CO')}` : ''}</p>
                    <p className="text-sm font-semibold">{c.cause}</p>
                  </div>
                </div>
                {/* Effetti */}
                {c.effects?.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5 pl-11">
                    {c.effects.map((e, j) => (
                      <div key={j} className="flex items-center gap-2 text-sm text-slate-300">
                        <ArrowRight className="size-3.5 shrink-0 text-sky-400" /> {e}
                      </div>
                    ))}
                  </div>
                )}
                {/* Narrazioni emerse */}
                {c.narratives?.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-11">
                    <GitBranch className="size-3.5 text-violet-400" />
                    {c.narratives.map((n, j) => (
                      <span key={j} className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs text-violet-300">{n}</span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="mt-4">
            <GenerateRefresh endpoint="/api/insights/causal" label="Regenerar" busyLabel="Reconstruyendo…" />
          </div>
        </>
      )}
    </>
  );
}
