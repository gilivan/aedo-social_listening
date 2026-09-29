import { sourceLabel } from '@/lib/source-label';
import { formatDelta, formatKpi, formatPct, fmtNumber, type Lang, type StandardKpis } from '@/lib/kpi-standard';
import type { Reliability, Verdict } from '@/lib/data-reliability';

// ---------------------------------------------------------------------------
// Le tabelle dei KPI standard, una volta sola per tutti i formati.
//
// PDF, Excel, Word e PowerPoint ricevono le stesse righe già formattate: un
// numero scritto "1.234,5" nel PDF e "1234.5" nella slide sarebbe il primo
// dettaglio che un lettore attento nota, e da lì smette di fidarsi degli altri.
// ---------------------------------------------------------------------------

const L = (lang: Lang, it: string, en: string) => (lang === 'it' ? it : en);

export type Grid = { headers: string[]; rows: string[][] };

export function verdictLabel(v: Verdict | undefined, lang: Lang): string {
  if (!v) return '';
  return {
    reliable: L(lang, 'affidabile', 'confiable'),
    caution: L(lang, 'con cautela', 'con cautela'),
    unusable: L(lang, 'da non usare', 'no usar'),
  }[v];
}

export function overallLabel(r: Reliability, lang: Lang): string {
  return {
    suitable: L(lang, 'Dati idonei', 'Datos aptos'),
    caution: L(lang, 'Dati idonei con cautele', 'Datos aptos con reservas'),
    unsuitable: L(lang, 'Dati non idonei', 'Datos no aptos'),
  }[r.overall];
}

export function periodLine(k: StandardKpis): string {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return L(k.lang,
    `Periodo ${d(k.current.from)} → ${d(k.current.to)}, confronto ${d(k.previous.from)} → ${d(k.previous.to)} (America/Bogota). Reach potenziale, sentiment automatico. n.d. = dato non disponibile.`,
    `Periodo ${d(k.current.from)} → ${d(k.current.to)}, comparado con ${d(k.previous.from)} → ${d(k.previous.to)} (America/Bogota). Alcance potencial, sentimiento automático. n/d = dato no disponible.`);
}

/** KPI | Valore | Prec. | Δ | Δ% | Affidabilità | Formula e note. */
export function kpiGrid(k: StandardKpis, r: Reliability, opts: { formulas?: boolean } = {}): Grid {
  const { lang } = k;
  const verdicts = new Map(r.verdicts.map((v) => [v.id, v]));
  const headers = [
    'KPI', L(lang, 'Valore', 'Valor'), L(lang, 'Periodo prec.', 'Periodo ant.'), 'Δ', 'Δ%',
    L(lang, 'Affidabilità', 'Confiabilidad'),
  ];
  if (opts.formulas) headers.push(L(lang, 'Formula e note', 'Fórmula y notas'));
  const rows = k.kpis.map((x) => {
    const v = verdicts.get(x.id);
    const row = [
      x.label,
      formatKpi(x.value, x.unit, lang),
      formatKpi(x.previous, x.unit, lang),
      formatDelta(x, lang),
      formatPct(x.deltaPct, lang),
      v ? verdictLabel(v.verdict, lang) + (v.verdict !== 'reliable' ? ` — ${v.reason}` : '') : '',
    ];
    if (opts.formulas) row.push([x.formula, x.note].filter(Boolean).join(' · '));
    return row;
  });
  return { headers, rows };
}

export function channelGrid(k: StandardKpis): Grid {
  const { lang } = k;
  return {
    headers: [
      L(lang, 'Canale', 'Canal'), L(lang, 'Menzioni', 'Menciones'), L(lang, '% sul totale', '% del total'),
      L(lang, 'Reach pot.', 'Alcance pot.'), 'Engagement', L(lang, 'Eng. medio', 'Eng. prom.'), 'ER reach', 'NSS',
      L(lang, 'Δ% menzioni', 'Δ% menciones'),
    ],
    rows: k.channels.map((c) => [
      sourceLabel(c.source) + (c.previousMentions === 0 && !k.previousIncomplete ? L(lang, ' (nuova)', ' (nueva)') : ''),
      formatKpi(c.mentions, 'count', lang),
      formatKpi(c.share, 'pct', lang),
      formatKpi(c.reach, 'count', lang),
      formatKpi(c.engagement, 'count', lang),
      formatKpi(c.engPerMention, 'ratio', lang),
      formatKpi(c.erReach, 'pct', lang),
      formatKpi(c.nss, 'points', lang),
      c.previousMentions === 0 ? '—' : formatPct(c.deltaMentionsPct, lang),
    ]),
  };
}

