import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { ReportTabs } from '@/components/report-tabs';
import { ReportBuilder } from '@/components/report-builder';

export const metadata = { title: 'Reporte personalizado' };
export const dynamic = 'force-dynamic';

export default async function ReportPage() {
  if (!isAdmin(await getCurrentUser())) return <EmptyState message="La creación de reportes está disponible para administradores." />;
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Primero selecciona un proyecto." />;

  return (
    <>
      <PageHeader
        title="Reporte personalizado"
        subtitle="Elige los gráficos que necesitas, ordénalos como quieras y agrega el comentario: escrito por ti o generado por la IA a partir de los números del propio proyecto."
        info="Aquí un reporte es un ESQUEMA, no un documento congelado: solo se guardan la selección de gráficos, su orden y tus comentarios. Las cifras se recalculan desde el archivo cada vez que exportas, así que exportar el mismo reporte el mes siguiente cuenta la historia del mes siguiente. Los comentarios de IA se escriben a partir de cifras ya calculadas por SQL: el modelo interpreta, nunca produce un número. Todos los comentarios siguen siendo editables, y editar uno lo marca como tuyo. Cada archivo exportado incluye la divulgación exigida por la Ley de IA (AI Act)."
      />
      <ReportTabs />
      <ReportBuilder />
    </>
  );
}
