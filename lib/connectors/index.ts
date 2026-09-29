import type { Connector } from './types';
import { googleNews } from './googlenews';
import { gdelt } from './gdelt';
import { reddit } from './reddit';
import { bluesky } from './bluesky';
import { mastodon } from './mastodon';
import { hackerNews } from './hackernews';
import { youtube } from './youtube';
import { xTwitter } from './x';
import { telegram } from './telegram';
import { rss } from './rss';
import { instagram } from './instagram';
import { facebook } from './facebook';
import { tiktok } from './tiktok';
import { linkedin } from './linkedin';
import { linkedinWeb } from './linkedin-web';
import { newsapi } from './newsapi';
import { stackExchange } from './stackexchange';
import { github } from './github';
import { discord } from './discord';
import { secEdgar } from './sec-edgar';
import { arxiv } from './arxiv';
import { talkwalker } from './talkwalker';
import { lemmy } from './lemmy';
import { newsdata } from './newsdata';
import { podcastIndex } from './podcastindex';

export const CONNECTORS: Connector[] = [
  // Gratuite (alcune richiedono una chiave gratuita: reddit, youtube, discord)
  googleNews, gdelt, reddit, bluesky, mastodon, hackerNews, youtube, telegram, rss, linkedinWeb, stackExchange, github, discord, secEdgar, arxiv,
  lemmy, newsdata, podcastIndex,
  // Premium (si attivano con le chiavi API a pagamento)
  xTwitter, instagram, facebook, tiktok, linkedin, newsapi, talkwalker,
];

/**
 * Articolo di testata o post social?
 *
 * È la distinzione che separa una rassegna stampa dall'ascolto sociale: hanno
 * ritmi, autori e peso diversi, e vanno lette separate. Gli "upload" sono
 * ritagli stampa importati da file, quindi articoli.
 */
export type MentionKind = 'article' | 'post';
export const SOURCE_KIND: Record<string, MentionKind> = {
  googlenews: 'article', gdelt: 'article', newsapi: 'article', rss: 'article', upload: 'article', 'sec-edgar': 'article',
  reddit: 'post', bluesky: 'post', mastodon: 'post', hackernews: 'post', youtube: 'post',
  x: 'post', telegram: 'post', instagram: 'post', facebook: 'post', tiktok: 'post',
  linkedin: 'post', linkedin_web: 'post', stackexchange: 'post', github: 'post', discord: 'post',
  arxiv: 'article', talkwalker_news: 'article', talkwalker: 'post',
  lemmy: 'post', newsdata: 'article',
  // Un episodio è prodotto da una redazione, come un articolo: si legge con la
  // rassegna, non con i post.
  podcastindex: 'article',
};
/** Fonte sconosciuta: si presume post, la classe più prudente per il valore media. */
export const kindOf = (source: string): MentionKind => SOURCE_KIND[source] ?? 'post';

/**
 * Categoria tematica di una fonte — non ha effetto sui dati, serve solo a
 * organizzare la pagina Fonti: con 22 connettori un unico elenco piatto per
 * livello (gratis/gratis con chiave/a pagamento) è illeggibile.
 */
export type SourceCategory = 'general' | 'tech' | 'social' | 'video' | 'audio' | 'finance' | 'academic';
export const SOURCE_CATEGORY: Record<string, SourceCategory> = {
  googlenews: 'general', gdelt: 'general', newsapi: 'general', rss: 'general',
  hackernews: 'tech', stackexchange: 'tech', github: 'tech',
  reddit: 'social', bluesky: 'social', mastodon: 'social', x: 'social',
  instagram: 'social', facebook: 'social', tiktok: 'social', telegram: 'social',
  discord: 'social', linkedin: 'social', linkedin_web: 'social',
  youtube: 'video',
  'sec-edgar': 'finance',
  arxiv: 'academic', talkwalker: 'social', talkwalker_news: 'general',
  lemmy: 'social', newsdata: 'general', podcastindex: 'audio',
};
export const CATEGORY_ORDER: SourceCategory[] = ['general', 'finance', 'academic', 'tech', 'social', 'video', 'audio'];
export const CATEGORY_LABEL: Record<SourceCategory, string> = {
  general: 'Generales y noticias', finance: 'Finanzas y empresas', academic: 'Académicas',
  tech: 'Tecnología y desarrollo', social: 'Redes y mensajería', video: 'Video', audio: 'Podcasts y audio',
};

/**
 * Fonti valutate a CPM giornalistico nel valore media. Derivate dalla mappa qui
 * sopra per non avere due classificazioni divergenti — con l'eccezione degli
 * upload, la cui provenienza è ignota: contarli come stampa gonfierebbe il
 * valore di file che potrebbero contenere qualsiasi cosa.
 */
export const NEWS_SOURCES = Object.entries(SOURCE_KIND)
  .filter(([id, k]) => k === 'article' && id !== 'upload')
  .map(([id]) => id);

