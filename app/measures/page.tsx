import Link from 'next/link';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { ARCHETYPE_LABEL } from '@/lib/sheet-archetype';
import { getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import {
  availableDims, breakdownByDim, customFields, defaultAgg, metricCatalog, metricMix,
  performanceByCustom, projectArchetypes, rankEntities, seriesByMetric,
} from '@/lib/metrics-data';
import { CustomPerformance, MixChart, RankChart, TrendChart } from '@/components/metric-charts';
import { SectionTabs } from '@/components/section-tabs';

export const metadata = { title: 'Medidas' };
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Le misure importate dai fogli di calcolo.
//
// Le viste non sono decise in anticipo: si guarda che cosa il progetto contiene
// davvero e si costruisce di conseguenza. Un file di canali social produce
// crescita follower e mix di pubblicazione; un file di manager produce una
// classifica per engagement e la composizione dell'audience. Lo stesso codice,
// perché il modello sottostante è lo stesso.
// ---------------------------------------------------------------------------

/** Le metriche che parlano di una stessa cosa, raccolte per famiglia. */
const FAMILIES: { test: RegExp; title: string; hint: string }[] = [
  {
    test: /(follower|fan|iscritti|subscriber|audience)/i,
    title: 'Crecimiento de la audiencia',
    hint: 'Cuántos siguen cada canal, mes a mes. Las variaciones cuentan más que los niveles.',
  },
  {
    test: /(impression|copertura|reach|visualizzazioni|views)/i,
    title: 'Alcance',
    hint: 'Cuántas veces se mostraron los contenidos.',
  },
  {
    test: /(interazion|engagement|reaction|mi piace|like|commenti|condivisioni|shares)/i,
    title: 'Interacciones',
    hint: 'Cuánto respondió la audiencia, no a cuántos se alcanzó.',
  },
];

export default async function MeasuresPage() {
  if (!isAdmin(await getCurrentUser())) return <EmptyState message="Las medidas están disponibles para administradores." />;
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Primero selecciona un proyecto." />;

  const catalog = await metricCatalog(project.id);
  if (!catalog.length) {
    return (
      <>
        <SectionTabs group="data" />
        <PageHeader
          title="Medidas"
          subtitle="Series importadas de hojas de cálculo: seguidores, publicaciones, promedios; todo lo que no es una publicación individual."
        />
        <EmptyState message="No hay medidas en este proyecto. Importa una hoja de agregados desde la sección Importar: AEDO reconoce por sí solo las hojas hechas de números en lugar de contenidos." />
      </>
    );
  }

  const names = catalog.map((c) => c.metric);
  const pick = (re: RegExp) => names.filter((n) => re.test(n));

  // Il mix di pubblicazione conta CONTENUTI PUBBLICATI, e nient'altro.
  //
  // Due esclusioni che non sono dettagli: le misure di pubblico (follower,
  // reach, impression) sono uno STOCK, non un flusso — sommarle ai contenuti
  // dà un totale che non significa niente, e schiaccia le voci vere sotto lo
  // 0,1%. E un "Pubblicazioni" complessivo, se accanto ci sono i singoli
  // canali, è il totale delle righe che gli stanno sotto: contarlo di nuovo
  // raddoppierebbe.
  const NOT_PUBLISHING = /(follower|fan|iscritti|subscriber|reach|impression|copertur|visualizzaz|views|interazion|engagement|eng\.|like|mi piace|commenti|condivisioni|risposte|clic|rate|medi[oa]|avg)/i;
  const CHANNEL = /^(lk|fb|ig feed|ig story|ig stories|x|twitter|youtube|yt|tiktok|tt|linkedin|instagram|facebook)$/i;
  const channels = catalog.filter((c) => !NOT_PUBLISHING.test(c.metric) && CHANNEL.test(c.metric.trim()));
  const publishing = (channels.length >= 2 ? channels : catalog.filter((c) =>
    !NOT_PUBLISHING.test(c.metric) && /(pubblicazioni|post pubblicati|updates|contenuti|video pubblicati)/i.test(c.metric)))
    .map((c) => c.metric);

  // La classifica: si sceglie la metrica di engagement più ricca fra le entità.
  const rankable = catalog
    .filter((c) => c.entities >= 2 && /(engagement|eng\.|interazion|rate)/i.test(c.metric))
    .sort((a, b) => b.entities - a.entities)[0];
  const ranking = rankable ? await rankEntities(project.id, rankable.metric) : [];

  const dims = await availableDims(project.id);
  const fields = await customFields(project.id);

  const families = await Promise.all(FAMILIES.map(async (f) => {
    const metrics = pick(f.test).slice(0, 10);
    return { ...f, series: metrics.length ? await seriesByMetric(project.id, metrics) : [] };
  }));

  const mix = publishing.length ? await metricMix(project.id, publishing) : [];
  const breakdowns = await Promise.all(dims.slice(0, 3).map(async (d) => ({
    dim: d, rows: await breakdownByDim(project.id, d),
  })));
  const perf = await Promise.all(fields.slice(0, 4).map(async (f) => ({
    field: f, rows: await performanceByCustom(project.id, f),
  })));

  const archetypes = await projectArchetypes(project.id);
  const hasPeople = archetypes.some((a) => a.people);

  const totalPoints = catalog.reduce((s, c) => s + c.points, 0);

  return (
    <>
      <SectionTabs group="data" />
      <PageHeader
        title="Medidas"
        subtitle="Series importadas de hojas de cálculo: seguidores, publicaciones, promedios; todo lo que no es una publicación individual."
        info="Un punto de métrica es quién · qué · cuándo · cuánto · cómo. Cualquier hoja de agregados se reduce a esa forma, ancha o larga; por eso aquí terminan siendo comparables archivos con estructuras completamente distintas. Los rankings nunca suman a ciegas: las tasas y los promedios se promedian, los totales acumulados toman el último valor. Sumar una tasa de engagement mes a mes produce un número verosímil, pero sin sentido."
      />

      {/* Che cosa contiene questo progetto: i tipi di foglio riconosciuti sono
          ciò che decide quali domande ha senso porgli, e vanno dichiarati. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
        <span>
          {catalog.length} medidas · {totalPoints.toLocaleString('es-CO')} puntos ·
          {' '}del {catalog.reduce((m, c) => (c.from < m ? c.from : m), catalog[0].from)}
          {' '}al {catalog.reduce((m, c) => (c.to > m ? c.to : m), catalog[0].to)}
        </span>
        {archetypes.map((a) => (
          <span key={a.archetype}
            className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
            {ARCHETYPE_LABEL[a.archetype as keyof typeof ARCHETYPE_LABEL] ?? a.archetype} × {a.sheets}
          </span>
        ))}
        {hasPeople && (
          <Link href="/people"
            className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-[11px] text-sky-200 hover:bg-sky-500/20">
            Este proyecto sigue a personas → ver las fichas
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {families.filter((f) => f.series.length > 0).map((f) => (
          <TrendChart key={f.title} series={f.series} title={f.title} hint={f.hint} />
        ))}

        {mix.length > 1 && (
          <MixChart rows={mix} title="Mix de publicación"
            hint="Cuánto pesa cada canal en el total de contenidos publicados." />
        )}

        {ranking.length > 1 && rankable && (
          <RankChart rows={ranking} title={`Ranking por ${rankable.metric}`}
            hint={defaultAgg(rankable.metric) === 'avg'
              ? 'Promedio del periodo: una tasa no se suma.'
              : defaultAgg(rankable.metric) === 'last'
                ? "Último valor registrado: un total acumulado no se suma."
                : 'Total del periodo.'} />
        )}

        {breakdowns.filter((b) => b.rows.length > 1).map((b) => (
          <MixChart key={b.dim} rows={b.rows} title={`Audiencia por ${b.dim}`}
            hint="Composición promedio de la audiencia en el periodo." />
        ))}

        {perf.filter((p) => p.rows.length > 0).map((p) => (
          <CustomPerformance key={p.field} rows={p.rows} field={`Desempeño por ${p.field}`} />
        ))}
      </div>
    </>
  );
}
