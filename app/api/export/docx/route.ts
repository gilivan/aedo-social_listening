import { NextResponse } from 'next/server';
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Packer,
  Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { getCurrentProject } from '@/lib/data';
import { briefToBlocks, collectExportData, parseExportOptions, parseStudioIds, slugify, sourceLabel, todayStamp } from '@/lib/export-data';
import { resolveStudioBlocks } from '@/lib/studio';
import { AI_DISCLOSURE_LONG, AI_DISCLOSURE_META, AI_DISCLOSURE_SHORT } from '@/lib/ai-disclosure';
import {
  cannotSayTitle, channelGrid, channelTitle, competitiveGrid, competitiveTitle, findingGrid, kpiGrid, kpiTitle,
  overallLabel, peaksLine, periodLine, reliabilityTitle, verdictGroups,
} from '@/lib/kpi-export';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ACCENT = '0284C7';

function h1(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, children: [new TextRun({ text, color: ACCENT })] });
}
function h2(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text })] });
}
function p(text: string, opts: { bold?: boolean; size?: number; muted?: boolean } = {}) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, color: opts.muted ? '64748B' : undefined })],
  });
}
function bullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } });
}

function table(headers: string[], rows: string[][]) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D8DEE9' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((t) => new TableCell({
          shading: { fill: '16203C' },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, color: 'FFFFFF', size: 18 })] })],
        })),
      }),
      ...rows.map((r) => new TableRow({
        children: r.map((t) => new TableCell({
          borders: { top: border, bottom: border, left: border, right: border },
          children: [new Paragraph({ children: [new TextRun({ text: t, size: 18 })] })],
        })),
      })),
    ],
  });
}

