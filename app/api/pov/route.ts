import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { buildPointOfView } from '@/lib/pov';

// La tesi è la generazione più lunga dell'app: un solo passaggio produce
// titolo, introduzione, blocchi, contro-segnali e implicazioni (~2300 token in
// uscita), che su Sonnet può superare abbondantemente il minuto. Con il limite
// a 60s la piattaforma uccideva la funzione a metà generazione — e la chiamata
// non compariva nemmeno nei consumi, perché non arrivava mai a completarsi.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no hay proyecto' }, { status: 404 });
  const { pov, reason } = await buildPointOfView(project.id, 90);
  if (!pov) {
    const msg = reason === 'thin_data' ? 'todavía no hay suficientes datos para un punto de vista'
      : reason === 'no_ai' ? 'falta la clave de IA o se alcanzó el tope de gasto'
        : 'el modelo tardó demasiado o no devolvió un argumento utilizable — inténtalo de nuevo en un momento';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ pov });
}
