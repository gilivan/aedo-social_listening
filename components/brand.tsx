// Nome e sottotitolo del brand. Personalizzabili senza toccare il codice tramite
// le variabili d'ambiente NEXT_PUBLIC_BRAND_NAME e NEXT_PUBLIC_BRAND_BYLINE.
export const APP_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || 'AEDO';
// Senza punto finale: la firma è resa in maiuscoletto spaziato, dove un punto
// isolato sembra sporco. Il payoff resta quello del marchio.
export const APP_BYLINE = process.env.NEXT_PUBLIC_BRAND_BYLINE || 'La voz de lo que se dice';

/**
 * Il marchio (AEDO): anelli concentrici interrotti, con il fascio che esce dal
 * centro verso il punto agganciato in alto a destra — il segnale trovato nel
 * rumore. Disegnato in SVG anziché importato come immagine così resta nitido a
 * ogni dimensione e prende il colore dal testo circostante: sul fondo scuro
 * dell'app gli anelli sono chiari, sul bianco (stampa, export) tornano scuri.
 */
export function BrandMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0`} fill="none" aria-hidden="true">
      {/* Anelli concentrici, interrotti dove passa il fascio. */}
      <path d="M37.61 5.59 A27 27 0 1 0 57.03 21.89" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M38.64 11.55 A21.5 21.5 0 1 0 50.98 21.91" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.35" />
      <path d="M34.78 16.24 A16 16 0 1 0 47.04 26.53" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M34.72 21.86 A10.5 10.5 0 1 0 41.52 27.56" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.35" />

      {/* Il fascio e il punto agganciato: l'unico elemento a colore. Il punto
          cade sul bordo dell'anello esterno, dove il fascio lo attraversa. */}
      <path d="M32 32 L52.1 11.9" className="stroke-sky-400" strokeWidth="2" strokeLinecap="round" />
      <circle cx="52.1" cy="11.9" r="3.4" className="fill-sky-400" />

      {/* Centro: disegnato per ultimo, resta sopra al fascio. */}
      <circle cx="32" cy="32" r="3.6" fill="currentColor" />
    </svg>
  );
}

/**
 * La palabra AEDO dibujada como trazo, no con una fuente: las "A" del
 * logotipo no tienen travesaño (triángulos puros), como en el diseño original.
 * Trazo geométrico de grosor constante; toma el color del texto circundante.
 */
export function BrandWordmark({ className = 'h-4' }: { className?: string }) {
  return (
    <svg viewBox="-6 -6 533 112" className={`${className} w-auto`} fill="none"
      stroke="currentColor" strokeWidth="9" strokeLinecap="butt" strokeLinejoin="miter"
      role="img" aria-label={APP_NAME}>
      {/* A — sin travesaño */}
      <path d="M4 100 47 4l43 96" />
      {/* E */}
      <path d="M227 4H149v96h78" />
      <path d="M149 52h66" />
      {/* D */}
      <path d="M290 100V4h38a48 48 0 0 1 0 96h-38" />
      {/* O */}
      <ellipse cx="478" cy="52" rx="43" ry="48" />
    </svg>
  );
}

export function Brand({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const icon = size === 'lg' ? 'size-8' : size === 'sm' ? 'size-5' : 'size-6';
  const mark = size === 'lg' ? 'h-[22px]' : size === 'sm' ? 'h-3' : 'h-[15px]';
  const byline = size === 'lg' ? 'text-[11px]' : 'text-[9px]';
  return (
    <span className="flex items-center gap-2">
      <BrandMark className={`${icon} text-slate-100`} />
      <span className="flex min-w-0 flex-col leading-none">
        {/* Il logotipo disegnato. Se il nome è stato personalizzato via env il
            tracciato non lo rappresenta più: si torna al testo. */}
        {APP_NAME === 'AEDO'
          ? <BrandWordmark className={`${mark} text-slate-100`} />
          : <span className={`${size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg'} font-semibold uppercase tracking-[0.2em]`}>{APP_NAME}</span>}
        {/* La firma non deve mai spezzarsi su più righe: se lo spazio manca
            (header mobile con bandierine e selettore) semplicemente sparisce. */}
        <span className={`${byline} mt-1 hidden whitespace-nowrap font-medium uppercase tracking-[0.14em] text-slate-500 sm:block`}>
          {APP_BYLINE}
        </span>
      </span>
    </span>
  );
}
