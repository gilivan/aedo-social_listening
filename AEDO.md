# AEDO — Social listening interno de EL GRUPO

Base: fork de [Radar Intelligence](https://github.com/Scognamiglio1969/radar-intelligence)
(commit 2c66448, 17-sep-2026). Remoto `upstream` = repo original.

## Arranque local
```bash
npm install        # en el Mac, reinstalar dependencias nativas
npm run dev        # http://localhost:3000
```
Sin configuración usa base embebida PGlite (`.data/pglite`).
Admin inicial: admin@example.com / changeme (pide cambio en el primer login).
Claves de IA y fuentes: `.env.local` o Ajustes → Sources (cifradas).

## Notas de la base
- Next.js 16 + React 19 + Drizzle; Postgres (Neon) o PGlite.
- Conectores en `lib/connectors/` (interfaz `Connector` en `types.ts`); reseñas en `lib/reviews/`.
- Interfaz 100 % en español y marca AEDO (commit "Interfaz en español"). Decisión técnica:
  la app siempre usa el locale interno `'en'`, cuyos textos ahora están en español; las ramas
  `'it'` quedan como código muerto (facilita traer mejoras de upstream). Selector de idioma oculto.
- Contenidos de IA siempre en español (`lib/content-locale.ts`); zona horaria America/Bogota.
- Los créditos a Radar Intelligence / Massimo Scognamiglio se conservan en Ajustes → Créditos (exigido por la AGPL).
- Comentarios de código siguen en italiano.
- Licencia AGPL-3.0: uso interno sin problema; si se expone a terceros por red, hay que publicar el código modificado.

## Hoja de ruta
1. ~~Interfaz en español y marca AEDO~~ ✅
2. Cuentas propias vía APIs oficiales (Meta, YouTube) o Metricool.
3. Conectores de menciones externas: X (twscrape), Instagram (Instaloader), TikTok (TikTok-Api),
   reseñas de Google Maps (gosom), noticias (GDELT ya incluido).
4. Facebook de terceros vía Apify solo si hace falta.
