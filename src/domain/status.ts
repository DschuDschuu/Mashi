import type { RecipeStatus } from './types';

/**
 * Erlaubte Statuswechsel. Der Nutzer entscheidet jeden Schritt selbst –
 * nichts rutscht automatisch ins Kochbuch.
 *
 *   ki_entwurf ──vormerken──▶ zum_testen ──hat geschmeckt──▶ bewaehrt ──übernehmen──▶ kochbuch
 *                                 ▲                              │                      │
 *                                 └──────── nochmal testen ──────┘◀──── weiter verbessern┘
 *
 * Selbst erstellte und importierte Rezepte dürfen direkt in zum_testen oder kochbuch starten.
 */
const TRANSITIONS: Record<RecipeStatus, RecipeStatus[]> = {
  ki_entwurf: ['zum_testen'],
  zum_testen: ['bewaehrt', 'kochbuch'],
  bewaehrt: ['kochbuch', 'zum_testen'],
  kochbuch: ['bewaehrt'],
};

export function canTransition(from: RecipeStatus, to: RecipeStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Ist das Rezept Teil des eigentlichen Kochbuchs (Tab „Kochbuch“)? */
export function isInCookbook(status: RecipeStatus): boolean {
  return status !== 'ki_entwurf';
}
