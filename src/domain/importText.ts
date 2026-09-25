import { newId } from './recipe';
import type { Difficulty, Ingredient, RecipeContent, Step, Unit } from './types';

/**
 * Erkennt ein Rezept aus eingefügtem Text – ohne KI, mit festen Regeln.
 * Ergebnis ist ein ENTWURF: Er wird immer erst im Formular angezeigt und geprüft,
 * nie direkt gespeichert (siehe Konzept: „Importierte Rezepte nicht ungeprüft speichern“).
 *
 * Kommt u. a. klar mit:
 * - zaubermix-Format: „3 ELÖl“, „1000 gSchupfnudeln“ (Einheit klebt am Namen), Links
 *   „[Tomatenmark](https://…)“, Schrittnummern allein in einer Zeile
 * - „Paprika: 6 Stück (~440 g)“ (Name zuerst)
 * - Listen mit „*“, „-“, „•“ und nummerierte Schritte „1.“, „2)“, „1️⃣“
 */
export interface TextImport {
  content: RecipeContent;
  notes: string;
  /** Was nicht erkannt wurde – wird im Formular als Hinweis gezeigt */
  warnings: string[];
}

const UNIT_WORDS: [RegExp, Unit][] = [
  [/^kg$/i, 'kg'], [/^g$/i, 'g'], [/^ml$/i, 'ml'], [/^(l|liter)$/i, 'l'],
  [/^EL$/, 'EL'], [/^TL$/, 'TL'], [/^Prisen?$/i, 'Prise'],
  [/^(Stück|Stk\.?|Scheiben?)$/i, 'Stück'], [/^Zehen?$/i, 'Zehe'], [/^Dosen?$/i, 'Dose'], [/^(Glas|Gläser)$/i, 'Glas'],
  [/^Bund$/i, 'Bund'], [/^Handvoll$/i, 'Handvoll'], [/^cm$/i, 'cm'], [/^Messlöffel$/i, 'Messlöffel'],
];
const UNIT_PATTERN = 'kg|g|ml|[Ll]iter|l|EL|TL|Prisen?|Stück|Stk\\.?|Scheiben?|Zehen?|Dosen?|Glas|Gläser|Bund|Handvoll|cm|Messlöffel';

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔]?|[½¼¾⅓⅔])`;

/** Menge (auch „ca.“ und Spannen wie „1–2“), optional Einheit, Rest. Ob die Einheit echt ist, prüft splitUnit. */
const AMOUNT_FIRST = new RegExp(
  String.raw`^(?:ca\.?\s*)?(${NUMBER})(?:\s*[-–]\s*${NUMBER})?\s*(?:(${UNIT_PATTERN}))?\s*(.*)$`,
  'u',
);

/**
 * Wörter, die mit einer Einheit beginnen, aber KEINE sind: „1 gelbe Paprika“,
 * „8 getrocknete Tomaten“, „2 lila Zwiebeln“. Alles andere darf angeklebt sein –
 * zaubermix schreibt „400 gstückige Tomaten“, „30 ggeriebener Parmesan“, „3 ELÖl“.
 */
const NOT_A_UNIT = /^(gelb|grün|groß|grob|gut|ganz|gehackt|gemahlen|getrocknet|geräuchert|gerieben|gekocht|gewürfelt|geschält|gefroren|gemischt|gesalzen|geröstet|lauwarm|leicht|lang|lila)/i;

/** Die gefundene Einheit nur behalten, wenn sie nicht der Anfang eines normalen Wortes ist. */
function splitUnit(unitText: string | undefined, rest: string): { unit?: string; rest: string } {
  if (!unitText) return { rest };
  const gluedToLowercase = /^[a-zäöüß]/.test(rest);
  if (gluedToLowercase && (NOT_A_UNIT.test(unitText + rest) || looksLikeWord(unitText, rest))) return { rest: unitText + rest };
  return { unit: unitText, rest };
}

/**
 * Wie ein normales Wort statt einer angeklebten Einheit:
 * „gehäufter“, „gestrichener“, „gepresste“ (ge + Mitlaut = Partizip; zaubermix klebt „g“ + „geriebener“
 * als „ggeriebener“) und „lauchzwiebeln“ (l + Selbstlaut; zaubermix schreibt „lLauwarmes“ bzw. „llauwarmes“).
 */
function looksLikeWord(unitText: string, rest: string): boolean {
  if (unitText === 'g') return /^e[bcdfghjklmnpqrstvwxzäöüß]/.test(rest);
  if (unitText === 'l') return /^[aeiouäöü]/.test(rest);
  return false;
}

function toNumber(s: string): number {
  const t = s.replace(/\s/g, '');
  const frac = t.match(/[½¼¾⅓⅔]$/)?.[0];
  const whole = t.replace(/[½¼¾⅓⅔]$/, '');
  return (whole ? Number(whole.replace(',', '.')) : 0) + (frac ? FRACTIONS[frac] : 0);
}

function toUnit(s: string | undefined): Unit | undefined {
  if (!s) return undefined;
  return UNIT_WORDS.find(([re]) => re.test(s))?.[1];
}

/** Aufzählungszeichen, Emoji-Nummern und Links entfernen. */
function clean(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')           // [Tomatenmark](https://…) → Tomatenmark
    .replace(/^(\d)️?⃣/u, '$1.')              // 1️⃣ → 1.
    .replace(/^\s*[*•·\-–]\s*/u, '')                    // Aufzählungszeichen
    .replace(/\s+/g, ' ')
    .trim();
}

const SECTION_INGREDIENTS = /^(zutaten|einkaufsliste)\b/i;
const SECTION_STEPS = /^(zubereitung|anleitung|so geht'?s|schritte)\b/i;
const STEP_NUMBER_ONLY = /^\d{1,2}$/;
const STEP_NUMBERED = /^(\d{1,2})[.)]\s*(.+)$/;

export function parseIngredientLine(raw: string): Ingredient {
  let line = clean(raw);
  const optional = /\boptional\b/i.test(line);
  line = line.replace(/\s*\(?\boptional\b\)?:?\s*/gi, ' ').trim();

  // „Paprika: 6 Stück (~440 g)“ → Menge nach vorne holen
  const nameFirst = line.match(/^([^:\d][^:]*):\s*(\d.*)$/);
  if (nameFirst) line = `${nameFirst[2]} ${nameFirst[1]}`;

  const m = line.match(AMOUNT_FIRST);
  let amount: number | undefined;
  let unit: Unit | undefined;
  let rest = line;
  if (m) {
    amount = toNumber(m[1]);
    const split = splitUnit(m[2], m[3]);
    unit = toUnit(split.unit);
    rest = split.rest;
  }
  // Notiz nach dem ersten Komma: „Zwiebel, halbiert“
  const [name, ...noteParts] = rest.split(',');
  const note = noteParts.join(',').trim();
  return {
    id: newId('i'),
    name: name.trim() || rest.trim(),
    ...(amount !== undefined && amount > 0 ? { amount } : {}),
    ...(unit ? { unit } : {}),
    ...(note ? { note } : {}),
    ...(optional ? { optional } : {}),
  };
}

/** Timer aus dem Schritttext: die erste Angabe „8 Min.“ (Sekunden werden ignoriert). */
function timerFrom(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(?:–|-)?\s*(?:\d+\s*)?Min(?:\.|uten)?\b/i);
  return m ? Number(m[1]) : undefined;
}

const looksLikeIngredient = (line: string) => AMOUNT_FIRST.test(line) && /^\S/.test(line) && !/[.!]$/.test(line) && line.length < 90;

export function parseRecipeText(text: string): TextImport {
  const warnings: string[] = [];
  const noteLines: string[] = [];
  const rawLines = text.split(/\r?\n/).map(clean).filter(Boolean);

  let title = '';
  let servings: number | undefined;
  let totalMinutes: number | undefined;
  let difficulty: Difficulty = 1;
  const ingredientLines: string[] = [];
  const steps: string[] = [];
  let section: 'unknown' | 'ingredients' | 'steps' = 'unknown';
  let expectMinutes = false;
  let expectDifficulty = false;

  for (const line of rawLines) {
    // ── Angaben, die überall stehen können ───────────────────────
    const nameLine = line.match(/^(?:name|titel|rezept)\s*:\s*(.+)$/i);
    if (nameLine) { title = nameLine[1].trim(); continue; }
    const serv = line.match(/(\d+)\s*(portionen|personen|port\.)/i);
    if (serv && line.length < 40) { servings = Number(serv[1]); continue; }
    if (/^(zeit gesamt|gesamtzeit|zubereitungszeit|arbeitszeit)\b/i.test(line)) {
      const mins = line.match(/(\d+)\s*Min/i);
      if (mins) totalMinutes ??= Number(mins[1]);
      else expectMinutes = true;
      continue;
    }
    if (expectMinutes) {
      expectMinutes = false;
      const mins = line.match(/^(\d+)\s*Min/i);
      if (mins) { totalMinutes ??= Number(mins[1]); continue; }
    }
    if (/^schwierigkei?t?\b/i.test(line)) { expectDifficulty = true; const d = line.split(/[:\s]+/)[1]; if (d) { difficulty = diffFrom(d); expectDifficulty = false; } continue; }
    if (expectDifficulty) { expectDifficulty = false; if (/^(leicht|einfach|mittel|schwer|anspruchsvoll)$/i.test(line)) { difficulty = diffFrom(line); continue; } }
    if (/^(💡\s*)?tipp\b/i.test(line)) { noteLines.push(line.replace(/^💡\s*/, '')); continue; }

    // ── Abschnitte ───────────────────────────────────────────────
    if (SECTION_INGREDIENTS.test(line) && line.length < 30) { section = 'ingredients'; continue; }
    if (SECTION_STEPS.test(line) && line.length < 30) { section = 'steps'; continue; }

    // Allererste kurze Zeile vor allem anderen = Titel – auch mit Emoji-Nummer („4️⃣ Kürbis-Pasta“)
    const nothingYet = section === 'unknown' && !ingredientLines.length && !steps.length;
    // „4. Kürbis-Pasta“ ist eine Nummerierung, keine Menge („4 Stück Kürbis“)
    const numberedHeading = /^\d{1,2}[.)]\s+\S/.test(line);
    if (!title && nothingYet && line.length < 80 && !/[.!]$/.test(line) && (numberedHeading || !looksLikeIngredient(line))) {
      title = line.replace(/^\d{1,2}[.)]?\s*/, '');
      continue;
    }

    // Schrittnummer allein in der Zeile (zaubermix): nächster Schritt beginnt
    if (STEP_NUMBER_ONLY.test(line)) { section = 'steps'; steps.push(''); continue; }
    const numbered = line.match(STEP_NUMBERED);
    if (numbered && !looksLikeIngredient(line)) { section = 'steps'; steps.push(numbered[2]); continue; }

    if (section === 'steps') {
      // Zwischenüberschriften in der Zubereitung („Für die Soße“, „Zutaten:“) als eigener Absatz
      if (steps.length && steps[steps.length - 1] === '') steps[steps.length - 1] = line;
      else if (looksLikeIngredient(line) && steps.length === 0) ingredientLines.push(line);
      else steps.push(line);
      continue;
    }

    // Überschriften mit Doppelpunkt („Gemüse:“) überspringen
    if (/:$/.test(line) && line.length < 40) continue;

    // Ein ganzer Satz ohne Mengenangabe ist nie eine Zutat – auch nicht ohne Überschrift davor
    if (!AMOUNT_FIRST.test(line) && (line.length > 60 || /[.!]$/.test(line))) { steps.push(line); section = 'steps'; continue; }

    if (section === 'ingredients' || looksLikeIngredient(line)) {
      section = section === 'unknown' ? 'ingredients' : section;
      ingredientLines.push(line);
      continue;
    }
    // Noch vor allem anderen: kurze Zeile ohne Menge = Titel
    if (!title && ingredientLines.length === 0 && line.length < 80) { title = line.replace(/^\d+\s*[.)]?\s*/, ''); continue; }
    // Lange Sätze ohne Abschnitt → Zubereitung
    if (line.length > 60 || /[.!]$/.test(line)) { steps.push(line); section = 'steps'; continue; }
    ingredientLines.push(line);
  }

  const ingredients = ingredientLines.map(parseIngredientLine);
  const stepList: Step[] = steps.map((t) => t.trim()).filter(Boolean).map((t) => ({ id: newId('s'), text: t, ...(timerFrom(t) ? { timerMinutes: timerFrom(t) } : {}) }));

  if (!title) warnings.push('Kein Titel erkannt – bitte eintragen.');
  if (!servings) warnings.push('Keine Portionen gefunden – 2 angenommen, bitte prüfen.');
  if (!ingredients.length) warnings.push('Keine Zutaten erkannt.');
  if (!stepList.length) warnings.push('Keine Zubereitungsschritte erkannt.');
  const unsure = ingredients.filter((i) => i.amount === undefined).length;
  if (unsure) warnings.push(`${unsure} Zutat(en) ohne Menge – bitte prüfen (z. B. „Salz & Pfeffer“ ist in Ordnung).`);

  const total = totalMinutes ?? 30;
  return {
    content: {
      title: title || 'Neues Rezept',
      description: '',
      servings: servings ?? 2,
      prepMinutes: Math.min(15, Math.round(total / 3)),
      cookMinutes: total - Math.min(15, Math.round(total / 3)),
      difficulty,
      ingredients,
      steps: stepList,
      categories: [],
      tags: [],
      devices: /mixtopf|stufe \d|linkslauf/i.test(text) ? ['monsieur-cuisine'] : [],
    },
    notes: noteLines.join('\n'),
    warnings,
  };
}

function diffFrom(s: string): Difficulty {
  if (/mittel/i.test(s)) return 2;
  if (/schwer|anspruchsvoll/i.test(s)) return 3;
  return 1;
}

/**
 * Texterkennung (Foto einer Kochbuchseite) verliest typische Zeichen. Vor dem Erkennen glätten:
 * - „1 | Brühe“ → „1 l Brühe“: ein kleines l nach einer Zahl wird oft zum senkrechten Strich
 * - „1/2“ bleibt, aber „1 /2“ und „1/ 2“ werden zu „1/2“
 * - mehr als eine Leerzeile hintereinander → eine
 * Sonst nichts – lieber einen Fehler stehen lassen, den man sieht, als falsch „korrigieren“.
 */
export function cleanOcrText(text: string): string {
  return text
    .replace(/(\d)\s*[|]\s+/g, '$1 l ')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
