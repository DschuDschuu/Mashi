/**
 * Lidl-Preise aus dem Prospekt lesen – ohne KI (Julia: „Preise gleich mit rein“).
 *
 * Die Preise stehen im Lidl-PDF als Text, nur nicht in Lesereihenfolge: „1.19*“ steht groß neben der Kachel, der Artikel
 * links oder darüber. Zugeordnet wird darum über die Lage auf der Seite. Die Erkennung stammt aus Julias Werkzeug
 * „Lidl-Prospekt auslesen“ (in einer anderen Claude-Sitzung gebaut, am Prospekt KW 48/2026 geprüft: 44 von 44 Preisen
 * passten zum gedruckten Kilopreis) und ist hier inhaltlich unverändert übernommen.
 *
 * Eingabe sind die Wörter mit Lage und Schrift, die dein Server liefert (server/ki: POST /prospekttext mit layout –
 * pdftotext -bbox + pdftohtml). Gegen die Tabelle des Werkzeugs: alle 228 Preise gleich, 219 Zeilen in jedem Feld –
 * der Rest sogar genauer (Zoll-Zeichen, eine doppelt gedruckte „Ab Do.“-Kopfzeile).
 * Kaufland ist anders aufgebaut – dafür gilt das nicht.
 */

const SHY = '­';
const PRICE_RE = /^(\d{1,4})?[.,](\d{2}|-|–)\*?$/; //                     1.95*  89.99  2.-*  -.99
const PLAIN_PRICE_RE = /^(\d{1,4})?[.,](\d{2}|-|–)$/; //                  12.99 (Streichpreis)
const DISCOUNT_RE = /^[-–]\s?\d{1,3}\s?(%|€)$/; //                         -46%  -1€
const MULTIBUY_RE = /^\d+\s*für\s*\d+$/i; //                               3 für 2
const NUM = '(?:-?\\d*[.,]\\d{2}|\\d+[.,][-–])';
const BASEPRICE_RE = new RegExp('(\\d+(?:[.,]\\d+)?\\s?(?:kg|g|l|ml|cl|m²|m|Stück|Stk\\.?|WL|Blatt|Tabs?))\\s?=\\s?(' + NUM + '(?:\\s?\\/\\s?' + NUM + ')*)');
const KGPRICE_RE = new RegExp('kg-Preis\\s?[=:]?\\s?(' + NUM + ')');
const VALID_FROM_RE = /^Ab\s+(Mo|Di|Mi|Do|Fr|Sa|So)\.?\s+(\d{1,2}\.\d{1,2}\.)/;
const NOT_VARIANT_RE = /^(UVP|Mit Lidl Plus|Aktion|Auch online|Nur online|Neu|Im Aufsteller|.*Drucktermin.*|Letzter .*|.*Filialpreis.*|.*lidl\.de.*|zzgl\..*|Je\s.*|.*Buchungscode.*|.*Reiseveranstalter.*|.*GmbH.*|Aktionspreis.*|z\.\s?B\..*)$/i;
const MAIN_PRICE_MIN_SIZE = 17; //  Hauptpreise sind groß gesetzt, Streichpreise klein
const MAX_MATCH_DIST = 170; //      weiter entfernte Textblöcke gehören nicht zum Preis
const FAR_DIST = 115; //            ab hier Prüfhinweis

// ── Eingabe vom Server ───────────────────────────────────────────

/** Wort vom Server: [Text, links, oben, Breite, Höhe, Schrift-Nr. (-1 = unbekannt)] in PDF-Punkten */
export type LayoutWord = [string, number, number, number, number, number];
/** Wörter je Seite und die Schriften [Größe, Name] – Antwort von /prospekttext mit layout */
export interface LeafletLayout {
  fonts: [number, string][];
  pages: LayoutWord[][];
}

/** ein Zeichen (hier: ein Wort) mit Grundlinie y (von oben), Größe, Breite, Drehung und Schrift */
interface Glyph { str: string; x: number; y: number; size: number; w: number; rot: number; font: string }

const isWord = (w: unknown): w is LayoutWord => Array.isArray(w) && typeof w[0] === 'string'
  && [1, 2, 3, 4, 5].every((i) => typeof w[i] === 'number' && Number.isFinite(w[i]));

/**
 * Server-Wörter → Zeichen für die Erkennung. Das Werkzeug bekam einzelne Zeichen aus einem umgebauten pdf.js; hier
 * kommen ganze Wörter. Zwei Stellen brauchen darum Hilfe (am echten Prospekt gefunden):
 * - Trennzeichen (U+00AD) am Wortende („Lachsfilet­“): als eigenes Zeichen – die Erkennung macht daraus selbst den
 *   Zeilenumbruch („Lachsfiletportionen“); mitten im Wort ist es ein sichtbarer Bindestrich („4-Käse-Mix“).
 * - große Preise kommen in zwei Wörtern („19.“ + „99*“, die Cent stehen etwas versetzt) – wieder zusammengesetzt.
 */
