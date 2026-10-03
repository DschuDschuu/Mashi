/**
 * Rezepte von einer echten KI (über den Mashi-Server und OpenRouter).
 * Hier nur Reines: den Auftrag bauen und die Antwort prüfen. Die KI kann Unsinn liefern –
 * darum wird jede Antwort in ein gültiges RecipeContent übersetzt oder abgelehnt.
 * Nährwerte kommen NIE von der KI (RecipeContent hat kein Feld dafür) – die rechnet Mashi selbst.
 */
import { CATEGORIES, DEVICES } from './catalog';
import { newId } from './recipe';
import type { Difficulty, Ingredient, RecipeContent, Step, Unit } from './types';

/** Was Mashi über deine Küche weiß und mitschickt (alles optional) */
export interface KitchenContext {
  /** muss bald weg (rote Uhr, „Bald verbrauchen“) – das Rezept soll es aufbrauchen */
  useUp?: string[];
  /** steht in der Speisekammer */
  pantry?: string[];
  /** immer im Haus (Öl, Salz, Gewürze …) – nie „fehlt“ */
  basics?: string[];
  /** Vorlieben aus den Einstellungen („kein Koriander, gern scharf“ – oder aus den Rezepten zusammengefasst) */
  tastes?: string;
  /** Makro-Ziel – Anteil an den Kalorien in % (Julia: per Schalter mitschicken) */
  macros?: { carbs: number; protein: number; fat: number };
}

export interface RecipeAsk {
  prompt: string;
  servings?: number;
  maxMinutes?: number;
  devices?: string[];
  wishes?: string[];
  kitchen?: KitchenContext;
  /** Titel der letzten KI-Ideen – die KI soll sich nicht wiederholen (Julia: „bei allem Gochujang“) */
  recent?: string[];
}

/** so viel Vorlieben gehen höchstens mit (der Server nimmt 16 000 Zeichen Auftrag) */
export const MAX_TASTES = 10000;
/** Grenze des Servers vor dem Update (8000) – lehnt er ab, kürzt Mashi die Vorlieben darauf und fragt nochmal */
export const OLD_SERVER_PROMPT = 8000;

/** Vorlieben verdichten: Zeilenenden glätten, mehrere Leerzeilen zu einer – der Inhalt bleibt ganz */
const compact = (t: string) => t.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Prise', 'Stück', 'Zehe', 'Dose', 'Glas', 'Bund', 'Handvoll', 'cm', 'Messlöffel'];
/** was Modelle gern schreiben → Mashis Einheit */
const UNIT_ALIASES: Record<string, Unit> = {
  gramm: 'g', gr: 'g', kilogramm: 'kg', milliliter: 'ml', liter: 'l',
  esslöffel: 'EL', essloeffel: 'EL', el: 'EL', tbsp: 'EL', teelöffel: 'TL', teeloeffel: 'TL', tl: 'TL', tsp: 'TL',
  prisen: 'Prise', stk: 'Stück', 'stk.': 'Stück', stueck: 'Stück', stück: 'Stück', zehen: 'Zehe', dosen: 'Dose',
  gläser: 'Glas', bünde: 'Bund', handvoll: 'Handvoll', zentimeter: 'cm',
};

/** höchstens so viele Namen je Liste – der Auftrag bleibt kurz (und unter der Server-Grenze) */
const MAX_NAMES = 40;
const list = (xs: string[] | undefined) => [...new Set((xs ?? []).map((x) => x.trim()).filter(Boolean))].slice(0, MAX_NAMES).join(', ');

/**
 * Der Auftrag an die KI – deutsch, mit genauem Antwortformat. Die Geräte- und Kategorie-IDs
 * stehen dabei, damit die Antwort direkt zu Mashis Katalog passt.
 */
