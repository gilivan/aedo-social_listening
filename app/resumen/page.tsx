import { getCurrentProject } from '@/lib/data';
import { execFacts, getExecSummary, EXEC_DAYS } from '@/lib/executive-summary';
import { PageHeader, EmptyState, KpiCard, fmtNum, fmtDate } from '@/components/ui';
import { GenerateRefresh } from '@/components/generate-refresh';

export const metadata = { title: 'Resumen ejecutivo' };
export const dynamic = 'force-dynamic';

const PRIORITY: Record<string, string> = {
  alta: 'bg-red-500/15 text-red-300', media: 'bg-amber-500/15 text-amber-300', baja: 'bg-slate-500/15 text-slate-300',
};
const SOURCE_NAME: Record<string, string> = {
  googlenews: 'Google News', web: 'Web y blogs', rss: 'Medios (RSS)', instagram: 'Instagram', facebook: 'Facebook',
  youtube: 'YouTube', bluesky: 'Bluesky', gdelt: 'GDELT', reddit: 'Reddit', linkedin_web: 'LinkedIn', tiktok: 'TikTok',
};

function ratingClass(avg: number | null) {
  if (avg == null) return 'text-slate-600';
  return avg >= 4.5 ? 'text-emerald-400' : avg >= 4 ? 'text-slate-200' : avg >= 3 ? 'text-amber-400' : 'text-red-400';
}
function cellBg(avg: number | null, n: number) {
  if (avg == null || n === 0) return '';
  return avg >= 4.5 ? 'bg-emerald-500/10' : avg >= 4 ? '' : avg >= 3 ? 'bg-amber-500/10' : 'bg-red-500/15';
}

