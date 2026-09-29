import Link from 'next/link';
import { Plus, Trash2, Link2, Star, Radar, UploadCloud, Antenna } from 'lucide-react';
import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { shareLinks } from '@/lib/db/schema';
import { CopyButton } from '@/components/copy-button';
import { DeleteProject } from '@/components/delete-project';
import { SubmitButton } from '@/components/submit-button';
import { getBenchmarkEntities, getCurrentProject, getProjects } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import type { projects as projectsTable } from '@/lib/db/schema';
import { EditableEntity } from '@/components/editable-entity';
import {
  addEntity, createProject, createImportProject, createTalkwalkerProject, createShareLink, deleteEntity,
  revokeShareLink, setOwnBrand, updateEntity, updateProject, updateImportProject,
  updateTalkwalkerProject,
} from './actions';
import { listTalkwalkerTopics } from '@/lib/connectors/talkwalker';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';

type Project = typeof projectsTable.$inferSelect;

const LANGS = [
  ['it', 'Italiano'], ['en', 'Inglés'], ['es', 'Español'],
  ['fr', 'Francés'], ['de', 'Alemán'], ['pt', 'Portugués'],
] as const;

const COUNTRIES = [
  ['IT', 'Italia'], ['US', 'Estados Unidos'], ['GB', 'Reino Unido'], ['FR', 'Francia'],
  ['DE', 'Alemania'], ['ES', 'España'], ['BR', 'Brasil'], ['MX', 'México'],
  ['CA', 'Canadá'], ['AU', 'Australia'], ['IN', 'India'], ['NL', 'Países Bajos'],
  ['PL', 'Polonia'], ['JP', 'Japón'],
] as const;

const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none placeholder:text-slate-600';
const btnCls = 'rounded-lg bg-sky-500/90 px-5 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400';

export const metadata = { title: 'Proyectos' };

