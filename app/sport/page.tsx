import { Trash2, Trophy, TrendingUp, Calendar, Activity, MessageSquare } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { sportStats } from '@/lib/sport';
import { getConnectorCredStatuses, hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { PageHeader, fmtDate, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ConnectorKeys } from '@/components/connector-keys';
import { GenerateRefresh } from '@/components/generate-refresh';
import {
  ResultBadge, ShiftBar, SeasonTimeline, AnatomyCurve, MarginScatter, CorrelationTile,
} from '@/components/sport-charts';
import { TeamSearch } from '@/components/team-search';
import { addSportSourceAction, removeSportSourceAction } from './actions';

export const metadata = { title: 'Deportes' };

const COMPETITIONS = [
  { code: 'SA', label: 'Serie A' }, { code: 'PL', label: 'Premier League' },
  { code: 'CL', label: 'Champions League' }, { code: 'BL1', label: 'Bundesliga' },
  { code: 'PD', label: 'La Liga' }, { code: 'FL1', label: 'Ligue 1' },
];
const COMPETITION_LABEL: Record<string, string> = Object.fromEntries(COMPETITIONS.map((c) => [c.code, c.label]));

export default async function SportPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return null;

  await hydrateConnectorCredentials();
  const [stats, currentUser, credStatuses] = await Promise.all([
    sportStats(project.id), getCurrentUser(), getConnectorCredStatuses(),
  ]);
  const canEditKeys = isAdmin(currentUser);
  const hasData = stats.sources.some((s) => s.totalMatches > 0);

  return (
    <>
      <PageHeader
        title={t('page.sport.title', 'Deportes')}
        info="Una sección autónoma, como Reseñas: el resultado de un partido es un hecho con fecha fija, no una mención con sentimiento. La idea es cruzarlo con lo que AEDO ya mide (¿el sentimiento de los hinchas realmente se mueve tras una victoria o una derrota?) y, para los clubes que cotizan en bolsa, si también se mueve el precio de la acción. Sin IA, sin números inventados: el sentimiento viene de tus propias menciones analizadas, los precios de Alpha Vantage y los resultados de football-data.org."
        subtitle="¿Ganar realmente cambia algo? Resultados de partidos cruzados con el sentimiento de los hinchas y, para clubes que cotizan, el precio de la acción: no solo un marcador."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <GenerateRefresh endpoint="/api/sport/refresh" label={t('page.sport.refresh', 'Buscar actualizaciones')} busyLabel={t('page.sport.checking', 'Revisando…')} />
      </div>

      {/* ── Fonti configurate ─────────────────────────────────────────── */}
      {/* Chiuso di default quando c'è già almeno una squadra: una volta
          configurato, la pagina si apre sulle analisi, non sul form. */}
      <details className="panel mb-4 px-5 py-5" open={stats.sources.length === 0}>
        <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-300 [&::-webkit-details-marker]:hidden">
          {t('page.sport.teams', 'Equipos seguidos')}
          {stats.sources.length > 0 && <span className="text-xs font-normal text-slate-600">({stats.sources.length}, clic para editar)</span>}
        </summary>

        {stats.sources.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {stats.sources.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                <Trophy className="size-4 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-200">{s.teamName}</p>
                  <p className="truncate text-[11px] text-slate-600">
                    {COMPETITION_LABEL[s.competition] ?? s.competition}{s.ticker ? ` · ${s.ticker}` : ''}
                  </p>
                </div>
                <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                  {s.totalMatches > 0 && <span>{fmtNum(s.totalMatches)} partidos registrados</span>}
                  <span className="hidden sm:inline">{s.lastFetchedAt ? `revisado ${fmtDate(s.lastFetchedAt)}` : 'aún sin revisar'}</span>
                </span>
                <form action={removeSportSourceAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" aria-label={`Eliminar ${s.teamName}`} className="text-slate-600 transition hover:text-red-400">
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        <form action={addSportSourceAction} className="grid gap-2 rounded-lg border border-[var(--border)] px-4 py-3 sm:grid-cols-2">
          <p className="text-xs font-semibold text-slate-300 sm:col-span-2">
            <Trophy className="mr-1 inline size-3.5" /> Agregar un equipo
            <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">clave gratuita · football-data.org</span>
          </p>
          <TeamSearch competitions={COMPETITIONS} />
          <input name="ticker" placeholder="Ticker bursátil, si cotiza (p. ej. JUVE.MI), opcional"
            className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500/50" />
          <button type="submit" className="self-start rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 sm:col-span-2">
            Agregar equipo
          </button>
          <p className="text-[11px] text-slate-600 sm:col-span-2">
            La búsqueda toma automáticamente el nombre exacto del equipo: ya no tienes que escribirlo a mano.
          </p>
        </form>

        {/* Fuori dal <form> di sopra: i tag <form> non possono annidarsi,
            e ConnectorKeys ne renderizza uno proprio per salvare la chiave. */}
        {canEditKeys && credStatuses['football-data'] && (
          <div className="mt-3 rounded-lg border border-[var(--border)] px-4 py-3">
            <ConnectorKeys connectorId="football-data" fields={credStatuses['football-data'].fields} />
          </div>
        )}

        {canEditKeys && credStatuses.alphavantage && (
          <div className="mt-3 rounded-lg border border-[var(--border)] px-4 py-3">
            <p className="mb-1 text-xs font-semibold text-slate-300">
              <TrendingUp className="mr-1 inline size-3.5" /> Precio de la acción (opcional, solo para clubes que cotizan)
              <span className="ml-1.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">clave gratuita · Alpha Vantage</span>
            </p>
            <p className="mb-2 text-[11px] text-slate-600">
              Agrega un ticker arriba (p. ej. JUVE.MI para Juventus, MANU para Manchester United, BVB.DE para Borussia Dortmund) para habilitar el cruce con el precio de la acción. La cuota gratuita es limitada (25 solicitudes/día); se consulta como máximo una vez al día.
            </p>
            <ConnectorKeys connectorId="alphavantage" fields={credStatuses.alphavantage.fields} />
          </div>
        )}
      </details>

      {stats.sources.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Trophy className="size-6 text-slate-600" />
          <p className="max-w-md text-sm text-slate-400">Agrega un equipo arriba para empezar: calendario, resultados y, para clubes que cotizan, el cruce con el precio de la acción.</p>
        </div>
      ) : !hasData ? (
        <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
          <p className="text-sm text-slate-400">Equipo agregado: pulsa “Buscar actualizaciones” arriba para traer su calendario.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* ── La stagione a colpo d'occhio ───────────────────────────── */}
          <section className="panel px-5 py-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Activity className="size-4 text-sky-400" />
              {t('page.sport.timeline', 'La temporada en un solo eje')}
              {stats.primaryTeam && <span className="text-xs font-normal text-slate-600">· {stats.primaryTeam}</span>}
            </h2>
            <p className="mb-3 text-[11px] text-slate-600">
              Puntos en la liga, ánimo de los hinchas y, para clubes que cotizan, el precio de la acción, en la misma línea de tiempo. Son tres unidades distintas, así que la pregunta no es la altura de cada línea, sino si se mueven juntas.
            </p>
            <SeasonTimeline data={stats.timeline} hasStock={stats.timeline.some((p) => p.stockIndex !== null)} />
          </section>

          {stats.aggregate.length > 0 && (
            <section className="panel px-5 py-5">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('page.sport.aggregate', '¿Ganar cambia algo?')}</h2>
              <p className="mb-3 text-[11px] text-slate-600">
                Cambio promedio en el sentimiento de los hinchas (día del partido + el día siguiente, vs. la semana anterior), en el precio de la acción (siguiente día bursátil vs. el anterior) y en cuánto se habla, agrupado por resultado.
              </p>
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="flex flex-col gap-2.5">
                  {stats.aggregate.map((a) => (
                    <div key={a.result} className="flex flex-wrap items-center gap-4 rounded-lg bg-white/[0.03] px-4 py-3">
                      <ResultBadge result={a.result} />
                      <span className="w-20 shrink-0 text-xs text-slate-500">{a.n} partido{a.n === 1 ? '' : 's'}</span>
                      <div className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-[11px] text-slate-500">sentimiento</span>
                        <ShiftBar value={a.avgSentimentShift} max={1} />
                      </div>
                      {a.avgStockShiftPct !== null && (
                        <div className="flex items-center gap-2">
                          <span className="w-14 shrink-0 text-[11px] text-slate-500">acción</span>
                          <ShiftBar value={a.avgStockShiftPct} max={5} suffix="%" />
                        </div>
                      )}
                      {a.avgVolume > 0 && (
                        <span className="ml-auto text-[11px] text-slate-500">
                          <MessageSquare className="mr-1 inline size-3" />{fmtNum(a.avgVolume)} menciones
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2 lg:w-48">
                  <CorrelationTile correlation={stats.correlation} />
                  {stats.splits.map((s) => (
                    <div key={s.key} className="rounded-lg bg-white/[0.03] px-4 py-2.5">
                      <p className="text-[11px] uppercase tracking-wide text-slate-600">{s.key}</p>
                      <p className="text-sm text-slate-300">
                        {s.wins}/{s.n} ganados
                        {s.avgSentimentShift !== null && (
                          <span className={`ml-2 text-xs tabular-nums ${s.avgSentimentShift >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                            {s.avgSentimentShift >= 0 ? '+' : ''}{s.avgSentimentShift}
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── Quanto dura l'effetto ──────────────────────────────────── */}
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="panel px-5 py-5">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('page.sport.anatomy', '¿Cuánto dura el efecto?')}</h2>
              <p className="mb-3 text-[11px] text-slate-600">
                El ánimo de los hinchas día a día alrededor del partido, medido frente a la semana anterior (la línea cero). La euforia y la decepción rara vez se desvanecen a la misma velocidad.
              </p>
              <AnatomyCurve data={stats.anatomy} />
            </section>

            <section className="panel px-5 py-5">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('page.sport.scatter', '¿Importa la diferencia de goles?')}</h2>
              <p className="mb-3 text-[11px] text-slate-600">
                Un punto por partido: diferencia de goles en horizontal, cambio de ánimo en vertical. Si una goleada mueve más a la gente que una victoria ajustada, los puntos suben de izquierda a derecha.
              </p>
              <MarginScatter data={stats.scatter} />
            </section>
          </div>

          {stats.upcoming.length > 0 && (
            <section className="panel px-5 py-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Calendar className="size-4 text-sky-400" /> {t('page.sport.upcoming', 'Próximos partidos')}
              </h2>
              <div className="flex flex-col gap-1.5 text-sm">
                {stats.upcoming.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-4 py-2.5">
                    <span className="text-slate-200">{m.homeTeam} — {m.awayTeam}</span>
                    <span className="ml-auto text-xs text-slate-500">{COMPETITION_LABEL[m.competition] ?? m.competition} · {fmtDate(m.utcDate)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel px-5 py-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('page.sport.recent', 'Partidos recientes')}</h2>
            <p className="mb-3 text-[11px] text-slate-600">
              El sentimiento viene de las menciones analizadas de este mismo proyecto: el cruce solo tiene sentido si el proyecto realmente está escuchando a este club.
            </p>
            <div className="flex flex-col gap-2">
              {stats.recent.slice(0, 15).map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-4 rounded-lg bg-white/[0.03] px-4 py-3 text-sm">
                  <ResultBadge result={m.result} />
                  <div className="min-w-0">
                    <p className="truncate text-slate-200">
                      {m.isHome ? m.teamName : m.opponent} {m.homeScore}–{m.awayScore} {m.isHome ? m.opponent : m.teamName}
                    </p>
                    <p className="text-[11px] text-slate-600">{COMPETITION_LABEL[m.competition] ?? m.competition} · {fmtDate(m.utcDate)}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">sentimiento</span>
                    <ShiftBar value={m.sentimentShift} max={1} />
                  </div>
                  {m.stockShiftPct !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">acción</span>
                      <ShiftBar value={m.stockShiftPct} max={5} suffix="%" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
