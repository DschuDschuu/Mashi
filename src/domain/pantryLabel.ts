import { formatAmount } from './scaling';

/** Größe einer Packung (g oder ml) – so, wie ein Vorrat sie sich merkt */
export interface Pack {
  amount: number;
  unit: 'g' | 'ml';
}

type Labelled = { amount?: number; unit?: 'g' | 'ml' | 'Stück' | 'Glas'; pack?: Pack; openedAt?: string };

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
  const count = item.unit === 'Stück' || item.unit === 'Glas';
  const n = formatAmount(item.amount, count ? 'Stück' : 'g');
  if (item.pack && count) return `${n} × ${packLabel(item.pack)}`;
  return `${n} ${item.unit ?? ''}`.trim() + (item.openedAt ? ' offen' : '');
}
