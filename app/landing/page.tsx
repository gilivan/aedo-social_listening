import Link from 'next/link';
import {
  Ear, Star, Flame, FileText, MonitorPlay, GitBranch, MessageSquareText,
  PenLine, Share2, Radar as RadarIcon, ArrowRight, Sparkles, Globe2,
  Database, Wallet, Check, X as XMark, Minus, ScatterChart, Trophy,
} from 'lucide-react';
import { ParticleField } from '@/components/particle-field';
import { Brand } from '@/components/brand';
import { LocaleSwitch } from '@/components/locale-switch';
import { getLocale, getT } from '@/lib/i18n';

export const metadata = { title: 'AEDO — inteligencia de medios open source' };

const FEATURES = [
  {
    icon: Ear, color: 'text-sky-400',
    title: 'Escucha multicanal',
    text: '15 fuentes públicas gratuitas: noticias de todo el mundo vía GDELT (más de 100.000 medios en más de 65 idiomas) y Google News, reportes de la SEC, artículos de arXiv, Stack Exchange, GitHub, además de Reddit, Bluesky, Mastodon, YouTube, Discord, Telegram y feeds RSS ilimitados. Y 6 conectores premium listos: X, Instagram, Facebook, TikTok, LinkedIn y NewsAPI (150.000 medios).',
  },
  {
    icon: Star, color: 'text-amber-400',
    title: 'Relevancia con estrellas',
    text: 'La IA lee cada contenido y lo califica de 1 a 5 estrellas frente a tu tema, con el porqué. El ruido desaparece.',
  },
  {
    icon: Flame, color: 'text-orange-400',
    title: 'Radar de tendencias',
    text: 'Los temas que aceleran de forma anormal se detectan antes de que exploten, con una explicación de por qué están creciendo.',
  },
  {
    icon: FileText, color: 'text-emerald-400',
    title: 'Brief ejecutivo diario',
    text: 'Cada mañana, un brief escrito por IA sobre las últimas 24 horas: qué pasó, sentimiento, riesgos y oportunidades.',
  },
  {
    icon: MonitorPlay, color: 'text-red-400',
    title: 'War Room en vivo',
    text: 'Una sala de control a pantalla completa con un radar animado, contadores y un feed continuo. Proyéctala en una reunión o en una pantalla de la oficina.',
  },
  {
    icon: GitBranch, color: 'text-violet-400',
    title: 'Narrativas y coordinación',
    text: 'No solo lo que se dice: quién impulsa cada tesis, con señales de patrones de coordinación sospechosos.',
  },
  {
    icon: MessageSquareText, color: 'text-cyan-400',
    title: 'Pregúntale a los datos',
    text: 'Un analista de IA conversacional: haz preguntas en lenguaje natural y recibe respuestas respaldadas por cifras y citas como evidencia.',
  },
  {
    icon: ScatterChart, color: 'text-fuchsia-400',
    title: 'Insights avanzados',
    text: 'Mapa de temas × sentimiento, mapa de calor por hora, cascada de sentimiento, clusters de conversación y gráfico causa-efecto: análisis visuales que las herramientas estándar no ofrecen.',
  },
  {
    icon: Trophy, color: 'text-amber-400',
    title: 'Más allá de las menciones',
    text: 'Tres señales que ninguna herramienta de escucha rastrea: para clubes que cotizan en bolsa, resultados de partidos cruzados con el sentimiento de los hinchas y el precio de la acción; quién edita la página de Wikipedia de una marca y si parece una disputa; y las calificaciones de App Store, Google Places y Yelp en un solo lugar. Además, Share of search: el interés en Google Trends junto al Share of Voice.',
  },
  {
    icon: PenLine, color: 'text-pink-400',
    title: 'Content Studio avanzado',
    text: 'De un concepto a un kit multiformato (LinkedIn, hilo de X, Instagram, gancho para video, newsletter), más 10 ganchos alternativos y ajuste conversacional de cada borrador, con la voz de la marca.',
  },
  {
    icon: Share2, color: 'text-teal-400',
    title: 'Exportar y compartir',
    text: 'PDF, Excel, Word y PowerPoint con gráficos editables. Y enlaces de solo lectura con vencimiento para directivos y clientes.',
  },
];