export function buildRecipePrompt(ask: RecipeAsk, opts: { maxLength?: number } = {}): string {
  const k = ask.kitchen ?? {};
  const lines: string[] = ['Erstelle ein Kochrezept auf Deutsch.'];
  const nothing = !ask.prompt.trim() && !ask.maxMinutes && !ask.devices?.length && !ask.wishes?.length;
  if (ask.prompt.trim()) lines.push(`Wunsch: ${ask.prompt.trim()}`);
  // „Überrasch mich“ (Julia): ganz ohne Angaben – dann ausdrücklich freie Wahl
  else if (nothing) lines.push('Überrasche mich mit einer Idee – Gericht, Küche und Hauptzutat sind frei.');
  if (ask.servings) lines.push(`Portionen: ${ask.servings}`);
  if (ask.maxMinutes) lines.push(`Höchstens ${ask.maxMinutes} Minuten insgesamt (Vorbereitung + Kochen).`);
  if (ask.devices?.length) lines.push(`Vorhandene Geräte, die genutzt werden sollen: ${list(ask.devices)}`);
  if (ask.wishes?.length) lines.push(`Stil: ${list(ask.wishes)}`);
  if (k.useUp?.length) lines.push(`Muss bald aufgebraucht werden – bitte möglichst alles davon verwenden: ${list(k.useUp)}`);
  if (k.pantry?.length) lines.push(`Außerdem im Vorrat (gern nutzen, damit wenig eingekauft werden muss): ${list(k.pantry)}`);
  if (k.basics?.length) lines.push(`Immer im Haus: ${list(k.basics)}`);
  if (k.macros) lines.push(`Makro-Ziel (Anteil an den Kalorien): Kohlenhydrate ${k.macros.carbs} %, Eiweiß ${k.macros.protein} %, Fett ${k.macros.fat} % – das Rezept soll möglichst nah daran liegen.`);
  const recent = [...new Set((ask.recent ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 8);
  if (recent.length) lines.push(`Zuletzt vorgeschlagen – bitte etwas deutlich anderes (andere Hauptzutat, andere Sauce, andere Richtung): ${recent.join('; ')}`);

  const tail = [
    '',
    // Vorlieben beschreiben oft ein eigenes Antwortformat (Name, kcal, Austausche …) – das der App geht vor
    'Antworte NUR mit einem JSON-Objekt, ohne Text davor oder danach – auch wenn oben ein anderes Format beschrieben ist –, genau in diesem Aufbau:',
    '{"title": "…", "description": "ein bis zwei Sätze", "servings": 2, "prepMinutes": 10, "cookMinutes": 20, "difficulty": 1,',
    ' "categories": ["hauptgericht"], "tags": ["Schnell"], "devices": ["herd"],',
    ' "imagePrompt": "kurze Beschreibung des fertigen Gerichts auf Englisch",',
    ' "ingredients": [{"name": "Paprika", "amount": 1, "unit": "Stück", "note": "gewürfelt"}],',
    ' "steps": [{"text": "…", "timerMinutes": 5}]}',
    `Erlaubte Einheiten: ${UNITS.join(', ')} (oder ohne Einheit, z. B. „Salz“).`,
    `difficulty: 1 = einfach, 2 = mittel, 3 = aufwendig. categories aus: ${CATEGORIES.map((c) => c.id).join(', ')}.`,
    `devices aus: ${DEVICES.map((d) => d.id).join(', ')}. timerMinutes nur bei Schritten mit Wartezeit.`,
    'Keine Nährwertangaben – die rechnet die App selbst.',
  ];

  // Vorlieben ganz (früher nach 1500 Zeichen abgeschnitten – dann fehlten „kein Fisch“, „kein Koriander“ …).
  // Als Richtung, nicht als Pflicht: sonst nimmt die KI jedes Mal die auffälligste Lieblingszutat.
  let tastes = compact(k.tastes ?? '').slice(0, MAX_TASTES);
  const block = (t: string) => (t ? [
    '',
    'Meine Vorlieben (als Richtung – kein genanntes Gericht nachkochen):',
    t,
    'Wichtig: Wechsle ab – nicht jedes Rezept braucht dieselbe Lieblingszutat, Sauce oder Küche; nimm jedes Mal eine andere Richtung daraus. Was dort ausgeschlossen ist, gilt immer.',
  ] : []);
  const join = (t: string) => [...lines, ...block(t), ...tail].join('\n');
  let out = join(tastes);
  // Platz knapp (älterer Server): die Vorlieben kürzen, nicht den Rest – an einem Zeilenende, mit Hinweis
  if (opts.maxLength && out.length > opts.maxLength && tastes) {
    const budget = Math.max(0, tastes.length - (out.length - opts.maxLength) - 20);
    const cut = tastes.slice(0, budget);
    tastes = cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0) || cut.length).trim() + ' …';
    out = join(tastes);
  }
  return out;
}

