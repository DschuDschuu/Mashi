import { CATEGORIES, DEVICES, type CatalogEntry } from './catalog';
import { isDataImage, MAX_IMAGE } from './dataImage';
import { timerFrom, toUnit } from './importText';
import { newId } from './recipe';
import type { Difficulty, Ingredient, RecipeContent, Step, Unit } from './types';

/**
 * Einfache Rezept-Datei (Julia: „so wie beim Adventskalender, nur für normale Rezepte“): eine JSON-Datei mit einem
 * oder vielen Rezepten in deutschen Feldnamen – selbst geschrieben oder von einer KI erstellt. Eingespielt unter
 * Plus → Importieren → „Rezept-Datei wählen“, die Rezepte kommen nach „Zum Testen“. Format: docs/REZEPT-DATEI.md.
 *
 * Die Bausteine (Zahl, Einheit, Zutat, Foto, Titel bis Schritte) teilt sie mit dem Adventskalender (advent.ts) –
 * dasselbe Grundformat, nur ohne „tag“ und mit Einordnung und Meal Prep.
 */

// ── Gemeinsame Bausteine (auch für den Adventskalender) ───────────

const UNITS: readonly Unit[] = ['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Prise', 'Stück', 'Zehe', 'Dose', 'Glas', 'Bund', 'Handvoll', 'cm', 'Messlöffel', 'Portion'];

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Zahl aus der Datei – „1,5“ als Text geht auch (so schreibt man es in Deutschland), sonst undefined */
export function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Erst genau wie in Mashi („EL“), dann die Schreibweisen, die der Text-Import kennt („Stk.“, „Liter“, „Zehen“) */
const unitOf = (s: string): Unit | undefined => UNITS.find((u) => u === s) ?? UNITS.find((u) => u.toLowerCase() === s.toLowerCase()) ?? toUnit(s);

/** „sauce“ → „Sauce“: Teile heißen in Mashi groß, sonst stünden „Sauce“ und „sauce“ als zwei Teile da */
const partName = (s: string) => s.charAt(0).toLocaleUpperCase('de-DE') + s.slice(1);

function ingredientOf(raw: unknown, where: string, errors: string[], warnings: string[]): Ingredient | undefined {
  const z = isObj(raw) ? raw : {};
  const name = text(z.name);
  if (!name) {
    errors.push(`${where}: Zutat ohne „name“.`);
    return undefined;
  }
  let amount = num(z.menge);
  if (z.menge !== undefined && z.menge !== null && (amount === undefined || amount < 0)) {
    warnings.push(`${where}: Menge „${String(z.menge)}“ bei ${name} ist keine Zahl – weggelassen.`);
    amount = undefined;
  }
  const unitText = text(z.einheit);
  const unit = unitText ? unitOf(unitText) : undefined;
  // unbekannte Einheit („Päckchen“, „Becher“): nicht raten, sondern als Hinweis an der Zutat behalten
  const notes = [unitText && !unit ? unitText : '', text(z.hinweis)].filter(Boolean);
  if (unitText && !unit) warnings.push(`${where}: Einheit „${unitText}“ kennt Mashi nicht – steht bei ${name} als Hinweis.`);
  const part = text(z.teil);
  return {
    id: newId('i'),
    name,
    ...(amount ? { amount } : {}),
    ...(unit ? { unit } : {}),
    ...(notes.length ? { note: notes.join(', ') } : {}),
    ...(z.optional === true ? { optional: true } : {}),
    ...(part ? { part: partName(part) } : {}),
  };
}

/** „bild“: ein eingebettetes Foto – sonst ohne Foto übernehmen und sagen, warum */
function imageOf(v: unknown, where: string, warnings: string[]): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (isDataImage(v)) return v;
  const s = typeof v === 'string' ? v.trim() : '';
  if (/^https?:/i.test(s)) warnings.push(`${where}: Links nimmt Mashi nicht – das Foto muss in der Datei stehen („data:image/jpeg;base64,…“). Ohne Foto übernommen.`);
  else if (s.startsWith('data:image/') && s.length > MAX_IMAGE) warnings.push(`${where}: Das Foto ist größer als 4 MB – bitte vorher verkleinern. Ohne Foto übernommen.`);
  else warnings.push(`${where}: „bild“ ist kein Foto (JPEG, PNG oder WebP als „data:image/…;base64,…“). Ohne Foto übernommen.`);
  return undefined;
}

