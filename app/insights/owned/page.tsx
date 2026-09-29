import Link from 'next/link';
import { getCurrentProject } from '@/lib/data';
import { ownedVsEarned } from '@/lib/owned';
import { PageHeader, EmptyState, SourceBadge, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { Heatmap } from '@/components/insight-charts';
import { Settings } from 'lucide-react';

export const metadata = { title: 'Propios vs. ganados' };

export default async function OwnedInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const data = await ownedVsEarned(project.id, 30);

  const totalVol = data.ownedVolume + data.earnedVolume;

  return (
    <>
      <PageHeader
        title={t('ins.owned.title', 'Propios vs. ganados')}
        info="Propios (owned) = tu propia página de Facebook y tu página de empresa en LinkedIn, obtenidas con tus propias credenciales mediante las API oficiales. Todo lo demás es ganado (earned): lo que dicen otras personas, dondequiera que lo digan, incluso una búsqueda por palabra clave en esas mismas plataformas. Periodo: últimos 30 días. Sin IA."
        subtitle="¿Tus publicaciones están funcionando o toda la conversación ocurre sin ti? Los canales propios comparados con todo lo que se dice de ti en otros lugares."
      />

      {data.configured.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="max-w-md text-sm text-slate-400">
            {t('ins.owned.empty',
              'Todavía no hay ningún canal propio conectado. AEDO solo puede comparar tus publicaciones con la conversación cuando pueda leerlas.')}
          </p>
          <p className="max-w-md text-xs text-slate-600">
            Conecta tu página de Facebook o tu página de empresa en LinkedIn: ambas son API oficiales y gratuitas, solo necesitas tus propias credenciales.
          </p>
          <Link href="/impostazioni/fonti"
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400">
            <Settings className="size-4" /> {t('ins.owned.connect', 'Conectar un canal')}
          </Link>
        </div>
      ) : totalVol === 0 ? (
        <EmptyState message={t('ins.owned.noData',
          'Conectado, pero aún no se ha recopilado nada en los últimos 30 días; se llenará con la próxima actualización.')} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel px-5 py-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-300">{t('ins.owned.split', 'Volumen: propios vs. ganados')}</h2>
              <SplitBar owned={data.ownedVolume} earned={data.earnedVolume}
                ownedLabel={`${fmtNum(data.ownedVolume)} propios`} earnedLabel={`${fmtNum(data.earnedVolume)} ganados`} />
              <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-300">{t('ins.owned.engagement', 'Engagement: propios vs. ganados')}</h2>
              <SplitBar owned={data.ownedEngagement} earned={data.earnedEngagement}
                ownedLabel={`${fmtNum(data.ownedEngagement)} propios`} earnedLabel={`${fmtNum(data.earnedEngagement)} ganados`} />
              <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
                {t('ins.owned.engagementNote',
                  'El engagement pondera likes ×1, comentarios ×2 y compartidos ×3: el mismo puntaje que se usa en todo AEDO, así que es comparable con cualquier otra vista.')}
              </p>
            </section>

            <section className="panel px-5 py-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-300">{t('ins.owned.bySource', 'Tus canales')}</h2>
              <div className="flex flex-col gap-3">
                {data.bySource.map((s) => (
                  <div key={s.source} className="rounded-lg bg-white/[0.03] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <SourceBadge source={s.source} />
                      {!data.configured.includes(s.source) && (
                        <span className="text-[10px] text-slate-600">no conectado</span>
                      )}
                      <span className="ml-auto text-sm font-semibold text-slate-200">{fmtNum(s.volume)} publicaciones</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {s.volume > 0
                        ? `${fmtNum(s.engagement)} de engagement total · ~${fmtNum(s.avgEngagement)} por publicación`
                        : 'conectado, sin publicaciones en este periodo'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {data.ownedVolume > 0 && (
            <section className="panel px-5 py-5">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('ins.owned.peaks', 'Cuándo salen tus publicaciones')}</h2>
              <p className="mb-3 text-xs text-slate-500">
                {t('ins.owned.peaksSub', 'Tu propio ritmo de publicación: compáralo con el Mapa de calor por hora para ver si coincide con los momentos en que la gente realmente está conversando.')}
              </p>
              <Heatmap grid={data.heat} />
            </section>
          )}
        </div>
      )}
    </>
  );
}

function SplitBar({ owned, earned, ownedLabel, earnedLabel }: {
  owned: number; earned: number; ownedLabel: string; earnedLabel: string;
}) {
  const total = owned + earned || 1;
  const ownedPct = Math.round((owned / total) * 100);
  return (
    <div>
      <div className="flex h-8 overflow-hidden rounded-lg bg-white/5">
        {owned > 0 && <div className="flex items-center justify-center bg-sky-500/80 text-[11px] font-semibold text-slate-950" style={{ width: `${ownedPct}%` }}>{ownedPct >= 12 ? `${ownedPct}%` : ''}</div>}
        {earned > 0 && <div className="flex items-center justify-center bg-violet-500/50 text-[11px] font-semibold text-slate-100" style={{ width: `${100 - ownedPct}%` }}>{100 - ownedPct >= 12 ? `${100 - ownedPct}%` : ''}</div>}
      </div>
      <div className="mt-1.5 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-sky-300"><span className="size-2 rounded-full bg-sky-500" />{ownedLabel}</span>
        <span className="flex items-center gap-1.5 text-violet-300"><span className="size-2 rounded-full bg-violet-500/70" />{earnedLabel}</span>
      </div>
    </div>
  );
}
