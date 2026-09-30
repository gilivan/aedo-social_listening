'use client';

import { useEffect, useState } from 'react';

// AEDO — recibe un paquete de publicaciones recorridas en el navegador
// (TikTok, X) por el fragmento de la URL (#datos=…, base64 de JSON UTF-8),
// muestra un resumen y lo importa al proyecto actual con un clic.
// El fragmento nunca viaja al servidor en la navegación: solo el POST explícito.

type Pkg = { network: string; items: { comments?: unknown[] }[] };

function decode(hash: string): Pkg | null {
  const m = hash.match(/datos=([^&]+)/);
  if (!m) return null;
  try {
    const bin = atob(decodeURIComponent(m[1]));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Pkg;
  } catch {
    return null;
  }
}

export default function ImportarRedesPage() {
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => { setPkg(decode(window.location.hash)); }, []);

  async function run() {
    if (!pkg) return;
    setState('busy');
    try {
      const res = await fetch('/api/importar-redes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pkg) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `error ${res.status}`);
      setState('done');
      setMsg(`Proyecto «${d.project}»: ${d.posts} publicaciones y ${d.comments} comentarios leídos; ${d.inserted} nuevos guardados, ${d.movedToCompetitors} pasaron al proyecto de competencia. Pulsa «Actualizar» en Consultas para analizarlos con la IA.`);
      history.replaceState(null, '', '/importar-redes');
    } catch (e) {
      setState('error');
      setMsg((e as Error).message);
    }
  }

  const comments = pkg ? pkg.items.reduce((s, i) => s + (i.comments?.length ?? 0), 0) : 0;
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">Importar redes recorridas</h1>
      <p className="mb-6 text-sm text-slate-400">Publicaciones y comentarios de TikTok o X leídos en tu navegador, para redes que AEDO todavía no consulta por su cuenta.</p>
      {!pkg && <p className="panel px-5 py-4 text-sm text-slate-400">No hay datos para importar en este enlace.</p>}
      {pkg && (
        <div className="panel flex flex-col gap-4 px-5 py-4">
          <p className="text-sm">Red: <b>{pkg.network === 'x' ? 'X' : 'TikTok'}</b> · {pkg.items.length} publicaciones · {comments} comentarios</p>
          <button onClick={run} disabled={state === 'busy' || state === 'done'}
            className="self-start rounded-lg bg-sky-500/90 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-60">
            {state === 'busy' ? 'Importando…' : state === 'done' ? 'Importado' : 'Importar al proyecto actual'}
          </button>
          {msg && <p className={`text-sm ${state === 'error' ? 'text-red-400' : 'text-emerald-300'}`}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