export async function GET(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no hay proyecto' }, { status: 404 });
  const url = new URL(req.url);
  const { sections, days } = parseExportOptions(url);
  const has = (s: string) => sections.has(s as never);
  const [data, studio] = await Promise.all([
    collectExportData(project, days),
    resolveStudioBlocks(project.id, parseStudioIds(url)),
  ]);
  const today = new Date().toLocaleDateString('es-CO', { dateStyle: 'full' });

  const kpi = data.dashboard.kpi;
  const sentimentLabel = kpi.avgSentiment === null ? 'pendiente de análisis'
    : kpi.avgSentiment > 0.15 ? 'positivo' : kpi.avgSentiment < -0.15 ? 'negativo' : 'neutral';
  const totalBench = data.benchmark.reduce((s, r) => s + r.total, 0);

  const children: (Paragraph | Table)[] = [
    // Copertina
    new Paragraph({ spacing: { before: 2400, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'AEDO', bold: true, size: 28, color: ACCENT }), new TextRun({ text: '  ·  EL GRUPO', size: 18, color: '64748B' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: project.name, bold: true, size: 56 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'Informe de inteligencia de medios', size: 26, color: '64748B' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: today, size: 22, color: '64748B' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 2400 }, children: [new TextRun({ text: `Datos de los últimos ${days} días · Consulta: ${project.keywords.join(', ')}`, size: 20, color: '64748B' })] }),
  ];

  if (has('kpi')) {
    children.push(
      h1('De un vistazo'),
      bullet(`${kpi.total7.toLocaleString('es-CO')} menciones en los últimos 7 días de ${kpi.sources} fuentes activas`),
      bullet(`Sentimiento general: ${sentimentLabel}${kpi.avgSentiment !== null ? ` (puntaje ${kpi.avgSentiment.toFixed(2)})` : ''}`),
      bullet(`${data.dashboard.topTopics.length} temas detectados, ${data.alerts.length} alertas recientes`),
    );
  }

  // KPI standard, con le formule
  if (has('kpiStandard') && data.standard.raw.cur.n > 0) {
    const k = data.standard;
    const g = kpiGrid(k, data.reliability);
    children.push(h1(kpiTitle(k.lang)), p(periodLine(k), { muted: true, size: 16 }), table(g.headers, g.rows));
    for (const n of k.notes) children.push(p(n, { muted: true, size: 16 }));
    children.push(h2(k.lang === 'it' ? 'Formule e note' : 'Fórmulas y notas'));
    for (const x of k.kpis.filter((y) => y.formula || y.note)) {
      children.push(bullet(`${x.label}: ${[x.formula, x.note].filter(Boolean).join(' · ')}`));
    }
    if (k.channels.length) {
      const ch = channelGrid(k);
      children.push(h2(channelTitle(k.lang)), table(ch.headers, ch.rows));
    }
    const peaks = peaksLine(k);
    if (peaks) children.push(p(peaks));
    if (k.competitive.length) {
      const cg = competitiveGrid(k);
      children.push(h2(competitiveTitle(k.lang)), table(cg.headers, cg.rows));
    }
  }

  // Affidabilità dei dati (analisi critica L1)
  if (has('reliability') && data.standard.raw.cur.n > 0) {
    const r = data.reliability;
    const lang = data.standard.lang;
    children.push(h1(reliabilityTitle(lang)), p(`${overallLabel(r, lang)} — ${r.overallReason}`, { bold: true }));
    if (r.cannotSay.length) {
      children.push(h2(cannotSayTitle(lang)));
      for (const c of r.cannotSay) children.push(bullet(c));
    }
    if (r.findings.length) {
      const g = findingGrid(r, lang);
      children.push(table(g.headers, g.rows));
    }
    for (const grp of verdictGroups(r, lang)) {
      children.push(h2(grp.title));
      for (const item of grp.items) children.push(bullet(item));
    }
  }

  // Health Index (market + brand + confronto)
  if (has('health') && data.health.theme.total > 0) {
    children.push(h1(`Índice de salud del mercado — ${data.health.theme.score}/100 (${data.health.theme.grade})`));
    children.push(table(
      ['Métrica', 'Valor (0-100)', 'Peso'],
      data.health.theme.components.map((c) => [c.label, String(c.value), `${Math.round(c.weight * 100)}%`]),
    ));
    if (data.health.brand) {
      const b = data.health.brand;
      children.push(h2(`Salud de marca — ${b.name}: ${b.health.score}/100 (${b.health.grade}), ${b.health.score - data.health.theme.score >= 0 ? '+' : ''}${b.health.score - data.health.theme.score} vs. mercado`));
      children.push(table(
        ['Métrica', 'Valor (0-100)', 'Peso'],
        b.health.components.map((c) => [c.label, String(c.value), `${Math.round(c.weight * 100)}%`]),
      ));
    }
    if (data.health.compare.length > 1) {
      children.push(h2('Ranking de salud — tu marca vs. competidores'));
      children.push(table(
        ['Entidad', 'Puntaje de salud', 'Menciones', 'Tu marca'],
        data.health.compare.map((c) => [c.name, String(c.score), String(c.total), c.isBrand ? 'sí' : '']),
      ));
    }
  }

  // Emerging trends
  if (has('trends') && data.trends.length) {
    children.push(h1('Tendencias emergentes (últimas 24 horas)'));
    for (const t of data.trends.slice(0, 6)) {
      children.push(bullet(`×${t.score.toFixed(0)} ${t.topic} — ${t.n24} menciones/24 h${t.explanation ? `: ${t.explanation}` : ''}`));
    }
  }

  // Brief più recente
  if (has('brief') && data.briefs[0]) {
    children.push(h1(`Brief diario — ${new Date(data.briefs[0].briefDate).toLocaleDateString('es-CO')}`));
    for (const b of briefToBlocks(data.briefs[0].content)) {
      if (b.type === 'h2') children.push(h2(b.text));
      else if (b.type === 'bullet') children.push(bullet(b.text));
      else children.push(p(b.text));
    }
  }

  // Temi
  if (has('topics') && data.dashboard.topTopics.length) {
    children.push(h1('Temas principales (7 días)'));
    children.push(table(['Tema', 'Menciones'], data.dashboard.topTopics.map((t) => [t.topic, String(t.n)])));
  }

  // Semantic constellation
  if (has('constellation') && data.constellation.nodes.length) {
    children.push(h1('Constelación semántica — términos clave'));
    children.push(table(
      ['Término', 'Frecuencia', 'Sentimiento prom.'],
      data.constellation.nodes.map((n) => [n.term, String(n.freq), n.sentiment.toFixed(2)]),
    ));
    if (data.constellation.edges.length) {
      children.push(h2('Coocurrencias más fuertes'));
      for (const e of data.constellation.edges.slice(0, 15)) {
        children.push(bullet(`${e.a} + ${e.b} — aparecen juntos ${e.weight}×`));
      }
    }
  }

  // Author pyramid
  if (has('pyramid') && data.pyramid.tiers.length) {
    children.push(h1(`Pirámide de influencia de autores — el nivel superior concentra el ${data.pyramid.topConcentration}% del alcance`));
    children.push(table(
      ['Nivel', 'Autores', 'Participación en el alcance', 'Ejemplos'],
      data.pyramid.tiers.map((t) => [t.label, String(t.authors), `${t.sharePct}%`, t.examples.join(', ')]),
    ));
  }

  // Influencer network
  if (has('network') && data.network.nodes.length) {
    children.push(h1('Red de influenciadores — voces principales por comunidad'));
    children.push(table(
      ['Autor', 'Tema principal', 'Publicaciones', 'Engagement'],
      [...data.network.nodes].sort((a, b) => b.engagement - a.engagement).slice(0, 25)
        .map((n) => [n.label, n.community, String(n.posts), n.engagement.toLocaleString('es-CO')]),
    ));
  }

  // Conversation flow
  if (has('flow') && data.flow.links.length) {
    const lbl = new Map(data.flow.nodes.map((n) => [n.key, n.label]));
    children.push(h1('Flujo de la conversación — Fuente → Tema → Sentimiento'));
    children.push(table(
      ['Desde', 'Hacia', 'Menciones'],
      [...data.flow.links].sort((a, b) => b.value - a.value).slice(0, 25)
        .map((l) => [String(lbl.get(l.source) ?? l.source), String(lbl.get(l.target) ?? l.target), String(l.value)]),
    ));
  }

  // Momentum quadrant
  if (has('momentum') && data.momentum.length) {
    children.push(h1('Cuadrante de momentum — temas por volumen × aceleración'));
    children.push(table(
      ['Tema', 'Volumen', 'Aceleración', 'Cuadrante'],
      [...data.momentum].sort((a, b) => b.volume - a.volume).map((p) => [
        p.topic, String(p.volume), `${p.acceleration > 0 ? '+' : ''}${p.acceleration}%`, p.quadrant,
      ]),
    ));
  }

  // Emotion radar
  if (has('emotions') && data.emotions.length) {
    children.push(h1('Radar de emociones — huella emocional (30 días)'));
    children.push(table(
      ['Emoción', 'Menciones', 'Participación'],
      data.emotions.map((e) => [e.emotion, String(e.value), `${e.share}%`]),
    ));
  }

  // Geographic map
  if (has('geo') && data.geo.length) {
    children.push(h1('Mapa geográfico — conversación por zona (inferida por idioma)'));
    children.push(table(
      ['Zona / idioma', 'Menciones', 'Participación', 'Sentimiento prom.'],
      data.geo.map((g) => [
        g.country, String(g.volume), `${g.share}%`,
        g.sentiment === null ? '—' : g.sentiment.toFixed(2),
      ]),
    ));
  }

  // Share of Voice over time (riassunto per entità)
  if (has('sov') && data.sov.entities.length) {
    const totals = data.sov.entities.map((e) => ({ e, n: data.sov.days.reduce((s, d) => s + Number(d[e] ?? 0), 0) }));
    const grand = totals.reduce((s, t) => s + t.n, 0) || 1;
    children.push(h1('Share of Voice en el tiempo (30 días)'));
    children.push(table(
      ['Entidad', 'Menciones', 'Share of Voice'],
      totals.sort((a, b) => b.n - a.n).map((t) => [t.e, String(t.n), `${((t.n / grand) * 100).toFixed(1)}%`]),
    ));
  }

  // Benchmark
  if (has('benchmark') && data.benchmark.length) {
    children.push(h1('Benchmark — Share of Voice (14 días)'));
    children.push(table(
      ['Entidad', 'Menciones', 'Share of Voice', 'Sentimiento prom.'],
      data.benchmark.map((r) => [
        r.entity.name, String(r.total),
        totalBench ? `${((r.total / totalBench) * 100).toFixed(1)}%` : '—',
        r.avgSentiment === null ? '—' : r.avgSentiment.toFixed(2),
      ]),
    ));
  }

  // Audience
  if (has('audience') && data.audience.communities.length) {
    children.push(h1('Audiencia — dónde ocurre la conversación'));
    children.push(table(
      ['Comunidad', 'Fuente', 'Menciones'],
      data.audience.communities.slice(0, 10).map((c) => [c.community ?? '—', sourceLabel(c.source), String(c.n)]),
    ));
    children.push(h2('Idiomas de la conversación'));
    const langs = data.audience.languages.map((l) => `${l.language.toUpperCase()} (${l.n})`).join(' · ');
    children.push(p(langs || '—'));
  }

  // Top contenuti
  if (has('content') && data.ratings.length) {
    children.push(h1('Contenido principal por engagement (7 días)'));
    children.push(table(
      ['Contenido', 'Fuente', 'Engagement', 'Puntaje IA', 'Riesgo'],
      data.ratings.slice(0, 12).map((r) => [
        (r.title || r.content).slice(0, 90), sourceLabel(r.source),
        String(Math.round(r.engagementScore)),
        r.quality ? String(r.quality.score) : '—', r.quality?.risk ?? '—',
      ]),
    ));
  }

  // Point of View
  if (has('pov') && data.pov.pov) {
    const pv = data.pov.pov;
    children.push(h1('Punto de vista'));
    children.push(p(pv.headline, { bold: true, size: 26 }));
    for (const par of pv.intro ?? []) children.push(p(par.text));
    for (const [i, b] of pv.blocks.entries()) {
      children.push(h2(`${i + 1}. ${b.title}`));
      children.push(p(`${b.kind} · confianza ${b.confidence}`, { muted: true, size: 18 }));
      if (b.stats.length) {
        children.push(table(['Cifra', 'Qué mide'], b.stats.map((s) => [s.value, s.label])));
      }
      children.push(p(b.body));
    }
    if (pv.counterSignals.length) {
      children.push(h2('Contraseñales'));
      for (const c of pv.counterSignals) children.push(bullet(c.point));
    }
    if (pv.implications.length) {
      children.push(h2('¿Y qué significa?'));
      for (const t of pv.implications) children.push(bullet(t));
    }
    if (pv.watch.length) {
      children.push(h2('Qué vigilar'));
      for (const t of pv.watch) children.push(bullet(t));
    }
  }

  // Narrazioni
  if (has('narratives') && data.narratives.length) {
    children.push(h1('Narrativas'));
    for (const n of data.narratives) {
      children.push(bullet(`${n.title} [${n.stance ?? 'neutral'}${n.coordinated ? ', coordinada' : ''}] · ${n.mentionCount} publicaciones${n.description ? ` — ${n.description}` : ''}`));
    }
  }

  // Timeline
  if (has('timeline') && data.timeline.length) {
    children.push(h1('Línea de tiempo del sector'));
    for (const e of data.timeline.slice(0, 25)) {
      children.push(bullet(`${new Date(e.eventDate).toLocaleDateString('es-CO')} — ${e.title}${e.description ? `: ${e.description}` : ''}`));
    }
  }

  // Alert
  if (has('alerts') && data.alerts.length) {
    children.push(h1('Alertas recientes'));
    for (const a of data.alerts.slice(0, 8)) {
      const ex = (a.data as { explanation?: string } | null)?.explanation;
      children.push(bullet(`[${new Date(a.createdAt).toLocaleDateString('es-CO')}] ${a.message}${ex ? ` — ${ex}` : ''}`));
    }
  }

  // Crisis radar & peak
  if (has('crisis') && data.crisis.peak) {
    const pk = data.crisis.peak;
    children.push(h1(`Radar de crisis — riesgo ${data.crisis.risk}/100 (${data.crisis.level})`));
    children.push(p(`Factores de riesgo: ${data.crisis.drivers.map((d) => `${d.label} +${d.value}`).join(' · ')}`));
    children.push(h2(`Día pico: ${pk.day} — ${pk.volume} menciones, ${pk.negShare}% negativas`));
    if (pk.topics.length) children.push(p(`Temas: ${pk.topics.map((t) => `${t.topic} (${t.n})`).join(', ')}`));
    for (const c of pk.content) children.push(bullet(`[${sourceLabel(c.source)}] ${c.title}`));
  }

  // Note finali: informativa art. 50 in forma estesa.
  // ── Persone (personal branding). Erano solo nel PDF: chi le sceglieva e
  // poi esportava in Word non trovava niente, senza che nulla lo avvisasse.
  const ppl = data.people;
  if (has('people') && ppl.ranking.length > 1) {
    children.push(h1('Personas — el equipo de un vistazo'));
    children.push(table(
      ['Persona', 'Audiencia', 'Publicaciones / mes', 'Engagement prom.'],
      ppl.ranking.map((r) => [
        r.name,
        r.followers === null ? '—' : r.followers.toLocaleString('es-CO'),
        r.perMonth === null ? '—' : String(r.perMonth),
        r.engagement === null ? '—' : String(Math.round(r.engagement)),
      ]),
    ));
    children.push(p('Tres medidas distintas: quien tiene la audiencia más grande no es necesariamente quien más la involucra.', { muted: true, size: 16 }));
  }
  if (has('peopleGrowth') && ppl.cards.some((x) => x.followers)) {
    children.push(h1('Crecimiento de audiencia por persona'));
    const rows = ppl.cards.filter((x) => x.followers)
      .sort((a, b) => b.followers!.gained - a.followers!.gained);
    children.push(table(['Persona', 'Ganados', 'Actual'], rows.map((x) => [
      x.name,
      `${x.followers!.gained >= 0 ? '+' : ''}${x.followers!.gained.toLocaleString('es-CO')}`,
      x.followers!.latest.toLocaleString('es-CO'),
    ])));
    const span = rows[0]?.followers;
    if (span) children.push(p(`Ganados entre ${span.from} y ${span.to}.`, { muted: true, size: 16 }));
  }
  if (has('peopleDetail') && ppl.cards.length) {
    children.push(h1('Fichas por persona'));
    for (const c of ppl.cards) {
      if (!c.followers && !c.rhythm && !c.averages.length) continue;
      children.push(h2(c.name));
      const bits: string[] = [];
      if (c.followers) bits.push(`${c.followers.latest.toLocaleString('es-CO')} seguidores (${c.followers.gained >= 0 ? '+' : ''}${c.followers.gained.toLocaleString('es-CO')} desde ${c.followers.from})`);
      if (c.rhythm) bits.push(`${c.rhythm.perMonth} publicaciones/mes durante ${c.rhythm.months} meses${c.rhythm.trend !== null ? ` (${c.rhythm.trend >= 0 ? '+' : ''}${c.rhythm.trend}%)` : ''}`);
      for (const a of c.averages.slice(0, 3)) bits.push(`${a.metric}: ${a.value}`);
      if (bits.length) children.push(p(bits.join('  ·  '), { muted: true, size: 16 }));
      if (c.formats.length) children.push(bullet(`Mejor formato: ${c.formats[0].name} (engagement prom. ${c.formats[0].avgEngagement} en ${c.formats[0].posts} publicaciones)`));
      if (c.audience.length) {
        const a = c.audience[0];
        children.push(bullet(`Audiencia por ${a.dimension}: ${a.rows.slice(0, 4).map((r) => `${r.name} ${(r.share * 100).toFixed(0)}%`).join(', ')}`));
      }
    }
  }

  // I grafici costruiti in Studio Graph: una tabella per ciascuno, con il
  // proprio periodo dichiarato — è il suo, non quello del report.
  for (const chart of studio.values()) {
    children.push(h1(chart.title));
    children.push(p(
      `${chart.yLabel} por ${chart.xLabel}${chart.zLabel ? `, dividido por ${chart.zLabel}` : ''} · últimos ${chart.days} días`,
      { muted: true, size: 16 },
    ));
    if (!chart.rows.length) {
      children.push(p('No hay datos con estos campos en el periodo del gráfico.', { muted: true }));
      continue;
    }
    const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString('es-CO')
      : v.toLocaleString('es-CO', { maximumFractionDigits: 2 }));
    const series = [...new Set(chart.rows.map((r) => r.z).filter(Boolean))] as string[];
    if (series.length > 1) {
      const cols = series.slice(0, 6);
      const xs = [...new Set(chart.rows.map((r) => r.x))].slice(0, 40);
      children.push(table([chart.xLabel, ...cols], xs.map((x) => [x, ...cols.map((z) => {
        const v = chart.rows.filter((r) => r.x === x && r.z === z).reduce((a, r) => a + r.y, 0);
        return v ? num(v) : '—';
      })])));
    } else {
      children.push(table([chart.xLabel, chart.yLabel],
        chart.rows.slice(0, 60).map((r) => [r.x, num(r.y)])));
    }
  }

  children.push(new Paragraph({
    spacing: { before: 400, after: 80 },
    children: [new TextRun({ text: 'NOTA', bold: true, size: 16, color: '94A3B8' })],
  }));
  children.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: AI_DISCLOSURE_LONG, size: 15, color: '64748B' })],
  }));

  const doc = new Document({
    creator: 'AEDO',
    // Marcatura leggibile da una macchina (AI Act art. 50, par. 2).
    subject: AI_DISCLOSURE_META.subject,
    keywords: AI_DISCLOSURE_META.keywords,
    description: AI_DISCLOSURE_META.description,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [{
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: AI_DISCLOSURE_SHORT, size: 13, color: '94A3B8' })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `AEDO — ${project.name} — pág. `, size: 16, color: '94A3B8' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '94A3B8' }),
              ],
            }),
          ],
        }),
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="aedo-${slugify(project.name)}-${todayStamp()}.docx"`,
    },
  });
}
