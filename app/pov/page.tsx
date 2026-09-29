import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpen, Eye, Quote, Sparkles, TrendingUp } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getPointOfView, type Citation } from '@/lib/pov';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ContentLocaleSwitch } from '@/components/content-locale-switch';
import { getContentLocale } from '@/lib/content-locale';
import { GenerateRefresh } from '@/components/generate-refresh';
import { sourceLabel } from '@/lib/export-data';

export const metadata = { title: 'Punto de vista' };

const CONF_STYLE: Record<string, string> = {
  high: 'bg-emerald-500/15 text-emerald-300',
  medium: 'bg-amber-500/15 text-amber-300',
  low: 'bg-slate-500/15 text-slate-400',
};
const STATUS_STYLE: Record<string, string> = {
  emerging: 'text-violet-300', rising: 'text-emerald-400',
  declining: 'text-red-400', stable: 'text-slate-500',
};
const CROSS_STYLE: Record<string, string> = {
  ahead: 'bg-violet-500/20 text-violet-300',
  validated: 'bg-emerald-500/20 text-emerald-300',
  hype: 'bg-amber-500/20 text-amber-300',
  cooling: 'bg-slate-500/15 text-slate-400',
  unknown: 'bg-slate-700/40 text-slate-500',
};
const CROSS_HINT: Record<string, string> = {
  ahead: 'la investigación va primero; el mercado aún no la alcanza',
  validated: 'ambos suben: un cambio estructural, no una moda',
  hype: 'mucho ruido en el mercado, poco respaldo de la investigación',
  cooling: 'ninguno de los dos se mueve',
  unknown: 'señal de investigación no disponible: no se saca conclusión',
};
const KIND_STYLE: Record<string, string> = {
  trend: 'bg-sky-500/15 text-sky-300',
  innovation: 'bg-violet-500/15 text-violet-300',
  concept: 'bg-teal-500/15 text-teal-300',
  risk: 'bg-red-500/15 text-red-300',
  opportunity: 'bg-emerald-500/15 text-emerald-300',
};
// Etichette mostrate per i valori enum (la logica continua a usare le chiavi inglesi).
const KIND_LABEL: Record<string, string> = {
  trend: 'tendencia', innovation: 'innovación', concept: 'concepto', risk: 'riesgo', opportunity: 'oportunidad',
};
const CONF_LABEL: Record<string, string> = { high: 'alta', medium: 'media', low: 'baja' };
const CROSS_LABEL: Record<string, string> = {
  ahead: 'adelantado', validated: 'validado', hype: 'hype', cooling: 'enfriándose', unknown: 'sin datos',
};

const pct = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
const sent = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);
/** Oltre il +500% la percentuale diventa illeggibile: mostro il moltiplicatore. */
const growth = (v: number | null) => (v === null ? '—' : v >= 500 ? `×${Math.round(v / 100 + 1)}` : pct(v));

/** Note a piè di pagina cliccabili: portano ai post reali che sostengono la frase. */
function Cites({ ids, byId }: { ids: number[]; byId: Map<number, Citation> }) {
  if (ids.length === 0) return null;
  return (
    <span className="ml-1 inline-flex gap-1 align-super">
      {ids.map((id) => {
        const c = byId.get(id);
        if (!c) return null;
        return (
          <Link key={id} href={`/listening?ids=${id}`}
            title={`${c.title}\n${sourceLabel(c.source)} · ${c.date}${c.sentiment ? ` · ${c.sentiment}` : ''}\nHaz clic para abrir esta publicación`}
            className="rounded bg-sky-500/15 px-1 text-[10px] font-semibold text-sky-300 transition hover:bg-sky-500/30">
            {id}
          </Link>
        );
      })}
    </span>
  );
}

