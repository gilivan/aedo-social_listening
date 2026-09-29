import { ExternalLink } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';
import { getConnectorCredStatuses } from '@/lib/connector-credentials';
import { podcastData, showName } from '@/lib/podcasts';
import { fmtNumber, type Lang } from '@/lib/kpi-standard';
import { PageHeader, EmptyState } from '@/components/ui';
import { SectionTabs } from '@/components/section-tabs';
import { ConnectorKeys } from '@/components/connector-keys';
import { Bars, L, Section, Tile } from '@/components/facts-ui';

export const metadata = { title: 'Podcasts' };

export default async function PodcastPage() {
  const lang: Lang = (await getLocale()) === 'it' ? 'it' : 'en';
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={L(lang, 'Nessun progetto selezionato.', 'No hay ningún proyecto seleccionado.')} />;
  const [d, user, creds] = await Promise.all([podcastData(project.id), getCurrentUser(), getConnectorCredStatuses()]);
  const admin = isAdmin(user);
  const enabled = creds.podcastindex?.configured ?? false;
  const date = (x: Date) => x.toLocaleDateString(lang === 'it' ? 'it-IT' : 'es-CO', { day: '2-digit', month: 'short' });

  return (
    <>
      <SectionTabs group="facts" lang={lang} />
      <PageHeader
        title="Podcast"
        subtitle={L(lang,
          'Le trasmissioni che parlano del tema, e quelle che ci tornano ogni settimana.',
          'Los programas que hablan del tema, y los que vuelven a él cada semana.')}
        info={L(lang,
          'Episodi da Podcast Index, la directory aperta dei podcast: si leggono titolo e descrizione, non l’audio, quindi un episodio che nomina il tema solo a voce non si trova. Uno show è “ricorrente” se ha almeno tre episodi sul tema distribuiti su più di due settimane.',
          'Episodios de Podcast Index, el directorio abierto de podcasts: se leen títulos y descripciones, no el audio, así que un episodio que solo menciona el tema en voz no aparece. Un programa es “recurrente” si tiene al menos tres episodios sobre el tema repartidos en más de dos semanas.')}
      />

      {admin && creds.podcastindex && (
        <div className="mb-4 inline-block rounded-lg border border-[var(--border)] px-4 py-2">
          <ConnectorKeys connectorId="podcastindex" fields={creds.podcastindex.fields} />
        </div>
      )}

      {!enabled && d.episodes === 0 && (
        <EmptyState message={L(lang,
          'Per i podcast servono chiave e segreto gratuiti di Podcast Index (api.podcastindex.org). Inseriti qui sopra, gli episodi arrivano alla prossima raccolta.',
          'Los podcasts necesitan una clave y un secreto gratuitos de Podcast Index (api.podcastindex.org). Una vez guardados arriba, los episodios llegan con la próxima recolección.')} />
      )}
      {enabled && d.episodes === 0 && (
        <EmptyState message={L(lang,
          'Nessun episodio negli ultimi 90 giorni. Se la chiave è appena stata inserita, premi “Aggiorna ora”: gli episodi arrivano con la raccolta.',
          'No hay episodios en los últimos 90 días. Si acabas de agregar la clave, pulsa “Actualizar ahora”: los episodios llegan con la recolección.')} />
      )}

      {d.episodes > 0 && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={L(lang, 'Episodi (90 giorni)', 'Episodios (90 días)')} value={fmtNumber(d.episodes, lang)} />
            <Tile label={L(lang, 'Trasmissioni', 'Programas')} value={fmtNumber(d.shows.length, lang)} />
            <Tile label={L(lang, 'Trasmissioni ricorrenti', 'Programas recurrentes')} value={fmtNumber(d.recurring, lang)}
              hint={L(lang, 'tornano sul tema', 'vuelven al tema')} />
            <Tile label={L(lang, 'Ore di ascolto', 'Horas de audio')} value={fmtNumber(d.hours, lang)}
              hint={L(lang, 'durata degli episodi che la dichiarano', 'duración de los episodios que la declaran')} />
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Section className="lg:col-span-2 overflow-x-auto" title={L(lang, 'Le trasmissioni', 'Los programas')}>
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Programa</th>
                    <th className="px-2 py-2 text-right font-semibold">{L(lang, 'Episodi', 'Episodios')}</th>
                    <th className="px-2 py-2 text-right font-semibold">{L(lang, 'Minuti', 'Minutos')}</th>
                    <th className="px-2 py-2 font-semibold">{L(lang, 'Lingua', 'Idioma')}</th>
                    <th className="px-2 py-2 font-semibold">{L(lang, 'Ultimo', 'Último')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.shows.map((s) => (
                    <tr key={s.name} className="border-b border-[var(--border)]/60 last:border-0">
                      <td className="py-1.5 pr-3 text-slate-200">
                        {s.name}
                        {s.recurring && <span className="ml-1.5 rounded bg-sky-500/15 px-1 py-0.5 text-[9px] text-sky-300">{L(lang, 'ricorrente', 'recurrente')}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(s.episodes, lang)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s.minutes ? fmtNumber(s.minutes, lang) : '—'}</td>
                      <td className="px-2 py-1.5 uppercase text-slate-400">{s.languages.join(', ') || '—'}</td>
                      <td className="px-2 py-1.5 text-slate-400">{date(s.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <Section title={L(lang, 'Lingue', 'Idiomas')}>
              <Bars lang={lang} items={d.languages.map((l) => ({ label: l.language.toUpperCase(), value: l.n }))} />
            </Section>
          </div>

          <Section title={L(lang, 'Episodi più recenti', 'Episodios más recientes')}>
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {d.latest.map((e) => (
                <li key={e.id} className="py-2 text-xs first:pt-0 last:pb-0">
                  <a href={e.url ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-slate-200 hover:text-sky-300">
                    {e.title} <ExternalLink className="mt-0.5 size-3 shrink-0" />
                  </a>
                  <p className="text-[11px] text-slate-500">{showName(e.community)} · {date(e.publishedAt)}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{e.content}</p>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </>
  );
}
