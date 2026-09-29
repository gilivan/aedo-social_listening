import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { detectPeople, personCard, peopleRanking, personSeries } from '@/lib/people-insights';
import { PersonCards, PeopleLeaderboard } from '@/components/people-charts';
import { SectionTabs } from '@/components/section-tabs';

export const metadata = { title: 'Personas' };
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Personal branding.
//
// Quando i dati seguono delle PERSONE invece che dei canali, le domande
// cambiano: non "quanto pesa Instagram sul mix", ma se quella persona sta
// crescendo, se pubblica abbastanza, che formato le rende, chi la segue.
// Questa pagina compare da sola quando nel progetto ci sono persone, e resta
// invisibile quando non ce ne sono.
// ---------------------------------------------------------------------------

export default async function PeoplePage() {
  if (!isAdmin(await getCurrentUser())) return <EmptyState message="Disponible solo para administradores." />;
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Primero selecciona un proyecto." />;

  const names = await detectPeople(project.id);
  if (!names.length) {
    return (
      <>
        <SectionTabs group="data" />
        <PageHeader title="Personas"
          subtitle="Marca personal: cómo crece, publica y es seguida cada persona." />
        <EmptyState message="No se detectaron personas en este proyecto. Aparecen solas cuando importas hojas que siguen a directivos o voceros: AEDO los reconoce por la forma del archivo." />
      </>
    );
  }

  const cards = await Promise.all(names.map((n) => personCard(project.id, n)));
  const ranking = await peopleRanking(project.id, names, cards);
  // Chi non ha nessun dato utile non merita una scheda vuota.
  const useful = cards.filter((c) => c.followers || c.rhythm || c.averages.length || c.audience.length);
  // Le serie nel tempo, una per persona: alimentano il confronto e il focus.
  // Chi ha meno di due rilevazioni non fa una curva e resta fuori dal grafico.
  const series = (await Promise.all(useful.map(async (c) => ({
    name: c.name, ...(await personSeries(project.id, c.name)),
  })))).filter((s) => s.followers.length >= 2)
    .sort((a, b) => (b.followers.at(-1)?.value ?? 0) - (a.followers.at(-1)?.value ?? 0));

  return (
    <>
      <SectionTabs group="data" />
      <PageHeader
        title="Personas"
        subtitle="Marca personal: cómo crece, publica y es seguida cada persona."
        info="Las personas se reconocen por la FORMA de las hojas importadas (una hoja por persona, una columna por persona o una columna de entidad con nombres), no por una lista que tengas que mantener. La misma persona escrita de tres formas (Acquaviva, RICCARDO ACQUAVIVA, ACQUAVIVA) es una sola ficha, unificada por el apellido. Los promedios se promedian y los totales acumulados toman su último valor: sumar una tasa de engagement de varios meses produciría un número verosímil, pero sin sentido."
      />

      <div className="mb-4">
        <PeopleLeaderboard rows={ranking} />
      </div>

      <PersonCards cards={useful} series={series} />
    </>
  );
}
