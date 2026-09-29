import PDFDocument from 'pdfkit';
import { SOURCE_META } from '@/lib/connectors';
import { AI_DISCLOSURE_LONG, AI_DISCLOSURE_META, AI_DISCLOSURE_SHORT } from '@/lib/ai-disclosure';
import { briefToBlocks, sourceLabel, type ExportData, type Project } from '@/lib/export-data';
import type { SectionId } from '@/lib/export-sections';
import {
  cannotSayTitle, channelGrid, channelTitle, competitiveGrid, competitiveTitle, findingGrid, kpiGrid, kpiTitle,
  overallLabel, peaksLine, periodLine, reliabilityTitle, verdictGroups,
} from '@/lib/kpi-export';

// ---------------------------------------------------------------------------
// Motore PDF condiviso.
//
// Le sezioni sono funzioni indipendenti in una mappa, non un blocco di if
// dentro la route: così lo STESSO renderer serve sia il report completo (tutte
// le sezioni nell'ordine canonico) sia il report personalizzato (le sezioni
// scelte dall'utente, nel suo ordine, alternate ai suoi commenti). Senza questa
// separazione i due report divergerebbero al primo ritocco grafico.
//
// L'ordine di inserzione delle chiavi in SECTION_RENDERERS È l'ordine del
// report completo: JavaScript conserva l'ordine delle chiavi stringa.
// ---------------------------------------------------------------------------

const ACCENT = '#0284c7';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const PANEL = '#f1f5f9';
const SENT: Record<string, string> = { positive: '#16a34a', neutral: '#64748b', negative: '#dc2626' };
/** Etiquetas visibles para los valores de sentimiento (los valores no cambian). */
const SENT_LABEL: Record<string, string> = { positive: 'positivo', neutral: 'neutro', negative: 'negativo' };
const CONF_LABEL: Record<string, string> = { high: 'alta', medium: 'media', low: 'baja' };
const KIND_LABEL: Record<string, string> = {
  trend: 'tendencia', innovation: 'innovación', concept: 'concepto', risk: 'riesgo', opportunity: 'oportunidad',
};
const STANCE_LABEL: Record<string, string> = { polarizzante: 'polarizante', neutral: 'neutra' };

// pdfkit con font standard (Helvetica) codifica in WinAnsi: rimuovo i caratteri
// fuori da Latin-1 (emoji, CJK, arabo) per evitare crash di rendering.
export function sanitize(s: string | null | undefined): string {
  return (s ?? '')
    // La punteggiatura tipografica sta fuori da Latin-1: senza questa
    // traslitterazione verrebbe cancellata e "dell'intelligenza" diventerebbe
    // "dellintelligenza". Va fatta PRIMA del filtro, non dopo.
    .replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '').replace(/\s+/g, ' ').trim();
}

type Doc = InstanceType<typeof PDFDocument>;

/** Le primitive di disegno, legate a un documento e alla sua area utile. */
export type Ctx = {
  doc: Doc;
  left: number; right: number; contentW: number;
  ensure: (h: number) => void;
  heading: (text: string) => void;
  para: (text: string, opts?: { size?: number; color?: string; bold?: boolean; gap?: number }) => void;
  hbars: (items: { label: string; value: number; color?: string; sub?: string }[], color?: string) => void;
  table: (headers: string[], rows: string[][], widths: number[], align?: ('left' | 'right' | 'center')[]) => void;
  stackedBars: (rows: { day: string; source: string; n: number }[]) => void;
};

