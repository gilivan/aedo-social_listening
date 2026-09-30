import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { importSocialPackage, type ImportPackage } from '@/lib/social-import';
import { splitCompetitorMentions } from '@/lib/competitor-split';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no hay proyecto' }, { status: 404 });
  if (project.competitorOf) return NextResponse.json({ error: 'importa desde el proyecto de la marca, no desde el de competencia' }, { status: 400 });
  try {
    const pkg = (await req.json()) as ImportPackage;
    const r = await importSocialPackage(project.id, pkg);
    // Lo que es solo de la competencia pasa de una vez a su proyecto.
    const split = await splitCompetitorMentions(project).catch(() => null);
    return NextResponse.json({ ...r, movedToCompetitors: split?.moved ?? 0, project: project.name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