export function competitiveGrid(k: StandardKpis): Grid {
  const { lang } = k;
  return {
    headers: [L(lang, 'Entità', 'Entidad'), L(lang, 'Menzioni', 'Menciones'), 'SOV', 'Δ SOV', 'SOE', 'SPV', 'NSS'],
    rows: k.competitive.map((c) => [
      (c.isOwnBrand ? '★ ' : '') + c.name,
      formatKpi(c.mentions, 'count', lang),
      formatKpi(c.sov, 'pct', lang),
      k.previousIncomplete ? '—' : formatDelta({ delta: c.sovDeltaPoints, unit: 'pct' }, lang),
      formatKpi(c.soe, 'pct', lang),
      formatKpi(c.spv, 'pct', lang),
      formatKpi(c.nss, 'points', lang),
    ]),
  };
}

export function peaksLine(k: StandardKpis): string {
  const { lang } = k;
  if (!k.peaks.length) return '';
  const peaks = k.peaks.map((p) => `${p.day} (${fmtNumber(p.value, lang)}${p.index !== null ? `, ${formatKpi(p.index, 'index', lang)}` : ''})`).join(', ');
  const anom = k.anomalies.length
    ? L(lang, ` Oltre 2σ: ${k.anomalies.map((a) => a.day).join(', ')}.`, ` Más allá de 2σ: ${k.anomalies.map((a) => a.day).join(', ')}.`)
    : L(lang, ' Nessun giorno oltre 2σ.', ' Ningún día más allá de 2σ.');
  return L(lang, `Giorni di picco: ${peaks}.`, `Días pico: ${peaks}.`) + anom;
}

/** Osservazione | Evidenza | Perché conta | Confidenza | Verifica. */
export function findingGrid(r: Reliability, lang: Lang): Grid {
  const conf = { high: L(lang, 'alta', 'alta'), medium: L(lang, 'media', 'media'), low: L(lang, 'bassa', 'baja') };
  const sev = { critical: L(lang, 'CRITICO', 'CRÍTICO'), caution: L(lang, 'cautela', 'cautela'), info: 'info' };
  return {
    headers: [
      L(lang, 'Osservazione', 'Observación'), L(lang, 'Evidenza', 'Evidencia'),
      L(lang, 'Perché conta', 'Por qué importa'), L(lang, 'Confidenza', 'Confianza'), L(lang, 'Verifica', 'Verificación'),
    ],
    rows: r.findings.map((f) => [`[${sev[f.severity]}] ${f.observation}`, f.evidence, f.why, conf[f.confidence], f.verify]),
  };
}

/** KPI affidabili / con cautela / da non usare, come chiede la verifica L1. */
export function verdictGroups(r: Reliability, lang: Lang): { title: string; items: string[] }[] {
  const group = (v: Verdict) => r.verdicts.filter((x) => x.verdict === v)
    .map((x) => (v === 'reliable' ? x.label : `${x.label} — ${x.reason}`));
  return [
    { title: L(lang, 'KPI affidabili', 'KPI confiables'), items: group('reliable') },
    { title: L(lang, 'KPI da usare con cautela', 'KPI para usar con cautela'), items: group('caution') },
    { title: L(lang, 'KPI da non usare', 'KPI que no se deben usar'), items: group('unusable') },
  ].filter((g) => g.items.length);
}

export const reliabilityTitle = (lang: Lang) => L(lang, 'Affidabilità dei dati — analisi critica L1', 'Confiabilidad de los datos — análisis crítico L1');
export const kpiTitle = (lang: Lang) => L(lang, 'KPI standard', 'KPI estándar');
export const cannotSayTitle = (lang: Lang) => L(lang, 'Cosa non si può scrivere nel report', 'Lo que el reporte no puede afirmar');
export const channelTitle = (lang: Lang) => L(lang, 'KPI per canale', 'KPI por canal');
export const competitiveTitle = (lang: Lang) => L(lang, 'Set competitivo (SOV, SOE, Share of Positive Voice)', 'Set competitivo (SOV, SOE, Share of Positive Voice)');
