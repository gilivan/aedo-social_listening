import { getMeta, setMeta } from '@/lib/db';

// AEDO — fuentes apagadas a mano desde Ajustes → Fuentes. Aplica a toda la
// cuenta. Por defecto se apagan las fuentes técnicas y académicas heredadas de
// Radar que no aportan a la escucha de marcas de consumo en Colombia y
// alargan cada ejecución.
const KEY = 'disabled_connectors';
export const DEFAULT_DISABLED = [
  'hackernews', 'stackexchange', 'github', 'sec-edgar', 'arxiv', 'lemmy', 'mastodon', 'podcastindex',
];

export async function getDisabledConnectors(): Promise<Set<string>> {
  return new Set((await getMeta<string[]>(KEY)) ?? DEFAULT_DISABLED);
}

export async function setConnectorDisabled(id: string, disabled: boolean): Promise<void> {
  const cur = await getDisabledConnectors();
  if (disabled) cur.add(id); else cur.delete(id);
  await setMeta(KEY, [...cur]);
}