export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const sp = await searchParams;
  const [allProjects, current] = await Promise.all([getProjects(), getCurrentProject()]);
  if (allProjects.length === 0) return <EmptyState message="No hay proyectos." />;

  const isNew = sp.p === 'new';
  const newType = sp.type; // 'listening' | 'import' | 'talkwalker' | undefined (chooser)
  const selected = isNew
    ? null
    : allProjects.find((p) => p.id === Number(sp.p)) ?? current ?? allProjects[0];
  const entities = selected ? await getBenchmarkEntities(selected.id) : [];

  // I topic si leggono da Talkwalker solo quando servono davvero: chiamata
  // gratuita ma con rate limit stretto (20/min), e un errore qui non deve
  // impedire di aprire le impostazioni — si mostra il motivo e si va avanti.
  let twTopics: { id: string; label: string }[] = [];
  let twTopicsError: string | null = null;
  if (selected?.mode === 'talkwalker' && selected.talkwalkerProject) {
    try {
      await hydrateConnectorCredentials();
      twTopics = await listTalkwalkerTopics(selected.talkwalkerProject);
    } catch (e) {
      twTopicsError = (e as Error).message;
    }
  }
  const db = await getDb();
  const activeShares = selected
    ? await db.select().from(shareLinks)
      .where(and(eq(shareLinks.projectId, selected.id), gte(shareLinks.expiresAt, new Date())))
    : [];
  const shareBase = process.env.APP_URL ?? '';

  return (
    <>
      <PageHeader
        title={t('page.settings.title', 'Proyectos')}
        subtitle="Cada proyecto es un ámbito de escucha independiente: consulta, idiomas, geografías y entidades para comparar"
      />

      {/* Project tabs */}
      <div className="mb-0 flex flex-wrap items-end gap-1 border-b border-[var(--border)]">
        {allProjects.map((p) => {
          const active = !isNew && selected?.id === p.id;
          return (
            <Link
              key={p.id}
              href={`/settings?p=${p.id}`}
              className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm transition ${
                active
                  ? 'border-[var(--border)] bg-[var(--panel)] font-medium text-sky-300'
                  : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              {p.name}
            </Link>
          );
        })}
        <Link
          href="/settings?p=new"
          className={`flex items-center gap-1.5 rounded-t-lg border border-b-0 px-4 py-2 text-sm transition ${
            isNew
              ? 'border-[var(--border)] bg-[var(--panel)] font-medium text-sky-300'
              : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <Plus className="size-4" /> Nuevo proyecto
        </Link>
      </div>

      <div className="mx-auto max-w-3xl">
        <div>
          {/* key legata al progetto: forza il remount dei campi (defaultValue) quando
              si cambia scheda, altrimenti gli input non controllati restano coi valori vecchi. */}
          <section key={isNew ? `new-${newType ?? 'choose'}` : selected?.id ?? 'none'} className="panel rounded-t-none border-t-0 px-5 py-5">
            {isNew ? (
              !newType ? (
                /* Passo 0: che tipo di progetto? */
                <div>
                  <h2 className="mb-3 text-sm font-semibold text-slate-300">¿Qué tipo de proyecto?</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Link href="/settings?p=new&type=listening"
                      className="group flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-white/[0.02] px-4 py-4 transition hover:border-sky-500/50 hover:bg-sky-500/[0.05]">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Radar className="size-4 text-sky-400" /> Escucha</span>
                      <span className="text-xs leading-snug text-slate-400">AEDO recopila menciones automáticamente de la web: noticias, redes sociales, RSS. Tú defines las palabras clave y las fuentes.</span>
                    </Link>
                    <Link href="/settings?p=new&type=import"
                      className="group flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-white/[0.02] px-4 py-4 transition hover:border-sky-500/50 hover:bg-sky-500/[0.05]">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-100"><UploadCloud className="size-4 text-sky-400" /> Importar archivo</span>
                      <span className="text-xs leading-snug text-slate-400">Trae tus propios datos desde un archivo Excel o CSV: encuestas, exportaciones. AEDO los analiza igual. Sin scraping.</span>
                    </Link>
                    <Link href="/settings?p=new&type=talkwalker"
                      className="group flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-white/[0.02] px-4 py-4 transition hover:border-teal-500/50 hover:bg-teal-500/[0.05]">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Antenna className="size-4 text-teal-400" /> Talkwalker</span>
                      <span className="text-xs leading-snug text-slate-400">Lee menciones en vivo desde tu cuenta corporativa de Talkwalker mediante su API. Sin scraping ni archivos, y consume créditos de Talkwalker.</span>
                    </Link>
                  </div>
                </div>
              ) : newType === 'talkwalker' ? (
                <form action={createTalkwalkerProject} className="flex flex-col gap-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300"><Antenna className="size-4 text-teal-400" /> Nuevo proyecto de Talkwalker</h2>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Aquí no hay palabras clave: la búsqueda ya está escrita en Talkwalker. Indica el proyecto y AEDO toma lo que este recopila, incluidas las etiquetas y correcciones hechas allá.
                  </p>
                  <TalkwalkerFields project={null} topics={[]} topicsError={null} />
                  <TalkwalkerNotice />
                  <p className="text-xs text-slate-500">Una vez creado, puedes limitarlo a temas específicos de ese proyecto de Talkwalker.</p>
                  <div className="mt-2 flex items-center gap-3 border-t border-[var(--border)] pt-4">
                    <SubmitButton className={btnCls} pendingLabel="Creando proyecto…">Crear y construir las consultas →</SubmitButton>
                    <Link href="/settings?p=new" className="text-xs text-slate-500 hover:text-slate-300">← volver</Link>
                  </div>
                </form>
              ) : newType === 'import' ? (
                <form action={createImportProject} className="flex flex-col gap-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300"><UploadCloud className="size-4 text-sky-400" /> Nuevo proyecto de importación</h2>
                  <label className="text-xs text-slate-400">
                    Nombre del proyecto
                    <input name="name" className={`${inputCls} mt-1`} placeholder="p. ej., Exportaciones de encuestas T2" required />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" name="shared" className="accent-sky-500" />
                    Compartir este proyecto con todo el equipo (solo lectura para los demás)
                  </label>
                  <p className="text-xs text-slate-500">Luego subirás un archivo Excel/CSV y asignarás sus columnas a los campos de AEDO.</p>
                  <div className="mt-2 flex items-center gap-3 border-t border-[var(--border)] pt-4">
                    <SubmitButton className={btnCls} pendingLabel="Creando…">Crear y subir archivo</SubmitButton>
                    <Link href="/settings?p=new" className="text-xs text-slate-500 hover:text-slate-300">← volver</Link>
                  </div>
                </form>
              ) : (
                <form action={createProject} className="flex flex-col gap-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300"><Radar className="size-4 text-sky-400" /> Nuevo proyecto de escucha</h2>
                  <ProjectFields project={null} />
                  <div className="mt-2 flex items-center gap-3 border-t border-[var(--border)] pt-4">
                    <SubmitButton className={btnCls} pendingLabel="Creando proyecto…">Crear y construir las consultas →</SubmitButton>
                    <Link href="/settings?p=new" className="text-xs text-slate-500 hover:text-slate-300">← volver</Link>
                  </div>
                </form>
              )
            ) : selected && (
              <>
                {selected.mode === 'talkwalker' ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-teal-500/25 bg-teal-500/[0.05] px-4 py-3">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-teal-200"><Antenna className="size-4" /> Proyecto de Talkwalker</span>
                      <span className="text-xs text-slate-400">— las menciones vienen de la API corporativa de Talkwalker. No se consulta ninguna otra fuente.</span>
                    </div>
                    <form action={updateTalkwalkerProject} className="flex flex-col gap-4">
                      <input type="hidden" name="id" value={selected.id} />
                      <TalkwalkerFields project={selected} topics={twTopics} topicsError={twTopicsError} />
                      <TalkwalkerNotice />
                      <div className="mt-2 border-t border-[var(--border)] pt-4">
                        <SubmitButton className={btnCls} pendingLabel="Guardando…">Guardar cambios</SubmitButton>
                      </div>
                    </form>
                  </>
                ) : selected.mode === 'upload' ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.05] px-4 py-3">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-sky-200"><UploadCloud className="size-4" /> Proyecto de importación</span>
                      <span className="text-xs text-slate-400">— los datos vienen de archivos que subes, no de scraping.</span>
                      <Link href={`/import?project=${selected.id}`}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-sky-400">
                        <UploadCloud className="size-3.5" /> Importar un archivo
                      </Link>
                    </div>
                    <form action={updateImportProject} className="flex flex-col gap-4">
                      <input type="hidden" name="id" value={selected.id} />
                      <label className="text-xs text-slate-400">
                        Nombre del proyecto
                        <input name="name" defaultValue={selected.name} className={`${inputCls} mt-1`} required />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" name="shared" defaultChecked={selected.visibility === 'shared'} className="accent-sky-500" />
                        Compartir este proyecto con todo el equipo (solo lectura para los demás)
                      </label>
                      <div className="mt-2 border-t border-[var(--border)] pt-4">
                        <SubmitButton className={btnCls} pendingLabel="Guardando…">Guardar cambios</SubmitButton>
                      </div>
                    </form>
                  </>
                ) : (
                  <form action={updateProject} className="flex flex-col gap-4">
                    <input type="hidden" name="id" value={selected.id} />
                    <ProjectFields project={selected} />
                    <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
                      <SubmitButton className={btnCls} pendingLabel="Guardando…">Guardar cambios</SubmitButton>
                    </div>
                  </form>
                )}

                <hr className="my-5 border-[var(--border)]" />

                <h3 className="mb-1 text-sm font-semibold text-slate-300">Entidades de benchmark</h3>
                <p className="mb-3 text-xs text-slate-500">
                  Marcas o competidores para comparar en la página Benchmark: las menciones que citan estas palabras clave se atribuyen a la entidad.
                  Al guardar un plan de consultas se actualizan aquí automáticamente el sujeto y los competidores; las demás quedan como están.
                  Marca una con la <Star className="inline size-3 -translate-y-px text-amber-400" /> para definirla como <span className="text-amber-300">tu marca</span>:
                  así se activa el Índice de salud de marca (tu marca vs. el mercado y los competidores).
                </p>
                <div className="flex flex-col gap-2">
                  {entities.map((e) => (
                    <EditableEntity
                      key={e.id} entity={e} projectId={selected.id} inputCls={inputCls}
                      updateEntity={updateEntity} setOwnBrand={setOwnBrand} deleteEntity={deleteEntity}
                    />
                  ))}
                  {entities.length === 0 && (
                    <p className="text-xs text-slate-600">No hay entidades: agrega una para usar Benchmark.</p>
                  )}
                </div>
                <form action={addEntity} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="projectId" value={selected.id} />
                  <input name="name" placeholder="Nombre de la entidad" className={inputCls} required />
                  <input name="keywords" placeholder="palabras clave asociadas (opcional)" className={inputCls} />
                  <SubmitButton pendingLabel="Agregando…"
                    className="shrink-0 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
                    Agregar
                  </SubmitButton>
                </form>

                <hr className="my-5 border-[var(--border)]" />

                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Link2 className="size-4 text-sky-400" /> Compartir
                </h3>
                <p className="mb-3 text-xs text-slate-500">
                  Crea un enlace de solo lectura para mostrar el informe a directivos o clientes sin compartir la contraseña. Vence automáticamente.
                </p>
                <div className="flex flex-col gap-2">
                  {activeShares.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
                      <code className="truncate text-sky-300">{shareBase ? `${shareBase}/share/${s.token}` : `/share/${s.token}`}</code>
                      <span className="text-slate-500">vence el {s.expiresAt.toLocaleDateString('es-CO')}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <CopyButton text={shareBase ? `${shareBase}/share/${s.token}` : `/share/${s.token}`} />
                        <form action={revokeShareLink}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="rounded-md px-2 py-1 text-red-400/80 hover:bg-red-500/10">revocar</button>
                        </form>
                      </span>
                    </div>
                  ))}
                  {activeShares.length === 0 && (
                    <p className="text-xs text-slate-600">No hay enlaces activos.</p>
                  )}
                </div>
                <form action={createShareLink} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="projectId" value={selected.id} />
                  <select name="days" defaultValue="7"
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-sm outline-none">
                    <option value="1">1 día</option>
                    <option value="7">7 días</option>
                    <option value="30">30 días</option>
                  </select>
                  <SubmitButton pendingLabel="Creando enlace…"
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
                    Crear enlace para compartir
                  </SubmitButton>
                </form>

                {allProjects.length > 1 && (
                  <div className="mt-6 border-t border-red-500/20 pt-4">
                    <DeleteProject id={selected.id} name={selected.name} />
                  </div>
                )}
              </>
            )}
          </section>
          <p className="mt-2 px-1 text-[11px] text-slate-600">
            Nota: cada proyecto activo consume cuota de API en cada actualización; con el presupuesto actual, mantén pocos.
            El estado de las fuentes y el presupuesto ahora están en <span className="text-slate-400">Configuración → Fuentes y presupuesto</span>.
          </p>
        </div>
      </div>
    </>
  );
}

/** Project fields, shared between create and edit. */
/**
 * I campi di un progetto Talkwalker: da dove prendere i dati, non cosa cercare.
 *
 * I topic sono quelli già configurati in Talkwalker, letti dalla sua Resources
 * API: si spuntano, non si scrivono. Nessuna spunta = tutto quello che il
 * progetto raccoglie, che è il caso di chi vuole i dati prima delle domande.
 */
function TalkwalkerFields({ project, topics, topicsError }: {
  project: Project | null;
  topics: { id: string; label: string }[];
  topicsError: string | null;
}) {
  const chosen = new Set(project?.talkwalkerTopics ?? []);
  return (
    <>
      <label className="text-xs text-slate-400">
        Nombre del proyecto (en AEDO)
        <input name="name" defaultValue={project?.name} className={`${inputCls} mt-1`}
          placeholder="p. ej., Reputación corporativa" required />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" name="shared" defaultChecked={project?.visibility === 'shared'} className="accent-sky-500" />
        Compartir este proyecto con todo el equipo (solo lectura para los demás)
      </label>
      <label className="text-xs text-slate-400">
        ID del proyecto de Talkwalker
        <input name="talkwalkerProject" defaultValue={project?.talkwalkerProject ?? ''}
          className={`${inputCls} mt-1`} placeholder="p. ej., kpnutesu_123456" required />
        <span className="mt-1 block text-[11px] text-slate-500">
          Pídeselo a tu CSM o tómalo de la URL del proyecto dentro de Talkwalker.
        </span>
      </label>

      {project && (
      <fieldset className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/40 px-4 py-3">
        <legend className="px-1 text-xs text-slate-400">De dónde vienen los datos</legend>
        {topics.length > 0 ? (
          <>
            <p className="mb-2 text-[11px] text-slate-500">
              Temas configurados en ese proyecto de Talkwalker. <strong>No marques ninguno para tomar todo</strong> lo que recopila; siempre puedes acotarlo después.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {topics.map((t) => (
                <label key={t.id} className="flex items-center gap-1.5 text-sm text-slate-300">
                  <input type="checkbox" name="talkwalkerTopics" value={t.id}
                    defaultChecked={chosen.has(t.id)} className="accent-teal-500" />
                  <span className="truncate" title={t.label}>{t.label}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] leading-relaxed text-slate-500">
            {topicsError
              ? `No se pudieron leer los temas de Talkwalker: ${topicsError}. AEDO tomará todo lo que recopila el proyecto.`
              : 'Cuando configures el token, aquí aparecerán para marcar los temas de este proyecto de Talkwalker. Mientras tanto, AEDO toma todo lo que recopila el proyecto.'}
          </p>
        )}
      </fieldset>
      )}

      <label className="text-xs text-slate-400">
        <span className="text-violet-300">✨ Descripción del tema</span> — opcional: no cambia lo que se obtiene, orienta las estrellas de relevancia de la IA
        <textarea name="semanticContext" defaultValue={project?.semanticContext ?? ''} rows={2}
          className={`${inputCls} mt-1 resize-y`}
          placeholder="p. ej., Reputación del grupo en seguros y movilidad" />
      </label>
    </>
  );
}

/** Il costo non è un dettaglio da nascondere: si spendono soldi del contratto. */
function TalkwalkerNotice() {
  return (
    <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
      Cada actualización hace una búsqueda en Talkwalker por cada bloque de 40 palabras clave: <strong>10 créditos por llamada más 1 por resultado</strong>, descontados de tu contrato de Talkwalker. El token se configura en Configuración → Fuentes.
    </p>
  );
}

function ProjectFields({ project }: { project: Project | null }) {
  return (
    <>
      <label className="text-xs text-slate-400">
        Nombre del proyecto
        <input name="name" defaultValue={project?.name} className={`${inputCls} mt-1`}
          placeholder="p. ej., Energías renovables" required />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" name="shared" defaultChecked={project?.visibility === 'shared'} className="accent-sky-500" />
        Compartir este proyecto con todo el equipo (solo lectura para los demás)
      </label>
      {project ? (
        // La query non si scrive più qui: ha una pagina sua, dove si
        // costruisce a parole, si prova e si modifica.
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.05] px-4 py-3">
          <div className="min-w-0 flex-1 text-xs text-slate-300">
            <p className="font-medium text-sky-200">Qué escucha este proyecto</p>
            <p className="mt-0.5 text-slate-400">
              {project.queryPlan
                ? `${project.queryPlan.queries.filter((q) => q.enabled).length} consultas activas construidas a partir de: “${project.queryPlan.brief.slice(0, 140)}${project.queryPlan.brief.length > 140 ? '…' : ''}”`
                : project.keywords.length
                  ? `Consulta antigua (${project.keywords.slice(0, 4).join(', ')}${project.keywords.length > 4 ? '…' : ''}). Abre el constructor de consultas para convertirla en bloques.`
                  : 'Todavía no hay consulta: el proyecto no recopila nada hasta que construyas una.'}
            </p>
          </div>
          <Link href={`/query?project=${project.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-sky-400">
            Abrir el constructor de consultas
          </Link>
        </div>
      ) : (
        <label className="text-xs text-slate-400">
          <span className="text-sky-300">¿Qué quieres monitorear?</span> — con tus propias palabras; en el siguiente paso, AEDO lo convierte en consultas que puedes probar y editar
          <textarea name="semanticContext" rows={3}
            className={`${inputCls} mt-1 resize-y`}
            placeholder="p. ej., La empresa Acme en relación con protestas de trabajadores, y sus competidores Alfa, Beta y Gamma" />
        </label>
      )}
      <fieldset className="text-xs text-slate-400">
        Idiomas (ediciones de noticias y búsqueda)
        <div className="mt-1.5 flex flex-wrap gap-3">
          {LANGS.map(([code, label]) => (
            <label key={code} className="flex items-center gap-1.5 text-sm text-slate-300">
              <input type="checkbox" name="languages" value={code}
                defaultChecked={project ? project.languages.includes(code) : code === 'it' || code === 'en'}
                className="accent-sky-500" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="text-xs text-slate-400">
        Geografías (aplica a las fuentes de noticias; sin selección = todo el mundo)
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4">
          {COUNTRIES.map(([code, label]) => (
            <label key={code} className="flex items-center gap-1.5 text-sm text-slate-300">
              <input type="checkbox" name="countries" value={code}
                defaultChecked={(project?.countries ?? []).includes(code)} className="accent-sky-500" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-xs text-slate-400">
        Canales de Telegram a seguir (nombres de usuario separados por comas, p. ej., @reuters)
        <input name="telegramChannels" defaultValue={(project?.telegramChannels ?? []).map((c) => `@${c}`).join(', ')}
          className={`${inputCls} mt-1`} placeholder="p. ej., @canal1, @canal2 (opcional)" />
      </label>
      <label className="text-xs text-slate-400">
        Feeds RSS/Atom a seguir (URL separadas por comas o saltos de línea): medios, blogs, Google Alerts…
        <textarea name="rssFeeds" defaultValue={(project?.rssFeeds ?? []).join('\n')} rows={2}
          className={`${inputCls} mt-1 resize-y`}
          placeholder="p. ej., https://example.com/feed.xml (opcional, máx. 15)" />
      </label>
      <label className="text-xs text-slate-400">
        Tono de voz de la marca: Content Studio lo usa para escribir borradores
        <textarea name="brandVoice" defaultValue={project?.brandVoice ?? ''} rows={2}
          className={`${inputCls} mt-1 resize-y`}
          placeholder="p. ej., Profesional pero directo, cercano, sin jerga innecesaria (opcional)" />
      </label>
    </>
  );
}
