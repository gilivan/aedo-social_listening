import { Globe2 } from 'lucide-react';
import { PROJECT_COUNTRIES, countryLabel } from '@/lib/project-countries';
import { saveCountriesAction } from '@/app/query/actions';
import { SubmitButton } from '@/components/submit-button';

/**
 * País de la búsqueda, visible en Consultas. Por defecto Colombia.
 * Se aplica a las fuentes que filtran por país (Google News, GDELT, NewsAPI,
 * NewsData) y se le entrega a la IA cuando arma la consulta. Las redes
 * sociales abiertas (Bluesky, Mastodon, Reddit…) no filtran por país: ahí
 * pesan el idioma y los términos de contexto de la consulta.
 */
export function CountryPicker({ projectId, countries }: { projectId: number; countries: string[] }) {
  const worldwide = countries.length === 0;
  const summary = worldwide ? 'Todo el mundo (sin filtro de país)' : countries.map(countryLabel).join(', ');
  return (
    <details className="panel mb-4 px-5 py-3" open={false}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm text-slate-300">
        <Globe2 className="size-4 text-sky-400" />
        <span className="font-semibold">País de la búsqueda:</span>
        <span className={worldwide ? 'text-amber-300' : 'text-sky-300'}>{summary}</span>
        <span className="ml-auto text-xs text-slate-500 underline">cambiar</span>
      </summary>
      <form action={saveCountriesAction} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="projectId" value={projectId} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4 lg:grid-cols-5">
          {PROJECT_COUNTRIES.map(([code, label]) => (
            <label key={code} className="flex items-center gap-1.5 text-sm text-slate-300">
              <input type="checkbox" name="countries" value={code} defaultChecked={countries.includes(code)} className="accent-sky-500" />
              {label}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-400">
          <input type="checkbox" name="worldwide" defaultChecked={worldwide} className="accent-amber-500" />
          Todo el mundo (ignora los países marcados)
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Guardando…"
            className="rounded-lg bg-sky-500/90 px-4 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400">
            Guardar países
          </SubmitButton>
          <p className="text-[11px] text-slate-500">
            Sin ningún país marcado se usa Colombia. Filtra las fuentes de noticias (Google News, GDELT, NewsAPI, NewsData)
            y orienta a la IA al armar la consulta; las redes abiertas (Bluesky, Mastodon, Reddit) no filtran por país.
            Después de cambiarlo, vuelve a generar la propuesta de consulta para que tenga en cuenta el país.
          </p>
        </div>
      </form>
    </details>
  );
}
