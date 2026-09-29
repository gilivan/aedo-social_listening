import { Trash2, FileClock, AlertTriangle, UserX, Undo2, Activity, Users } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { wikiStats, isRevert } from '@/lib/wikipedia';
import { PageHeader, fmtDate } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { GenerateRefresh } from '@/components/generate-refresh';
import { WikiPageSearch } from '@/components/wiki-page-search';
import { WeeklyEditsChart } from '@/components/wiki-charts';
import { addWikiPageAction, removeWikiPageAction } from './actions';

export const metadata = { title: 'Wikipedia' };

export default async function WikipediaPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return null;

  const stats = await wikiStats(project.id);
  const hasData = stats.pages.some((p) => p.totalEdits > 0);
  const elevated = stats.activity.filter((a) => a.elevated);

  return (
    <>
      <PageHeader
        title={t('page.wikipedia.title', 'Wikipedia')}
        info="Una sección autónoma, como Reseñas y Deportes: quién edita una página pública de Wikipedia, y cuándo, es un hecho estructural, no una mención que interpretar. Las guerras de ediciones, la actividad anónima repentina o el borrado de contenido suelen aparecer aquí antes que en cualquier otro lugar. API oficial de MediaWiki, sin clave, sin IA."
        subtitle="¿Quién está editando esta página y parece una guerra de ediciones? Una señal de alerta temprana que Talkwalker no tiene."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <GenerateRefresh endpoint="/api/wikipedia/refresh" label={t('page.wikipedia.refresh', 'Buscar actualizaciones')} busyLabel={t('page.wikipedia.checking', 'Revisando…')} />
      </div>

      <details className="panel mb-4 px-5 py-5" open={stats.pages.length === 0}>
        <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-300 [&::-webkit-details-marker]:hidden">
          {t('page.wikipedia.pages', 'Páginas seguidas')}
          {stats.pages.length > 0 && <span className="text-xs font-normal text-slate-600">({stats.pages.length}, clic para editar)</span>}
        </summary>

        {stats.pages.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {stats.pages.map((p) => {
              const act = stats.activity.find((a) => a.page === p.title);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                  <FileClock className="size-4 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{p.title}</p>
                    <p className="truncate text-[11px] text-slate-600">
                      {p.totalEdits > 0 ? `${p.totalEdits} ediciones registradas` : 'aún sin revisar'}
                    </p>
                  </div>
                  {act?.elevated && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                      <AlertTriangle className="size-3" /> actividad elevada
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-500">
                    {p.lastFetchedAt ? `revisada ${fmtDate(p.lastFetchedAt)}` : ''}
                  </span>
                  <form action={removeWikiPageAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" aria-label={`Eliminar ${p.title}`} className="text-slate-600 transition hover:text-red-400">
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <form action={addWikiPageAction} className="grid gap-2 rounded-lg border border-[var(--border)] px-4 py-3 sm:grid-cols-2">
          <p className="text-xs font-semibold text-slate-300 sm:col-span-2">
            <FileClock className="mr-1 inline size-3.5" /> Seguir una página
            <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">gratis · sin clave</span>
          </p>
          <WikiPageSearch />
          <button type="submit" className="self-start rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 sm:col-span-2">
            Seguir página
          </button>
        </form>
      </details>

      {stats.pages.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
          <FileClock className="size-6 text-slate-600" />
          <p className="max-w-md text-sm text-slate-400">Sigue una página de Wikipedia arriba para empezar: quién la edita, con qué frecuencia y si parece una pelea.</p>
        </div>
      ) : !hasData ? (
        <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
          <p className="text-sm text-slate-400">Página agregada: pulsa “Buscar actualizaciones” arriba para traer su historial reciente.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {elevated.length > 0 && (
            <section className="panel border-amber-500/30 px-5 py-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
                <AlertTriangle className="size-4" /> {t('page.wikipedia.elevated', 'Actividad de edición elevada: está pasando ahora')}
              </h2>
              <div className="flex flex-col gap-1 text-sm text-slate-300">
                {elevated.map((a) => (
                  <p key={a.page}>
                    <strong>{a.page}</strong> tuvo {a.last7} ediciones en los últimos 7 días; su ritmo habitual es de unas {a.baselineWeekly}/semana.
                    Más del doble del ritmo normal suele significar que algo cambió: salió una noticia, o hay gente peleando por la página.
                  </p>
                ))}
              </div>
            </section>
          )}

          <section className="panel px-5 py-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Activity className="size-4 text-sky-400" /> {t('page.wikipedia.activity', 'Actividad de edición')}
              {stats.primaryPage && <span className="text-xs font-normal text-slate-600">· {stats.primaryPage}</span>}
            </h2>
            <p className="mb-3 text-[11px] text-slate-600">
              Ediciones por semana en las últimas 13 semanas. La parte roja de cada barra son ediciones revertidas: una página en una verdadera guerra de ediciones se ve como una barra alta mayormente roja, no solo como una barra alta.
            </p>
            <WeeklyEditsChart data={stats.weekly} />
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            {stats.activity.map((a) => (
              <section key={a.page} className="panel px-4 py-4">
                <p className="mb-2 truncate text-xs font-semibold text-slate-300">{a.page}</p>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500"><Undo2 className="size-3.5" /> revertidas</span>
                    <span className={a.revertRate !== null && a.revertRate > 20 ? 'font-semibold text-red-400' : 'text-slate-300'}>
                      {a.revertRate === null ? '—' : `${a.revertRate}%`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500"><UserX className="size-3.5" /> anónimas</span>
                    <span className={a.anonRate !== null && a.anonRate > 30 ? 'font-semibold text-amber-400' : 'text-slate-300'}>
                      {a.anonRate === null ? '—' : `${a.anonRate}%`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500"><Users className="size-3.5" /> editores</span>
                    <span className="text-slate-300">{a.distinctEditors}</span>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-slate-600">últimos 90 días · {a.edits90} edici{a.edits90 === 1 ? 'ón' : 'ones'}</p>
              </section>
            ))}
          </div>

          <section className="panel px-5 py-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('page.wikipedia.recent', 'Ediciones recientes')}</h2>
            <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
              <span className="flex items-center gap-1"><Undo2 className="size-3 text-red-400" /> revertida o deshecha</span>
              <span className="flex items-center gap-1"><UserX className="size-3 text-amber-400" /> cuenta anónima o temporal</span>
              <span>· el número de tamaño indica cuántos caracteres se agregaron (verde) o se eliminaron (rojo)</span>
            </p>
            <div className="flex flex-col gap-1.5">
              {stats.recent.map((e) => {
                const revert = isRevert(e);
                return (
                  <div key={e.revId} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-slate-200">
                        {revert && <Undo2 className="size-3.5 shrink-0 text-red-400" />}
                        {e.isAnon && <UserX className="size-3.5 shrink-0 text-amber-400" />}
                        <span className={e.isAnon ? 'text-amber-300' : ''}>{e.user}</span>
                        {stats.pages.length > 1 && <span className="text-slate-600">· {e.pageTitle}</span>}
                      </p>
                      <p className="truncate text-[11px] text-slate-600">{e.comment || <em className="text-slate-700">sin resumen de edición</em>}</p>
                    </div>
                    {e.sizeDiff !== null && (
                      <span className={`shrink-0 text-xs tabular-nums ${e.sizeDiff > 0 ? 'text-emerald-400' : e.sizeDiff < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                        {e.sizeDiff > 0 ? '+' : ''}{e.sizeDiff}
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-slate-500">{fmtDate(e.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
