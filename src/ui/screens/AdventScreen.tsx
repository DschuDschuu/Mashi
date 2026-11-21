import { useEffect, useRef, useState } from 'react';
import { fillCalendar, openDoor, saveDoor, useAdvent, useAdventError } from '../../data/adventStore';
import { ADVENT_DEMO } from '../../data/adventDemo';
import { isDemo, useRecipes } from '../../data/store';
import {
  ADVENT_DAYS, canOpen, doorOn, needsFilling, parseAdventJson, type AdventCalendar, type AdventDoor, type AdventImport,
} from '../../domain/advent';
import { totalMinutes } from '../../domain/recipe';
import { formatQuantity } from '../../domain/scaling';
import { navigate } from '../../router';
import { ask } from '../confirm';
import { formatMinutes, portionCount } from '../format';
import { toast } from '../toast';
import { useSheet } from '../useSheet';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';

const DAYS = Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1);

/**
 * Adventskalender (Julia): 24 Türchen, hinter jedem ein Rezept aus ihrer Datei. Ein Türchen geht an seinem Tag auf;
 * geöffnet zeigt es das Rezept, „Zum Testen speichern“ legt es ins Kochbuch. `day` = von der Startseite aus gleich
 * das Türchen des Tages aufmachen.
 */
export function AdventScreen({ day }: { day?: number }) {
  const cal = useAdvent();
  const error = useAdventError();
  const [openDay, setOpenDay] = useState<number | null>(null);
  const now = new Date();

  // von der Startseite („Türchen 5 öffnen“): gleich auf – sobald der Kalender geladen ist, und nur einmal
  const jumped = useRef(false);
  useEffect(() => {
    if (!cal || !day || jumped.current) return;
    jumped.current = true;
    if (canOpen(cal, day, new Date()) && doorOn(cal, day)) {
      openDoor(day);
      setOpenDay(day);
    }
  }, [cal, day]);

  if (!cal) return <main className="screen"><TopBar title="Adventskalender" backTo="/" /></main>;

  const tap = (d: number) => {
    if (!canOpen(cal, d, new Date())) {
      toast(`Noch zu – Türchen ${d} geht am ${d}. Dezember auf`);
      return;
    }
    openDoor(d);
    setOpenDay(d);
  };
  const door = openDay ? doorOn(cal, openDay) : undefined;

  return (
    <main className="screen">
      <TopBar title="Adventskalender" backTo="/" intro="advent" />
      {error && <p className="error" role="alert">{error}</p>}
      {cal.doors.length > 0 && (
        <>
          <p className="advent-lead">{leadText(cal, now)}</p>
          <div className="advent-grid">
            {DAYS.map((d) => <Door key={d} day={d} cal={cal} now={now} onTap={tap} />)}
          </div>
        </>
      )}
      <FillPanel cal={cal} stale={needsFilling(cal, now)} />
      {door && openDay && <DoorSheet day={openDay} door={door} savedId={cal.saved[openDay]} onClose={() => setOpenDay(null)} />}
    </main>
  );
}

function leadText(cal: AdventCalendar, now: Date): string {
  if (now.getFullYear() > cal.year) return 'Der Kalender ist vom letzten Jahr – alle Türchen sind offen.';
  if (now.getMonth() < 11) return 'Ab dem 1. Dezember geht jeden Tag ein Türchen auf.';
  if (now.getDate() <= ADVENT_DAYS) return `Heute ist Türchen ${now.getDate()} dran.`;
  return 'Frohe Weihnachten! Verpasste Türchen kannst du jederzeit nachholen.';
}

function Door({ day, cal, now, onTap }: { day: number; cal: AdventCalendar; now: Date; onTap: (d: number) => void }) {
  const door = doorOn(cal, day);
  const can = canOpen(cal, day, now);
  const opened = !!cal.opened[day];
  const today = cal.year === now.getFullYear() && now.getMonth() === 11 && now.getDate() === day;
  if (!door) {
    return <div className="advent-door is-empty" aria-label={`Türchen ${day}: leer`}><span className="advent-door__num">{day}</span></div>;
  }
  const state = !can ? 'is-locked' : opened ? 'is-open' : 'is-ready';
  const label = !can ? `Türchen ${day}, geht am ${day}. Dezember auf` : opened ? `Türchen ${day}: ${door.content.title}` : `Türchen ${day} öffnen`;
  return (
    // gesperrt nicht „disabled“: Antippen sagt dann, wann es aufgeht
    <button type="button" className={`advent-door ${state}${today ? ' is-today' : ''}`} aria-label={label} aria-disabled={!can || undefined} onClick={() => onTap(day)}>
      <span className="advent-door__num">{day}</span>
      {!can && <Icon name="lock" size={14} className="advent-door__icon" />}
      {can && !opened && (today ? <span className="advent-door__today">Heute</span> : <Icon name="gift" size={18} className="advent-door__icon" />)}
      {opened && <span className="advent-door__title">{door.content.title}</span>}
      {cal.saved[day] && <Icon name="check" size={14} className="advent-door__saved" />}
    </button>
  );
}

