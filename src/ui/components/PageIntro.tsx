import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/**
 * Geführte Tour pro Seite (Julia: „als Dialog, der mich durchführt und auf die Knöpfe zeigt“):
 * Beim ersten Besuch wird abgedunkelt, ein Knopf nach dem anderen hervorgehoben, daneben eine Sprechblase.
 * Kein „?“ in der Kopfleiste (Julia: macht es zu voll) – wieder zeigen geht über die Einstellungen. „Gesehen“ gilt je Gerät.
 */
export type IntroId = 'start' | 'kochbuch' | 'rezept' | 'plan' | 'woche' | 'einkauf' | 'speisekammer' | 'produkte' | 'kochen';

/** Ziel als Selektor oder Suche; fehlt es gerade (leere Woche, noch nichts gewählt), steht die Blase mittig */
type Step = { at?: string | (() => Element | null | undefined); title: string; text: string };

/** Knopf/Reiter anhand seines Texts – für Stellen ohne eigenes Merkmal */
const byText = (sel: string, start: string) => () =>
  [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim().startsWith(start));

const TOURS: Record<IntroId, Step[]> = {
  start: [
    { title: 'Willkommen bei Mashi', text: 'Dein Kochbuch, das mitdenkt: Rezepte, Wochenplan, Einkauf und Vorrat an einem Ort. Ich zeig dir kurz, wo was ist.' },
    { at: '[aria-label="Hauptnavigation"]', title: 'Unten wechselst du die Bereiche', text: 'Start, Kochbuch, Speisekammer und Plan. Das Plus legt Neues an: Rezept, Kassenbon oder Vorrat.' },
    { at: '.home-head__settings', title: 'Einstellungen', text: 'Farbthema, Haushalt, Sicherung und Abgleich mit deinen Geräten.' },
    { title: 'Jede Seite erklärt sich selbst', text: 'Beim ersten Besuch zeigt dir jede Seite ihre Knöpfe. Noch mal ansehen: Einstellungen → „Alle Einführungen wieder zeigen“.' },
  ],
  kochbuch: [
    { at: 'input[aria-label="Rezepte suchen"]', title: 'Suchen und filtern', text: 'Tippe einen Namen oder eine Zutat. Der Regler daneben filtert nach Zeit, Geräten und mehr.' },
    { at: byText('main [role="tab"]', 'Grundlagen'), title: 'Grundlagen und Gerichte', text: 'Grundlagen wie Soße, Teig oder Brühe machst du selbst und nutzt sie in vielen Gerichten.' },
    { at: 'main .card__hit', title: 'Rezept öffnen', text: 'Antippen öffnet das Rezept, das Herz merkt es als Favorit.' },
    { at: '[aria-label="Neu: Rezept, Kassenbon oder Vorrat"]', title: 'Neues Rezept', text: 'Selbst schreiben, Text oder Foto einlesen oder mit KI. KI-Ideen testest du erst, dann kommen sie ins Kochbuch.' },
  ],
  rezept: [
    { at: () => document.querySelector('main [aria-label="Mehr"]')?.parentElement, title: 'Portionen', text: 'Hier stellst du die Portionen ein – Mengen, Nährwerte und Kosten rechnen mit.' },
    { at: 'main .plan-chip', title: 'Zum Wochenplan', text: 'Plant das Gericht für einen Abend der Woche.' },
    { at: '[aria-label="Weitere Aktionen"]', title: 'Mehr Aktionen', text: 'Bearbeiten, „Grundlage daraus machen“ oder archivieren. Jede Änderung wird eine neue Version – die alte bleibt.' },
    { at: byText('main button', 'Kochmodus starten'), title: 'Los geht’s', text: 'Startet den Kochmodus: Schritt für Schritt mit Timer.' },
  ],
  plan: [
    { title: 'Dein Wochenplan', text: 'Jedes Gericht steht an seinem Abend, der Topf zeigt den Kochtag. Antippen tauscht zwei Abende, lange drücken öffnet Portionen, anderes Gericht und Kochtag.' },
    { at: byText('main button', 'Woche planen'), title: 'Woche planen', text: 'Grundlagen und Rezepte für die Woche wählen – Mashi verteilt sie auf die Abende.' },
    { at: 'main .meal--free', title: '„Was gibt’s?“', text: 'Einen freien Abend antippen: Mashi schlägt vor, was aus Grundlagen und Vorrat geht.' },
    { at: '[aria-label="Einkaufsliste"]', title: 'Einkaufsliste', text: 'Was noch fehlt, steht hier. Wie viel pro Abend gegessen wird, stellst du in den Einstellungen unter Haushalt ein.' },
  ],
  woche: [
    { at: () => document.querySelector('main [role="tab"]')?.parentElement, title: 'Erst Grundlagen, dann Rezepte', text: 'Wähle, was du vorkochst, und dann die Gerichte. Mashi rechnet mit deinem Vorrat.' },
    { at: 'main .week-setup__row', title: 'Antippen zum Auswählen', text: 'Wie viele Portionen du kochst, füllt freie Abende.' },
    { at: 'main .combo', title: 'Baukasten', text: 'Zur Grundlage kommt + Kohlenhydrat, + Protein, + Beilage oder + Topping.' },
    { at: 'main .combo__own', title: '+ eigene', text: 'Legt einen eigenen Baustein an. Je Baustein wählst du die Zubereitung; „nur bei dieser Grundlage“ merkt ihn sich nur dort.' },
    { title: 'Zweimal Nudeln?', text: 'Dann kochst du am ersten Abend mit und wärmst am zweiten nur auf.' },
  ],
  einkauf: [
    { title: 'Deine Einkaufsliste', text: 'Sie entsteht aus dem Plan – was im Vorrat ist, ist schon abgezogen. „Immer im Haus“ steht unter Basics.' },
    { at: 'input[aria-label="Eigener Eintrag"]', title: 'Eigene Einträge', text: 'Was sonst noch fehlt, schreibst du hier dazu.' },
    { title: 'Abhaken', text: 'Im Laden abhaken – oder der Kassenbon hakt für dich ab.' },
  ],
  speisekammer: [
    { at: () => document.querySelector('main [role="tab"]')?.parentElement, title: 'Vorräte, Preise, Einkäufe', text: 'Was da ist, was es gekostet hat und deine Kassenbons.' },
    { at: '[aria-label="Neu: Rezept, Kassenbon oder Vorrat"]', title: 'Vorrat eintragen', text: 'Per Kassenbon oder von Hand. Vorgekochtes steht mit Portionen hier und füllt im Plan freie Abende.' },
    { at: 'main .page-head [aria-label="Meine Lebensmittel"]', title: 'Meine Lebensmittel', text: 'Deine Produkte mit Nährwerten und Sorten.' },
    { title: 'Bald verbrauchen', text: 'Auf der Startseite siehst du, was weg muss – und welche Rezepte es aufbrauchen.' },
  ],
  produkte: [
    { at: '[aria-label="Lebensmittel hinzufügen"]', title: 'Hinzufügen', text: 'Per Barcode, Open Food Facts oder abgetippt – gern mit Marke.' },
    { at: () => document.querySelector('main .tab')?.parentElement, title: 'Deine Listen', text: '„Nachkaufen“, „Immer im Haus“ und „Gewürze“ sammeln, was du oft brauchst.' },
    { title: 'Sorten', text: 'Mehrere Sorten einer Zutat: Der Favorit mit Stern wird zuerst genommen.' },
  ],
  kochen: [
    { at: '.cook__progress', title: 'Schritt für Schritt', text: 'Der Bildschirm bleibt an, solange du kochst.' },
    { at: '[aria-label="Zutaten anzeigen"]', title: 'Zutaten', text: 'Hier siehst du die Zutaten. Mengen nur für dieses Mal ändern geht auch.' },
    { at: byText('main button', 'Timer'), title: 'Timer', text: 'Startet den Timer für diesen Schritt.' },
    { at: byText('main button', 'Weiter'), title: 'Weiter', text: 'Am Ende „Fertig“: Die Zutaten gehen aus dem Vorrat.' },
  ],
};

