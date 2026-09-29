import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { getCurrentProject } from '@/lib/data';
import { claudeAvailable } from '@/lib/claude';
import { getMeta } from '@/lib/db';
import { isDemoMode } from '@/lib/session';
import { GenerateMd } from '@/components/generate-md';

export const metadata = { title: 'Qué cambió' };

export default async function ChangesPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const cached = await getMeta<string>(`compare:${project.id}:${new Date().toISOString().slice(0, 10)}`);

  return (
    <>
      <PageHeader
        title={t('page.changes.title', 'Qué cambió')}
        subtitle={t('page.changes.subtitle', 'Comparación inteligente: los últimos 7 días frente a los 7 anteriores, explicada en palabras')}
      />
      {await claudeAvailable() && !isDemoMode() ? (
        <GenerateMd
          endpoint="/api/compare"
          responseKey="comparison"
          buttonLabel="Generar la comparación semanal"
          busyLabel="Comparando las dos semanas…"
          hint="La comparación se calcula una vez al día (~2 centavos de dólar); las solicitudes posteriores son gratis."
          initial={cached ?? null}
        />
      ) : (
        <EmptyState message={isDemoMode()
          ? '✨ La comparación semanal es una función de IA en vivo: instálala en tu propio servidor con tu clave de Anthropic para probarla.'
          : 'Necesitas la clave de API de Claude para la comparación inteligente.'} />
      )}
    </>
  );
}
