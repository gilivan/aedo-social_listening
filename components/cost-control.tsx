'use client';

import { useActionState } from 'react';
import { RotateCcw, Save, Lock } from 'lucide-react';
import { updateApiBudget, resetApiSpend, type ActionResult } from '@/app/settings/actions';

const INIT: ActionResult = { ok: false, msg: '' };

export function CostControl({ budget, lifetimeCost, lifetimeCalls, resetAt }: {
  budget: number; lifetimeCost: number; lifetimeCalls: number; resetAt: string;
}) {
  const [budgetState, budgetAction, budgetPending] = useActionState(updateApiBudget, INIT);
  const [resetState, resetAction, resetPending] = useActionState(resetApiSpend, INIT);

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-[var(--border)] pt-4">
      {/* Budget */}
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Tope de gasto</h3>
        <form action={budgetAction} className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400">$</span>
          <input name="budget" type="number" step="0.5" min="0.5" defaultValue={budget}
            className="w-28 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
          <button type="submit" disabled={budgetPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <Save className="size-3.5" />{budgetPending ? 'Guardando…' : 'Guardar presupuesto'}
          </button>
          {budgetState.msg && <span className={`text-xs ${budgetState.ok ? 'text-emerald-400' : 'text-red-400'}`}>{budgetState.msg}</span>}
        </form>
        <p className="mt-1 text-[11px] text-slate-600">Cuando el gasto desde el último reinicio alcanza este tope, AEDO deja de llamar a la IA (la recopilación de datos sigue funcionando).</p>
      </div>

      {/* Reset */}
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Reiniciar contador de gasto</h3>
        <form action={resetAction} className="flex flex-wrap items-center gap-2">
          <span className="relative inline-flex items-center">
            <Lock className="pointer-events-none absolute left-2.5 size-3.5 text-slate-500" />
            <input name="password" type="password" placeholder="La contraseña de tu cuenta" required
              className="w-56 rounded-lg border border-[var(--border)] bg-white/5 py-1.5 pl-8 pr-3 text-sm text-slate-100 outline-none focus:border-sky-500" />
          </span>
          <button type="submit" disabled={resetPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
            <RotateCcw className="size-3.5" />{resetPending ? 'Reiniciando…' : 'Reiniciar a $0'}
          </button>
          {resetState.msg && <span className={`text-xs ${resetState.ok ? 'text-emerald-400' : 'text-red-400'}`}>{resetState.msg}</span>}
        </form>
        <p className="mt-1 text-[11px] text-slate-600">
          Pone en cero el contador del presupuesto e inicia un nuevo periodo desde ahora. Requiere tu contraseña de administrador. Último reinicio:{' '}
          <span className="text-slate-500">{new Date(resetAt).toLocaleString('es-CO')}</span>.
        </p>
      </div>

      {/* Totale storico */}
      <div className="rounded-lg border border-[var(--border)] bg-white/[0.02] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Gasto histórico · todos los usuarios</p>
        <p className="mt-1 text-2xl font-bold text-slate-100">${lifetimeCost.toFixed(2)}</p>
        <p className="text-xs text-slate-500">{lifetimeCalls.toLocaleString('es-CO')} llamadas a la IA en total; esta cifra nunca se ve afectada por los reinicios.</p>
      </div>
    </div>
  );
}
