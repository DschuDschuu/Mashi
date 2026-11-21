import { useSyncExternalStore } from 'react';
import { doorNotes, doorOn, fillAdvent, markOpened, markSaved, unionAdvent, type AdventCalendar, type AdventDoor } from '../domain/advent';
import type { RecipeRepository } from './repository';
import { createRecipe, deleteRecipe } from './store';

/**
 * Zustand des Adventskalenders – bewusst neben store.ts statt darin: ein Dokument, wenige Aktionen, und der große
 * Store bleibt unberührt. Speichern und Neuladen wie dort (Code-Review #10): Speichern mit `base`, damit eine
 * Änderung vom anderen Gerät nicht überschrieben wird; ein Neuladen übernimmt nur, was sich hier inzwischen nicht
 * geändert hat.
 */

let repo: RecipeRepository | undefined;
/** undefined = noch nicht geladen – die Startseite zeigt dann noch keine „befüllen“-Erinnerung */
let calendar: AdventCalendar | undefined;
let saveError: string | null = null;
/** Änderungsnummer: zählt bei jeder eigenen Änderung hoch */
let gen = 0;
let pending = 0;
let reloadMissed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function initAdvent(r: RecipeRepository) {
  repo = r;
  try {
    calendar = await r.loadAdvent();
  } catch (e) {
    // der Kalender ist ein Extra – ein Fehler hier darf Mashi nicht am Starten hindern
    console.error('Mashi: Adventskalender ließ sich nicht laden', e);
    saveError = 'Der Adventskalender ließ sich nicht laden. Lade die Seite bitte neu.';
  }
  emit();
  r.onExternalChange?.(scheduleReload);
}

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    if (!repo) return;
    if (pending) {
      reloadMissed = true;
      return;
    }
    const before = gen;
    try {
      const fresh = await repo.loadAdvent();
      if (gen !== before || pending) reloadMissed = true; // hier geändert, während gelesen wurde → später nochmal
      else if (JSON.stringify(fresh) !== JSON.stringify(calendar)) {
        calendar = fresh;
        emit();
      }
    } catch (e) {
      console.error('Mashi: Adventskalender vom anderen Gerät ließ sich nicht laden', e);
    }
  }, 300);
}

function commit(next: AdventCalendar) {
  const base = calendar;
  const stamped = { ...next, updatedAt: new Date().toISOString() };
  calendar = stamped;
  gen++;
  pending++;
  emit();
  if (!repo) return;
  repo.saveAdvent(stamped, base)
    .then((stored) => {
      if (saveError) saveError = null;
      // zusammengeführt (anderes Gerät hat auch geändert) → das zeigen, falls hier nichts Neueres kam
      if (stored && stored !== stamped && calendar === stamped) calendar = stored;
      emit();
    }, (e) => {
      console.error('Mashi: Adventskalender nicht gespeichert', e);
      saveError = 'Die letzte Änderung am Adventskalender konnte nicht gespeichert werden.';
      emit();
    })
    .finally(() => {
      pending--;
      if (!pending && reloadMissed) {
        reloadMissed = false;
        scheduleReload();
      }
    });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** undefined, solange der Kalender noch lädt */
export function useAdvent(): AdventCalendar | undefined {
  return useSyncExternalStore(subscribe, () => calendar);
}

export function useAdventError(): string | null {
  return useSyncExternalStore(subscribe, () => saveError);
}

/** Neue Datei einspielen. Gibt „Rückgängig“ zurück (der Kalender wie vorher). */
export function fillCalendar(doors: AdventDoor[], now = new Date()): () => void {
  if (!calendar) return () => {};
  const before = calendar;
  commit(fillAdvent(calendar, doors, now));
  return () => commit(before);
}

/**
 * Aus einer Sicherung: mit dem jetzigen Kalender vereint – die neuere Befüllung gilt, geöffnete und gespeicherte
 * Türchen kommen dazu (eine alte Sicherung macht einen neu befüllten Kalender nicht wieder alt).
 */
export function importAdvent(incoming: AdventCalendar) {
  if (calendar) commit(unionAdvent(calendar, incoming));
}

/** Türchen öffnen – merkt sich, dass es offen ist (auf allen Geräten) */
export function openDoor(day: number, now = new Date()) {
  if (!calendar) return;
  const next = markOpened(calendar, day, now);
  if (next !== calendar) commit(next);
}

/**
 * Rezept hinter dem Türchen ins Kochbuch – als „Zum Testen“ (Mashis Weg: erst testen, dann entscheiden), der Tipp
 * als Notiz. Gibt die Rezept-ID und „Rückgängig“ zurück (Rezept wieder weg, Türchen wieder ungespeichert).
 */
export function saveDoor(day: number): { recipeId: string; undo: () => void } | undefined {
  const door = calendar && doorOn(calendar, day);
  if (!calendar || !door) return undefined;
  const recipeId = createRecipe(structuredClone(door.content), { source: 'import', status: 'zum_testen', notes: doorNotes(door) });
  commit(markSaved(calendar, day, recipeId));
  return {
    recipeId,
    undo: () => {
      deleteRecipe(recipeId);
      if (calendar?.saved[day] === recipeId) commit(markSaved(calendar, day, undefined));
    },
  };
}
