import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { ingestReviews } from '@/lib/reviews';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no hay proyecto' }, { status: 404 });
  try {
    // Vedi lo stesso fix in app/api/sport/refresh: senza idratare qui, la
    // chiave Google Places salvata dall'utente non sarebbe mai visibile a cfg().
    await hydrateConnectorCredentials();
    const sourceId = Number(new URL(req.url).searchParams.get('source')) || 0;
    const { tried, fetched, skipped, errors } = await ingestReviews(
      project.id, sourceId ? { sourceIds: [sourceId] } : { onlyStale: true },
    );
    if (tried === 0 && skipped > 0) return NextResponse.json({ fetched: 0, errors: [], note: 'todas las fuentes están al día' });
    if (tried === 0) return NextResponse.json({ error: 'todavía no hay ninguna fuente de reseñas configurada — agrega una abajo' }, { status: 400 });
    // Si algo falló y no llegó nada, se muestra el motivo en la pantalla (antes solo iba a la consola).
    if (errors.length && fetched === 0) {
      return NextResponse.json({ error: errors.map((e) => `${e.label}: ${e.message}`).join(' · ') }, { status: 502 });
    }
    return NextResponse.json({ fetched, errors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
