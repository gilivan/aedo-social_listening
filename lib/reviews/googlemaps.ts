import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright-core';
import type { RawReview } from './types';

// ---------------------------------------------------------------------------
// Reseñas de Google Maps leídas con una sesión de Google iniciada.
//
// Por qué así: desde 2025 Google Maps no muestra la pestaña de Reseñas a quien
// no ha iniciado sesión, y su consulta interna de reseñas responde 403 a los
// scrapers. Con sesión, la página muestra todas las reseñas y se pueden
// ordenar por "Más recientes".
//
// Cómo funciona:
//  - Se usa el Google Chrome instalado en el equipo (canal "chrome") con un
//    perfil PROPIO de AEDO en .data/gmaps-chrome-profile, separado del Chrome
//    personal. La sesión se inicia una vez con `npm run gmaps:login`.
//  - Para cada lugar: abre la ficha, entra a Reseñas, ordena por más recientes
//    y baja la lista hasta encontrar reseñas que ya están guardadas (o hasta
//    el tope), expandiendo los textos largos ("Más").
//  - Maps solo muestra fechas relativas ("Hace 2 meses"): la fecha guardada es
//    una aproximación. Con la revisión diaria, las nuevas quedan con precisión
//    de horas/días.
//
// Recomendación: usar una cuenta de Google dedicada, no una personal, y no
// correr revisiones masivas seguidas (Google puede pedir verificación).
// ---------------------------------------------------------------------------

export const GMAPS_PROFILE_DIR =
  process.env.GMAPS_PROFILE_DIR || path.join(process.cwd(), '.data', 'gmaps-chrome-profile');
const READY_MARKER = path.join(GMAPS_PROFILE_DIR, '.aedo-sesion-lista');

/** true si ya se inició sesión alguna vez con `npm run gmaps:login`. */
export function googleMapsSessionReady(): boolean {
  return fs.existsSync(READY_MARKER);
}

async function launchContext(headless: boolean): Promise<BrowserContext> {
  const { chromium } = await import('playwright-core');
  fs.mkdirSync(GMAPS_PROFILE_DIR, { recursive: true });
  const exe = process.env.GMAPS_CHROME_PATH;
  return chromium.launchPersistentContext(GMAPS_PROFILE_DIR, {
    ...(exe ? { executablePath: exe } : { channel: process.env.GMAPS_CHROME_CHANNEL || 'chrome' }),
    headless,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    viewport: { width: 1280, height: 900 },
    // Sin la marca de automatización: Google rechaza el inicio de sesión en
    // navegadores que se anuncian como controlados por software.
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled', '--lang=es-CO'],
  });
}

// Un solo Chrome a la vez: el perfil persistente no admite dos procesos.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Inicio de sesión (una vez) ─────────────────────────────────────────────

/**
 * Abre Chrome (visible) con el perfil de AEDO para que la persona inicie
 * sesión en Google. Termina cuando detecta la sesión o cuando se cierra la
 * ventana. Devuelve true si la sesión quedó lista.
 */
export async function runGoogleMapsLogin(log: (m: string) => void = console.log): Promise<boolean> {
  return exclusive(async () => {
    const ctx = await launchContext(false);
    let closed = false;
    ctx.on('close', () => { closed = true; });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto('https://accounts.google.com/ServiceLogin?hl=es&continue=https%3A%2F%2Fwww.google.com%2Fmaps%3Fhl%3Des');
    log('Se abrió Chrome. Inicia sesión con la cuenta de Google que usará AEDO (idealmente una dedicada).');
    log('Cuando termines y veas Google Maps, esta ventana se cerrará sola.');

    const deadline = Date.now() + 15 * 60_000;
    let ok = false;
    while (!closed && Date.now() < deadline) {
      try {
        const cookies = await ctx.cookies('https://www.google.com');
        if (cookies.some((c) => c.name === 'SID' || c.name === '__Secure-1PSID')) { ok = true; break; }
      } catch { break; }
      await sleep(2000);
    }
    if (ok) {
      fs.writeFileSync(READY_MARKER, new Date().toISOString());
      log('Sesión detectada y guardada en el perfil de AEDO.');
      await sleep(2500);
    } else {
      log('No se detectó una sesión iniciada. Vuelve a intentarlo.');
    }
    if (!closed) await ctx.close().catch(() => undefined);
    return ok;
  });
}

