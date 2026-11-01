import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/**
 * Geführte Tour pro Seite (Julia: „als Dialog, der mich durchführt und auf die Knöpfe zeigt“):
 * Beim ersten Besuch wird abgedunkelt, ein Knopf nach dem anderen hervorgehoben, daneben eine Sprechblase.
 * Kein „?“ in der Kopfleiste (Julia: macht es zu voll) – wieder zeigen geht über die Einstellungen. „Gesehen“ gilt je Gerät.
 * Kommt Neues dazu (Julia: „neue Schritte, auch für mich“), bekommen die Schritte einen höheren Stand (`added`): Wer die
 * Seite schon kennt, sieht einmal nur sie, mit „Neu“; wer neu ist, die ganze Tour.
 */
export type IntroId = 'start' | 'kochbuch' | 'rezept' | 'plan' | 'woche' | 'einkauf' | 'speisekammer' | 'produkte' | 'kochen' | 'lust';

/**
 * Ziel als Selektor oder Suche; fehlt es gerade (leere Woche, noch nichts gewählt), steht die Blase mittig.
 * `added`: Stand der Tour, mit dem der Schritt kam – fehlt: 1 (die erste Tour)
 */
type Step = { at?: string | (() => Element | null | undefined); title: string; text: string; added?: number };

/** Knopf/Reiter anhand seines Texts – für Stellen ohne eigenes Merkmal */
const byText = (sel: string, start: string) => () =>
  [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim().startsWith(start));

