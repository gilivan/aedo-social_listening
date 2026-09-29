'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UploadCloud, FileSpreadsheet, Check, Loader2, ArrowRight, Sparkles, AlertTriangle, EyeOff, Wand2, Trash2, RefreshCw, ChevronDown, ChevronRight, Archive, Download, Eye, Table2, Layers, CalendarRange, PlayCircle, ClipboardCheck, LineChart, Info, Rocket, ShieldCheck, User,
} from 'lucide-react';
import { SpotCheck } from '@/components/import-spotcheck';
import { ImportAgentPanel } from '@/components/import-agent-panel';
import { ImportStepper } from '@/components/import-stepper';
import { stages, currentStage } from '@/lib/import-stages';
import { TopProgress, creepingProgress } from './top-progress';

// ---------------------------------------------------------------------------
// Il distillatore di file.
//
// Il flusso è sempre lo stesso e resta visibile: CARICA → ASSEGNA → VERIFICA →
// IMPORTA. La verifica è il passo che mancava: prima si assegnavano le colonne
// alla cieca e si scopriva il risultato solo dopo aver scritto in archivio.
// Ora l'anteprima passa dalla stessa funzione dell'import, quindi ciò che
// mostra è letteralmente ciò che verrà scritto.
//
// I file restano materiale grezzo: si rimappa e si reimporta senza ricaricare
// nulla, e da qui esce anche il NORMALIZZATO — gli N file fusi in un'unica
// tabella, che è il motivo per cui un progetto nasce da più export.
// ---------------------------------------------------------------------------

type Profile = { name: string; kind: string; filled: number; distinct: number; samples: string[]; avgLength: number };
type Proposal = { column: string; field: string | null; confidence: 'alta' | 'media' | 'bassa' | null; reason: string };
type Report = { total: number; inserted: number; skippedEmpty: number; duplicates: number; datesFailed: number; sentimentImported: number };
type Issues = { formulas: number; formulaErrors: number; formulaNoValue: number };
/** La risposta del caricamento: inventario dei fogli, oppure esito. */
type UploadReply = {
  needsChoice?: boolean;
  sheets?: SheetInfo[];
  fileId?: number;
  imported?: number;
  failed?: { sheet: string; reason: string }[];
  error?: string;
};

type ImportFile = {
  id: number; filename: string; sizeBytes: number; rowCount: number;
  columns: string[]; profiles: Profile[]; proposal: Proposal[] | null;
  mapping: Record<string, string>; status: 'uploaded' | 'mapped' | 'imported';
  report: Report | null; rawPurged: boolean; usedAi: boolean; issues: Issues | null;
  sheetName: string | null;
  kind: 'mentions' | 'metrics';
  metricMap: MetricMap | null;
  extras: Record<string, string>;
  /** Il foglio parla di persone (personal branding), non di canali. */
  people?: boolean;
  /** La persona a cui il foglio è intestato, letta dal nome del foglio. */
  person?: string | null;
  /** Righe di questo file davvero presenti in archivio adesso. */
  inArchive: number;
  createdAt: string; importedAt: string | null;
};
type MetricMap = {
  date?: string; entity?: string; entityLabel?: string;
  metrics?: string[]; dims?: string[];
};
type SheetInfo = {
  name: string; hidden: boolean; rows: number; columns: number;
  headerRow: number; headers: string[]; twoRowHeader: boolean;
};
type PreviewRow = {
  publishedAt: string; dateFellBack: boolean; source: string; content: string;
  author: string | null; sentiment: string | null; reach: number | null;
  likes: number | null; comments: number | null; shares: number | null;
  engagementScore: number; language: string | null; url: string | null;
};

const FIELDS: { key: string; label: string; hint: string; help: string; required?: boolean }[] = [
  { key: 'content', label: 'Texto', hint: 'lo que se analiza', required: true,
    help: 'El texto del post o del artículo. Es el único campo obligatorio: de aquí salen el sentimiento, los temas y las emociones. Si falta, la fila no se importa, a menos que haya un título, que uso en su lugar.' },
  { key: 'date', label: 'Fecha', hint: 'para los gráficos temporales', 
    help: 'Cuándo se publicó. Sin ella, cada fila queda con la fecha de hoy y todos los gráficos temporales se vuelven una sola columna. Leo formatos latinos, estadounidenses y los seriales de Excel.' },
  { key: 'time', label: 'Hora', hint: 'solo si está en columna aparte',
    help: 'Sirve SOLO si la hora y la fecha están en dos columnas distintas. Si la columna de fecha ya incluye la hora, deja esto vacío.' },
  { key: 'title', label: 'Título', hint: 'titular, si va aparte',
    help: 'El titular, cuando está separado del texto. También sirve de respaldo: si el texto de una fila está vacío, uso el título en lugar de descartarla.' },
  { key: 'author', label: 'Autor', hint: 'quién escribió',
    help: 'El nombre de quien publica. Alimenta los rankings de autores, la pirámide de influencia y, si los nombres son personas que sigues, las fichas personales.' },
  { key: 'authorHandle', label: 'Handle', hint: '@username',
    help: 'El nombre de usuario (@nombre). Útil cuando el mismo autor aparece con nombres escritos de forma distinta.' },
  { key: 'source', label: 'Fuente', hint: 'plataforma o medio',
    help: 'La plataforma o el medio. Se vuelve un filtro en Escucha y una serie en los gráficos por canal. Atención: una columna que se llama "Source" pero contiene Organic/Sponsored NO es la fuente; mira los valores.' },
  { key: 'url', label: 'Enlace', hint: 'URL del original',
    help: 'El enlace al contenido original, para abrirlo desde la ficha de la mención.' },
  { key: 'language', label: 'Idioma', hint: 'es, en, "Español"…',
    help: 'Reconozco tanto los códigos (es, en, es-CO) como los nombres completos (Español, English). Se vuelve un filtro y sirve para no traducir lo que ya está en tu idioma.' },
  { key: 'community', label: 'Comunidad', hint: 'grupo, página, subreddit',
    help: 'El grupo, la página o el subreddit donde salió. Alimenta la vista Audiencia: dónde ocurre la conversación.' },
  { key: 'sentiment', label: 'Sentimiento', hint: 'ya calculado: evita el costo de IA',
    help: 'Si el archivo ya trae el sentimiento, asígnalo: te ahorras el análisis de IA en cada fila. Entiendo palabras (Positivo/Negative/neutro) y puntajes, tanto -1..+1 como 0..100.' },
  { key: 'reach', label: 'Alcance', hint: 'impresiones potenciales',
    help: 'Cuántas personas podían ver el contenido. No lo confundas con los seguidores del autor: son cosas distintas y el alcance es por contenido.' },
  { key: 'likes', label: 'Me gusta', hint: 'reacciones',
    help: 'Reacciones, me gusta, favoritos. Junto con comentarios y compartidos forma el puntaje de engagement con el que se ordenan los mejores contenidos.' },
  { key: 'comments', label: 'Comentarios', hint: 'respuestas',
    help: 'Número de comentarios o respuestas. En el puntaje de engagement pesa el doble que un me gusta: cuesta más esfuerzo.' },
  { key: 'shares', label: 'Compartidos', hint: 'retweet, repost',
    help: 'Compartidos, retweets, reposts. En el puntaje pesan el triple que un me gusta: es la señal más fuerte de adhesión.' },
  { key: 'views', label: 'Visualizaciones', hint: 'vistas',
    help: 'Visualizaciones de video. Pesan poco en el puntaje (una por cada 200) porque una vista no es una interacción.' },
  { key: 'engagement', label: 'Engagement total', hint: 'solo si falta el detalle',
    help: 'Úsalo SOLO si el archivo no tiene me gusta, comentarios y compartidos por separado: cuando existen, el total se calcula a partir de ellos. Y no asignes aquí una TASA porcentual: "Engagement Rate 15,4%" no son 15 interacciones.' },
];
const FIELD_LABEL: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

const STATUS: Record<ImportFile['status'], { label: string; cls: string; step: number }> = {
  uploaded: { label: 'por asignar', cls: 'bg-amber-500/15 text-amber-300', step: 1 },
  mapped: { label: 'listo', cls: 'bg-sky-500/15 text-sky-300', step: 2 },
  imported: { label: 'importado', cls: 'bg-emerald-500/15 text-emerald-300', step: 3 },
};

const num = (n: number) => n.toLocaleString('es-CO');

/** Un foglio è pronto quando ha ciò che serve al SUO tipo di lettura. */
const isReady = (f: ImportFile) => (f.kind === 'metrics'
  ? Boolean(f.metricMap?.date && (f.metricMap.metrics ?? []).length)
  : Boolean(f.mapping.content));