// ── Fechas relativas ───────────────────────────────────────────────────────

const UNIT_DAYS: [RegExp, number][] = [
  [/segundo|second/, 0], [/minuto|minute/, 0], [/hora|hour/, 1 / 24],
  [/d[ií]a|day/, 1], [/semana|week/, 7], [/mes|month/, 30], [/a[ñn]o|year/, 365],
];

/** "Hace 2 meses", "4 semanas atrás", "Editado Hace un año", "a week ago" → fecha aproximada. */
export function parseRelativeDate(text: string, now = new Date()): Date {
  const t = text.toLowerCase().replace(/editad[oa]|edited/g, '').trim();
  const m = t.match(/\b(\d+|un|una|a|an)\s+([a-zñáéíóú]+)/);
  if (!m) return now;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  const unit = UNIT_DAYS.find(([re]) => re.test(m[2]));
  if (!unit) return now;
  return new Date(now.getTime() - n * unit[1] * 86_400_000);
}

// ── Extracción ─────────────────────────────────────────────────────────────

type DomReview = { id: string; author: string | null; rating: number; when: string; text: string; reply: string | null };

/**
 * Se ejecuta DENTRO de la página: lee las reseñas que hay en el DOM.
 * Va como texto (no como función) para que ningún compilador le inyecte
 * ayudantes que no existen en la página.
 */
const READ_REVIEWS_IN_PAGE = `(() => {
  const out = [];
  const seen = new Set();
  for (const el of Array.from(document.querySelectorAll('div[data-review-id]'))) {
    const id = el.getAttribute('data-review-id');
    if (!id || seen.has(id)) continue;
    const stars = el.querySelector('.kvMYJc') || el.querySelector('span[role="img"][aria-label*="estrella"], span[role="img"][aria-label*="star"]');
    const alt = el.querySelector('.fzvQIb');
    const label = (stars && stars.getAttribute('aria-label')) || (alt && alt.textContent) || '';
    const m = label.match(/\\d+/);
    const rating = m ? Number(m[0]) : 0;
    if (!rating) continue;
    seen.add(id);
    const replyEl = el.querySelector('.CDe7pd .wiI7pd');
    let textEl = el.querySelector('.MyEned .wiI7pd') || el.querySelector('.wiI7pd');
    if (textEl === replyEl) textEl = null;
    const author = el.querySelector('.d4r55');
    const when = el.querySelector('.rsqaWe') || el.querySelector('.xRkPPb');
    out.push({
      id,
      author: author ? author.textContent.trim() : null,
      rating,
      when: when ? when.textContent.trim() : '',
      text: textEl ? textEl.textContent.trim() : '',
      reply: replyEl ? replyEl.textContent.trim() : null,
    });
  }
  return out;
})()`;

const SCROLL_REVIEWS_IN_PAGE = `(() => {
  const first = document.querySelector('div[data-review-id]');
  let el = first ? first.parentElement : null;
  while (el && el.scrollHeight <= el.clientHeight + 10) el = el.parentElement;
  if (el) el.scrollTop = el.scrollHeight;
})()`;

const EXPAND_MORE_IN_PAGE = `(() => {
  document.querySelectorAll('button.w8nwRe, button[aria-label="Ver más"], button[aria-label="See more"]').forEach((b) => b.click());
})()`;

async function openPlace(page: Page, identifier: string): Promise<string> {
  const url = /^https?:\/\//.test(identifier)
    ? identifier
    : `https://www.google.com/maps/search/${encodeURIComponent(identifier)}`;
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'hl=es', { waitUntil: 'domcontentloaded' });
  // Si fue una búsqueda con varios resultados, abre el primero.
  await page.waitForSelector('h1, div[role="feed"]', { timeout: 20_000 }).catch(() => undefined);
  const first = page.locator('div[role="feed"] a.hfpxzc').first();
  if (await first.count()) {
    await first.click();
    await page.waitForTimeout(2500);
  }
  await page.waitForSelector('h1', { timeout: 20_000 });
  return page.url();
}

