import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getSchedule, setSchedule } from '@/lib/periodic-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quali cadenze escono da sole, per il progetto corrente. */
export async function GET() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'No hay ningún proyecto seleccionado' }, { status: 400 });
  return NextResponse.json({ cadences: await getSchedule(project.id) });
}

export async function PUT(req: Request) {
  if (!isAdmin(await getCurrentUser())) {
    return NextResponse.json({ error: 'Solo los administradores pueden cambiar las frecuencias' }, { status: 403 });
  }
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'No hay ningún proyecto seleccionado' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const cadences = await setSchedule(project.id, Array.isArray(body.cadences) ? body.cadences : []);
  return NextResponse.json({ cadences });
}