function makeCtx(doc: Doc): Ctx {
  const M = doc.page.margins;
  const left = M.left;
  const right = doc.page.width - M.right;
  const contentW = right - left;
  const bottomLimit = () => doc.page.height - M.bottom;

  const ensure = (h: number) => { if (doc.y + h > bottomLimit()) doc.addPage(); };

  const heading = (text: string) => {
    ensure(40);
    doc.moveDown(0.6);
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(15).text(sanitize(text), left, doc.y);
    const y = doc.y + 3;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(BORDER).stroke();
    doc.moveDown(0.5);
    doc.fillColor(TEXT);
  };

  const para: Ctx['para'] = (text, opts = {}) => {
    ensure(20);
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? 10)
      .fillColor(opts.color ?? TEXT).text(sanitize(text), left, doc.y, { width: contentW });
    doc.moveDown(opts.gap ?? 0.3);
  };

  // Barre orizzontali con etichetta e valore
  const hbars: Ctx['hbars'] = (items, color = ACCENT) => {
    const max = Math.max(1, ...items.map((i) => i.value));
    for (const it of items) {
      ensure(20);
      const y = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(TEXT).text(sanitize(it.label), left, y, { width: contentW * 0.42, ellipsis: true });
      doc.fillColor(MUTED).text(`${it.value.toLocaleString('es-CO')}${it.sub ? ` · ${it.sub}` : ''}`, right - 120, y, { width: 120, align: 'right' });
      const barY = y + 12;
      const trackX = left + contentW * 0.44;
      const trackW = contentW - contentW * 0.44 - 130;
      doc.roundedRect(trackX, barY, trackW, 5, 2.5).fill(PANEL);
      doc.roundedRect(trackX, barY, Math.max(2, (it.value / max) * trackW), 5, 2.5).fill(it.color ?? color);
      doc.fillColor(TEXT);
      doc.y = barY + 12;
    }
  };

  // Tabella con intestazione
  const table: Ctx['table'] = (headers, rows, widths, align = []) => {
    const colX = (i: number) => left + widths.slice(0, i).reduce((s, w) => s + w * contentW, 0);
    const drawHeader = () => {
      ensure(24);
      const y = doc.y;
      doc.rect(left, y, contentW, 18).fill(PANEL);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
      headers.forEach((h, i) => doc.text(sanitize(h).toUpperCase(), colX(i) + 4, y + 5, { width: widths[i] * contentW - 8, align: align[i] ?? 'left' }));
      doc.y = y + 18;
      doc.fillColor(TEXT);
    };
    drawHeader();
    doc.font('Helvetica').fontSize(9);
    for (const r of rows) {
      const cellH = Math.max(...r.map((c, i) => doc.heightOfString(sanitize(c), { width: widths[i] * contentW - 8 }))) + 8;
      if (doc.y + cellH > bottomLimit()) { doc.addPage(); drawHeader(); doc.font('Helvetica').fontSize(9); }
      const y = doc.y;
      r.forEach((c, i) => doc.fillColor(TEXT).text(sanitize(c), colX(i) + 4, y + 4, { width: widths[i] * contentW - 8, align: align[i] ?? 'left' }));
      doc.moveTo(left, y + cellH).lineTo(right, y + cellH).lineWidth(0.5).strokeColor(BORDER).stroke();
      doc.y = y + cellH;
    }
    doc.moveDown(0.5);
  };

  // Grafico a barre impilate (volume per fonte nel tempo)
  const stackedBars: Ctx['stackedBars'] = (rows) => {
    const days = [...new Set(rows.map((r) => r.day))].sort();
    const sources = [...new Set(rows.map((r) => r.source))];
    const totals = days.map((d) => rows.filter((r) => r.day === d).reduce((s, r) => s + r.n, 0));
    const max = Math.max(1, ...totals);
    const chartH = 150;
    ensure(chartH + 40);
    const top = doc.y;
    const baseY = top + chartH;
    const slot = contentW / days.length;
    const barW = Math.min(26, slot * 0.6);
    days.forEach((d, di) => {
      const cx = left + slot * di + slot / 2;
      let y = baseY;
      for (const src of sources) {
        const n = rows.find((r) => r.day === d && r.source === src)?.n ?? 0;
        if (!n) continue;
        const h = (n / max) * chartH;
        y -= h;
        doc.rect(cx - barW / 2, y, barW, h).fill((SOURCE_META[src]?.color ?? '#94a3b8'));
      }
      if (di % Math.ceil(days.length / 8) === 0) {
        doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
          .text(d.slice(5), cx - slot / 2, baseY + 4, { width: slot, align: 'center' });
      }
    });
    doc.moveTo(left, baseY).lineTo(right, baseY).lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.y = baseY + 16;
    // Legenda
    let lx = left;
    doc.fontSize(7.5);
    for (const src of sources) {
      const label = sourceLabel(src);
      const w = doc.widthOfString(label) + 16;
      if (lx + w > right) { lx = left; doc.moveDown(0.8); }
      doc.roundedRect(lx, doc.y + 1, 7, 7, 1.5).fill(SOURCE_META[src]?.color ?? '#94a3b8');
      doc.fillColor(MUTED).text(label, lx + 10, doc.y, { continued: false });
      lx += w + 4;
      doc.y -= doc.currentLineHeight();
    }
    doc.moveDown(1.4);
    doc.fillColor(TEXT);
  };

  return { doc, left, right, contentW, ensure, heading, para, hbars, table, stackedBars };
}

// --- Le sezioni ------------------------------------------------------------
// Ognuna sa dire se ha dati da mostrare: il report personalizzato deve poter
// avvisare l'utente che un grafico scelto uscirà vuoto, prima di generarlo.

type Section = {
  has: (d: ExportData) => boolean;
  render: (c: Ctx, d: ExportData, meta: { days: number }) => void;
};

