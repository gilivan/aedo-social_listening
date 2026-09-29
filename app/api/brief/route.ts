import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { generateDailyBrief, aiStatus } from '@/lib/claude';
import { collectBriefData } from '@/lib/pipeline';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Genera il brief di OGGI su richiesta, per quando il ciclo notturno non l'ha
 * prodotto (cron saltato, tetto di spesa raggiunto, chiave mancante).
 * L'errore restituito dice ESATTAMENTE perché, invece di fallire in silenzio.
 */
export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no hay proyecto' }, { status: 404 });

  const status = await aiStatus();
  if (!status.hasKey) {
    return NextResponse.json({ error: 'no hay ninguna clave de IA configurada — agrega una en Ajustes → Presupuesto' }, { status: 400 });
  }
  if (status.capReached) {
    return NextResponse.json({
      error: `se alcanzó el tope de gasto ($${status.spend.toFixed(2)} de $${status.budget}) — súbelo en Ajustes → Presupuesto`,
    }, { status: 400 });
  }

  const data = await collectBriefData(project.id);
  // Distinguere "non ho dati" da "il modello ha fallito": è la differenza fra
  // un problema di raccolta e un problema di generazione, e l'utente deve
  // sapere quale dei due ha davanti.
  if (!data.total) {
    return NextResponse.json({
      error: 'no se ha recopilado nada para este proyecto en los últimos 30 días — revisa las palabras clave y las fuentes en Ajustes y luego usa “Actualizar ahora”',
    }, { status: 400 });
  }
  const ok = await generateDailyBrief(project.id, project.name, data);
  if (!ok) return NextResponse.json({ error: 'el modelo no devolvió un brief — inténtalo de nuevo' }, { status: 400 });
  return NextResponse.json({ generated: true, window: data.window, mentions: data.total });
}
