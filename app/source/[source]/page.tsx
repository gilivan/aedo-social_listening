import Link from 'next/link';
import { Info } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { sourceDeepDive } from '@/lib/deepdive';
import { SOURCE_META } from '@/lib/connectors';
import { sourceColor, sourceLabel } from '@/lib/source-label';
import { PageHeader, KpiCard, MentionCard, EmptyState, fmtNum } from '@/components/ui';
import { SourceVolumeCompare, SentimentCompareBars } from '@/components/deepdive-charts';

// Deep-dive per fonte: lente su un singolo canale, sempre confrontato col
// totale del progetto (stessi dati, quindi coerenza numerica garantita).

export const metadata = { title: 'Análisis a fondo por fuente' };

const sentLabel = (v: number | null) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const sentDot = (v: number) => (v > 0.15 ? 'text-emerald-400' : v < -0.15 ? 'text-red-400' : 'text-slate-400');

export default async function SourceDeepDivePage({ params }: {
  params: Promise<{ source: string }>;
}) {
  const { source } = await params;
  // Nessun rifiuto per "fonte sconosciuta": un progetto nato da file porta
  // canali che nessun connettore produce, e hanno diritto alla stessa analisi.
  const meta = {
    label: sourceLabel(source),
    color: sourceColor(source),
    note: SOURCE_META[source]?.note,
  };
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No hay ningún proyecto configurado." />;

  const d = await sourceDeepDive(project.id, source);

  return (
    <>
      <PageHeader
        title={`Análisis a fondo: ${meta.label}`}
        subtitle={`Cómo se compara la conversación en ${meta.label} con todo el proyecto: los mismos datos, filtrados por canal`}
        info={
          <>
            <p className="mb-1 font-semibold">¿Qué es esto?</p>
            <p>Una vista enfocada en un solo canal. Cada número aquí es un subconjunto de los
            totales del proyecto: las mismas menciones, filtradas por fuente y comparadas con el
            total, así que las cifras siempre cuadran.</p>
          </>
        }
      />

      {meta.note && (
        <div className="mb-4 flex max-w-3xl items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/5 px-4 py-3 text-xs leading-relaxed text-slate-300">
          <Info className="mt-0.5 size-4 shrink-0 text-sky-400" />
          <p><span className="font-semibold text-sky-300">Cómo se recopilan estos datos:</span> {meta.note}</p>
        </div>
      )}

      {d.kpi.src7 === 0 && d.latest.length === 0 ? (
        <EmptyState message={`Todavía no hay menciones de ${meta.label}. Si la fuente está activada en Ajustes → Fuentes, los datos aparecerán tras la próxima actualización.`} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div title={`Menciones recopiladas de ${meta.label} en los últimos 7 días: ${fmtNum(d.kpi.src7)}, es decir, el ${(d.kpi.share * 100).toFixed(1)}% de las ${fmtNum(d.kpi.all7)} menciones de todo el proyecto en el mismo periodo.`}>
              <KpiCard label={`Menciones 7 d · ${meta.label}`} value={fmtNum(d.kpi.src7)}
                hint={`${(d.kpi.share * 100).toFixed(1)}% de las ${fmtNum(d.kpi.all7)} del proyecto`} />
            </div>
            <div title={`Sentimiento promedio (IA) de las menciones analizadas de este canal en los últimos 7 días, en una escala de −1 (muy negativo) a +1 (muy positivo), junto al promedio de todo el proyecto para comparar.`}>
              <KpiCard label="Sentimiento prom. · canal" value={sentLabel(d.kpi.avgSentimentSrc)}
                hint={`todo el proyecto: ${sentLabel(d.kpi.avgSentimentAll)}`} />
            </div>
            <div title={`Autores distintos que publicaron en ${meta.label} en los últimos 7 días.`}>
              <KpiCard label="Autores activos 7 d" value={fmtNum(d.kpi.authors7)}
                hint="autores distintos en este canal" />
            </div>
            <div title={`Temas distintos que la IA detectó en este canal en los últimos 30 días.`}>
              <KpiCard label="Temas 30 d" value={fmtNum(d.topics.length)}
                hint="temas detectados en este canal" />
            </div>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title="Barras: menciones diarias de este canal. Área gris: todo el proyecto. Pasa el cursor sobre un día para ver la participación del canal.">
                Volumen: canal vs. todo el proyecto (14 días)
              </h2>
              <SourceVolumeCompare data={d.volume} color={meta.color} label={meta.label} />
            </section>

            <section className="panel px-5 py-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-300"
                title="Distribución del sentimiento de las menciones analizadas de este canal vs. todo el proyecto, últimos 7 días.">
                Sentimiento: canal vs. todo el proyecto (7 días)
              </h2>
              <SentimentCompareBars src={d.sentimentSrc} all={d.sentimentAll} label={meta.label} />
            </section>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title="Temas encontrados en este canal en los últimos 30 días. La barra muestra qué parte de la conversación total de cada tema ocurre en este canal.">
                Temas del canal (30 días)
              </h2>
              {d.topics.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-600">Todavía no hay temas analizados en este canal.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-xs">
                  {d.topics.map((t) => {
                    const pct = t.nAll > 0 ? Math.round((t.nSrc / t.nAll) * 100) : 0;
                    return (
                      <li key={t.topic} className="flex items-center gap-2">
                        <Link href={`/listening?fonte=${source}&q=${encodeURIComponent(t.topic)}`}
                          className="w-44 shrink-0 truncate text-slate-300 hover:text-sky-300" title={`Ver menciones de "${t.topic}" en ${meta.label}`}>
                          {t.topic}
                        </Link>
                        <div className="h-2.5 flex-1 overflow-hidden rounded bg-white/5"
                          title={`${t.nSrc} de las ${t.nAll} menciones del proyecto sobre este tema están en ${meta.label} (${pct}%)`}>
                          <div className="h-full rounded" style={{ width: `${pct}%`, background: meta.color }} />
                        </div>
                        <span className="w-20 shrink-0 text-right text-slate-500">{t.nSrc}/{t.nAll} · {pct}%</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title="Los autores que más publican en este canal en los últimos 30 días. Haz clic en uno para ver sus publicaciones.">
                Autores principales en {meta.label} (30 días)
              </h2>
              {d.authors.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-600">No hay autores registrados en este canal.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {d.authors.map((a) => (
                    <Link key={a.author}
                      href={`/listening?fonte=${source}&autore=${encodeURIComponent(a.author)}`}
                      className="rounded bg-white/5 px-2 py-1 text-slate-300 transition hover:bg-sky-500/15 hover:text-sky-300"
                      title={`${a.n} publicaciones en ${meta.label}${a.avgSent !== null ? ` · sentimiento prom. ${sentLabel(a.avgSent)}` : ''}`}>
                      {a.author} <span className="text-slate-500">×{a.n}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title="Temas que se aceleran en este canal: menciones de los últimos 7 días comparadas con el promedio semanal del canal en los 14 días anteriores. NUEVO = el tema no aparecía antes.">
                Emergentes en {meta.label} <span className="font-normal text-slate-500">(7 días)</span>
              </h2>
              {d.emerging.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-600"
                  title="Requiere al menos 2 menciones de un tema en los últimos 7 días en este canal; los temas vienen del análisis de IA.">
                  Todavía no se detectan temas en aceleración en este canal.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-xs">
                  {d.emerging.map((t) => (
                    <li key={t.topic} className="flex items-center gap-2">
                      <Link href={`/listening?fonte=${source}&q=${encodeURIComponent(t.topic)}`}
                        className="flex-1 truncate text-slate-300 hover:text-sky-300"
                        title={`Ver menciones de "${t.topic}" en ${meta.label}`}>{t.topic}</Link>
                      {t.nPrev === 0 ? (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-semibold text-violet-300"
                          title={`"${t.topic}" apareció en ${meta.label} por primera vez esta semana: ${t.nNow} menciones en los últimos 7 días, ninguna en los 14 anteriores.`}>
                          NUEVO
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300"
                          title={`${t.nNow} menciones en los últimos 7 días vs. un promedio semanal de ${(t.nPrev / 2).toFixed(1)} en los 14 días anteriores → crece ${t.growth.toFixed(1)}×.`}>
                          ↑ {t.growth.toFixed(1)}×
                        </span>
                      )}
                      <span className="w-8 text-right text-slate-500" title={`${t.nNow} menciones en los últimos 7 días`}>{t.nNow}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title="La personalidad del canal, calculada con sus menciones de los últimos 30 días: cuándo está más activo, qué idiomas habla, si lo dominan pocas voces y qué tan relevante es su contenido para tu tema.">
                Identidad del canal <span className="font-normal text-slate-500">(30 días)</span>
              </h2>
              <ul className="flex flex-col gap-2.5 text-xs">
                <li title={d.character.peak
                  ? `La hora con más publicaciones en los últimos 30 días (America/Bogota): ${DOW[d.character.peak.dow]} ${d.character.peak.hour}:00–${d.character.peak.hour + 1}:00, ${d.character.peak.n} menciones. Útil para programar tus publicaciones.`
                  : 'Todavía no hay suficientes datos.'}>
                  <p className="text-slate-500">Momento más activo</p>
                  <p className="font-semibold text-slate-200">
                    {d.character.peak ? `${DOW[d.character.peak.dow]} · ${String(d.character.peak.hour).padStart(2, '0')}:00` : '—'}
                  </p>
                </li>
                <li title="Idiomas de las menciones de este canal en los últimos 30 días, del más frecuente al menos frecuente.">
                  <p className="text-slate-500">Idiomas</p>
                  <p className="font-semibold uppercase text-slate-200">
                    {d.character.languages.length
                      ? d.character.languages.map((l) => l.language).join(' · ')
                      : '—'}
                  </p>
                </li>
                <li title={d.character.top3Share !== null
                  ? `Los 3 autores más activos escribieron el ${Math.round(d.character.top3Share * 100)}% de las publicaciones del canal (${d.character.authorsTotal} publicaciones con autor conocido en 30 días). Por encima de ~50%, la conversación depende de unas pocas voces; por debajo, está ampliamente distribuida.`
                  : 'No hay autores registrados en este canal.'}>
                  <p className="text-slate-500">Concentración de voces</p>
                  <p className="font-semibold text-slate-200">
                    {d.character.top3Share !== null
                      ? `top 3 autores = ${Math.round(d.character.top3Share * 100)}% ${d.character.top3Share > 0.5 ? '· dominan pocas voces' : '· distribuida'}`
                      : '—'}
                  </p>
                </li>
                <li title={d.character.relevanceSrc !== null
                  ? `Relevancia promedio según la IA (1–5 estrellas) del contenido de este canal vs. todo el proyecto, últimos 30 días. Más alta = este canal habla con más precisión de tu tema.`
                  : 'Las estrellas de relevancia aparecen después del análisis de IA.'}>
                  <p className="text-slate-500">Relevancia para tu tema</p>
                  <p className="font-semibold text-slate-200">
                    {d.character.relevanceSrc !== null
                      ? <>★ {d.character.relevanceSrc.toFixed(1)} <span className="font-normal text-slate-500">vs ★ {d.character.relevanceAll?.toFixed(1) ?? '—'} proyecto</span></>
                      : '—'}
                  </p>
                </li>
              </ul>
            </section>

            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title={`Temas en los que el sentimiento promedio de ${meta.label} más difiere del de todas las demás fuentes juntas (últimos 30 días, al menos 3 menciones analizadas de cada lado). Aquí es donde el canal ve la historia de otra manera.`}>
                Dónde {meta.label} discrepa <span className="font-normal text-slate-500">(30 días)</span>
              </h2>
              {d.disagreements.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-600"
                  title="Requiere al menos 3 menciones analizadas por IA del mismo tema, tanto en este canal como en otros.">
                  No hay diferencias de sentimiento significativas con el resto del proyecto.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-xs">
                  {d.disagreements.map((t) => (
                    <li key={t.topic} className="flex items-center gap-2"
                      title={`"${t.topic}": en ${meta.label} el sentimiento promedio (IA) es ${sentLabel(t.sSrc)} (${t.nSrc} menciones); en todas las demás fuentes, ${sentLabel(t.sRest)} (${t.nRest} menciones). Escala de −1 (muy negativo) a +1 (muy positivo).`}>
                      <Link href={`/listening?fonte=${source}&q=${encodeURIComponent(t.topic)}`}
                        className="flex-1 truncate text-slate-300 hover:text-sky-300"
                        title={`Ver menciones de "${t.topic}" en ${meta.label}`}>{t.topic}</Link>
                      <span className={`font-semibold ${sentDot(t.sSrc)}`}
                        title={`${meta.label}: sentimiento promedio ${sentLabel(t.sSrc)} en ${t.nSrc} menciones`}>{sentLabel(t.sSrc)}</span>
                      <span className="text-slate-600" title="comparado con">vs.</span>
                      <span className={`font-semibold ${sentDot(t.sRest)}`}
                        title={`Todas las demás fuentes: sentimiento promedio ${sentLabel(t.sRest)} en ${t.nRest} menciones`}>{sentLabel(t.sRest)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="panel px-5 py-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-300">Lo último de {meta.label}</h2>
              <Link href={`/listening?fonte=${source}`} className="text-xs text-sky-400 hover:text-sky-300">
                todas las menciones de {meta.label} →
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {d.latest.length
                ? d.latest.map((m) => <MentionCard key={m.id} m={m} />)
                : <EmptyState message="Todavía no hay menciones." />}
            </div>
          </section>
        </>
      )}
    </>
  );
}
