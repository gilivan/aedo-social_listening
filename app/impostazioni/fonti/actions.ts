'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { CONNECTORS } from '@/lib/connectors';
import { setConnectorDisabled } from '@/lib/source-toggles';

export async function toggleConnectorAction(form: FormData): Promise<void> {
  if (!isAdmin(await getCurrentUser())) return;
  const id = String(form.get('id') ?? '');
  if (!CONNECTORS.some((c) => c.id === id)) return;
  await setConnectorDisabled(id, form.get('off') === '1');
  revalidatePath('/impostazioni/fonti');
}