export interface FileContent {
  content: RecipeContent;
  /** „tipp“ aus der Datei – landet beim Speichern in den Notizen */
  tip: string;
  /** Foto aus der Datei (data-URL) – wird beim Einspielen verkleinert */
  image?: string;
}

/**
 * Was Adventskalender und Rezept-Datei gemeinsam haben: Titel, Portionen, Zeiten, Zutaten, Schritte, Beschreibung,
 * Tipp, Foto. Streng bei dem, was ein Rezept braucht (Fehler → undefined), nachsichtig bei Kleinigkeiten (Hinweis).
 * Schritte als Text – oder { "text": …, "teil": … }, wenn ein Schritt zu einem Teil gehört.
 */
export function contentOf(r: Record<string, unknown>, where: string, errors: string[], warnings: string[]): FileContent | undefined {
  const before = errors.length;
  const title = text(r.titel);
  if (!title) errors.push(`${where}: „titel“ fehlt.`);
  const servings = num(r.portionen);
  if (!servings || servings <= 0) errors.push(`${where}: „portionen“ muss eine Zahl größer 0 sein.`);
  const minutes = (key: string, v: unknown) => {
    if (v === undefined || v === null) return 0;
    const n = num(v);
    if (n === undefined || n < 0) {
      warnings.push(`${where}: „${key}“ ist keine Minutenzahl – 0 angenommen.`);
      return 0;
    }
    return Math.round(n);
  };
  const prepMinutes = minutes('vorbereitung', r.vorbereitung);
  // „backzeit“ steht im Advents-Format, „kochzeit“ ist dasselbe für alles, was nicht in den Ofen kommt
  const cookMinutes = minutes(r.backzeit !== undefined ? 'backzeit' : 'kochzeit', r.backzeit ?? r.kochzeit);

  const rawIngredients = Array.isArray(r.zutaten) ? r.zutaten : [];
  if (!rawIngredients.length) errors.push(`${where}: „zutaten“ fehlen.`);
  const ingredients = rawIngredients.map((z) => ingredientOf(z, where, errors, warnings)).filter((i): i is Ingredient => !!i);

  const rawSteps = Array.isArray(r.schritte) ? r.schritte : [];
  const stepParts = rawSteps
    .map((s) => (isObj(s) ? { t: text(s.text), part: text(s.teil) } : { t: text(s), part: '' }))
    .filter((s) => s.t);
  if (!stepParts.length) errors.push(`${where}: „schritte“ fehlen.`);
  const steps: Step[] = stepParts.map(({ t, part }) => {
    const timer = timerFrom(t);
    return { id: newId('s'), text: t, ...(timer ? { timerMinutes: timer } : {}), ...(part ? { part: partName(part) } : {}) };
  });

  if (errors.length > before) return undefined;
  const image = imageOf(r.bild, where, warnings);
  return {
    content: {
      title,
      description: text(r.beschreibung),
      servings: servings!,
      prepMinutes,
      cookMinutes,
      difficulty: 1,
      ingredients,
      steps,
      categories: [],
      tags: [],
      devices: [],
    },
    tip: text(r.tipp),
    ...(image ? { image } : {}),
  };
}

// ── Rezept-Datei ──────────────────────────────────────────────────

export interface FileRecipe {
  content: RecipeContent;
  /** Tipp und Aufbewahrung aus der Datei */
  notes: string;
  /** Foto (data-URL) – wird beim Einspielen auf 800 px verkleinert */
  image?: string;
  /** Meal Prep: hält gekocht so viele Tage im Kühlschrank (Recipe.keepsDays) */
  keepsDays?: number;
  /** Meal Prep: lässt sich gekocht einfrieren (Recipe.freezable) */
  freezable?: boolean;
}

