import { Info } from 'lucide-react';
import { getMeta } from '@/lib/db';
import {
  CONNECTORS, SOURCE_CATEGORY, CATEGORY_ORDER, CATEGORY_LABEL, type SourceCategory,
} from '@/lib/connectors';
import { getConnectorCredStatuses, hydrateConnectorCredentials, type ConnectorCredStatus } from '@/lib/connector-credentials';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { ConnectorKeys } from '@/components/connector-keys';
import { PageHeader, fmtDate } from '@/components/ui';
import { getT } from '@/lib/i18n';
import type { SourceStatus } from '@/lib/ingest';
import { getDisabledConnectors } from '@/lib/source-toggles';
import { toggleConnectorAction } from './actions';

export const metadata = { title: 'Fuentes' };

// What each source is and what data Radar collects from it: shown in the hover tooltip.
const SOURCE_INFO: Record<string, string> = {
  web: 'Blogs, portales locales, foros, sitios de reseñas (TripAdvisor) y medios pequeños que Google News no indexa, encontrados con el buscador de Tavily. Usa la misma clave gratuita de "LinkedIn (web)" (1.000 búsquedas/mes, compartidas). Excluye las redes sociales, que tienen sus propias fuentes.',
  googlenews: 'El agregador de noticias de Google. Recopila artículos públicos de miles de medios que coinciden con tus palabras clave, con título, medio y fecha. Ideal para la cobertura de la prensa tradicional.',
  gdelt: 'Índice global de noticias en más de 65 idiomas (más de 100.000 medios en todo el mundo). Recopila artículos internacionales por palabra clave: perfecto para monitoreo multilingüe y entre países.',
  reddit: 'Discusiones públicas de subreddits. Recopila publicaciones y comentarios que citan tus términos, con votos y la comunidad a la que pertenecen. Excelente para opiniones y sentimiento sin filtro.',
  bluesky: 'Red social abierta (AT Protocol). Recopila publicaciones públicas por palabra clave, con autor e interacciones. Buena para conversaciones de tecnología y early adopters.',
  mastodon: 'Red social federada. Recopila publicaciones públicas (toots) de instancias que mencionan tus términos, con autor y engagement.',
  hackernews: 'La comunidad tecnológica de Y Combinator. Recopila historias y comentarios que citan tus términos, con puntaje y discusión. Excelente para temas de tecnología y startups.',
  youtube: 'Videos públicos de YouTube. Recopila videos por palabra clave con título, canal, fecha y vistas. Requiere una clave gratuita de Google.',
  telegram: 'Solo los canales públicos que elijas (configúralos en el proyecto): AEDO lee los mensajes de esos canales. No busca en todo Telegram.',
  rss: 'Cualquier sitio, blog o medio que ofrezca un feed RSS/Atom. Agrega las URL en el proyecto y AEDO recopila sus artículos automáticamente. Feeds ilimitados.',
  x: 'Publicaciones públicas de X (Twitter) en tiempo real por palabra clave, con autor, hashtags y engagement (likes, reposts, respuestas). Requiere una API paga (plan Basic).',
  instagram: 'Búsqueda por hashtag mediante la Meta Graph API: recopila publicaciones públicas que usan los hashtags asociados a tus palabras clave, con autor e interacciones. Requiere una cuenta Business + una app de Meta.',
  facebook: 'Publicaciones de las páginas que vinculas a tu token (modelo de lista de seguimiento), no de todo Facebook. Recopila las publicaciones de esas páginas con reacciones, comentarios y compartidos.',
  tiktok: 'Videos públicos mediante la Research API (sujeta a aprobación de TikTok). Recopila videos por palabra clave con descripción, hashtags y métricas (likes, comentarios, vistas).',
  linkedin: 'Publicaciones de tu página de empresa mediante la API oficial de LinkedIn (texto completo, métricas reales). LinkedIn no permite búsquedas públicas de terceros, así que esto cubre SOLO tu organización; para las publicaciones públicas de los demás, consulta "LinkedIn (web)".',
  linkedin_web: 'Publicaciones y artículos públicos de LinkedIn de CUALQUIER autor, encontrados mediante el índice de búsqueda de Tavily (API oficial, 1.000 búsquedas gratis/mes). Un modelo de obtención distinto al de "LinkedIn (page)": obtienes fragmentos parciales con enlace al original, pero sin métricas de engagement. Legal: consulta a Tavily, nunca a los servidores de LinkedIn.',
  newsapi: 'Agregador de ~150.000 medios con búsqueda booleana en texto completo. Recopila artículos mediante consultas avanzadas: una alternativa premium a GDELT/Google News. Requiere una clave de API.',
  stackexchange: 'Preguntas (por título, no texto completo) de Stack Overflow y otras 5 comunidades de Stack Exchange: finanzas, trabajo, viajes, crianza e informática general (Super User). Funciona de inmediato, sin clave; la cuota anónima compartida es baja, así que configura STACK_EXCHANGE_KEY (gratis, en stackapps.com) como variable de entorno si necesitas más volumen.',
  github: 'Issues y pull requests cuyo título coincide con tus términos, en todo GitHub público, con el texto real del issue y no solo el título. Se filtran los issues automáticos de bots (registros de cambios, resúmenes programados). Funciona de inmediato, sin clave; el límite de búsqueda sin autenticación de GitHub es estricto (10 solicitudes/minuto), así que configura GITHUB_TOKEN (un token de acceso personal gratuito) como variable de entorno si necesitas más volumen.',
  discord: 'Mensajes de los canales de un servidor de Discord que administras, mediante tu propio bot (modelo de lista de seguimiento, como Facebook); Discord no ofrece búsqueda en otros servidores. Requiere un bot gratuito invitado a tu servidor, con el Message Content Intent activado en el Developer Portal.',
  'sec-edgar': 'Reportes regulatorios de cualquier empresa listada en EE. UU. que coincidan con tus términos: eventos relevantes 8-K, informes 10-K/10-Q, declaraciones DEF 14A. Gratis, sin clave: datos oficiales del gobierno de EE. UU. (SEC.gov); no cubre otros mercados. La búsqueda solo devuelve metadatos del reporte, no el texto, así que cada registro muestra la empresa, el tipo de reporte y la descripción del anexo con un enlace para leer el original.',
  arxiv: 'Artículos académicos (ciencias de la computación, física, matemáticas, biología cuantitativa y más) que coinciden con tus términos, con el resumen completo incluido; API oficial gratuita, sin clave. La búsqueda de arXiv aplica una lematización ligera, así que aquí se vuelve a verificar que cada resultado tenga una coincidencia literal antes de conservarlo.',
};

