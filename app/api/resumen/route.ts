import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { buildExecSummary } from '@/lib/executive-summary';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no hay proyecto' }, { status: 404 });
  await hydrateConnectorCredentials();
  const { summary, error } = await buildExecSummary(project.id);
  if (!summary) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
