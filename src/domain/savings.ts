import type { Pantry } from './pantry';

/**
 * Was du beim Einkaufen gespart hast – vom Kassenbon, getrennt nach Lidl Plus (Rabatte, Coupons),
 * Angeboten („Preisvorteil“) und MHD-Ware („RABATT 20%“). Die Preise im Verlauf bleiben davon
 * unberührt (Regalpreise).
 */
export interface ReceiptSavings {
  /** ein Bon = ein Eintrag: Einkaufstag + Endbetrag, damit ein doppelter Import nicht doppelt zählt */
  key: string;
  date: string;
  lidlPlus: number;
  offers: number;
  /** reduzierte MHD-Ware – fehlt bei Bons, die vor dieser Unterscheidung importiert wurden (dort in offers) */
  mhd?: number;
}

export interface BonSavings { lidlPlus: number; offers: number; mhd: number; total?: number }

const amount = (s: string) => Number(s.replace(',', '.'));

/**
 * Rabattzeilen lesen: „Preisvorteil -2,00“ (Angebot), „Lidl Plus Rabatt -0,70“ / „Coupon …“ und
 * „RABATT 20% -1,00“ (MHD-Ware).
 * Das Minus fehlt nach der Texterkennung manchmal – der Betrag zählt trotzdem als Ersparnis.
 * Die Sammelzeilen unten im Kasten („Gesamter Preisvorteil …“, „Mit Lidl Plus … gespart“)
 * beginnen anders und werden nicht mitgezählt – sonst wäre alles doppelt.
 */
export function parseSavings(text: string): BonSavings {
  let lidlPlus = 0;
  let offers = 0;
  let mhd = 0;
  let total: number | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const m = line.match(/^(lidl plus rabatt|lidl plus coupon|coupon|preisvorteil|rabatt)\b.*?-?\s*(\d+[.,]\d{2})\s*[A-Z0-9]?$/i);
    if (m) {
      if (/lidl plus|coupon/i.test(m[1])) lidlPlus += amount(m[2]);
      else if (/^rabatt$/i.test(m[1])) mhd += amount(m[2]);
      else offers += amount(m[2]);
      continue;
    }
    const t = line.match(/^zu zahlen\s+(\d+[.,]\d{2})/i);
    if (t && total === undefined) total = amount(t[1]);
  }
  return { lidlPlus: round(lidlPlus), offers: round(offers), mhd: round(mhd), total };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Ersparnis eines Bons merken – derselbe Bon (Tag + Endbetrag) ersetzt sich selbst. */
export function recordSavings(pantry: Pantry, s: BonSavings, date: string): Pantry {
  if (!s.lidlPlus && !s.offers && !s.mhd) return pantry;
  const key = `${date.slice(0, 10)}|${s.total ?? ''}`;
  const entry: ReceiptSavings = { key, date, lidlPlus: s.lidlPlus, offers: s.offers, ...(s.mhd ? { mhd: s.mhd } : {}) };
  return { ...pantry, savings: [...(pantry.savings ?? []).filter((x) => x.key !== key), entry] };
}

/** Summe eines Kalendermonats (month: 0 = Januar). */
export function monthSavings(all: ReceiptSavings[], year: number, month: number) {
  const inMonth = all.filter((s) => {
    const d = new Date(s.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  return {
    lidlPlus: round(inMonth.reduce((n, s) => n + s.lidlPlus, 0)),
    offers: round(inMonth.reduce((n, s) => n + s.offers, 0)),
    mhd: round(inMonth.reduce((n, s) => n + (s.mhd ?? 0), 0)),
    receipts: inMonth.length,
  };
}