export interface RecipeFileImport {
  recipes: FileRecipe[];
  /** Rezepte, die so nicht gehen (Titel fehlt …) – sie werden übersprungen, die anderen lassen sich einspielen */
  errors: string[];
  /** Eingespielt wird trotzdem – aber man sieht, was Mashi anders gemacht hat */
  warnings: string[];
}

/** „Salat & Bowl“, „salat-bowl“, „SALAT bowl“ → derselbe Schlüssel */
const norm = (s: string) => s.toLocaleLowerCase('de-DE').replace(/[^a-zäöüß0-9]+/g, '');

/** Was man natürlich schreibt, aber nicht genau so im Katalog steht */
const CATEGORY_ALIASES: Record<string, string> = {
  suppe: 'suppe', eintopf: 'suppe', salat: 'salat-bowl', bowl: 'salat-bowl', getränk: 'getraenke',
  nachtisch: 'dessert', nachspeise: 'dessert', kuchen: 'backen', gebäck: 'backen', brot: 'backen', abendessen: 'hauptgericht',
};
const DEVICE_ALIASES: Record<string, string> = {
  ofen: 'backofen', heißluftfritteuse: 'airfryer', heissluftfritteuse: 'airfryer', monsieur: 'monsieur-cuisine',
  mc: 'monsieur-cuisine', kochfeld: 'herd', pfanne: 'herd', topf: 'herd', slowcooker: 'slow-cooker', schongarer: 'slow-cooker',
};

const catalogId = (entries: readonly CatalogEntry[], aliases: Record<string, string>, s: string): string | undefined => {
  const n = norm(s);
  return entries.find((e) => norm(e.id) === n || norm(e.label) === n)?.id ?? aliases[n];
};

/** ein Text oder eine Liste von Texten */
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter(Boolean) : text(v) ? [text(v)] : []);

const DIFFICULTY: Record<string, Difficulty> = { einfach: 1, leicht: 1, mittel: 2, anspruchsvoll: 3, schwer: 3, schwierig: 3 };

function difficultyOf(v: unknown, where: string, warnings: string[]): Difficulty {
  if (v === undefined || v === null || v === '') return 1;
  const n = num(v);
  if (n === 1 || n === 2 || n === 3) return n;
  const d = DIFFICULTY[norm(String(v))];
  if (d) return d;
  warnings.push(`${where}: Schwierigkeit „${String(v)}“ kennt Mashi nicht (1–3 oder einfach, mittel, anspruchsvoll) – „einfach“ angenommen.`);
  return 1;
}

/** „haltbar_tage“: eine Zahl – bei „2 bis 3“ die kleinere (lieber einen Tag zu früh essen als zu spät) */
function keepsDaysOf(v: unknown, where: string, warnings: string[]): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = num(v) ?? (typeof v === 'string' ? Math.min(...(v.match(/\d+/g) ?? []).map(Number)) : undefined);
  if (n !== undefined && Number.isFinite(n) && n >= 1 && n <= 30) return Math.round(n);
  warnings.push(`${where}: „haltbar_tage“ „${String(v)}“ ist keine Zahl von 1 bis 30 – weggelassen.`);
  return undefined;
}

function freezableOf(v: unknown, where: string, warnings: string[]): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  const s = norm(String(v));
  if (s === 'ja') return true;
  if (s === 'nein') return false;
  warnings.push(`${where}: „einfrierbar“ ist weder true/false noch ja/nein – weggelassen.`);
  return undefined;
}