export function ImportWorkspace({ project }: { project: { id: number; name: string } }) {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [analyzeMsg, setAnalyzeMsg] = useState('');
  /** Il data scientist ha già letto i file in questa sessione. */
  const [scientistRead, setScientistRead] = useState(false);
  /**
   * Si mostrano solo i fogli che hanno bisogno di qualcosa.
   *
   * Quaranta schede tutte uguali, di cui trentasette a posto, non sono
   * informazione: sono un muro. Quelle a posto restano contate in una riga, e
   * si aprono se uno vuole.
   */
  const [showAll, setShowAll] = useState(false);
  /** File caricato in attesa che l'utente scelga quali fogli importare. */
  const [pending, setPending] = useState<{ file: File; sheets: SheetInfo[] } | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  /** Il log si apre da solo appena finisce un import: è il momento in cui serve. */
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/import/files?project=${project.id}`);
    const d = await res.json();
    if (res.ok) setFiles(d.files ?? []);
    else setError(d.error ?? 'Error al cargar');
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  /**
   * Carica un file. Se contiene più fogli non se ne sceglie uno a caso: si
   * mostra l'inventario e decide l'utente. Il file resta qui nel browser, così
   * la scelta non costa un secondo caricamento all'utente.
   */
  const upload = async (f: File, sheets?: string[]) => {
    setBusy('upload'); setError('');
    // Leggere e profilare venti fogli richiede minuti: senza un segno di vita
    // in cima allo schermo l'utente crede che sia bloccato e ricarica la
    // pagina, interrompendo davvero l'operazione.
    setProgress(2);
    const timer = sheets?.length ? null : creepingProgress(setProgress);
    try {
      if (!sheets?.length) {
        setPhase('Abriendo el archivo y haciendo el inventario de hojas…');
        const d = await post(f, []);
        if (!d) return;
        if (d.needsChoice && d.sheets) { setPending({ file: f, sheets: d.sheets }); return; }
        setPending(null);
        await load();
        if (d.fileId) setOpen(d.fileId);
        return;
      }

      // I fogli vanno a piccoli gruppi. Ogni foglio va letto, profilato e
      // proposto all'AI: chiederne quaranta in una richiesta sola significa
      // superare il tempo massimo e far morire tutto insieme — e all'utente
      // arriva un errore del browser invece di una spiegazione.
      const CHUNK = 4;
      let done = 0;
      let firstId: number | undefined;
      const failed: { sheet: string; reason: string }[] = [];

      for (let i = 0; i < sheets.length; i += CHUNK) {
        const group = sheets.slice(i, i + CHUNK);
        setPhase(`Leyendo las hojas ${done + 1}–${Math.min(done + group.length, sheets.length)} de ${sheets.length}: filas, columnas y reconocimiento…`);
        const d = await post(f, group);
        if (!d) return;
        firstId ??= d.fileId;
        if (Array.isArray(d.failed)) failed.push(...d.failed);
        done += group.length;
        setProgress(Math.round((done / sheets.length) * 100));
      }

      setPending(null);
      await load();
      if (firstId) setOpen(firstId);
      setShowLog(true);
      if (failed.length) {
        setError(`${failed.length} hojas no se importaron: ${failed.map((x) => `${x.sheet} (${x.reason})`).join('; ')}. Las otras ${done - failed.length} sí.`);
      }
    } catch (e) { setError((e as Error).message); }
    finally { if (timer) clearInterval(timer); setProgress(0); setBusy(''); }
  };

  /**
   * Una richiesta di caricamento. Restituisce null quando è andata male,
   * avendo già scritto il motivo: una risposta che non è JSON — un timeout del
   * server, una pagina di errore della piattaforma — non deve arrivare
   * all'utente come "The string did not match the expected pattern".
   */
  const post = async (f: File, sheets: string[]): Promise<UploadReply | null> => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('projectId', String(project.id));
    if (sheets.length) fd.append('sheets', sheets.join('\n'));

    const res = await fetch('/api/import/files', { method: 'POST', body: fd });
    const text = await res.text();
    let d: UploadReply | null = null;
    try { d = JSON.parse(text); } catch { /* non era JSON */ }

    if (!d) {
      setError(res.status === 413
        ? 'El archivo es demasiado grande para cargarlo de una sola vez.'
        : `El servidor no respondió (${res.status}). Si el archivo tiene muchas hojas, impórtalas de a pocas.`);
      return null;
    }
    if (!res.ok) { setError(d.error ?? 'Error en la carga'); return null; }
    return d;
  };

  /**
   * Apre la scheda di un foglio e ci porta.
   *
   * Con quaranta fogli in pagina, aprire una scheda che sta tre schermate più
   * giù è indistinguibile dal non fare niente: si preme il pulsante della
   * guida e sembra rotto. La guida deve accompagnare, non indicare.
   */
  const openSheet = (fileId: number) => {
    setOpen(fileId);
    setShowAll(true);
    requestAnimationFrame(() => {
      const el = document.getElementById(`foglio-${fileId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.animate(
        [{ boxShadow: '0 0 0 2px rgba(56,189,248,0.7)' }, { boxShadow: '0 0 0 2px rgba(56,189,248,0)' }],
        { duration: 1400, easing: 'ease-out' },
      );
    });
  };

  const act = async (fileId: number, action: string, payload?: Record<string, unknown>) => {
    setBusy(`${action}-${fileId}`); setError('');
    const heavy = action === 'derive';
    let timer: ReturnType<typeof setInterval> | null = null;
    if (heavy) { setProgress(2); setPhase('Leyendo las filas y guardándolas en el archivo…'); timer = creepingProgress(setProgress); }
    try {
      const res = await fetch('/api/import/files', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, fileId, action, ...payload }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'La operación falló'); return; }
      await load();
      if (heavy) setShowLog(true);
    } catch (e) { setError((e as Error).message); }
    finally { if (timer) clearInterval(timer); setProgress(0); setBusy(''); }
  };

  /** Importa in fila tutti i file che hanno già il testo assegnato. */
  const importAll = async () => {
    // Pronto significa cose diverse per un foglio di contenuti e uno di misure.
    const todo = files.filter((f) => !f.rawPurged && f.status !== 'imported' && isReady(f));
    if (!todo.length) return;
    setBusy('all'); setError('');
    setProgress(2);
    try {
      let done = 0;
      for (const f of todo) {
        setPhase(`Importando ${f.sheetName ?? f.filename} (${done + 1} de ${todo.length})…`);
        const res = await fetch('/api/import/files', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, fileId: f.id, action: 'derive', kind: f.kind }),
        });
        if (!res.ok) { setError(`${f.filename}: ${(await res.json()).error ?? 'la importación falló'}`); break; }
        done++;
        setProgress(Math.round((done / todo.length) * 100));
      }
      await load();
      setShowLog(true);
    } finally { setProgress(0); setBusy(''); }
  };

  const analyzeNow = async () => {
    setBusy('analyze'); setAnalyzeMsg('');
    try {
      const res = await fetch('/api/import/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      const d = await res.json();
      setAnalyzeMsg(res.ok
        ? `${d.analyzed} filas analizadas${d.pending ? ` · ${d.pending} aún en cola` : ''}.`
        : (d.error ?? 'El análisis falló'));
    } catch (e) { setAnalyzeMsg((e as Error).message); }
    finally { setBusy(''); }
  };

  // Un foglio porta nel nome il file da cui viene: "database.xlsx › X". Serve
  // per rimettere insieme i fogli di uno stesso caricamento: chi torna sul
  // progetto dopo un mese deve sapere su quali file poggia, non solo che
  // esiste un foglio chiamato "X".
  const originOf = (f: ImportFile) => f.filename.split(' › ')[0].trim();

  /** Le sorgenti del progetto: un file caricato, con i suoi fogli. */
  const sources = useMemo(() => {
    const map = new Map<string, { name: string; files: ImportFile[] }>();
    for (const f of files) {
      const name = originOf(f);
      if (!map.has(name)) map.set(name, { name, files: [] });
      map.get(name)!.files.push(f);
    }
    return [...map.values()].map((s2) => ({
      ...s2,
      sizeBytes: Math.max(...s2.files.map((f) => f.sizeBytes)),
      uploadedAt: s2.files.map((f) => f.createdAt).sort()[0],
      rawRows: s2.files.reduce((n, f) => n + f.rowCount, 0),
      mentions: s2.files.filter((f) => f.kind === 'mentions').reduce((n, f) => n + f.inArchive, 0),
      points: s2.files.filter((f) => f.kind === 'metrics').reduce((n, f) => n + f.inArchive, 0),
      pending: s2.files.filter((f) => f.status !== 'imported').length,
    }));
  }, [files]);

  /** Toglie un intero file caricato: tutti i suoi fogli e i dati che ne derivano. */
  const removeSource = async (name: string) => {
    const target = files.filter((f) => originOf(f) === name);
    setBusy(`source-${name}`); setError('');
    try {
      for (const f of target) {
        const res = await fetch('/api/import/files', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, fileId: f.id, action: 'delete' }),
        });
        if (!res.ok) { setError((await res.json()).error ?? 'No se pudo eliminar'); break; }
      }
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  const stats = useMemo(() => {
    const imported = files.filter((f) => f.status === 'imported');
    return {
      rawRows: files.reduce((s, f) => s + f.rowCount, 0),
      // Si conta quello che c'è in archivio, non quello che il verbale dice di
      // aver scritto: è il numero su cui l'utente potrà fare i grafici.
      mentions: files.filter((f) => f.kind === 'mentions').reduce((s, f) => s + f.inArchive, 0),
      points: files.filter((f) => f.kind === 'metrics').reduce((s, f) => s + f.inArchive, 0),
      // Righe che il verbale dice importate ma che in archivio non ci sono più.
      drifted: files.filter((f) => f.status === 'imported')
        .reduce((s, f) => s + Math.max(0, (f.report?.inserted ?? 0) - f.inArchive), 0),
      pending: files.filter((f) => f.status !== 'imported').length,
      ready: files.filter((f) => !f.rawPurged && f.status !== 'imported' && isReady(f)).length,
      importedCount: imported.length,
      datesFailed: files.reduce((s, f) => s + (f.report?.datesFailed ?? 0), 0),
      withSentiment: files.reduce((s, f) => s + (f.report?.sentimentImported ?? 0), 0),
      exportable: files.some((f) => f.mapping.content && !f.rawPurged),
    };
  }, [files]);

  /**
   * Che cosa deve fare l'utente ADESSO.
   *
   * L'ordine dei casi è l'ordine in cui vanno risolti: prima si finisce quello
   * che è in corso, poi si sistema ciò che è bloccato, poi si importa ciò che
   * è pronto. Solo quando non resta niente si dice che è finita.
   */
  // A che punto è il lavoro, e a chi tocca. È la prima cosa che si legge.
  const stageList = stages({
    files: files.length,
    incomplete: files.filter((f) => !f.rawPurged && !isReady(f)).length,
    ready: stats.ready,
    imported: stats.importedCount,
    inArchive: stats.mentions + stats.points,
    drifted: files.filter((f) => f.status === 'imported' && (f.report?.inserted ?? 0) > f.inArchive).length,
    readByScientist: scientistRead,
    working: Boolean(busy === 'upload' || pending),
  });
  const here = currentStage(stageList);
  const waiting = files.filter((f) => !f.rawPurged && !isReady(f)).length;

  const next: Next = (() => {
    if (busy) {
      return {
        mood: 'me',
        title: busy === 'upload' ? 'Estoy leyendo el archivo' : 'Estoy trabajando',
        text: phase || 'No necesitas hacer nada: cuando termine te lo digo aquí. Puedes dejar la página abierta.',
      };
    }
    if (pending) {
      return {
        mood: 'you',
        did: `Abrí ${pending.file.name}: contiene ${pending.sheets.length} hojas.`,
        title: 'Elige qué hojas importar',
        text: 'Aquí abajo ves qué hay en cada una: filas, columnas y los primeros encabezados. Ya marqué las visibles que tienen datos: quita o agrega lo que quieras y confirma.',
      };
    }
    if (files.length === 0) {
      return {
        mood: 'you',
        title: 'Carga el primer archivo',
        text: 'Excel o CSV, todos los que quieras. No hace falta prepararlos ni renombrar las columnas: los leo tal como están, entiendo qué contienen y te lo muestro antes de importar nada.',
      };
    }

    const notReady = files.filter((f) => !f.rawPurged && !isReady(f));
    if (notReady.length) {
      const one = notReady[0];
      return {
        mood: 'you',
        did: `Leí ${files.length} hojas y entendí por mi cuenta qué contienen.`,
        title: notReady.length === 1
          ? `Falta algo en “${one.sheetName ?? one.filename}”`
          : `${notReady.length} hojas esperan una decisión tuya`,
        text: one.kind === 'metrics'
          ? 'En una hoja de métricas se necesitan la columna de fecha y al menos una columna de valores: ya te las propuse, solo tienes que confirmar. Pulsa un nombre aquí abajo y te llevo.'
          : 'Necesito saber cuál es la columna del texto. Pulsa un nombre aquí abajo y te llevo: si la hoja tiene números y no contenidos, también puedes decirme que es de métricas.',
        // Qui si risolve, non si viene indirizzati altrove: per ogni foglio
        // che aspetta ci sono le due sole uscite possibili — sistemarlo o
        // toglierlo. Con quaranta fogli, mandare a cercare la scheda giusta
        // era la ragione per cui sembrava che non si andasse avanti.
        pending: notReady.slice(0, 15).map((f) => ({
          id: f.id,
          label: f.sheetName ?? f.filename,
          why: f.kind === 'metrics'
            ? 'falta la fecha o las columnas de valores'
            : 'falta la columna del texto',
          onFix: () => openSheet(f.id),
          onDrop: () => act(f.id, 'delete'),
        })),
        more: notReady.length > 15 ? notReady.length - 15 : 0,
      };
    }

    const ready = files.filter((f) => !f.rawPurged && f.status !== 'imported' && isReady(f));
    if (ready.length) {
      return {
        mood: 'you',
        did: `Entendí las ${files.length} hojas: columnas asignadas y campos por conservar.`,
        title: `Todo listo: ¿importo ${ready.length} ${ready.length === 1 ? 'hoja' : 'hojas'}?`,
        text: 'Antes de pulsar puedes abrir una hoja y usar “Verificar el resultado”: te muestro las primeras filas exactamente como se guardarán, sin escribir nada todavía en el archivo.',
        action: { label: `Importar ${ready.length} ${ready.length === 1 ? 'hoja' : 'hojas'}`, onClick: importAll },
      };
    }

    const imported = files.filter((f) => f.status === 'imported');
    const rows = imported.reduce((s, f) => s + f.inArchive, 0);

    // Il verbale dice una cosa e l'archivio ne dice un'altra: succede quando
    // un foglio è stato importato prima di cambiare le colonne, o quando il
    // progetto è stato ripulito. È l'unico caso in cui i numeri della pagina
    // mentirebbero, quindi è il primo da dire — e ha un rimedio solo.
    const drifted = files.filter((f) => f.status === 'imported'
      && (f.report?.inserted ?? 0) > f.inArchive);
    if (drifted.length) {
      const one = drifted[0];
      return {
        mood: 'you',
        did: `${num(rows)} filas están en el archivo y ya se pueden graficar.`,
        title: drifted.length === 1
          ? `Hay que reimportar “${one.sheetName ?? one.filename}”`
          : `Hay que reimportar ${drifted.length} hojas`,
        text: `Cuando ${drifted.length === 1 ? 'se importó esta hoja' : 'se importaron estas hojas'} las columnas estaban asignadas de otra forma, así que en el archivo hay menos filas de las que contiene el original (${num(stats.drifted)} menos). El archivo original sigue aquí: basta con reimportarlo, no tienes que volver a cargar nada.`,
        action: {
          label: `Reimportar ${one.sheetName ?? one.filename}`,
          onClick: () => act(one.id, 'derive', { kind: one.kind }),
        },
      };
    }

    // Finito l'import, l'utente resta su una pagina che non serve più. La cosa
    // che gli manca non è un'altra spiegazione: è sapere che può andarsene, e
    // dove. La destinazione la decide quello che il file conteneva davvero.
    const hasContent = stats.mentions > 0;
    // "Persone" solo se un foglio è davvero di personal branding: offrire una
    // pagina che si aprirà vuota è peggio che non offrirla.
    const hasPeople = files.some((f) => f.status === 'imported' && f.people);
    // Le persone riconosciute vanno DETTE. Il nome sta nel titolo del foglio e
    // non in una colonna: è una lettura di Radar, e se resta muta l'utente
    // scopre solo per caso che il suo file di personal branding è stato capito
    // — o, peggio, crede che non lo sia stato.
    const persone = [...new Set(files
      .filter((f) => f.status === 'imported' && f.person)
      .map((f) => f.person as string))];

    const go = hasContent
      ? { label: 'Abrir el proyecto', href: '/listening', hint: `${num(stats.mentions)} contenidos para leer, filtrar y analizar` }
      : { label: 'Ir a las métricas', href: '/measures', hint: `${num(stats.points)} puntos de serie histórica, ya graficados` };

    const links = [
      ...(hasContent ? [{ label: 'Tablero', href: '/' }] : []),
      ...(stats.points > 0 ? [{ label: 'Métricas', href: '/measures' }] : []),
      ...(hasPeople ? [{ label: 'Personas', href: '/people' }] : []),
      { label: 'Construir un gráfico', href: '/graph' },
      { label: 'Construir un reporte', href: '/report' },
    ];

    return {
      mood: 'done',
      did: `${num(rows)} filas en el archivo desde ${imported.length} hojas.`
        + (persone.length
          ? ` ${persone.length === 1 ? 'Se reconoció una persona' : `Se reconocieron ${persone.length} personas`} por el nombre de las hojas: ${persone.slice(0, 6).join(', ')}${persone.length > 6 ? ` y ${persone.length - 6} más` : ''}.`
          : ''),
      title: 'El proyecto está listo',
      text: 'Aquí terminaste: desde ahora los datos están en los gráficos, los insights y los reportes, igual que los que recopila AEDO. Si antes quieres asegurarte de que todo salió bien, abre “Lo que leí de tus archivos” aquí abajo y usa “Verificar tres filas de muestra”.',
      go,
      links,
    };
  })();

  return (
    <div className="flex flex-col gap-4">
      {progress > 0 && <TopProgress progress={progress} phase={phase} />}

      <ImportStepper list={stageList} />

      <NextStep n={next} projectId={project.id} role={here.role} />

            <section className={`panel px-5 py-4 ${here.id === 'archivio' ? 'border-sky-500/40 bg-sky-500/[0.04]' : ''}`}>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Archive className="size-3.5 shrink-0" />
          <span className="font-medium text-slate-400">Archivista</span>
          <span className="text-slate-600">— abre los archivos y cataloga las hojas</span>
        </p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-white/[0.02] px-6 py-7 text-center hover:border-sky-500/50">
          {busy === 'upload'
            ? <Loader2 className="size-7 animate-spin text-sky-400" />
            : <UploadCloud className="size-7 text-slate-500" />}
          <span className="text-sm text-slate-300">
            {busy === 'upload' ? 'Leyendo, perfilando y proponiendo…' : 'Agrega un archivo .xlsx o .csv'}
          </span>
          <span className="text-[11px] text-slate-600">
            Puedes cargar todos los que quieras. Los archivos quedan como material en bruto: puedes reasignar y reimportar sin volver a cargarlos.
          </span>
          <input type="file" accept=".xlsx,.csv" className="hidden" disabled={!!busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        </label>
      </section>

      {pending && (
        <SheetChooser
          filename={pending.file.name} sheets={pending.sheets} busy={busy === 'upload'}
          onCancel={() => setPending(null)}
          onConfirm={(names) => upload(pending.file, names)}
        />
      )}

      {sources.length > 0 && (
        // La domanda "su quali file poggia questo progetto?" arriva mesi dopo,
        // da chi non era presente al caricamento. La risposta sta in alto,
        // anche quando il file è uno solo.
        <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 px-1 text-[11px] text-slate-500">
          <span className="text-slate-600">{sources.length === 1 ? 'El proyecto viene de:' : 'El proyecto viene de:'}</span>
          {sources.map((s2, i) => (
            <span key={s2.name} className="text-slate-400">
              <span className="text-slate-300">{s2.name}</span>
              <span className="text-slate-600"> ({s2.files.length === 1 ? '1 hoja' : `${s2.files.length} hojas`})</span>
              {i < sources.length - 1 && <span className="text-slate-700"> ·</span>}
            </span>
          ))}
        </p>
      )}

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}

      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] text-slate-500">
          <LineChart className="size-3.5 shrink-0" />
          <span className="font-medium text-slate-400">Analista de datos Jr</span>
          <span className="min-w-0 flex-1 text-slate-600">
            — hoja por hoja: qué es cada columna. Abre una ficha para corregir lo que propuse.
          </span>
          {files.length > waiting && (
            <button onClick={() => setShowAll(!showAll)}
              className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1 text-slate-400 transition hover:bg-white/5">
              {showAll
                ? `ocultar las ${files.length - waiting} hojas listas`
                : `${files.length - waiting} hojas están listas: mostrarlas`}
            </button>
          )}
        </div>
      )}

      {sources.map((src) => {
        // Solo i fogli che hanno bisogno di qualcosa, salvo richiesta.
        const shown = showAll
          ? src.files
          : src.files.filter((f) => !f.rawPurged && !isReady(f));
        if (!shown.length) return null;
        return (
        <div key={src.name} className="flex flex-col gap-2">
          <SourceHeader
            src={src} busy={busy}
            onRemove={() => removeSource(src.name)}
            multi={sources.length > 1}
          />
          {shown.map((f) => (
            <FileCard
              key={f.id} file={f} busy={busy} projectId={project.id}
              expanded={open === f.id}
              onToggle={() => setOpen(open === f.id ? null : f.id)}
              onAct={act}
            />
          ))}
        </div>
        );
      })}
{files.length > 0 && (
        <ImportAgentPanel
          projectId={project.id}
          highlight={here.id === 'scienza'}
          onApplied={load}
          onRead={() => setScientistRead(true)}
        />
      )}

      {/* Il quadro del progetto: N file che diventano un archivio solo. */}
      {files.length > 0 && (
        <section className={`panel px-5 py-4 ${here.id === 'qualita' ? 'border-sky-500/40 bg-sky-500/[0.04]' : ''}`}>
          <p className="mb-3 flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span className="font-medium text-slate-400">Control de calidad</span>
            <span className="text-slate-600">— lo que hay en el archivo ahora, no lo que el registro dice que se escribió</span>
          </p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat icon={Layers} label="Archivos" value={num(files.length)}
                hint={stats.pending ? `${stats.pending} por importar` : 'todos importados'} />
              <Stat icon={Table2} label="Filas en bruto" value={num(stats.rawRows)} hint="conservadas, reasignables" />
              {stats.mentions > 0 && (
                <Stat icon={Check} label="Contenidos" value={num(stats.mentions)}
                  hint={stats.withSentiment ? `${num(stats.withSentiment)} con sentimiento del archivo` : 'filas con texto, en el archivo ahora'}
                  tone="ok" />
              )}
              {stats.points > 0 && (
                <Stat icon={LineChart} label="Métricas" value={num(stats.points)}
                  hint="puntos de serie histórica" tone="ok" />
              )}
              {stats.datesFailed > 0 && (
                <Stat icon={CalendarRange} label="Fechas ilegibles" value={num(stats.datesFailed)}
                  hint="quedaron con fecha de hoy: revisa la columna de fecha" tone="warn" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {stats.ready > 0 && (
                <button onClick={importAll} disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50">
                  {busy === 'all' ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                  Importar las {stats.ready} listas
                </button>
              )}
              {stats.exportable && (
                <div className="flex items-center overflow-hidden rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-200">
                  <span className="px-2.5 py-1.5 text-emerald-300/70">Normalizado</span>
                  <a href={`/api/import/normalized?project=${project.id}&format=xlsx`}
                    title="Todos los archivos, fusionados y normalizados, en una sola hoja de Excel"
                    className="inline-flex items-center gap-1 border-l border-emerald-500/30 px-2.5 py-1.5 hover:bg-emerald-500/20">
                    <Download className="size-3.5" /> Excel
                  </a>
                  <a href={`/api/import/normalized?project=${project.id}&format=csv`}
                    className="inline-flex items-center gap-1 border-l border-emerald-500/30 px-2.5 py-1.5 hover:bg-emerald-500/20">
                    <Download className="size-3.5" /> CSV
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {files.length > 0 && (
        <ImportLog projectId={project.id} files={files} open={showLog}
          onToggle={() => setShowLog((v) => !v)} />
      )}

      {/* Lavoro dell'ANALISTA, e viene dopo: qui i dati ci sono già, e si
          chiede all'AI di leggerne il contenuto — sentiment, temi, rilevanza.
          Non è la stessa cosa del data scientist, che guarda la FORMA del file
          prima di importarlo: due pulsanti chiamati "AI" nello stesso posto
          erano il modo più veloce per non capire né l'uno né l'altro. */}
      {stats.mentions > 0 && (
        <section className="panel flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
          <Rocket className="size-4 shrink-0 text-emerald-300" />
          <span className="text-sm font-medium text-slate-200">Analista</span>
          <span className="min-w-0 flex-1 text-[11px] text-slate-600">
            Los contenidos están en el archivo. Puedo hacer que la IA los lea: sentimiento, temas y relevancia
            frente al tema del proyecto, como con las menciones que recopila AEDO.
          </span>
          <button onClick={analyzeNow} disabled={!!busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-50">
            {busy === 'analyze' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Analizar los contenidos
          </button>
          {analyzeMsg && <p className="w-full text-xs text-slate-400">{analyzeMsg}</p>}
        </section>
      )}
    </div>
  );
}

/**
 * Il suggerimento su un campo da assegnare.
 *
 * Non è solo "che cos'è": è cosa ci finisce dentro, a cosa serve a valle e
 * cosa succede se lo lasci vuoto. E quando una colonna è già assegnata mostra
 * ANCHE che cosa Radar ha visto in quella colonna — tipo, riempimento e primi
 * valori — perché il modo più veloce per accorgersi di uno scambio è vedere
 * un numero dove ti aspettavi del testo.
 */
function FieldTip({ help, column, profiles }: {
  help: string; column?: string; profiles: Profile[];
}) {
  const [open, setOpen] = useState(false);
  const p = column ? profiles.find((x) => x.name === column) : undefined;

  return (
    <span className="relative inline-flex"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Info className="size-3 cursor-help text-slate-600 hover:text-sky-300" />
      {open && (
        <span className="absolute left-4 top-0 z-50 w-80 rounded-lg border border-[var(--border)] bg-[#0c1226] px-3 py-2.5 text-[11px] leading-relaxed text-slate-300 shadow-2xl">
          {help}
          {p && (
            <span className="mt-2 block border-t border-[var(--border)] pt-2 text-slate-500">
              <span className="text-slate-300">{p.name}</span> — tipo {p.kind}, llena al {p.filled}%,
              {' '}{p.distinct} valores distintos.
              {p.samples.length > 0 && (
                <span className="mt-0.5 block truncate text-slate-600">
                  p. ej.: {p.samples.slice(0, 2).join(' ¦ ')}
                </span>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

type Audit = {
  fileId: number; label: string; kind: 'mentions' | 'metrics'; status: string;
  rowsInSheet: number; produced: number;
  skipped: { reason: string; rows: number }[];
  columnsTotal: number;
  mapped: { column: string; field: string }[];
  kept: { column: string; label: string }[];
  ignored: string[];
  balanced: boolean; notes: string[];
};


type Next = {
  mood: 'you' | 'me' | 'done';
  /** Cosa è appena successo: la conferma che quello che hai fatto è andato. */
  did?: string;
  title: string;
  text: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** L'azione principale quando è un ANDARE, non un fare: chiude l'import. */
  go?: { label: string; href: string; hint?: string };
  /** I fogli che aspettano, con le due sole uscite: sistemare o togliere. */
  pending?: {
    id: number; label: string; why: string;
    onFix: () => void; onDrop: () => void;
  }[];
  more?: number;
  links?: { label: string; href: string }[];
};

/**
 * "Ora fai questo."
 *
 * Non una guida da leggere: UNA cosa da fare, scritta grande, con il tasto
 * accanto. E quando non tocca all'utente lo si dice — "ci penso io" è
 * un'informazione, non un vuoto da riempire con una barra che gira.
 *
 * Il pannello è sempre lo stesso: cambia solo il momento. Così chi torna dopo
 * una settimana non deve ricostruirsi dove era rimasto.
 */
function NextStep({ n, projectId, role }: { n: Next; projectId: number; role: string }) {
  const tone = n.mood === 'you'
    ? { ring: 'border-sky-500/50 bg-sky-500/[0.06]', label: 'AHORA TE TOCA', color: 'text-sky-300', icon: ArrowRight }
    : n.mood === 'me'
      ? { ring: 'border-violet-500/40 bg-violet-500/[0.05]', label: 'YO ME ENCARGO', color: 'text-violet-300', icon: Loader2 }
      : { ring: 'border-emerald-500/40 bg-emerald-500/[0.05]', label: 'TODO LISTO', color: 'text-emerald-300', icon: Check };
  const Icon = tone.icon;

  return (
    <section className={`panel border ${tone.ring} px-6 py-5`}>
      {n.did && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-300">
          <Check className="size-3.5 shrink-0" /> {n.did}
        </p>
      )}
      <p className={`mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold tracking-widest ${tone.color}`}>
        <span className="flex items-center gap-1.5">
          <Icon className={`size-3.5 ${n.mood === 'me' ? 'animate-spin' : ''}`} /> {tone.label}
        </span>
        {/* Chi ha in mano il lavoro adesso: la stessa parola che si legge
            nella catena qui sopra, così i due riferimenti si agganciano. */}
        <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-medium tracking-normal opacity-80">
          {role}
        </span>
      </p>
      <h2 className="text-xl font-semibold text-slate-100 sm:text-2xl">{n.title}</h2>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">{n.text}</p>

      {n.pending && n.pending.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {n.pending.map((f) => (
            <div key={f.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-2">
              <FileSpreadsheet className="size-3.5 shrink-0 text-slate-600" />
              <span className="text-sm text-slate-200">{f.label}</span>
              <span className="min-w-0 flex-1 text-[11px] text-slate-600">{f.why}</span>
              <button onClick={f.onFix}
                className="shrink-0 rounded-lg bg-sky-500/90 px-3 py-1 text-xs font-medium text-slate-950 hover:bg-sky-400">
                Corregir
              </button>
              <button onClick={f.onDrop}
                title="Quita la hoja del proyecto: el archivo se queda, esta hoja no."
                className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-slate-400 hover:border-red-500/40 hover:text-red-300">
                Descartar
              </button>
            </div>
          ))}
          {n.more ? <p className="px-1 text-[11px] text-slate-600">y {n.more} más</p> : null}
        </div>
      )}

      {(n.action || n.go || n.links) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {n.action && (
            <button onClick={n.action.onClick} disabled={n.action.disabled}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-50">
              <ArrowRight className="size-4" /> {n.action.label}
            </button>
          )}
          {n.go && (
            // Uscire dall'import significa entrare NEL progetto: il selettore
            // in alto deve trovarcisi già dentro, altrimenti si atterra sui
            // dati di un altro progetto senza capire perché.
            <a href={n.go.href} title={n.go.hint}
              onClick={() => { document.cookie = `sr_project=${projectId};path=/;max-age=31536000`; }}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
              <Rocket className="size-4" /> {n.go.label}
            </a>
          )}
          {n.links?.map((l) => (
            <a key={l.href} href={l.href}
              onClick={() => { document.cookie = `sr_project=${projectId};path=/;max-age=31536000`; }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm text-slate-300 hover:bg-white/5">
              {l.label} →
            </a>
          ))}
        </div>
      )}

      {n.go?.hint && <p className="mt-2 text-[11px] text-slate-500">{n.go.hint}</p>}
    </section>
  );
}

/**
 * Il log: cosa è stato letto, detto a parole.
 *
 * "Ho preso tutti i dati?" non si risponde con una rassicurazione né con una
 * tabella di conteggi. Si risponde raccontando, foglio per foglio: quante
 * righe sono entrate, cosa è stato scartato e perché, quali colonne sono
 * finite dove, e quali non sono state usate. Finché i conti tornano, niente è
 * sparito in silenzio; quando non tornano, lo si dice.
 */
function ImportLog({ projectId, files, open, onToggle }: {
  projectId: number; files: ImportFile[]; open: boolean; onToggle: () => void;
}) {
  const [audit, setAudit] = useState<Audit[] | null>(null);
  const [loading, setLoading] = useState(false);

  const signature = files.map((f) => `${f.id}:${f.status}:${f.report?.inserted ?? 0}`).join('|');
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/import/audit?project=${projectId}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setAudit(d.audit ?? []); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signature, projectId]);

  const done = audit?.filter((a) => a.status === 'imported') ?? [];
  const unexplained = done.filter((a) => !a.balanced).length;
  const ignoredCols = audit?.reduce((s, a) => s + a.ignored.length, 0) ?? 0;
  const totalRows = done.reduce((s, a) => s + a.produced, 0);

  return (
    <section className="panel px-5 py-4">
      <button onClick={onToggle} className="flex w-full flex-wrap items-center gap-2 text-left">
        {open ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />}
        <ClipboardCheck className="size-4 text-emerald-400" />
        <span className="text-sm font-medium text-slate-200">Lo que leí de tus archivos</span>
        {audit && (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${unexplained
            ? 'bg-red-500/15 text-red-300'
            : ignoredCols ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
            {unexplained ? `${unexplained} hojas no cuadran`
              : ignoredCols ? `${ignoredCols} columnas sin usar` : 'todo explicado'}
          </span>
        )}
      </button>

      {/* Il verdetto si legge senza aprire niente: è la prima cosa che uno
          vuole sapere dopo aver caricato un file. */}
      {audit && done.length > 0 && (
        <p className="mt-1.5 text-xs text-slate-400">
          {unexplained > 0
            ? <><AlertTriangle className="mr-1 inline size-3 text-red-400" />
              <span className="text-red-300">Algo no cuadra</span> en {unexplained}
              {' '}{unexplained === 1 ? 'hoja' : 'hojas'}: abre aquí abajo y te lo explico fila por fila.</>
            : ignoredCols > 0
              ? <><Check className="mr-1 inline size-3 text-emerald-400" />
                Todas las filas están bien, pero no estoy usando <span className="text-amber-300">{ignoredCols} columnas</span> de
                la hoja. Si las necesitas, ábrelas aquí abajo y consérvalas.</>
              : <><Check className="mr-1 inline size-3 text-emerald-400" />
                <span className="text-emerald-300">Todo cuadra.</span> Cada fila de tus archivos o
                entró, o sé decirte por qué no; y puedes verificarlo tú con filas de muestra.</>}
        </p>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-2.5 border-t border-[var(--border)] pt-3">
          {loading && <p className="text-xs text-slate-500"><Loader2 className="mr-1 inline size-3 animate-spin" /> Contando…</p>}

          {audit && done.length > 0 && (
            <p className="text-xs text-slate-400">
              En total guardé en el archivo <span className="text-emerald-300">{num(totalRows)}</span> filas
              de <span className="text-slate-200">{done.length}</span> hojas.
              {unexplained === 0 && ' Cada fila del archivo o entró, o sé decirte por qué no.'}
            </p>
          )}

          {audit?.map((a) => <LogEntry key={a.fileId} a={a} projectId={projectId} />)}
          {audit && audit.length === 0 && <p className="text-xs text-slate-600">Aún no hay archivos.</p>}
        </div>
      )}
    </section>
  );
}

/** Una riga di log: la storia di un foglio, in italiano. */
function LogEntry({ a, projectId }: { a: Audit; projectId: number }) {
  if (a.status !== 'imported') {
    return (
      <p className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-slate-500">
        <span className="font-medium text-slate-300">{a.label}</span> — aún no importado.
      </p>
    );
  }
  const skippedText = a.skipped.length
    ? a.skipped.map((s) => `${num(s.rows)} ${s.reason}`).join(' y ')
    : null;

  // Su un foglio di misure i campi si chiamano tutti "valore": elencarli uno
  // per uno dà "valore, valore, valore…" dieci volte. Si raccontano invece
  // per quello che sono — una data, un'entità, N colonne di numeri.
  const fields = a.kind === 'metrics'
    ? (() => {
      const by = new Map<string, string[]>();
      for (const m of a.mapped) {
        if (!by.has(m.field)) by.set(m.field, []);
        by.get(m.field)!.push(m.column);
      }
      return [...by.entries()].map(([field, cols]) => (cols.length === 1
        ? `${field} (${cols[0]})`
        : `${cols.length} columnas de ${field}`));
    })()
    : [...new Set(a.mapped.map((m) => FIELD_LABEL[m.field] ?? m.field))];

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${a.balanced ? 'border-[var(--border)]' : 'border-red-500/30 bg-red-500/[0.04]'}`}>
      <p className="text-xs text-slate-300">
        {a.balanced
          ? <Check className="mr-1 inline size-3 text-emerald-400" />
          : <AlertTriangle className="mr-1 inline size-3 text-red-400" />}
        <span className="font-medium">{a.label}</span>
        <span className="text-slate-500">
          {' '}— leí {num(a.rowsInSheet)} filas y creé{' '}
          <span className="text-emerald-300">{num(a.produced)}</span>
          {' '}{a.kind === 'metrics' ? 'métricas' : 'contenidos'}
          {skippedText ? `. Dejé por fuera ${skippedText}` : ''}.
        </span>
      </p>

      <p className="mt-1 text-[11px] text-slate-600">
        {fields.length > 0 && <>Reconocí: <span className="text-sky-300">{fields.join(', ')}</span>. </>}
        {a.kept.length > 0 && <>Guardé aparte: <span className="text-violet-300">{[...new Set(a.kept.map((k) => k.label))].join(', ')}</span>. </>}
        {a.ignored.length > 0 && (
          <>No usé <span className="text-amber-300">{a.ignored.length} columnas</span>
            {' '}({a.ignored.slice(0, 6).join(', ')}{a.ignored.length > 6 ? '…' : ''}):
            {' '}si las necesitas, ábrelas aquí arriba y agrégalas a los campos conservados.</>
        )}
      </p>

      {a.notes.map((n) => <p key={n} className="mt-0.5 text-[11px] text-amber-300/80">{n}</p>)}

      {/* La prova, non il riassunto: tre righe del foglio contro l'archivio. */}
      <SpotCheck fileId={a.fileId} projectId={projectId} />
    </div>
  );
}

/**
 * La scelta dei fogli.
 *
 * Un database vero ne ha venticinque o cinquanta, con forme diverse e metà
 * nascosti. Importarli tutti d'ufficio riempirebbe il progetto di tabelle di
 * servizio; importarne uno a caso perderebbe il grosso. Quindi si mostra cosa
 * c'è dentro — righe, colonne, prime intestazioni — e si sceglie guardando.
 */
function SheetChooser({ filename, sheets, busy, onCancel, onConfirm }: {
  filename: string; sheets: SheetInfo[]; busy: boolean;
  onCancel: () => void; onConfirm: (names: string[]) => void;
}) {
  const withData = useMemo(() => sheets.filter((s) => s.rows > 0), [sheets]);
  // Preselezione onesta: i fogli visibili con dei dati. I nascosti sono spesso
  // appunti di lavoro, ma restano a un clic di distanza.
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(withData.filter((s) => !s.hidden).map((s) => s.name)),
  );
  const [showEmpty, setShowEmpty] = useState(false);
  const visible = showEmpty ? sheets : withData;
  const toggle = (n: string) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });

  return (
    <section className="panel border-sky-500/30 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Layers className="size-4 text-sky-400" />
        <p className="text-sm font-medium text-slate-200">
          {filename} contiene {sheets.length} hojas
        </p>
        <p className="text-xs text-slate-500">
          {withData.length} con datos · elige cuáles importar
        </p>
        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <button onClick={() => setPicked(new Set(withData.map((s) => s.name)))}
            className="text-sky-300 hover:underline">todas</button>
          <span className="text-slate-700">·</span>
          <button onClick={() => setPicked(new Set(withData.filter((s) => !s.hidden).map((s) => s.name)))}
            className="text-sky-300 hover:underline">solo visibles</button>
          <span className="text-slate-700">·</span>
          <button onClick={() => setPicked(new Set())} className="text-slate-500 hover:underline">ninguna</button>
        </div>
      </div>

      <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--panel-2)]">
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600">
              <th className="w-8 px-3 py-2"></th>
              <th className="px-2 py-2">Hoja</th>
              <th className="px-2 py-2 text-right">Filas</th>
              <th className="px-2 py-2 text-right">Columnas</th>
              <th className="px-2 py-2">Primeros encabezados</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const on = picked.has(s.name);
              const empty = s.rows === 0;
              return (
                <tr key={s.name}
                  onClick={() => !empty && toggle(s.name)}
                  className={`border-t border-[var(--border)]/40 ${empty ? 'opacity-40' : 'cursor-pointer hover:bg-white/[0.03]'} ${on ? 'bg-sky-500/[0.06]' : ''}`}>
                  <td className="px-3 py-1.5">
                    <input type="checkbox" checked={on} disabled={empty} readOnly className="size-3.5 accent-sky-500" />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="font-medium text-slate-200">{s.name}</span>
                    {s.hidden && <span className="ml-1.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-500">oculta</span>}
                    {s.twoRowHeader && <span className="ml-1.5 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">encabezado doble</span>}
                    {s.headerRow > 1 && <span className="ml-1.5 text-[10px] text-slate-600">encabezado en la fila {s.headerRow}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{empty ? '—' : num(s.rows)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{s.columns}</td>
                  <td className="max-w-[24rem] truncate px-2 py-1.5 text-slate-600">{s.headers.slice(0, 6).join(' · ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => onConfirm([...picked])} disabled={busy || picked.size === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-3.5 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-40">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
          Importar {picked.size} {picked.size === 1 ? 'hoja' : 'hojas'}
        </button>
        <button onClick={onCancel} disabled={busy}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5 disabled:opacity-40">
          Cancelar
        </button>
        {sheets.length > withData.length && (
          <button onClick={() => setShowEmpty((v) => !v)} className="text-[11px] text-slate-500 hover:text-slate-300">
            {showEmpty ? 'ocultar' : 'mostrar'} las {sheets.length - withData.length} hojas vacías
          </button>
        )}
        {busy && <span className="text-[11px] text-slate-500">Leyendo y perfilando cada hoja: puede tardar unos minutos.</span>}
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value, hint, tone }: {
  icon: typeof Layers; label: string; value: string; hint?: string; tone?: 'ok' | 'warn';
}) {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-200';
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
        <Icon className="size-3" /> {label}
      </p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
    </div>
  );
}

/** I quattro passi, sempre visibili: si sa dove si è e cosa manca. */
function Steps({ step, hasContent }: { step: number; hasContent: boolean }) {
  const items = ['Cargado', hasContent ? 'Asignado' : 'Por asignar', 'Verificado', 'Importado'];
  const done = step >= 3 ? 4 : hasContent ? 2 : 1;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      {items.map((label, i) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`rounded-full px-1.5 py-0.5 ${i < done
            ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.04] text-slate-600'}`}>{label}</span>
          {i < items.length - 1 && <span className="text-slate-700">›</span>}
        </span>
      ))}
    </div>
  );
}

type Source = {
  name: string; files: ImportFile[]; sizeBytes: number; uploadedAt: string;
  rawRows: number; mentions: number; points: number; pending: number;
};

/**
 * L'intestazione di una sorgente: quale file, caricato quando, cosa ne è nato.
 *
 * Serve a una domanda che arriva dopo, non durante: "su che cosa poggia questo
 * progetto?". Chi ci torna fra un mese, o chi eredita il lavoro, non deve
 * dedurlo dai nomi dei fogli — che dicono "X", "LK", "FOLLOWER" e non dicono
 * da quale cartella di lavoro vengano.
 *
 * Toglierla porta via anche i dati che ne derivano, e lo dice prima con i
 * numeri esatti: un progetto svuotato per sbaglio non si ricostruisce.
 */
function SourceHeader({ src, busy, onRemove, multi }: {
  src: Source; busy: string; onRemove: () => void; multi: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const kb = src.sizeBytes >= 1_048_576
    ? `${(src.sizeBytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(src.sizeBytes / 1024))} KB`;
  const quando = new Date(src.uploadedAt).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const busyHere = busy === `source-${src.name}`;

  const cosa = [
    src.mentions ? `${num(src.mentions)} contenidos` : null,
    src.points ? `${num(src.points)} métricas` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="mt-2 rounded-xl border border-[var(--border)] bg-white/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Archive className="size-4 shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200" title={src.name}>
          {src.name}
        </span>
        <span className="shrink-0 text-[11px] text-slate-500">
          {src.files.length === 1 ? '1 hoja' : `${src.files.length} hojas`} · {num(src.rawRows)} filas · {kb}
        </span>
        <button onClick={() => setAsking(true)} disabled={!!busy}
          title="Quita este archivo del proyecto, junto con los datos que salen de él"
          className="shrink-0 rounded-lg p-1.5 text-slate-600 transition hover:text-red-400 disabled:opacity-50">
          {busyHere ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-600">
        Cargado el {quando}
        {cosa && <> · en el proyecto hay {cosa} que vienen de aquí</>}
        {src.pending > 0 && <> · {src.pending === 1 ? 'una hoja aún no se importa' : `${src.pending} hojas aún no se importan`}</>}
      </p>

      {asking && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.05] px-3.5 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-red-300">
            <AlertTriangle className="size-4 shrink-0" /> ¿Quitar “{src.name}”?
          </p>
          <p className="mb-2.5 text-xs leading-relaxed text-slate-400">
            Se eliminan {src.files.length === 1 ? 'la hoja' : `sus ${src.files.length} hojas`}, el material en bruto
            {cosa ? <> y {cosa} del archivo</> : null}
            {multi ? '; los demás archivos se quedan donde están.' : '.'} Para recuperarlos hay que volver a cargar el archivo.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => { setAsking(false); onRemove(); }} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3.5 py-1.5 text-xs font-medium text-slate-950 hover:bg-red-400 disabled:opacity-50">
              <Trash2 className="size-3.5" /> Quitar todo
            </button>
            <button onClick={() => setAsking(false)}
              className="rounded-lg border border-[var(--border)] px-3.5 py-1.5 text-xs text-slate-300 hover:bg-white/5">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FileCard({ file, busy, projectId, expanded, onToggle, onAct }: {
  file: ImportFile; busy: string; projectId: number; expanded: boolean;
  onToggle: () => void;
  onAct: (fileId: number, action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [map, setMap] = useState<Record<string, string>>(file.mapping);
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; report: Report } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  // Se il file cambia sotto (ricaricato dopo un'azione) la bozza locale si allinea.
  useEffect(() => { setMap(file.mapping); }, [file.mapping]);

  const dirty = JSON.stringify(map) !== JSON.stringify(file.mapping);
  const st = STATUS[file.status];
  const busyHere = busy.endsWith(`-${file.id}`);

  /** L'anteprima usa la bozza corrente, non quella salvata: si prova prima di decidere. */
  const runPreview = async () => {
    setPreviewing(true); setPreviewErr('');
    try {
      const res = await fetch('/api/import/normalized', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, fileId: file.id, mapping: map }),
      });
      const d = await res.json();
      if (!res.ok) { setPreviewErr(d.error ?? 'No se pudo generar la vista previa'); setPreview(null); return; }
      setPreview({ rows: d.rows, report: d.report });
    } catch (e) { setPreviewErr((e as Error).message); }
    finally { setPreviewing(false); }
  };

  return (
    <section id={`foglio-${file.id}`} className="panel scroll-mt-24 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onToggle} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left">
          {expanded ? <ChevronDown className="size-4 shrink-0 text-slate-500" /> : <ChevronRight className="size-4 shrink-0 text-slate-500" />}
          <FileSpreadsheet className="size-4 shrink-0 text-slate-500" />
          <span className="min-w-[7rem] flex-1 truncate text-sm font-medium text-slate-200">{file.sheetName ?? file.filename}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${file.kind === 'metrics' ? 'bg-violet-500/15 text-violet-300' : 'bg-sky-500/15 text-sky-300'}`}>{file.kind === 'metrics' ? 'métricas' : 'contenidos'}</span>
          {file.person && (
            <span title={`La hoja se llama como una persona: cada fila se le atribuye. Sin esto, ${file.person} no aparecería en ninguna parte.`}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
              <User className="size-3" />{file.person}
            </span>
          )}
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
          <span className="shrink-0 text-[11px] text-slate-600">
            {num(file.rowCount)} filas · {file.columns.length} columnas
            {file.rawPurged && ' · bruto eliminado'}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {file.status === 'imported' && !file.rawPurged && (
            <a href={`/api/import/normalized?project=${projectId}&file=${file.id}&format=xlsx`}
              title="Descarga solo este archivo, normalizado"
              className="rounded-lg p-1.5 text-slate-600 hover:text-emerald-300">
              <Download className="size-4" />
            </a>
          )}
          {!file.rawPurged && (
            <button onClick={() => onAct(file.id, 'derive', { kind: file.kind })} disabled={!!busy || !isReady(file)}
              title={!isReady(file)
                ? (file.kind === 'metrics' ? 'Primero elige la fecha y al menos una columna de valores' : 'Primero asigna la columna del texto')
                : file.status === 'imported' ? 'Regenerar los datos de esta hoja' : 'Generar los datos'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50">
              {busyHere && busy.startsWith('derive') ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
              {file.status === 'imported' ? 'Reimportar' : 'Importar'}
            </button>
          )}
          <button onClick={() => setConfirmDel(true)} disabled={!!busy}
            title="Quita esta hoja y los datos que salen de ella"
            className="rounded-lg p-1.5 text-slate-600 hover:text-red-400 disabled:opacity-50">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {confirmDel && (
        // Il cestino toglie righe vere dall'archivio, non una scheda dalla
        // pagina: va detto quante, prima.
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.05] px-3.5 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-red-300">
            <AlertTriangle className="size-4 shrink-0" /> ¿Quitar la hoja “{file.sheetName ?? file.filename}”?
          </p>
          <p className="mb-2.5 text-xs leading-relaxed text-slate-400">
            {file.inArchive > 0
              ? <>Se eliminan del archivo {num(file.inArchive)} {file.kind === 'metrics' ? 'métricas' : 'contenidos'} que vienen de esta hoja, junto con sus filas en bruto.</>
              : <>Esta hoja aún no tiene datos en el archivo: solo se elimina el material en bruto.</>}
            {' '}Para recuperarla hay que volver a cargar el archivo.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => { setConfirmDel(false); onAct(file.id, 'delete'); }} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3.5 py-1.5 text-xs font-medium text-slate-950 hover:bg-red-400 disabled:opacity-50">
              <Trash2 className="size-3.5" /> Quitar la hoja
            </button>
            <button onClick={() => setConfirmDel(false)}
              className="rounded-lg border border-[var(--border)] px-3.5 py-1.5 text-xs text-slate-300 hover:bg-white/5">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="mt-2"><Steps step={st.step} hasContent={isReady(file)} /></div>

      {file.report && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
          <li className="text-emerald-300">{num(file.report.inserted)} importadas</li>
          {file.report.skippedEmpty > 0 && <li className="text-slate-500">{file.report.skippedEmpty} sin texto</li>}
          {file.report.duplicates > 0 && <li className="text-slate-500">{file.report.duplicates} duplicadas</li>}
          {file.report.datesFailed > 0 && (
            <li className="text-amber-300">
              <AlertTriangle className="mr-1 inline size-3" />
              {file.report.datesFailed} fechas ilegibles: esas filas quedaron con la fecha de hoy
            </li>
          )}
          {file.report.sentimentImported > 0 && (
            <li className="text-emerald-300">{file.report.sentimentImported} con sentimiento del archivo (sin costo de IA)</li>
          )}
        </ul>
      )}

      {/* Le formule: cosa è stato letto e cosa non c'era da leggere. */}
      {file.issues && file.issues.formulas > 0 && (
        <p className={`mt-2 flex items-start gap-1.5 text-xs ${file.issues.formulaNoValue > 0 || file.issues.formulaErrors > 0
          ? 'text-amber-300' : 'text-slate-500'}`}>
          {file.issues.formulaNoValue > 0 || file.issues.formulaErrors > 0
            ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            : <Check className="mt-0.5 size-3.5 shrink-0" />}
          <span>
            {file.issues.formulas} celdas calculadas con fórmulas: AEDO tomó el resultado, no la fórmula.
            {file.issues.formulaErrors > 0 && ` ${file.issues.formulaErrors} daban error (#DIV/0!, #N/A…) y se dejaron vacías.`}
            {file.issues.formulaNoValue > 0 && ` ${file.issues.formulaNoValue} no tenían el valor guardado en el archivo: ábrelo en Excel y vuelve a guardarlo para recuperarlas.`}
          </span>
        </p>
      )}

      {expanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-[var(--border)] pt-4">
          <KindSwitch file={file} busy={busy} onAct={onAct} />

          {file.kind === 'metrics' ? (
            <MetricEditor file={file} busy={busy} onAct={onAct} />
          ) : (
          <>
          {file.proposal && file.proposal.length > 0 && <ProposalPanel proposal={file.proposal} usedAi={file.usedAi} />}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Asignación de campos</p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-xs text-slate-300">
                    {f.label}{f.required && <span className="text-sky-400"> *</span>}
                    <FieldTip help={f.help} column={map[f.key]} profiles={file.profiles} />
                    <span className="text-slate-600">· {f.hint}</span>
                  </span>
                  <select value={map[f.key] ?? ''}
                    onChange={(e) => { setMap((m) => ({ ...m, [f.key]: e.target.value })); setPreview(null); }}
                    className={`rounded-lg border bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none ${
                      f.required && !map[f.key] ? 'border-sky-500/50' : 'border-[var(--border)]'
                    }`}>
                    <option value="">— ninguna —</option>
                    {file.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={runPreview} disabled={previewing || !map.content || file.rawPurged}
                title={!map.content ? 'Se necesita al menos la columna del texto' : 'Mira cómo quedan las filas, sin escribir nada'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-500/20 disabled:opacity-40">
                {previewing ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                Verificar el resultado
              </button>
              <button onClick={() => onAct(file.id, 'map', { mapping: map })} disabled={!!busy || !dirty}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40">
                {busyHere && busy.startsWith('map') ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Guardar asignación
              </button>
              {dirty && (
                <span className="text-[11px] text-amber-300">
                  Cambios sin guardar: después de guardar usa &ldquo;Reimportar&rdquo; para regenerar las menciones.
                </span>
              )}
              {!file.rawPurged && file.status === 'imported' && (
                <button onClick={() => onAct(file.id, 'purge')} disabled={!!busy}
                  title="Elimina las filas en bruto para liberar espacio: las menciones se quedan, pero el archivo ya no se podrá reasignar"
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50">
                  <Archive className="size-3.5" /> Liberar espacio en bruto
                </button>
              )}
            </div>
            {previewErr && <p className="mt-2 text-xs text-amber-300">{previewErr}</p>}
          </div>

          <ExtrasEditor file={file} busy={busy} onAct={onAct} />

          {preview && <PreviewTable preview={preview} />}
          </>
          )}

          <ColumnTable profiles={file.profiles} mapping={map} />
        </div>
      )}
    </section>
  );
}

/**
 * Post o misure. Il riconoscimento automatico ci prende quasi sempre, ma un
 * foglio di storie senza didascalia somiglia a una tabella di numeri pur
 * essendo fatto di contenuti: l'ultima parola resta a chi guarda.
 */
function KindSwitch({ file, busy, onAct }: {
  file: ImportFile; busy: string;
  onAct: (fileId: number, action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const opts: { k: 'mentions' | 'metrics'; label: string; hint: string }[] = [
    { k: 'mentions', label: 'Contenidos', hint: 'filas con texto: posts, artículos, comentarios' },
    { k: 'metrics', label: 'Métricas', hint: 'series de números en el tiempo: seguidores, impresiones, promedios' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Esta hoja es de</span>
      {opts.map((o) => (
        <button key={o.k} title={o.hint} disabled={!!busy}
          onClick={() => file.kind !== o.k && onAct(file.id, 'kind', { kind: o.k })}
          className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50 ${file.kind === o.k
            ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
            : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>
          {o.label}
        </button>
      ))}
      <span className="text-[11px] text-slate-600">
        {opts.find((o) => o.k === file.kind)?.hint}
        {file.status === 'imported' && ' · si cambias el tipo, lo que ya se importó de esta hoja se rehace'}
      </span>
    </div>
  );
}

/** La mappatura di un foglio di misure: data, chi, che cosa, e come tagliarlo. */
function MetricEditor({ file, busy, onAct }: {
  file: ImportFile; busy: string;
  onAct: (fileId: number, action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [m, setM] = useState<MetricMap>(file.metricMap ?? {});
  useEffect(() => { setM(file.metricMap ?? {}); }, [file.metricMap]);
  const dirty = JSON.stringify(m) !== JSON.stringify(file.metricMap ?? {});

  const numeric = file.profiles.filter((p) => p.kind === 'number').map((p) => p.name);
  const textual = file.profiles.filter((p) => p.kind === 'text').map((p) => p.name);
  const toggleIn = (key: 'metrics' | 'dims', col: string) => setM((prev) => {
    const cur = new Set(prev[key] ?? []);
    if (cur.has(col)) cur.delete(col); else cur.add(col);
    return { ...prev, [key]: [...cur] };
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Cómo leer esta hoja</p>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-300">Fecha <span className="text-sky-400">*</span><span className="text-slate-600"> · cuándo</span></span>
          <select value={m.date ?? ''} onChange={(e) => setM({ ...m, date: e.target.value })}
            className={`rounded-lg border bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 ${m.date ? 'border-[var(--border)]' : 'border-sky-500/50'}`}>
            <option value="">— ninguna —</option>
            {file.columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-300">Entidad<span className="text-slate-600"> · quién</span></span>
          <select value={m.entity ?? ''} onChange={(e) => setM({ ...m, entity: e.target.value })}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100">
            <option value="">— la hoja misma —</option>
            {textual.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {!m.entity && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-300">Nombre de la entidad<span className="text-slate-600"> · cómo llamarla</span></span>
            <input value={m.entityLabel ?? ''} onChange={(e) => setM({ ...m, entityLabel: e.target.value })}
              placeholder={file.sheetName ?? file.filename}
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100" />
          </label>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-300">
          Columnas de valores <span className="text-sky-400">*</span>
          <span className="text-slate-600"> · cada una se vuelve una serie ({(m.metrics ?? []).length} elegidas)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {numeric.map((c) => {
            const on = (m.metrics ?? []).includes(c);
            return (
              <button key={c} onClick={() => toggleIn('metrics', c)}
                className={`rounded-lg border px-2 py-1 text-[11px] ${on
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                  : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>{c}</button>
            );
          })}
          {!numeric.length && <span className="text-[11px] text-slate-600">No hay columnas numéricas en esta hoja.</span>}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-300">
          Dimensiones<span className="text-slate-600"> · cómo segmentar los números: canal, pilar, empresa ({(m.dims ?? []).length} elegidas)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {textual.filter((c) => c !== m.entity).map((c) => {
            const on = (m.dims ?? []).includes(c);
            return (
              <button key={c} onClick={() => toggleIn('dims', c)}
                className={`rounded-lg border px-2 py-1 text-[11px] ${on
                  ? 'border-violet-500/50 bg-violet-500/10 text-violet-200'
                  : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>{c}</button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onAct(file.id, 'map-metrics', { metricMap: m })} disabled={!!busy || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40">
          <Check className="size-3.5" /> Guardar la lectura
        </button>
        {dirty && <span className="text-[11px] text-amber-300">Cambios sin guardar: luego usa &ldquo;Reimportar&rdquo;.</span>}
      </div>
    </div>
  );
}

/**
 * I campi conservati: le colonne che non sono un campo di Radar e che sarebbero
 * andate perse. L'etichetta è modificabile perché "CAT. TRASVERSALE" dice
 * qualcosa solo a chi ha costruito quel file.
 */
function ExtrasEditor({ file, busy, onAct }: {
  file: ImportFile; busy: string;
  onAct: (fileId: number, action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [ex, setEx] = useState<Record<string, string>>(file.extras ?? {});
  useEffect(() => { setEx(file.extras ?? {}); }, [file.extras]);
  const dirty = JSON.stringify(ex) !== JSON.stringify(file.extras ?? {});
  const mapped = new Set(Object.values(file.mapping));
  const available = file.columns.filter((c) => !mapped.has(c) && !(c in ex));

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        Campos conservados <span className="normal-case tracking-normal text-slate-600">— columnas que no son un campo de AEDO, pero que se conservan</span>
      </p>
      {Object.keys(ex).length === 0 && (
        <p className="mb-2 text-xs text-slate-600">Ninguno: todas las columnas útiles ya están asignadas a un campo.</p>
      )}
      <div className="flex flex-col gap-1.5">
        {Object.entries(ex).map(([col, label]) => (
          <div key={col} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[9rem] truncate text-xs text-slate-500">{col}</span>
            <ArrowRight className="size-3 shrink-0 text-slate-700" />
            <input value={label} onChange={(e) => setEx({ ...ex, [col]: e.target.value })}
              className="min-w-[10rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1 text-xs text-slate-100" />
            <button onClick={() => { const n = { ...ex }; delete n[col]; setEx(n); }}
              title="No conservar esta columna"
              className="text-slate-600 hover:text-red-300"><Trash2 className="size-3.5" /></button>
          </div>
        ))}
      </div>
      {available.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-600">agregar:</span>
          {available.slice(0, 14).map((c) => (
            <button key={c} onClick={() => setEx({ ...ex, [c]: c })}
              className="rounded-lg border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] text-slate-500 hover:text-slate-300">
              + {c}
            </button>
          ))}
        </div>
      )}
      {dirty && (
        <button onClick={() => onAct(file.id, 'extras', { extras: ex })} disabled={!!busy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40">
          <Check className="size-3.5" /> Guardar los campos conservados
        </button>
      )}
    </div>
  );
}

/** Come diventano davvero le righe: stessa funzione dell'import, zero scritture. */
function PreviewTable({ preview }: { preview: { rows: PreviewRow[]; report: Report } }) {
  const { rows, report } = preview;
  const fellBack = rows.filter((r) => r.dateFellBack).length;
  return (
    <div className="rounded-lg border border-sky-500/25 bg-sky-500/[0.04] px-3 py-2.5">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-sky-300">
        <Eye className="size-3.5" /> Cómo quedarán las filas
      </p>
      <p className="mb-2 text-xs text-slate-500">
        {`Primeras ${rows.length} filas válidas, generadas por la misma función que escribe la importación: lo que ves es lo que se guardará.`}
        {report.skippedEmpty > 0 && <span className="text-slate-400"> · {report.skippedEmpty} filas descartadas por no tener texto</span>}
        {fellBack > 0 && <span className="text-amber-300"> · {fellBack} con fecha ilegible, quedaron con la de hoy</span>}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600">
              <th className="pb-1 pr-3">Fecha</th>
              <th className="pb-1 pr-3">Fuente</th>
              <th className="pb-1 pr-3">Autor</th>
              <th className="pb-1 pr-3">Texto</th>
              <th className="pb-1 pr-3">Sent.</th>
              <th className="pb-1 pr-3 text-right">Alcance</th>
              <th className="pb-1 text-right">Engag.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[var(--border)]/40 align-top">
                <td className={`py-1 pr-3 whitespace-nowrap tabular-nums ${r.dateFellBack ? 'text-amber-400' : 'text-slate-400'}`}>
                  {new Date(r.publishedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  {r.dateFellBack && <AlertTriangle className="ml-1 inline size-3" />}
                </td>
                <td className="py-1 pr-3 text-slate-400">{r.source}</td>
                <td className="py-1 pr-3 text-slate-400">{r.author ?? <span className="text-slate-700">—</span>}</td>
                <td className="max-w-[24rem] truncate py-1 pr-3 text-slate-300">{r.content}</td>
                <td className="py-1 pr-3 text-slate-400">{r.sentiment ?? <span className="text-slate-700">—</span>}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-400">{r.reach == null ? '—' : num(r.reach)}</td>
                <td className="py-1 text-right tabular-nums text-slate-400">{Math.round(r.engagementScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProposalPanel({ proposal, usedAi }: { proposal: Proposal[]; usedAi: boolean }) {
  const sure = proposal.filter((p) => p.field && p.confidence === 'alta');
  const unsure = proposal.filter((p) => p.field && p.confidence !== 'alta');
  const ignored = proposal.filter((p) => !p.field);
  const Row = ({ p }: { p: Proposal }) => (
    <li className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="font-medium text-slate-300">{p.column}</span>
      {p.field && <><span className="text-slate-600">→</span><span className="text-sky-300">{FIELD_LABEL[p.field] ?? p.field}</span></>}
      <span className="text-slate-600">{p.reason}</span>
    </li>
  );
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        <Wand2 className="size-3.5 text-violet-400" /> Lo que entendió AEDO
      </p>
      <p className="mb-2 text-xs text-slate-600">
        Leído a partir de los <span className="text-slate-400">valores</span> de las columnas, no de sus nombres: funciona en cualquier idioma. Todo se puede modificar aquí abajo.
        {!usedAi && (
          <span className="text-amber-400"> · Reconocimiento automático sin IA (falta la clave, se alcanzó el tope de gasto o el modelo no responde): revisa las asignaciones.</span>
        )}
      </p>
      <div className="flex flex-col gap-2">
        {sure.length > 0 && (
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-300"><Check className="size-3" /> Reconocidas ({sure.length})</p>
            <ul className="flex flex-col gap-0.5">{sure.map((p) => <Row key={p.column} p={p} />)}</ul>
          </div>
        )}
        {unsure.length > 0 && (
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-300"><AlertTriangle className="size-3" /> Por revisar ({unsure.length})</p>
            <ul className="flex flex-col gap-0.5">{unsure.map((p) => <Row key={p.column} p={p} />)}</ul>
          </div>
        )}
        {ignored.length > 0 && (
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-500"><EyeOff className="size-3" /> No importadas ({ignored.length})</p>
            <p className="text-xs text-slate-600">{ignored.map((p) => p.column).join(' · ')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Le colonne come sono davvero nel file: tipo osservato, riempimento, esempi. */
function ColumnTable({ profiles, mapping }: { profiles: Profile[]; mapping: Record<string, string> }) {
  const assignedTo = (col: string) => Object.entries(mapping).find(([, v]) => v === col)?.[0];
  return (
    <details className="rounded-lg border border-[var(--border)] px-3 py-2">
      <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-widest text-slate-500 [&::-webkit-details-marker]:hidden">
        <RefreshCw className="mr-1 inline size-3" /> Columnas del archivo ({profiles.length})
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600">
              <th className="pb-1 pr-3">Columna</th>
              <th className="pb-1 pr-3">Tipo</th>
              <th className="pb-1 pr-3 text-right">Llena</th>
              <th className="pb-1 pr-3 text-right">Distintos</th>
              <th className="pb-1 pr-3">Ejemplos</th>
              <th className="pb-1">Asignada a</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const field = assignedTo(p.name);
              return (
                <tr key={p.name} className="border-t border-[var(--border)]/40">
                  <td className="py-1 pr-3 font-medium text-slate-300">{p.name}</td>
                  <td className="py-1 pr-3 text-slate-500">{p.kind}</td>
                  <td className={`py-1 pr-3 text-right tabular-nums ${p.filled < 60 ? 'text-amber-400' : 'text-slate-500'}`}>{p.filled}%</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-slate-500">{p.distinct}</td>
                  <td className="max-w-[22rem] truncate py-1 pr-3 text-slate-600">{p.samples.join(' ¦ ')}</td>
                  <td className="py-1 text-sky-300">{field ? (FIELD_LABEL[field] ?? field) : <span className="text-slate-700">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
