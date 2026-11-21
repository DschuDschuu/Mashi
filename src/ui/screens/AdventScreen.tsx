import { useEffect, useRef, useState } from 'react';
import { fillCalendar, openDoor, saveDoor, useAdvent, useAdventError, useAdventImage } from '../../data/adventStore';
import { ADVENT_DEMO } from '../../data/adventDemo';
import { addExtra, isDemo, removeExtra, usePlan, useRecipes } from '../../data/store';
import { normalizeName } from '../../domain/nutrition/localFoods';
import { stockSummary } from '../../domain/pantry';
import { useContentStock } from '../useRecipeStock';
import { StockLine } from '../components/StockLine';
import { IngredientStock } from './RecipeDetailScreen';
import {
  ADVENT_DAYS, canOpen, doorOn, needsFilling, parseAdventJson, previewDate, type AdventCalendar, type AdventDoor, type AdventImport,
} from '../../domain/advent';
import { totalMinutes } from '../../domain/recipe';
import { formatQuantity } from '../../domain/scaling';
import { navigate } from '../../router';
import { ask } from '../confirm';
import { formatMinutes, portionCount } from '../format';
import { toast } from '../toast';
import { useSheet } from '../useSheet';
import { AdventDoorArt } from '../components/AdventDoorArt';
import { AdventPhotosSheet } from '../components/AdventPhotos';
import { Stepper } from '../components/Controls';
import { Icon } from '../components/Icon';
import { downscaled } from '../components/ImageCropper';
import { TopBar } from '../components/TopBar';

const DAYS = Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1);
/** so lange schwingt die Tür auf (CSS: advent-swing), dann kommt das Rezept */
const SWING_MS = 650;

/**
 * Adventskalender (Julia): 24 Türchen, hinter jedem ein Rezept aus ihrer Datei. Ein Türchen geht an seinem Tag auf;
 * geöffnet zeigt es das Rezept, „Zum Testen speichern“ legt es ins Kochbuch. `day` = von der Startseite aus gleich
 * das Türchen des Tages aufmachen. `preview` = Vorschau (#/advent?vorschau=5): so tun, als wäre der 5. Dezember.
 */
