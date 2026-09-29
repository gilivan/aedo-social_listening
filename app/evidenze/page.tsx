import { ExternalLink } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getLocale } from '@/lib/i18n';
import { getMeta } from '@/lib/db';
import type { TermResolution } from '@/lib/trials';
import { phaseLabel, STATUS_LABEL, trialsData } from '@/lib/trials';
import { fmtNumber, type Lang } from '@/lib/kpi-standard';
import { PageHeader, EmptyState } from '@/components/ui';
import { SectionTabs } from '@/components/section-tabs';
import { GenerateRefresh } from '@/components/generate-refresh';
import { SubmitButton } from '@/components/submit-button';
import { Bars, GapBadge, L, MentionsLink, Section, Tile } from '@/components/facts-ui';
import { saveEvidenceTermsAction } from './actions';

// ---------------------------------------------------------------------------
// Studi clinici: le evidenze dietro le notizie, e dove le due cose divergono.
// ---------------------------------------------------------------------------

export const metadata = { title: 'Estudios clínicos' };
// Il primo "Salva e cerca" raccoglie gli studi e li collega alle notizie.
export const maxDuration = 120;

const STATUS_EN: Record<string, string> = {
  RECRUITING: 'reclutando', NOT_YET_RECRUITING: 'aún sin reclutar', ACTIVE_NOT_RECRUITING: 'activo',
  ENROLLING_BY_INVITATION: 'por invitación', COMPLETED: 'completado', TERMINATED: 'terminado',
  SUSPENDED: 'suspendido', WITHDRAWN: 'retirado', UNKNOWN: 'estado desconocido',
};
const statusLabel = (s: string, lang: Lang) => (lang === 'it' ? STATUS_LABEL[s] : STATUS_EN[s]) ?? s.toLowerCase().replace(/_/g, ' ');
const phaseText = (n: number, lang: Lang) => (n === 0 ? L(lang, 'senza fase', 'sin fase') : n === 0.5 ? L(lang, 'fase 1 precoce', 'fase 1 temprana') : `${L(lang, 'fase', 'fase')} ${n}`);