// ✓ = included, ~ = partial/limited, ✗ = not available
type MarkValue = 'si' | 'parz' | 'no';
type CompareRow = [string, MarkValue, MarkValue, string?, string?]; // [feature, competitor, radar, competitorNote, radarNote]

const COMPARISON: { cat: string; rows: CompareRow[] }[] = [
  {
    cat: 'Fuentes públicas (gratis en AEDO)',
    rows: [
      ['Noticias de todo el mundo (GDELT)', 'si', 'si', 'incluido', 'más de 100.000 medios, más de 65 idiomas'],
      ['Noticias agregadas (Google News)', 'si', 'si', , 'miles de medios'],
      ['Reddit, Bluesky, Mastodon, Hacker News', 'parz', 'si', , 'redes públicas, sin claves'],
      ['YouTube', 'si', 'si', , 'clave gratuita'],
      ['Canales públicos de Telegram', 'parz', 'si', , 'lista de canales a seguir'],
      ['Feeds RSS/Atom ilimitados', 'parz', 'si', , 'medios, blogs, Google Alerts'],
      ['Cobertura de más de 30 idiomas', 'si', 'si'],
      ['Consultas booleanas (AND / OR / NOT) y geografías', 'si', 'si'],
    ],
  },
  {
    cat: 'Fuentes premium (privadas, pagas)',
    rows: [
      ['NewsAPI, 150.000 medios de noticias', 'si', 'parz', 'incluido en la licencia', 'conector listo, clave aparte'],
      ['X (Twitter)', 'si', 'parz', 'incluido', 'conector listo, clave aparte'],
      ['Instagram y Facebook (Meta)', 'si', 'parz', 'incluido', 'conectores listos, token aparte'],
      ['TikTok', 'si', 'parz', 'incluido', 'conector listo, acceso aparte'],
      ['LinkedIn', 'si', 'parz', 'incluido', 'conector listo, token aparte'],
      ['Archivo histórico de varios años', 'si', 'no', , '90 días, ampliable'],
    ],
  },
  {
    cat: 'Análisis con IA',
    rows: [
      ['Sentimiento multilingüe', 'si', 'si'],
      ['Temas y entidades automáticos', 'si', 'si'],
      ['Relevancia de 1 a 5 explicada por contenido', 'no', 'si', , 'con la justificación de la IA'],
      ['Traducción de noticias integrada', 'parz', 'si', , '8 idiomas, caché permanente'],
      ['Brief ejecutivo diario escrito por IA', 'parz', 'si'],
      ['Analista conversacional sobre tus datos', 'no', 'si', , '“Pregúntale a los datos”'],
      ['Búsqueda semántica por concepto', 'parz', 'si'],
      ['Definición del tema en lenguaje natural', 'no', 'si'],
    ],
  },
  {
    cat: 'Insights avanzados',
    rows: [
      ['Mapa de temas × sentimiento (burbujas por cuadrante)', 'parz', 'si', , 'volumen, sentimiento, crecimiento'],
      ['Mapa de calor por hora y día', 'parz', 'si'],
      ['Cascada de sentimiento (qué movió el tono)', 'no', 'si'],
      ['Clusters de conversación (familias de discurso)', 'no', 'si'],
      ['Gráfico causa-efecto (eventos → consecuencias)', 'no', 'si'],
    ],
  },
  {
    cat: 'Inteligencia',
    rows: [
      ['Alertas por picos de volumen y caídas de sentimiento', 'si', 'si'],
      ['Tendencias emergentes con el “porqué”', 'parz', 'si'],
      ['Detección de narrativas coordinadas', 'no', 'si'],
      ['Playbook de crisis con borrador de comunicado', 'no', 'si', , 'a 30 segundos de la alerta'],
      ['Línea de tiempo histórica de eventos del sector', 'no', 'si'],
      ['Mapa de actores y stakeholders', 'parz', 'si'],
      ['Comparación semanal en lenguaje natural', 'no', 'si'],
      ['Benchmark y Share of Voice', 'si', 'si'],
      ['Share of search (Google Trends vs. competidores)', 'no', 'si'],
      ['Notificaciones push', 'si', 'si', 'correo y app', 'Telegram'],
      ['Demografía de la audiencia (edad, género)', 'si', 'no', , 'no se puede derivar de las fuentes accesibles'],
    ],
  },
  {
    cat: 'Más allá de las menciones',
    rows: [
      ['Deporte: resultados × sentimiento de hinchas × precio de la acción', 'no', 'si', , 'para clubes que cotizan en bolsa'],
      ['Monitoreo de ediciones en Wikipedia (guerras de ediciones, actividad anónima)', 'no', 'si'],
      ['Calificaciones de reseñas (App Store, Google Places, Yelp)', 'parz', 'si', 'herramientas aparte', 'una sola sección, sin IA'],
    ],
  },
  {
    cat: 'Entregables y colaboración',
    rows: [
      ['Exportación a Excel, Word y PDF', 'si', 'si'],
      ['PowerPoint con gráficos editables', 'parz', 'si', 'imágenes estáticas', 'gráficos nativos de Office'],
      ['Informes compartibles con vencimiento', 'si', 'si'],
      ['War Room / pantalla animada en vivo', 'parz', 'si', 'tablero para TV', 'vista animada rotativa'],
      ['Content Studio: kit multiformato (5 canales)', 'no', 'si', , 'de un concepto a todos los canales'],
      ['Content Studio: Hook Lab + edición conversacional', 'no', 'si'],
      ['Perfiles de influenciadores con borrador de contacto', 'parz', 'si'],
      ['Multiproyecto', 'si', 'si'],
    ],
  },
  {
    cat: 'Plataforma',
    rows: [
      ['Open source e instalable en servidor propio', 'no', 'si', , 'AGPL-3.0'],
      ['Datos en tu propia base de datos', 'no', 'si'],
      ['Funciones a la medida en días', 'no', 'si', 'hoja de ruta del proveedor'],
      ['Tope de gasto en IA configurable', 'no', 'si'],
      ['Sin amarres contractuales', 'no', 'si', 'contratos anuales'],
    ],
  },
];