export default async function FontiPage() {
  const t = await getT();
  // Hydrate saved keys before reading the "active" status of the connectors.
  await hydrateConnectorCredentials();
  const [sourceStatus, credStatuses, currentUser, disabled] = await Promise.all([
    getMeta<SourceStatus>('source_status'), getConnectorCredStatuses(), getCurrentUser(), getDisabledConnectors(),
  ]);
  const canEditKeys = isAdmin(currentUser);

  return (
    <>
      <PageHeader
        title={t('page.sources.title', 'Fuentes')}
        subtitle="Estado de las fuentes de escucha y sus claves de API. El gasto y el presupuesto de IA están en la pestaña Presupuesto."
      />

      <div className="max-w-3xl">
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Estado de las fuentes</h2>

          <TierSection
            heading="Gratis" headingClass="text-emerald-400/80"
            connectors={CONNECTORS.filter((c) => c.tier === 'free')}
            sourceStatus={sourceStatus} credStatuses={credStatuses} canEditKeys={canEditKeys} showKeys={false} disabled={disabled}
          />
          <TierSection
            heading="Gratis · requiere una clave gratuita" headingClass="text-sky-400/80"
            description="Gratis, pero debes registrar una clave de API gratuita en el servicio. Ingrésala aquí: la fuente se activa de inmediato."
            connectors={CONNECTORS.filter((c) => c.tier === 'freekey')}
            sourceStatus={sourceStatus} credStatuses={credStatuses} canEditKeys={canEditKeys} showKeys disabled={disabled}
          />
          <TierSection
            heading="Premium — pagas" headingClass="text-amber-400/80"
            description={<>Los conectores están listos: ingresa aquí tus claves de API, sin tocar código. Se activan de inmediato y aplican a toda la cuenta.
              Su costo lo factura cada proveedor; consulta la pestaña <span className="text-slate-400">Presupuesto</span>.</>}
            connectors={CONNECTORS.filter((c) => c.tier === 'premium')}
            sourceStatus={sourceStatus} credStatuses={credStatuses} canEditKeys={canEditKeys} showKeys disabled={disabled}
          />
        </section>
      </div>
    </>
  );
}

