import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getCurrentProject } from '@/lib/data';
import { importReviewsFromSheet, type ReviewColumnMap } from '@/lib/reviews/import';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: 'Solo para administradores' }, { status: 403 });
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'No hay proyecto' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file');
  const label = String(form.get('label') ?? '');
  let map: ReviewColumnMap;
  try { map = JSON.parse(String(form.get('map') ?? '{}')); } catch { return NextResponse.json({ error: 'Mapeo no válido' }, { status: 400 }); }
  if (!(file instanceof File)) return NextResponse.json({ error: 'No hay archivo' }, { status: 400 });
  if (!map.rating || !map.content) return NextResponse.json({ error: 'Primero mapea las columnas de calificación y texto' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await importReviewsFromSheet(project.id, buf, file.name, map, label);
  return NextResponse.json(result);
}
