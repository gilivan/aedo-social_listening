import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { getMeta, setMeta } from '@/lib/db';
import { setConnectorConfig } from '@/lib/connector-config';

// Gestione (server-only) delle credenziali che l'utente inserisce dall'app per
// attivare i connettori premium, senza toccare codice o variabili d'ambiente.
// Le credenziali sono globali per l'istanza (legate all'account aziendale) e
// salvate cifrate a riposo nella tabella `meta`.

export type CredField = { env: string; label: string; hint?: string; secret: boolean };

/**
 * Campi richiesti da ogni connettore premium. La chiave `env` coincide con la
 * variabile d'ambiente storica, così il connettore legge indifferentemente dal
 * valore salvato o, in mancanza, dalla env var (fallback).
 */
export const CREDENTIAL_FIELDS: Record<string, CredField[]> = {
  anthropic: [
    { env: 'ANTHROPIC_API_KEY', label: 'Clave API de Anthropic', hint: 'desde console.anthropic.com', secret: true },
  ],
  openai: [
    { env: 'OPENAI_API_KEY', label: 'Clave API de OpenAI', hint: 'desde platform.openai.com', secret: true },
  ],
  grok: [
    { env: 'XAI_API_KEY', label: 'Clave API de xAI (Grok)', hint: 'desde console.x.ai', secret: true },
  ],
  azure: [
    { env: 'AZURE_OPENAI_API_KEY', label: 'Clave de Azure OpenAI', hint: 'Portal de Azure → tu recurso Foundry/OpenAI → Claves y punto de conexión', secret: true },
    { env: 'AZURE_OPENAI_ENDPOINT', label: 'URL del recurso', hint: 'p. ej. https://my-resource.openai.azure.com; los nombres de modelo de arriba son los nombres de tus implementaciones', secret: false },
  ],
  talkwalker: [
    { env: 'TALKWALKER_ACCESS_TOKEN', label: 'Token de acceso de Talkwalker', hint: 'token read_only emitido por tu Customer Success Manager de Talkwalker', secret: true },
  ],
  reddit: [
    { env: 'REDDIT_CLIENT_ID', label: 'Client ID', hint: 'app de Reddit de tipo "script", la cadena debajo del nombre', secret: true },
    { env: 'REDDIT_CLIENT_SECRET', label: 'Client Secret', hint: 'el campo "secret" de la app', secret: true },
  ],
  youtube: [
    { env: 'YOUTUBE_API_KEY', label: 'Clave API', hint: 'clave gratuita de Google Cloud Console (YouTube Data API v3)', secret: true },
  ],
  x: [
    { env: 'X_BEARER_TOKEN', label: 'Bearer Token', hint: 'X API v2, plan Basic', secret: true },
  ],
  instagram: [
    { env: 'META_ACCESS_TOKEN', label: 'Token de acceso de Meta', hint: 'app de Meta + cuenta de Instagram Business', secret: true },
    { env: 'INSTAGRAM_USER_ID', label: 'ID de usuario de Instagram', secret: false },
  ],
  facebook: [
    { env: 'META_ACCESS_TOKEN', label: 'Token de acceso de Meta', hint: 'El mismo token de la app de Meta', secret: true },
    { env: 'FACEBOOK_PAGE_ID', label: 'ID de página de Facebook', hint: 'uno o más, separados por comas', secret: false },
  ],
  tiktok: [
    { env: 'TIKTOK_CLIENT_KEY', label: 'Client Key', hint: 'TikTok Research API', secret: true },
    { env: 'TIKTOK_CLIENT_SECRET', label: 'Client Secret', secret: true },
  ],
  linkedin: [
    { env: 'LINKEDIN_ACCESS_TOKEN', label: 'Token de acceso', hint: 'Community Management API', secret: true },
    { env: 'LINKEDIN_ORG_ID', label: 'ID de organización', secret: false },
  ],
  linkedin_web: [
    { env: 'TAVILY_API_KEY', label: 'Clave API de Tavily', hint: 'clave gratuita de app.tavily.com (1.000 búsquedas/mes)', secret: true },
  ],
  newsapi: [
    { env: 'NEWSAPI_KEY', label: 'Clave API', hint: 'newsapi.org', secret: true },
  ],
  newsdata: [
    { env: 'NEWSDATA_API_KEY', label: 'Clave API', hint: 'gratis, desde newsdata.io/register (200 créditos al día, uso comercial permitido)', secret: true },
  ],
  apify: [
    { env: 'APIFY_TOKEN', label: 'Token de API de Apify', hint: 'apify.com → Settings → API & Integrations', secret: true },
  ],
  podcastindex: [
    { env: 'PODCASTINDEX_API_KEY', label: 'Clave API', hint: 'gratis, desde api.podcastindex.org (llega por correo)', secret: true },
    { env: 'PODCASTINDEX_API_SECRET', label: 'Secreto API', hint: 'el secreto que se entrega junto con la clave', secret: true },
  ],
  mcp: [
    { env: 'RADAR_MCP_TOKEN', label: 'Token de acceso MCP', hint: 'protege /api/mcp; genera uno desde la página MCP', secret: true },
  ],
  factcheck: [
    { env: 'GOOGLE_FACTCHECK_API_KEY', label: 'Clave API', hint: 'clave de Google Cloud con la "Fact Check Tools API" habilitada; la clave de YouTube también sirve si habilitas esa API en su proyecto', secret: true },
  ],
  googleplaces: [
    { env: 'GOOGLE_PLACES_API_KEY', label: 'Clave API', hint: 'clave del nivel gratuito de Google Cloud Console (Places API)', secret: true },
  ],
  discord: [
    { env: 'DISCORD_BOT_TOKEN', label: 'Token del bot', hint: 'desde discord.com/developers; primero invita el bot a tu servidor', secret: true },
    { env: 'DISCORD_CHANNEL_IDS', label: 'IDs de canal', hint: 'uno o más, separados por comas (clic derecho en un canal → Copiar ID del canal)', secret: false },
  ],
  'football-data': [
    { env: 'FOOTBALL_DATA_API_KEY', label: 'Clave API', hint: 'gratis, desde football-data.org/client/register', secret: true },
  ],
  alphavantage: [
    { env: 'ALPHA_VANTAGE_API_KEY', label: 'Clave API', hint: 'gratis, desde alphavantage.co/support/#api-key (solo correo, sin contraseña)', secret: true },
  ],
  yelp: [
    { env: 'YELP_API_KEY', label: 'Clave API', hint: 'gratis, desde fusion.yelp.com/api-keys (cuenta de empresa de Yelp)', secret: true },
  ],
};