const TOURS: Record<IntroId, Step[]> = {
  start: [
    { title: 'Willkommen bei Mashi', text: 'Dein Kochbuch, das mitdenkt: Rezepte, Wochenplan, Einkauf und Vorrat an einem Ort. Ich zeig dir kurz, wo was ist.' },
    { at: '[aria-label="Hauptnavigation"]', title: 'Unten wechselst du die Bereiche', text: 'Start, Kochbuch, Speisekammer und Plan. Das Plus legt Neues an: Rezept, Kassenbon oder Vorrat.' },
    { at: '.home-head__settings', title: 'Einstellungen', text: 'Farbthema, Haushalt, Sicherung und Abgleich mit deinen Geräten.' },
    { at: '.week-today', title: 'Heute aus der Woche', text: '„So geht’s“ mit Würze und Zubereitung zum Umschalten. „Gegessen“ merkt sich, wie du es gemacht hast – nächstes Mal ist das vorgewählt.', added: 2 },
    { at: byText('main button', 'Lieber was anderes?'), title: 'Worauf hast du Lust?', text: 'Ein Gericht aus Bausteinen zusammenstellen – Tortilla, Bowl, Pasta … Stufe für Stufe, auch mit deinen eigenen Rezepten.', added: 2 },
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
    { at: 'main .swaps', title: 'Tauschen', text: 'Zutaten gegen andere derselben Stufe tauschen – Tofu statt Hähnchen, auch eine ganze Sauce gegen deine eigene. Deine Schritte bleiben und nennen den neuen Namen.', added: 2 },
    { at: 'main .salad-add', title: 'Beilagensalat', text: 'Zu jedem Rezept ein Salat dazu: Gemüse, Dressing und Topping wählen – nur fürs nächste Kochen oder immer.', added: 2 },
    { at: 'main .block-hints__cta', title: 'Bausteine gefunden', text: 'Teile, die Mashi als Baustein erkennt (eine Sauce, ein Dip), stehen nach deinem Ja im Baukasten.', added: 2 },
    { at: '[aria-label="Weitere Aktionen"]', title: 'Mehr Aktionen', text: 'Bearbeiten, „Grundlage daraus machen“ oder archivieren. Jede Änderung wird eine neue Version – die alte bleibt.' },
    { at: byText('main button', 'Kochmodus starten'), title: 'Los geht’s', text: 'Startet den Kochmodus: Schritt für Schritt mit Timer.' },
  ],
  plan: [
    { title: 'Dein Wochenplan', text: 'Abend antippen: ändern, tauschen oder zurück in den Kühlschrank. Lange drücken: Portionen und Kochtag.' },
    { at: 'main .fridge__card', title: 'Kühlschrank', text: 'Kärtchen antippen, dann einen freien Abend. Hält es bis dahin nicht, wird eingefroren.' },
    { at: 'main .fridge__line .link', title: 'Kochtag ändern', text: '„gekocht am So“ antippen – die Abende rücken mit.' },
    { at: byText('main button', 'Woche planen'), title: 'Woche planen', text: 'Rezepte in den Topf legen – danach verteilst du sie hier.' },
    { at: 'main .meal--free', title: '„Was gibt’s?“', text: 'Einen freien Abend antippen: Mashi schlägt vor, was aus Grundlagen und Vorrat geht.' },
    { title: 'Baukasten am Abend', text: 'Grundlage plus Bausteine (Pasta, Brokkoli …): Im Abend-Fenster steht „So geht’s“ mit Würze und Zubereitung. Gibt es dasselbe bald wieder, kochst du gleich mit.', added: 2 },
    { at: '[aria-label="Einkaufsliste"]', title: 'Einkaufsliste', text: 'Was noch fehlt, steht hier. Wie viel pro Abend gegessen wird, stellst du in den Einstellungen unter Haushalt ein.' },
  ],
  woche: [
    { at: 'main .pot', title: 'Ein Topf für die Woche', text: 'Was hier liegt, kochst du am Kochtag. −/+ ändert die Portionen, × nimmt es raus.' },
    { at: 'main .cover', title: 'Reicht für die Woche?', text: 'Portionen gegen sieben Abende. Frei lassen ist auch in Ordnung.' },
    { at: () => document.querySelector('main [role="tab"]')?.parentElement, title: 'Grundlagen und Rezepte', text: 'Antippen legt ein Rezept mit seinen Portionen in den Topf. Die Schneeflocke heißt: lässt sich einfrieren.' },
    { at: 'main .bottom-cta button', title: 'In den Kühlschrank', text: 'Im Wochenplan verteilst du die Portionen auf die Abende – dort gibt es auch den Baukasten.' },
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
    { at: 'main .food-gaps', title: 'Fehlen Werte', text: 'Was in deinen Rezepten und Bausteinen noch keine Nährwerte oder kein Stückgewicht hat – hier gleich nachtragen. Mashi erfindet keine Zahlen.', added: 2 },
    { at: '[aria-label="Lebensmittel hinzufügen"]', title: 'Hinzufügen', text: 'Per Barcode, Open Food Facts oder abgetippt – gern mit Marke.' },
    { at: () => document.querySelector('main .tab')?.parentElement, title: 'Deine Listen', text: '„Nachkaufen“, „Immer im Haus“ und „Gewürze“ sammeln, was du oft brauchst.' },
    { title: 'Sorten', text: 'Mehrere Sorten einer Zutat: Der Favorit mit Stern wird zuerst genommen.' },
  ],
  lust: [
    { title: 'Stufe für Stufe', text: 'Kohlenhydrat, Protein, Sauce, Gemüse, Topping – antippen, was du magst. Deine Rezepte und ihre Teile sind auch Bausteine. „Neu“ oben fängt von vorn an.', added: 2 },
    { at: byText('main button', 'Würfeln'), title: 'Würfeln', text: 'Füllt, was noch offen ist. Nochmal würfeln tauscht nur das Gewürfelte.', added: 2 },
    { at: 'main .craving-done__how', title: 'So geht’s', text: 'Das Längste zuerst, mit Würze und Zubereitung zum Umschalten. Mashi merkt sich, wie du es zuletzt gekocht hast.', added: 2 },
    { at: 'main .craving-done__actions', title: 'Kochen, einplanen, behalten', text: 'Jetzt kochen, in die Woche legen oder gleich ins Kochbuch. Nach dem Kochen fragt die Startseite, wie es war.', added: 2 },
  ],
  kochen: [
    { at: '.cook__progress', title: 'Schritt für Schritt', text: 'Der Bildschirm bleibt an, solange du kochst.' },
    { at: '[aria-label="Zutaten anzeigen"]', title: 'Zutaten', text: 'Hier siehst du die Zutaten. Mengen nur für dieses Mal ändern geht auch.' },
    { at: byText('main button', 'Timer'), title: 'Timer', text: 'Startet den Timer für diesen Schritt.' },
    { at: byText('main button', 'Weiter'), title: 'Weiter', text: 'Am Ende „Fertig“: Die Zutaten gehen aus dem Vorrat.' },
  ],
};

/** früher: Liste der gesehenen Seiten (= Stand 1) – wird weiter geschrieben, falls ein Gerät noch die alte App hat */
const KEY = 'mashi-intros-v1';
/** je Seite der gesehene Stand der Tour */
const STAND_KEY = 'mashi-intros-v2';

