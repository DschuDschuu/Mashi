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