async function openReviewsSortedByNewest(page: Page): Promise<void> {
  const tab = page.locator('button[role="tab"][aria-label^="Reseñas"], button[role="tab"][aria-label^="Reviews"]').first();
  if (!(await tab.count())) {
    throw new Error('Google Maps no muestra la pestaña de Reseñas: la sesión de Google expiró o no está iniciada. Ejecuta `npm run gmaps:login`.');
  }
  await tab.click();
  await page.waitForSelector('div[data-review-id]', { timeout: 20_000 });

  const sort = page.locator('button[aria-label*="Ordenar" i], button[aria-label*="Sort" i]').first();
  if (await sort.count()) {
    await sort.click();
    const newest = page.locator('[role="menuitemradio"], [role="menuitem"], div.fxNQSd')
      .filter({ hasText: /recientes|newest/i }).first();
    try {
      await newest.waitFor({ timeout: 5_000 });
      await newest.click();
      await page.waitForTimeout(2500);
    } catch {
      console.warn('[gmaps] no se pudo ordenar por "Más recientes"; se sigue con el orden por defecto');
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  }
}

export type GmapsFetchOptions = {
  /** IDs ya guardados: al encontrar varios seguidos se deja de bajar. */
  known?: Set<string>;
  /** Tope de reseñas por lugar y ejecución. */
  max?: number;
  /** false = Chrome visible (útil para depurar). */
  headless?: boolean;
  log?: (m: string) => void;
};

export type GmapsFetchResult = { reviews: RawReview[]; placeUrl: string; replies: number };

export async function fetchGoogleMapsReviewsDetailed(identifier: string, opts: GmapsFetchOptions = {}): Promise<GmapsFetchResult> {
  if (!googleMapsSessionReady()) {
    throw new Error('Falta iniciar sesión en Google para leer reseñas de Maps: ejecuta `npm run gmaps:login` en la carpeta de AEDO.');
  }
  const known = opts.known ?? new Set<string>();
  const max = opts.max ?? (known.size ? 150 : 300);
  const log = opts.log ?? (() => undefined);
  const headless = opts.headless ?? process.env.GMAPS_HEADLESS !== '0';

  return exclusive(async () => {
    const ctx = await launchContext(headless);
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      const placeUrl = await openPlace(page, identifier);
      log(`Lugar: ${await page.locator('h1').first().textContent()}`);
      await openReviewsSortedByNewest(page);

      const collected = new Map<string, DomReview>();
      let stale = 0;
      for (let round = 0; round < 200; round++) {
        // Expande los textos largos antes de leer.
        await page.evaluate(EXPAND_MORE_IN_PAGE).catch(() => undefined);
        const batch = (await page.evaluate(READ_REVIEWS_IN_PAGE)) as DomReview[];
        const before = collected.size;
        for (const r of batch) if (!collected.has(r.id)) collected.set(r.id, r);

        // Orden por más recientes: si las últimas 10 ya estaban guardadas, lo nuevo ya se leyó.
        const tail = batch.slice(-10);
        if (known.size && tail.length >= 10 && tail.every((r) => known.has(r.id))) { log('Se alcanzaron reseñas ya guardadas.'); break; }
        if (collected.size >= max) { log(`Tope de ${max} reseñas alcanzado.`); break; }

        stale = collected.size === before ? stale + 1 : 0;
        if (stale >= 6) { log('No cargan más reseñas.'); break; }

        await page.evaluate(SCROLL_REVIEWS_IN_PAGE);
        await page.waitForTimeout(1200 + Math.floor(Math.random() * 800));
        if (round % 5 === 4) log(`… ${collected.size} reseñas leídas`);
      }

      const now = new Date();
      const all = [...collected.values()].slice(0, max);
      const reviews: RawReview[] = all.map((r) => ({
        externalId: r.id,
        rating: Math.min(5, Math.max(1, r.rating)),
        content: r.text,
        author: r.author ?? undefined,
        url: placeUrl,
        publishedAt: parseRelativeDate(r.when, now),
      }));
      return { reviews, placeUrl, replies: all.filter((r) => r.reply).length };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

export async function fetchGoogleMapsReviews(identifier: string, opts: GmapsFetchOptions = {}): Promise<RawReview[]> {
  return (await fetchGoogleMapsReviewsDetailed(identifier, opts)).reviews;
}
