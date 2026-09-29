import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { collectExportData } from '@/lib/export-data';
import { ALL_SECTION_IDS, type SectionId } from '@/lib/export-sections';
import { generateComments, type CommentRequest } from '@/lib/custom-report';
import { resolveStudioBlocks } from '@/lib/studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Una raccolta dati completa più una chiamata al modello.
export const maxDuration = 120;

/**
 * Commenti AI per le sezioni scelte. Accetta una LISTA: commentare dieci
 * grafici costa una raccolta dati e una chiamata al modello, non dieci.
 */
export async function POST(req: Request) {
  if (!isAdmin(await getCurrentUser())) {
    return NextResponse.json({ error: 'Solo los administradores pueden generar comentarios' }, { status: 403 });
  }
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'No hay ningún proyecto seleccionado' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const days = Math.min(90, Math.max(1, Number(body.days) || 30));
  const sections = (Array.isArray(body.sections) ? body.sections : [])
    .filter((s: unknown): s is SectionId => ALL_SECTION_IDS.includes(s as SectionId));
  const studioIds = (Array.isArray(body.studio) ? body.studio : [])
    .map(Number).filter((n: number) => Number.isFinite(n) && n > 0);
  if (!sections.length && !studioIds.length) {
    return NextResponse.json({ error: 'No hay ningún gráfico seleccionado' }, { status: 400 });
  }

  const role: CommentRequest = ['intro', 'comment', 'both', 'synthesis'].includes(body.role)
    ? body.role : 'comment';

  try {
    const [data, resolved] = await Promise.all([
      collectExportData(project, days),
      resolveStudioBlocks(project.id, studioIds),
    ]);
    const studio = [...resolved.entries()].map(([id, chart]) => ({ id, chart }));
    const { comments, synthesis, empty, emptyStudio, available, noFacts } =
      await generateComments(data, sections, role, studio);
    if (!available) {
      // `empty` viaggia anche qui: sapere QUALI grafici sono senza dati resta
      // un'informazione utile pure quando il motore AI è spento.
      return NextResponse.json({
        error: 'Motor de IA no disponible: falta la clave o se alcanzó el tope de gasto. De todos modos puedes escribir el comentario a mano.',
        empty, emptyStudio,
      }, { status: 503 });
    }
    if (noFacts) {
      return NextResponse.json({
        error: 'Los gráficos elegidos no tienen datos para describir en el periodo configurado: agrega un gráfico con cifras o amplía el periodo del informe.',
        empty, emptyStudio,
      }, { status: 400 });
    }
    return NextResponse.json({ comments, synthesis, empty, emptyStudio });
  } catch (e) {
    console.error('[report] generazione commenti fallita:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
