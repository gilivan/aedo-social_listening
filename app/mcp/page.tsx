import { headers } from 'next/headers';
import { Plug, PlugZap } from 'lucide-react';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';
import { getConnectorCredStatuses } from '@/lib/connector-credentials';
import { MCP_TOOLS } from '@/lib/mcp';
import { MCP_PROMPTS, RULES } from '@/lib/mcp-prompts';
import type { Lang } from '@/lib/kpi-standard';
import { PageHeader, EmptyState } from '@/components/ui';
import { CopyButton } from '@/components/copy-button';
import { McpSelfTest, TokenGenerator } from '@/components/mcp-client';
import { L, Section } from '@/components/facts-ui';

// ---------------------------------------------------------------------------
// MCP: Radar dentro Claude e Copilot.
//
// Il server esisteva già (/api/mcp) ma non si vedeva da nessuna parte: per
// accenderlo serviva una variabile d'ambiente, per sapere che strumenti
// offriva bisognava leggere il codice. Qui si accende, si prova, si collega.
// ---------------------------------------------------------------------------

export const metadata = { title: 'MCP' };

function Code({ text }: { text: string }) {
  return (
    <div className="relative mt-1.5 overflow-x-auto rounded-lg border border-[var(--border)] bg-black/30">
      <pre className="px-3 py-2 pr-20 text-[11px] leading-relaxed text-slate-200">{text}</pre>
      <div className="absolute right-1 top-1"><CopyButton text={text} /></div>
    </div>
  );
}