/** Das Rezept hinter dem Türchen – wie eine kleine Rezeptkarte, mit „Zum Testen speichern“ */
function DoorSheet({ day, door, savedId, onClose }: { day: number; door: AdventDoor; savedId?: string; onClose: () => void }) {
  const ref = useSheet(onClose);
  const saved = useRecipes().find((r) => r.id === savedId);
  const c = door.content;
  const minutes = totalMinutes(c);
  // Zutaten nach Teil („Teig“, „Glasur“) – in der Reihenfolge der Datei
  const parts = [...new Set(c.ingredients.map((i) => i.part ?? ''))];

  const save = () => {
    const res = saveDoor(day);
    if (res) toast(`„${c.title}“ steht im Kochbuch unter „Zum Testen“`, { label: 'Rückgängig', run: res.undo });
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet advent-sheet" role="dialog" aria-modal="true" aria-labelledby="advent-sheet-title" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <p className="advent-sheet__day"><Icon name="gift" size={16} /> Türchen {day}</p>
        <h2 className="sheet__title" id="advent-sheet-title">{c.title}</h2>
        {c.description && <p className="advent-sheet__desc">{c.description}</p>}
        <p className="small muted">{portionCount(c.servings)}{minutes > 0 && ` · ${formatMinutes(minutes)}`}</p>

        <h3 className="advent-sheet__head">Zutaten</h3>
        {parts.map((p) => (
          <div key={p || 'alle'} className="ingredients__part">
            {p && parts.length > 1 && <h4 className="ingredients__parthead">{p}</h4>}
            <ul className="ingredients">
              {c.ingredients.filter((i) => (i.part ?? '') === p).map((i) => (
                <li key={i.id}>
                  <span className="ingredients__qty">{formatQuantity(i)}</span>
                  <span className="ingredients__name">{i.name}{i.note && <span className="muted">, {i.note}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

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
          ) : (
            <button type="button" className="btn btn--primary btn--block" onClick={save}>
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

  const onFile = async (file: File | undefined) => {
    if (input.current) input.current.value = ''; // dieselbe Datei nach dem Verbessern erneut wählbar
    if (!file) return;
    setResult({ ...parseAdventJson(await file.text()), fileName: file.name });
  };

  const apply = async (doors: AdventDoor[]) => {
    if (quiet && !(await ask({
      title: 'Kalender neu befüllen?',
      text: 'Die Türchen bekommen die Rezepte aus der neuen Datei. Was du schon geöffnet oder gespeichert hast, bleibt.',
      confirm: 'Neu befüllen',
    }))) return;
    const undo = fillCalendar(doors);
    setResult(null);
    toast(`Adventskalender mit ${doors.length} Türchen befüllt`, { label: 'Rückgängig', run: undo });
  };

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
        <button type="button" className={`btn ${quiet ? 'btn--ghost' : 'btn--primary'}`} onClick={() => input.current?.click()}>
          <Icon name="file" size={18} /> {filled ? 'Neu befüllen …' : 'Kalender befüllen …'}
        </button>
        {isDemo() && !filled && (
          <button type="button" className="btn btn--soft" onClick={() => apply(parseAdventJson(JSON.stringify(ADVENT_DEMO)).doors)}>
            Mit Beispielrezepten
          </button>
        )}
      </div>
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
          <p><strong>{result.fileName}</strong> · {result.doors.length} Rezepte gefunden</p>
          {result.warnings.length > 0 && (
            <ul className="advent-fill__list small muted">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="row-gap">
            <button type="button" className="btn btn--primary" onClick={() => apply(result.doors)}>Befüllen</button>
            <button type="button" className="btn btn--ghost" onClick={() => setResult(null)}>Abbrechen</button>
          </div>
        </div>
      ))}

      <details className="advent-fill__format small">
        <summary>Wie muss die Datei aussehen?</summary>
        <p>Eine JSON-Liste mit einem Eintrag je Tag: <code>tag</code> (1–24), <code>titel</code>, <code>portionen</code>,
          <code> zutaten</code> (je <code>name</code>, <code>menge</code>, <code>einheit</code>) und <code>schritte</code> (Texte).
          Dazu nach Wunsch <code>beschreibung</code>, <code>vorbereitung</code>, <code>backzeit</code> (Minuten) und <code>tipp</code>.</p>
        <p>Einheiten wie in Mashi: g, kg, ml, l, EL, TL, Prise, Stück, Zehe, Dose, Glas, Bund, Handvoll, cm, Portion.</p>
      </details>
    </section>
  );
}
