import {
  Radar, LayoutDashboard, Ear, Newspaper, BarChart3, Users,
  Star, Bell, FileText, Settings, MessageSquareText, GitBranch,
  Diff, PenLine, MonitorPlay, Network, History, LayoutGrid, Lightbulb,
  MessageSquareQuote, DollarSign, Award, Trophy, FileClock, BookOpen, LineChart,
  UserRound, Shapes, UploadCloud, Gauge, SearchCheck, FlaskConical, Podcast, PlugZap, Blocks, ClipboardList,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Le destinazioni di Radar, in un posto solo.
//
// Le usano il menù laterale e la ricerca rapida (⌘K): due modi di arrivare
// nello stesso posto, e nessuno dei due deve poter dimenticare una pagina.
//
// Due cose che il menù non riusciva a dire da solo:
//
//   PESO — quattro voci si aprono ogni giorno, le altre una volta al mese.
//   Un elenco dove "Dashboard" e "Stakeholder map" hanno la stessa dimensione
//   costringe a leggerle tutte per trovarne una. `primary` le distingue: si
//   legge per peso, non per posizione, e non serve un clic in più.
//
//   PARENTELA — pagine che rispondono alla stessa domanda erano quattro voci
//   diverse. Ora sono schede dentro una pagina sola: le voci del menù calano,
//   ma non si nasconde niente — le schede sono lì, visibili.
// ---------------------------------------------------------------------------

export type NavLink = {
  href: string;
  label: string;
  /** Chiave di traduzione. */
  key: string;
  icon: typeof Radar;
  /** Aperta ogni giorno: nel menù pesa di più. */
  primary?: boolean;
  accent?: 'reviews' | 'sport' | 'wikipedia';
  /** Parole con cui la si cerca ma che non compaiono nell'etichetta. */
  also?: string[];
};

export type NavItem = NavLink | { section: string; key: string };

export const NAV: NavItem[] = [
  { section: 'Monitoreo', key: 'nav.monitor' },
  { href: '/resumen', label: 'Resumen ejecutivo', key: 'nav.resumen', icon: ClipboardList, primary: true, also: ['hallazgos', 'oportunidades', 'resumen', 'summary', 'executive'] },
  { href: '/', label: 'Tablero', key: 'nav.dashboard', icon: LayoutDashboard, primary: true },
  { href: '/listening', label: 'Escucha', key: 'nav.listening', icon: Ear, primary: true, also: ['mentions', 'post', 'stream'] },
  { href: '/media', label: 'Medios', key: 'nav.media', icon: Newspaper, also: ['news', 'stories', 'press'] },
  { href: '/alerts', label: 'Alertas', key: 'nav.alerts', icon: Bell, primary: true, also: ['spike', 'warning'] },
  { href: '/changes', label: 'Qué cambió', key: 'nav.changes', icon: Diff, also: ['diff', 'since'] },

  { section: 'Análisis', key: 'nav.analyze' },
  { href: '/insights', label: 'Explorar insights', key: 'nav.insights', icon: LayoutGrid, primary: true, also: ['charts', 'galaxy', 'map', 'emotions', 'flow'] },
  { href: '/audience', label: 'Audiencia', key: 'nav.audience', icon: Users, also: ['authors', 'communities'] },
  { href: '/benchmark', label: 'Benchmark', key: 'nav.benchmark', icon: BarChart3, also: ['competitors', 'share of voice', 'sov', 'trends'] },
  { href: '/kpi', label: 'KPI y confiabilidad', key: 'nav.kpi', icon: Gauge, also: ['kpi', 'nss', 'net sentiment', 'soe', 'share of engagement', 'engagement rate', 'affidabilità', 'reliability', 'formule', 'glossario', 'analisi critica'] },
  { href: '/content', label: 'Contenido destacado', key: 'nav.content', icon: Star, also: ['best posts', 'quality'] },
  { href: '/emv', label: 'Valor mediático', key: 'nav.emv', icon: DollarSign, also: ['emv', 'earned', 'dólares', 'usd'] },
  { href: '/measures', label: 'Métricas y personas', key: 'nav.measures', icon: LineChart, also: ['people', 'personal branding', 'followers', 'metrics', 'spreadsheet'] },
  { href: '/graph', label: 'Studio Graph', key: 'nav.graph', icon: Shapes, also: ['chart builder', 'axes'] },

  { section: 'Interpretación', key: 'nav.interpret' },
  { href: '/pov', label: 'Punto de vista', key: 'nav.pov', icon: Lightbulb, also: ['thesis', 'pov'] },
  { href: '/riscontri', label: 'Hechos y verificaciones', key: 'nav.facts', icon: SearchCheck, also: ['fact check', 'verifiche', 'bufale', 'disinformazione', 'studi clinici', 'clinical trials', 'evidenze', 'podcast', 'riscontri', 'hype'] },
  { href: '/story', label: 'Historia y stakeholders', key: 'nav.story', icon: GitBranch, also: ['narratives', 'timeline', 'stakeholders', 'messages', 'pull-through'] },
  { href: '/ask', label: 'Pregúntale a los datos', key: 'nav.ask', icon: MessageSquareText, also: ['question', 'chat'] },

  { section: 'Producción', key: 'nav.create' },
  { href: '/report', label: 'Reporte personalizado', key: 'nav.report', icon: BookOpen, also: ['pdf', 'export', 'pages'] },
  { href: '/studio', label: 'Content Studio', key: 'nav.studio', icon: PenLine, also: ['ideas', 'hooks', 'copy'] },
  { href: '/brief', label: 'Brief diario', key: 'nav.brief', icon: FileText },
  { href: '/tv', label: 'War Room', key: 'nav.tv', icon: MonitorPlay, also: ['wall', 'screen'] },

  { section: 'Configuración', key: 'nav.setup' },
  { href: '/settings', label: 'Proyectos', key: 'nav.settings', icon: Settings, also: ['sources', 'keys', 'budget', 'delete'] },
  { href: '/query', label: 'Consultas', key: 'nav.query', icon: Blocks, also: ['query', 'keywords', 'parole chiave', 'booleana', 'boolean', 'competitor', 'mattoncini', 'ricerca'] },
  { href: '/import', label: 'Importar un archivo', key: 'nav.import', icon: UploadCloud, also: ['excel', 'csv', 'upload', 'sheet'] },
  { href: '/mcp', label: 'MCP', key: 'nav.mcp', icon: PlugZap, also: ['claude', 'copilot', 'model context protocol', 'token', 'prompt', 'libreria', 'agent'] },

  { section: '', key: '' },
  { section: 'Más allá de las menciones', key: 'nav.beyondSection' },
  { href: '/reviews', label: 'Reseñas', key: 'nav.reviews', icon: Award, accent: 'reviews', also: ['stars', 'app store', 'yelp'] },
  { href: '/sport', label: 'Deportes', key: 'nav.sport', icon: Trophy, accent: 'sport', also: ['matches', 'club'] },
  { href: '/wikipedia', label: 'Wikipedia', key: 'nav.wikipedia', icon: FileClock, accent: 'wikipedia', also: ['edits', 'revert'] },
];

/** Le sole destinazioni, senza le intestazioni di sezione. */
export const NAV_LINKS = NAV.filter((i): i is NavLink => 'href' in i);

/**
 * Le pagine che ora vivono come schede dentro un'altra.
 *
 * Restano raggiungibili al loro indirizzo — un link salvato non deve morire
 * per una riorganizzazione del menù — e la ricerca continua a trovarle.
 */
export const NAV_TABS: NavLink[] = [
  { href: '/narratives', label: 'Narrativas', key: 'nav.narratives', icon: GitBranch },
  { href: '/timeline', label: 'Línea de tiempo', key: 'nav.timeline', icon: History },
  { href: '/stakeholders', label: 'Mapa de stakeholders', key: 'nav.stakeholders', icon: Network },
  { href: '/messages', label: 'Adopción de mensajes', key: 'nav.messages', icon: MessageSquareQuote },
  { href: '/people', label: 'Personas', key: 'nav.people', icon: UserRound },
  { href: '/verifiche', label: 'Verificaciones', key: 'nav.factchecks', icon: SearchCheck, also: ['fact check', 'bufale', 'debunk'] },
  { href: '/evidenze', label: 'Ensayos clínicos', key: 'nav.trials', icon: FlaskConical, also: ['clinicaltrials', 'studi clinici', 'farmaci'] },
  { href: '/podcast', label: 'Podcasts', key: 'nav.podcasts', icon: Podcast, also: ['audio', 'episodi'] },
];

/** Tutto ciò che la ricerca rapida può aprire. */
export const SEARCHABLE: NavLink[] = [...NAV_LINKS, ...NAV_TABS];
