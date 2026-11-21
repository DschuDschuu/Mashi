import { useEffect, useSyncExternalStore } from 'react';
import { doorNotes, doorOn, fillAdvent, imageIdsOf, markOpened, markSaved, unionAdvent, type AdventCalendar, type AdventDoor } from '../domain/advent';
import { newId } from '../domain/recipe';
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

/**
 * Neue Datei einspielen – die Fotos (schon verkleinert, je Tag) kommen in eigene Dokumente, die Türchen bekommen nur
 * den Verweis. Passen die Fotos nicht in den Speicher (Demo: localStorage ist knapp), wird ohne Fotos befüllt
 * (`photosFailed`). Gibt „Rückgängig“ zurück (der Kalender wie vorher – seine Fotos sind noch da, siehe unten).
 */
export async function fillCalendar(doors: AdventDoor[], images: Record<number, string> = {}, now = new Date()): Promise<{ undo: () => void; photosFailed: boolean }> {
  if (!calendar || !repo) return { undo: () => {}, photosFailed: false };
  const before = calendar;
  // neue Datei = neue IDs: ein Foto ändert sich nie, und „Rückgängig“ findet die alten noch
  const photos = Object.entries(images).map(([day, url]) => ({ day: Number(day), id: newId('adventbild'), url }));
  let withPhotos = doors;
  let photosFailed = false;
  if (photos.length) {
    try {
      await repo.saveAdventImages(photos);
      for (const p of photos) imageCache.set(p.id, p.url);
      withPhotos = doors.map((d) => {
        const p = photos.find((x) => x.day === d.day);
        return p ? { ...d, imageId: p.id } : d;
      });
    } catch (e) {
      console.error('Mashi: Fotos des Adventskalenders nicht gespeichert', e);
      photosFailed = true;
    }
  }
  if (!calendar) return { undo: () => {}, photosFailed };
  commit(fillAdvent(calendar, withPhotos, now));
  // aufräumen: Fotos, die weder der neue noch der vorige Kalender braucht – die vorigen bleiben fürs „Rückgängig“
  void repo.pruneAdventImages([...imageIdsOf(calendar), ...imageIdsOf(before)])
    .catch((e) => console.error('Mashi: alte Fotos des Adventskalenders nicht aufgeräumt', e));
  return { undo: () => commit(before), photosFailed };
}

// ── Fotos: erst laden, wenn ein Türchen sie zeigt ──

/** geladene Fotos je ID – ändern sich nie, darum ohne Ablauf */
const imageCache = new Map<string, string>();
const imageLoading = new Set<string>();

function loadImage(id: string) {
  if (!repo || imageCache.has(id) || imageLoading.has(id)) return;
  imageLoading.add(id);
  repo.loadAdventImage(id)
    .then((url) => {
      if (url) {
        imageCache.set(id, url);
        emit();
      }
    }, (e) => console.error('Mashi: Foto des Adventskalenders ließ sich nicht laden', e))
    // fehlt es noch (vom anderen Gerät nicht angekommen), beim nächsten Anzeigen erneut versuchen
    .finally(() => imageLoading.delete(id));
}

/** Das Foto eines Türchens – undefined, solange es lädt oder es keins gibt */
export function useAdventImage(id: string | undefined): string | undefined {
  const url = useSyncExternalStore(subscribe, () => (id ? imageCache.get(id) : undefined));
  useEffect(() => {
    if (id) loadImage(id);
  }, [id]);
  return url;
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
 * als Notiz, das Foto des Türchens als Bild (ohne Foto zeichnet Mashi wie immer eins). Gibt die Rezept-ID und
 * „Rückgängig“ zurück (Rezept wieder weg, Türchen wieder ungespeichert).
 */
export async function saveDoor(day: number): Promise<{ recipeId: string; undo: () => void } | undefined> {
  const door = calendar && doorOn(calendar, day);
  if (!calendar || !door) return undefined;
  // schneller getippt, als das Foto geladen war → darauf warten, sonst käme das Rezept ohne Foto ins Kochbuch
  const photo = door.imageId
    ? imageCache.get(door.imageId) ?? await repo?.loadAdventImage(door.imageId).catch(() => undefined)
    : undefined;
  if (!calendar) return undefined;
  const recipeId = createRecipe(structuredClone(door.content), {
    source: 'import', status: 'zum_testen', notes: doorNotes(door), ...(photo ? { image: { kind: 'url' as const, url: photo } } : {}),
  });
  commit(markSaved(calendar, day, recipeId));
  return {
    recipeId,
    undo: () => {
      deleteRecipe(recipeId);
      if (calendar?.saved[day] === recipeId) commit(markSaved(calendar, day, undefined));
    },
  };
}
