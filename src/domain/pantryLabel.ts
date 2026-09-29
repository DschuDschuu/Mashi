import { formatAmount } from './scaling';

/** Größe einer Packung (g oder ml) – so, wie ein Vorrat sie sich merkt */
export interface Pack {
  amount: number;
  unit: 'g' | 'ml';
}

type Labelled = { amount?: number; unit?: 'g' | 'ml' | 'Stück' | 'Glas'; pack?: Pack; openedAt?: string; recipeId?: string };

/** „500 g“, „1 kg“, „1 l“, „250 ml“ */
export function packLabel(p: Pack): string {
  const de = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  if (p.amount >= 1000) return `${de(p.amount / 1000)} ${p.unit === 'ml' ? 'l' : 'kg'}`;
  return `${de(p.amount)} ${p.unit}`;
}

/**
 * Menge eines Vorrats, wie man sie im Schrank sieht: „4 × 500 g“, „750 ml offen“, „2 Stück“, „vorhanden“.
 * Geteilt von Speisekammer und Einkaufsliste.
 */
export function amountLabel(item: Labelled): string {
  if (item.amount === undefined) return 'vorhanden';
  if (item.recipeId) return `${formatAmount(item.amount, 'Stück')} ${item.amount === 1 ? 'Portion' : 'Portionen'}`;
  const count = item.unit === 'Stück' || item.unit === 'Glas';
  const n = formatAmount(item.amount, count ? 'Stück' : 'g');
  if (item.pack && count) {
    // angebrochene Zahl (frei nach dem Wochenplan: 1,8 Packungen) wie im Schrank: „1 × 1 l + 800 ml“
    const closed = Math.floor(item.amount + 1e-6);
    const rest = Math.round((item.amount - closed) * item.pack.amount);
    if (rest > 0) {
      const part = packLabel({ amount: rest, unit: item.pack.unit });
      return closed > 0 ? `${closed} × ${packLabel(item.pack)} + ${part}` : part;
    }
    return `${n} × ${packLabel(item.pack)}`;
  }
  const big = (item.unit === 'g' || item.unit === 'ml') && item.amount >= 1000 ? packLabel({ amount: item.amount, unit: item.unit }) : undefined;
  return (big ?? `${n} ${item.unit ?? ''}`.trim()) + (item.openedAt ? ' offen' : '');
}
