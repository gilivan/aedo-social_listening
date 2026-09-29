import Link from 'next/link';
import { getCurrentProject } from '@/lib/data';
import { authorPyramid } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { AuthorPyramid } from '@/components/insight-charts';

export const metadata = { title: 'Pirámide de autores' };

const TIER_DOT: Record<string, string> = {
  mega: '#fbbf24', macro: '#a78bfa', micro: '#38bdf8', longtail: '#64748b',
};

export default async function PyramidInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const { tiers, totalAuthors, topConcentration, topAuthors } = await authorPyramid(project.id, 14);

  return (
    <>
      <PageHeader
        title={t('ins.pyramid.title', 'Pirámide de influencia de autores')}
        info="Autores clasificados por nivel de influencia (mega / macro / micro / cola larga) y la parte del alcance total que tiene cada nivel: ¿la conversación la sostienen unas pocas voces grandes o está bien repartida? Datos: los autores y el alcance de tus menciones. Periodo: últimos 14 días. Fuente: las menciones recopiladas en todas las fuentes activas."
        subtitle="Qué tan concentrada está tu conversación (últimos 14 días): autores clasificados en niveles de influencia, con la parte del alcance total de cada nivel. Una pirámide pesada arriba significa que dependes de unas pocas voces grandes; una base amplia significa resiliencia."
      />
      {tiers.length === 0 ? (
        <EmptyState message="Todavía no hay suficientes autores con engagement para construir la pirámide." />
      ) : (
        <section className="panel px-4 py-5">
          <p className="mb-3 text-sm text-slate-400">
            <span className="text-slate-200">{totalAuthors.toLocaleString('es-CO')}</span> autores ·{' '}
            el nivel superior concentra <span className={topConcentration >= 50 ? 'font-semibold text-amber-300' : 'font-semibold text-emerald-300'}>{topConcentration}%</span> de todo el alcance
            {topConcentration >= 50 ? ': muy concentrado, frágil ante unas pocas cuentas.' : ': el alcance está bastante repartido.'}
          </p>
          <AuthorPyramid tiers={tiers} />

          {/* Top autori cliccabili → i loro post in Listening */}
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Voces principales: haz clic en un autor para ver sus publicaciones
            </p>
            <div className="flex flex-wrap gap-1.5">
              {topAuthors.map((a) => (
                <Link key={a.id} href={`/listening?autore=${encodeURIComponent(a.id)}`}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white/[0.02] px-2.5 py-1 text-xs text-slate-300 transition hover:border-sky-500/50 hover:bg-sky-500/5 hover:text-sky-200"
                  title={`${a.posts} publicaci${a.posts === 1 ? 'ón' : 'ones'} · alcance ${a.reach.toLocaleString('es-CO')}: ver sus publicaciones`}>
                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: TIER_DOT[a.tier] ?? '#64748b' }} />
                  {a.id}
                  <span className="text-slate-500">· {a.posts}</span>
                </Link>
              ))}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">
              {tiers.map((t) => (
                <span key={t.key} className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: TIER_DOT[t.key] ?? '#64748b' }} />{t.label}
                </span>
              ))}
              <span className="text-slate-600">· número = publicaciones en los últimos 14 días</span>
            </p>
          </div>
        </section>
      )}
    </>
  );
}
