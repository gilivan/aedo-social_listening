import { getCurrentProject } from '@/lib/data';
import { getTimeline } from '@/lib/timeline';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { TimelineView } from '@/components/timeline-view';
import { SectionTabs } from '@/components/section-tabs';

export const metadata = { title: 'Línea de tiempo' };

export default async function TimelinePage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const events = await getTimeline(project.id);

  return (
    <>
      <SectionTabs group="story" />
      <PageHeader
        title={t('page.timeline.title', 'Línea de tiempo')}
        subtitle={t('page.timeline.subtitle', 'La memoria histórica de tu monitoreo: eventos destacados, extraídos a diario por IA. Crece sola con el tiempo.')}
      />
      <TimelineView
        events={events.map((e) => ({
          id: e.id,
          date: e.eventDate,
          title: e.title,
          description: e.description,
          importance: e.importance,
        }))}
        canGenerate={await claudeAvailable()}
      />
    </>
  );
}