export function AdventScreen({ day, preview }: { day?: number; preview?: number }) {
  const cal = useAdvent();
  const error = useAdventError();
  const [openDay, setOpenDay] = useState<number | null>(null);
  // Vorschau (Julia: „jetzt schon ansehen, so dev-mäßig“): gewählter Tag und was hier schon angesehen wurde –
  // nur auf dieser Seite, nichts davon wird gespeichert; im Dezember sind die Türchen also weiter zu
  const isPreview = preview !== undefined;
  const [previewDay, setPreviewDay] = useState(preview ?? 1);
  const [peeked, setPeeked] = useState<number[]>([]);
  const now = isPreview && cal ? previewDate(cal, previewDay, new Date()) : new Date();

  // Beim ersten Öffnen schwingt die Tür auf und es funkelt (Julia) – danach erst das Rezept.
  // Bei „weniger Bewegung“ gleich das Rezept.
  const [swinging, setSwinging] = useState<number | null>(null);
  const swingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(swingTimer.current), []);
  const reveal = (d: number, first: boolean) => {
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!first || calm) {
      setOpenDay(d);
      return;
    }
    clearTimeout(swingTimer.current);
    setSwinging(d);
    swingTimer.current = setTimeout(() => {
      setSwinging(null);
      setOpenDay(d);
    }, SWING_MS);
  };

  // von der Startseite („Türchen 5 öffnen“): gleich auf – sobald der Kalender geladen ist, und nur einmal
  const jumped = useRef(false);
  useEffect(() => {
    if (!cal || !day || isPreview || jumped.current) return;
    jumped.current = true;
    if (canOpen(cal, day, new Date()) && doorOn(cal, day)) {
      const first = !cal.opened[day];
      openDoor(day);
      reveal(day, first);
    }
    // reveal ändert sich je Zeichnen, macht aber immer dasselbe – nur Kalender und Tag zählen
  }, [cal, day, isPreview]);

  if (!cal) return <main className="screen"><TopBar title="Adventskalender" backTo="/" /></main>;

  const tap = (d: number) => {
    if (!canOpen(cal, d, now)) {
      toast(`Noch zu – Türchen ${d} geht am ${d}. Dezember auf`);
      return;
    }
    const first = !isOpened(d);
    if (isPreview) setPeeked((p) => (p.includes(d) ? p : [...p, d]));
    else openDoor(d);
    reveal(d, first);
  };
  // in der Vorschau zählt nur, was hier angesehen wurde (und am gewählten Tag schon aufgehen darf)
  const isOpened = (d: number) => (isPreview ? peeked.includes(d) && d <= previewDay : !!cal.opened[d]);
  const door = openDay ? doorOn(cal, openDay) : undefined;

  return (
    <main className="screen">
      <TopBar title="Adventskalender" backTo="/" intro="advent" />
      {error && <p className="error" role="alert">{error}</p>}
      {isPreview && (
        <div className="advent-preview" role="status">
          <p className="advent-preview__text">
            <strong>Vorschau: {previewDay}. Dezember</strong>
            <span>Zum Ausprobieren – Mashi merkt sich hier nichts.</span>
          </p>
          <div className="advent-preview__controls">
            <Stepper value={previewDay} min={1} max={ADVENT_DAYS} onChange={setPreviewDay} label="Tag der Vorschau" small />
            <button type="button" className="link" onClick={() => navigate('/advent', { replace: true })}>Beenden</button>
          </div>
        </div>
      )}
      {cal.doors.length > 0 && (
        <>
          <p className="advent-lead">{leadText(cal, now)}</p>
          <div className="advent-grid">
            {DAYS.map((d) => <Door key={d} day={d} cal={cal} now={now} opened={isOpened(d)} swinging={swinging === d} onTap={tap} />)}
          </div>
        </>
      )}
      <FillPanel cal={cal} stale={needsFilling(cal, now)} />
      {door && openDay && (
        <DoorSheet day={openDay} door={door} savedId={cal.saved[openDay]} preview={isPreview} onClose={() => setOpenDay(null)} />
      )}
    </main>
  );
}

function leadText(cal: AdventCalendar, now: Date): string {
  if (now.getFullYear() > cal.year) return 'Der Kalender ist vom letzten Jahr – alle Türchen sind offen.';
  if (now.getMonth() < 11) return 'Ab dem 1. Dezember geht jeden Tag ein Türchen auf.';
  if (now.getDate() <= ADVENT_DAYS) return `Heute ist Türchen ${now.getDate()} dran.`;
  return 'Frohe Weihnachten! Verpasste Türchen kannst du jederzeit nachholen.';
}

function Door({ day, cal, now, opened, swinging, onTap }: {
  day: number; cal: AdventCalendar; now: Date; opened: boolean; swinging: boolean; onTap: (d: number) => void;
}) {
  const door = doorOn(cal, day);
  const can = canOpen(cal, day, now);
  const today = cal.year === now.getFullYear() && now.getMonth() === 11 && now.getDate() === day;
  if (!door) {
    return <div className="advent-door is-empty" aria-label={`Türchen ${day}: leer`}><span className="advent-door__num">{day}</span></div>;
  }
  const state = !can ? 'is-locked' : opened ? 'is-open' : 'is-ready';
  const label = !can ? `Türchen ${day}, geht am ${day}. Dezember auf` : opened ? `Türchen ${day}: ${door.content.title}` : `Türchen ${day} öffnen`;
  // gerade zum ersten Mal geöffnet: die bemalte Tür schwingt nach links auf, darunter liegt schon das Offene – und es funkelt
  const swing = swinging && (
    <>
      <span className="advent-door__leaf" aria-hidden="true"><AdventDoorArt day={day} /></span>
      <span className="advent-door__sparks" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => <Icon key={i} name="sparkles" size={14} className={`advent-spark advent-spark--${i}`} />)}
      </span>
    </>
  );
  const cls = `advent-door is-open${today ? ' is-today' : ''}${swinging ? ' is-swinging' : ''}`;
  // geöffnet und mit Foto: das Foto füllt die Kachel – wie das Bild hinter einem echten Türchen (Julia)
  if (opened && door.imageId) {
    return (
      <button type="button" className={`${cls} has-photo`} aria-label={label} onClick={() => onTap(day)}>
        <DoorPhoto id={door.imageId} title={door.content.title} />
        <span className="advent-door__num">{day}</span>
        {cal.saved[day] && <Icon name="check" size={14} className="advent-door__saved" />}
        {swing}
      </button>
    );
  }
  if (opened) {
    return (
      <button type="button" className={cls} aria-label={label} onClick={() => onTap(day)}>
        <span className="advent-door__num">{day}</span>
        <span className="advent-door__title">{door.content.title}</span>
        {cal.saved[day] && <Icon name="check" size={14} className="advent-door__saved" />}
        {swing}
      </button>
    );
  }
  // geschlossen: die Grafik (Julia: „so fancy wie mein Beispiel“); wartet es noch, blasser mit Schloss
  return (
    // gesperrt nicht „disabled“: Antippen sagt dann, wann es aufgeht
    <button type="button" className={`advent-door is-closed ${state}${today ? ' is-today' : ''}`} aria-label={label} aria-disabled={!can || undefined} onClick={() => onTap(day)}>
      <span className="advent-door__art"><AdventDoorArt day={day} /></span>
      {!can && <span className="advent-door__badge"><Icon name="lock" size={11} /></span>}
      {today && <span className="advent-door__badge">Heute</span>}
    </button>
  );
}