const KEY = 'mashi-intros-v1';

function load(): Set<IntroId> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as IntroId[]);
  } catch {
    return new Set(); // privater Modus / gesperrter Speicher → Tour zeigen
  }
}

let seen = load();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    /* gilt dann nur bis zum Neuladen */
  }
}

function useIntros() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
}

function dismiss(id: IntroId) {
  seen = new Set(seen).add(id);
  save();
  emit();
}

/** Einstellungen → „Alle Einführungen wieder zeigen“ */
export function resetIntros() {
  seen = new Set();
  save();
  emit();
}

/** Die Tour dieser Seite – startet von selbst, solange sie nicht gesehen ist */
export function PageIntro({ id }: { id: IntroId }) {
  useIntros();
  // kurz warten: Die Seite soll erst stehen, sonst zeigt die Blase auf einen Knopf, der noch rutscht
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 350); return () => clearTimeout(t); }, []);
  if (!ready || seen.has(id)) return null;
  return createPortal(<Tour steps={TOURS[id]} onDone={() => dismiss(id)} />, document.body);
}

function Tour({ steps, onDone }: { steps: Step[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  useLayoutEffect(() => {
    const at = step.at;
    const el = typeof at === 'string' ? document.querySelector(at) : at?.();
    if (!el) { setRect(null); return; }
    // nur scrollen, wenn der Knopf nicht ganz zu sehen ist; ohne behavior: 'instant' – das kennen ältere Safaris nicht
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > document.documentElement.clientHeight) el.scrollIntoView({ block: 'center' });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [step]);

  useEffect(() => {
    next.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [i, onDone]);

  const forward = () => (last ? onDone() : setI(i + 1));
  // Blase unter dem Knopf, wenn dort Platz ist, sonst darüber; sonst (oder ohne Ziel) mittig – nie aus dem Bild
  const pad = 6;
  const vh = document.documentElement.clientHeight;
  const vw = document.documentElement.clientWidth;
  const place = rect && vh - rect.bottom > 230 ? { top: rect.bottom + pad + 10 }
    : rect && rect.top > 230 ? { bottom: vh - rect.top + pad + 10 }
    : { top: '50%', transform: 'translateY(-50%)' };
  // Abdunkeln mit vier Flächen um den Knopf statt mit einem riesigen Schatten – den zeichnen nicht alle Handys
  // (Julia: nach der Tour ließ sich am Handy nichts mehr antippen)
  const s = rect && { t: Math.max(0, rect.top - pad), l: Math.max(0, rect.left - pad), r: Math.min(vw, rect.right + pad), b: Math.min(vh, rect.bottom + pad) };

  return (
    // Tippen neben die Blase = Weiter – so bleibt nie etwas gesperrt, auch wenn etwas nicht gezeichnet wird
    <div className="tour" role="dialog" aria-modal="true" aria-label={step.title} onClick={(e) => { if (!(e.target as Element).closest('.tour__bubble')) forward(); }}>
      {s ? (
        <>
          <div className="tour__dim" style={{ top: 0, left: 0, right: 0, height: s.t }} />
          <div className="tour__dim" style={{ top: s.b, left: 0, right: 0, bottom: 0 }} />
          <div className="tour__dim" style={{ top: s.t, left: 0, width: s.l, height: s.b - s.t }} />
          <div className="tour__dim" style={{ top: s.t, left: s.r, right: 0, height: s.b - s.t }} />
          <div className="tour__spot" style={{ top: s.t, left: s.l, width: s.r - s.l, height: s.b - s.t }} />
        </>
      ) : <div className="tour__dim" style={{ inset: 0 }} />}
      <div className="tour__bubble" style={place} aria-live="polite">
        <div className="tour__head">
          <strong>{step.title}</strong>
          <span className="small muted">{i + 1} / {steps.length}</span>
        </div>
        <p>{step.text}</p>
        <div className="tour__actions">
          {!last ? <button type="button" className="link link--muted small" onClick={onDone}>Überspringen</button> : <span />}
          <span className="row-gap">
            {i > 0 && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setI(i - 1)}>Zurück</button>}
            <button ref={next} type="button" className="btn btn--primary btn--sm" onClick={forward}>
              {last ? 'Verstanden' : 'Weiter'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
