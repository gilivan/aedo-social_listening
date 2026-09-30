import Link from 'next/link';
import { AlertTriangle, DollarSign as Euro } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { emvReport, EMV_ASSUMPTIONS } from '@/lib/emv';
import { PageHeader, EmptyState, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { sourceLabel } from '@/lib/export-data';

export const metadata = { title: 'Valor mediático ganado (EMV)' };

const eur = (n: number) => `US$${n.toLocaleString('es-CO')}`;

export default async function EmvPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No hay ningún proyecto configurado." />;
  const r = await emvReport(project.id, 30);
  const maxSource = Math.max(1, ...r.bySource.map((s) => s.emv));
  const maxDay = Math.max(1, ...r.daily.map((d) => d.emv));
  const estimatedShare = r.items ? Math.round(((r.items - r.withRealReach) / r.items) * 100) : 0;

  return (
    <>
      <PageHeader
        title={t('page.emv.title', 'Valor mediático ganado (EMV)')}
        info="Una estimación de cuánto habría costado comprar tu cobertura ganada. Es deliberadamente conservadora y totalmente transparente: se usa el alcance real cuando la fuente lo publica; si no, las impresiones se estiman por tipo de fuente; la cobertura negativa vale cero y se reporta aparte como exposición; y no hay ningún ‘multiplicador de PR’ arbitrario. Cada cifra se puede recalcular a mano con los supuestos que aparecen abajo. Periodo: últimos 30 días."
        subtitle="La pregunta que la gerencia siempre hace: ¿cuánto vale esta cobertura? Aquí tienes una respuesta defendible, con todos los supuestos sobre la mesa, porque un EMV sin sus supuestos es solo un número para discutir."
      />

      {/* Spiegazione in chiaro: senza, "€14.519" è un numero che nessuno sa difendere. */}
      <section className="panel mb-4 border-emerald-500/20 px-5 py-4">
        <p className="text-sm leading-relaxed text-slate-300">
          <strong className="text-slate-100">{t('emv.what', 'La gente está hablando de ti, y no pagaste por ello.')}</strong>{' '}
          {t('emv.what.body', 'Los periodistas escriben artículos, los usuarios publican, las comunidades conversan. Toda esa atención llegó a personas reales. Si hubieras querido la misma atención con publicidad, habrías tenido que comprarla. Esta página estima esa factura: cuánto habría costado tu cobertura ganada como medios pagados.')}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-white/[0.03] px-3 py-2" title="Cada artículo y publicación sobre tu tema en el periodo">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">1 · {t('emv.step1', 'La cobertura')}</p>
            <p className="mt-0.5 text-sm text-slate-300">
              {fmtNum(r.items)} {t('emv.step1.body', 'piezas que hablan de tu tema')}
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2" title="Cuántas personas probablemente la vieron: alcance real cuando la fuente lo publica; si no, una estimación conservadora">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">2 · {t('emv.step2', 'Cuántos la vieron')}</p>
            <p className="mt-0.5 text-sm text-slate-300">
              {fmtNum(r.impressions)} {t('emv.step2.body', 'visualizaciones estimadas')}
            </p>
          </div>
          <div className="rounded-lg bg-emerald-500/[0.07] px-3 py-2" title="La publicidad se vende por cada mil visualizaciones (CPM). Las mismas visualizaciones, compradas a una tarifa de mercado conservadora.">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">3 · {t('emv.step3', 'Cuánto habría costado')}</p>
            <p className="mt-0.5 text-sm font-semibold text-emerald-300">
              {eur(r.emv)} {t('emv.step3.body', 'en publicidad')}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {t('emv.caveat', 'Es una estimación, no una factura, y deliberadamente prudente: aquí la cobertura negativa no vale nada y no se aplica ninguno de los trucos inflados de la antigua métrica AVE. El método completo está al final de la página.')}
        </p>
      </section>

      {r.items === 0 ? (
        <EmptyState message="Todavía no hay cobertura en los últimos 30 días." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="panel border-emerald-500/30 px-4 py-3"
              title="Costo estimado de comprar una atención equivalente, en los últimos 30 días">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Valor mediático ganado</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">{eur(r.emv)}</p>
              <p className="text-xs text-slate-500">últimos {r.days} días</p>
            </div>
            <div className="panel px-4 py-3" title="Total de impresiones estimadas de toda la cobertura del periodo">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Impresiones</p>
              <p className="mt-1 text-2xl font-bold">{fmtNum(r.impressions)}</p>
              <p className="text-xs text-slate-500">{fmtNum(r.items)} piezas de cobertura</p>
            </div>
            <div className="panel px-4 py-3"
              title="La cobertura negativa vale cero: es exposición, no valor. Se muestra aquí para que nunca quede escondida dentro del total.">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Exposición negativa</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{fmtNum(r.negativeImpressions)}</p>
              <p className="text-xs text-slate-500">{fmtNum(r.negativeItems)} piezas · valoradas en US$0</p>
            </div>
            <div className="panel px-4 py-3"
              title="Porcentaje de la cobertura cuyas impresiones se tuvieron que estimar porque la fuente no publica el alcance real">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Alcance estimado</p>
              <p className="mt-1 text-2xl font-bold">{estimatedShare}%</p>
              <p className="text-xs text-slate-500">{fmtNum(r.withRealReach)} con alcance real</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel px-5 py-4">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">De dónde viene el valor</h2>
              <p className="mb-3 text-[11px] text-slate-500">Por fuente, en el periodo.</p>
              <ul className="flex flex-col gap-1.5 text-xs">
                {r.bySource.slice(0, 10).map((s) => (
                  <li key={s.source} className="flex items-center gap-2"
                    title={`${sourceLabel(s.source)}: ${eur(s.emv)} de ${fmtNum(s.items)} piezas y ${fmtNum(s.impressions)} impresiones estimadas`}>
                    <Link href={`/source/${s.source}`} className="w-32 shrink-0 truncate text-slate-300 hover:text-sky-300">
                      {sourceLabel(s.source)}
                    </Link>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <span className="block h-full rounded-full bg-emerald-400/70"
                        style={{ width: `${Math.round((s.emv / maxSource) * 100)}%` }} />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-slate-400">{eur(s.emv)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel px-5 py-4">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">Valor ganado día a día</h2>
              <p className="mb-3 text-[11px] text-slate-500">Los picos marcan los días que más rindieron.</p>
              <div className="flex h-32 items-end gap-0.5">
                {r.daily.map((d) => (
                  <span key={d.day} className="flex-1" title={`${d.day}: ${eur(d.emv)}`}>
                    <span className="block rounded-t bg-emerald-500/60"
                      style={{ height: `${Math.max(2, (d.emv / maxDay) * 120)}px` }} />
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-600">
                {r.daily[0]?.day} → {r.daily[r.daily.length - 1]?.day}
              </p>
            </section>
          </div>

          <section className="panel mt-4 px-5 py-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-300">Cobertura que más valor generó</h2>
            <p className="mb-3 text-[11px] text-slate-500">Las piezas que generaron la mayor parte del valor. Haz clic para abrirlas.</p>
            <ul className="flex flex-col gap-1 text-xs">
              {r.top.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-emerald-300">{eur(t.emv)}</span>
                  <Link href={`/listening?ids=${t.id}`} className="min-w-0 flex-1 truncate text-slate-300 hover:text-sky-300"
                    title={`${t.title}\n${sourceLabel(t.source)} · ${t.date} · ${fmtNum(t.impressions)} impresiones estimadas${t.sentiment ? ` · ${t.sentiment}` : ''}`}>
                    {t.title}
                  </Link>
                  <span className="shrink-0 text-slate-600">{sourceLabel(t.source)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Le assunzioni: senza queste, un EMV è solo un numero su cui litigare. */}
          <section className="panel mt-4 border-amber-500/25 px-5 py-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
              <AlertTriangle className="size-4" /> Cómo se calcula, y por qué deberías leerlo
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-slate-400">
              El EMV es una <strong className="text-slate-300">estimación</strong>, no una cifra contable. Quien lo venda como un número
              preciso está exagerando. Estas son las reglas que se usan aquí, para que puedas defender (o cuestionar) cada dólar:
            </p>
            <ul className="flex flex-col gap-1.5 text-xs text-slate-400">
              <li><Euro className="mr-1 inline size-3 text-emerald-400" />
                <strong className="text-slate-300">Fórmula:</strong> impresiones ÷ 1.000 × CPM × factor de sentimiento, sumado en todas las piezas.
              </li>
              <li>• <strong className="text-slate-300">Impresiones:</strong> el alcance real cuando la fuente lo publica
                ({fmtNum(r.withRealReach)} piezas aquí); si no, {fmtNum(EMV_ASSUMPTIONS.newsBaseImpressions)} por artículo de noticias,
                o engagement × {EMV_ASSUMPTIONS.socialEngagementMultiplier} para publicaciones en redes sociales.
              </li>
              <li>• <strong className="text-slate-300">CPM:</strong> US${EMV_ASSUMPTIONS.cpmNews} para noticias, US${EMV_ASSUMPTIONS.cpmSocial} para redes sociales: tarifas de mercado conservadoras.
              </li>
              <li>• <strong className="text-slate-300">Sentimiento:</strong> positivo ×{EMV_ASSUMPTIONS.factorPositive},
                neutral ×{EMV_ASSUMPTIONS.factorNeutral}, negativo ×{EMV_ASSUMPTIONS.factorNegative}: la cobertura negativa
                no genera valor, así que se excluye del total y se reporta como exposición.
              </li>
              <li>• <strong className="text-slate-300">Sin multiplicador de PR:</strong> no se aplica la clásica bonificación AVE ×3 por “credibilidad editorial”. No tiene evidencia que la respalde.</li>
            </ul>
          </section>
        </>
      )}
    </>
  );
}
