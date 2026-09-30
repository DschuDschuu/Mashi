import { describe, expect, it } from 'vitest';
import { KiError, serverRecipeAi } from './serverAi';

const cfg = { url: 'https://mashi.example.test/mashi', username: 'julia-test', password: 'pässwort-test' };
const recipe = { title: 'Test-Pfanne', ingredients: [{ name: 'Paprika', amount: 1, unit: 'Stück' }], steps: [{ text: 'Braten.' }] };
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('KI über den Mashi-Server', () => {
  it('fragt <Server>/ki/rezept mit der Abgleich-Anmeldung und macht aus der Antwort ein Rezept', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ai = serverRecipeAi(() => cfg, (async (url: string, init: RequestInit) => { calls.push({ url, init }); return res(200, { text: JSON.stringify(recipe) }); }) as typeof fetch);
    const draft = await ai.generateRecipe({ prompt: 'Paprika', servings: 2 });
    expect(draft.title).toBe('Test-Pfanne');
    expect(calls[0].url).toBe('https://mashi.example.test/ki/rezept');
    const headers = calls[0].init.headers as Record<string, string>;
    // UTF-8-sicher: „ä“ im Passwort
    expect(new TextDecoder().decode(Uint8Array.from(atob(headers.authorization.slice(6)), (c) => c.charCodeAt(0)))).toBe('julia-test:pässwort-test');
    expect(JSON.parse(calls[0].init.body as string).prompt).toContain('Wunsch: Paprika');
  });

  it('Meldungen vom Server und aus der Prüfung kommen als KiError an', async () => {
    const limit = serverRecipeAi(() => cfg, (async () => res(429, { message: 'Für heute sind genug Rezepte erstellt – später wieder.' })) as typeof fetch);
    await expect(limit.generateRecipe({ prompt: 'x' })).rejects.toThrow(/genug Rezepte/);
    const junk = serverRecipeAi(() => cfg, (async () => res(200, { text: 'Das kann ich nicht.' })) as typeof fetch);
    await expect(junk.generateRecipe({ prompt: 'x' })).rejects.toBeInstanceOf(KiError);
    const offline = serverRecipeAi(() => cfg, (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch);
    await expect(offline.generateRecipe({ prompt: 'x' })).rejects.toThrow(/offline/);
    // ohne eigene Meldung (z. B. antwortet die CouchDB selbst): trotzdem verständlich
    for (const [status, text] of [[401, /Anmeldung abgelehnt/], [429, /zu viele Anfragen/], [503, /nicht fertig eingerichtet/]] as const) {
      const bare = serverRecipeAi(() => cfg, (async () => res(status, { error: 'x' })) as typeof fetch);
      await expect(bare.generateRecipe({ prompt: 'x' })).rejects.toThrow(text);
    }
    const missing = serverRecipeAi(() => cfg, (async () => res(404, { error: 'not_found', reason: 'Database does not exist.' })) as typeof fetch);
    await expect(missing.generateRecipe({ prompt: 'x' })).rejects.toThrow(/noch nicht eingerichtet/);
    const none = serverRecipeAi(() => null);
    await expect(none.generateRecipe({ prompt: 'x' })).rejects.toThrow(/verbinden/);
  });
});
