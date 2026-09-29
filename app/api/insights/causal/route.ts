import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getCausalChains } from '@/lib/insights';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no hay proyecto' }, { status: 404 });
  const chains = await getCausalChains(project.id, true);
  if (!chains) return NextResponse.json({ error: 'datos insuficientes o se alcanzó el tope de la API' }, { status: 400 });
  return NextResponse.json({ chains });
}
