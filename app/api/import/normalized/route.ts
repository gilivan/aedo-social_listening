import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { getDb } from '@/lib/db';
import { importFiles, projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { allRawRows, fileMapping, sampleRows } from '@/lib/import-store';
import { deriveRows, type NormalizedRow } from '@/lib/import-derive';
import { slugify, todayStamp } from '@/lib/export-data';
import type { ColumnMap } from '@/lib/import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Il normalizzato: come diventano le righe.
//
// POST → anteprima delle prime righe, senza scrivere niente.
// GET  → scarica il risultato: un file solo, oppure tutti i file del progetto
//        fusi in un'unica tabella con la stessa forma.
//
// Entrambi passano da deriveRows, la stessa funzione dell'import: l'anteprima
// non può promettere una cosa e l'import farne un'altra.
// ---------------------------------------------------------------------------

/** L'ordine delle colonne del normalizzato. È il contratto del file esportato. */
const COLUMNS: { key: keyof NormalizedRow | 'file'; header: string; width: number }[] = [
  { key: 'publishedAt', header: 'Fecha y hora', width: 19 },
  { key: 'source', header: 'Fuente', width: 14 },
  { key: 'author', header: 'Autor', width: 20 },
  { key: 'authorHandle', header: 'Handle', width: 18 },
  { key: 'community', header: 'Comunidad', width: 18 },
  { key: 'title', header: 'Título', width: 40 },
  { key: 'content', header: 'Texto', width: 70 },
  { key: 'language', header: 'Idioma', width: 8 },
  { key: 'sentiment', header: 'Sentimiento', width: 11 },
  { key: 'sentimentScore', header: 'Puntaje de sentimiento', width: 12 },
  { key: 'reach', header: 'Alcance', width: 12 },
  { key: 'likes', header: 'Me gusta', width: 10 },
  { key: 'comments', header: 'Comentarios', width: 10 },
  { key: 'shares', header: 'Compartidos', width: 12 },
  { key: 'views', header: 'Visualizaciones', width: 14 },
  { key: 'engagementScore', header: 'Engagement', width: 12 },
  { key: 'url', header: 'Enlace', width: 45 },
  { key: 'file', header: 'Archivo de origen', width: 26 },
];

async function guard(projectId: number) {
  if (!isAdmin(await getCurrentUser())) return 'Solo los administradores pueden importar';
  if (!projectId) return 'Falta el proyecto';
  const db = await getDb();
  const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!p) return 'Proyecto no encontrado';
  return null;
}

/** Anteprima: le prime righe come diventeranno, senza scrivere niente. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectId = Number(body.projectId);
  const fileId = Number(body.fileId);
  const err = await guard(projectId);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  if (!fileId) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });

  // La mappatura può arrivare dal client: è la bozza in corso di modifica, non
  // ancora salvata — ed è proprio quella che l'utente vuole provare.
  const map = (body.mapping ?? await fileMapping(fileId, projectId)) as unknown as ColumnMap | null;
  if (!map?.content) return NextResponse.json({ error: 'Primero asigna la columna del texto' }, { status: 400 });

  // Si leggono più righe di quante se ne mostrano: quelle senza testo vengono
  // scartate, e con un limite stretto l'anteprima poteva uscire vuota.
  const raw = await sampleRows(fileId, 150);
  const { rows, report } = deriveRows(raw, map, fileId, 8);
  return NextResponse.json({ rows, report, scanned: raw.length });
}

function cell(row: NormalizedRow & { file: string }, key: (typeof COLUMNS)[number]['key']): unknown {
  if (key === 'publishedAt') return row.publishedAt;
  return (row as unknown as Record<string, unknown>)[key] ?? null;
}

/** Scarica il normalizzato: un file, o tutti quelli del progetto fusi insieme. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = Number(url.searchParams.get('project'));
  const only = Number(url.searchParams.get('file')) || null;
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
  const err = await guard(projectId);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const db = await getDb();
  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId));
  const files = await db.select().from(importFiles).where(
    only
      ? and(eq(importFiles.projectId, projectId), eq(importFiles.id, only))
      : eq(importFiles.projectId, projectId),
  );
  if (!files.length) return NextResponse.json({ error: 'No hay archivos para exportar' }, { status: 404 });

  const all: (NormalizedRow & { file: string })[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const map = { ...f.mapping, extras: f.extras ?? {} } as unknown as ColumnMap;
    // Un file non mappato o già purgato non ha un normalizzato da dare: si
    // dichiara invece di far uscire un export silenziosamente incompleto.
    if (!map?.content || f.rawPurged === 1) { skipped.push(f.filename); continue; }
    const raw = await allRawRows(f.id);
    const { rows } = deriveRows(raw, map, f.id);
    all.push(...rows.map((r) => ({ ...r, file: f.filename })));
  }
  if (!all.length) {
    return NextResponse.json({
      error: skipped.length
        ? `No hay filas exportables: ${skipped.join(', ')} ${skipped.length > 1 ? 'no están mapeados' : 'no está mapeado'} o ${skipped.length > 1 ? 'tienen' : 'tiene'} las filas originales eliminadas.`
        : 'No hay filas exportables.',
    }, { status: 400 });
  }

  // Una sola tabella, ordinata nel tempo: è il senso di "sommare N file".
  all.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

  const base = `aedo-normalizado-${slugify(project?.name ?? 'proyecto')}-${todayStamp()}`;

  if (format === 'csv') {
    const esc = (v: unknown) => {
      if (v == null) return '';
      const s = v instanceof Date ? v.toISOString() : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [COLUMNS.map((c) => c.header).join(',')];
    for (const r of all) lines.push(COLUMNS.map((c) => esc(cell(r, c.key))).join(','));
    // BOM: senza, Excel apre il CSV in latin-1 e sfascia gli accenti.
    return new NextResponse('﻿' + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'AEDO';
  wb.created = new Date();
  const ws = wb.addWorksheet('Normalizado');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: String(c.key), width: c.width }));
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16203C' } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of all) {
    ws.addRow(Object.fromEntries(COLUMNS.map((c) => [String(c.key), cell(r, c.key)])));
  }
  ws.getColumn('publishedAt').numFmt = 'yyyy-mm-dd hh:mm';

  // Un foglio con la provenienza: quante righe ha messo ciascun file, e quali
  // sono stati saltati. Senza, un export incompleto sarebbe indistinguibile.
  const info = wb.addWorksheet('Procedencia');
  info.columns = [
    { header: 'Archivo', key: 'f', width: 34 },
    { header: 'Filas normalizadas', key: 'n', width: 20 },
  ];
  info.getRow(1).font = { bold: true };
  const perFile = new Map<string, number>();
  for (const r of all) perFile.set(r.file, (perFile.get(r.file) ?? 0) + 1);
  for (const [f, n] of perFile) info.addRow({ f, n });
  info.addRow({});
  info.addRow({ f: 'TOTAL', n: all.length });
  for (const s of skipped) info.addRow({ f: `${s} — omitido (no mapeado o filas originales eliminadas)`, n: 0 });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${base}.xlsx"`,
    },
  });
}
