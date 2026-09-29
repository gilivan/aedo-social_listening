import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { translatePointOfView } from '@/lib/pov';
import type { ContentLocale } from '@/lib/content-locale';

// Tradurre significa riprodurre l'INTERO documento: l'uscita è lunga quanto
// l'originale, quindi serve lo stesso respiro della generazione.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Traduce la tesi già generata: è l'azione delle bandierine "AI writes in" sulla
 * pagina Point of View — veloce, non rilegge i dati. Per rifare l'analisi da capo
 * si usa "Rebuild the argument" (POST /api/pov).
 */
export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no hay proyecto' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const locale: ContentLocale = body?.locale === 'it' ? 'it' : 'en';

  const { pov, reason } = await translatePointOfView(project.id, 90, locale);
  if (!pov) {
    const msg = reason === 'not_built' ? 'todavía no hay un punto de vista para traducir — primero créalo'
      : reason === 'no_ai' ? 'falta la clave de IA o se alcanzó el tope de gasto'
        : 'la traducción tardó demasiado o falló — inténtalo de nuevo';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ pov });
}
