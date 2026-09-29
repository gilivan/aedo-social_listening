import Link from 'next/link';
import { AlertTriangle, GitBranch } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getNarratives } from '@/lib/narratives';
import { PageHeader, EmptyState, fmtDate } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { SectionTabs } from '@/components/section-tabs';

const STANCE_STYLE: Record<string, string> = {
  positive: 'bg-emerald-500/15 text-emerald-400',
  negative: 'bg-red-500/15 text-red-400',
  neutral: 'bg-slate-500/15 text-slate-400',
  polarizing: 'bg-amber-500/15 text-amber-400',
};

const STANCE_LABEL: Record<string, string> = {
  positive: 'positiva', negative: 'negativa', neutral: 'neutral', polarizing: 'polarizante',
};

export const metadata = { title: 'Narrativas' };

/** Link ai post di una narrazione: id esatti se disponibili, altrimenti gli account coinvolti. */
function coordHref(n: { mentionIds: number[]; accounts: string[] }): string | null {
  if (n.mentionIds.length > 0) return `/listening?ids=${n.mentionIds.join(',')}`;
  if (n.accounts.length > 0) return `/listening?autori=${n.accounts.map(encodeURIComponent).join('|')}`;
  return null;
}

export default async function NarrativesPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const rows = await getNarratives(project.id);

  return (
    <>
      <SectionTabs group="story" />
      <PageHeader
        title={t('page.narratives.title', 'Narrativas')}
        subtitle={t('page.narratives.subtitle', 'Quién impulsa qué: grupos de mensajes que apoyan la misma tesis, con alerta de patrones coordinados')}
      />
      {rows.length === 0 ? (
        <EmptyState message={t('narratives.none', 'No se detectaron narrativas. El análisis corre con el ciclo diario (necesita al menos 8 publicaciones sociales en las últimas 48 horas).')} />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((n) => (
            <article key={n.id} className={`panel px-5 py-4 ${n.coordinated ? 'border-amber-500/40' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <GitBranch className="size-4 text-sky-400" />
                <h2 className="text-sm font-bold">{n.title}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STANCE_STYLE[n.stance ?? 'neutral']}`}>
                  {n.stance ? STANCE_LABEL[n.stance] ?? n.stance : n.stance}
                </span>
                {n.coordinated === 1 && (
                  coordHref(n) ? (
                    <Link href={coordHref(n)!}
                      className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400 transition hover:bg-amber-500/25"
                      title="Ver las publicaciones coordinadas">
                      <AlertTriangle className="size-3" /> posible coordinación →
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                      <AlertTriangle className="size-3" /> posible coordinación
                    </span>
                  )
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {coordHref(n) ? (
                    <Link href={coordHref(n)!} className="text-sky-400 hover:text-sky-300" title="Ver las publicaciones de esta narrativa">{n.mentionCount} publ.</Link>
                  ) : `${n.mentionCount} publ.`}
                  {' · '}{fmtDate(n.createdAt)}
                </span>
              </div>
              {n.description && <p className="mt-2 text-sm leading-relaxed text-slate-300">{n.description}</p>}
              {n.accounts.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Cuentas más activas:{' '}
                  {n.accounts.map((a) => (
                    <Link key={a} href={`/listening?autore=${encodeURIComponent(a)}`}
                      className="mr-1.5 inline-block rounded bg-white/5 px-1.5 py-0.5 text-slate-400 transition hover:bg-sky-500/15 hover:text-sky-300"
                      title={`Ver las publicaciones de ${a}`}>{a}</Link>
                  ))}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