export class RecipeReplyError extends Error {}

/** Aus der Antwort das JSON holen – Modelle packen es gern in ```json … ``` oder schreiben Sätze drumherum */
function jsonOf(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new RecipeReplyError('Die KI hat kein Rezept geschickt.');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new RecipeReplyError('Die Antwort der KI war unvollständig.');
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/** „1,5“, „1.5“, 1.5 → 1.5; „½“ → 0.5; sonst undefined */
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : undefined;
  const s = str(v).replace('½', '0.5').replace('¼', '0.25').replace('¾', '0.75').replace(',', '.');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
const minutes = (v: unknown) => {
  const n = num(v);
  return n ? Math.min(600, Math.round(n)) : 0;
};
function unitOf(v: unknown): Unit | undefined {
  const s = str(v);
  if (!s) return undefined;
  const exact = UNITS.find((u) => u === s);
  return exact ?? UNIT_ALIASES[s.toLocaleLowerCase('de-DE')];
}

/**
 * Antwort der KI → RecipeContent. Wirft RecipeReplyError, wenn es kein brauchbares Rezept ist
 * (kein Titel, keine Zutaten, keine Schritte). Unbekannte Einheiten, Geräte und Kategorien
 * fallen still weg; Zahlen werden begrenzt.
 */
export function parseRecipeReply(text: string, ask: Pick<RecipeAsk, 'servings'> = {}): RecipeContent {
  const raw = jsonOf(text) as Record<string, unknown>;
  const title = str(raw.title).slice(0, 120);
  const ingredients: Ingredient[] = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => x && str(x.name))
    .slice(0, 40)
    .map((x) => {
      const amount = num(x.amount);
      const unit = unitOf(x.unit);
      const note = str(x.note);
      return {
        id: newId('i'), name: str(x.name).slice(0, 80),
        ...(amount !== undefined ? { amount: Math.round(amount * 100) / 100 } : {}),
        ...(unit ? { unit } : {}),
        ...(note ? { note: note.slice(0, 80) } : {}),
        ...(x.optional === true ? { optional: true } : {}),
      };
    });
  const steps: Step[] = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((x) => (typeof x === 'string' ? { text: x } : (x as Record<string, unknown>)))
    .filter((x) => x && str(x.text))
    .slice(0, 30)
    .map((x) => {
      const t = num(x.timerMinutes);
      return { id: newId('s'), text: str(x.text).slice(0, 600), ...(t ? { timerMinutes: Math.min(600, Math.round(t)) } : {}) };
    });
  if (!title || !ingredients.length || !steps.length) throw new RecipeReplyError('Die KI hat kein vollständiges Rezept geschickt.');
  const d = Math.round(num(raw.difficulty) ?? 1);
  const known = (xs: unknown, ids: string[]) => (Array.isArray(xs) ? [...new Set(xs.map(str).filter((x) => ids.includes(x)))] : []);
  const imagePrompt = str(raw.imagePrompt);
  return {
    title,
    description: str(raw.description).slice(0, 400),
    servings: Math.min(24, Math.round(num(raw.servings) ?? ask.servings ?? 2)),
    prepMinutes: minutes(raw.prepMinutes),
    cookMinutes: minutes(raw.cookMinutes),
    difficulty: (Math.min(3, Math.max(1, d)) as Difficulty),
    ingredients,
    steps,
    categories: known(raw.categories, CATEGORIES.map((c) => c.id)),
    tags: (Array.isArray(raw.tags) ? raw.tags.map(str).filter(Boolean) : []).slice(0, 6).map((t) => t.slice(0, 30)),
    devices: known(raw.devices, DEVICES.map((x) => x.id)),
    ...(imagePrompt ? { imagePrompt: imagePrompt.slice(0, 300) } : {}),
  };
}
