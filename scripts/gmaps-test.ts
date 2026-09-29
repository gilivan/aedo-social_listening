// Prueba el lector de reseñas de Google Maps sin tocar la base de datos.
// Uso:  npm run gmaps:test -- "Centro Comercial San Nicolás Rionegro" [tope] [--visible]
import { fetchGoogleMapsReviewsDetailed } from '../lib/reviews/googlemaps';

const args = process.argv.slice(2);
const visible = args.includes('--visible');
const [identifier, maxArg] = args.filter((a) => a !== '--visible');
if (!identifier) {
  console.error('Uso: npm run gmaps:test -- "<URL de Google Maps o nombre del lugar>" [tope] [--visible]');
  process.exit(1);
}

const t0 = Date.now();
fetchGoogleMapsReviewsDetailed(identifier, {
  max: Number(maxArg) || 40,
  headless: !visible,
  log: (m) => console.log(`[AEDO] ${m}`),
})
  .then(({ reviews, replies }) => {
    const dist = [1, 2, 3, 4, 5].map((s) => `${s}★ ${reviews.filter((r) => r.rating === s).length}`).join(' · ');
    const dates = reviews.map((r) => r.publishedAt.getTime()).sort((a, b) => a - b);
    const d = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    console.log('');
    console.log(`Reseñas leídas: ${reviews.length} en ${Math.round((Date.now() - t0) / 1000)} s`);
    console.log(`Distribución: ${dist}`);
    if (dates.length) console.log(`Fechas (aprox.): ${d(dates[0])} → ${d(dates[dates.length - 1])}`);
    console.log(`Con texto: ${reviews.filter((r) => r.content).length} · con respuesta del propietario: ${replies}`);
    for (const r of reviews.slice(0, 3)) {
      console.log(`  ${r.rating}★ ${d(r.publishedAt.getTime())} — ${r.content.slice(0, 90).replace(/\s+/g, ' ')}${r.content.length > 90 ? '…' : ''}`);
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error(`[AEDO] Error: ${(e as Error).message}`);
    process.exit(1);
  });
