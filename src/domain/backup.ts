import { isValidProduct, type MyProduct } from './nutrition/myProducts';
import type { MealPlan } from './mealplan';
import type { Pantry } from './pantry';
import type { Recipe, RecipeSource, RecipeStatus } from './types';

/**
 * Format der Sicherungsdatei („Einstellungen → Sicherung herunterladen / einspielen“).
 * Bewusst einfach: alles genau so, wie Mashi es speichert (Rezepte, Lebensmittel, Speisekammer, Plan).
 */
export interface BackupFile {
  app: 'mashi';
  exportedAt: string;
  recipes: Recipe[];
  /** „Meine Produkte“ – in älteren Sicherungen noch nicht enthalten */
  products?: MyProduct[];
  /** Speisekammer mit Preisen, gelernten Bon-Artikeln, Stufen, Nachkauf-Grenzen – ab 2026-09 */
  pantry?: Pantry;
  /** Wochenplan samt Haken und eigenen Einkaufslisten-Einträgen – ab 2026-09 */
  plan?: MealPlan;
}

/** Alles, was Mashi weiß – eine Sicherung, die unabhängig vom Server ist. */
export function createBackup(recipes: Recipe[], products: MyProduct[] = [], now = new Date().toISOString(), pantry?: Pantry, plan?: MealPlan): BackupFile {
  return { app: 'mashi', exportedAt: now, recipes, products, ...(pantry ? { pantry } : {}), ...(plan ? { plan } : {}) };
}

export interface ParsedBackup {
  recipes: Recipe[];
  /** Einträge, die nicht vollständig/gültig waren und deshalb übersprungen werden */
  rejected: number;
  products: MyProduct[];
  /** nur, wenn die Datei sie enthält und sie gültig aussehen */
  pantry?: Pantry;
  plan?: MealPlan;
}

const STATUSES: RecipeStatus[] = ['ki_entwurf', 'zum_testen', 'bewaehrt', 'kochbuch'];
const SOURCES: RecipeSource[] = ['ki', 'selbst', 'import'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Prüft, ob ein Eintrag ein vollständiges Rezept ist. Streng mit allem, was die App
 * zum Anzeigen braucht – ein kaputtes Rezept soll übersprungen werden, nicht die App stören.
 */
function isValidRecipe(v: unknown): v is Recipe {
  if (!isObj(v)) return false;
  if (!isStr(v.id) || !isStr(v.createdAt) || !isStr(v.updatedAt) || !isStr(v.currentVersionId)) return false;
  if (!STATUSES.includes(v.status as RecipeStatus) || !SOURCES.includes(v.source as RecipeSource)) return false;
  if (!Array.isArray(v.versions) || v.versions.length === 0 || !Array.isArray(v.feedback)) return false;
  const current = v.versions.find((ver) => isObj(ver) && ver.id === v.currentVersionId);
  if (!current) return false;
  return v.versions.every((ver) => {
    if (!isObj(ver) || !isStr(ver.id) || !isObj(ver.content)) return false;
    const c = ver.content;
    return isStr(c.title) && typeof c.servings === 'number' && c.servings > 0
      && Array.isArray(c.ingredients) && c.ingredients.every((i) => isObj(i) && isStr(i.id) && typeof i.name === 'string')
      && Array.isArray(c.steps) && c.steps.every((s) => isObj(s) && isStr(s.id) && typeof s.text === 'string');
  });
}

/** größtes Foto aus einer Datei (als data-URL, ~3 MB) – der Zuschnitt erzeugt deutlich kleinere */
const MAX_IMAGE = 4_000_000;
const isDataImage = (v: unknown) => typeof v === 'string' && v.length <= MAX_IMAGE && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);

/**
 * Bild aus einer fremden Datei (geteiltes Rezept, WhatsApp): nur eingebettete Fotos oder der Platzhalter.
 * Eine Web-Adresse würde bei jedem Anzeigen geladen – der Absender sähe deine IP und wann du Mashi nutzt
 * (Code-Review #22). Mashi selbst erzeugt nie Web-Adressen, nur eingebettete Fotos.
 */
export function isSafeImage(v: unknown): boolean {
  if (v === undefined) return true;
  if (!isObj(v)) return false;
  if (v.kind === 'placeholder') return typeof v.hue === 'number' && typeof v.motif === 'string';
  if (v.kind !== 'url' || !isDataImage(v.url)) return false;
  if (v.original !== undefined && !isDataImage(v.original)) return false;
  return v.crop === undefined || (isObj(v.crop) && ['x', 'y', 'zoom'].every((k) => typeof (v.crop as Record<string, unknown>)[k] === 'number'));
}