export const SECTION_RENDERERS: Record<SectionId, Section> = {
  kpi: {
    has: () => true,
    render: (c, d) => {
      const kpi = d.dashboard.kpi;
      const sentimentLabel = kpi.avgSentiment === null ? 'en análisis'
        : kpi.avgSentiment > 0.15 ? 'positivo' : kpi.avgSentiment < -0.15 ? 'negativo' : 'neutro';
      c.heading('Resumen');
      const cards: [string, string][] = [
        ['Menciones (7 días)', kpi.total7.toLocaleString('es-CO')],
        ['Sentimiento prom.', sentimentLabel],
        ['Fuentes activas', String(kpi.sources)],
        ['Temas detectados', String(d.dashboard.topTopics.length)],
      ];
      c.ensure(70);
      const cw = (c.contentW - 24) / 4;
      const y0 = c.doc.y;
      cards.forEach(([label, value], i) => {
        const x = c.left + i * (cw + 8);
        c.doc.roundedRect(x, y0, cw, 60, 6).fillAndStroke(PANEL, BORDER);
        c.doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x + 8, y0 + 10, { width: cw - 16 });
        c.doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT).text(value, x + 8, y0 + 26, { width: cw - 16 });
      });
      c.doc.y = y0 + 72;
    },
  },

  kpiStandard: {
    has: (d) => d.standard.raw.cur.n > 0,
    render: (c, d) => {
      const k = d.standard;
      c.heading(kpiTitle(k.lang));
      c.para(periodLine(k), { size: 8, color: MUTED, gap: 0.3 });
      const g = kpiGrid(k, d.reliability);
      c.table(g.headers, g.rows, [0.3, 0.12, 0.12, 0.1, 0.1, 0.26], ['left', 'right', 'right', 'right', 'right', 'left']);
      for (const n of k.notes) c.para(n, { size: 8, color: MUTED, gap: 0.2 });
      // Le formule sotto la tabella, non dentro: in una colonna stretta di A4
      // sarebbero illeggibili, e chi rifà il conto le cerca comunque qui.
      const formulas = k.kpis.filter((x) => x.formula || x.note);
      if (formulas.length) {
        c.para(k.lang === 'it' ? 'Formule e note' : 'Fórmulas y notas', { bold: true, size: 9, gap: 0.1 });
        for (const x of formulas) {
          c.para(`${x.label}: ${[x.formula, x.note].filter(Boolean).join(' · ')}`, { size: 7.5, color: MUTED, gap: 0.05 });
        }
        c.para('', { gap: 0.3 });
      }
      if (k.channels.length) {
        c.para(channelTitle(k.lang), { bold: true, size: 10, gap: 0.2 });
        const ch = channelGrid(k);
        c.table(ch.headers, ch.rows, [0.19, 0.1, 0.1, 0.11, 0.11, 0.09, 0.09, 0.09, 0.12],
          ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right']);
      }
      const peaks = peaksLine(k);
      if (peaks) c.para(peaks, { size: 9, gap: 0.4 });
      if (k.competitive.length) {
        c.para(competitiveTitle(k.lang), { bold: true, size: 10, gap: 0.2 });
        const cg = competitiveGrid(k);
        c.table(cg.headers, cg.rows, [0.28, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12],
          ['left', 'right', 'right', 'right', 'right', 'right', 'right']);
      }
    },
  },

  reliability: {
    has: (d) => d.standard.raw.cur.n > 0,
    render: (c, d) => {
      const r = d.reliability;
      const lang = d.standard.lang;
      c.heading(reliabilityTitle(lang));
      c.para(`${overallLabel(r, lang)} — ${r.overallReason}`, { bold: true, size: 11, gap: 0.4 });
      if (r.cannotSay.length) {
        c.para(cannotSayTitle(lang), { bold: true, size: 10, gap: 0.1 });
        for (const x of r.cannotSay) c.para(`•  ${x}`, { size: 9, gap: 0.1 });
        c.para('', { gap: 0.3 });
      }
      if (r.findings.length) {
        const g = findingGrid(r, lang);
        c.table(g.headers, g.rows, [0.22, 0.24, 0.24, 0.1, 0.2]);
      }
      for (const grp of verdictGroups(r, lang)) {
        c.para(grp.title, { bold: true, size: 9.5, gap: 0.1 });
        c.para(grp.items.join(' · '), { size: 8.5, color: MUTED, gap: 0.3 });
      }
    },
  },

  health: {
    has: (d) => d.health.theme.total > 0,
    render: (c, d) => {
      c.heading(`Índice de salud del mercado — ${d.health.theme.score}/100 (${d.health.theme.grade})`);
      c.hbars(d.health.theme.components.map((x) => ({ label: x.label, value: x.value })));
      if (d.health.brand) {
        const b = d.health.brand;
        c.para(`Salud de la marca — ${b.name}: ${b.health.score}/100 (${b.health.grade}), ${b.health.score - d.health.theme.score >= 0 ? '+' : ''}${b.health.score - d.health.theme.score} vs. mercado`, { bold: true, size: 10, gap: 0.2 });
        c.hbars(b.health.components.map((x) => ({ label: x.label, value: x.value })));
      }
      if (d.health.compare.length > 1) {
        c.para('Ranking de salud — tu marca vs. competidores:', { bold: true, size: 10, gap: 0.2 });
        c.hbars(d.health.compare.map((x) => ({ label: `${x.isBrand ? '★ ' : ''}${x.name}`, value: x.score })));
      }
    },
  },

  trends: {
    has: (d) => d.trends.length > 0,
    render: (c, d) => {
      c.heading('Tendencias emergentes (últimas 24 horas)');
      for (const t of d.trends.slice(0, 6)) {
        c.para(`x${t.score.toFixed(0)}  ${t.topic}  —  ${t.n24} menciones/24 h`, { bold: true, size: 10, gap: 0.1 });
        if (t.explanation) c.para(t.explanation, { size: 9, color: MUTED, gap: 0.4 });
      }
    },
  },

  volume: {
    has: (d) => d.dashboard.volumeByDay.length > 0,
    render: (c, d) => {
      c.heading('Volumen por fuente');
      c.stackedBars(d.dashboard.volumeByDay.map((r) => ({ ...r, n: Number(r.n) })));
    },
  },

  sentiment: {
    has: (d) => d.dashboard.sentimentDist.length > 0,
    render: (c, d) => {
      c.heading('Sentimiento');
      const tot = d.dashboard.sentimentDist.reduce((s, r) => s + r.n, 0) || 1;
      c.hbars(d.dashboard.sentimentDist.map((r) => ({
        label: SENT_LABEL[r.sentiment] ?? r.sentiment, value: r.n, color: SENT[r.sentiment] ?? MUTED,
        sub: `${Math.round((r.n / tot) * 100)}%`,
      })));
    },
  },

  topics: {
    has: (d) => d.dashboard.topTopics.length > 0,
    render: (c, d) => {
      c.heading('Temas principales');
      c.hbars(d.dashboard.topTopics.slice(0, 12).map((t) => ({ label: t.topic, value: Number(t.n) })));
    },
  },

  constellation: {
    has: (d) => d.constellation.nodes.length > 0,
    render: (c, d) => {
      c.heading('Constelación semántica — términos clave');
      c.hbars(d.constellation.nodes.slice(0, 14).map((n) => ({ label: n.term, value: n.freq })));
      if (d.constellation.edges.length) {
        c.para('Coocurrencias más fuertes:', { bold: true, size: 10, gap: 0.2 });
        for (const e of d.constellation.edges.slice(0, 10)) {
          c.para(`${e.a} + ${e.b} — ${e.weight}x`, { size: 9, color: MUTED, gap: 0.15 });
        }
      }
    },
  },

  pyramid: {
    has: (d) => d.pyramid.tiers.length > 0,
    render: (c, d) => {
      c.heading(`Pirámide de influencia de autores — el nivel superior concentra el ${d.pyramid.topConcentration}% del alcance`);
      c.hbars(d.pyramid.tiers.map((t) => ({ label: `${t.label} (${t.authors})`, value: t.sharePct })));
    },
  },

  network: {
    has: (d) => d.network.nodes.length > 0,
    render: (c, d) => {
      c.heading('Red de influenciadores — voces principales por comunidad');
      c.table(
        ['Autor', 'Tema principal', 'Posts', 'Engagement'],
        [...d.network.nodes].sort((a, b) => b.engagement - a.engagement).slice(0, 20)
          .map((n) => [n.label, n.community, String(n.posts), n.engagement.toLocaleString('es-CO')]),
        [0.36, 0.34, 0.14, 0.16], ['left', 'left', 'right', 'right'],
      );
    },
  },

  flow: {
    has: (d) => d.flow.links.length > 0,
    render: (c, d) => {
      const lbl = new Map(d.flow.nodes.map((n) => [n.key, n.label]));
      c.heading('Flujo de conversación — Fuente → Tema → Sentimiento');
      c.table(
        ['Desde', 'Hacia', 'Menciones'],
        [...d.flow.links].sort((a, b) => b.value - a.value).slice(0, 22)
          .map((l) => [String(lbl.get(l.source) ?? l.source), String(lbl.get(l.target) ?? l.target), String(l.value)]),
        [0.44, 0.44, 0.12], ['left', 'left', 'right'],
      );
    },
  },

  momentum: {
    has: (d) => d.momentum.length > 0,
    render: (c, d) => {
      c.heading('Cuadrante de momentum — volumen × aceleración');
      c.table(
        ['Tema', 'Volumen', 'Aceleración', 'Cuadrante'],
        [...d.momentum].sort((a, b) => b.volume - a.volume).map((p) => [
          p.topic, String(p.volume), `${p.acceleration > 0 ? '+' : ''}${p.acceleration}%`, p.quadrant,
        ]),
        [0.4, 0.18, 0.22, 0.2], ['left', 'right', 'right', 'left'],
      );
    },
  },

  emotions: {
    has: (d) => d.emotions.length > 0,
    render: (c, d) => {
      c.heading('Radar de emociones — huella emocional');
      c.hbars(d.emotions.map((e) => ({ label: e.emotion, value: e.value })));
    },
  },

  geo: {
    has: (d) => d.geo.length > 0,
    render: (c, d) => {
      c.heading('Mapa geográfico — por área (inferida del idioma)');
      c.table(
        ['Área / idioma', 'Menciones', 'Cuota', 'Sentimiento'],
        d.geo.map((g) => [
          g.country, String(g.volume), `${g.share}%`,
          g.sentiment === null ? '—' : g.sentiment.toFixed(2),
        ]),
        [0.42, 0.2, 0.19, 0.19], ['left', 'right', 'right', 'right'],
      );
    },
  },

  sov: {
    has: (d) => d.sov.entities.length > 0,
    render: (c, d) => {
      const totals = d.sov.entities.map((e) => ({ e, n: d.sov.days.reduce((s, x) => s + Number(x[e] ?? 0), 0) }));
      const grand = totals.reduce((s, t) => s + t.n, 0) || 1;
      c.heading('Share of Voice en el tiempo (30 días)');
      c.hbars(totals.sort((a, b) => b.n - a.n).map((t) => ({ label: `${t.e} (${((t.n / grand) * 100).toFixed(0)}%)`, value: t.n })));
    },
  },

  benchmark: {
    has: (d) => d.benchmark.length > 0,
    render: (c, d) => {
      c.heading('Benchmark — Share of Voice');
      const tot = d.benchmark.reduce((s, r) => s + r.total, 0) || 1;
      c.table(
        ['Entidad', 'Menciones', 'Share of Voice', 'Sentimiento'],
        d.benchmark.map((r) => [
          r.entity.name, String(r.total), `${((r.total / tot) * 100).toFixed(1)}%`,
          r.avgSentiment === null ? '—' : r.avgSentiment.toFixed(2),
        ]),
        [0.4, 0.2, 0.22, 0.18], ['left', 'right', 'right', 'right'],
      );
    },
  },

  audience: {
    has: (d) => d.audience.communities.length > 0,
    render: (c, d) => {
      c.heading('Audiencia — dónde ocurre la conversación');
      c.hbars(d.audience.communities.slice(0, 10).map((x) => ({
        label: `${x.community ?? '—'} (${sourceLabel(x.source)})`, value: x.n,
      })), '#7c3aed');
      if (d.audience.languages.length) {
        c.doc.moveDown(0.3);
        c.para('Idiomas: ' + d.audience.languages.map((l) => `${l.language.toUpperCase()} (${l.n})`).join('  ·  '), { size: 9, color: MUTED });
      }
    },
  },

  content: {
    has: (d) => d.ratings.length > 0,
    render: (c, d) => {
      c.heading('Contenido destacado por engagement');
      c.table(
        ['Contenido', 'Fuente', 'Engagement', 'IA', 'Riesgo'],
        d.ratings.slice(0, 15).map((r) => [
          (r.title || r.content).slice(0, 110), sourceLabel(r.source),
          String(Math.round(r.engagementScore)), r.quality ? String(r.quality.score) : '—', r.quality?.risk ?? '—',
        ]),
        [0.46, 0.16, 0.16, 0.1, 0.12], ['left', 'left', 'right', 'right', 'left'],
      );
    },
  },

  pov: {
    has: (d) => Boolean(d.pov.pov),
    render: (c, d) => {
      const p = d.pov.pov;
      if (!p) return;
      c.heading('Punto de vista');
      c.para(p.headline, { bold: true, size: 12, gap: 0.4 });
      for (const par of p.intro ?? []) c.para(par.text, { size: 10, gap: 0.35 });
      if ((p.intro ?? []).length) c.doc.moveDown(0.2);
      for (const [i, b] of p.blocks.entries()) {
        c.para(`${i + 1}. ${b.title}  [${KIND_LABEL[b.kind] ?? b.kind} · confianza ${CONF_LABEL[b.confidence] ?? b.confidence}]`, { bold: true, size: 10.5, gap: 0.2 });
        if (b.stats.length) {
          c.para(b.stats.map((s) => `${s.value} — ${s.label}`).join('   ·   '), { size: 9, color: ACCENT, gap: 0.2 });
        }
        c.para(b.body, { size: 9.5, gap: 0.45 });
      }
      if (p.counterSignals.length) {
        c.para('Contraseñales', { bold: true, size: 10.5, gap: 0.2 });
        for (const x of p.counterSignals) c.para(`•  ${x.point}`, { size: 9.5, color: MUTED, gap: 0.2 });
      }
      if (p.implications.length) {
        c.para('Y entonces qué', { bold: true, size: 10.5, gap: 0.2 });
        for (const t of p.implications) c.para(`→  ${t}`, { size: 9.5, gap: 0.2 });
      }
      if (p.watch.length) {
        c.para('Qué vigilar', { bold: true, size: 10.5, gap: 0.2 });
        for (const t of p.watch) c.para(`◦  ${t}`, { size: 9.5, gap: 0.2 });
      }
    },
  },

  narratives: {
    has: (d) => d.narratives.length > 0,
    render: (c, d) => {
      c.heading('Narrativas');
      for (const n of d.narratives) {
        c.para(`${n.title}  [${STANCE_LABEL[n.stance ?? 'neutral'] ?? n.stance}${n.coordinated ? ', coordinada' : ''}]  · ${n.mentionCount} posts`, { bold: true, size: 10, gap: 0.1 });
        if (n.description) c.para(n.description, { size: 9, color: MUTED, gap: 0.4 });
      }
    },
  },

  timeline: {
    has: (d) => d.timeline.length > 0,
    render: (c, d) => {
      c.heading('Línea de tiempo del sector');
      for (const e of d.timeline.slice(0, 25)) {
        c.para(`${new Date(e.eventDate).toLocaleDateString('es-CO')} — ${e.title}${e.importance === 3 ? '  (punto de inflexión)' : ''}`, { bold: true, size: 9.5, gap: 0.1 });
        if (e.description) c.para(e.description, { size: 9, color: MUTED, gap: 0.4 });
      }
    },
  },

  crisis: {
    has: (d) => Boolean(d.crisis.peak),
    render: (c, d) => {
      const pk = d.crisis.peak;
      if (!pk) return;
      c.heading(`Radar de crisis — riesgo ${d.crisis.risk}/100 (${d.crisis.level})`);
      c.para(`Factores de riesgo: ${d.crisis.drivers.map((x) => `${x.label} +${x.value}`).join('  ·  ')}`, { size: 9, color: MUTED, gap: 0.3 });
      c.para(`Día pico: ${pk.day} — ${pk.volume} menciones, ${pk.negShare}% negativas, sentimiento prom. ${pk.sentiment}`, { bold: true, size: 10, gap: 0.2 });
      if (pk.topics.length) c.para(`Temas: ${pk.topics.map((t) => `${t.topic} (${t.n})`).join(', ')}`, { size: 9, color: MUTED, gap: 0.3 });
      for (const x of pk.content) c.para(`• [${sourceLabel(x.source)}] ${x.title}`, { size: 9, gap: 0.15 });
    },
  },

  alerts: {
    has: (d) => d.alerts.length > 0,
    render: (c, d) => {
      c.heading('Alertas recientes');
      for (const a of d.alerts.slice(0, 12)) {
        c.para(`[${new Date(a.createdAt).toLocaleDateString('es-CO')}] ${a.message}`, { size: 9.5, bold: true, gap: 0.1 });
        const ex = (a.data as { explanation?: string } | null)?.explanation;
        if (ex) c.para(ex, { size: 9, color: MUTED, gap: 0.4 });
      }
    },
  },

  brief: {
    has: (d) => Boolean(d.briefs[0]),
    render: (c, d) => {
      const b0 = d.briefs[0];
      if (!b0) return;
      c.heading(`Brief diario — ${new Date(b0.briefDate).toLocaleDateString('es-CO')}`);
      for (const b of briefToBlocks(b0.content)) {
        if (b.type === 'h2') c.para(b.text, { bold: true, size: 11, color: ACCENT, gap: 0.2 });
        else if (b.type === 'bullet') c.para(`•  ${b.text}`, { size: 9.5, gap: 0.2 });
        else c.para(b.text, { size: 9.5, gap: 0.3 });
      }
    },
  },

  // --- Personal branding -------------------------------------------------
  // Le persone entrano nel report come le altre sezioni, così una relazione
  // sul personal branding si compone senza uscire da Radar.

  people: {
    has: (d) => d.people.ranking.length > 1,
    render: (c, d) => {
      c.heading('Personas — el equipo de un vistazo');
      c.table(
        ['Persona', 'Audiencia', 'Posts / mes', 'Engagement prom.'],
        d.people.ranking.map((r) => [
          r.name,
          r.followers === null ? '—' : r.followers.toLocaleString('es-CO'),
          r.perMonth === null ? '—' : String(r.perMonth),
          r.engagement === null ? '—' : String(Math.round(r.engagement)),
        ]),
        [0.34, 0.22, 0.22, 0.22], ['left', 'right', 'right', 'right'],
      );
      c.para('Tres medidas distintas: quien tiene la audiencia más grande no es necesariamente quien más la involucra.',
        { size: 9, color: MUTED });
    },
  },

  peopleGrowth: {
    has: (d) => d.people.cards.some((p) => p.followers),
    render: (c, d) => {
      c.heading('Crecimiento de audiencia por persona');
      const rows = d.people.cards.filter((p) => p.followers)
        .sort((a, b) => (b.followers!.gained) - (a.followers!.gained));
      c.hbars(rows.map((p) => ({
        label: p.name,
        value: p.followers!.gained,
        sub: `hoy ${p.followers!.latest.toLocaleString('es-CO')}`,
      })));
      const span = rows[0]?.followers;
      if (span) c.para(`Ganados entre el ${span.from} y el ${span.to}.`, { size: 9, color: MUTED });
    },
  },

  peopleDetail: {
    has: (d) => d.people.cards.length > 0,
    render: (c, d) => {
      c.heading('Fichas de personas');
      for (const p of d.people.cards) {
        if (!p.followers && !p.rhythm && !p.averages.length) continue;
        c.para(p.name, { bold: true, size: 11, gap: 0.15 });
        const bits: string[] = [];
        if (p.followers) {
          bits.push(`${p.followers.latest.toLocaleString('es-CO')} seguidores (${p.followers.gained >= 0 ? '+' : ''}${p.followers.gained.toLocaleString('es-CO')} desde el ${p.followers.from})`);
        }
        if (p.rhythm) {
          bits.push(`${p.rhythm.perMonth} posts/mes en ${p.rhythm.months} meses${p.rhythm.trend !== null ? ` (${p.rhythm.trend >= 0 ? '+' : ''}${p.rhythm.trend}%)` : ''}`);
        }
        for (const a of p.averages.slice(0, 3)) bits.push(`${a.metric}: ${a.value}`);
        c.para(bits.join('  ·  '), { size: 9, color: MUTED, gap: 0.2 });
        if (p.formats.length) {
          c.para(`Mejor formato: ${p.formats[0].name} (engagement prom. ${p.formats[0].avgEngagement} en ${p.formats[0].posts} posts)`,
            { size: 9, gap: 0.2 });
        }
        if (p.audience.length) {
          const a = p.audience[0];
          c.para(`Audiencia por ${a.dimension}: ${a.rows.slice(0, 4).map((r) => `${r.name} ${(r.share * 100).toFixed(0)}%`).join(', ')}`,
            { size: 9, color: MUTED, gap: 0.4 });
        }
      }
    },
  },

  mentions: {
    has: (d) => d.allMentions.length > 0,
    render: (c, d) => {
      c.heading(`Lista de menciones (las ${Math.min(d.allMentions.length, 150)} más recientes)`);
      c.table(
        ['Fecha', 'Fuente', 'Título / texto', 'Sent.'],
        d.allMentions.slice(0, 150).map((m) => {
          const txt = sanitize(m.title ?? m.content);
          return [
            new Date(m.publishedAt).toLocaleDateString('es-CO'), sourceLabel(m.source),
            txt || '[contenido en alfabeto no latino — ver original]', m.sentiment ? (SENT_LABEL[m.sentiment] ?? m.sentiment) : '—',
          ];
        }),
        [0.13, 0.15, 0.58, 0.14], ['left', 'left', 'left', 'left'],
      );
    },
  },
};

