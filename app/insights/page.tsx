import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import {
  Activity, Boxes, Gauge, Globe2, Grid3x3, HeartPulse, LayoutGrid, Orbit, Scale,
  ScatterChart, ShieldAlert, Sparkles, Triangle, TrendingDown, Waypoints, Network, Workflow,
} from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { getDb } from '@/lib/db';
import { studioCharts } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { fieldLabel, type StudioSpec } from '@/lib/studio';
import { InsightStudioCards } from '@/components/insight-studio-cards';

export const metadata = { title: 'Explorar insights' };
export const dynamic = 'force-dynamic';

// Hub degli insight: 16 visualizzazioni raggruppate per DOMANDA a cui rispondono.
// In elenco nel menu erano illeggibili (metà delle voci) e il nome da solo non
// diceva a cosa servissero: qui ognuna arriva con la sua domanda.
const GROUPS: {
  title: string;
  hint: string;
  items: { href: string; label: string; icon: typeof Activity; question: string }[];
}[] = [
  {
    title: 'Forma de la conversación',
    hint: 'De qué se habla y cómo se conectan los temas',
    items: [
      { href: '/insights/topics', label: 'Temas × Sentimiento', icon: ScatterChart, question: '¿Qué temas son grandes, cuáles gustan o se odian, cuáles están creciendo?' },
      { href: '/insights/constellation', label: 'Constelación semántica', icon: Sparkles, question: '¿Qué palabras aparecen juntas y con qué tono?' },
      { href: '/insights/flow', label: 'Flujo de la conversación', icon: Waypoints, question: '¿Qué fuente alimenta qué tema y cómo termina en sentimiento?' },
      { href: '/insights/clusters', label: 'Clusters de conversación', icon: Boxes, question: '¿En qué familias de discurso (los encuadres) se divide la conversación?' },
    ],
  },
  {
    title: 'Personas',
    hint: 'Quién sostiene la conversación',
    items: [
      { href: '/insights/network', label: 'Red de influenciadores', icon: Network, question: '¿Cuáles son las voces más fuertes y qué tribus temáticas forman?' },
      { href: '/insights/pyramid', label: 'Pirámide de autores', icon: Triangle, question: '¿El alcance se concentra en pocas voces grandes o está muy repartido?' },
    ],
  },
  {
    title: 'Momentum y salud',
    hint: 'Hacia dónde va y qué tan sana está',
    items: [
      { href: '/insights/health', label: 'Índice de salud', icon: Gauge, question: 'Un puntaje de 0 a 100: ¿qué tan sana está la conversación y tu marca en ella?' },
      { href: '/insights/momentum', label: 'Cuadrante de momentum', icon: LayoutGrid, question: '¿Qué temas son estrellas en ascenso y cuáles se están apagando?' },
      { href: '/insights/sov', label: 'Share of Voice', icon: Activity, question: '¿Qué parte de la conversación le pertenece a cada actor a lo largo del tiempo?' },
      { href: '/insights/waterfall', label: 'Cascada de sentimiento', icon: TrendingDown, question: 'Día a día, ¿qué hizo subir o bajar el ánimo?' },
      { href: '/insights/emotions', label: 'Radar de emociones', icon: HeartPulse, question: 'Más allá de positivo/negativo: ¿alegría, confianza, miedo, ira, tristeza, sorpresa?' },
    ],
  },
  {
    title: 'Contexto',
    hint: 'Dónde y cuándo ocurre',
    items: [
      { href: '/insights/heatmap', label: 'Mapa de calor por hora', icon: Grid3x3, question: '¿En qué días y horas vive realmente la conversación?' },
    ],
  },
  {
    title: 'Tus canales',
    hint: 'Cómo les va a tus publicaciones frente a todo lo que se dice de ti',
    items: [
      { href: '/insights/owned', label: 'Propios vs. ganados', icon: Scale, question: '¿Tus publicaciones funcionan o la conversación ocurre totalmente sin ti?' },
    ],
  },
  {
    title: 'Riesgo',
    hint: 'Qué podría salir mal y qué causó qué',
    items: [
      { href: '/insights/crisis', label: 'Radar de crisis', icon: ShieldAlert, question: '¿Qué tan expuesto estás ahora mismo y qué impulsó el último pico?' },
      { href: '/insights/causal', label: 'Causa y efecto', icon: Workflow, question: '¿Qué eventos produjeron consecuencias medibles?' },
    ],
  },
  {
    title: 'El panorama completo',
    hint: 'Todo a la vez, para una pantalla o una demo',
    items: [
      { href: '/insights/galaxy', label: 'Galaxia de la conversación', icon: Orbit, question: 'Toda la conversación como un sistema solar vivo.' },
    ],
  },
];

export default async function InsightsHubPage() {
  const total = GROUPS.reduce((s, g) => s + g.items.length, 0);

  // I grafici costruiti in Studio Graph da chi usa questo progetto. La domanda
  // a cui rispondono non la scrive nessuno: la si legge dagli assi, che è
  // esattamente ciò che il grafico è.
  const project = await getCurrentProject();
  let mine: { id: number; title: string; question: string }[] = [];
  if (project) {
    const db = await getDb();
    const rows = await db.select().from(studioCharts)
      .where(eq(studioCharts.projectId, project.id))
      .orderBy(desc(studioCharts.updatedAt));
    mine = rows.map((r) => {
      const spec = r.spec as unknown as StudioSpec;
      const src = spec.source === 'metrics' ? 'metrics' : 'mentions';
      const parts = [
        `${fieldLabel(src, spec.y)} por ${fieldLabel(src, spec.x)}`,
        ...(spec.z ? [`dividido por ${fieldLabel(src, spec.z)}`] : []),
        `últimos ${spec.days} días`,
      ];
      return { id: r.id, title: r.title, question: `${parts.join(' · ')}.` };
    });
  }
  return (
    <>
      <PageHeader
        title="Explorar insights"
        info={`Las ${total} visualizaciones avanzadas, agrupadas por la pregunta que responden y no por tipo de gráfico. Cada una usa las menciones que ha recopilado tu proyecto; las que funcionan con IA (clusters, causa y efecto) se generan bajo demanda y se guardan en caché durante el día.`}
        subtitle={`${total} formas de leer la misma conversación${mine.length ? `, más ${mine.length} que construiste tú` : ''}, agrupadas por la pregunta que quieres responder. Cada tarjeta dice para qué sirve: elige la pregunta, no el gráfico.`}
      />
      <div className="flex flex-col gap-6">
        {mine.length > 0 && (
          <section>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-slate-200">Tus gráficos</h2>
              <span className="text-[11px] text-slate-600">
                construidos por ti en <Link href="/graph" className="text-violet-400 hover:underline">Studio Graph</Link> — solo estos se pueden quitar
              </span>
            </div>
            <InsightStudioCards charts={mine} />
          </section>
        )}

        {GROUPS.map((g) => (
          <section key={g.title}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-slate-200">{g.title}</h2>
              <span className="text-[11px] text-slate-600">{g.hint}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} title={it.question}
                  className="panel group flex items-start gap-3 px-4 py-3 transition hover:border-sky-500/40 hover:bg-sky-500/[0.04]">
                  <it.icon className="mt-0.5 size-4 shrink-0 text-sky-400" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200 transition group-hover:text-sky-200">{it.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{it.question}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