export default async function McpPage() {
  const lang: Lang = (await getLocale()) === 'it' ? 'it' : 'en';
  // Nella demo pubblica la pagina si vede, ma il token non si può generare.
  if (!isAdmin(await getCurrentUser()) && process.env.DEMO_MODE !== '1') {
    return <EmptyState message={L(lang, 'Pagina riservata agli amministratori.', 'Disponible solo para administradores.')} />;
  }
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const endpoint = `${process.env.APP_URL?.replace(/\/$/, '') ?? `${proto}://${host}`}/api/mcp`;

  const creds = await getConnectorCredStatuses();
  const field = creds.mcp?.fields[0];
  const active = Boolean(field?.set);
  const TOKEN = L(lang, 'IL_TUO_TOKEN', 'TU_TOKEN');

  const claudeCode = `claude mcp add --transport http radar ${endpoint} \\\n  --header "Authorization: Bearer ${TOKEN}"`;
  const claudeDesktop = JSON.stringify({
    mcpServers: {
      radar: {
        command: 'npx',
        args: ['-y', 'mcp-remote', endpoint, '--header', 'Authorization:${RADAR_AUTH}'],
        env: { RADAR_AUTH: `Bearer ${TOKEN}` },
      },
    },
  }, null, 2);

  return (
    <>
      <PageHeader
        title="MCP"
        subtitle={L(lang,
          'Radar dentro Claude e Copilot: gli stessi dati, interrogati in conversazione.',
          'AEDO dentro de Claude y Copilot: los mismos datos, consultados en conversación.')}
        info={L(lang,
          'MCP (Model Context Protocol) è lo standard con cui un assistente AI usa strumenti esterni. Radar espone un server MCP in sola lettura: gli strumenti leggono ciò che Radar ha già calcolato, non chiamano l’AI né le fonti esterne, e non spendono budget né crediti Talkwalker. Senza token l’endpoint è spento, non aperto.',
          'MCP (Model Context Protocol) es el estándar con el que un asistente de IA usa herramientas externas. AEDO expone un servidor MCP de solo lectura: las herramientas leen lo que AEDO ya calculó, nunca llaman a la IA ni a fuentes externas, y no gastan presupuesto ni créditos de Talkwalker. Sin token, el endpoint está apagado, no abierto.')}
      />

      <Section className="mb-4" title={L(lang, 'Stato', 'Estado')}>
        <div className="flex flex-col gap-3">
          <p className={`flex items-center gap-2 text-sm ${active ? 'text-emerald-300' : 'text-slate-400'}`}>
            {active ? <PlugZap className="size-4" /> : <Plug className="size-4" />}
            {active
              ? L(lang, 'Acceso', 'Activo')
              : L(lang, 'Spento: nessun token', 'Apagado: sin token')}
            {active && field && process.env.DEMO_MODE !== '1' && (
              <span className="text-[11px] text-slate-500">
                · {L(lang, 'token', 'token')} {field.display}
                {field.fromEnv ? L(lang, ' (da variabile d’ambiente)', ' (desde variable de entorno)') : L(lang, ' (salvato in Radar)', ' (guardado en AEDO)')}
              </span>
            )}
          </p>
          <div>
            <p className="text-[11px] text-slate-500">{L(lang, 'Indirizzo dell’endpoint (streamable HTTP)', 'Dirección del endpoint (streamable HTTP)')}</p>
            <Code text={endpoint} />
          </div>
          <TokenGenerator hasToken={active} lang={lang} />
          {active && <McpSelfTest lang={lang} />}
        </div>
      </Section>

      <Section className="mb-4" title={L(lang, 'Come collegarlo', 'Cómo conectarlo')}
        hint={L(lang, `Sostituisci ${TOKEN} con il token. Se lo hai perso, generane uno nuovo.`, `Reemplaza ${TOKEN} por el token. Si lo perdiste, genera uno nuevo.`)}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-slate-200">Claude Code</p>
            <Code text={claudeCode} />
            <p className="mt-1 text-[11px] text-slate-500">{L(lang, 'Poi, dentro Claude Code, /mcp mostra se è collegato.', 'Luego, dentro de Claude Code, /mcp muestra si está conectado.')}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">Claude Desktop</p>
            <Code text={claudeDesktop} />
            <p className="mt-1 text-[11px] text-slate-500">{L(lang, 'Nel file claude_desktop_config.json (Impostazioni → Sviluppatore). Serve Node.js.', 'En claude_desktop_config.json (Configuración → Desarrollador). Requiere Node.js.')}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">Microsoft Copilot Studio</p>
            <ol className="mt-1.5 list-decimal pl-4 text-[11px] leading-relaxed text-slate-400">
              <li>{L(lang, 'Agente → Strumenti → Aggiungi strumento → Model Context Protocol → Nuovo.', 'Agente → Herramientas → Agregar herramienta → Model Context Protocol → Nuevo.')}</li>
              <li>{L(lang, 'URL del server: l’indirizzo qui sopra.', 'URL del servidor: la dirección de arriba.')}</li>
              <li>{L(lang, 'Autenticazione: chiave API, nell’intestazione, con nome ', 'Autenticación: clave de API, en el encabezado, con el nombre ')}<code className="text-slate-200">x-api-key</code>.</li>
              <li>{L(lang, 'Quando la connessione lo chiede, incolla il token.', 'Cuando la conexión lo pida, pega el token.')}</li>
            </ol>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">claude.ai</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              {L(lang,
                'I connettori personalizzati di claude.ai oggi accettano solo l’accesso OAuth, non un token fisso: Radar non si collega da lì. Usa Claude Code o Claude Desktop.',
                'Por ahora, los conectores personalizados de claude.ai solo aceptan OAuth, no un token fijo: AEDO no se puede conectar desde ahí. Usa Claude Code o Claude Desktop.')}{' '}
              <a href="https://github.com/anthropics/claude-ai-mcp/issues/112" target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">{L(lang, 'segnalazione aperta', 'reporte abierto')}</a>
            </p>
          </div>
        </div>
      </Section>

      <Section className="mb-4 overflow-x-auto" title={L(lang, `Strumenti (${MCP_TOOLS.length})`, `Herramientas (${MCP_TOOLS.length})`)}
        hint={L(lang, 'Tutti in sola lettura e a costo zero.', 'Todas de solo lectura y sin costo.')}>
        <table className="w-full min-w-[36rem] text-left text-xs">
          <tbody>
            {MCP_TOOLS.map((t) => (
              <tr key={t.name} className="border-b border-[var(--border)]/60 align-top last:border-0">
                <td className="py-2 pr-3"><code className="text-sky-200">{t.name}</code><span className="block text-[10px] text-slate-500">{t.title}</span></td>
                <td className="py-2 text-[11px] leading-relaxed text-slate-400">{t.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={L(lang, `Libreria di prompt (${MCP_PROMPTS.length})`, `Biblioteca de prompts (${MCP_PROMPTS.length})`)}
        hint={L(lang,
          'I client MCP li mostrano già nel loro menù dei prompt. Qui si possono leggere e copiare, per chi usa un assistente che non li supporta. Le regole sui dati sono le stesse che Radar applica nelle sue pagine.',
          'Los clientes MCP ya los muestran en su menú de prompts. Aquí puedes leerlos y copiarlos, para asistentes que no los soportan. Las reglas sobre los datos son las mismas que AEDO aplica en sus páginas.')}>
        <details className="mb-3 rounded-lg border border-[var(--border)] px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-200">{L(lang, 'Le regole sui dati (comuni a tutti i prompt)', 'Las reglas sobre los datos (comunes a todos los prompts)')}</summary>
          <Code text={RULES} />
        </details>
        <ul className="flex flex-col gap-2">
          {MCP_PROMPTS.map((p) => (
            <li key={p.name}>
              <details className="rounded-lg border border-[var(--border)] px-3 py-2">
                <summary className="cursor-pointer text-xs">
                  <span className="font-semibold text-slate-200">{p.title}</span>
                  <span className="ml-2 text-slate-500">{p.audience} · {p.cadence}</span>
                  <span className="block pl-3 text-[11px] text-slate-400">{p.description}</span>
                </summary>
                <p className="mt-2 text-[11px] text-slate-500">
                  <code>{p.name}</code>
                  {p.args.length > 0 && <> · {L(lang, 'argomenti', 'argumentos')}: {p.args.map((a) => `${a.name}${a.required ? '*' : ''}`).join(', ')}</>}
                </p>
                <Code text={p.body} />
              </details>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
