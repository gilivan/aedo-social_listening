import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { ReportTabs } from '@/components/report-tabs';
import { PeriodicReports } from '@/components/periodic-reports';

export const metadata = { title: 'Reporte periódico' };
export const dynamic = 'force-dynamic';

export default async function PeriodicReportPage() {
  if (!isAdmin(await getCurrentUser())) return <EmptyState message="La creación de reportes está disponible para administradores." />;
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Primero selecciona un proyecto." />;

  return (
    <>
      <PageHeader
        title="Reporte periódico"
        subtitle="Las cifras del periodo, el brief y la tesis en un solo documento: diario, semanal, quincenal, mensual, trimestral, semestral o anual."
        info="Las cadencias cortas REUTILIZAN el Punto de vista actual en lugar de reescribirlo: una tesis que se sostiene por una semana es realista, y regenerar una por cadencia y por proyecto sería el mayor costo individual de la app. De mensual en adelante se escribe una tesis nueva sobre la ventana de ese periodo. En ambos casos, el documento siempre indica de dónde viene la tesis: cuándo se escribió, sobre qué ventana, con cuántas menciones y si fue reutilizada. Una edición queda congelada una vez generada: la tesis se guarda con ella, así que abrir en diciembre una edición de julio sigue mostrando la lectura de julio, no la de hoy."
      />
      <ReportTabs />
      <PeriodicReports />
    </>
  );
}
