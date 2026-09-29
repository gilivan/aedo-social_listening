import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/ui';
import { ImportWorkspace } from '@/components/import-workspace';

export const metadata = { title: 'Importar datos' };

export default async function ImportPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return <EmptyState message="La importación de datos está disponible para administradores." />;

  const sp = await searchParams;
  const projectId = Number(sp.project);
  const db = await getDb();
  const [p] = projectId
    ? await db.select({ id: projects.id, name: projects.name, mode: projects.mode }).from(projects).where(eq(projects.id, projectId))
    : [];

  if (!p || p.mode !== 'upload') {
    return (
      <EmptyState message="Primero abre un proyecto de importación. Créalo desde Proyectos → Nuevo proyecto → Importar archivo y luego sube tus archivos aquí." />
    );
  }

  return (
    <>
      <PageHeader
        title={`Importar en “${p.name}”`}
        subtitle="Una destilería para exportaciones de listening: suelta todos los archivos Excel o CSV que quieras; AEDO lee lo que realmente contiene cada columna y los convierte en menciones que todo el motor de análisis entiende."
        info="Los archivos se conservan como materia prima, no se consumen: sus filas quedan guardadas intactas y las menciones se DERIVAN del mapeo actual. Cambia cualquier asignación de campo y vuelve a importar, sin volver a subir nada; el original nunca se altera. Cada mención recuerda de qué archivo vino, así que un solo archivo se puede reprocesar o eliminar sin tocar el resto del proyecto. El sentimiento que ya trae el archivo se importa tal cual y se salta el paso de IA."
      />
      <div className="mb-4">
        <Link href="/settings" className="text-xs text-slate-500 hover:text-slate-300">← volver a Proyectos</Link>
      </div>
      <ImportWorkspace project={{ id: p.id, name: p.name }} />
    </>
  );
}
