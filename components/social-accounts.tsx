import { AtSign } from 'lucide-react';
import { saveSocialAccountsAction } from '@/app/query/actions';
import { SubmitButton } from '@/components/submit-button';
import type { SocialAccount } from '@/lib/social/apify';

/**
 * Cuentas de Instagram y páginas de Facebook que el proyecto escucha vía Apify.
 * Una por línea: "cuenta | Nombre". El Nombre debe coincidir con el de la
 * entidad del benchmark (la marca o el competidor) para que los comentarios
 * se le atribuyan.
 */
export function SocialAccounts({ projectId, accounts, apifyReady }: {
  projectId: number; accounts: SocialAccount[]; apifyReady: boolean;
}) {
  const ig = accounts.filter((a) => a.network === 'instagram');
  const fb = accounts.filter((a) => a.network === 'facebook');
  const text = (list: SocialAccount[], fmt: (a: SocialAccount) => string) => list.map((a) => `${fmt(a)} | ${a.label}`).join('\n');
  const summary = accounts.length
    ? `${ig.length} de Instagram · ${fb.length} de Facebook`
    : 'ninguna configurada';
  const area = 'w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500/50';
  return (
    <details className="panel mb-4 px-5 py-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm text-slate-300">
        <AtSign className="size-4 text-pink-400" />
        <span className="font-semibold">Cuentas en redes (Instagram y Facebook, vía Apify):</span>
        <span className={accounts.length ? 'text-sky-300' : 'text-slate-500'}>{summary}</span>
        {!apifyReady && <span className="text-xs text-amber-400">falta el token de Apify (Ajustes → Fuentes)</span>}
        <span className="ml-auto text-xs text-slate-500 underline">cambiar</span>
      </summary>
      <form action={saveSocialAccountsAction} className="mt-3 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="projectId" value={projectId} />
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Instagram — una cuenta por línea: <span className="font-mono text-slate-300">@usuario | Nombre</span>
          <textarea name="instagram" rows={6} defaultValue={text(ig, (a) => `@${a.handle}`)} className={area}
            placeholder={'@ccsannicolas | Centro Comercial San Nicolás\n@vivapalmascc | Viva Palmas'} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Facebook — una página por línea: <span className="font-mono text-slate-300">URL de la página | Nombre</span>
          <textarea name="facebook" rows={6} defaultValue={text(fb, (a) => a.handle)} className={area}
            placeholder={'https://www.facebook.com/ccsannicolas | Centro Comercial San Nicolás'} />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <SubmitButton pendingLabel="Guardando…"
            className="rounded-lg bg-sky-500/90 px-4 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400">
            Guardar cuentas
          </SubmitButton>
          <p className="text-[11px] text-slate-500">
            Se leen los comentarios del público en sus publicaciones: la primera vez, los últimos 60 días; después, solo lo nuevo.
            Usa como Nombre el mismo de la marca o el competidor en Benchmark para que cada comentario se le atribuya.
            Cada ejecución en Apify tiene un tope de gasto.
          </p>
        </div>
      </form>
    </details>
  );
}
