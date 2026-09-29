// Inicia sesión en Google con el perfil de Chrome propio de AEDO.
// Uso (en la carpeta de AEDO):  npm run gmaps:login
// Se hace una sola vez; la sesión queda guardada en .data/gmaps-chrome-profile.
import { runGoogleMapsLogin } from '../lib/reviews/googlemaps';

runGoogleMapsLogin((m) => console.log(`[AEDO] ${m}`))
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error('[AEDO] No se pudo abrir Chrome:', (e as Error).message);
    console.error('[AEDO] ¿Está instalado Google Chrome? Si está en otra ruta, define GMAPS_CHROME_PATH.');
    process.exit(1);
  });
