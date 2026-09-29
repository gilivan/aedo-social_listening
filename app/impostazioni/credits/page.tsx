import { PageHeader } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { Heart, Scale, Package, Image as ImageIcon, Database, ShieldAlert, ExternalLink } from 'lucide-react';

export const metadata = { title: 'Créditos y aspectos legales' };

const DEPS: { name: string; license: string; url: string }[] = [
  { name: 'Next.js', license: 'MIT', url: 'https://github.com/vercel/next.js' },
  { name: 'React', license: 'MIT', url: 'https://react.dev' },
  { name: 'three.js', license: 'MIT', url: 'https://threejs.org' },
  { name: 'Recharts', license: 'MIT', url: 'https://recharts.org' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://tailwindcss.com' },
  { name: 'Drizzle ORM', license: 'Apache-2.0', url: 'https://orm.drizzle.team' },
  { name: 'PGlite', license: 'Apache-2.0', url: 'https://pglite.dev' },
  { name: 'Neon serverless driver', license: 'MIT', url: 'https://github.com/neondatabase/serverless' },
  { name: '@anthropic-ai/sdk', license: 'MIT', url: 'https://github.com/anthropics/anthropic-sdk-typescript' },
  { name: 'lucide-react (icons)', license: 'ISC', url: 'https://lucide.dev' },
  { name: 'ExcelJS', license: 'MIT', url: 'https://github.com/exceljs/exceljs' },
  { name: 'PptxGenJS', license: 'MIT', url: 'https://gitbrent.github.io/PptxGenJS/' },
  { name: 'docx', license: 'MIT', url: 'https://github.com/dolanmiu/docx' },
  { name: 'PDFKit', license: 'MIT', url: 'https://pdfkit.org' },
  { name: 'jsPDF', license: 'MIT', url: 'https://github.com/parallax/jsPDF' },
  { name: 'marked', license: 'MIT', url: 'https://marked.js.org' },
  { name: 'fast-xml-parser', license: 'MIT', url: 'https://github.com/NaturalIntelligence/fast-xml-parser' },
  { name: 'date-fns', license: 'MIT', url: 'https://date-fns.org' },
];

const SOURCES = 'GDELT · Google News · Bluesky · Mastodon · Hacker News (Algolia) · Telegram · RSS/Atom · Reddit · YouTube · X · Meta (Instagram/Facebook) · TikTok · LinkedIn · NewsAPI';

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-sky-400 hover:text-sky-300">
      {children}<ExternalLink className="size-3" />
    </a>
  );
}

