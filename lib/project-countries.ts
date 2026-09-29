// Países que se pueden elegir para un proyecto de escucha.
// AEDO trabaja para marcas colombianas: Colombia y Latinoamérica van primero
// y Colombia es el país por defecto de todo proyecto nuevo.

export const PROJECT_COUNTRIES = [
  ['CO', 'Colombia'], ['AR', 'Argentina'], ['CL', 'Chile'], ['PE', 'Perú'], ['EC', 'Ecuador'], ['PA', 'Panamá'],
  ['MX', 'México'], ['US', 'Estados Unidos'], ['ES', 'España'], ['BR', 'Brasil'],
  ['IT', 'Italia'], ['GB', 'Reino Unido'], ['FR', 'Francia'], ['DE', 'Alemania'],
  ['CA', 'Canadá'], ['AU', 'Australia'], ['IN', 'India'], ['NL', 'Países Bajos'],
  ['PL', 'Polonia'], ['JP', 'Japón'],
] as const;

export const DEFAULT_COUNTRIES: string[] = ['CO'];
export const DEFAULT_LANGUAGES: string[] = ['es'];

const VALID = new Set<string>(PROJECT_COUNTRIES.map(([c]) => c));

/** Limpia una selección de países; vacía → Colombia (salvo que se pida "todo el mundo"). */
export function normalizeCountries(selected: string[], worldwide = false): string[] {
  if (worldwide) return [];
  const clean = [...new Set(selected.map((c) => c.toUpperCase()).filter((c) => VALID.has(c)))];
  return clean.length ? clean : DEFAULT_COUNTRIES;
}

export function countryLabel(code: string): string {
  return PROJECT_COUNTRIES.find(([c]) => c === code)?.[1] ?? code;
}