/**
 * Che lavoro fa un commento nella pagina. Non è decorazione: cambia dove il
 * blocco viene inserito, cosa viene chiesto al modello e come si presenta
 * nel PDF stampato.
 */
export type CommentRole = 'intro' | 'comment' | 'synthesis' | 'free';

/**
 * A schermo il ruolo si riconosce da un'icona; sulla carta le icone non
 * esistono, quindi diventa un'etichetta e un filetto colorato. Il suffisso
 * "· AI" resta separato dal ruolo: sono due informazioni diverse.
 */
export const ROLE_STYLE: Record<CommentRole, { label: string; color: string }> = {
  intro: { label: 'PRESENTACIÓN', color: '#0284c7' },
  comment: { label: 'COMENTARIO', color: '#7c3aed' },
  synthesis: { label: 'SÍNTESIS DE LA PÁGINA', color: '#0d9488' },
  free: { label: 'NOTA', color: '#64748b' },
};

/** Un blocco di report personalizzato: un grafico oppure un commento. */
export type ReportBlock =
  | { type: 'chart'; section: SectionId }
  | { type: 'text'; text: string; ai?: boolean; role?: CommentRole }
  | { type: 'studio'; chartId: number };

/**
 * Un grafico di Studio Graph già eseguito. Il PDF non interroga il database:
 * riceve i numeri già pronti, come per ogni altra sezione.
 */
