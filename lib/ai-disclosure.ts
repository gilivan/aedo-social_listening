// ---------------------------------------------------------------------------
// Informativa AI Act — Regolamento (UE) 2024/1689, art. 50.
//
// Dal 2 agosto 2026 gli obblighi di trasparenza dell'art. 50 sono applicabili:
// i contenuti generati o manipolati da un sistema di IA vanno resi
// riconoscibili in forma comprensibile per una persona (art. 50, par. 4) E in
// formato leggibile da una macchina (art. 50, par. 2).
//
// Per questo l'informativa viaggia su DUE canali in ogni file esportato:
//   1. una nota visibile — piè di pagina, note di slide, foglio "Note";
//   2. i metadati del file (subject/keywords/description), che è la parte
//      leggibile da una macchina e non occupa spazio nel layout.
//
// Un'avvertenza onesta sulla nota visibile: le linee guida della Commissione
// del 20 luglio 2026 considerano NON conforme un'informativa nascosta in un
// piè di pagina minuscolo. Qui è ripetuta su OGNI pagina, in un formato
// leggibile, e accompagnata da una nota metodologica: è la lettura più
// difendibile della richiesta "va nelle note, non nei titoli".
// ---------------------------------------------------------------------------

/** Riga breve: piè di pagina di ogni pagina/slide/foglio. */
export const AI_DISCLOSURE_SHORT =
  // 2024/1689 è il numero dell'atto (anno di adozione), non la data
  // dell'obbligo: l'art. 50 è applicabile dal 2 agosto 2026. Le due date
  // convivono nella riga apposta, perché insieme sono meno ambigue.
  'Elaborado con el apoyo de inteligencia artificial — Reg. (UE) 2024/1689 (AI Act), '
  + 'art. 50, aplicable desde el 2 de agosto de 2026';

/** Nota estesa: pagina delle note, foglio "Note", metadati. */
export const AI_DISCLOSURE_LONG =
  'Elaborado con el apoyo de inteligencia artificial. Este documento contiene textos '
  + 'generados automáticamente por sistemas de IA generativa (resúmenes, comentarios, Punto de vista, brief, '
  + 'clasificaciones de sentimiento y temas). Los valores numéricos y los rankings provienen de '
  + 'consultas directas al archivo del proyecto, no del modelo. '
  + 'Aviso emitido conforme al art. 50 del Reglamento (UE) 2024/1689 (AI Act), '
  + 'aplicable desde el 2 de agosto de 2026.';

/** Marcatura leggibile da una macchina: metadati del file. */
export const AI_DISCLOSURE_META = {
  subject: 'Contenido generado con el apoyo de inteligencia artificial (AI-generated content)',
  keywords: 'AI-generated, inteligencia artificial, EU AI Act, Reglamento (UE) 2024/1689 art. 50, synthetic text',
  description: AI_DISCLOSURE_LONG,
} as const;
