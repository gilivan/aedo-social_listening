import { getConnectorCredStatuses, hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { CONNECTORS } from '@/lib/connectors';
import { SOURCE_META } from '@/lib/connectors';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { CostControl } from '@/components/cost-control';
import { AiEngine, type EngineOption } from '@/components/ai-engine';
import { claudeAvailable, costControl } from '@/lib/claude';
import { AI_PROVIDERS, AI_PROVIDER_IDS, aiProvider, aiModels } from '@/lib/ai-provider';
import { PageHeader } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ExternalLink } from 'lucide-react';

export const metadata = { title: 'Presupuesto' };

// How each paid connector is billed — by the provider, not metered by Radar.
const PAID_NOTE: Record<string, string> = {
  x: 'API de X — plan Basic, suscripción fija de ~US$200/mes facturada por X.',
  newsapi: 'NewsAPI — nivel gratuito para desarrolladores y planes pagos para producción. Facturado por newsapi.org.',
  instagram: 'Meta Graph API — llamadas gratuitas, pero requiere una cuenta Business. Sin costo por llamada.',
  facebook: 'Meta Graph API — llamadas gratuitas, vinculadas a tu página/token. Sin costo por llamada.',
  tiktok: 'TikTok Research API — gratuita, sujeta a aprobación de TikTok. Sin costo por llamada.',
  linkedin: 'LinkedIn — gratuito, limitado a la página de tu propia organización.',
};

export default async function BudgetPage() {
  const t = await getT();
  await hydrateConnectorCredentials();
  const [cost, credStatuses, currentUser, activeProvider] = await Promise.all([
    costControl(), getConnectorCredStatuses(), getCurrentUser(), aiProvider(),
  ]);
  const isAdm = isAdmin(currentUser);
  const engineOptions: EngineOption[] = await Promise.all(AI_PROVIDER_IDS.map(async (id) => ({
    id,
    label: AI_PROVIDERS[id].label,
    configured: credStatuses[id]?.configured ?? false,
    fields: credStatuses[id]?.fields ?? [],
    models: await aiModels(id),
    defaults: AI_PROVIDERS[id].models,
  })));
  const budget = cost.budget;
  const budgetPct = Math.min(100, (cost.current.cost / budget) * 100);

  const paidActive = CONNECTORS
    .filter((c) => c.tier === 'premium')
    .filter((c) => credStatuses[c.id]?.fields.some((f) => f.set));

  return (
    <>
      <PageHeader
        title={t('page.budget.title', 'Presupuesto y costos')}
        subtitle="La clave de IA que impulsa el análisis, su tope de gasto y de dónde vienen los costos de tus fuentes de datos pagas."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Colonna AI: chiave + spesa/budget */}
        <div className="flex flex-col gap-4">
          {isAdm && (
            <AiEngine options={engineOptions} active={activeProvider} />
          )}

          <section className="panel h-fit px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Gasto y presupuesto de IA</h2>
            {await claudeAvailable() ? (
              <>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold">${cost.current.cost.toFixed(2)}</p>
                  <p className="text-sm text-slate-500">de ${budget.toFixed(2)} — desde el último reinicio</p>
                </div>
                <div className="mt-2 h-2 rounded bg-white/5">
                  <div
                    className={`h-2 rounded ${budgetPct > 85 ? 'bg-red-400' : budgetPct > 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {cost.current.calls.toLocaleString('es-CO')} llamadas · {(cost.current.inTok / 1000).toFixed(0)}k tokens de entrada · {(cost.current.outTok / 1000).toFixed(0)}k de salida.
                  Al alcanzar el tope, la app deja de llamar a la IA (la recopilación de datos sigue funcionando).
                </p>
                {cost.byPurpose.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {cost.byPurpose.map((p) => (
                      <div key={p.purpose} className="flex justify-between text-xs">
                        <span className="text-slate-400">{p.purpose.replace(/_/g, ' ')}</span>
                        <span className="text-slate-500">${p.cost.toFixed(3)} · {p.calls} llamadas</span>
                      </div>
                    ))}
                  </div>
                )}
                {isAdm && (
                  <CostControl
                    budget={cost.budget}
                    lifetimeCost={cost.lifetime.cost}
                    lifetimeCalls={cost.lifetime.calls}
                    resetAt={cost.resetAt}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-amber-400/90">
                El motor de IA activo todavía no tiene clave: agrega una arriba. La recopilación de datos funciona, pero el sentimiento, los briefs y las calificaciones quedan pendientes.
              </p>
            )}
          </section>
        </div>

        {/* Colonna costi delle fonti a pagamento */}
        <section className="panel h-fit px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">Fuentes de datos pagas</h2>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-600">
            El presupuesto de arriba mide solo el gasto en <span className="text-slate-400">IA</span>, porque AEDO hace esas llamadas y puede contar los tokens.
            Las fuentes de datos pagas son distintas: las factura <span className="text-slate-400">directamente cada proveedor</span> como una suscripción fija o una cuota de solicitudes;
            AEDO no puede medir ese costo. Lo controlas agregando o quitando la clave (en la pestaña <span className="text-slate-400">Fuentes</span>) y gestionando los límites en el tablero del propio proveedor.
          </p>

          {paidActive.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80">Activas en tu cuenta</p>
              {paidActive.map((c) => (
                <div key={c.id} className="rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-2">
                  <p className="text-sm font-medium text-slate-200">{SOURCE_META[c.id]?.label ?? c.id}</p>
                  <p className="text-[11px] leading-snug text-slate-500">{PAID_NOTE[c.id] ?? 'Facturado directamente por el proveedor.'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No hay ninguna fuente paga activa. Todos los datos vienen hoy de fuentes gratuitas: tu único costo medido es el presupuesto de IA de la izquierda.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-1.5 border-t border-[var(--border)] pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Referencia: cómo se factura cada fuente paga</p>
            {(['x', 'newsapi', 'instagram', 'facebook', 'tiktok', 'linkedin'] as const).map((id) => (
              <p key={id} className="text-[11px] text-slate-500">
                <span className="text-slate-300">{SOURCE_META[id]?.label ?? id}:</span> {PAID_NOTE[id]}
              </p>
            ))}
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-600">
              Gestiona las claves de las fuentes en la pestaña <span className="text-sky-400">Fuentes</span>. <ExternalLink className="size-3" />
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
