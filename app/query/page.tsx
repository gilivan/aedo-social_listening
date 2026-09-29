import Link from 'next/link';
import { getCurrentProject, getProjects } from '@/lib/data';
import { getLocale } from '@/lib/i18n';
import { claudeAvailable } from '@/lib/claude';
import { projectPlan, queryStats } from '@/lib/query-builder';
import { PageHeader, EmptyState } from '@/components/ui';
import { QueryStudio } from '@/components/query-studio';
import { CountryPicker } from '@/components/country-picker';

// ---------------------------------------------------------------------------
// Query: che cosa Radar ascolta, separato da come è fatto il progetto.
// ---------------------------------------------------------------------------

export const metadata = { title: 'Consultas' };
// Costruire un piano chiama il modello; provarlo interroga Google News.
export const maxDuration = 120;

export default async function QueryPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const lang = (await getLocale()) === 'it' ? 'it' : 'en';
  const L = (it: string, en: string) => (lang === 'it' ? it : en);

  // Un progetto appena creato arriva qui con il suo id: il selettore in alto
  // potrebbe indicarne ancora un altro.
  const wanted = Number(sp.project);
  const project = wanted
    ? (await getProjects()).find((p) => p.id === wanted) ?? await getCurrentProject()
    : await getCurrentProject();
  if (!project) return <EmptyState message={L('Nessun progetto selezionato.', 'No hay ningún proyecto seleccionado.')} />;

  const header = (
    <PageHeader
      title="Consultas"
      subtitle={L(
        `Che cosa ascolta “${project.name}”: scrivilo a parole, Radar costruisce e prova le query.`,
        `Qué escucha “${project.name}”: escríbelo con tus palabras y AEDO construye y prueba las consultas.`,
      )}
      info={L(
        'Le query sono fatte di mattoncini: il soggetto, i contesti a cui legarlo, i competitor e il rumore da escludere, ognuno con i suoi termini. Ogni query è una combinazione di mattoncini: correggi un termine una volta e cambia ovunque. Prima di salvare, la prova sul campo cerca ogni termine e ogni query nelle notizie dell’ultima settimana. Dopo il salvataggio ogni menzione porta l’etichetta delle query che l’hanno trovata.',
        'Las consultas se arman con bloques: el sujeto, los contextos con los que relacionarlo, los competidores y el ruido que hay que excluir, cada uno con sus términos. Cada consulta combina bloques: corriges un término una vez y cambia en todas partes. Antes de guardar, la prueba de campo busca cada término y cada consulta en las noticias de la última semana. Después de guardar, cada mención queda etiquetada con las consultas que la encontraron.',
      )}
    />
  );

  if (project.mode === 'upload') {
    return (
      <>
        {header}
        <EmptyState message={L('Questo progetto importa file: non ha query da costruire.', 'Este proyecto importa archivos: no tiene consultas que construir.')} />
      </>
    );
  }
  const lens = project.mode === 'talkwalker';

  const [current, stats, ai] = await Promise.all([
    projectPlan(project.id), queryStats(project.id), claudeAvailable(),
  ]);

  return (
    <>
      {header}
      {lens && (
        <p className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/[0.05] px-4 py-2 text-xs text-teal-100">
          {L('Progetto Talkwalker: qui le query sono una lente. La raccolta resta quella dei topic scelti in Talkwalker e non si spende nessun credito in più; il piano serve a etichettare i documenti arrivati (soggetto, contesti, competitor) e a filtrarli in Ascolto. Ogni query si può copiare in sintassi booleana e incollare in Talkwalker.',
            'Proyecto Talkwalker: aquí las consultas son un lente. La recolección sigue siendo la de los temas elegidos en Talkwalker y no se gasta ningún crédito adicional; el plan etiqueta los documentos que llegan (sujeto, contextos, competidores) para que puedas filtrarlos en Escucha. Cada consulta se puede copiar en sintaxis booleana y pegar en Talkwalker.')}
        </p>
      )}
      {sp.new && (
        <p className="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/[0.05] px-4 py-2 text-xs text-sky-200">
          {L('Progetto creato. Ora dì a Radar che cosa ascoltare: finché non salvi un piano, il progetto non raccoglie niente.',
            'Proyecto creado. Ahora dile a AEDO qué escuchar: hasta que guardes un plan, el proyecto no recolecta nada.')}
          {' '}<Link href={`/settings?p=${project.id}`} className="underline">{L('Impostazioni del progetto', 'Configuración del proyecto')}</Link>
        </p>
      )}
      {!lens && <CountryPicker projectId={project.id} countries={project.countries ?? []} />}
      <QueryStudio
        key={project.id}
        projectId={project.id}
        initialPlan={current?.plan ?? null}
        saved={current?.saved ?? false}
        stats={stats}
        // Demo pubblica: la proposta AI della richiesta d'esempio è pronta.
        aiAvailable={ai || process.env.DEMO_MODE === '1'}
        lang={lang}
        initialBrief={project.semanticContext ?? ''}
      />
    </>
  );
}
