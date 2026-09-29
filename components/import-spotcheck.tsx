'use client';

import { useState } from 'react';
import { AlertTriangle, Check, FileSearch, Loader2, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// "È andata bene?"
//
// Un elenco di conteggi non risponde a questa domanda: per crederci bisogna
// fidarsi. La risposta che convince è il confronto che l'utente farebbe da
// solo — aprire il file, guardare una riga, cercarla in Radar.
//
// Questo pannello lo fa per lui su tre righe prese agli estremi del foglio, e
// mostra i due valori affiancati. Se una spunta manca si vede subito quale
// campo è, e non serve sapere niente di tecnico per accorgersene.
// ---------------------------------------------------------------------------

type Field = { label: string; fromFile: string; inRadar: string; ok: boolean };
type Row = { rowNumber: number; found: boolean; fields: Field[]; extras: { label: string; value: string }[] };
type Result = {
  label: string; kind: 'mentions' | 'metrics';
  rows: Row[]; checked: number; matched: number; note?: string; stale?: number;
};

export function SpotCheck({ fileId, projectId }: { fileId: number; projectId: number }) {
  const [data, setData] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/import/spotcheck?file=${fileId}&project=${projectId}&n=3`);
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'No se pudo hacer la verificación'); return; }
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] px-3 py-3">
        <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
          ¿No estás seguro de que haya salido bien? Tomo tres filas de tu hoja (la primera, una del
          medio y la última) y te muestro qué tiene AEDO guardado para cada una.
          Tú las comparas con el archivo abierto al lado.
        </p>
        <button onClick={run} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-500/20 disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSearch className="size-3.5" />}
          {busy ? 'Comparando…' : 'Verificar tres filas de muestra'}
        </button>
        {error && <p className="mt-2 text-[11px] text-amber-300">{error}</p>}
      </div>
    );
  }

  if (data.note) {
    return <p className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-[11px] text-slate-500">{data.note}</p>;
  }

  const allOk = data.rows.every((r) => r.found && r.fields.every((f) => f.ok));
  // L'archivio più vecchio della mappatura non è un errore di lettura, ed è
  // l'unico caso che si risolve con un gesto solo: rifare l'import.
  const stale = data.stale ?? 0;

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] px-3 py-3">
      {stale > 0 ? (
        <p className="mb-2 flex items-start gap-1.5 text-xs font-medium text-amber-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            En el archivo hay una lectura más antigua de esta hoja: con las columnas
            asignadas ahora saldrían <b>{stale} filas más</b>.
            <span className="font-normal text-slate-400"> Pulsa &ldquo;Reimportar&rdquo; aquí arriba
              y esta hoja volverá a quedar alineada con el archivo.</span>
          </span>
        </p>
      ) : (
        <p className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${allOk ? 'text-emerald-300' : 'text-amber-300'}`}>
          {allOk ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          {allOk
            ? `Las ${data.checked} filas que verifiqué están guardadas idénticas a la hoja.`
            : `${data.matched} de ${data.checked} filas encontradas. Mira abajo qué valores no coinciden.`}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {data.rows.map((r) => (
          <div key={r.rowNumber} className="rounded-lg bg-white/[0.02] px-2.5 py-2">
            <p className="mb-1 text-[11px] text-slate-500">
              Fila <span className="font-semibold text-slate-300">{r.rowNumber}</span> de la hoja
              {!r.found && (
                <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">
                  {stale > 0
                    ? 'falta porque el archivo guardado es más antiguo que la hoja'
                    : 'no se importó: estaba vacía o era idéntica a otra'}
                </span>
              )}
            </p>

            {r.fields.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-[11px]">
                  <thead>
                    <tr className="text-slate-600">
                      <th className="py-0.5 pr-2 text-left font-normal">campo</th>
                      <th className="py-0.5 pr-2 text-left font-normal">en tu archivo</th>
                      <th className="py-0.5 pr-2 text-left font-normal">en AEDO</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {r.fields.map((f) => (
                      <tr key={f.label} className="border-t border-[var(--border)]/60 align-top">
                        <td className="py-1 pr-2 text-slate-400">{f.label}</td>
                        <td className="max-w-[16rem] truncate py-1 pr-2 text-slate-300" title={f.fromFile}>{f.fromFile}</td>
                        <td className={`max-w-[16rem] truncate py-1 pr-2 ${f.ok ? 'text-slate-300' : 'text-amber-300'}`} title={f.inRadar}>{f.inRadar}</td>
                        <td className="py-1">
                          {f.ok ? <Check className="size-3 text-emerald-400" /> : <X className="size-3 text-amber-400" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {r.extras.length > 0 && (
              <p className="mt-1 text-[11px] text-slate-600">
                También se guardó:{' '}
                {r.extras.map((e) => (
                  <span key={e.label} className="text-violet-300">{e.label} = {e.value}; </span>
                ))}
              </p>
            )}
          </div>
        ))}
      </div>

      <button onClick={() => { setData(null); }}
        className="mt-2 text-[11px] text-slate-500 hover:text-slate-300">
        repetir la verificación con otras filas
      </button>
    </div>
  );
}