function CheckIcon() { return <Check className="inline size-4 text-emerald-400" aria-label="incluido" />; }
function XIcon() { return <XMark className="inline size-4 text-red-400" aria-label="no disponible" />; }
function PartialIcon() { return <Minus className="inline size-4 text-amber-400" aria-label="parcial" />; }

function Mark({ v, note }: { v: MarkValue; note?: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      {v === 'si' ? <CheckIcon /> : v === 'no' ? <XIcon /> : <PartialIcon />}
      {note && <span className="max-w-[150px] text-[10px] leading-tight text-slate-500">{note}</span>}
    </span>
  );
}

const STEPS = [
  { n: '01', title: 'Describe tu tema', text: 'Incluso en lenguaje natural: la IA convierte la descripción en una consulta de monitoreo multilingüe.' },
  { n: '02', title: 'AEDO trabaja solo', text: 'Recopila, traduce, califica y organiza el contenido todos los días. Alertas automáticas si algo explota.' },
  { n: '03', title: 'Tú decides', text: 'Tableros, briefs, mapas e informes listos para exportar: decisiones tomadas con los datos enfrente.' },
];

export default async function LandingPage() {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#04070f] text-slate-200">
      {/* backgrounds */}
      <div className="pointer-events-none fixed inset-0">
        <ParticleField />
        <div aria-hidden className="absolute -right-[30vmax] -top-[30vmax] size-[80vmax] rounded-full opacity-[0.07]"
          style={{ background: 'conic-gradient(from 0deg, transparent 0deg, #38bdf8 25deg, transparent 60deg)', animation: 'radarsweep 16s linear infinite' }} />
        <div aria-hidden className="tv-aurora absolute -left-[15vmax] top-[30vmax] size-[55vmax] rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 60%)' }} />
      </div>

      {/* header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center gap-4 px-5 py-5 sm:px-8">
        <Brand />
        <div className="ml-auto flex items-center gap-3">
          <LocaleSwitch current={locale} publicPage />
          <Link href="/login"
            className="rounded-lg bg-sky-500/90 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
            {t('landing.signin', 'Iniciar sesión')}
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        {/* hero */}
        <section className="tv-3d flex flex-col items-center py-16 text-center sm:py-24">
          <span className="mb-6 flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1.5 text-xs font-medium tracking-wide text-sky-300">
            <Sparkles className="size-3.5" /> {t('landing.badge', 'Inteligencia de medios impulsada por IA')}
          </span>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
            {t('landing.h1a', 'Todo lo que el mundo dice sobre tu tema.')}{' '}
            <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
              {t('landing.h1b', 'Entendido, calificado y resumido.')}
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            {t('landing.lead', 'AEDO escucha noticias y redes sociales en más de 30 idiomas, evalúa la relevancia de cada contenido, detecta tendencias antes de que exploten y escribe tu brief cada mañana. El trabajo de una plataforma empresarial, sin el precio empresarial.')}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login"
              className="flex items-center gap-2 rounded-xl bg-sky-500 px-7 py-3 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/25 transition hover:bg-sky-400">
              {t('landing.open', 'Abrir AEDO')} <ArrowRight className="size-4" />
            </Link>
            <a href="/tour.html" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-7 py-3 text-base font-semibold text-sky-200 transition hover:bg-sky-500/20">
              {t('landing.tour', '▶ Ver el recorrido')}
            </a>
            <a href="#features"
              className="rounded-xl border border-[var(--border)] px-7 py-3 text-base font-medium text-slate-300 transition hover:bg-white/5">
              {t('landing.seeFeatures', 'Ver las funciones')}
            </a>
          </div>
        </section>

        {/* numbers */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [<Database key="i" className="mx-auto size-5 text-sky-400" />, '21', 'fuentes · 15 gratis + 6 premium'],
            [<Globe2 key="i" className="mx-auto size-5 text-violet-400" />, '30+', 'idiomas analizados'],
            [<Sparkles key="i" className="mx-auto size-5 text-amber-400" />, '20', 'módulos de inteligencia'],
            [<Wallet key="i" className="mx-auto size-5 text-emerald-400" />, '<1%', 'del costo de las herramientas empresariales'],
          ].map(([icon, big, small], i) => (
            <div key={i} className="tv-shine rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 px-4 py-6 text-center backdrop-blur">
              {icon}
              <p className="mt-2 text-3xl font-black tracking-tight">{big}</p>
              <p className="mt-1 text-xs text-slate-500">{small}</p>
            </div>
          ))}
        </section>

        {/* philosophy — open-source manifesto */}
        <section className="mx-auto max-w-3xl py-20 text-center sm:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-400">Open source</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Potencia empresarial, a una milésima parte del precio</h2>
          <div className="mt-6 flex flex-col gap-4 text-left text-base leading-relaxed text-slate-400 sm:text-lg">
            <p>
              Las plataformas comerciales de escucha cuestan <strong className="text-slate-200">miles de euros al mes</strong> y
              encierran su inteligencia en contratos anuales. AEDO es <strong className="text-slate-200">open source</strong>:
              el mismo flujo de trabajo esencial (escuchar, analizar, decidir, crear) construido sobre <strong className="text-slate-200">datos
              públicos gratuitos</strong> y la API de Claude, que cualquiera puede ejecutar por el precio de una clave de API. O gratis, si solo
              quieres recopilar datos.
            </p>
            <p>
              Nació como un proyecto de una sola persona con una convicción simple: en la era de la IA, una persona que orquesta
              bien los modelos puede poner <strong className="text-slate-200">herramientas de nivel empresarial</strong> en manos de cualquiera. Construirlo
              de forma abierta lo convierte en una base compartida y extensible: <strong className="text-slate-200">trae tus propias
              claves</strong>, sé dueño de tus datos y adapta la herramienta a tus necesidades. La IA recopila, lee, evalúa, escribe y
              alerta; <strong className="text-slate-200">las decisiones siguen siendo de las personas.</strong>
            </p>
            <blockquote className="flex flex-col gap-3 border-l-2 border-violet-500/50 pl-4 italic text-slate-300">
              <p>
                “Las capacidades que antes costaban miles al mes, en manos de cualquiera, por una milésima parte del precio.
              </p>
              <p>
                De eso se trata construir esto de forma abierta: democratizar la inteligencia de medios, una instalación a la vez.”
              </p>
            </blockquote>
          </div>
        </section>

        {/* features */}
        <section id="features" className="pb-8">
          <h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl">Qué hace AEDO</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-500">
            Las funciones de las plataformas empresariales de inteligencia social, repensadas con la IA generativa en el centro.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 px-6 py-6 backdrop-blur transition hover:border-sky-500/40 hover:bg-[var(--panel)]">
                <f.icon className={`size-6 ${f.color}`} />
                <h3 className="mt-3 text-base font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* comparison */}
        <section className="py-16">
          <h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl">AEDO frente a la competencia</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-500">
            Función por función, una comparación honesta con las principales plataformas empresariales.
          </p>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 backdrop-blur">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="px-5 py-4 font-semibold text-slate-400">Función</th>
                  <th className="w-40 px-4 py-4 text-center font-semibold text-slate-300">Competencia</th>
                  <th className="w-40 bg-sky-500/10 px-4 py-4 text-center font-bold text-sky-300">AEDO</th>
                </tr>
              </thead>
              <tbody className="text-slate-400">
                {COMPARISON.map((group) => (
                  [
                    <tr key={group.cat}>
                      <td colSpan={3} className="border-b border-[var(--border)]/60 bg-white/[0.03] px-5 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                        {group.cat}
                      </td>
                    </tr>,
                    ...group.rows.map(([feat, tw, radar, twNote, radarNote]) => (
                      <tr key={feat} className="border-b border-[var(--border)]/40 last:border-0">
                        <td className="px-5 py-2.5 text-[13px] font-medium text-slate-300">{feat}</td>
                        <td className="px-4 py-2.5 text-center"><Mark v={tw} note={twNote} /></td>
                        <td className="bg-sky-500/5 px-4 py-2.5 text-center"><Mark v={radar} note={radarNote} /></td>
                      </tr>
                    )),
                  ]
                ))}
                <tr>
                  <td className="px-5 py-4 text-[13px] font-bold text-slate-200">Costo mensual</td>
                  <td className="px-4 py-4 text-center text-sm font-bold text-red-300">€800–2.000+</td>
                  <td className="bg-sky-500/10 px-4 py-4 text-center text-sm font-bold text-emerald-300">~€10–40</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1"><CheckIcon /> incluido</span>
            <span className="flex items-center gap-1"><PartialIcon /> parcial o limitado</span>
            <span className="flex items-center gap-1"><XIcon /> no disponible</span>
          </div>
        </section>

        {/* how it works */}
        <section className="py-20">
          <h2 className="text-center text-3xl font-black tracking-tight">Cómo funciona</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-[var(--border)] bg-[var(--panel)]/50 px-6 py-7">
                <span className="bg-gradient-to-b from-sky-300 to-sky-600 bg-clip-text text-4xl font-black text-transparent">{s.n}</span>
                <h3 className="mt-3 text-base font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* final CTA */}
        <section className="pb-20">
          <div className="tv-shine relative overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-[#0c1a38] to-[#0a0f22] px-6 py-14 text-center sm:px-10">
            <RadarIcon className="mx-auto size-10 text-sky-400" />
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
              Tu sector está hablando. AEDO ya está escuchando.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
              Inicia sesión con tus credenciales y abre el tablero: los datos ya están ahí.
            </p>
            <Link href="/login"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-8 py-3 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/25 transition hover:bg-sky-400">
              Iniciar sesión en AEDO <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--border)]/60 py-8 text-center text-xs text-slate-600">
        AEDO · inteligencia de medios open source, orquestada con IA.
      </footer>
    </div>
  );
}
