/**
 * Copia texto al portapapeles de forma robusta.
 *
 * 1. Intenta `navigator.clipboard.writeText` (solo existe en contextos seguros: https o localhost;
 *    en http://<IP-de-red>:9002 es `undefined`, y además puede ser bloqueado por permisos).
 * 2. Si no existe o falla, usa un <textarea> temporal + `document.execCommand('copy')`.
 *    El textarea se inserta dentro del diálogo abierto (si lo hay) porque el focus-trap de
 *    Radix Dialog devuelve el foco al diálogo y haría fallar la selección si estuviera en <body>.
 *
 * Devuelve `true` si algún método copió el texto, `false` si ambos fallaron.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Se continúa con el fallback.
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;

  const previouslyFocused = document.activeElement as HTMLElement | null;
  const container: HTMLElement =
    (previouslyFocused?.closest('[role="dialog"]') as HTMLElement | null) ?? document.body;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  container.appendChild(textarea);
  let copied = false;
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    container.removeChild(textarea);
    try {
      previouslyFocused?.focus({ preventScroll: true });
    } catch {
      // sin acción
    }
  }
  return copied;
}