const META_KEY = 'connector_credentials_v1';

// ---- cifratura AES-256-GCM, chiave derivata dal secret dell'app ----
function keyBytes(): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.APP_PASSWORD || 'sr-dev-secret-change-me';
  return scryptSync(secret, 'connector-cred-salt', 32);
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(blob: string): string {
  const [ivB, tagB, dataB] = blob.split(':');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}

type Store = Record<string, string>;

async function loadStore(): Promise<Store> {
  const blob = await getMeta<string>(META_KEY);
  if (!blob) return {};
  try {
    return JSON.parse(decrypt(blob)) as Store;
  } catch {
    return {};
  }
}

/** Idrata la cache sincrona letta dai connettori. Chiamare prima di enabled()/fetch. */
export async function hydrateConnectorCredentials(): Promise<void> {
  setConnectorConfig(await loadStore());
}

/** Read one stored credential (decrypted) by env-var name — always fresh from the DB. */
export async function getStoredKey(env: string): Promise<string | undefined> {
  const v = (await loadStore())[env];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Salva/aggiorna le credenziali di un connettore. Regole sui campi vuoti:
 * - campo NON segreto vuoto  => cancella (l'utente lo sta rimuovendo);
 * - campo segreto vuoto      => lascia invariato (non riscriviamo mai i segreti
 *   nel form, quindi un submit senza digitarli non deve azzerarli).
 */
export async function saveConnectorCredentials(connectorId: string, values: Record<string, string>): Promise<void> {
  const fields = CREDENTIAL_FIELDS[connectorId];
  if (!fields) return;
  const store = await loadStore();
  for (const f of fields) {
    const raw = (values[f.env] ?? '').trim();
    if (raw) store[f.env] = raw;
    else if (!f.secret) delete store[f.env];
  }
  await setMeta(META_KEY, encrypt(JSON.stringify(store)));
  setConnectorConfig(store);
}

function mask(v?: string): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length <= 4 ? '••••' : `••••${t.slice(-4)}`;
}

export type CredFieldStatus = {
  env: string; label: string; hint?: string; secret: boolean;
  set: boolean;
  /** Valore corrente: mascherato per i segreti, in chiaro per gli id pubblici. */
  display?: string;
  /** true se il valore proviene dalla env var embeddata, non dal salvataggio utente. */
  fromEnv: boolean;
};

export type ConnectorCredStatus = {
  configured: boolean;
  fields: CredFieldStatus[];
};

/** Stato di tutte le credenziali premium per la UI (nessun segreto in chiaro). */
export async function getConnectorCredStatuses(): Promise<Record<string, ConnectorCredStatus>> {
  const store = await loadStore();
  const out: Record<string, ConnectorCredStatus> = {};
  for (const [id, fields] of Object.entries(CREDENTIAL_FIELDS)) {
    const fs = fields.map((f) => {
      const dbVal = store[f.env];
      const envVal = process.env[f.env];
      const val = (dbVal && dbVal.trim()) ? dbVal : (envVal && envVal.trim() ? envVal : undefined);
      return {
        env: f.env, label: f.label, hint: f.hint, secret: f.secret,
        set: Boolean(val),
        display: f.secret ? mask(val) : (val || undefined),
        fromEnv: Boolean(!(dbVal && dbVal.trim()) && val),
      } satisfies CredFieldStatus;
    });
    out[id] = { configured: fs.every((f) => f.set), fields: fs };
  }
  return out;
}