export function glyphsOfPage(words: readonly unknown[], fonts: readonly [number, string][]): Glyph[] {
  const glyphs: Glyph[] = [];
  for (const word of words) {
    if (!isWord(word)) continue;
    const [text, x, top, w, h, f] = word;
    if (!text.trim()) continue;
    // ohne Schrift: Größe aus der Höhe schätzen (Schrifthöhe ≈ 1,2 × Größe)
    const [size, font] = fonts[f] ?? [h / 1.2, '?'];
    const y = top + 0.8 * h;
    if (text.length > 1 && text.endsWith(SHY)) {
      const shyW = 0.3 * size;
      glyphs.push({ str: text.slice(0, -1).replaceAll(SHY, '-'), x, y, size, w: Math.max(0.1, w - shyW), rot: 0, font });
      glyphs.push({ str: SHY, x: x + w - shyW, y, size, w: shyW, rot: 0, font });
    } else {
      glyphs.push({ str: text.replaceAll(SHY, '-'), x, y, size, w, rot: 0, font });
    }
  }
  // Preis-Hälften: zu „19.“ die nächste Cent-Hälfte rechts daneben auf derselben Grundlinie
  const gone = new Set<Glyph>();
  for (const a of glyphs) {
    if (gone.has(a) || !/^\d{0,4}[.,]$/.test(a.str)) continue;
    let best: { b: Glyph; gap: number } | null = null;
    for (const b of glyphs) {
      if (b === a || gone.has(b) || !/^(\d{2}|-|–)\*?$/.test(b.str) || Math.abs(a.y - b.y) > 0.3 * a.size) continue;
      const gap = b.x - (a.x + a.w);
      if (gap < -0.3 * a.size || gap > 0.6 * a.size) continue;
      if (!best || gap < best.gap) best = { b, gap };
    }
    if (!best) continue;
    a.str += best.b.str;
    a.w = best.b.x + best.b.w - a.x;
    gone.add(best.b);
  }
  return glyphs.filter((g) => !gone.has(g));
}

// ── Erkennung (aus dem Werkzeug) ─────────────────────────────────

interface Line { str: string; x: number; right: number; top: number; y: number; w: number; size: number; rot: number; font: string; hyphenEnd: boolean }
interface Block { lines: Line[]; title: Line[]; desc: Line[]; isProduct: boolean; x: number; right: number; top: number; y: number }
type Rect = Pick<Line, 'x' | 'right' | 'top' | 'y'>;
interface Cand {
  price: Line; block: Block | null; dist: number; margin: number;
  discount?: string; promo?: string; oldPrice?: number | null; oldLine?: Line; plus?: boolean; loose?: string; from?: boolean;
  uvp?: boolean; basePriceRot?: string; perKg?: boolean; example?: string; labels?: Line[]; variant?: string;
  grouped?: boolean; partner?: Cand; moved?: boolean; below?: boolean; available?: string;
}

function priceToNumber(txt: string): number | null {
  const m = txt.replace(/\s|\*/g, '').match(/^(\d{1,4})?[.,](\d{2}|-|–)$/);
  if (!m) return null;
  const euros = m[1] ? parseInt(m[1], 10) : 0;
  const cents = /\d{2}/.test(m[2]) ? parseInt(m[2], 10) : 0;
  return euros + cents / 100;
}