type Stands = Partial<Record<IntroId, number>>;

/** Gesehene Stände – aus dem neuen Speicher, sonst aus der alten Liste (gesehen = Stand 1). Kaputtes zählt als ungesehen. */
export function standsFrom(stands: string | null, old: string | null): Stands {
  try {
    const s = JSON.parse(stands ?? 'null') as unknown;
    if (s && typeof s === 'object' && !Array.isArray(s)) return s as Stands;
    const list = JSON.parse(old ?? '[]') as unknown;
    return Array.isArray(list) ? Object.fromEntries(list.filter((x): x is IntroId => typeof x === 'string').map((id) => [id, 1])) : {};
  } catch {
    return {};
  }
}

/** der höchste Stand einer Tour */
export const standOf = (steps: readonly Pick<Step, 'added'>[]): number => Math.max(1, ...steps.map((x) => x.added ?? 1));

/** Was diesmal gezeigt wird: noch nie gesehen → alles; schon gesehen → nur, was seither dazukam (leer: nichts) */
export const stepsToShow = <S extends Pick<Step, 'added'>>(steps: readonly S[], stand: number | undefined): S[] =>
  stand ? steps.filter((x) => (x.added ?? 1) > stand) : [...steps];

function load(): Stands {
  try {
    return standsFrom(localStorage.getItem(STAND_KEY), localStorage.getItem(KEY));
  } catch {
    return {}; // privater Modus / gesperrter Speicher → Tour zeigen
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
    localStorage.setItem(STAND_KEY, JSON.stringify(seen));
    localStorage.setItem(KEY, JSON.stringify(Object.keys(seen)));
  } catch {
    /* gilt dann nur bis zum Neuladen */
  }
}

function useIntros() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
}

function dismiss(id: IntroId) {
  seen = { ...seen, [id]: standOf(TOURS[id]) };
  save();
  emit();
}

/** Einstellungen → „Alle Einführungen wieder zeigen“ */
export function resetIntros() {
  seen = {};
  save();
  emit();
}

/** Die Tour dieser Seite – startet von selbst, solange sie nicht gesehen ist */
export function PageIntro({ id }: { id: IntroId }) {
  useIntros();
  // kurz warten: Die Seite soll erst stehen, sonst zeigt die Blase auf einen Knopf, der noch rutscht
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 350); return () => clearTimeout(t); }, []);
  const steps = stepsToShow(TOURS[id], seen[id]);
  if (!ready || !steps.length) return null;
  // schon gesehen: nur das Neue, mit „Neu“ daran
  return createPortal(<Tour steps={steps} fresh={!!seen[id]} onDone={() => dismiss(id)} />, document.body);
}

/** Der Bereich, in dem man einen Knopf wirklich sieht: zwischen Kopfleiste und dem, was unten fest steht – außer der Knopf gehört selbst dazu */
function visibleBand(el: Element): { top: number; bottom: number } {
  let top = 0;
  let bottom = document.documentElement.clientHeight;
  for (const bar of document.querySelectorAll('.topbar, .bottom-cta, .nav')) {
    if (bar.contains(el)) continue;
    const r = bar.getBoundingClientRect();
    if (!r.height) continue;
    if (r.top <= 1) top = Math.max(top, r.bottom);
    else bottom = Math.min(bottom, r.top);
  }
  return { top, bottom };
}

function Tour({ steps, fresh, onDone }: { steps: Step[]; fresh: boolean; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  useLayoutEffect(() => {
    const at = step.at;
    const el = typeof at === 'string' ? document.querySelector(at) : at?.();
    if (!el) { setRect(null); return; }
    // nur scrollen, wenn der Knopf nicht ganz zu sehen ist; ohne behavior: 'instant' – das kennen ältere Safaris nicht.
    // „Zu sehen“ heißt: nicht unter der Kopfleiste und nicht unter dem, was unten fest steht (Kochmodus-Leiste,
    // Navigation) – sonst leuchtete bei „Tauschen“ der Knopf „Kochmodus starten“ auf (Rundgang)
    const r = el.getBoundingClientRect();
    const band = visibleBand(el);
    if (r.top < band.top || r.bottom > band.bottom) el.scrollIntoView({ block: 'center' });
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
          <strong>{fresh && <><span className="tag tour__new">Neu</span>{' '}</>}{step.title}</strong>
          {steps.length > 1 && <span className="small muted">{i + 1} / {steps.length}</span>}
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
