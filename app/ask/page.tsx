import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ContentLocaleSwitch } from '@/components/content-locale-switch';
import { getContentLocale } from '@/lib/content-locale';
import { getCurrentProject } from '@/lib/data';
import { claudeAvailable } from '@/lib/claude';
import { isDemoMode } from '@/lib/session';
import { AskChat } from '@/components/ask-chat';

export const metadata = { title: 'Pregúntale a los datos' };

export default async function AskPage() {
  const contentLocale = await getContentLocale();
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No hay ningún proyecto configurado.')} />;
  const aiOn = await claudeAvailable();

  return (
    <>
      <PageHeader
        title={t('page.ask.title', 'Pregúntale a los datos')}
        subtitle={`Haz preguntas en lenguaje natural sobre los datos de “${project.name}”: el analista de IA responde con cifras y evidencia`}
      />
      <div className="mb-4 flex justify-end"><ContentLocaleSwitch current={contentLocale} /></div>
      {aiOn && !isDemoMode()
        ? <AskChat suggestions={[
            '¿Cuál fue el tema más comentado en los últimos 3 días?',
            '¿El sentimiento está mejorando o empeorando? ¿Por qué?',
            '¿Qué se dice distinto en inglés frente a otros idiomas?',
            '¿Qué fuentes crecen más esta semana?',
          ]} />
        : <EmptyState message={isDemoMode()
            ? '✨ El analista conversacional es una función de IA en vivo: instálalo en tu propio servidor con tu clave de Anthropic para probarlo.'
            : 'Necesitas la clave de API de Claude para usar el analista.'} />}
    </>
  );
}
