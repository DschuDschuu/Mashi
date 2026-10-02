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
  /** darunter stand „RABATT 20%“ – bei Lidl der Aufkleber für Ware kurz vor dem MHD */
  reduced?: boolean;
  /** Rabattzeilen direkt darunter („Preisvorteil -0,50“) – price bleibt der Preis davor */
  discounts?: LineDiscount[];
}

/** Angebot („Preisvorteil“), Lidl Plus (Rabatt, Coupon) oder MHD-Aufkleber („RABATT 20%“) */
export type DiscountKind = 'angebot' | 'lidlplus' | 'mhd';
export interface LineDiscount {
  kind: DiscountKind;
  amount: number;
  /** wie auf dem Bon („RABATT 20%“ → 20) – geht vor dem Ausrechnen, das bei Rundung danebenliegt */
  percent?: number;
}

/** Rabattzeile mit Betrag – die Sammelzeilen unten („Gesamter Preisvorteil“) beginnen anders */
const DISCOUNT = /^(lidl plus rabatt|lidl plus coupon|coupon|preisvorteil|rabatt)\b.*?-?\s*(\d+[.,]\d{2})\s*[A-Z0-9]?$/i;
const discountKind = (word: string): DiscountKind => (/lidl plus|coupon/i.test(word) ? 'lidlplus' : /^rabatt$/i.test(word) ? 'mhd' : 'angebot');

const NUM = String.raw`\d+[.,]\d{2}`;
/**
 * „Speisequark mager 0,79 x 3 2,37 A“ – Name, optional „Einzelpreis x Anzahl“, Preis, optional Steuerbuchstabe.
 * Die Texterkennung liest den Steuerbuchstaben gern als Ziffer: „1,70 A“ → „1,704“, „1,50 B“ → „1,50 8“.
 */
const ITEM = new RegExp(String.raw`^(.+?)\s+(?:(${NUM})\s*x\s*(\d+)\s+)?(-?${NUM})(?:\d|\s*[A-Z0-9]{1,2})?$`);
/** „0,982 kg x 1,19 EUR/kg“ */
const WEIGHT = new RegExp(String.raw`^(\d+[.,]\d{3})\s*kg\s*x\s*${NUM}\s*EUR\s*/\s*kg`, 'i');
/**
 * „RABATT 20%“ direkt unter einem Artikel (bei loser Ware unter der Gewichtszeile) = reduzierte
 * MHD-Ware. „Lidl Plus Rabatt“ beginnt anders und zählt nicht. Das Minus verschluckt die
 * Texterkennung manchmal – deshalb reicht der Anfang der Zeile.
 */
const MHD_DISCOUNT = /^rabatt\b/i;
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
  /** der Artikel direkt darüber – nur dem gehört eine Rabattzeile (Pfand, Leerzeilen o. Ä. dazwischen: keinem) */
  let last: ReceiptLine | undefined;

  for (const line of lines.slice(head + 1)) {
    if (END.test(line)) break;
    const w = line.match(WEIGHT);
    if (w) {
      if (last) last.weightKg = num(w[1]);
      continue;
    }
    const d = line.match(DISCOUNT);
    if (d || MHD_DISCOUNT.test(line)) {
      if (last) {
        if (MHD_DISCOUNT.test(line)) last.reduced = true;
        const pct = line.match(/(\d{1,2})\s*%/);
        if (d) last.discounts = [...(last.discounts ?? []), { kind: discountKind(d[1]), amount: num(d[2]), ...(pct ? { percent: Number(pct[1]) } : {}) }];
      }
      continue;
    }
    const m = line.match(ITEM);
    last = undefined;
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
    last = { name, count, price: num(price) };
    out.push(last);
  }
  return out;
}

/**
 * Derselbe Artikel mehrmals einzeln auf dem Bon („Joghurt 0,99“ zweimal) → eine Zeile mit Anzahl 2 (Julia).
 * Nur bei gleichem Stückpreis und gleicher Art (lose Ware, MHD-Ware bleiben für sich) – sonst wäre es nicht dasselbe.
 */
export function mergeSameLines(lines: readonly ReceiptLine[]): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  const unit = (l: ReceiptLine) => (l.price === undefined ? undefined : Math.round((l.price / l.count) * 100));
  for (const l of lines) {
    const same = l.weightKg === undefined && !l.reduced
      ? out.find((o) => o.weightKg === undefined && !o.reduced && o.name.toLocaleLowerCase('de-DE') === l.name.toLocaleLowerCase('de-DE') && unit(o) === unit(l))
      : undefined;
    if (!same) {
      out.push({ ...l, ...(l.discounts ? { discounts: [...l.discounts] } : {}) });
      continue;
    }
    same.count += l.count;
    if (same.price !== undefined && l.price !== undefined) same.price = Math.round((same.price + l.price) * 100) / 100;
    if (l.discounts?.length) same.discounts = [...(same.discounts ?? []), ...l.discounts];
  }
  return out;
}
