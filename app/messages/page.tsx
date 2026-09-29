import Link from 'next/link';
import { MessageSquareQuote, Target } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { messagePullThrough } from '@/lib/messages';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { sourceLabel } from '@/lib/export-data';
import { saveKeyMessages } from './actions';
import { SubmitButton } from '@/components/submit-button';
import { SectionTabs } from '@/components/section-tabs';

export const metadata = { title: 'Penetración de mensajes' };

const sent = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);
const sentColor = (v: number | null) =>
  v === null ? 'text-slate-500' : v > 0.15 ? 'text-emerald-400' : v < -0.15 ? 'text-red-400' : 'text-slate-400';

export default async function MessagesPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No hay ningún proyecto configurado." />;
  const messages = project.keyMessages ?? [];
  const data = await messagePullThrough(project.id, messages, 30);
  const aiOn = await claudeAvailable();
  const maxWeek = Math.max(1, ...data.messages.flatMap((m) => m.weekly.map((w) => w.n)));

  return (
    <>
      <SectionTabs group="story" />
      <PageHeader
        title={t('page.messages.title', 'Penetración de mensajes')}
        info="Si los mensajes que TÚ quieres posicionar realmente se están retomando. Escribes tus mensajes clave; cada uno se expande una sola vez en las palabras que periodistas y usuarios usarían de verdad, y desde ahí la coincidencia es puro trabajo de base de datos: cada conteo es verificable y actualizarlo no cuesta nada. Periodo: últimos 30 días."
        subtitle="El volumen te dice cuánto hablan de ti. Esto te dice si dicen lo que querías que dijeran: cuáles de tus mensajes clave se retoman, en qué fuentes y con qué tono."
      />

      {messages.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="panel px-4 py-3" title="Porcentaje de tu cobertura que lleva al menos uno de tus mensajes clave">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Tasa de penetración</p>
            <p className="mt-1 text-2xl font-bold text-sky-300">{data.pullThroughPct}%</p>
            <p className="text-xs text-slate-500">de la cobertura lleva un mensaje</p>
          </div>
          <div className="panel px-4 py-3" title="Piezas de cobertura que llevan al menos un mensaje clave (los mensajes se superponen, así que no es la suma)">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Cobertura con mensaje</p>
            <p className="mt-1 text-2xl font-bold">{fmtNum(data.covered)}</p>
            <p className="text-xs text-slate-500">de {fmtNum(data.totalCoverage)} en total</p>
          </div>
          <div className="panel px-4 py-3" title="Cuántos mensajes clave estás siguiendo">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Mensajes seguidos</p>
            <p className="mt-1 text-2xl font-bold">{messages.length}</p>
            <p className="text-xs text-slate-500">últimos {data.days} días</p>
          </div>
          <div className="panel px-4 py-3" title="El mensaje más retomado en el periodo">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Mejor desempeño</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-200">{data.messages[0]?.text ?? '—'}</p>
            <p className="text-xs text-slate-500">{data.messages[0] ? `${fmtNum(data.messages[0].mentions)} retomas` : ''}</p>
          </div>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="panel px-6 py-8">
          <div className="mx-auto max-w-xl text-center">
            <Target className="mx-auto mb-2 size-6 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-200">Escribe los mensajes que quieres posicionar</h2>
            <p className="mt-1 text-sm text-slate-400">
              Uno por línea, tal como los dirías. Luego AEDO mide cuánto de tu cobertura realmente los lleva.
              {aiOn ? ' Cada mensaje se expande una sola vez en las formulaciones que la prensa usaría de verdad.' : ' Sin una clave de IA, la coincidencia usa las palabras del propio mensaje.'}
            </p>
          </div>
          <form action={saveKeyMessages} className="mx-auto mt-4 flex max-w-xl flex-col gap-2">
            <textarea name="messages" rows={5} required
              placeholder={'Nuestra plataforma reduce a la mitad el tiempo de reporte\nSomos la única alternativa de código abierto\nLa privacidad se queda con el cliente'}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-sky-500/60" />
            <SubmitButton pendingLabel="Expandiendo mensajes…"
              className="self-center rounded-lg bg-sky-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
              Empezar a medir
            </SubmitButton>
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.messages.map((m) => (
            <article key={m.id} className="panel px-5 py-4">
              <div className="flex flex-wrap items-start gap-2">
                <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-sky-400" />
                <h2 className="flex-1 text-sm font-semibold leading-snug text-slate-100">{m.text}</h2>
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300"
                  title={`${m.mentions} piezas de cobertura llevan este mensaje: ${m.sharePct}% de toda la cobertura del periodo`}>
                  {fmtNum(m.mentions)} retomas · {m.sharePct}%
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className={sentColor(m.sentiment)} title="Sentimiento promedio de la cobertura que lleva este mensaje">
                  tono {sent(m.sentiment)}
                </span>
                {m.sources.length > 0 && (
                  <span className="text-slate-500" title="Fuentes que retomaron el mensaje, por volumen">
                    {m.sources.map((s) => `${sourceLabel(s.source)} (${s.n})`).join(' · ')}
                  </span>
                )}
              </div>

              {m.weekly.length > 1 && (
                <div className="mt-3 flex items-end gap-1" title="Retomas semanales de este mensaje">
                  {m.weekly.map((w) => (
                    <span key={w.week} className="flex-1" title={`Semana del ${w.week}: ${w.n} retomas`}>
                      <span className="block rounded-t bg-sky-500/60"
                        style={{ height: `${Math.max(3, (w.n / maxWeek) * 40)}px` }} />
                    </span>
                  ))}
                </div>
              )}

              {m.examples.length > 0 && (
                <div className="mt-3 border-t border-[var(--border)] pt-2">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-600">Dónde se retomó</p>
                  <ul className="flex flex-col gap-0.5 text-xs">
                    {m.examples.map((e) => (
                      <li key={e.id}>
                        <Link href={`/listening?ids=${e.id}`} className="text-slate-400 hover:text-sky-300"
                          title="Abrir esta pieza de cobertura">
                          {e.title}
                        </Link>
                        <span className="ml-1 text-slate-600">{sourceLabel(e.source)} · {e.date}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {m.mentions === 0 && (
                <p className="mt-2 text-xs text-amber-400/80">
                  Todavía no se retoma en este periodo: puede que el mensaje sea demasiado abstracto para citarse, o simplemente no está calando.
                </p>
              )}

              <p className="mt-2 text-[10px] text-slate-600" title="Las formulaciones usadas para detectar este mensaje en la cobertura">
                coincidencia por: {m.terms.join(' · ')}
              </p>
            </article>
          ))}

          <details className="panel px-5 py-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">Editar mensajes clave</summary>
            <form action={saveKeyMessages} className="mt-3 flex flex-col gap-2">
              <textarea name="messages" rows={6} defaultValue={messages.map((m) => m.text).join('\n')}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-sky-500/60" />
              <p className="text-[11px] text-slate-500">Uno por línea. Los mensajes existentes conservan sus formulaciones; los nuevos se expanden al guardar.</p>
              <SubmitButton pendingLabel="Guardando…"
                className="self-start rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
                Guardar mensajes
              </SubmitButton>
            </form>
          </details>
        </div>
      )}
    </>
  );
}