export type StudioRendered = {
  title: string;
  xLabel: string; yLabel: string; zLabel?: string;
  /** Il periodo del grafico: è il suo, non quello del report. */
  days: number;
  palette: string[];
  rows: { x: string; y: number; z?: string }[];
};

export type ReportPage = { title?: string; blocks: ReportBlock[] };

type BuildOptions = {
  project: Project;
  data: ExportData;
  days: number;
  /** Report completo: sezioni da includere, nell'ordine canonico. */
  sections?: Set<string>;
  /** Report personalizzato: pagine composte dall'utente. Vince su `sections`. */
  pages?: ReportPage[];
  /** I grafici di Studio Graph citati dalle pagine, già eseguiti. */
  studio?: Map<number, StudioRendered>;
  subtitle?: string;
};

/**
 * Un grafico di Studio Graph dentro il PDF.
 *
 * Con una sola serie diventa una classifica a barre; con piu serie una
 * tabella, perche impilare otto colori su una pagina stampata in bianco e nero
 * non si legge. La forma scelta a schermo resta quella dello schermo: qui
 * conta che i numeri arrivino leggibili.
 */
function renderStudio(c: Ctx, chart: StudioRendered, reportDays: number) {
  c.heading(chart.title);
  // Un grafico di Studio Graph porta con sé il proprio periodo, scelto quando
  // è stato costruito. Se non è quello dichiarato in copertina va detto qui,
  // altrimenti il lettore attribuisce alla pagina un arco di tempo che non ha.
  const period = chart.days === reportDays
    ? `últimos ${chart.days} días`
    : `últimos ${chart.days} días — periodo propio del gráfico, distinto de los ${reportDays} del reporte`;
  // Se il titolo è quello proposto in automatico ("Y per X") la didascalia non
  // lo ripete: dice solo quello che il titolo non dice.
  const what = `${chart.yLabel} por ${chart.xLabel}`;
  const said = chart.title.trim().toLowerCase() === what.toLowerCase();
  const parts = [
    ...(said ? [] : [what]),
    ...(chart.zLabel ? [`dividido por ${chart.zLabel}`] : []),
    period,
  ];
  c.para(`${parts.join(' · ')}.`, { size: 8.5, color: MUTED, gap: 0.5 });
  if (!chart.rows.length) {
    c.para('No hay datos con estos campos en el periodo del reporte.', { size: 9, color: MUTED });
    return;
  }

  const series = [...new Set(chart.rows.map((r) => r.z).filter(Boolean))] as string[];
  const fmtN = (n: number) => (Number.isInteger(n) ? n.toLocaleString('es-CO')
    : n.toLocaleString('es-CO', { maximumFractionDigits: 2 }));

  if (series.length < 2) {
    const items = chart.rows.slice(0, 25).map((r, i) => ({
      label: r.x, value: r.y, color: chart.palette[i % chart.palette.length],
    }));
    c.hbars(items);
    if (chart.rows.length > items.length) {
      c.para(`Otros ${chart.rows.length - items.length} elementos no mostrados.`, { size: 8, color: MUTED });
    }
    return;
  }

  const cols = series.slice(0, 5);
  const xs = [...new Set(chart.rows.map((r) => r.x))].slice(0, 20);
  const cell = (x: string, z: string) => {
    const v = chart.rows.filter((r) => r.x === x && r.z === z).reduce((s2, r) => s2 + r.y, 0);
    return v ? fmtN(v) : '—';
  };
  const w = 0.34 / cols.length;
  c.table(
    [chart.xLabel, ...cols],
    xs.map((x) => [x, ...cols.map((z) => cell(x, z))]),
    [0.66, ...cols.map(() => w)],
    ['left', ...cols.map(() => 'right' as const)],
  );
  if (series.length > cols.length) {
    c.para(`Otras ${series.length - cols.length} series no mostradas: en el PDF la tabla es legible hasta cinco columnas.`, { size: 8, color: MUTED });
  }
}