/** Foto auf der Kachel – lädt erst, wenn das Türchen offen ist; bis dahin (oder ohne Foto) der Titel */
function DoorPhoto({ id, title }: { id: string; title: string }) {
  const url = useAdventImage(id);
  return url ? <img className="advent-door__photo" src={url} alt="" /> : <span className="advent-door__title">{title}</span>;
}

/** Das Rezept hinter dem Türchen – wie eine kleine Rezeptkarte, mit „Zum Testen speichern“ */
function DoorSheet({ day, door, savedId, preview = false, onClose }: { day: number; door: AdventDoor; savedId?: string; preview?: boolean; onClose: () => void }) {
  const ref = useSheet(onClose);
  const saved = useRecipes().find((r) => r.id === savedId);
  const photo = useAdventImage(door.imageId);
  const [saving, setSaving] = useState(false);
  const c = door.content;
  const minutes = totalMinutes(c);
  // Zutaten nach Teil („Teig“, „Glasur“) – in der Reihenfolge der Datei
  const parts = [...new Set(c.ingredients.map((i) => i.part ?? ''))];

  // „Was hab ich da?“: fehlt oder reicht nicht → kaufen (ohne Optionales und Grundvorrat, wie StockLine);
  // was schon als eigener Eintrag auf der Liste steht, zählt nicht doppelt
  const stock = useContentStock(c, c.servings);
  const extras = usePlan().extra ?? [];
  const summary = stock ? stockSummary(c, stock) : undefined;
  const onList = (n: string) => extras.some((x) => normalizeName(x.name) === normalizeName(n));
  const toBuy = summary ? [...summary.missing, ...summary.short].filter((n) => !onList(n)) : [];
  const shop = () => {
    const added = [...toBuy];
    added.forEach((n) => addExtra(n));
    toast(`${added.length === 1 ? `${added[0]} steht` : `${added.length} Zutaten stehen`} auf der Einkaufsliste`, {
      label: 'Rückgängig', run: () => added.forEach((n) => removeExtra(n)),
    });
  };

  const save = async () => {
    setSaving(true); // zweimal schnell getippt → nicht zwei Rezepte
    try {
      const res = await saveDoor(day);
      if (res) toast(`„${c.title}“ steht im Kochbuch unter „Zum Testen“`, { label: 'Rückgängig', run: res.undo });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet advent-sheet" role="dialog" aria-modal="true" aria-labelledby="advent-sheet-title" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        {photo && <img className="advent-sheet__photo" src={photo} alt="" />}
        <p className="advent-sheet__day"><Icon name="gift" size={16} /> Türchen {day}</p>
        <h2 className="sheet__title" id="advent-sheet-title">{c.title}</h2>
        {c.description && <p className="advent-sheet__desc">{c.description}</p>}
        <p className="small muted">{portionCount(c.servings)}{minutes > 0 && ` · ${formatMinutes(minutes)}`}</p>

        <h3 className="advent-sheet__head">Zutaten</h3>
        {/* „Was hab ich da?“ (Julia): wie auf der Rezeptseite – je Zutat da / reicht nicht / fehlt */}
        {stock && <p className="ingredients__stock"><StockLine content={c} stock={stock} max={Infinity} /></p>}
        {parts.map((p) => (
          <div key={p || 'alle'} className="ingredients__part">
            {p && parts.length > 1 && <h4 className="ingredients__parthead">{p}</h4>}
            <ul className={`ingredients${stock ? ' has-stock' : ''}`}>
              {c.ingredients.filter((i) => (i.part ?? '') === p).map((i) => (
                <li key={i.id}>
                  <span className="ingredients__qty">{formatQuantity(i)}</span>
                  <span className="ingredients__name">{i.name}{i.note && <span className="muted">, {i.note}</span>}</span>
                  {stock && <IngredientStock status={stock.get(i.id)} soon={false} />}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {/* Fehlendes als eigene Einträge auf die Einkaufsliste – nicht in der Vorschau, die merkt sich nichts */}
        {toBuy.length > 0 && !preview && (
          <button type="button" className="btn btn--soft btn--block advent-sheet__shop" onClick={shop}>
            <Icon name="cart" size={18} /> {toBuy.length === 1 ? `${toBuy[0]} auf die Einkaufsliste` : `${toBuy.length} Zutaten auf die Einkaufsliste`}
          </button>
        )}

        <h3 className="advent-sheet__head">Zubereitung</h3>
        <ol className="steps">
          {c.steps.map((s, i) => (
            <li key={s.id}>
              <span className="steps__num">{i + 1}</span>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        {door.tip && <p className="advent-sheet__tip"><Icon name="bulb" size={18} /> <span>{door.tip}</span></p>}

        <div className="advent-sheet__actions">
          {saved ? (
            <button type="button" className="btn btn--soft btn--block" onClick={() => navigate(`/rezept/${saved.id}`)}>
              <Icon name="check" size={18} /> Im Kochbuch – ansehen
            </button>
          ) : preview ? (
            // Vorschau: nichts speichern – sonst stünde das Rezept schon vor dem Dezember im Kochbuch
            <p className="advent-sheet__note">Vorschau – hier wird nichts gespeichert. „Zum Testen speichern“ gibt es am {day}. Dezember.</p>
          ) : (
            <button type="button" className="btn btn--primary btn--block" disabled={saving} onClick={save}>
              <Icon name="bookmark" size={18} /> Zum Testen speichern
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Befüllen: Julias JSON-Datei wählen, Vorschau mit Fehlern/Hinweisen, dann übernehmen (mit Rückgängig).
 * Leer: groß und erklärt; schon befüllt: leise unten („Neu befüllen …“) – oder im neuen Jahr wieder groß.
 */
function FillPanel({ cal, stale }: { cal: AdventCalendar; stale: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<(AdventImport & { fileName: string }) | null>(null);
  const filled = cal.doors.length > 0;
  const quiet = filled && !stale;
  // „Fotos ergänzen“ (Julia): alle Türchen in einer Liste, je Foto wählen oder entfernen
  const [photos, setPhotos] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (input.current) input.current.value = ''; // dieselbe Datei nach dem Verbessern erneut wählbar
    if (!file) return;
    setResult({ ...parseAdventJson(await file.text()), fileName: file.name });
  };

  const [busy, setBusy] = useState(false);
  const apply = async (doors: AdventDoor[], images: Record<number, string>) => {
    if (quiet && !(await ask({
      title: 'Kalender neu befüllen?',
      text: 'Die Türchen bekommen die Rezepte aus der neuen Datei. Was du schon geöffnet oder gespeichert hast, bleibt.',
      confirm: 'Neu befüllen',
    }))) return;
    setBusy(true);
    try {
      const { undo, photosFailed } = await fillCalendar(doors, await shrinkAll(images));
      setResult(null);
      toast(`Adventskalender mit ${doors.length} Türchen befüllt${photosFailed ? ' – die Fotos passten nicht in den Speicher' : ''}`, { label: 'Rückgängig', run: undo });
    } finally {
      setBusy(false);
    }
  };
  const photoCount = result ? Object.keys(result.images).length : 0;

  return (
    <section className={`panel advent-fill${quiet ? ' advent-fill--quiet' : ''}`}>
      {!filled && (
        <div className="advent-fill__intro">
          <Icon name="gift" size={32} />
          <div>
            <strong>Dein Adventskalender ist noch leer</strong>
            <p className="small muted">Spiel eine Datei mit 24 Rezepten ein – eins pro Türchen. Ins Kochbuch kommt ein Rezept erst, wenn du es am Türchen speicherst.</p>
          </div>
        </div>
      )}
      {filled && stale && <p><strong>Neues Jahr, neue Türchen</strong><br /><span className="small muted">Spiel die Rezepte für diesen Dezember ein.</span></p>}
      {quiet && <p className="small muted">Rezepte ändern? Eine neue Datei einspielen – Geöffnetes und Gespeichertes bleibt.</p>}
      <div className="advent-fill__buttons">
        <button type="button" className={`btn ${quiet ? 'btn--ghost' : 'btn--primary'}`} disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="file" size={18} /> {filled ? 'Neu befüllen …' : 'Kalender befüllen …'}
        </button>
        {isDemo() && !filled && (
          <button type="button" className="btn btn--soft" disabled={busy} onClick={() => {
            const demo = parseAdventJson(JSON.stringify(ADVENT_DEMO));
            void apply(demo.doors, demo.images);
          }}>
            Mit Beispielrezepten
          </button>
        )}
        {filled && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setPhotos(true)}>
            <Icon name="image" size={18} /> Fotos ergänzen …
          </button>
        )}
      </div>
      {photos && <AdventPhotosSheet cal={cal} onClose={() => setPhotos(false)} />}
      {/* je nach Handy kommt die Datei als .json oder .txt an */}
      <input ref={input} type="file" accept="application/json,.json,text/plain,.txt" hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {result && (result.errors.length ? (
        <div className="error" role="alert">
          <strong>{result.fileName}: so geht es noch nicht</strong>
          <ul className="advent-fill__list">
            {result.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
            {result.errors.length > 8 && <li>… und {result.errors.length - 8} weitere</li>}
          </ul>
        </div>
      ) : (
        <div className="backup-preview">
          <p><strong>{result.fileName}</strong> · {result.doors.length} Rezepte gefunden{photoCount > 0 && `, ${photoCount} mit Foto`}</p>
          {result.warnings.length > 0 && (
            <ul className="advent-fill__list small muted">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="row-gap">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => apply(result.doors, result.images)}>
              {busy ? (photoCount ? 'Fotos werden verkleinert …' : 'Einen Moment …') : 'Befüllen'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setResult(null)}>Abbrechen</button>
          </div>
        </div>
      ))}

      <details className="advent-fill__format small">
        <summary>Wie muss die Datei aussehen?</summary>
        <p>Eine JSON-Liste mit einem Eintrag je Tag: <code>tag</code> (1–24), <code>titel</code>, <code>portionen</code>,
          <code> zutaten</code> (je <code>name</code>, <code>menge</code>, <code>einheit</code>) und <code>schritte</code> (Texte).
          Dazu nach Wunsch <code>beschreibung</code>, <code>vorbereitung</code>, <code>backzeit</code> (Minuten), <code>tipp</code> und
          <code> bild</code> (Foto als <code>data:image/jpeg;base64,…</code>, bis 4 MB – keine Links).</p>
        <p>Einheiten wie in Mashi: g, kg, ml, l, EL, TL, Prise, Stück, Zehe, Dose, Glas, Bund, Handvoll, cm, Portion.</p>
      </details>
    </section>
  );
}

/** Fotos aus der Datei auf 800 px (lange Seite) verkleinern – wie eigene Fotos; ein kaputtes fällt still weg */
async function shrinkAll(images: Record<number, string>): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (const [day, url] of Object.entries(images)) {
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      out[Number(day)] = downscaled(img, 800);
    } catch (e) {
      console.warn(`Mashi: Foto für Türchen ${day} ließ sich nicht lesen`, e);
    }
  }
  return out;
}
