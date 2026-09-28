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

/** Fehlende Listen (Tags, Kategorien, Geräte) als leer ergänzen – sonst stürzt z. B. „Bearbeiten“ ab */
function withLists(r: Recipe): Recipe {
  return {
    ...r,
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

/** Grob, aber so, dass die App damit nicht abstürzt: Listen da, Vorräte mit ID und Namen */
function isValidPantry(v: unknown): v is Pantry {
  if (!isObj(v) || !Array.isArray(v.items) || !Array.isArray(v.rules) || !isStr(v.updatedAt)) return false;
  return v.items.every((i) => isObj(i) && isStr(i.id) && isStr(i.name) && isStr(i.addedAt));
}

function isValidPlan(v: unknown): v is MealPlan {
  if (!isObj(v) || !Array.isArray(v.items) || !Array.isArray(v.checked) || !isStr(v.updatedAt)) return false;
  return v.items.every((i) => isObj(i) && isStr(i.recipeId) && typeof i.servings === 'number');
}
