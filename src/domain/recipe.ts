import type { Recipe, RecipeContent, RecipeVersion, VersionAuthor } from './types';

export function newId(prefix = ''): string {
  const rnd = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${rnd}` : rnd;
}

export function currentVersion(recipe: Recipe): RecipeVersion {
  return recipe.versions.find((v) => v.id === recipe.currentVersionId) ?? recipe.versions[recipe.versions.length - 1];
}

export function currentContent(recipe: Recipe): RecipeContent {
  return currentVersion(recipe).content;
}

/** Die allererste Version – bei KI-Rezepten der unveränderte KI-Vorschlag. */
export function originalVersion(recipe: Recipe): RecipeVersion {
  return recipe.versions[0];
}

export function totalMinutes(content: RecipeContent): number {
  return content.prepMinutes + content.cookMinutes;
}

/** Tiefe Kopie, damit Versionen sich nie gegenseitig verändern. */
/**
 * Gleicher Inhalt? Verglichen wird, was man sieht – nicht, wie es gespeichert ist:
 * Reihenfolge der Felder egal, fehlende Listen/Texte zählen wie leere, Leerzeichen am Rand zählen nicht.
 * Sonst entstünde beim Speichern eine neue Version, obwohl sich nichts geändert hat
 * (z. B. nur das Foto neu, aber im alten Rezept fehlte das Feld „tags“).
 */
export function sameContent(a: RecipeContent, b: RecipeContent): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (typeof v === 'string') return v.trim();
  if (v === null || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v).sort()) {
    const x = canonical((v as Record<string, unknown>)[k]);
    if (x === undefined || x === null || x === '' || (Array.isArray(x) && x.length === 0)) continue;
    out[k] = x;
  }
  return out;
}

export function cloneContent(content: RecipeContent): RecipeContent {
  return structuredClone(content);
}

/**
 * Hängt eine neue Version an und macht sie zur aktuellen.
 * Gibt ein NEUES Recipe-Objekt zurück (unveränderlich), das Original bleibt unberührt.
 */
export function withNewVersion(
  recipe: Recipe,
  content: RecipeContent,
  author: VersionAuthor,
  label?: string,
  now = new Date().toISOString(),
): Recipe {
  const version: RecipeVersion = {
    id: newId('v'),
    number: recipe.versions.length + 1,
    createdAt: now,
    author,
    label,
    content: cloneContent(content),
  };
  return {
    ...recipe,
    versions: [...recipe.versions, version],
    currentVersionId: version.id,
    updatedAt: now,
  };
}
