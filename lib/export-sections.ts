// Unica fonte di verità delle sezioni esportabili: la usano SIA il configuratore
// (client, components/export-bar.tsx) SIA i renderer (server, lib/export-data.ts
// e app/api/export/*). Nessun import: così può stare nel bundle client senza
// trascinarsi dietro il codice server. Aggiungere una sezione qui la rende
// disponibile in tutti e quattro i formati e nel selettore, senza disallineamenti.

export type ExportSection = { id: string; label: string; group: string };

export const EXPORT_SECTIONS = [
  // Overview — il colpo d'occhio del progetto
  { id: 'kpi', label: 'Resumen (KPI)', group: 'Resumen' },
  { id: 'kpiStandard', label: 'KPI estándar (con fórmulas)', group: 'Resumen' },
  { id: 'reliability', label: 'Confiabilidad de los datos (análisis crítico L1)', group: 'Resumen' },
  { id: 'health', label: 'Brand Health Index', group: 'Resumen' },
  { id: 'trends', label: 'Tendencias emergentes', group: 'Resumen' },
  { id: 'volume', label: 'Volumen por fuente', group: 'Resumen' },
  { id: 'sentiment', label: 'Sentimiento', group: 'Resumen' },
  { id: 'topics', label: 'Temas principales', group: 'Resumen' },
  // Deep analysis — le analisi avanzate
  { id: 'emotions', label: 'Radar de emociones', group: 'Análisis profundo' },
  { id: 'momentum', label: 'Cuadrante de momentum', group: 'Análisis profundo' },
  { id: 'flow', label: 'Flujo de conversación', group: 'Análisis profundo' },
  { id: 'constellation', label: 'Constelación semántica', group: 'Análisis profundo' },
  { id: 'geo', label: 'Países', group: 'Análisis profundo' },
  { id: 'crisis', label: 'Radar de crisis y pico', group: 'Análisis profundo' },
  // Benchmark & audience — confronti e chi parla
  { id: 'benchmark', label: 'Benchmark', group: 'Benchmark y audiencia' },
  { id: 'sov', label: 'Share of Voice en el tiempo', group: 'Benchmark y audiencia' },
  { id: 'audience', label: 'Audiencia', group: 'Benchmark y audiencia' },
  { id: 'network', label: 'Red de influenciadores', group: 'Benchmark y audiencia' },
  { id: 'pyramid', label: 'Pirámide de autores', group: 'Benchmark y audiencia' },
  // People — personal branding, quando il progetto segue delle persone
  { id: 'people', label: 'Ranking de personas', group: 'Personas' },
  { id: 'peopleGrowth', label: 'Crecimiento de audiencia por persona', group: 'Personas' },
  { id: 'peopleDetail', label: 'Fichas de personas (detalle)', group: 'Personas' },
  // Intelligence — narrazione e sintesi
  { id: 'pov', label: 'Punto de vista', group: 'Inteligencia' },
  { id: 'narratives', label: 'Narrativas', group: 'Inteligencia' },
  { id: 'timeline', label: 'Línea de tiempo de eventos', group: 'Inteligencia' },
  { id: 'alerts', label: 'Alertas', group: 'Inteligencia' },
  { id: 'brief', label: 'Brief diario', group: 'Inteligencia' },
  // Raw data — dati grezzi
  { id: 'content', label: 'Contenido destacado', group: 'Datos en bruto' },
  { id: 'mentions', label: 'Lista de menciones', group: 'Datos en bruto' },
] as const satisfies readonly ExportSection[];

export type SectionId = (typeof EXPORT_SECTIONS)[number]['id'];
export const ALL_SECTION_IDS = EXPORT_SECTIONS.map((s) => s.id) as SectionId[];

/** Ordine dei gruppi per il selettore. */
export const SECTION_GROUPS = [
  'Resumen', 'Análisis profundo', 'Benchmark y audiencia', 'Personas', 'Inteligencia', 'Datos en bruto',
] as const;
