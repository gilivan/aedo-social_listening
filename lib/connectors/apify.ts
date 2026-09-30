import type { Connector } from './types';
import { apifyEnabled } from '@/lib/social/apify';

// Instagram y Facebook vía Apify. Aparece en Ajustes → Fuentes para ingresar
// el token; la recolección real corre una vez por proyecto en la pipeline
// (lib/social/apify.ts), sobre las cuentas configuradas en Consultas.
export const apifySocial: Connector = {
  id: 'apify',
  label: 'Meta vía Apify',
  tier: 'premium',
  projectLevel: true,
  enabled: apifyEnabled,
  disabledReason: 'Requiere un token de Apify: ingrésalo aquí y define las cuentas en Consultas',
  async fetchMentions() { return []; },
};