/** 1) Zeichen → Zeilen. Leerzeichen entstehen rein geometrisch aus Lücken. */
function buildLines(glyphs: readonly Glyph[]): Line[] {
  const lines: Line[] = [];
  const byRot = new Map<number, Glyph[]>();
  for (const g of glyphs) {
    if (!g.str || (!g.str.trim() && g.str !== SHY)) continue;
    const r = Math.abs(g.rot) < 2 ? 0 : g.rot;
    if (!byRot.has(r)) byRot.set(r, []);
    byRot.get(r)!.push(g);
  }
  type G = { g: Glyph; u: number; v: number };
  const pending: { rot: number; cos: number; sin: number; size: number; run: G[] }[] = [];
  for (const [rot, list] of byRot) {
    const t = rot * Math.PI / 180, cos = Math.cos(t), sin = Math.sin(t);
    // In Textrichtung drehen: u läuft entlang der Zeile, v ist die Grundlinie
    const gs: G[] = list.map((g) => ({ g, u: g.x * cos - g.y * sin, v: g.x * sin + g.y * cos }))
      .sort((a, b) => (a.v - b.v) || (a.u - b.u));
    const used = new Array<boolean>(gs.length).fill(false);
    for (let i = 0; i < gs.length; i++) {
      if (used[i]) continue;
      const first = gs[i];
      const size = first.g.size;
      // alle Zeichen mit gleicher Grundlinie und Größe
      const row: number[] = [];
      for (let j = i; j < gs.length && gs[j].v - first.v <= 0.1 * size + 0.3; j++) {
        if (used[j]) continue;
        if (Math.abs(gs[j].g.size - size) > 0.12 * size) continue;
        row.push(j);
      }
      row.sort((a, b) => gs[a].u - gs[b].u);
      // an großen Lücken in einzelne Zeilenstücke teilen
      let run: number[] = [];
      const flush = () => {
        if (!run.length) return;
        // Stehen mehrere Preise nebeneinander ("2.29* 4.99*"), an den Wortlücken teilen
        const parts: number[][] = [[]];
        run.forEach((k, n) => {
          if (n) {
            const prev = gs[run[n - 1]];
            if (gs[k].u - (prev.u + prev.g.w) > 0.12 * size) parts.push([]);
          }
          parts[parts.length - 1].push(k);
        });
        const allPrices = parts.length > 1 && parts.every((part) => PRICE_RE.test(part.map((k) => gs[k].g.str).join('')));
        for (const part of (allPrices ? parts : [run])) pending.push({ rot, cos, sin, size, run: part.map((k) => gs[k]) });
        run = [];
      };
      for (const k of row) {
        used[k] = true;
        if (run.length) {
          const prev = gs[run[run.length - 1]];
          const gap = gs[k].u - (prev.u + prev.g.w);
          if (gap > 0.6 * size) flush();
        }
        run.push(k);
      }
      flush();
    }
  }
  // Der Soft Hyphen (U+00AD) kommt in drei Rollen vor:
  //  - schmal (ca. 0,2 em): dient in manchen Schriften als Leerzeichen -> ergibt sich aus der Lücke
  //  - breit (ab ca. 0,3 em) am Zeilenende: Trennstrich -> Wort geht in der nächsten Zeile weiter
  //  - breit mitten in der Zeile: sichtbarer Bindestrich
  //  - ohne Vorschub (nächstes Zeichen an derselben Stelle): unsichtbare Trennstelle
  for (const p of pending) {
    const { run, size, rot, cos, sin } = p;
    let str = '';
    let prev: G | null = null;
    let hyphenEnd = false;
    const vis: G[] = [];
    run.forEach((e, idx) => {
      let ch = e.g.str;
      if (ch === SHY) {
        const wide = e.g.w >= 0.26 * size;
        if (idx === run.length - 1) { if (wide) hyphenEnd = true; return; }
        const next = run[idx + 1];
        if (wide && next.u >= e.u + 0.8 * e.g.w) ch = '-'; else return;
      }
      if (prev) {
        const gap = e.u - (prev.u + prev.g.w);
        if (gap > 0.12 * size) str += ' ';
      }
      str += ch;
      prev = e;
      vis.push(e);
    });
    str = str.replace(/\s+/g, ' ').trim();
    if (!str || !vis.length) continue;
    // Bounding-Box in Seitenkoordinaten
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const e of vis) {
      const corners = [[0, 0], [e.g.w, 0], [0, -0.74 * size], [e.g.w, -0.74 * size]];
      for (const [du, dv] of corners) {
        const u = e.u + du, v = e.v + dv;
        const x = u * cos + v * sin, y = -u * sin + v * cos;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    lines.push({ str, x: x0, right: x1, top: y0, y: y1, w: x1 - x0, size, rot, font: vis[0].g.font, hyphenEnd });
  }
  return lines;
}

function rectDist(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x - b.right, b.x - a.right);
  const dy = Math.max(0, a.top - b.y, b.top - a.y);
  return Math.hypot(dx, dy);
}

/** 2) Zeilen → Textblöcke (gleiche linke Kante, direkt untereinander) */
function buildBlocks(lines: readonly Line[]): Block[] {
  const cand = lines
    .filter((l) => l.rot === 0 && l.size >= 6.5 && l.size <= 16)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const taken = new Set<Line>();
  const blocks: Line[][] = [];
  for (const start of cand) {
    if (taken.has(start)) continue;
    const blk = [start];
    taken.add(start);
    let last = start;
    let maxSize = start.size;
    for (;;) {
      let next: Line | null = null;
      for (const l of cand) {
        if (taken.has(l)) continue;
        // gleiche linke Kante; kleinere Beschreibungszeilen dürfen eingerückt sein (Aufzählungssymbol davor)
        const dx = l.x - start.x;
        const indented = l.size < maxSize - 1.2 && dx > 0 && dx <= 14;
        if (Math.abs(dx) > 2.6 && !indented) continue;
        const dy = l.y - last.y;
        if (dy <= 0.5 || dy > 1.45 * Math.max(l.size, last.size)) continue;
        if (!next || l.y < next.y) next = l;
      }
      if (!next) break;
      // größere Schrift nach kleinerer => dort beginnt ein neuer Block (neue Überschrift)
      if (next.size > last.size + 1.2) break;
      blk.push(next);
      taken.add(next);
      last = next;
      if (next.size > maxSize) maxSize = next.size;
    }
    blocks.push(blk);
  }
  return blocks.map((blk) => {
    // Überschrift = führende Zeilen in der größten Schrift (Marke darf minimal kleiner sein als der Artikelname)
    const titleSize = Math.max(...blk.map((l) => l.size));
    let nTitle = 0;
    while (nTitle < blk.length && blk[nTitle].size >= titleSize - 1.2) nTitle++;
    const title = blk.slice(0, nTitle);
    const desc = blk.slice(nTitle);
    return {
      lines: blk, title, desc,
      isProduct: desc.length > 0 && titleSize >= 8.5 && titleSize <= 16,
      x: Math.min(...blk.map((l) => l.x)),
      right: Math.max(...blk.map((l) => l.right)),
      top: blk[0].top,
      y: blk[blk.length - 1].y,
    };
  });
}