/**
 * Un livello (gratis / gratis con chiave / a pagamento), suddiviso per
 * categoria tematica al suo interno. Le tre sezioni della pagina erano
 * identiche a parte lo "showKeys": tenerle come un unico componente evita
 * di ripetere tre volte la stessa logica di raggruppamento.
 */
function TierSection({ heading, headingClass, description, connectors, sourceStatus, credStatuses, canEditKeys, showKeys, disabled }: {
  heading: string; headingClass: string; description?: React.ReactNode;
  connectors: (typeof CONNECTORS)[number][];
  sourceStatus?: SourceStatus | null; credStatuses: Record<string, ConnectorCredStatus>;
  canEditKeys: boolean; showKeys: boolean; disabled: Set<string>;
}) {
  if (connectors.length === 0) return null;
  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, items: connectors.filter((c) => (SOURCE_CATEGORY[c.id] as SourceCategory | undefined) === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mt-4 first:mt-0">
      <p className={`mb-2 text-[10px] font-semibold uppercase tracking-widest ${headingClass}`}>{heading}</p>
      {description && <p className="mb-2 text-[11px] text-slate-600">{description}</p>}
      <div className="flex flex-col gap-3">
        {byCategory.map(({ cat, items }) => (
          <div key={cat}>
            {byCategory.length > 1 && (
              <p className="mb-1.5 text-[10px] font-medium text-slate-600">{CATEGORY_LABEL[cat]}</p>
            )}
            <div className="flex flex-col gap-2">
              {items.map((c) => (
                <div key={c.id}>
                  <SourceRow c={c} st={sourceStatus?.[c.id]} off={disabled.has(c.id)} canEdit={canEditKeys} />
                  {showKeys && canEditKeys && credStatuses[c.id] && (
                    <ConnectorKeys connectorId={c.id} fields={credStatuses[c.id].fields} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Status row for a source: dot, name, last-collection outcome. */
function SourceRow({ c, st, off, canEdit }: {
  c: (typeof CONNECTORS)[number];
  st?: SourceStatus[string];
  off: boolean; canEdit: boolean;
}) {
  const enabled = c.enabled();
  // Amber = temporary hiccup (last run failed but it collected within the last
  // 24h, typical of GDELT's shared rate limit); red = genuinely down.
  const recentOk = st?.lastOkAt && Date.now() - new Date(st.lastOkAt).getTime() < 24 * 3600_000;
  const dot = off
    ? 'bg-slate-600'
    : !enabled
    ? 'bg-red-400/70'
    : st?.ok === false
      ? (recentOk ? 'bg-amber-400' : 'bg-red-400')
      : 'bg-emerald-400';
  const info = SOURCE_INFO[c.id];
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} />
      <span className="group relative flex w-32 shrink-0 items-center gap-1">
        <span className="truncate">{c.label}</span>
        {info && (
          <>
            <Info className="size-3 shrink-0 cursor-help text-slate-600 transition group-hover:text-sky-400" />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden w-64 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-[11px] font-normal leading-relaxed text-slate-300 shadow-xl group-hover:block"
            >
              <span className="mb-1 block font-semibold text-slate-100">{c.label}</span>
              {info}
            </span>
          </>
        )}
      </span>
      <span className="truncate text-xs text-slate-500" title={!enabled ? c.disabledReason : st?.ok === false ? st.error : undefined}>
        {off
          ? 'apagada: no se consulta en las ejecuciones'
          : !enabled
          ? c.disabledReason
          : st
            ? st.ok
              ? `${st.count} nuevas · ${fmtDate(st.at)}`
              : recentOk
                ? `no disponible temporalmente · última recopilación exitosa ${fmtDate(st.lastOkAt!)}`
                : `error: ${st.error}`
            : 'pendiente de la primera recopilación'}
      </span>
      {canEdit && (
        <form action={toggleConnectorAction} className="ml-auto shrink-0">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="off" value={off ? '0' : '1'} />
          <button type="submit" className="rounded border border-[var(--border)] px-2 py-0.5 text-[11px] text-slate-400 transition hover:border-sky-500/60 hover:text-sky-300">
            {off ? 'Encender' : 'Apagar'}
          </button>
        </form>
      )}
    </div>
  );
}
