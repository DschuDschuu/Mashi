import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/**
 * Textfeld, das mit dem Text mitwächst – bei langen Schritten muss man nicht im kleinen Feld scrollen.
 * Höhe = Inhalt; beim Tippen, Einfügen und wenn der Wert von außen kommt (z. B. Import).
 */
export function AutoTextarea({ className = '', rows = 2, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`; // + Rahmen, sonst erscheint ein Scrollbalken
  }, [props.value]);
  return <textarea ref={ref} rows={rows} className={`auto-textarea ${className}`.trim()} {...props} />;
}