export default async function TrialsPage() {
  const lang: Lang = (await getLocale()) === 'it' ? 'it' : 'en';
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={L(lang, 'Nessun progetto selezionato.', 'No hay ningún proyecto seleccionado.')} />;
  const d = await trialsData(project.id);
  const termNote = await getMeta<{ notes: TermResolution[]; at: string }>(`evidence_terms_note_${project.id}`);
  const recruiting = d.trials.filter((t) => t.status === 'RECRUITING').length;
  const withResults = d.trials.filter((t) => t.hasResults === 1).length;
  const hype = d.interventions.filter((i) => i.gap === 'hype');
  const untold = d.interventions.filter((i) => i.gap === 'untold');

  return (
    <>
      <SectionTabs group="facts" lang={lang} />
      <PageHeader
        title={L(lang, 'Studi clinici', 'Estudios clínicos')}
        subtitle={L(lang,
          'Le evidenze dietro le notizie di salute: a che punto sono gli studi, e dove il racconto corre più dei dati.',
          'La evidencia detrás de las noticias de salud: en qué punto están los estudios y dónde el relato va más rápido que los datos.')}
        info={L(lang,
          'Gli studi vengono da ClinicalTrials.gov (National Library of Medicine), gratuito e senza chiave. Un trattamento si collega alle notizie cercandone il nome o il codice NCT nelle menzioni degli ultimi 90 giorni; placebo, procedure e controlli generici non contano. “Notizie più avanti dell’evidenza” = almeno 10 menzioni e studi al massimo in fase 2 senza risultati. “Evidenza che nessuno racconta” = fase 3 o risultati pubblicati, e al massimo 2 menzioni.',
          'Los estudios vienen de ClinicalTrials.gov (National Library of Medicine), gratis y sin clave. Un tratamiento se vincula con las noticias buscando su nombre o código NCT en las menciones de los últimos 90 días; placebos, procedimientos y controles genéricos no cuentan. “Noticias por delante de la evidencia” = al menos 10 menciones y estudios como máximo en fase 2 sin resultados. “Evidencia que nadie cuenta” = fase 3 o resultados publicados, y como máximo 2 menciones.')}
      />

      <Section className="mb-4" title={L(lang, 'Che cosa seguire', 'Qué seguir')}
        hint={L(lang,
          'Farmaci, condizioni o sponsor, separati da virgola (massimo 5). Sono diversi dalle parole chiave del progetto: in un registro di studi clinici servono termini medici.',
          'Medicamentos, condiciones o patrocinadores, separados por coma (máximo 5). Son distintos de las palabras clave del proyecto: un registro de estudios clínicos necesita términos médicos.')}>
        <form action={saveEvidenceTermsAction} className="flex flex-wrap items-center gap-2">
          <input name="terms" defaultValue={d.terms.join(', ')} placeholder={L(lang, 'es. semaglutide, obesità, Novo Nordisk', 'p. ej. semaglutide, obesity, Novo Nordisk')}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm" />
          <SubmitButton pendingLabel={L(lang, 'Cerco gli studi…', 'Buscando estudios…')}
            className="rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400">
            {L(lang, 'Salva e cerca', 'Guardar y buscar')}
          </SubmitButton>
        </form>
        {termNote?.notes.map((n) => (
          <p key={n.input} className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2 text-[11px] text-amber-100">
            {L(lang, `“${n.input}” non trova studi così com’è: il registro è in inglese e cerca per parole.`,
              `“${n.input}” no encuentra estudios tal como está escrito: el registro está en inglés y busca por palabras clave.`)}{' '}
            {n.kept.length
              ? <>{L(lang, 'Seguo invece: ', 'En su lugar sigo: ')}{n.kept.map((k) => `${k.term} (${fmtNumber(k.studies, lang)} ${L(lang, 'studi', 'estudios')})`).join(', ')}.</>
              : L(lang, 'Nessuna delle sue parole trova studi: prova con il nome di un farmaco o di una condizione in inglese.', 'Ninguna de sus palabras encuentra estudios: prueba con el nombre de un medicamento o de una condición en inglés.')}
            {n.dropped.length > 0 && <span className="text-amber-200/60"> {L(lang, 'Scartati:', 'Descartados:')} {n.dropped.join(', ')}.</span>}
          </p>
        ))}
        {/* Fuori dal form: un bottone dentro un form lo invierebbe. */}
        {d.terms.length > 0 && (
          <div className="mt-2">
            <GenerateRefresh endpoint="/api/trials/refresh" label={L(lang, 'Aggiorna gli studi', 'Actualizar estudios')} busyLabel={L(lang, 'Aggiorno…', 'Actualizando…')} />
          </div>
        )}
      </Section>

      {d.terms.length === 0 && (
        <EmptyState message={L(lang,
          'La sezione è spenta finché non scegli che cosa seguire: le parole chiave del progetto in un registro di studi clinici troverebbero solo rumore.',
          'Esta sección queda apagada hasta que elijas qué seguir: en un registro de estudios clínicos, las palabras clave del proyecto solo encontrarían ruido.')} />
      )}

      {d.total > 0 && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={L(lang, 'Studi trovati', 'Estudios encontrados')} value={fmtNumber(d.total, lang)} />
            <Tile label={L(lang, 'Reclutano adesso', 'Reclutando ahora')} value={fmtNumber(recruiting, lang)} />
            <Tile label={L(lang, 'Con risultati pubblicati', 'Con resultados publicados')} value={fmtNumber(withResults, lang)} />
            <Tile label={L(lang, 'Citati nelle notizie', 'Citados en las noticias')} value={fmtNumber(d.withNews, lang)}
              hint={L(lang, 'per nome del trattamento o codice NCT, ultimi 90 giorni', 'por nombre del tratamiento o código NCT, últimos 90 días')} />
          </div>

          {(hype.length > 0 || untold.length > 0) && (
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Section title={L(lang, 'Notizie più avanti dell’evidenza', 'Noticias por delante de la evidencia')}
                hint={L(lang, 'Se ne parla molto, ma gli studi sono ancora precoci e senza risultati.', 'Se habla mucho, pero los estudios aún son tempranos y no tienen resultados.')}>
                {hype.length ? <GapList rows={hype} lang={lang} /> : <p className="text-xs text-slate-500">{L(lang, 'Nessun caso.', 'Ninguno.')}</p>}
              </Section>
              <Section title={L(lang, 'Evidenza che nessuno racconta', 'Evidencia que nadie cuenta')}
                hint={L(lang, 'Studi maturi, in fase 3 o con risultati, quasi assenti dalle conversazioni.', 'Estudios maduros, en fase 3 o con resultados, casi ausentes de la conversación.')}>
                {untold.length ? <GapList rows={untold.slice(0, 10)} lang={lang} /> : <p className="text-xs text-slate-500">{L(lang, 'Nessun caso.', 'Ninguno.')}</p>}
              </Section>
            </div>
          )}

          <Section className="mb-4 overflow-x-auto" title={L(lang, 'Trattamenti: rumore contro evidenza', 'Tratamientos: ruido contra evidencia')}>
            <table className="w-full min-w-[44rem] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3 font-semibold">{L(lang, 'Trattamento', 'Tratamiento')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{L(lang, 'Studi', 'Estudios')}</th>
                  <th className="px-2 py-2 font-semibold">{L(lang, 'Fase più avanzata', 'Fase más avanzada')}</th>
                  <th className="px-2 py-2 font-semibold">{L(lang, 'Risultati', 'Resultados')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{L(lang, 'Menzioni 90 gg', 'Menciones 90 d')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{L(lang, 'ultimi 30', 'últimos 30')}</th>
                  <th className="px-2 py-2 font-semibold">{L(lang, 'Lettura', 'Lectura')}</th>
                </tr>
              </thead>
              <tbody>
                {d.interventions.map((i) => (
                  <tr key={i.name} className="border-b border-[var(--border)]/60 last:border-0">
                    <td className="py-1.5 pr-3 text-slate-200">
                      {i.name}
                      <span className="block text-[10px] text-slate-600">{i.sponsors.slice(0, 2).join(', ')}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(i.trials, lang)}</td>
                    <td className="px-2 py-1.5 text-slate-300">{phaseText(i.maxPhase, lang)}</td>
                    <td className="px-2 py-1.5 text-slate-300">{i.anyResults ? L(lang, 'sì', 'sí') : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(i.mentions, lang)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(i.last30, lang)}</td>
                    <td className="px-2 py-1.5"><GapBadge gap={i.gap} lang={lang} /> <MentionsLink ids={i.sampleIds} count={i.mentions} lang={lang} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Section title={L(lang, 'Stato degli studi', 'Estado de los estudios')}>
              <Bars lang={lang} items={d.byStatus.map((s) => ({ label: statusLabel(s.status, lang), value: s.n }))} />
            </Section>
            <Section title={L(lang, 'Fasi', 'Fases')}>
              <Bars lang={lang} items={d.byPhase.map((p) => ({ label: p.phase, value: p.n }))} color="bg-violet-500/60" />
            </Section>
            <Section title={L(lang, 'Sponsor principali', 'Patrocinadores principales')}
              hint={L(lang, 'industria, università, enti pubblici', 'industria, universidades, entidades públicas')}>
              <Bars lang={lang} items={d.sponsors.map((s) => ({ label: s.name, value: s.n, color: s.cls === 'INDUSTRY' ? 'bg-amber-500/60' : 'bg-emerald-500/50' }))} />
            </Section>
          </div>

          {d.upcoming.length > 0 && (
            <Section className="mb-4" title={L(lang, 'In arrivo nei prossimi 12 mesi', 'Previstos en los próximos 12 meses')}
              hint={L(lang, 'Studi ancora aperti la cui conclusione principale è prevista entro un anno: le notizie di domani, con la data.', 'Estudios aún abiertos cuya conclusión principal se espera en menos de un año: las noticias de mañana, con fecha.')}>
              <TrialList rows={d.upcoming} lang={lang} />
            </Section>
          )}

          <Section title={L(lang, 'Studi aggiornati di recente', 'Estudios actualizados recientemente')}>
            <TrialList rows={d.trials.slice(0, 40)} lang={lang} />
          </Section>
        </>
      )}
    </>
  );
}

function GapList({ rows, lang }: { rows: Awaited<ReturnType<typeof trialsData>>['interventions']; lang: Lang }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((i) => (
        <li key={i.name} className="text-xs">
          <p className="text-slate-200">
            <b>{i.name}</b>{' '}
            <span className="text-slate-500">
              · {fmtNumber(i.mentions, lang)} {L(lang, 'menzioni', 'menciones')} · {fmtNumber(i.trials, lang)} {L(lang, 'studi', 'estudios')}, {phaseText(i.maxPhase, lang)}
              {i.anyResults ? L(lang, ', con risultati', ', con resultados') : L(lang, ', senza risultati', ', sin resultados')}
            </span>
          </p>
          <MentionsLink ids={i.sampleIds} count={i.mentions} lang={lang} />
        </li>
      ))}
    </ul>
  );
}

function TrialList({ rows, lang }: { rows: Awaited<ReturnType<typeof trialsData>>['trials']; lang: Lang }) {
  return (
    <ul className="flex flex-col divide-y divide-[var(--border)]">
      {rows.map((t) => (
        <li key={t.nctId} className="py-2 text-xs first:pt-0 last:pb-0">
          <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-start gap-1 text-slate-200 hover:text-sky-300">
            {t.title} <ExternalLink className="mt-0.5 size-3 shrink-0" />
          </a>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {t.nctId} · {statusLabel(t.status, lang)} · {phaseLabel(t.phases, lang)}
            {t.sponsor && <> · {t.sponsor}</>}
            {t.enrollment ? <> · {fmtNumber(t.enrollment, lang)} {L(lang, 'partecipanti', 'participantes')}</> : null}
            {t.completionDate && <> · {L(lang, 'conclusione', 'conclusión')} {t.completionDate}</>}
            {t.hasResults === 1 && <> · <span className="text-emerald-300">{L(lang, 'risultati pubblicati', 'resultados publicados')}</span></>}
            {(t.news?.total ?? 0) > 0 && <> · <span className="text-sky-300">{fmtNumber(t.news!.total, lang)} {L(lang, 'menzioni', 'menciones')}</span></>}
          </p>
        </li>
      ))}
    </ul>
  );
}
