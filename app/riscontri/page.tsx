import Link from 'next/link';
import { Check, CircleDashed } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getLocale } from '@/lib/i18n';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { crossCheckData } from '@/lib/crosscheck';
import { fmtNumber, type Lang } from '@/lib/kpi-standard';
import { PageHeader, EmptyState } from '@/components/ui';
import { SectionTabs } from '@/components/section-tabs';
import { GapBadge, L, MentionsLink, Section, SignalText, Tile, VerdictBadge } from '@/components/facts-ui';

// ---------------------------------------------------------------------------
// Riscontri: quello che si dice, messo accanto a quello che si sa.
// ---------------------------------------------------------------------------

export const metadata = { title: 'Contrastes' };

export default async function CrossCheckPage() {
  const lang: Lang = (await getLocale()) === 'it' ? 'it' : 'en';
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={L(lang, 'Nessun progetto selezionato.', 'No hay ningún proyecto seleccionado.')} />;
  await hydrateConnectorCredentials();
  const d = await crossCheckData(project.id);
  const hype = d.trials.interventions.filter((i) => i.gap === 'hype');
  const untold = d.trials.interventions.filter((i) => i.gap === 'untold');
  const recurring = d.pods.shows.filter((s) => s.recurring);

  const coverage: { key: keyof typeof d.coverage; it: string; en: string; href: string }[] = [
    { key: 'factcheck', it: 'Verifiche dei fact-checker', en: 'Veredictos de los fact-checkers', href: '/verifiche' },
    { key: 'trials', it: 'Studi clinici', en: 'Estudios clínicos', href: '/evidenze' },
    { key: 'podcasts', it: 'Podcast', en: 'Podcasts', href: '/podcast' },
    { key: 'newsdata', it: 'Notizie NewsData.io', en: 'Noticias de NewsData.io', href: '/impostazioni/fonti' },
    { key: 'lemmy', it: 'Discussioni Lemmy', en: 'Discusiones de Lemmy', href: '/impostazioni/fonti' },
  ];

  return (
    <>
      <SectionTabs group="facts" lang={lang} />
      <PageHeader
        title={L(lang, 'Riscontri', 'Contrastes')}
        subtitle={L(lang,
          'Quello che si dice, accanto a quello che si sa: verifiche, evidenze e voci sugli stessi temi.',
          'Lo que se dice, junto a lo que se sabe: verificaciones, evidencia y voces sobre los mismos temas.')}
        info={L(lang,
          'Questa pagina non introduce numeri nuovi: mette in fila quelli delle Verifiche, degli Studi clinici e dei Podcast, e li incrocia con i temi delle menzioni. Tutto è calcolato, nessun testo è scritto dall’AI, e ogni riga rimanda alle menzioni o alle fonti che la provano.',
          'Esta página no agrega números nuevos: ordena los de Verificaciones, Estudios clínicos y Podcasts, y los cruza con los temas de las menciones. Todo es calculado, ningún texto lo escribe la IA, y cada fila enlaza a las menciones o fuentes que lo prueban.')}
      />

      {/* Che cosa è acceso: una pagina che incrocia fonti deve dire quali ha. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {coverage.map((c) => (
          <Link key={c.key} href={c.href}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${d.coverage[c.key]
              ? 'border-emerald-500/30 text-emerald-300'
              : 'border-[var(--border)] text-slate-500 hover:text-slate-300'}`}>
            {d.coverage[c.key] ? <Check className="size-3" /> : <CircleDashed className="size-3" />}
            {c[lang]}{!d.coverage[c.key] && L(lang, ' — da attivare', ' — inactiva')}
          </Link>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={L(lang, 'Smentite ancora in circolo', 'Desmentidas que siguen circulando')} value={fmtNumber(d.debunked.length, lang)}
          tone={d.debunked.length ? 'danger' : undefined}
          hint={d.debunkedWeekly ? L(lang, `fino a ${fmtNumber(d.debunkedWeekly, lang)} menzioni questa settimana`, `hasta ${fmtNumber(d.debunkedWeekly, lang)} menciones esta semana`) : undefined} />
        <Tile label={L(lang, 'Temi caldi mai verificati', 'Temas calientes nunca verificados')} value={fmtNumber(d.unchecked.length, lang)}
          tone={d.unchecked.length ? 'warn' : undefined}
          hint={L(lang, `su ${d.topics.length} temi della settimana`, `de ${d.topics.length} temas de la semana`)} />
        <Tile label={L(lang, 'Notizie più avanti dell’evidenza', 'Noticias por delante de la evidencia')} value={fmtNumber(hype.length, lang)}
          tone={hype.length ? 'warn' : undefined} />
        <Tile label={L(lang, 'Voci ricorrenti in audio', 'Voces recurrentes en audio')} value={fmtNumber(recurring.length, lang)} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Section title={L(lang, 'Smentite che girano ancora', 'Afirmaciones desmentidas que siguen circulando')}
          hint={L(lang, 'Il caso in cui una correzione serve davvero: il fact-check c’è, la conversazione non l’ha ancora letto.', 'Donde una corrección de verdad importa: la verificación existe, pero la conversación todavía no la ha leído.')}>
          {d.debunked.length ? (
            <ul className="flex flex-col gap-2.5">
              {d.debunked.slice(0, 6).map((c) => (
                <li key={c.id} className="text-xs">
                  <div className="flex flex-wrap items-center gap-2"><VerdictBadge verdict={c.verdict} lang={lang} /><SignalText signal={c.signal} lang={lang} /></div>
                  <p className="mt-1 text-slate-200">“{c.claim}”</p>
                  <p className="text-[11px] text-slate-500">
                    {c.reviews[0]?.publisher} · {fmtNumber(c.circulation?.last7 ?? 0, lang)} {L(lang, 'menzioni in 7 giorni', 'menciones en 7 días')}
                    {' '}<MentionsLink ids={c.circulation?.sampleIds ?? []} count={c.circulation?.total ?? 0} lang={lang} />
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">
              {d.coverage.factcheck
                ? L(lang, 'Nessuna affermazione smentita circola nell’ultima settimana.', 'Ninguna afirmación desmentida circuló en la última semana.')
                : L(lang, 'Attiva le Verifiche per vedere questo riquadro.', 'Activa Verificaciones para ver este panel.')}
            </p>
          )}
        </Section>

        <Section title={L(lang, 'Temi caldi senza nessuna verifica', 'Temas calientes sin ninguna verificación')}
          hint={L(lang,
            'I temi più presenti nelle menzioni della settimana su cui nessun fact-checker ha pubblicato niente: è lì che un’affermazione sbagliata può girare senza contrappeso.',
            'Los temas más presentes en las menciones de la semana sobre los que ningún fact-checker ha publicado nada: ahí una afirmación errónea puede circular sin contrapeso.')}>
          {d.topics.length ? (
            <ul className="flex flex-col gap-1.5">
              {d.topics.slice(0, 12).map((t) => (
                <li key={t.topic} className="flex items-center justify-between gap-3 text-xs">
                  <Link href={`/listening?q=${encodeURIComponent(t.topic)}&giorni=7`} className="truncate text-slate-200 hover:text-sky-300">{t.topic}</Link>
                  <span className="shrink-0 tabular-nums text-slate-400">
                    {fmtNumber(t.last7, lang)}
                    {t.growth !== null && <span className={t.growth > 0 ? 'text-amber-300' : 'text-slate-500'}> {t.growth > 0 ? '+' : ''}{t.growth}%</span>}
                    {' · '}
                    {t.checked
                      ? <span className="text-emerald-300">{t.checked} {L(lang, t.checked === 1 ? 'verifica' : 'verifiche', t.checked === 1 ? 'verificación' : 'verificaciones')}</span>
                      : <span className="text-amber-300">{L(lang, 'mai verificato', 'nunca verificado')}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">{L(lang, 'Servono i temi delle menzioni: arrivano con l’analisi AI.', 'Se necesitan los temas de las menciones: llegan con el análisis de IA.')}</p>
          )}
        </Section>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Section title={L(lang, 'Dove le notizie corrono più dell’evidenza', 'Donde las noticias van por delante de la evidencia')}>
          {d.trials.terms.length === 0 ? (
            <p className="text-xs text-slate-500">
              {L(lang, 'Scegli che cosa seguire negli ', 'Elige qué seguir en ')}
              <Link href="/evidenze" className="text-sky-300 hover:underline">{L(lang, 'Studi clinici', 'Estudios clínicos')}</Link>.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {[...hype, ...untold].slice(0, 8).map((i) => (
                <li key={i.name} className="text-xs">
                  <p className="flex flex-wrap items-center gap-2"><b className="text-slate-200">{i.name}</b><GapBadge gap={i.gap} lang={lang} /></p>
                  <p className="text-[11px] text-slate-500">
                    {fmtNumber(i.mentions, lang)} {L(lang, 'menzioni', 'menciones')} · {fmtNumber(i.trials, lang)} {L(lang, 'studi', 'estudios')} · {L(lang, 'fase massima', 'fase máx.')} {i.maxPhase || '—'}
                    {' '}<MentionsLink ids={i.sampleIds} count={i.mentions} lang={lang} />
                  </p>
                </li>
              ))}
              {!hype.length && !untold.length && (
                <p className="text-xs text-slate-500">{L(lang, 'Notizie ed evidenze sono allineate sui trattamenti seguiti.', 'Las noticias y la evidencia están alineadas en los tratamientos seguidos.')}</p>
              )}
            </ul>
          )}
        </Section>

        <Section title={L(lang, 'Chi ne parla ogni settimana, in audio', 'Quién habla del tema cada semana, en audio')}>
          {recurring.length ? (
            <ul className="flex flex-col gap-1.5">
              {recurring.slice(0, 8).map((s) => (
                <li key={s.name} className="flex justify-between gap-3 text-xs">
                  <span className="truncate text-slate-200">{s.name}</span>
                  <span className="shrink-0 text-slate-400">{fmtNumber(s.episodes, lang)} {L(lang, 'episodi', 'episodios')}{s.languages.length ? ` · ${s.languages.join(', ').toUpperCase()}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">
              {d.coverage.podcasts
                ? L(lang, 'Nessuna trasmissione torna sul tema con regolarità.', 'Ningún programa vuelve al tema con regularidad.')
                : <>{L(lang, 'Attiva i ', 'Activa los ')}<Link href="/podcast" className="text-sky-300 hover:underline">Podcast</Link>.</>}
            </p>
          )}
        </Section>
      </div>
    </>
  );
}
