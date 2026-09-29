import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Star, Trash2, ExternalLink, ShoppingBag, MapPin, FileUp, Utensils } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { reviewStats } from '@/lib/reviews';
import { getConnectorCredStatuses, hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { PageHeader, fmtDate, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ConnectorKeys } from '@/components/connector-keys';
import { GenerateRefresh } from '@/components/generate-refresh';
import { RatingStars, RatingDistribution, RatingTrend } from '@/components/review-charts';
import { ReviewImportWizard } from '@/components/review-import-wizard';
import { YelpBusinessSearch } from '@/components/yelp-business-search';
import { addReviewSourceAction, removeReviewSourceAction } from './actions';

export const metadata = { title: 'Reseñas' };

const TYPE_META: Record<string, { label: string; icon: typeof ShoppingBag }> = {
  appstore: { label: 'App Store', icon: ShoppingBag },
  googleplaces: { label: 'Google Places', icon: MapPin },
  yelp: { label: 'Yelp', icon: Utensils },
  upload: { label: 'Archivo importado', icon: FileUp },
};

export default async function ReviewsPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return null;

  await hydrateConnectorCredentials();
  const [stats, currentUser, credStatuses] = await Promise.all([
    reviewStats(project.id), getCurrentUser(), getConnectorCredStatuses(),
  ]);
  const canEditKeys = isAdmin(currentUser);

  return (
    // Verde scuro invece del blu/navy standard: la sezione recensioni è
    // volutamente autonoma dal resto dell'app (vedi il testo in PageHeader),
    // e lo è anche visivamente. Sovrascrive solo le variabili dei pannelli:
    // la sidebar vive fuori da questo contenitore e non ne è toccata.
    <div style={{
      '--panel': '#0f1f18',
      '--panel-2': '#14261d',
      '--border': '#1f3d2c',
    } as CSSProperties}>
      <PageHeader
        title={t('page.reviews.title', 'Reseñas')}
        info="Una sección autónoma, separada a propósito de Escucha: una reseña no se encuentra con una búsqueda por palabras clave, está ligada a un identificador fijo (una app, un lugar) y trae un dato que el resto de AEDO no tiene: una calificación en estrellas, que ES el sentimiento, sin necesidad de IA. Fuentes: Apple App Store (gratis, sin clave), Google Places (clave de nivel gratuito) o tu propio archivo. Los datos se actualizan con el ciclo diario o a pedido, abajo."
        subtitle="Cómo te califican, no lo que dicen de ti en otros lugares: App Store, Google Places y todo lo que importes, separado a propósito del resto de la app."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <GenerateRefresh endpoint="/api/reviews/refresh" label={t('page.reviews.refresh', 'Revisar fuentes ahora')} busyLabel={t('page.reviews.checking', 'Revisando…')} />
      </div>

      {/* ── Fonti configurate ─────────────────────────────────────────── */}
      <section className="panel mb-4 px-5 py-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">{t('page.reviews.sources', 'Fuentes')}</h2>

        {stats.sources.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {stats.sources.map((s) => {
              const meta = TYPE_META[s.type] ?? TYPE_META.upload;
              const Icon = meta.icon;
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                  <Icon className="size-4 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{s.label}</p>
                    <p className="truncate text-[11px] text-slate-600">
                      {meta.label} · {s.identifier}{s.country ? ` · ${s.country.toUpperCase()}` : ''}
                    </p>
                  </div>
                  <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                    {s.total > 0 && (
                      <span className="flex items-center gap-1">
                        <RatingStars rating={s.avgRating} size="sm" /> {s.avgRating?.toFixed(1)} · {fmtNum(s.total)}
                      </span>
                    )}
                    {s.type === 'googleplaces' && !stats.googlePlacesEnabled && (
                      <span className="text-amber-400">requiere clave de API ↓</span>
                    )}
                    {s.type === 'yelp' && !stats.yelpEnabled && (
                      <span className="text-amber-400">requiere clave de API ↓</span>
                    )}
                    <span className="hidden sm:inline">{s.lastFetchedAt ? `revisada ${fmtDate(s.lastFetchedAt)}` : 'aún sin revisar'}</span>
                  </span>
                  <form action={removeReviewSourceAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" aria-label={`Eliminar ${s.label}`}
                      className="text-slate-600 transition hover:text-red-400">
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <form action={addReviewSourceAction} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] px-4 py-3">
            <p className="text-xs font-semibold text-slate-300">
              <ShoppingBag className="mr-1 inline size-3.5" /> Apple App Store
              <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">gratis · sin clave</span>
            </p>
            <input type="hidden" name="type" value="appstore" />
            <input name="identifier" placeholder="ID de la app (p. ej. 389801252)" required
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500/50" />
            <div className="flex gap-2">
              <input name="country" placeholder="País (por defecto us)" maxLength={2}
                className="w-32 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500/50" />
              <input name="label" placeholder="Etiqueta (opcional)"
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500/50" />
            </div>
            <button type="submit" className="mt-1 self-start rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400">
              Agregar app
            </button>
            <p className="text-[11px] text-slate-600">El ID de la app es el número en la URL de App Store: apps.apple.com/…/id<span className="text-slate-400">389801252</span></p>
          </form>

          <form action={addReviewSourceAction} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] px-4 py-3">
            <p className="text-xs font-semibold text-slate-300">
              <MapPin className="mr-1 inline size-3.5" /> Google Places
              <span className="ml-1.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">nivel gratuito · requiere clave</span>
            </p>
            <input type="hidden" name="type" value="googleplaces" />
            <input name="identifier" placeholder="Place ID" required
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500/50" />
            <input name="label" placeholder="Etiqueta (opcional)"
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500/50" />
            <button type="submit" className="mt-1 self-start rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400">
              Agregar lugar
            </button>
            {canEditKeys && credStatuses.googleplaces && (
              <ConnectorKeys connectorId="googleplaces" fields={credStatuses.googleplaces.fields} />
            )}
            <p className="text-[11px] text-slate-600">
              Google devuelve como máximo 5 reseñas por lugar (es su límite, no el nuestro): las más relevantes, no necesariamente las más recientes.
            </p>
          </form>

          <form action={addReviewSourceAction} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] px-4 py-3">
            <p className="text-xs font-semibold text-slate-300">
              <Utensils className="mr-1 inline size-3.5" /> Yelp
              <span className="ml-1.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">nivel gratuito · requiere clave</span>
            </p>
            <input type="hidden" name="type" value="yelp" />
            <YelpBusinessSearch />
            <button type="submit" className="mt-1 self-start rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400">
              Agregar negocio
            </button>
            {canEditKeys && credStatuses.yelp && (
              <ConnectorKeys connectorId="yelp" fields={credStatuses.yelp.fields} />
            )}
            <p className="text-[11px] text-slate-600">
              Yelp devuelve como máximo 3 extractos de reseñas por negocio (es su límite, no el nuestro), recortados: no el texto completo.
            </p>
          </form>
        </div>

        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <ReviewImportWizard />
        </div>
      </section>

      {stats.total === 0 ? (
        <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Star className="size-6 text-slate-600" />
          <p className="max-w-md text-sm text-slate-400">
            {stats.sources.length > 0
              ? 'Fuente agregada: pulsa “Revisar fuentes ahora” arriba para traer sus reseñas.'
              : 'Agrega arriba una app de App Store o un lugar de Google Places para empezar.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="panel flex flex-col items-center justify-center px-5 py-6">
              <p className="text-5xl font-black text-slate-100">{stats.avgRating?.toFixed(1)}</p>
              <RatingStars rating={stats.avgRating} size="lg" />
              <p className="mt-2 text-xs text-slate-500">{fmtNum(stats.total)} reseña{stats.total === 1 ? '' : 's'}</p>
              {stats.recentAvg !== null && stats.priorAvg !== null && (
                <p className="mt-2 text-[11px] text-slate-600">
                  últimos 30 d <span className="text-slate-300">{stats.recentAvg.toFixed(2)}</span> vs. 30 d anteriores <span className="text-slate-300">{stats.priorAvg.toFixed(2)}</span>
                  {stats.recentAvg > stats.priorAvg + 0.15 ? <span className="ml-1 text-emerald-400">↑ mejorando</span>
                    : stats.recentAvg < stats.priorAvg - 0.15 ? <span className="ml-1 text-red-400">↓ empeorando</span>
                      : <span className="ml-1 text-slate-500">→ estable</span>}
                </p>
              )}
            </section>

            <section className="panel px-5 py-5 lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold text-slate-300">{t('page.reviews.distribution', 'Distribución de calificaciones')}</h2>
              <RatingDistribution distribution={stats.distribution} />
            </section>
          </div>

          <section className="panel px-5 py-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('page.reviews.trend', 'Tendencia semanal')}</h2>
            <p className="mb-2 text-[11px] text-slate-600">Calificación promedio por semana: la dirección importa más que cualquier reseña individual.</p>
            <RatingTrend trend={stats.trend} />
          </section>

          <section className="panel px-5 py-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">{t('page.reviews.recent', 'Reseñas recientes')}</h2>
            <div className="flex flex-col gap-2">
              {stats.recent.map((r) => (
                <article key={r.id} className="rounded-lg bg-white/[0.03] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <RatingStars rating={r.rating} size="sm" />
                    <span className="text-[11px] text-slate-600">{TYPE_META[r.sourceType]?.label ?? r.sourceType} · {r.sourceLabel}</span>
                    <span className="ml-auto text-[11px] text-slate-600">{fmtDate(r.publishedAt)}</span>
                  </div>
                  {r.title && <p className="mt-1.5 text-sm font-medium text-slate-200">{r.title}</p>}
                  <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-slate-400">{r.content}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-600">
                    {r.author && <span>{r.author}</span>}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sky-400 hover:text-sky-300">
                        abrir <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-slate-700">
        <Link href="/impostazioni/fonti" className="hover:text-slate-500">Las fuentes de Escucha están aparte, en Ajustes → Fuentes.</Link>
      </p>
    </div>
  );
}