/** Fehlende Listen (Tags, Kategorien, Geräte) als leer ergänzen – sonst stürzt z. B. „Bearbeiten“ ab */
function withLists(r: Recipe): Recipe {
  // unsicheres Bild: das Rezept bleibt, nur das Bild fällt weg (Platzhalter)
  const { image, ...rest } = r;
  return {
    ...rest,
    ...(isSafeImage(image) && image ? { image } : {}),
    versions: r.versions.map((v) => ({
      ...v,
      content: { ...v.content, tags: v.content.tags ?? [], categories: v.content.categories ?? [], devices: v.content.devices ?? [] },
    })),
  };
}

/**
 * Liest eine Sicherungsdatei. Akzeptiert auch eine reine Liste von Rezepten.
 * Wirft nur, wenn es gar keine Mashi-Datei ist – einzelne kaputte Rezepte werden gezählt.
 */
export function parseBackup(input: unknown): ParsedBackup {
  const list = Array.isArray(input) ? input : isObj(input) && Array.isArray(input.recipes) ? input.recipes : null;
  if (!list) throw new Error('Das ist keine Mashi-Sicherung.');
  const recipes = list.filter(isValidRecipe);
  // Doppelte IDs innerhalb der Datei: nur den ersten Eintrag nehmen
  const seen = new Set<string>();
  const unique = recipes.filter((r) => !seen.has(r.id) && seen.add(r.id)).map(withLists);
  const rawProducts = isObj(input) && Array.isArray(input.products) ? input.products : [];
  const products = rawProducts.filter(isValidProduct);
  const pantry = isObj(input) && isValidPantry(input.pantry) ? input.pantry : undefined;
  const plan = isObj(input) && isValidPlan(input.plan) ? input.plan : undefined;
  return { recipes: unique, rejected: list.length - unique.length + rawProducts.length - products.length, products, ...(pantry ? { pantry } : {}), ...(plan ? { plan } : {}) };
}

/** fehlt – oder eine Liste, deren Einträge alle passen */
const listOf = (v: unknown, ok: (x: unknown) => boolean) => v === undefined || (Array.isArray(v) && v.every(ok));
const strings = (v: unknown) => listOf(v, (x) => typeof x === 'string');
const isPrice = (x: unknown) => isObj(x) && typeof x.name === 'string' && typeof x.perUnit === 'number' && isStr(x.date) && (x.unit === 'g' || x.unit === 'Stück');
const isRecord = (v: unknown, ok: (x: unknown) => boolean) => v === undefined || (isObj(v) && Object.values(v).every(ok));

/**
 * So, dass die App damit nicht abstürzt (Code-Review #22): JEDE Liste, die das Zusammenführen und die Ansichten
 * durchgehen, muss eine Liste mit passenden Einträgen sein – sonst stürzt es später auf jedem Gerät ab.
 */
function isValidPantry(v: unknown): v is Pantry {
  if (!isObj(v) || !Array.isArray(v.items) || !Array.isArray(v.rules) || !isStr(v.updatedAt)) return false;
  return v.items.every((i) => isObj(i) && isStr(i.id) && isStr(i.name) && isStr(i.addedAt))
    && v.rules.every((r) => isObj(r) && isStr(r.key))
    && listOf(v.prices, isPrice) && listOf(v.history, isPrice)
    && listOf(v.savings, (s) => isObj(s) && isStr(s.key))
    && listOf(v.restock, (r) => isObj(r) && isStr(r.name) && typeof r.below === 'number')
    && listOf(v.bons, (b) => isObj(b) && isStr(b.id) && isStr(b.date) && Array.isArray(b.lines)
      && b.lines.every((l) => isObj(l) && typeof l.bon === 'string' && typeof l.name === 'string' && typeof l.count === 'number'))
    && strings(v.receipts) && strings(v.basics) && strings(v.noNutrition) && strings(v.renameDismissed)
    && isRecord(v.categories, (c) => typeof c === 'string')
    && isRecord(v.cookLog, (c) => Array.isArray(c));
}

function isValidPlan(v: unknown): v is MealPlan {
  if (!isObj(v) || !Array.isArray(v.items) || !Array.isArray(v.checked) || !isStr(v.updatedAt)) return false;
  return v.items.every((i) => isObj(i) && isStr(i.recipeId) && typeof i.servings === 'number')
    && strings(v.checked) && strings(v.cooked) && strings(v.buy) && strings(v.hidden)
    && listOf(v.extra, (x) => isObj(x) && isStr(x.name));
}
