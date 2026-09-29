import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { ingestTrials } from '@/lib/trials';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no hay proyecto' }, { status: 404 });
  try {
    const r = await ingestTrials(project.id);
    if (r.tried === 0) return NextResponse.json({ error: 'primero elige qué seguir (medicamentos, condiciones, patrocinadores)' }, { status: 400 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
