'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';

/** AEDO — actualiza UNA fuente de reseñas (sin volver a leer las demás). */
export function RefreshSourceButton({ id, label }: { id: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/refresh?source=${id}`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `el servidor respondió ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={run} disabled={busy} title={`Actualizar ${label}`} aria-label={`Actualizar ${label}`}
        className="text-slate-500 transition hover:text-sky-300 disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      </button>
      {error && <span className="max-w-[16rem] truncate text-[11px] text-red-400" title={error}>{error}</span>}
    </span>
  );
}