export default async function CreditsPage() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t('page.credits.title', 'Créditos y aspectos legales')} subtitle="Quién creó la base de AEDO, de qué está hecho y bajo qué términos se publica." />

      <div className="flex max-w-2xl flex-col gap-4">
        {/* Chi */}
        <section className="panel px-5 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><Heart className="size-4 text-pink-400" /> Creado por</h2>
          <div className="flex flex-col gap-2 text-sm text-slate-300">
            <p><span className="text-slate-500">Creador y producto:</span> <span className="font-medium text-slate-100">Massimo Scognamiglio</span> — idea, diseño, dirección y cada decisión detrás de Radar Intelligence, el proyecto open source en el que se basa AEDO.</p>
            <p><span className="text-slate-500">Desarrollado en pareja con:</span> <span className="font-medium text-slate-100">Claude</span> de <Ext href="https://www.anthropic.com">Anthropic</Ext> — el colaborador de IA que escribió y moldeó el código junto al autor, y que también impulsa las funciones de IA dentro de AEDO (sentimiento, emociones, briefs, clustering, Content Studio…).</p>
            <p className="text-xs text-slate-500">Un equipo de una persona más un socio de IA: inteligencia de medios de nivel empresarial a una milésima parte del precio. Y sí, nos divertimos mucho juntos. 🐣</p>
          </div>
        </section>

        {/* Licenza */}
        <section className="panel px-5 py-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300"><Scale className="size-4 text-sky-400" /> Licencia</h2>
          <p className="text-sm text-slate-300">
            AEDO es <span className="font-medium text-slate-100">software libre y de código abierto</span> bajo la licencia{' '}
            <Ext href="https://www.gnu.org/licenses/agpl-3.0.html">GNU AGPL-3.0</Ext>.
            © {new Date().getFullYear()} Massimo Scognamiglio y colaboradores.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Si ejecutas una versión modificada como servicio en red, la AGPL te exige publicar tu código fuente bajo la misma licencia.
            Código fuente original: <Ext href="https://github.com/Scognamiglio1969/radar-intelligence">github.com/Scognamiglio1969/radar-intelligence</Ext>.
          </p>
        </section>

        {/* Open source */}
        <section className="panel px-5 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><Package className="size-4 text-violet-400" /> Construido con código abierto</h2>
          <p className="mb-3 text-xs text-slate-500">AEDO se apoya en estos proyectos. El texto oficial de la licencia de cada paquete se incluye en su propia carpeta dentro de <code className="text-slate-400">node_modules/</code>.</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {DEPS.map((d) => (
              <div key={d.name} className="flex flex-col text-xs">
                <Ext href={d.url}>{d.name}</Ext>
                <span className="text-slate-600">{d.license}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Media / asset */}
        <section className="panel px-5 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><ImageIcon className="size-4 text-emerald-400" /> Medios y recursos</h2>
          <ul className="flex flex-col gap-2 text-xs text-slate-400">
            <li>
              Texturas de planetas, sol y lunas de la <span className="text-slate-300">Galaxia de la conversación</span> — © <Ext href="https://www.solarsystemscope.com/textures/">Solar System Scope</Ext>, con licencia <span className="text-slate-300">CC BY 4.0</span>.
            </li>
            <li>
              Foto del huevo (easter egg) — “White chicken egg” vía <Ext href="https://commons.wikimedia.org/wiki/File:White_chicken_egg_square.jpg">Wikimedia Commons</Ext>, <span className="text-slate-300">CC BY 2.0</span>.
            </li>
            <li>
              Foto del pollito (easter egg) — “Day old chick” vía <Ext href="https://commons.wikimedia.org/wiki/File:Day_old_chick_white_background.jpg">Wikimedia Commons</Ext>, <span className="text-slate-300">GFDL 1.2</span>.
            </li>
          </ul>
        </section>

        {/* Fonti dati */}
        <section className="panel px-5 py-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300"><Database className="size-4 text-amber-400" /> Fuentes de datos</h2>
          <p className="text-xs leading-relaxed text-slate-400">
            AEDO lee datos públicos de: <span className="text-slate-300">{SOURCES}</span>.
            Todas las marcas y contenidos pertenecen a sus respectivos propietarios; AEDO no está afiliado a ninguno de ellos ni cuenta con su respaldo.
          </p>
        </section>

        {/* Legale */}
        <section className="panel px-5 py-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300"><ShieldAlert className="size-4 text-red-400" /> Aspectos legales y uso responsable</h2>
          <p className="text-xs leading-relaxed text-slate-400">
            AEDO se ofrece <span className="text-slate-300">“tal cual”, sin garantía de ningún tipo</span>. Eres responsable de cumplir los
            Términos de servicio de cada fuente de datos y las leyes de protección de datos aplicables en tu jurisdicción (p. ej., la Ley 1581 de 2012 en Colombia o el RGPD). Algunas fuentes restringen
            el acceso automatizado: activa solo lo que tienes derecho a usar. Los resultados de la IA pueden ser imprecisos o sesgados y deben revisarse antes de actuar con base en ellos.
            Para reportar un problema de seguridad, consulta <Ext href="https://github.com/Scognamiglio1969/radar-intelligence/blob/main/SECURITY.md">SECURITY.md</Ext>.
          </p>
        </section>

        <p className="pb-6 text-center text-[11px] text-slate-600">Hecho con curiosidad por un humano y una IA. 🛰️</p>
      </div>
    </>
  );
}