export default async function ResumenPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No hay ningún proyecto configurado." />;
  const [f, ai] = await Promise.all([execFacts(project.id), getExecSummary(project.id)]);

  return (
    <>
      <PageHeader
        title="Resumen ejecutivo"
        subtitle={`${project.name} · conversación de los últimos ${EXEC_DAYS} días y reseñas de los últimos ${EXEC_DAYS * 2} · todo en una sola vista`}
      />

      {/* ── Alcance ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Menciones" value={fmtNum(f.scope.mentions)} hint={`${fmtNum(f.scope.articles)} artículos · ${fmtNum(f.scope.posts)} posts`} />
        <KpiCard label="Reseñas Google Maps" value={fmtNum(f.scope.reviews)} hint={`${f.scope.places} lugares`} />
        <KpiCard label="Comentarios en redes" value={fmtNum(f.scope.socialComments)} hint="Instagram y Facebook" />
        <KpiCard label="Entidades comparadas" value={String(f.voices.length)} hint="marca y competidores" />
        <KpiCard label="Fuentes con datos" value={String(f.scope.sources.length)} hint={f.scope.sources.slice(0, 3).map((s) => SOURCE_NAME[s.source] ?? s.source).join(', ')} />
      </div>

      {/* ── Síntesis IA ── */}
      <section className="panel mt-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-300">Síntesis</h2>
            <p className="text-[11px] text-slate-600">
              {ai ? `Generada por la IA el ${fmtDate(ai.generatedAt)} a partir de los datos de esta página.` : 'Aún no se ha generado. La IA lee los datos de esta página y propone hallazgos y oportunidades.'}
            </p>
          </div>
          <GenerateRefresh endpoint="/api/resumen" label={ai ? 'Regenerar síntesis' : 'Generar síntesis con IA'} busyLabel="Analizando… (hasta 2 min)" />
        </div>

        {ai && (
          <div className="mt-4 flex flex-col gap-5">
            <div>
              <p className="text-lg font-semibold leading-snug text-slate-100">{ai.titular}</p>
              {ai.contexto && <p className="mt-1 text-sm text-slate-400">{ai.contexto}</p>}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Hallazgos clave</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {ai.hallazgos.map((h, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] px-4 py-3">
                    <p className="text-sm font-semibold text-slate-200">{h.titulo}</p>
                    <p className="mt-1 text-sm text-slate-400">{h.detalle}</p>
                    {h.evidencia && <p className="mt-2 text-[11px] text-sky-300/80">Evidencia: {h.evidencia}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-300/80">Lo que duele</h3>
                <ul className="flex flex-col gap-2 text-sm">
                  {ai.dolores.map((d, i) => <li key={i}><span className="font-medium text-slate-200">{d.tema}:</span> <span className="text-slate-400">{d.detalle}</span></li>)}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300/80">Lo que se valora</h3>
                <ul className="flex flex-col gap-2 text-sm">
                  {ai.fortalezas.map((d, i) => <li key={i}><span className="font-medium text-slate-200">{d.tema}:</span> <span className="text-slate-400">{d.detalle}</span></li>)}
                </ul>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Oportunidades</h3>
              <div className="flex flex-col gap-2">
                {ai.oportunidades.map((o, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-[var(--border)] px-4 py-2.5">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY[o.prioridad] ?? PRIORITY.media}`}>{o.prioridad}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{o.titulo}</p>
                      <p className="text-sm text-slate-400">{o.accion}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-1">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Frente a la competencia</h3>
                <ul className="flex flex-col gap-2 text-sm">
                  {ai.comparativo.map((c, i) => <li key={i}><span className="font-medium text-slate-200">{c.entidad}:</span> <span className="text-slate-400">{c.lectura}</span></li>)}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300/80">Riesgos</h3>
                <ul className="list-disc pl-4 text-sm text-slate-400">{ai.riesgos.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Limitaciones</h3>
                <ul className="list-disc pl-4 text-sm text-slate-500">{ai.limitaciones.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Reputación ── */}
      {f.places.length > 0 && (
        <section className="panel mt-4 overflow-x-auto px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">Reputación en Google Maps</h2>
          <p className="mb-3 text-[11px] text-slate-600">Fechas aproximadas: Google solo indica «hace N meses».</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Lugar</th><th className="pb-2 text-right">Reseñas</th><th className="pb-2 text-right">Promedio</th>
                <th className="pb-2 text-right">% de 1–2★</th><th className="pb-2 text-right">Últimos 30 días</th>
              </tr>
            </thead>
            <tbody>
              {f.places.map((p) => (
                <tr key={p.label} className="border-b border-[var(--border)]/50 last:border-0">
                  <td className="py-2 font-medium">{p.label}</td>
                  <td className="py-2 text-right">{fmtNum(p.total)}</td>
                  <td className={`py-2 text-right font-semibold ${ratingClass(p.total ? p.avg : null)}`}>{p.total ? `${p.avg.toFixed(2)}★` : 'pendiente'}</td>
                  <td className="py-2 text-right">{p.total ? `${((p.negative / p.total) * 100).toFixed(1)}%` : '—'}</td>
                  <td className="py-2 text-right text-slate-400">{p.recent ? `${p.recent} · ${p.recentAvg!.toFixed(2)}★` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Temas de las reseñas ── */}
      {f.themes.rows.length > 0 && (
        <section className="panel mt-4 overflow-x-auto px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">De qué hablan las reseñas</h2>
          <p className="mb-3 text-[11px] text-slate-600">Reseñas con texto que tocan cada tema y su calificación promedio. Rojo = el tema arrastra la nota hacia abajo.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Tema</th>
                {f.themes.places.map((pl) => <th key={pl} className="pb-2 text-center">{pl}</th>)}
              </tr>
            </thead>
            <tbody>
              {f.themes.rows.map((r) => (
                <tr key={r.key} className="border-b border-[var(--border)]/50 last:border-0">
                  <td className="py-1.5 text-slate-300">{r.label}</td>
                  {r.cells.map((c, i) => (
                    <td key={i} className={`py-1.5 text-center ${cellBg(c.avg, c.n)}`}>
                      {c.n ? <span className={ratingClass(c.avg)}>{c.avg!.toFixed(1)}★ <span className="text-[11px] text-slate-500">({c.n})</span></span> : <span className="text-slate-700">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Voces de los clientes ── */}
      {f.negativeQuotes.length > 0 && (
        <section className="panel mt-4 px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Voces de los clientes</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-300/80">Críticas recientes (1–2★)</h3>
              <div className="flex flex-col gap-2">
                {f.negativeQuotes.map((q, i) => (
                  <blockquote key={i} className="rounded-lg border-l-2 border-red-400/60 bg-red-500/5 px-3 py-2 text-sm text-slate-300">
                    “{q.text}”
                    <footer className="mt-1 text-[11px] text-slate-500">{q.place} · {q.rating}★ · {q.date}</footer>
                  </blockquote>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300/80">Elogios recientes (5★)</h3>
              <div className="flex flex-col gap-2">
                {f.positiveQuotes.map((q, i) => (
                  <blockquote key={i} className="rounded-lg border-l-2 border-emerald-400/60 bg-emerald-500/5 px-3 py-2 text-sm text-slate-300">
                    “{q.text}”
                    <footer className="mt-1 text-[11px] text-slate-500">{q.place} · {q.date}</footer>
                  </blockquote>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Conversación por entidad ── */}
      <section className="panel mt-4 overflow-x-auto px-5 py-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-300">Conversación por marca</h2>
        <p className="mb-3 text-[11px] text-slate-600">Menciones en prensa, web y redes que nombran a cada marca (últimos {EXEC_DAYS} días).</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2">Marca</th><th className="pb-2 text-right">Menciones</th><th className="pb-2 text-right">Share of voice</th>
              <th className="pb-2 text-right">Prensa</th><th className="pb-2 text-right">Redes y web</th>
              <th className="pb-2 text-right">Positivas</th><th className="pb-2 text-right">Negativas</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const tot = f.voices.reduce((s, v) => s + v.total, 0);
              return f.voices.map((v) => (
                <tr key={v.name} className="border-b border-[var(--border)]/50 last:border-0">
                  <td className="py-2 font-medium">{v.name}</td>
                  <td className="py-2 text-right">{fmtNum(v.total)}</td>
                  <td className="py-2 text-right">{tot ? `${((v.total / tot) * 100).toFixed(1)}%` : '—'}</td>
                  <td className="py-2 text-right">{fmtNum(v.articles)}</td>
                  <td className="py-2 text-right">{fmtNum(v.posts)}</td>
                  <td className="py-2 text-right text-emerald-400">{fmtNum(v.positive)}</td>
                  <td className={`py-2 text-right ${v.negative ? 'text-red-400' : 'text-slate-600'}`}>{fmtNum(v.negative)}</td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </section>

      {/* ── Prensa ── */}
      {f.press.length > 0 && (
        <section className="panel mt-4 px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Titulares en prensa</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {f.press.map((p, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className={`size-2 shrink-0 rounded-full ${p.sentiment === 'negative' ? 'bg-red-400' : p.sentiment === 'positive' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                <span className="w-40 shrink-0 truncate text-xs text-slate-500">{p.entity}</span>
                {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-sky-300">{p.title}</a> : <span className="text-slate-300">{p.title}</span>}
                <span className="shrink-0 text-[11px] text-slate-600">{p.outlet} · {p.date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Redes ── */}
      {(f.social.length > 0 || f.content.length > 0) && (
        <section className="panel mt-4 overflow-x-auto px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Redes sociales</h2>
          {f.social.length > 0 && (
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Cuenta</th><th className="pb-2 text-right">Comentarios del público</th>
                  <th className="pb-2 text-right">Positivos</th><th className="pb-2 text-right">Negativos</th><th className="pb-2 text-right">Sin analizar</th>
                </tr>
              </thead>
              <tbody>
                {f.social.map((s) => (
                  <tr key={`${s.network}-${s.account}`} className="border-b border-[var(--border)]/50 last:border-0">
                    <td className="py-2 font-medium">{s.account} <span className="text-xs text-slate-500">· {s.network === 'instagram' ? 'Instagram' : 'Facebook'}</span></td>
                    <td className="py-2 text-right">{fmtNum(s.comments)}</td>
                    <td className="py-2 text-right text-emerald-400">{fmtNum(s.positive)}</td>
                    <td className={`py-2 text-right ${s.negative ? 'text-red-400' : 'text-slate-600'}`}>{fmtNum(s.negative)}</td>
                    <td className="py-2 text-right text-slate-500">{fmtNum(s.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {f.content.length > 0 && (
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Contenido propio</th><th className="pb-2 text-right">Publicaciones</th>
                  <th className="pb-2 text-right">Likes prom.</th><th className="pb-2 text-right">Comentarios prom.</th>
                </tr>
              </thead>
              <tbody>
                {f.content.map((a) => (
                  <tr key={`${a.network}-${a.label}`} className="border-b border-[var(--border)]/50 last:border-0">
                    <td className="py-2 font-medium">{a.label} <span className="text-xs text-slate-500">· {a.network === 'instagram' ? 'Instagram' : 'Facebook'}</span></td>
                    <td className="py-2 text-right">{fmtNum(a.posts)}</td>
                    <td className="py-2 text-right">{fmtNum(Math.round(a.avgLikes))}</td>
                    <td className="py-2 text-right">{a.avgComments.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {f.socialQuotes.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-sky-300">Ver comentarios destacados ({f.socialQuotes.length})</summary>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {f.socialQuotes.map((q, i) => (
                  <li key={i} className="text-slate-300"><span className="text-xs text-slate-500">{q.account}{q.likes ? ` · ${q.likes} ♥` : ''} —</span> {q.text}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* ── Búsquedas ── */}
      {f.searchPeaks.length > 0 && (
        <section className="panel mt-4 px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">Picos de búsqueda en Google</h2>
          <p className="mb-3 text-[11px] text-slate-600">Días en que cada marca se buscó más (escala relativa, 100 = el mayor pico entre todas).</p>
          <ul className="flex flex-col gap-1 text-sm">
            {f.searchPeaks.map((s, i) => (
              <li key={i} className="flex gap-3"><span className="w-24 text-slate-500">{s.date}</span><span className="w-64 truncate">{s.entity}</span><span className="text-sky-300">{s.value}</span></li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Vacíos ── */}
      {f.gaps.length > 0 && (
        <section className="panel mt-4 px-5 py-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-300">Vacíos de cobertura</h2>
          <ul className="list-disc pl-4 text-sm text-slate-500">{f.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </section>
      )}
    </>
  );
}
