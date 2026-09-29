import { marked } from 'marked';
import { briefList, getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ContentLocaleSwitch } from '@/components/content-locale-switch';
import { BriefFreshness } from '@/components/brief-freshness';
import { getContentLocale } from '@/lib/content-locale';
import { claudeAvailable } from '@/lib/claude';
import { CopyButton } from '@/components/copy-button';

export const metadata = { title: 'Brief' };

export default async function BriefPage() {
  const contentLocale = await getContentLocale();
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const rows = await briefList(project.id);

  return (
    <>
      <PageHeader
        title={t('page.brief.title', 'Brief diario')}
        subtitle={t('page.brief.subtitle', 'Brief ejecutivo generado cada mañana con los datos de las últimas 24 horas')}
      />
      <div className="mb-4 flex justify-end"><ContentLocaleSwitch current={contentLocale} /></div>
      <BriefFreshness latestDate={rows[0]?.briefDate ?? null} />
      {rows.length === 0 ? (
        <EmptyState message={await claudeAvailable()
          ? 'El primer brief se generará en la próxima ejecución diaria programada.'
          : 'Necesitas la clave de API de Claude (ANTHROPIC_API_KEY) para generar briefs.'} />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((b) => (
            <article key={b.id} className="panel px-6 py-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-sky-400">
                  {new Date(b.briefDate).toLocaleDateString('es-CO', { dateStyle: 'full' })}
                </p>
                <CopyButton text={b.content} />
              </div>
              <div
                className="brief-md text-sm text-slate-300"
                dangerouslySetInnerHTML={{ __html: marked.parse(b.content) as string }}
              />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
