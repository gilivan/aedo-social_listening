import { ExternalLink } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';
import { getConnectorCredStatuses, hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { factCheckData } from '@/lib/factcheck';
import { fmtNumber, type Lang } from '@/lib/kpi-standard';
import { sourceLabel } from '@/lib/source-label';
import { PageHeader, EmptyState } from '@/components/ui';
import { SectionTabs } from '@/components/section-tabs';
import { ConnectorKeys } from '@/components/connector-keys';
import { GenerateRefresh } from '@/components/generate-refresh';
import {
  Bars, L, MentionsLink, Section, SignalText, Tile, VerdictBadge, verdictLabel,
} from '@/components/facts-ui';

// ---------------------------------------------------------------------------
// Verifiche: che cosa hanno già controllato i fact-checker, e che cosa di
// smentito continua a girare.
// ---------------------------------------------------------------------------

export const metadata = { title: 'Verificaciones' };

const VERDICT_COLOR: Record<string, string> = {
  false: 'bg-red-500/70', misleading: 'bg-orange-500/70', mixed: 'bg-amber-400/70',
  true: 'bg-emerald-500/70', unverifiable: 'bg-slate-400/60', contested: 'bg-violet-500/70', other: 'bg-slate-600/60',
};

export default async function FactChecksPage() {
  const lang: Lang = (await getLocale()) === 'it' ? 'it' : 'en';
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={L(lang, 'Nessun progetto selezionato.', 'No hay ningún proyecto seleccionado.')} />;

  await hydrateConnectorCredentials();
  const [d, user, creds] = await Promise.all([factCheckData(project.id), getCurrentUser(), getConnectorCredStatuses()]);
  const admin = isAdmin(user);
  const date = (s?: string | Date | null) => (s ? new Date(s).toLocaleDateString(lang === 'it' ? 'it-IT' : 'es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const hot = d.claims.filter((c) => c.signal === 'debunked-growing' || c.signal === 'debunked-circulating');

  return (
    <>
      <SectionTabs group="facts" lang={lang} />
      <PageHeader
        title={L(lang, 'Verifiche', 'Verificaciones')}
        subtitle={L(lang,
          'Le affermazioni sul tema già controllate dai fact-checker, e quanto circolano ancora nelle conversazioni.',
          'Las afirmaciones sobre el tema que los fact-checkers ya verificaron, y cuánto siguen circulando en la conversación.')}
        info={L(lang,
          'Le verifiche vengono da Google Fact Check Tools, che raccoglie il markup ClaimReview di oltre cento testate di fact-checking. I verdetti si leggono dalle parole dei fact-checker, senza AI. La circolazione si misura cercando nelle menzioni degli ultimi 90 giorni le parole distintive di ogni affermazione: è una corrispondenza per parole, quindi una verifica in inglese trova le menzioni in inglese.',
          'Las verificaciones vienen de Google Fact Check Tools, que reúne el marcado ClaimReview de más de 100 medios de fact-checking. Los veredictos se leen de las propias palabras de los fact-checkers, sin IA. La circulación se mide buscando las palabras distintivas de cada afirmación en las menciones de los últimos 90 días: es una coincidencia por palabras, así que una verificación en inglés encuentra menciones en inglés.')}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {d.enabled && <GenerateRefresh endpoint="/api/facts/refresh" label={L(lang, 'Cerca verifiche adesso', 'Buscar verificaciones ahora')} busyLabel={L(lang, 'Cerco…', 'Buscando…')} />}
        {admin && creds.factcheck && (
          <div className="rounded-lg border border-[var(--border)] px-4 py-2">
            <ConnectorKeys connectorId="factcheck" fields={creds.factcheck.fields} />
          </div>
        )}
      </div>

      {d.enabled && d.status && !d.status.ok && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-2.5 text-xs text-amber-200">
          {L(lang, 'Ultima ricerca non riuscita:', 'La última búsqueda falló:')} {d.status.error}
        </p>
      )}

      {!d.enabled && (
        <EmptyState message={L(lang,
          'Per attivare le verifiche serve una chiave Google con la “Fact Check Tools API” abilitata (gratuita). Inseriscila qui sopra: anche la chiave YouTube va bene, se aggiungi quella API alle sue restrizioni.',
          'Las verificaciones necesitan una clave de Google con la “Fact Check Tools API” habilitada (gratis). Agrégala arriba: la clave de YouTube también sirve si agregas esa API a sus restricciones.')} />
      )}

      {d.enabled && d.total === 0 && (
        <EmptyState message={L(lang,
          'Nessuna verifica trovata per i termini del progetto. I fact-checker lavorano sulle affermazioni che circolano di più: su temi di nicchia è normale che non ce ne siano.',
          'No se encontraron verificaciones para los términos del proyecto. Los fact-checkers trabajan sobre las afirmaciones más virales: en temas de nicho es normal no encontrar ninguna.')} />
      )}

      {d.total > 0 && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={L(lang, 'Affermazioni verificate', 'Afirmaciones verificadas')} value={fmtNumber(d.total, lang)} />
            <Tile label={L(lang, 'Smentite che circolano ancora', 'Desmentidas que siguen circulando')} value={fmtNumber(d.stillCirculating, lang)}
              tone={d.stillCirculating ? 'danger' : 'ok'}
              hint={L(lang, 'almeno una menzione negli ultimi 7 giorni', 'al menos una mención en los últimos 7 días')} />
            <Tile label={L(lang, 'Verdetti discordi', 'Veredictos contradictorios')} value={fmtNumber(d.claims.filter((c) => c.verdict === 'contested').length, lang)}
              hint={L(lang, 'un fact-checker dice vero, un altro falso', 'un fact-checker dice verdadero, otro falso')} />
            <Tile label={L(lang, 'Testate di fact-checking', 'Medios de fact-checking')} value={fmtNumber(d.publishers.length, lang)} />
          </div>

          {hot.length > 0 && (
            <Section className="mb-4 border-red-500/30"
              title={L(lang, 'Smentite che circolano ancora', 'Afirmaciones desmentidas que siguen circulando')}
              hint={L(lang,
                'Affermazioni giudicate false o fuorvianti che compaiono ancora nelle menzioni dell’ultima settimana. Sono il punto da cui partire per una risposta o una correzione.',
                'Afirmaciones calificadas como falsas o engañosas que todavía aparecen en las menciones de la última semana. Es el punto de partida para una respuesta o una corrección.')}>
              <ClaimList claims={hot.slice(0, 10)} lang={lang} date={date} />
            </Section>
          )}

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Section title={L(lang, 'Verdetti', 'Veredictos')}>
              <Bars lang={lang} items={d.byVerdict.map((v) => ({ label: verdictLabel(v.verdict, lang), value: v.n, color: VERDICT_COLOR[v.verdict] }))} />
            </Section>
            <Section title={L(lang, 'Chi ha verificato', 'Quién verificó')}>
              <Bars lang={lang} items={d.publishers.map((p) => ({ label: p.name, value: p.n }))} color="bg-violet-500/60" />
            </Section>
            <Section title={L(lang, 'Verifiche nel tempo', 'Verificaciones en el tiempo')} hint={L(lang, 'per mese di pubblicazione della verifica', 'por mes de publicación de la verificación')}>
              <Bars lang={lang} items={d.months.map((m) => ({ label: m.month, value: m.n }))} color="bg-slate-400/50" />
            </Section>
          </div>

          <Section title={L(lang, 'Tutte le affermazioni', 'Todas las afirmaciones')}
            hint={L(lang, 'Prima quelle che richiedono attenzione, poi le altre.', 'Primero las que requieren atención, luego las demás.')}>
            <ClaimList claims={d.claims.slice(0, 80)} lang={lang} date={date} />
          </Section>
        </>
      )}
    </>
  );
}

function ClaimList({ claims, lang, date }: {
  claims: Awaited<ReturnType<typeof factCheckData>>['claims'];
  lang: Lang;
  date: (s?: string | Date | null) => string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-[var(--border)]">
      {claims.map((c) => {
        const circ = c.circulation;
        return (
          <li key={c.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={c.verdict} lang={lang} />
              <SignalText signal={c.signal} lang={lang} />
            </div>
            <p className="mt-1.5 text-sm leading-snug text-slate-200">“{c.claim}”</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {c.claimant && <>{L(lang, 'Attribuita a', 'Atribuida a')} {c.claimant} · </>}
              {c.claimDate && <>{date(c.claimDate)} · </>}
              {L(lang, 'termine', 'término')} “{c.query}”
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {c.reviews.slice(0, 4).map((r) => (
                <li key={r.url} className="text-[11px] text-slate-400">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-sky-300">
                    <span className="font-medium text-slate-300">{r.publisher}</span>: “{r.rating}”
                    {r.reviewDate && <span className="text-slate-600">· {date(r.reviewDate)}</span>}
                    <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
            {circ && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                <span>
                  {L(lang, 'In circolazione:', 'En circulación:')}{' '}
                  <b className="text-slate-200">{fmtNumber(circ.total, lang)}</b> {L(lang, 'menzioni in 90 giorni', 'menciones en 90 días')}
                  {' · '}{fmtNumber(circ.last7, lang)} {L(lang, 'ultima settimana', 'última semana')}
                  {' · '}{fmtNumber(circ.prev7, lang)} {L(lang, 'quella prima', 'semana anterior')}
                </span>
                {Object.keys(circ.sources).length > 0 && (
                  <span className="text-slate-500">
                    {Object.entries(circ.sources).sort((a, b) => b[1] - a[1]).slice(0, 4)
                      .map(([s, n]) => `${sourceLabel(s)} ${n}`).join(' · ')}
                  </span>
                )}
                <MentionsLink ids={circ.sampleIds} count={circ.total} lang={lang} />
                <span className="text-slate-600" title={L(lang, 'parole cercate nelle menzioni', 'palabras buscadas en las menciones')}>
                  [{circ.terms.join(' + ')}]
                </span>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