export async function buildReportPdf(opts: BuildOptions): Promise<Buffer> {
  const { project, data, days, sections, pages, subtitle, studio } = opts;

  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: 56, bottom: 64, left: 56, right: 56 },
    info: {
      Title: `AEDO — ${sanitize(project.name)}`,
      Author: 'AEDO',
      // Marcatura leggibile da una macchina (AI Act art. 50, par. 2).
      Subject: sanitize(AI_DISCLOSURE_META.subject),
      Keywords: sanitize(AI_DISCLOSURE_META.keywords),
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const c = makeCtx(doc);

  // ---- Copertina ----
  doc.moveDown(6);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text('AEDO', { align: 'center', characterSpacing: 3 });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('BY SCOGNAMIGLIO 2026', { align: 'center', characterSpacing: 2 });
  doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(30).fillColor(TEXT).text(sanitize(project.name), { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(13).fillColor(MUTED).text(sanitize(subtitle ?? 'Reporte de inteligencia de medios'), { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(new Date().toLocaleDateString('es-CO', { dateStyle: 'full' }), { align: 'center' });
  doc.fontSize(9).text(`Datos de los últimos ${days} días · Consulta: ${sanitize(project.keywords.join(', '))}`, { align: 'center' });
  doc.addPage();

  if (pages) {
    // ---- Report personalizzato: una pagina PDF per pagina composta ----
    pages.forEach((page, pi) => {
      if (pi > 0) doc.addPage();
      if (page.title?.trim()) {
        doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT).text(sanitize(page.title), c.left, doc.y, { width: c.contentW });
        doc.moveDown(0.6);
      }
      for (const block of page.blocks) {
        if (block.type === 'text') {
          if (!block.text.trim()) continue;
          // Il commento resta distinguibile dal dato: etichetta di ruolo e
          // filetto colorato a sinistra. L'etichetta dice anche quando il
          // testo è stato generato dall'AI, come chiede l'art. 50.
          const style = ROLE_STYLE[block.role ?? (block.ai ? 'comment' : 'free')];
          c.ensure(48);
          const y0 = doc.y;
          doc.font('Helvetica-Bold').fontSize(6.5).fillColor(style.color)
            .text(`${style.label}${block.ai ? ' · IA' : ''}`, c.left + 12, y0, { characterSpacing: 1 });
          doc.moveDown(0.15);
          doc.font('Helvetica').fontSize(10).fillColor(TEXT)
            .text(sanitize(block.text), c.left + 12, doc.y, { width: c.contentW - 12, align: 'justify' });
          const y1 = doc.y;
          doc.rect(c.left, y0, 3, Math.max(10, y1 - y0)).fill(style.color);
          doc.fillColor(TEXT);
          doc.y = y1;
          doc.moveDown(0.6);
        } else if (block.type === 'studio') {
          const chart = studio?.get(block.chartId);
          if (!chart) {
            c.para('Gráfico de Studio Graph ya no disponible: se eliminó después de insertarlo en el reporte.', { size: 9, color: MUTED });
            continue;
          }
          renderStudio(c, chart, days);
        } else {
          const s = SECTION_RENDERERS[block.section];
          if (!s) continue;
          if (!s.has(data)) { c.para('No hay datos disponibles para esta sección en el periodo elegido.', { size: 9, color: MUTED }); continue; }
          s.render(c, data, { days });
        }
      }
    });
  } else {
    // ---- Report completo: ordine canonico ----
    for (const [id, s] of Object.entries(SECTION_RENDERERS)) {
      if (sections && !sections.has(id)) continue;
      if (!s.has(data)) continue;
      s.render(c, data, { days });
    }
    // I grafici costruiti in Studio Graph chiudono il report: non hanno un
    // posto nell'ordine canonico perché non esistevano quando è stato scritto.
    if (studio) for (const chart of studio.values()) renderStudio(c, chart, days);
  }

  // ---- Note (informativa AI Act) ----
  c.ensure(120);
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('NOTAS', c.left, doc.y, { characterSpacing: 1.5 });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(sanitize(AI_DISCLOSURE_LONG), c.left, doc.y, { width: c.contentW, align: 'justify' });

  // ---- Piè di pagina con numeri di pagina ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Azzerare il margine inferiore evita che il testo nel margine faccia
    // credere a pdfkit di dover impaginare, generando pagine vuote.
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 40;
    // Informativa art. 50 ripetuta su ogni pagina: leggibile, non nascosta.
    doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
      .text(sanitize(AI_DISCLOSURE_SHORT), c.left, fy - 11, { width: c.contentW, lineBreak: false });
    doc.fontSize(8);
    doc.text(`AEDO · By Scognamiglio 2026 — ${sanitize(project.name)}`, c.left, fy, { width: c.contentW * 0.7, lineBreak: false });
    doc.text(`pág. ${i + 1} / ${range.count}`, c.right - 120, fy, { width: 120, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