export default async function PovPage() {
  const contentLocale = await getContentLocale();
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No hay ningún proyecto configurado." />;
  const { facts, research, cross, pov, reason } = await getPointOfView(project.id, 90, contentLocale);
  const aiOn = await claudeAvailable();
  const byId = new Map(facts.citations.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        title={t('page.pov.title', 'Punto de vista')}
        info="Un argumento defendible sobre hacia dónde se mueve el mercado, construido con 90 días de tus datos cruzados con investigación académica. Cada cifra la calcula la base de datos a partir de tus menciones (la IA nunca la inventa) y cada afirmación cita publicaciones reales que puedes abrir. El cruce Mercado × Investigación es lo que lo convierte en un punto de vista y no en un informe: muestra dónde la investigación va por delante del mercado y dónde el mercado hace ruido sin investigación que lo respalde. Las contraseñales se incluyen a propósito: son las que hacen creíble la tesis."
        subtitle="La tesis que puedes llevar a una reunión: qué está cambiando en los últimos 90 días, las cifras que lo prueban, las publicaciones que lo evidencian, además de lo que dice la investigación y lo que va en contra. Cada bloque está listo para una diapositiva. Haz clic en cualquier número de cita para leer la publicación original."
      />

      {/* Numeri verificati: presenti SEMPRE, anche senza AI. */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="panel px-4 py-3" title="Menciones recopiladas en los últimos 30 días, comparadas con los 30 días anteriores">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Volumen · últimos 30 d</p>
          <p className="mt-1 text-2xl font-bold">{fmtNum(facts.totalNow)}</p>
          <p className="text-xs text-slate-500">{pct(facts.volumeChangePct)} vs. 30 d anteriores</p>
        </div>
        <div className="panel px-4 py-3" title="Sentimiento promedio de los últimos 30 días vs. los 30 días anteriores (−1 a +1)">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Sentimiento · últimos 30 d</p>
          <p className="mt-1 text-2xl font-bold">{sent(facts.sentNow)}</p>
          <p className="text-xs text-slate-500">antes {sent(facts.sentPrev)}</p>
        </div>
        <div className="panel px-4 py-3" title="Total de menciones analizadas en la ventana de 90 días de este punto de vista">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Base de evidencia</p>
          <p className="mt-1 text-2xl font-bold">{fmtNum(facts.total)}</p>
          <p className="text-xs text-slate-500">menciones · {facts.days} días</p>
        </div>
        <div className="panel px-4 py-3" title={research
          ? `Trabajos académicos que coinciden con “${research.query}” en el índice abierto OpenAlex.${research.last3 !== null && research.prev3 !== null
            ? ` Crecimiento: ${fmtNum(research.last3)} trabajos en los últimos 3 años completos vs. ${fmtNum(research.prev3)} en los 3 anteriores.` : ''}`
          : 'Evidencia académica no disponible'}>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Investigación</p>
          <p className="mt-1 text-2xl font-bold">{research ? fmtNum(research.total) : '—'}</p>
          <p className="text-xs text-slate-500">
            {research ? `artículos${research.growthPct !== null ? ` · ${growth(research.growthPct)} en 3 años` : ''}` : 'sin datos'}
          </p>
        </div>
      </div>

      {!pov ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12">
          <p className="max-w-lg text-center text-sm text-slate-400">
            {reason === 'thin_data'
              ? 'Todavía no hay suficientes datos: un punto de vista necesita al menos ~15 menciones en la ventana. Las cifras verificadas de arriba ya están disponibles.'
              : reason === 'no_ai'
                ? 'El argumento necesita una clave de IA (o se alcanzó el tope de gasto). Las cifras verificadas de arriba siguen disponibles.'
                : 'Construye el argumento con los últimos 90 días: qué está cambiando, las cifras que lo prueban y las publicaciones que lo evidencian (unos 3 centavos de dólar). Desde entonces se actualiza solo cada semana; abrir esta página nunca cuesta nada.'}
          </p>
          {aiOn && reason !== 'thin_data' && (
            <>
              <ContentLocaleSwitch current={contentLocale} />
              <GenerateRefresh endpoint="/api/pov" label="Construir el punto de vista" busyLabel="Analizando 90 días…" />
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Tesi */}
          <section className="panel border-sky-500/30 px-6 py-5">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-sky-400">La tesis</p>
            <h2 className="text-lg font-semibold leading-snug text-slate-100">{pov.headline}</h2>
          </section>

          {/* Apertura discorsiva: introduce il punto di vista prima dei blocchi */}
          {pov.intro?.length > 0 && (
            <section className="panel px-6 py-5">
              <div className="flex flex-col gap-3">
                {pov.intro.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-300">
                    {p.text}
                    <Cites ids={p.citations} byId={byId} />
                    {p.research.length > 0 && research?.recentWorks && (
                      <span className="ml-1 inline-flex gap-1 align-super">
                        {p.research.map((ri) => {
                          const w = research.recentWorks[ri];
                          if (!w) return null;
                          return (
                            <a key={ri} href={w.url} target="_blank" rel="noopener noreferrer"
                              title={`${w.title}\n${w.institution ?? 'institución desconocida'} · ${w.year} · ${w.citations} citas`}
                              className="rounded bg-violet-500/15 px-1 text-[10px] font-semibold text-violet-300 transition hover:bg-violet-500/30">
                              {w.year}
                            </a>
                          );
                        })}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Blocchi pronti per slide: titolo + testo + numeri */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <TrendingUp className="size-4 text-emerald-400" /> La historia en {pov.blocks.length} bloques
              <span className="text-[11px] font-normal text-slate-600">— cada uno es una diapositiva: título, narrativa, cifras</span>
            </h2>
            <div className="flex flex-col gap-3">
              {pov.blocks.map((b, i) => (
                <article key={i} className="panel px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold tabular-nums text-slate-600">{String(i + 1).padStart(2, '0')}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${KIND_STYLE[b.kind]}`}
                      title={`Este bloque se plantea como ${KIND_LABEL[b.kind] ?? b.kind}`}>
                      {KIND_LABEL[b.kind] ?? b.kind}
                    </span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${CONF_STYLE[b.confidence]}`}
                      title="Cuánto respaldan los datos este bloque: alta = volumen sólido y tendencia consistente; baja = muestra escasa">
                      confianza {CONF_LABEL[b.confidence] ?? b.confidence}
                    </span>
                  </div>

                  <h3 className="mt-1.5 text-base font-semibold leading-snug text-slate-100">
                    {b.title}<Cites ids={b.citations} byId={byId} />
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{b.body}</p>

                  {b.stats.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                      {b.stats.map((st, k) => (
                        <div key={k} className="min-w-[120px] flex-1 rounded-lg bg-white/[0.03] px-3 py-2"
                          title={`${st.value} — ${st.label}. Cifra tomada de los datos verificados de abajo.`}>
                          <p className="text-xl font-bold tabular-nums text-sky-300">{st.value}</p>
                          <p className="text-[11px] leading-tight text-slate-500">{st.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          {/* Contro-segnali */}
          {pov.counterSignals.length > 0 && (
            <section className="panel border-amber-500/30 px-5 py-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
                <AlertTriangle className="size-4" /> Contraseñales
              </h2>
              <p className="mb-2 text-[11px] text-slate-500">Lo que va en contra de la tesis: léelo antes de comprometerte con ella.</p>
              <ul className="flex flex-col gap-2">
                {pov.counterSignals.map((c, i) => (
                  <li key={i} className="text-sm leading-relaxed text-slate-300">
                    <span className="mr-1.5 text-amber-400">▸</span>{c.point}<Cites ids={c.citations} byId={byId} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {pov.implications.length > 0 && (
              <section className="panel px-5 py-4">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <ArrowRight className="size-4 text-sky-400" /> ¿Y entonces qué?
                </h2>
                <ul className="flex flex-col gap-2">
                  {pov.implications.map((t, i) => (
                    <li key={i} className="text-sm leading-relaxed text-slate-300">
                      <span className="mr-1.5 text-sky-400">→</span>{t}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {pov.watch.length > 0 && (
              <section className="panel px-5 py-4">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Eye className="size-4 text-violet-400" /> Qué vigilar
                </h2>
                <ul className="flex flex-col gap-2">
                  {pov.watch.map((t, i) => (
                    <li key={i} className="text-sm leading-relaxed text-slate-300">
                      <span className="mr-1.5 text-violet-400">◦</span>{t}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="flex items-center gap-3">
            <GenerateRefresh endpoint="/api/pov" label="Reconstruir el argumento" busyLabel="Reanalizando…" />
            <ContentLocaleSwitch current={pov.locale ?? 'en'} translateEndpoint="/api/pov/translate" />
            <span className="text-xs text-slate-600">
              Generado el {new Date(pov.generatedAt).toLocaleString('es-CO')} · se actualiza automáticamente una vez por semana
            </span>
          </div>
        </div>
      )}

      {/* Incrocio mercato × ricerca: dove nasce il punto di vista non ovvio */}
      {cross.length > 0 && (
        <section className="panel mt-6 px-5 py-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Sparkles className="size-4 text-violet-400" /> Mercado × Investigación
          </h2>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            Lo que se habla en el mercado cruzado con lo que publica la investigación. En la brecha entre ambos vive un
            punto de vista no obvio: algo en lo que los laboratorios ya trabajan pero que el mercado aún no ha incorporado,
            o algo que hace ruido en línea sin ninguna investigación que lo respalde.
          </p>
          <ul className="flex flex-col gap-1.5 text-xs">
            {cross.map((c) => (
              <li key={c.topic} className="flex flex-wrap items-center gap-2"
                title={`“${c.topic}”\nMercado: ${c.marketNow} menciones en 30 días${c.marketChangePct !== null ? ` (${pct(c.marketChangePct)} vs. los 30 anteriores)` : ' (nuevo en la ventana)'}\nInvestigación: ${fmtNum(c.researchWorks)} trabajos académicos${c.researchGrowthPct !== null ? `, ${growth(c.researchGrowthPct)} en los últimos 2 años completos` : ' (muy pocos para medir una tendencia)'}\nLectura: ${CROSS_HINT[c.quadrant]}`}>
                <span className={`w-[86px] shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-medium uppercase ${CROSS_STYLE[c.quadrant]}`}>
                  {CROSS_LABEL[c.quadrant] ?? c.quadrant}
                </span>
                <Link href={`/listening?q=${encodeURIComponent(c.topic)}`}
                  className="w-40 shrink-0 truncate text-slate-300 hover:text-sky-300">{c.topic}</Link>
                <span className="w-28 shrink-0 tabular-nums text-slate-500">
                  mercado {c.marketChangePct === null ? 'nuevo' : pct(c.marketChangePct)}
                </span>
                <span className="flex-1 tabular-nums text-slate-500">
                  investigación {c.researchGrowthPct === null ? '—' : growth(c.researchGrowthPct)}
                  <span className="ml-1 text-slate-600">({fmtNum(c.researchWorks)} artículos)</span>
                </span>
                <span className="hidden text-slate-600 sm:inline">{CROSS_HINT[c.quadrant]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Evidenza: i numeri che l'AI ha potuto usare, verificabili uno per uno */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="panel px-5 py-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Quote className="size-4 text-slate-500" /> La evidencia detrás
          </h2>
          <p className="mb-3 text-[11px] text-slate-500">
            Tema por tema: últimos 30 días vs. los 30 anteriores. Estas son las cifras que el argumento tuvo que usar, calculadas por la base de datos, no por la IA.
          </p>
          <ul className="flex flex-col gap-1.5 text-xs">
            {facts.topics.slice(0, 10).map((t) => (
              <li key={t.topic} className="flex items-center gap-2"
                title={`“${t.topic}”: ${t.nNow} menciones en los últimos 30 días vs. ${t.nPrev} en los 30 anteriores${t.changePct !== null ? ` (${pct(t.changePct)})` : ''}. Sentimiento ${sent(t.sNow)} vs. ${sent(t.sPrev)}.`}>
                <Link href={`/listening?q=${encodeURIComponent(t.topic)}`}
                  className="w-40 shrink-0 truncate text-slate-300 hover:text-sky-300">{t.topic}</Link>
                <span className={`w-16 shrink-0 text-right tabular-nums ${STATUS_STYLE[t.status]}`}>
                  {t.changePct === null ? 'nuevo' : pct(t.changePct)}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums text-slate-500">{t.nPrev} → {t.nNow}</span>
                <span className="flex-1 text-right tabular-nums text-slate-600">{sent(t.sPrev)} → {sent(t.sNow)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel px-5 py-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <BookOpen className="size-4 text-violet-400" /> Evidencia académica
          </h2>
          {!research || research.status !== 'ok' ? (
            <p className="py-6 text-center text-sm leading-relaxed text-slate-500">
              {research?.status === 'empty'
                ? <>Ninguna literatura académica coincide con “{research.query}”. Es normal para marcas, productos o temas muy locales: los índices académicos solo cubren temas de investigación.</>
                : <>El índice de investigación no está disponible temporalmente (se alcanzó el límite de uso o el servicio no responde). Se guarda en caché a diario y se reintenta solo; nada más en esta página se ve afectado.</>}
            </p>
          ) : (
            <>
              <p className="mb-3 text-[11px] text-slate-500">
                Quién investiga este tema, según el índice abierto OpenAlex ({fmtNum(research.total)} trabajos que coinciden con “{research.query}”
                {research.growthPct !== null && research.last3 !== null && research.prev3 !== null
                  ? `, ${growth(research.growthPct)} en 3 años: ${fmtNum(research.last3)} trabajos en los últimos 3 años completos vs. ${fmtNum(research.prev3)} en los 3 anteriores`
                  : ''}). Independiente de la conversación social: úsalo para corroborarla o cuestionarla.
              </p>
              {research.topInstitutions.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {research.topInstitutions.slice(0, 6).map((inst) => (
                    <span key={inst.name} className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-300"
                      title={`${inst.name}: ${fmtNum(inst.works)} trabajos publicados sobre este tema`}>
                      {inst.name} <span className="text-slate-500">{fmtNum(inst.works)}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Geografia della ricerca: dove si studia questo tema. */}
              {research.byCountry.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Dónde se hace la investigación
                  </p>
                  <ul className="flex flex-col gap-1">
                    {research.byCountry.slice(0, 6).map((c) => {
                      const max = research.byCountry[0].works || 1;
                      return (
                        <li key={c.code} className="flex items-center gap-2 text-[11px]"
                          title={`${c.name}: ${fmtNum(c.works)} trabajos sobre este tema (instituciones con sede allí)`}>
                          <span className="w-28 shrink-0 truncate text-slate-300">{c.name}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                            <span className="block h-full rounded-full bg-violet-400/70"
                              style={{ width: `${Math.round((c.works / max) * 100)}%` }} />
                          </span>
                          <span className="w-14 shrink-0 text-right tabular-nums text-slate-500">{fmtNum(c.works)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Fronte recente: cosa leggere quando la ricerca corre avanti. */}
              {research.recentWorks.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Frente de investigación · últimos 18 meses
                  </p>
                  <p className="mb-1.5 text-[11px] text-slate-600">
                    Los trabajos recientes más citados: qué leer cuando la investigación va por delante del mercado.
                  </p>
                  <ul className="flex flex-col gap-1 text-xs">
                    {research.recentWorks.slice(0, 3).map((w) => (
                      <li key={w.url}>
                        <a href={w.url} target="_blank" rel="noopener noreferrer"
                          className="text-slate-300 transition hover:text-violet-300"
                          title={`${w.institution ?? 'institución desconocida'} · ${w.citations} citas${w.openAccess ? ' · acceso abierto' : ''}`}>
                          {w.title}
                        </a>
                        <span className="ml-1 text-slate-600">{w.year} · {fmtNum(w.citations)} citas</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Trabajos fundamentales · de todos los tiempos
              </p>
              <p className="mb-1.5 text-[11px] text-slate-600">
                La literatura más citada sobre el tema, sin importar el año: es contexto, no evidencia de lo que pasa ahora.
              </p>
              <ul className="flex flex-col gap-1.5 text-xs">
                {research.topWorks.slice(0, 5).map((w) => (
                  <li key={w.url}>
                    <a href={w.url} target="_blank" rel="noopener noreferrer"
                      className="text-slate-300 transition hover:text-violet-300"
                      title={`${w.institution ?? 'institución desconocida'} · ${w.citations} citas${w.openAccess ? ' · acceso abierto' : ''}`}>
                      {w.title}
                    </a>
                    <span className="ml-1 text-slate-600">{w.year} · {fmtNum(w.citations)} citas</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}