function recipeOf(raw: unknown, index: number, errors: string[], warnings: string[]): FileRecipe | undefined {
  const r = isObj(raw) ? raw : {};
  const title = text(r.titel);
  const where = title ? `„${title}“` : `Rezept ${index + 1}`;
  const parsed = contentOf(r, where, errors, warnings);
  if (!parsed) return undefined;

  // Einordnung: Unbekannte Kategorien gehen nicht verloren – sie werden zum Schlagwort
  const categories: string[] = [];
  const tags = texts(r.schlagworte);
  for (const c of texts(r.kategorie ?? r.kategorien)) {
    const id = catalogId(CATEGORIES, CATEGORY_ALIASES, c);
    if (id) { if (!categories.includes(id)) categories.push(id); } else {
      warnings.push(`${where}: Kategorie „${c}“ kennt Mashi nicht – als Schlagwort übernommen.`);
      if (!tags.includes(c)) tags.push(c);
    }
  }
  const devices: string[] = [];
  for (const g of texts(r.geraete ?? r.geräte)) {
    const id = catalogId(DEVICES, DEVICE_ALIASES, g);
    if (id) { if (!devices.includes(id)) devices.push(id); } else warnings.push(`${where}: Gerät „${g}“ kennt Mashi nicht – weggelassen.`);
  }
  const storage = text(r.aufbewahrung);
  const notes = [parsed.tip ? `Tipp: ${parsed.tip}` : '', storage ? `Aufbewahrung: ${storage}` : ''].filter(Boolean).join('\n');
  const keepsDays = keepsDaysOf(r.haltbar_tage, where, warnings);
  const freezable = freezableOf(r.einfrierbar, where, warnings);
  return {
    content: { ...parsed.content, difficulty: difficultyOf(r.schwierigkeit, where, warnings), categories, devices, tags },
    notes,
    ...(parsed.image ? { image: parsed.image } : {}),
    ...(keepsDays ? { keepsDays } : {}),
    ...(freezable !== undefined ? { freezable } : {}),
  };
}

/**
 * Rezept-Datei → Rezepte. Ein Rezept, eine Liste oder { "rezepte": [...] }. Ein kaputtes Rezept hält die anderen
 * nicht auf: Es steht mit Grund unter `errors` und wird übersprungen.
 */
export function parseRecipeFile(json: string): RecipeFileImport {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { recipes: [], errors: ['Die Datei ist kein gültiges JSON – fehlt irgendwo ein Komma oder eine Klammer?'], warnings: [] };
  }
  // eine Mashi-Sicherung oder geteilte Rezepte – die haben ihren eigenen Weg
  if (isObj(data) && (data.app === 'mashi' || Array.isArray(data.recipes))) {
    return { recipes: [], errors: ['Das ist eine Mashi-Datei (Sicherung oder geteilte Rezepte) – die spielst du unter Einstellungen → Sicherung → Einspielen ein.'], warnings: [] };
  }
  const list = Array.isArray(data) ? data
    : isObj(data) && Array.isArray(data.rezepte) ? data.rezepte
      : isObj(data) && 'titel' in data ? [data]
        : undefined;
  if (!list?.length) return { recipes: [], errors: ['In der Datei steht kein Rezept – erwartet wird eins mit „titel“, „portionen“, „zutaten“ und „schritte“ (oder eine Liste davon).'], warnings: [] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const recipes = list.map((raw, i) => recipeOf(raw, i, errors, warnings)).filter((r): r is FileRecipe => !!r);
  return { recipes, errors, warnings };
}

/** Titel zum Vergleichen: Groß/klein und doppelte Leerzeichen zählen nicht */
const titleKey = (t: string) => t.toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim();

/**
 * Welche Rezepte der Datei es schon gibt (Julia: „in der Vorschau zeigen“) – gleicher Titel im Kochbuch oder weiter
 * oben in derselben Datei. Die Vorschau wählt sie ab, man kann sie trotzdem anhaken.
 */
export function duplicatesOf(recipes: readonly FileRecipe[], existingTitles: readonly string[]): Set<number> {
  const seen = new Set(existingTitles.map(titleKey));
  const dup = new Set<number>();
  recipes.forEach((r, i) => {
    const k = titleKey(r.content.title);
    if (seen.has(k)) dup.add(i);
    seen.add(k);
  });
  return dup;
}
