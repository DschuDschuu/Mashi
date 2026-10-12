/**
 * „Rückgängig“ als Umkehrung der Aktion (Code-Review #4): nur genau das zurück, was die Aktion geändert hat.
 * Früher wurde ein ganzes Feld aus der Vergangenheit zurückgeschrieben – dann galt alles, was zwischendurch dazukam
 * (auch vom anderen Gerät per Abgleich), als gelöscht, und diese Löschung wurde überall hin abgeglichen.
 */

const sig = (x: unknown) => JSON.stringify(x);

/**
 * Liste ohne Schlüssel (Abgehaktes, eigene Einträge, Preise): was die Aktion hinzugefügt hat, wieder heraus;
 * was sie entfernt hat, wieder hinein. Alles andere im jetzigen Stand bleibt.
 * @param now jetziger Stand · @param before vor der Aktion · @param after direkt nach der Aktion
 */
export function reverseList<T>(now: readonly T[] | undefined, before: readonly T[] | undefined, after: readonly T[] | undefined): T[] {
  const b = new Set((before ?? []).map(sig));
  const a = new Set((after ?? []).map(sig));
  const added = new Set([...a].filter((s) => !b.has(s)));
  const kept = (now ?? []).filter((x) => !added.has(sig(x)));
  const have = new Set(kept.map(sig));
  const removed = (before ?? []).filter((x) => !a.has(sig(x)) && !have.has(sig(x)));
  return [...kept, ...removed];
}

/**
 * Liste mit Schlüssel (Vorräte, Bons, gelernte Bon-Artikel): je Eintrag, den die Aktion geändert hat, den alten
 * Stand zurück – aber nur, wenn er seitdem unverändert ist. Wurde er inzwischen geändert (anderes Gerät, anderer
 * Tipp), bleibt die neuere Änderung. Neu angelegte Einträge fliegen raus, entfernte kommen zurück.
 */
export function reverseKeyed<T>(
  now: readonly T[] | undefined, before: readonly T[] | undefined, after: readonly T[] | undefined, key: (x: T) => string,
): T[] {
  const b = new Map((before ?? []).map((x) => [key(x), x]));
  const a = new Map((after ?? []).map((x) => [key(x), x]));
  const changed = new Set([...b.keys(), ...a.keys()].filter((k) => sig(b.get(k)) !== sig(a.get(k))));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const x of now ?? []) {
    const k = key(x);
    seen.add(k);
    // seit der Aktion verändert (oder gar nicht von ihr) → so lassen
    if (!changed.has(k) || sig(x) !== sig(a.get(k))) { out.push(x); continue; }
    const old = b.get(k);
    if (old !== undefined) out.push(old); // von der Aktion geändert → alter Stand; neu angelegt → weg
  }
  // von der Aktion entfernt – kommt zurück, wenn es nicht schon wieder da ist
  for (const k of changed) if (!seen.has(k) && !a.has(k) && b.has(k)) out.push(b.get(k)!);
  return out;
}

/** Zuordnung Schlüssel → Wert (z. B. Kategorien) wie reverseKeyed; leer = undefined */
export function reverseRecord<V>(
  now: Readonly<Record<string, V>> | undefined, before: Readonly<Record<string, V>> | undefined, after: Readonly<Record<string, V>> | undefined,
): Record<string, V> | undefined {
  const entries = reverseKeyed(Object.entries(now ?? {}), Object.entries(before ?? {}), Object.entries(after ?? {}), ([k]) => k);
  return entries.length ? Object.fromEntries(entries) : undefined;
}