export const SOURCE_META: Record<string, { label: string; color: string; note?: string }> = {
  googlenews: { label: 'Google News', color: '#f59e0b' },
  talkwalker: {
    label: 'Talkwalker', color: '#00b8a9',
    note: 'Menciones traídas en vivo desde la cuenta corporativa de Talkwalker (Lumen by Hootsuite) mediante su API, dentro de un proyecto de tipo "Talkwalker": AEDO lee los temas ya configurados allí en lugar de reescribir la consulta. Cada búsqueda consume créditos del contrato de Talkwalker (10 por llamada más 1 por resultado).',
  },
  talkwalker_news: {
    label: 'Talkwalker (noticias)', color: '#0d9488',
    note: 'Artículos editoriales del índice de Talkwalker: misma adquisición que "Talkwalker", leídos como cobertura de prensa y no como publicaciones sociales.',
  },
  gdelt: { label: 'GDELT', color: '#a78bfa' },
  reddit: { label: 'Reddit', color: '#ff4500' },
  bluesky: { label: 'Bluesky', color: '#38bdf8' },
  mastodon: { label: 'Mastodon', color: '#8b5cf6' },
  hackernews: { label: 'Hacker News', color: '#f97316' },
  youtube: { label: 'YouTube', color: '#ef4444' },
  x: { label: 'X (Twitter)', color: '#e2e8f0' },
  telegram: { label: 'Telegram', color: '#29b6f6' },
  rss: { label: 'RSS', color: '#fbbf24' },
  instagram: { label: 'Instagram', color: '#e1306c' },
  facebook: { label: 'Facebook', color: '#1877f2' },
  tiktok: { label: 'TikTok', color: '#fe2c55' },
  linkedin: {
    label: 'LinkedIn (página)', color: '#0a66c2',
    note: 'Publicaciones de la página de tu propia empresa mediante la API oficial de LinkedIn: texto completo y métricas reales, pero solo de tu página.',
  },
  linkedin_web: {
    label: 'LinkedIn (web)', color: '#4c9ce8',
    note: 'Publicaciones y artículos públicos de LinkedIn de cualquier persona, encontrados mediante el índice de búsqueda de Tavily (API oficial): fragmentos parciales, sin métricas de engagement. Un modelo de adquisición distinto al de "LinkedIn (página)".',
  },
  newsapi: { label: 'NewsAPI', color: '#14b8a6' },
  stackexchange: {
    label: 'Stack Exchange', color: '#f48024',
    note: 'Preguntas con tus términos en el título, en Stack Overflow y otras 5 comunidades de Stack Exchange (finanzas, trabajo, viajes, crianza, informática general). Funciona sin clave, con una cuota compartida baja; agrega una clave gratuita para aumentarla.',
  },
  github: {
    label: 'GitHub', color: '#e2e8f0',
    note: 'Issues y pull requests con tus términos en el título, en todo GitHub público, con el texto completo del issue y sus conteos de reacciones y comentarios. Se filtran los issues automáticos creados por bots (changelogs, resúmenes). Funciona sin clave, con un límite de uso bajo; agrega un token gratuito para aumentarlo.',
  },
  discord: {
    label: 'Discord', color: '#5865f2',
    note: 'Mensajes de los canales de un servidor que administras, mediante un bot oficial (modelo de lista de seguimiento, como Facebook); no busca en servidores de otras personas, algo que Discord no ofrece. Requiere un token de bot gratuito con el Message Content Intent habilitado.',
  },
  'sec-edgar': {
    label: 'SEC EDGAR', color: '#2c5aa0',
    note: 'Registros oficiales ante la SEC (eventos materiales 8-K, informes 10-K/10-Q, declaraciones DEF 14A) de cualquier empresa listada en EE. UU. que coincida con tus términos: gratis, sin clave, datos del gobierno de EE. UU. El texto del registro no viene en los resultados, así que cada entrada se arma con la empresa, el tipo de registro y la descripción del anexo, con un enlace al documento completo.',
  },
  arxiv: {
    label: 'arXiv', color: '#b31b1b',
    note: 'Artículos académicos (computación, física, matemáticas, biología cuantitativa y más) que coinciden con tus términos, con el resumen completo: API oficial gratuita, sin clave. La búsqueda del servidor aplica una lematización ligera (comprobado: "Claude" también coincidió con un estudio astronómico llamado "CLAUDS"), así que aquí se vuelve a verificar una coincidencia literal en el título o el resumen.',
  },
  lemmy: {
    label: 'Lemmy', color: '#00bc8c',
    note: 'Publicaciones y comentarios de Lemmy, la red federada similar a Reddit, leídos a través de lemmy.world, que ve el contenido de toda la federación: gratis, sin clave. La búsqueda del servidor es amplia, así que aquí se vuelve a verificar cada resultado con una coincidencia literal en el título o el texto.',
  },
  newsdata: {
    label: 'NewsData.io', color: '#6366f1',
    note: 'Noticias de más de 100.000 medios en más de 80 idiomas. Clave gratuita, 200 créditos al día, uso comercial permitido. Una búsqueda por proyecto en cada recolección (10 artículos, consulta booleana de 100 caracteres); los términos restantes rotan en la siguiente ejecución. El texto completo no está en el plan gratuito: los artículos se enriquecen después, como los demás.',
  },
  podcastindex: {
    label: 'Podcast Index', color: '#f43f5e',
    note: 'Episodios de podcast cuyo título o descripción menciona tus términos, del directorio abierto Podcast Index (sin ánimo de lucro, clave y secreto gratuitos). Se lee la descripción, no el audio: un episodio que solo nombra el tema en voz alta no aparece.',
  },
  upload: {
    label: 'Archivo importado', color: '#94a3b8',
    note: 'Filas importadas de tus archivos Excel/CSV: el contenido, los autores y las fechas son exactamente los del archivo; no se recolecta nada de la web.',
  },
};