function joinLines(lines: readonly Pick<Line, 'str' | 'hyphenEnd'>[]): string {
  let out = '';
  let prevHyphen = false;
  for (const l of lines) {
    const s = l.str;
    if (!out) out = s;
    else if (prevHyphen) out += (/^[A-ZÄÖÜ]/.test(s) ? '-' : '') + s; //                  Trennung am Zeilenende; vor Großbuchstaben bleibt der Bindestrich
    else if (/[a-zäöüß]-$/.test(out) && /^(und|oder|bzw|sowie)\b/.test(s)) out += ' ' + s; // "Glas- und Plastik..."
    else if (/[a-zäöüß]-$/.test(out) && /^[a-zäöü]/.test(s)) out = out.slice(0, -1) + s; //  "Hähn-" + "chenschenkel"
    else if (/[/-]$/.test(out)) out += s; //                                                "Marzipan-" + "Rohmasse"
    else out += ' ' + s;
    prevHyphen = !!l.hyphenEnd;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function splitBrand(titleLines: readonly Line[]): { brand: string; name: string } {
  const isCaps = (s: string) => /[A-ZÄÖÜ]/.test(s) && !/[a-zäöü]/.test(s.replace(/ß/g, ''));
  let n = 0;
  while (n < titleLines.length && isCaps(titleLines[n].str)) n++;
  if (n === titleLines.length) { const t = joinLines(titleLines); return { brand: t, name: t }; } // nur Marke, z. B. NUTELLA
  if (n === 0) {
    // Marke und Artikel in einer Zeile: "BONDUELLE Goldmais/Erbsen"
    const t = joinLines(titleLines);
    const m = t.match(/^((?:[A-ZÄÖÜ][A-ZÄÖÜ&.'´-]{3,}\s+)+)(?=[A-ZÄÖÜ]?[a-zäöü])(.+)$/);
    return m ? { brand: m[1].trim(), name: m[2].trim() } : { brand: '', name: t };
  }
  return { brand: joinLines(titleLines.slice(0, n)), name: joinLines(titleLines.slice(n)) };
}

const QTY_RE = /\bJe\s+(.+?)(?=;|\.\s+[A-ZÄÖÜ]|\.?(?:\n|$)|\s+\d+(?:[.,]\d+)?\s?(?:kg|g|l|ml|WL)\s?=|\s+(?:Normalpreis|Entspricht|Abtropfgewicht|Standardpackung|zzgl))/;

function quantity(descLines: readonly Pick<Line, 'str'>[]): string {
  // Zeilenumbruch beendet die Angabe, außer sie ist offensichtlich unvollständig ("Je", "Je 100/111/")
  const text = descLines.map((l) => l.str).join('\n')
    .replace(/\bJe\n/g, 'Je ')
    .replace(/([/,x-])\n(?=\d)/g, '$1');
  const m = text.match(QTY_RE);
  return m ? m[1].replace(/\n/g, ' ').trim() : '';
}

/** Ein Angebot aus dem Prospekt, wie das Werkzeug es in seiner Tabelle zeigt */
export interface PriceRow {
  page: number;
  brand: string;
  /** Artikel, wie im Prospekt („Feine Bandnudeln“) */
  name: string;
  variant: string;
  description: string;
  /** Menge wie gedruckt („500 g“, „5x 120 g“) */
  quantity: string;
  price: number;
  /** „ab 3,99“ – der kleinste Preis mehrerer Sorten */
  priceFrom: boolean;
  /** Lidl-Plus-Preis (nur mit der App) */
  plus: boolean;
  /** Preis vorher (Statt-/UVP-Preis), falls gedruckt */
  regular: number | null;
  uvp: boolean;
  discount: string;
  promo: string;
  basePrice: string;
  /** „Mo. 23.11.“, „Do. 26.11.“, „seit So. 8.11.“ – leer: ganzer Prospekt */
  validFrom: string;
  /** Hinweis, wenn die Zuordnung unsicher ist (leer = sicher) */
  check: string;
  x: number;
  y: number;
}

/** 3) Seite auswerten */
function parsePage(glyphs: readonly Glyph[], pageNumber: number): PriceRow[] {
  const lines = buildLines(glyphs);
  const flat = lines.filter((l) => l.rot === 0);

  // Hauptpreise sind groß gesetzt; ein Sternchen ("1.99*") kennzeichnet ebenfalls einen Angebotspreis.
  // Streichpreise stehen in einer anderen Schrift: Kommt die Schrift eines großen Preises ohne Sternchen
  // auf der Seite sonst nur bei kleinen Streichpreisen vor, ist auch er ein Streichpreis.
  const priceLike = flat.filter((l) => PRICE_RE.test(l.str) && priceToNumber(l.str) !== null);
  const starFonts = new Set(priceLike.filter((l) => l.str.endsWith('*') && l.size >= 12).map((l) => l.font));
  const oldFonts = new Set(priceLike.filter((l) => !l.str.endsWith('*') && l.size < MAIN_PRICE_MIN_SIZE).map((l) => l.font));
  const isMain = (l: Line) => {
    if (l.str.endsWith('*')) return l.size >= 12;
    if (l.size < MAIN_PRICE_MIN_SIZE) return false;
    return !(oldFonts.has(l.font) && !starFonts.has(l.font));
  };
  let prices = priceLike.filter(isMain);
  // Großer Streichpreis im Aufmacher: ohne Sternchen, direkt über einem viel größeren Preis mit Sternchen
  prices = prices.filter((l) => {
    if (l.str.endsWith('*')) return true;
    return !prices.some((q) => q !== l && q.str.endsWith('*') && q.size >= 1.7 * l.size && l.y <= q.top + 0.35 * q.size && rectDist(l, q) <= 30);
  });
  if (!prices.length) return [];
  const priceSet = new Set(prices);

  // Produktblöcke
  const blocks = buildBlocks(lines.filter((l) => !priceSet.has(l)));
  const products = blocks.filter((b) => b.isProduct);
  const inBlock = new Set(products.flatMap((b) => b.lines));

  // Preis -> Produktblock. Der Text steht links neben oder über dem Preis, fast nie rechts daneben oder darunter.
  const cost = (p: Line, b: Block) => {
    const dx = Math.max(0, p.x - b.right, b.x - p.right);
    const dy = Math.max(0, p.top - b.y, b.top - p.y);
    const left = b.right <= p.x + 3;
    let d = Math.hypot(left ? 0.5 * dx : dx, dy); //                     waagerechte Lücke nach links zählt nur halb
    if (b.top > p.y - 2) d += 200; //                                      Block beginnt unter dem Preis
    else if (b.x >= p.right - 3 && b.y > p.top + 3) d += 120; //           Block rechts neben dem Preis
    return d;
  };
  const offers: Cand[] = prices.map((p) => {
    let best: Block | null = null, bestD = Infinity, second = Infinity;
    for (const b of products) {
      const d = cost(p, b);
      if (d < bestD) { second = bestD; bestD = d; best = b; } else if (d < second) second = d;
    }
    return { price: p, block: bestD <= MAX_MATCH_DIST ? best : null, dist: bestD, margin: second - bestD };
  });

  const nearestPrice = (l: Line, { above = false, maxDist = 60 } = {}) => {
    let best: Cand | null = null, bestD = Infinity;
    for (const o of offers) {
      const p = o.price;
      let d: number;
      if (above) {
        // Marker steht über dem Preis und überlappt ihn horizontal
        if (l.y > p.y - 0.3 * p.size) continue;
        const overlap = Math.min(l.right, p.right) - Math.max(l.x, p.x);
        if (overlap < Math.min(6, 0.3 * l.w)) continue;
        d = Math.max(0, p.top - l.y);
      } else {
        d = rectDist(l, p);
      }
      if (d < bestD) { bestD = d; best = o; }
    }
    return bestD <= maxDist ? best : null;
  };

  // Zusatzangaben rund um den Preis
  for (const l of flat) {
    if (priceSet.has(l) || inBlock.has(l)) continue;
    const s = l.str;
    if (DISCOUNT_RE.test(s) && l.size <= 80) {
      const o = nearestPrice(l, { above: true, maxDist: 45 });
      if (o && !o.discount) o.discount = s.replace(/\s/g, '').replace('–', '-');
    } else if (MULTIBUY_RE.test(s) || /^Aktion$/.test(s)) {
      const o = nearestPrice(l, { above: true, maxDist: 70 });
      if (o && !o.promo) o.promo = s;
    } else if (PLAIN_PRICE_RE.test(s)) {
      const o = nearestPrice(l, { maxDist: 40 });
      if (o && o.oldPrice == null) { o.oldPrice = priceToNumber(s); o.oldLine = l; }
    } else if (/^Mit Lidl Plus$/i.test(s)) {
      const o = nearestPrice(l, { above: true, maxDist: 75 });
      if (o) o.plus = true;
    } else if (/^Je\s/.test(s) && l.size <= 9) {
      const o = nearestPrice(l, { above: true, maxDist: 45 });
      if (o && !o.loose) o.loose = s;
    } else if (/^ab$/i.test(s)) {
      const o = nearestPrice(l, { maxDist: 12 });
      if (o) o.from = true;
    }
  }
  // "d)"-Fußnote direkt hinter dem Preis = Lidl-Plus-Preis
  for (const l of flat) {
    if (!/^d\)?$/.test(l.str) || l.size > 20) continue;
    for (const o of offers) {
      const p = o.price;
      if (l.x >= p.right - 4 && l.x <= p.right + 8 && l.y >= p.top - 4 && l.y <= p.y) o.plus = true;
    }
  }
  // "UVP" direkt über dem Streichpreis
  for (const l of flat) {
    if (l.str !== 'UVP') continue;
    for (const o of offers) {
      if (o.oldLine && Math.abs(l.x - o.oldLine.x) < 6 && o.oldLine.y - l.y > 0 && o.oldLine.y - l.y < 2 * o.oldLine.size) o.uvp = true;
    }
  }
  // Gedrehte Angaben direkt neben dem Preis: Grundpreis, "kg-Preis" (Preis gilt je kg), "z.B. 800 g"
  for (const l of lines) {
    if (l.rot === 0) continue;
    const m = l.str.match(BASEPRICE_RE);
    const perKg = /^kg-Preis$/i.test(l.str);
    const example = l.str.match(/^z\.\s?B\.\s*(\d.*)$/);
    if (!m && !perKg && !example) continue;
    let best: Cand | null = null, bestD = 14;
    for (const o of offers) {
      const d = rectDist(l, o.price);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (!best) continue;
    if (m) best.basePriceRot = `${m[1]} = ${m[2]}`;
    if (perKg) best.perKg = true;
    if (example) best.example = 'z. B. ' + example[1];
  }

  // Varianten: kleine Beschriftung direkt über Preis oder Rabatt-Schild ("ca. 135 x 200 cm", "Typ 55M79N")
  for (const l of flat) {
    if (l.size > 7.6 || priceSet.has(l) || inBlock.has(l)) continue;
    const t = l.str;
    if (t.length < 3 || t.length > 44 || !/[A-Za-zÄÖÜäöü]/.test(t)) continue;
    if (NOT_VARIANT_RE.test(t) || PLAIN_PRICE_RE.test(t) || DISCOUNT_RE.test(t)) continue;
    let best: Cand | null = null, bestD = 38;
    for (const o of offers) {
      const p = o.price;
      if (l.y > p.top + 1) continue;
      const overlap = Math.min(l.right, p.right) - Math.max(l.x, p.x);
      if (overlap < Math.min(6, 0.3 * l.w)) continue;
      const d = p.top - l.y;
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) (best.labels ??= []).push(l);
  }
  for (const o of offers) {
    if (!o.labels) continue;
    o.labels.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    o.variant = o.labels.map((l) => l.str).join(' ').replace(/\s+/g, ' ');
  }
  // Mehrere beschriftete Preise in einer Reihe oder Spalte sind Varianten desselben Artikels
  {
    const vs = offers.filter((o) => o.variant && !o.plus);
    const parent = new Map(vs.map((o) => [o, o]));
    const find = (o: Cand) => { while (parent.get(o) !== o) o = parent.get(o)!; return o; };
    const link = (test: (a: Line, b: Line, gapX: number, gapY: number) => boolean, only?: Set<Cand>) => {
      for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
        if (only && !(only.has(vs[i]) && only.has(vs[j]))) continue;
        const a = vs[i].price, b = vs[j].price;
        if (Math.abs(a.size - b.size) > 0.12 * a.size) continue;
        const gapX = Math.max(0, a.x - b.right, b.x - a.right), gapY = Math.max(0, a.top - b.y, b.top - a.y);
        if (test(a, b, gapX, gapY)) parent.set(find(vs[i]), find(vs[j]));
      }
    };
    const collect = () => {
      const groups = new Map<Cand, Cand[]>();
      for (const o of vs) { const r = find(o); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(o); }
      return groups;
    };
    // erst Reihen bilden, dann aus den übrigen Einzelpreisen Spalten (eine Reihe und eine Spalte sind zwei Artikel)
    link((a, b, gapX) => Math.abs(a.y - b.y) < 3 && gapX < 70);
    const singles = new Set([...collect().values()].filter((g) => g.length === 1).map((g) => g[0]));
    link((a, b, _gapX, gapY) => Math.abs(a.x - b.x) < 8 && gapY < 80, singles);
    for (const g of collect().values()) {
      if (g.length < 2) continue;
      let bestB: Block | null = null, bestS = Infinity;
      for (const b of products) {
        let sc = Infinity;
        for (const m of g) {
          let d = cost(m.price, b);
          if (b.top > m.price.y - 2) d -= 140; //                       bei Varianten darf der Text auch unter den Preisen stehen
          if (d < sc) sc = d;
        }
        if (sc < bestS) { bestS = sc; bestB = b; }
      }
      if (bestB && bestS <= MAX_MATCH_DIST) for (const m of g) { m.block = bestB; m.dist = bestS; m.grouped = true; }
    }
  }

  // Lidl-Plus-Preis steht direkt unter dem kleiner gesetzten Normalpreis desselben Artikels.
  // Der Artikeltext steht dann am Normalpreis; der Plus-Preis folgt dessen Zuordnung.
  for (const o of offers) {
    if (!o.plus) continue;
    const p = o.price;
    let best: Cand | null = null, bestGap = 75;
    for (const n of offers) {
      if (n === o || n.plus) continue;
      const q = n.price;
      if (q.size >= p.size || q.y > p.top + 2) continue;
      const overlap = Math.min(p.right, q.right) - Math.max(p.x, q.x);
      if (overlap < 0.5 * Math.min(p.w, q.w)) continue;
      const gap = Math.max(0, p.top - q.y);
      if (gap < bestGap) { bestGap = gap; best = n; }
    }
    if (!best) continue;
    if (!best.block && o.block) { best.block = o.block; best.dist = o.dist; best.margin = o.margin; }
    o.partner = best;
  }
  const free = offers.filter((o) => !o.partner && !o.grouped); // Plus-Preise mit Partner laufen nur mit; Varianten bleiben zusammen

  // Reparatur: Block ohne Preis holt sich einen Preis von einem Block, der mehrere gleichartige hat
  const groupOf = () => {
    const group = new Map<Block, Cand[]>();
    for (const o of free) if (o.block) { if (!group.has(o.block)) group.set(o.block, []); group.get(o.block)!.push(o); }
    return group;
  };
  for (let round = 0; round < 30; round++) {
    const group = groupOf();
    let move: { o: Cand; b: Block; d: number; gain: number } | null = null;
    for (const b of products) {
      if (group.has(b)) continue;
      for (const o of free) {
        if (o.block) {
          const sameKind = group.get(o.block)!.filter((s) => !!s.plus === !!o.plus).length;
          if (sameKind < 2) continue;
        }
        const d = cost(o.price, b);
        if (d > MAX_MATCH_DIST) continue;
        const gain = d - (o.block ? o.dist : MAX_MATCH_DIST);
        if (!move || gain < move.gain) move = { o, b, d, gain };
      }
    }
    if (!move) break;
    move.o.block = move.b;
    move.o.dist = move.d;
    move.o.moved = true;
  }
  // Ausreißer: überzähliger Preis, der viel weiter weg ist als die übrigen am selben Block
  for (const g of groupOf().values()) {
    const min = Math.min(...g.map((o) => o.dist));
    for (const o of g) {
      const sameKind = g.filter((s) => !!s.plus === !!o.plus).length;
      if (sameKind >= 2 && !o.variant && o.dist > 2.5 * min + 40) o.block = null;
    }
  }
  // Rückfall für Preise ohne Artikel: Text direkt unter dem Preis (kommt bei Kacheln mit großem Bild vor)
  for (const o of free) {
    if (o.block) continue;
    const p = o.price;
    let best: Block | null = null, bestGap = 45;
    for (const b of products) {
      if (b.top < p.y - 2) continue;
      if (Math.min(b.right, p.right) - Math.max(b.x, p.x) <= 0) continue;
      const gap = b.top - p.y;
      if (gap < bestGap) { bestGap = gap; best = b; }
    }
    if (best) { o.block = best; o.dist = bestGap; o.below = true; }
  }
  for (const o of offers) if (o.partner) { o.block = o.partner.block; o.dist = o.partner.dist; o.margin = o.partner.margin; }

  // Kachel-Hinweis "Erhältlich ab Do. 26.11." bzw. "seit So. 8.11.": gilt für das Angebot direkt darunter
  for (const l of flat) {
    const m = l.str.match(/^(?:Erhältlich\s+)?(ab|seit)\s+((?:Mo|Di|Mi|Do|Fr|Sa|So)\.\s+\d{1,2}\.\d{1,2}\.)$/);
    if (!m) continue;
    const hasLabel = /^Erhältlich/.test(l.str) || flat.some((k) => /^Erhältlich$/.test(k.str) && Math.abs(k.x - l.x) < 12 && l.y - k.y > 0 && l.y - k.y < 2 * l.size);
    if (!hasLabel) continue;
    let best: Cand | null = null, bestGap = 260;
    for (const o of offers) {
      const b = o.block, p = o.price;
      const x0 = Math.min(p.x, b ? b.x : p.x), x1 = Math.max(p.right, b ? b.right : p.right);
      const top = Math.min(p.top, b ? b.top : p.top);
      if (top < l.y - 4) continue; //                                   Angebot muss unter dem Hinweis liegen
      if (Math.min(l.right, x1 + 40) - Math.max(l.x, x0 - 40) <= 0) continue;
      const gap = top - l.y;
      if (gap < bestGap) { bestGap = gap; best = o; }
    }
    if (best) for (const o of offers) if (o === best || (best.block && o.block === best.block)) o.available = (m[1] === 'seit' ? 'seit ' : '') + m[2];
  }

  // "Ab Mo. 23.11."-Kopfzeilen
  const headers = flat.filter((l) => VALID_FROM_RE.test(l.str));
  const pageHeader = headers.slice().sort((a, b) => a.y - b.y)[0];

  // Ergebniszeilen
  const byBlock = new Map<Block, Cand[]>();
  for (const o of offers) {
    if (!o.block) continue;
    if (!byBlock.has(o.block)) byBlock.set(o.block, []);
    byBlock.get(o.block)!.push(o);
  }
  const rows: PriceRow[] = [];
  for (const o of offers) {
    const p = o.price;
    const b = o.block;
    const desc = b ? joinLines(b.desc) : '';
    const { brand, name } = b ? splitBrand(b.title) : { brand: '', name: '' };
    const siblings = b ? byBlock.get(b)! : [o];
    let oldPrice = o.oldPrice ?? null;
    let uvp = !!o.uvp;
    if (oldPrice == null) {
      const sib = siblings.find((s) => s !== o && s.oldPrice != null);
      if (sib) { oldPrice = sib.oldPrice!; uvp = !!sib.uvp; }
    }
    if (oldPrice == null) {
      const m = desc.match(/Normalpreis:?\s*(\d*[.,]\d{2})/);
      if (m) oldPrice = priceToNumber(m[1]);
    }
    let bp = o.basePriceRot || '';
    if (!bp) {
      const m = desc.match(BASEPRICE_RE) || (o.loose || '').match(BASEPRICE_RE);
      const k = desc.match(KGPRICE_RE);
      if (m) bp = `${m[1]} = ${m[2]}`;
      else if (k) bp = `1 kg = ${k[1]}`;
      else if (o.perKg) bp = `1 kg = ${priceToNumber(p.str)!.toFixed(2)}`;
    }
    // Gültig ab: nächste Kopfzeile oberhalb in derselben Spalte, sonst Seitenkopf
    let hdr: Line | null = null, hd = Infinity;
    const left = Math.min(p.x, b ? b.x : p.x), right = Math.max(p.right, b ? b.right : p.right);
    for (const h of headers) {
      if (h.y > p.y) continue;
      const overlap = Math.min(h.right, right) - Math.max(h.x, left);
      if (overlap <= 0 && h !== pageHeader) continue;
      const d = p.y - h.y;
      if (d < hd) { hd = d; hdr = h; }
    }
    const value = priceToNumber(p.str)!;
    const check: string[] = [];
    const sameKind = siblings.filter((s) => !!s.plus === !!o.plus);
    const isVariant = sameKind.length > 1 && sameKind.every((s) => s.variant);
    if (!b) check.push('kein Artikel gefunden');
    else if (o.below) check.push('Artikeltext steht unter dem Preis');
    else if (rectDist(p, b) > FAR_DIST && !o.partner && !o.grouped) check.push('Artikel weit vom Preis entfernt');
    else if (o.margin < 12 && !o.moved && !o.partner && !o.grouped) check.push('Zuordnung nicht eindeutig');
    if (b && sameKind.length > 1 && !isVariant) check.push('mehrere Preise am selben Artikel');
    const variant = o.variant && (isVariant || /\d|größe|size/i.test(o.variant)) ? o.variant : '';
    if (oldPrice != null && oldPrice <= value) check.push('Statt-Preis nicht höher als Preis');
    rows.push({
      page: pageNumber,
      brand,
      name,
      variant,
      description: desc,
      quantity: (b ? quantity(b.desc) : '') || (o.loose ? quantity([{ str: o.loose }]) : '') || o.example || '',
      price: value,
      priceFrom: !!o.from,
      plus: !!o.plus,
      regular: oldPrice,
      uvp,
      discount: o.discount || '',
      promo: o.promo || '',
      basePrice: bp,
      validFrom: o.available || (hdr ? hdr.str.replace(/^Ab\s+/, '') : ''),
      check: check.join('; '),
      x: p.x,
      y: p.y,
    });
  }
  rows.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return rows;
}

/** Alle Angebote mit Preis aus den Wörtern des Servers – Seite für Seite, in Lesereihenfolge */
export function priceRows(layout: unknown): PriceRow[] {
  const l = layout as Partial<LeafletLayout> | null;
  if (!l || !Array.isArray(l.pages) || !Array.isArray(l.fonts)) return [];
  // kaputte Schrift ersetzen statt weglassen – die Wörter zählen ihre Schrift per Nummer in dieser Liste
  const fonts = (l.fonts as unknown[]).map((f): [number, string] =>
    (Array.isArray(f) && typeof f[0] === 'number' && typeof f[1] === 'string' ? [f[0], f[1]] : [10, '?']));
  return l.pages.flatMap((words, i) => (Array.isArray(words) ? parsePage(glyphsOfPage(words, fonts), i + 1) : []));
}
