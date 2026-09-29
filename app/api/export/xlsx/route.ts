import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getCurrentProject } from '@/lib/data';
import { collectExportData, parseExportOptions, parseStudioIds, slugify, sourceLabel, todayStamp } from '@/lib/export-data';
import { resolveStudioBlocks } from '@/lib/studio';
import { AI_DISCLOSURE_LONG, AI_DISCLOSURE_META, AI_DISCLOSURE_SHORT } from '@/lib/ai-disclosure';
import { competitiveTitle, findingGrid, overallLabel, periodLine, verdictGroups, verdictLabel } from '@/lib/kpi-export';
import type { KpiUnit } from '@/lib/kpi-standard';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const HEADER_STYLE: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16203C' } },
};

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width?: number }[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ ...c, width: c.width ?? 18 }));
  ws.getRow(1).eachCell((cell) => Object.assign(cell, { style: HEADER_STYLE }));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  // Piè di pagina di stampa: l'informativa segue il foglio anche quando viene
  // stampato o convertito in PDF, dove il foglio "Note" non arriva.
  ws.headerFooter = { oddFooter: `&L&7${AI_DISCLOSURE_SHORT}&R&7&P / &N` };
  return ws;
}

/** Formato numerico di Excel per unità: il valore resta un numero ricalcolabile. */
const NUM_FMT: Record<KpiUnit, string> = {
  count: '#,##0', pct: '0.0"%"', points: '0.0', ratio: '0.00', index: '"×"0.0', perDay: '0.0',
};

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

  const wb = new ExcelJS.Workbook();
  wb.creator = 'AEDO';
  wb.created = new Date();
  // Marcatura leggibile da una macchina (AI Act art. 50, par. 2).
  wb.subject = AI_DISCLOSURE_META.subject;
  wb.keywords = AI_DISCLOSURE_META.keywords;
  wb.description = AI_DISCLOSURE_META.description;

  // 1. Mention
  if (has('mentions')) {
  const wsM = sheet(wb, 'Menciones', [
    { header: 'Fecha', key: 'data', width: 17 },
    { header: 'Fuente', key: 'fonte', width: 13 },
    { header: 'Título', key: 'titolo', width: 45 },
    { header: 'Texto', key: 'testo', width: 60 },
    { header: 'Autor', key: 'autore', width: 20 },
    { header: 'Comunidad', key: 'community', width: 20 },
    { header: 'Idioma', key: 'lingua', width: 8 },
    { header: 'Sentimiento', key: 'sentiment', width: 11 },
    { header: 'Puntaje', key: 'score', width: 8 },
    { header: 'Me gusta', key: 'like', width: 8 },
    { header: 'Comentarios', key: 'commenti', width: 10 },
    { header: 'Compartidos', key: 'condivisioni', width: 12 },
    { header: 'Engagement', key: 'engagement', width: 12 },
    { header: 'Temas', key: 'temi', width: 30 },
    { header: 'URL', key: 'url', width: 45 },
  ]);
  for (const m of data.allMentions) {
    wsM.addRow({
      data: m.publishedAt, fonte: sourceLabel(m.source), titolo: m.title ?? '',
      testo: m.content.slice(0, 500), autore: m.authorHandle ?? m.author ?? '',
      community: m.community ?? '', lingua: m.language ?? '',
      sentiment: m.sentiment ?? 'pendiente', score: m.sentimentScore,
      like: m.engagement?.likes, commenti: m.engagement?.comments,
      condivisioni: m.engagement?.shares, engagement: Math.round(m.engagementScore),
      temi: (m.topics ?? []).join(', '), url: m.url ?? '',
    });
  }
  }

  // 2. Volume giornaliero per fonte
  if (has('volume')) {
  const wsV = sheet(wb, 'Volumen diario', [
    { header: 'Día', key: 'g', width: 12 },
    { header: 'Fuente', key: 'f', width: 15 },
    { header: 'Menciones', key: 'n', width: 10 },
  ]);
  for (const r of data.dashboard.volumeByDay) {
    wsV.addRow({ g: r.day, f: sourceLabel(r.source), n: Number(r.n) });
  }
  }

  // 3. Sentiment
  if (has('sentiment')) {
  const wsS = sheet(wb, 'Sentimiento', [
    { header: 'Sentimiento', key: 's', width: 14 },
    { header: 'Menciones (7 días)', key: 'n', width: 18 },
  ]);
  for (const r of data.dashboard.sentimentDist) wsS.addRow({ s: r.sentiment, n: r.n });
  }

  // 3·kpi. KPI standard — numeri veri, non testo: chi apre il file deve poter
  // rifare i conti, e una cella "1.234,5" scritta come testo non si somma.
  if (has('kpiStandard') && data.standard.raw.cur.n > 0) {
    const k = data.standard;
    const it = k.lang === 'it';
    const verdicts = new Map(data.reliability.verdicts.map((v) => [v.id, v]));
    const wsK = sheet(wb, 'KPI estándar', [
      { header: 'KPI', key: 'k', width: 34 },
      { header: it ? 'Valore' : 'Valor', key: 'v', width: 14 },
      { header: it ? 'Periodo prec.' : 'Periodo ant.', key: 'p', width: 14 },
      { header: 'Δ', key: 'd', width: 12 },
      { header: it ? 'Δ% (Δ in punti per le percentuali)' : 'Δ% (Δ en puntos para porcentajes)', key: 'dp', width: 16 },
      { header: it ? 'Tipo' : 'Tipo', key: 't', width: 12 },
      { header: it ? 'Base (menzioni)' : 'Base (menciones)', key: 'b', width: 14 },
      { header: it ? 'Affidabilità' : 'Fiabilidad', key: 'r', width: 40 },
      { header: 'Fórmula', key: 'f', width: 60 },
      { header: it ? 'Note' : 'Notas', key: 'n', width: 60 },
    ]);
    for (const x of k.kpis) {
      const v = verdicts.get(x.id);
      const row = wsK.addRow({
        k: x.label,
        v: x.value ?? (it ? 'n.d.' : 'N/D'),
        p: x.previous ?? (it ? 'n.d.' : 'N/D'),
        d: x.delta ?? '',
        dp: x.deltaPct === null ? '' : x.deltaPct / 100,
        t: x.kind === 'absolute' ? (it ? 'assoluto' : 'absoluto') : (it ? 'calcolato' : 'calculado'),
        b: x.base,
        r: v ? verdictLabel(v.verdict, k.lang) + (v.verdict !== 'reliable' ? ` — ${v.reason}` : '') : '',
        f: x.formula ?? '', n: x.note ?? '',
      });
      for (const key of ['v', 'p', 'd'] as const) row.getCell(key).numFmt = NUM_FMT[x.unit];
      row.getCell('dp').numFmt = '0.0%';
    }
    wsK.addRow({});
    wsK.addRow({ k: periodLine(k) });
    for (const n of k.notes) wsK.addRow({ k: n });

    if (k.channels.length) {
      const wsCh = sheet(wb, 'KPI por canal', [
        { header: it ? 'Canale' : 'Canal', key: 'c', width: 18 },
        { header: it ? 'Menzioni' : 'Menciones', key: 'm', width: 11 },
        { header: it ? 'Menzioni periodo prec.' : 'Menciones periodo ant.', key: 'pm', width: 14 },
        { header: it ? '% sul totale' : '% del total', key: 's', width: 11 },
        { header: it ? 'Reach potenziale' : 'Alcance potencial', key: 'r', width: 14 },
        { header: 'Engagement', key: 'e', width: 12 },
        { header: it ? 'Eng. medio' : 'Eng. prom.', key: 'em', width: 11 },
        { header: 'ER alcance %', key: 'er', width: 11 },
        { header: 'NSS', key: 'nss', width: 8 },
        { header: it ? 'Δ% menzioni' : 'Δ% menciones', key: 'dm', width: 12 },
      ]);
      for (const c of k.channels) {
        const row = wsCh.addRow({
          c: sourceLabel(c.source) + (c.previousMentions === 0 && !k.previousIncomplete ? (it ? ' (nuova)' : ' (nuevo)') : ''),
          m: c.mentions, pm: c.previousMentions,
          s: c.share === null ? '' : c.share / 100,
          r: c.reach ?? 'n.d.', e: c.engagement ?? 'n.d.', em: c.engPerMention ?? 'n.d.',
          er: c.erReach === null ? 'n.d.' : c.erReach / 100,
          nss: c.nss ?? 'n.d.',
          dm: c.deltaMentionsPct === null ? '' : c.deltaMentionsPct / 100,
        });
        row.getCell('s').numFmt = '0.0%';
        row.getCell('er').numFmt = '0.00%';
        row.getCell('dm').numFmt = '0.0%';
        row.getCell('em').numFmt = '0.00';
        row.getCell('nss').numFmt = '0.0';
      }
    }

    if (k.competitive.length) {
      const wsCo = sheet(wb, 'KPI competitivos', [
        { header: it ? 'Entità' : 'Entidad', key: 'n', width: 22 },
        { header: it ? 'Il tuo brand' : 'Tu marca', key: 'b', width: 11 },
        { header: it ? 'Menzioni' : 'Menciones', key: 'm', width: 11 },
        { header: 'SOV', key: 'sov', width: 9 },
        { header: it ? 'Δ SOV (punti)' : 'Δ SOV (puntos)', key: 'd', width: 13 },
        { header: 'Engagement', key: 'e', width: 12 },
        { header: 'SOE', key: 'soe', width: 9 },
        { header: it ? 'Positive' : 'Positivas', key: 'pos', width: 9 },
        { header: 'Share of Positive Voice', key: 'spv', width: 20 },
        { header: 'NSS', key: 'nss', width: 8 },
      ]);
      for (const c of k.competitive) {
        const row = wsCo.addRow({
          n: c.name, b: c.isOwnBrand ? (it ? 'sì' : 'sí') : '',
          m: c.mentions,
          sov: c.sov === null ? '' : c.sov / 100,
          d: k.previousIncomplete || c.sovDeltaPoints === null ? '' : c.sovDeltaPoints,
          e: c.engagement,
          soe: c.soe === null ? '' : c.soe / 100,
          pos: c.positive,
          spv: c.spv === null ? '' : c.spv / 100,
          nss: c.nss ?? 'n.d.',
        });
        for (const key of ['sov', 'soe', 'spv'] as const) row.getCell(key).numFmt = '0.0%';
        row.getCell('d').numFmt = '+0.0;-0.0;0.0';
        row.getCell('nss').numFmt = '0.0';
      }
      wsCo.addRow({});
      wsCo.addRow({ n: competitiveTitle(k.lang) });
    }
  }

  // 3·affidabilità. L'analisi critica L1 — rilievi, cosa non dire, verdetti.
  if (has('reliability') && data.standard.raw.cur.n > 0) {
    const r = data.reliability;
    const lang = data.standard.lang;
    const it = lang === 'it';
    const g = findingGrid(r, lang);
    const wsR = sheet(wb, 'Fiabilidad de los datos', g.headers.map((h, i) => ({ header: h, key: `c${i}`, width: [40, 50, 50, 12, 45][i] })));
    for (const row of g.rows) {
      const added = wsR.addRow(Object.fromEntries(row.map((v, i) => [`c${i}`, v])));
      added.alignment = { wrapText: true, vertical: 'top' };
    }
    wsR.addRow({});
    wsR.addRow({ c0: `${overallLabel(r, lang)} — ${r.overallReason}` }).font = { bold: true };
    if (r.cannotSay.length) {
      wsR.addRow({});
      wsR.addRow({ c0: it ? 'Cosa non si può scrivere nel report' : 'Lo que el informe no puede afirmar' }).font = { bold: true };
      for (const c of r.cannotSay) wsR.addRow({ c0: c });
    }
    for (const grp of verdictGroups(r, lang)) {
      wsR.addRow({});
      wsR.addRow({ c0: grp.title }).font = { bold: true };
      for (const item of grp.items) wsR.addRow({ c0: item });
    }
  }

  // 3a. Health Index (market + brand + confronto)
  if (has('health') && data.health.theme.total > 0) {
  const wsH = sheet(wb, 'Índice de salud', [
    { header: 'Ámbito', key: 'sc', width: 20 },
    { header: 'Métrica', key: 'm', width: 20 },
    { header: 'Valor (0-100)', key: 'v', width: 14 },
    { header: 'Peso', key: 'w', width: 10 },
  ]);
  wsH.addRow({ sc: 'Mercado', m: `GENERAL — ${data.health.theme.grade}`, v: data.health.theme.score, w: '100%' });
  for (const c of data.health.theme.components) wsH.addRow({ sc: 'Mercado', m: c.label, v: c.value, w: `${Math.round(c.weight * 100)}%` });
  if (data.health.brand) {
    wsH.addRow({ sc: `Marca: ${data.health.brand.name}`, m: `GENERAL — ${data.health.brand.health.grade}`, v: data.health.brand.health.score, w: '100%' });
    for (const c of data.health.brand.health.components) wsH.addRow({ sc: `Marca: ${data.health.brand.name}`, m: c.label, v: c.value, w: `${Math.round(c.weight * 100)}%` });
  }
  if (data.health.compare.length > 1) {
    const wsC = sheet(wb, 'Ranking de salud', [
      { header: 'Entidad', key: 'e', width: 26 },
      { header: 'Puntaje de salud', key: 's', width: 14 },
      { header: 'Menciones', key: 'n', width: 10 },
      { header: 'Tu marca', key: 'b', width: 12 },
    ]);
    for (const c of data.health.compare) wsC.addRow({ e: c.name, s: c.score, n: c.total, b: c.isBrand ? 'sí' : '' });
  }
  }

  // 3b. Emotion radar
  if (has('emotions') && data.emotions.length) {
  const wsE = sheet(wb, 'Radar de emociones', [
    { header: 'Emoción', key: 'e', width: 14 },
    { header: 'Menciones', key: 'n', width: 10 },
    { header: 'Part. %', key: 'sh', width: 10 },
  ]);
  for (const e of data.emotions) wsE.addRow({ e: e.emotion, n: e.value, sh: e.share });
  }

  // 4. Temi
  if (has('topics')) {
  const wsT = sheet(wb, 'Temas', [
    { header: 'Tema', key: 't', width: 30 },
    { header: 'Menciones', key: 'n', width: 10 },
  ]);
  for (const r of data.dashboard.topTopics) wsT.addRow({ t: r.topic, n: Number(r.n) });
  }

  // 4·pyramid. Author influence pyramid
  if (has('pyramid') && data.pyramid.tiers.length) {
  const wsPy = sheet(wb, 'Pirámide de autores', [
    { header: 'Nivel', key: 't', width: 16 },
    { header: 'Autores', key: 'a', width: 10 },
    { header: 'Alcance', key: 'r', width: 12 },
    { header: '% del alcance', key: 's', width: 16 },
    { header: 'Ejemplos', key: 'e', width: 40 },
  ]);
  for (const t of data.pyramid.tiers) {
    wsPy.addRow({ t: t.label, a: t.authors, r: Math.round(t.reach), s: t.sharePct, e: t.examples.join(', ') });
  }
  }

  // 4·network. Influencer network (top autori per community)
  if (has('network') && data.network.nodes.length) {
  const wsNet = sheet(wb, 'Red de influenciadores', [
    { header: 'Autor', key: 'a', width: 24 },
    { header: 'Tema principal', key: 'c', width: 22 },
    { header: 'Fuente', key: 'f', width: 14 },
    { header: 'Publicaciones', key: 'p', width: 8 },
    { header: 'Engagement', key: 'e', width: 12 },
  ]);
  for (const n of [...data.network.nodes].sort((a, b) => b.engagement - a.engagement)) {
    wsNet.addRow({ a: n.label, c: n.community, f: sourceLabel(n.source), p: n.posts, e: n.engagement });
  }
  }

  // 4·flow. Conversation flow (Source → Topic → Sentiment)
  if (has('flow') && data.flow.links.length) {
  const lbl = new Map(data.flow.nodes.map((n) => [n.key, n.label]));
  const wsF = sheet(wb, 'Flujo de la conversación', [
    { header: 'Desde', key: 'a', width: 24 },
    { header: 'Hacia', key: 'b', width: 24 },
    { header: 'Menciones', key: 'n', width: 10 },
  ]);
  for (const l of [...data.flow.links].sort((a, b) => b.value - a.value)) {
    wsF.addRow({ a: lbl.get(l.source) ?? l.source, b: lbl.get(l.target) ?? l.target, n: l.value });
  }
  }

  // 4·constellation. Semantic constellation (termini + co-occorrenze)
  if (has('constellation') && data.constellation.nodes.length) {
  const wsN = sheet(wb, 'Términos clave', [
    { header: 'Término', key: 't', width: 26 },
    { header: 'Frecuencia', key: 'f', width: 12 },
    { header: 'Sentimiento prom.', key: 's', width: 16 },
  ]);
  for (const n of data.constellation.nodes) wsN.addRow({ t: n.term, f: n.freq, s: n.sentiment });
  if (data.constellation.edges.length) {
    const wsE = sheet(wb, 'Coocurrencia de términos', [
      { header: 'Término A', key: 'a', width: 24 },
      { header: 'Término B', key: 'b', width: 24 },
      { header: 'Juntos (n)', key: 'w', width: 12 },
    ]);
    for (const e of data.constellation.edges) wsE.addRow({ a: e.a, b: e.b, w: e.weight });
  }
  }

  // 4a. Momentum quadrant
  if (has('momentum') && data.momentum.length) {
  const wsQ = sheet(wb, 'Cuadrante de momentum', [
    { header: 'Tema', key: 't', width: 26 },
    { header: 'Volumen', key: 'v', width: 10 },
    { header: 'Aceleración %', key: 'a', width: 15 },
    { header: 'Cuadrante', key: 'q', width: 16 },
    { header: 'Sentimiento prom.', key: 's', width: 16 },
  ]);
  for (const p of data.momentum) wsQ.addRow({ t: p.topic, v: p.volume, a: p.acceleration, q: p.quadrant, s: p.sentiment });
  }

  // 4b. Geographic map (per lingua/area)
  if (has('geo') && data.geo.length) {
  const wsG = sheet(wb, 'Mapa geográfico', [
    { header: 'Zona / idioma', key: 'c', width: 24 },
    { header: 'Idioma', key: 'l', width: 8 },
    { header: 'Menciones', key: 'n', width: 10 },
    { header: 'Part. %', key: 'sh', width: 10 },
    { header: 'Sentimiento prom.', key: 's', width: 16 },
  ]);
  for (const g of data.geo) {
    wsG.addRow({ c: g.country, l: g.lang, n: g.volume, sh: g.share, s: g.sentiment });
  }
  }

  // 4c. Share of Voice over time (giorno × entità)
  if (has('sov') && data.sov.entities.length) {
  const wsSov = sheet(wb, 'Share of Voice', [
    { header: 'Día', key: 'day', width: 12 },
    ...data.sov.entities.map((e) => ({ header: e, key: e, width: 16 })),
  ]);
  for (const row of data.sov.days) {
    const r: Record<string, string | number> = { day: String(row.day) };
    for (const e of data.sov.entities) r[e] = Number(row[e] ?? 0);
    wsSov.addRow(r);
  }
  }

  // 5. Benchmark
  if (has('benchmark')) {
  const total = data.benchmark.reduce((s, r) => s + r.total, 0);
  const wsB = sheet(wb, 'Benchmark', [
    { header: 'Entidad', key: 'e', width: 20 },
    { header: 'Palabras clave', key: 'k', width: 35 },
    { header: 'Menciones (14 días)', key: 'n', width: 18 },
    { header: 'Share of Voice %', key: 'sov', width: 16 },
    { header: 'Sentimiento prom.', key: 's', width: 16 },
  ]);
  for (const r of data.benchmark) {
    wsB.addRow({
      e: r.entity.name, k: r.entity.keywords.join(', '), n: r.total,
      sov: total ? Number(((r.total / total) * 100).toFixed(1)) : null,
      s: r.avgSentiment === null ? null : Number(r.avgSentiment.toFixed(2)),
    });
  }
  }

  // 6. Audience
  if (has('audience')) {
  const wsC = sheet(wb, 'Comunidades', [
    { header: 'Comunidad', key: 'c', width: 28 },
    { header: 'Fuente', key: 'f', width: 15 },
    { header: 'Menciones', key: 'n', width: 10 },
    { header: 'Sentimiento prom.', key: 's', width: 16 },
  ]);
  for (const r of data.audience.communities) {
    wsC.addRow({
      c: r.community, f: sourceLabel(r.source), n: r.n,
      s: r.avgSentiment === null ? null : Number(r.avgSentiment.toFixed(2)),
    });
  }
  const wsA = sheet(wb, 'Autores', [
    { header: 'Autor', key: 'a', width: 25 },
    { header: 'Usuario', key: 'h', width: 22 },
    { header: 'Fuente', key: 'f', width: 15 },
    { header: 'Publicaciones', key: 'n', width: 8 },
    { header: 'Engagement total', key: 'e', width: 18 },
  ]);
  for (const r of data.audience.authors) {
    wsA.addRow({ a: r.author, h: r.authorHandle ?? '', f: sourceLabel(r.source), n: r.n, e: Math.round(r.engagement) });
  }
  }

  // 6b. Trend / Narrazioni / Timeline
  if (has('trends') && data.trends.length) {
    const ws = sheet(wb, 'Tendencias', [
      { header: 'Tema', key: 't', width: 26 }, { header: 'Puntaje (×norm.)', key: 's', width: 14 },
      { header: 'Menciones 24 h', key: 'n', width: 12 }, { header: 'Explicación', key: 'e', width: 70 },
    ]);
    for (const t of data.trends) ws.addRow({ t: t.topic, s: Number(t.score.toFixed(1)), n: t.n24, e: t.explanation ?? '' });
  }
  if (has('pov') && data.pov.pov) {
    const pv = data.pov.pov;
    const ws = sheet(wb, 'Punto de vista', [
      { header: 'Bloque', key: 'i', width: 7 }, { header: 'Tipo', key: 'k', width: 13 },
      { header: 'Título', key: 't', width: 45 }, { header: 'Confianza', key: 'c', width: 12 },
      { header: 'Cifras', key: 'f', width: 45 }, { header: 'Narrativa', key: 'b', width: 90 },
    ]);
    ws.addRow({ i: '', k: 'TESIS', t: pv.headline, c: '', f: '', b: '' });
    for (const par of pv.intro ?? []) ws.addRow({ k: 'intro', b: par.text });
    for (const [i, b] of pv.blocks.entries()) {
      ws.addRow({
        i: i + 1, k: b.kind, t: b.title, c: b.confidence,
        f: b.stats.map((s) => `${s.value} — ${s.label}`).join(' · '), b: b.body,
      });
    }
    for (const c of pv.counterSignals) ws.addRow({ k: 'contraseñal', b: c.point });
    for (const t of pv.implications) ws.addRow({ k: 'implicación', b: t });
    for (const t of pv.watch) ws.addRow({ k: 'vigilar', b: t });
  }

  if (has('narratives') && data.narratives.length) {
    const ws = sheet(wb, 'Narrativas', [
      { header: 'Título', key: 't', width: 40 }, { header: 'Postura', key: 's', width: 14 },
      { header: 'Coordinada', key: 'c', width: 12 }, { header: 'Publicaciones', key: 'n', width: 8 },
      { header: 'Descripción', key: 'd', width: 70 },
    ]);
    for (const n of data.narratives) ws.addRow({ t: n.title, s: n.stance ?? '', c: n.coordinated ? 'sí' : 'no', n: n.mentionCount, d: n.description ?? '' });
  }
  if (has('timeline') && data.timeline.length) {
    const ws = sheet(wb, 'Línea de tiempo', [
      { header: 'Fecha', key: 'd', width: 12 }, { header: 'Evento', key: 't', width: 45 },
      { header: 'Importancia', key: 'i', width: 12 }, { header: 'Descripción', key: 'de', width: 70 },
    ]);
    for (const e of data.timeline) ws.addRow({ d: e.eventDate, t: e.title, i: e.importance, de: e.description ?? '' });
  }

  // 7. Content ratings
  if (has('content')) {
  const wsR = sheet(wb, 'Calificación de contenido', [
    { header: 'Título/Texto', key: 't', width: 55 },
    { header: 'Fuente', key: 'f', width: 13 },
    { header: 'Engagement', key: 'e', width: 12 },
    { header: 'Percentil', key: 'p', width: 11 },
    { header: 'Puntaje IA', key: 'q', width: 9 },
    { header: 'Relevancia', key: 'rel', width: 10 },
    { header: 'Viralidad', key: 'vir', width: 9 },
    { header: 'Riesgo', key: 'risk', width: 9 },
    { header: 'Nota IA', key: 'nota', width: 45 },
    { header: 'URL', key: 'u', width: 45 },
  ]);
  for (const r of data.ratings) {
    wsR.addRow({
      t: r.title || r.content.slice(0, 120), f: sourceLabel(r.source),
      e: Math.round(r.engagementScore), p: r.percentile,
      q: r.quality?.score, rel: r.quality?.relevance, vir: r.quality?.virality,
      risk: r.quality?.risk, nota: r.quality?.note ?? '', u: r.url ?? '',
    });
  }
  }

  // 7b. Crisis radar & peak
  if (has('crisis') && data.crisis.peak) {
  const wsCr = sheet(wb, 'Radar de crisis', [
    { header: 'Métrica', key: 'm', width: 26 },
    { header: 'Valor', key: 'v', width: 40 },
  ]);
  wsCr.addRow({ m: 'Índice de riesgo (0-100)', v: `${data.crisis.risk} — ${data.crisis.level}` });
  for (const d of data.crisis.drivers) wsCr.addRow({ m: d.label, v: `+${d.value}` });
  wsCr.addRow({ m: 'Día pico', v: data.crisis.peak.day });
  wsCr.addRow({ m: 'Volumen del pico', v: data.crisis.peak.volume });
  wsCr.addRow({ m: '% negativo del pico', v: `${data.crisis.peak.negShare}%` });
  wsCr.addRow({ m: 'Temas del pico', v: data.crisis.peak.topics.map((t) => `${t.topic} (${t.n})`).join(', ') });
  for (const c of data.crisis.peak.content) wsCr.addRow({ m: `Contenido [${sourceLabel(c.source)}]`, v: c.title });
  }

  // 8. Alert e Brief
  if (has('alerts')) {
  const wsAl = sheet(wb, 'Alertas', [
    { header: 'Fecha', key: 'd', width: 17 },
    { header: 'Tipo', key: 't', width: 18 },
    { header: 'Severidad', key: 's', width: 10 },
    { header: 'Mensaje', key: 'm', width: 70 },
    { header: 'Explicación', key: 'e', width: 70 },
  ]);
  for (const a of data.alerts) wsAl.addRow({
    d: a.createdAt, t: a.type, s: a.severity, m: a.message,
    e: (a.data as { explanation?: string } | null)?.explanation ?? '',
  });
  }

  if (has('brief')) {
  const wsBr = sheet(wb, 'Brief', [
    { header: 'Fecha', key: 'd', width: 12 },
    { header: 'Brief', key: 'b', width: 120 },
  ]);
  for (const b of data.briefs) {
    const row = wsBr.addRow({ d: b.briefDate, b: b.content });
    row.getCell('b').alignment = { wrapText: true, vertical: 'top' };
  }
  }

  // ── Persone (personal branding): un foglio per la classifica e uno per le
  // schede. Mancavano del tutto: sceglierle e non trovarle era peggio che non
  // poterle scegliere.
  const ppl = data.people;
  if (has('people') && ppl.ranking.length > 1) {
    const ws = sheet(wb, 'Personas', [
      { header: 'Persona', key: 'name', width: 30 },
      { header: 'Audiencia', key: 'followers', width: 14 },
      { header: 'Publicaciones / mes', key: 'perMonth', width: 14 },
      { header: 'Engagement prom.', key: 'engagement', width: 16 },
    ]);
    for (const r of ppl.ranking) {
      ws.addRow({
        name: r.name,
        followers: r.followers ?? '',
        perMonth: r.perMonth ?? '',
        engagement: r.engagement === null ? '' : Math.round(r.engagement),
      });
    }
  }
  if ((has('peopleGrowth') || has('peopleDetail')) && ppl.cards.length) {
    const ws = sheet(wb, 'Fichas por persona', [
      { header: 'Persona', key: 'name', width: 30 },
      { header: 'Seguidores hoy', key: 'latest', width: 15 },
      { header: 'Ganados', key: 'gained', width: 12 },
      { header: 'Desde', key: 'from', width: 12 },
      { header: 'Hasta', key: 'to', width: 12 },
      { header: 'Publicaciones / mes', key: 'perMonth', width: 14 },
      { header: 'Tendencia %', key: 'trend', width: 10 },
      { header: 'Mejor formato', key: 'format', width: 26 },
      { header: 'Distribución de audiencia', key: 'audience', width: 46 },
    ]);
    for (const c of ppl.cards) {
      const a = c.audience[0];
      ws.addRow({
        name: c.name,
        latest: c.followers?.latest ?? '',
        gained: c.followers?.gained ?? '',
        from: c.followers?.from ?? '',
        to: c.followers?.to ?? '',
        perMonth: c.rhythm?.perMonth ?? '',
        trend: c.rhythm?.trend ?? '',
        format: c.formats[0] ? `${c.formats[0].name} (${c.formats[0].avgEngagement})` : '',
        audience: a ? `${a.dimension}: ${a.rows.slice(0, 4).map((r) => `${r.name} ${(r.share * 100).toFixed(0)}%`).join(', ')}` : '',
      });
    }
  }

  // Un foglio per ogni grafico di Studio Graph, in forma lunga: chi apre un
  // Excel vuole i dati per rifarci sopra una pivot, non un'immagine.
  const usedNames = new Set(wb.worksheets.map((w) => w.name.toLowerCase()));
  for (const [id, chart] of studio) {
    // I nomi dei fogli Excel non ammettono : \\ / ? * [ ] e si fermano a 31 caratteri.
    const base = (chart.title.replace(/[:\\/?*[\]]/g, ' ').trim() || `Gráfico ${id}`).slice(0, 28);
    let name = base;
    for (let i = 2; usedNames.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
    usedNames.add(name.toLowerCase());

    const ws = sheet(wb, name, [
      { header: chart.xLabel || 'X', key: 'x', width: 34 },
      ...(chart.zLabel ? [{ header: chart.zLabel, key: 'z', width: 24 }] : []),
      { header: chart.yLabel || 'Valor', key: 'y', width: 18 },
    ]);
    for (const r of chart.rows) ws.addRow({ x: r.x, z: r.z ?? '', y: r.y });
    // Il periodo del grafico è suo, non del report: va scritto dove sta il dato.
    const note = ws.addRow([`Periodo del gráfico: últimos ${chart.days} días · generado el ${new Date().toLocaleDateString('es-CO')}`]);
    note.font = { color: { argb: 'FF64748B' }, size: 9 };
  }

  // Se nessun foglio è stato aggiunto, evita un file corrotto
  if (wb.worksheets.length === 0) sheet(wb, 'Vacío', [{ header: 'No se seleccionó ninguna sección', key: 'x', width: 40 }]);

  // Foglio "Note": l'informativa estesa, sempre presente e sempre l'ultima.
  const wsNote = wb.addWorksheet('Notas');
  wsNote.getColumn(1).width = 120;
  const noteTitle = wsNote.addRow(['NOTA']);
  noteTitle.font = { bold: true, color: { argb: 'FF64748B' } };
  const noteBody = wsNote.addRow([AI_DISCLOSURE_LONG]);
  noteBody.height = 72;
  noteBody.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  noteBody.getCell(1).font = { color: { argb: 'FF64748B' } };
  wsNote.headerFooter = { oddFooter: `&L&7${AI_DISCLOSURE_SHORT}` };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="aedo-${slugify(project.name)}-${todayStamp()}.xlsx"`,
    },
  });
}
