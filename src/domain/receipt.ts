/**
 * Kassenbon lesen (Aufbau wie bei Lidl): Text rein – egal ob per Texterkennung aus einem
 * Screenshot oder eingefügt –, Artikel raus. Bewusst fehlertolerant: Die Texterkennung
 * liest mal „1.20“ statt „1,20“ oder lässt den Steuerbuchstaben weg.
 */
export interface ReceiptLine {
  /** so wie auf dem Bon, z. B. „Speisequark mager“ */
  name: string;
  /** Stückzahl („0,79 x 3“ → 3), sonst 1 */
  count: number;
  /** bei loser Ware: „0,982 kg x 1,19 EUR/kg“ */
  weightKg?: number;
  price?: number;
}

const NUM = String.raw`\d+[.,]\d{2}`;
/**
 * „Speisequark mager 0,79 x 3 2,37 A“ – Name, optional „Einzelpreis x Anzahl“, Preis, optional Steuerbuchstabe.
 * Die Texterkennung liest den Steuerbuchstaben gern als Ziffer: „1,70 A“ → „1,704“, „1,50 B“ → „1,50 8“.
 */
const ITEM = new RegExp(String.raw`^(.+?)\s+(?:(${NUM})\s*x\s*(\d+)\s+)?(-?${NUM})(?:\d|\s*[A-Z0-9]{1,2})?$`);
/** „0,982 kg x 1,19 EUR/kg“ */
const WEIGHT = new RegExp(String.raw`^(\d+[.,]\d{3})\s*kg\s*x\s*${NUM}\s*EUR\s*/\s*kg`, 'i');
/** Keine Artikel: Pfand, Rabatte, Gutscheine */
const NOT_AN_ITEM = /^(pfand|leergut|preisvorteil|lidl plus rabatt|rabatt|coupon|gutschein|rundung)/i;
/** Ab hier kommt nur noch Bezahlung, Steuer, Kleingedrucktes */
const END = /^(zu zahlen|summe|gesamt|kreditkarte|ec-karte|bar\b|mwst)/i;

const num = (s: string) => Number(s.replace(',', '.'));

/**
 * Einkaufsdatum vom Bon („15.09.26 17:24“ oder „15.09.2026“) – damit ein später importierter
 * Bon in der Preishistorie am richtigen Tag landet. Mittags, damit Zeitzonen den Tag nicht kippen.
 */
export function parseReceiptDate(text: string): string | undefined {
  for (const m of text.matchAll(/\b(\d{2})\.(\d{2})\.(\d{4}|\d{2})\b/g)) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(Date.UTC(year, Number(mo) - 1, Number(d), 12));
    const valid = date.getUTCMonth() === Number(mo) - 1 && date.getUTCDate() === Number(d) && year >= 2000 && year < 2100;
    if (valid) return date.toISOString();
  }
  return undefined;
}

export function parseReceipt(text: string): ReceiptLine[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // Artikel beginnen nach der Kopfzeile „EUR“ – fehlt sie (z. B. eingefügter Ausschnitt), ab dem Anfang
  const head = lines.findIndex((l) => /^EUR$/i.test(l));
  const out: ReceiptLine[] = [];

  for (const line of lines.slice(head + 1)) {
    if (END.test(line)) break;
    const w = line.match(WEIGHT);
    if (w) {
      const last = out[out.length - 1];
      if (last) last.weightKg = num(w[1]);
      continue;
    }
    const m = line.match(ITEM);
    if (!m) continue; // Adresse, Überschrift, unlesbare Zeile
    const [, rawName, , rawCount, price] = m;
    let name = rawName.trim();
    let count = rawCount ? Number(rawCount) : 1;
    // Texterkennung hat das „x“ verschluckt („Mozzarella light 0,85 2 1,70“): Einzelpreis aus dem
    // Namen lösen, Anzahl aus den Preisen ausrechnen
    const stray = !rawCount && name.match(new RegExp(String.raw`^(.+?)\s+(${NUM})(?:\s*x?\s*(\d+))?$`));
    if (stray) {
      name = stray[1];
      count = stray[3] ? Number(stray[3]) : Math.max(1, Math.round(num(price) / num(stray[2])));
    }
    if (NOT_AN_ITEM.test(name) || price.startsWith('-')) continue;
    out.push({ name, count, price: num(price) });
  }
  return out;
}
