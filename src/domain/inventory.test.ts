import { describe, expect, it } from 'vitest';
import type { MealPlan } from './mealplan';
import { localFoodTable as T } from './nutrition/localFoods';
import { emptyPantry, type PantryItem } from './pantry';
import { EXTRA_PREFIX, shoppingList } from './restock';
import { storageOf } from './shelfLife';
import { merge3Plan } from './syncMerge';

const NOW = '2026-09-28T12:00:00.000Z';
const plan = (extra: MealPlan['extra'] = []): MealPlan => ({ items: [], checked: [], cooked: [], extra, updatedAt: NOW });
const item = (name: string, extra: Partial<PantryItem> = {}): PantryItem => ({ id: name, name, amount: 1, unit: 'Stück', addedAt: NOW, ...extra });

describe('Eigene Einträge auf der Einkaufsliste', () => {
  it('selbst getippt („Spülmittel“) oder aus der Inventur – stehen ohne Rezept auf der Liste', () => {
    const list = shoppingList(plan([{ name: 'Spülmittel', addedAt: NOW }, { name: 'Kreuzkümmel', addedAt: NOW, source: 'inventur' }]), [], T, emptyPantry());
    expect(list.map((i) => [i.name, i.pantry, i.extra, i.note])).toEqual([
      ['Kreuzkümmel', false, true, 'aus der Inventur'],
      ['Spülmittel', false, true, undefined],
    ]);
    expect(list.find((i) => i.name === 'Spülmittel')!.key).toBe(`${EXTRA_PREFIX}spülmittel`);
  });

  it('Abgleich: am Handy „Spülmittel“, am Laptop „Backpapier“ → beide', () => {
    const base = plan();
    const merged = merge3Plan(base, plan([{ name: 'Spülmittel', addedAt: NOW }]), plan([{ name: 'Backpapier', addedAt: NOW }]));
    expect(merged.extra?.map((x) => x.name).sort()).toEqual(['Backpapier', 'Spülmittel']);
  });
});

describe('Wo steht es? (für die Inventur)', () => {
  it('Nudeln, Konserven, Gläser → Speisekammer; Milch, Hack → Kühlschrank; Gefrorenes → Tiefkühler', () => {
    expect(storageOf(item('Pasta'), T)).toBe('vorrat');
    expect(storageOf(item('Passierte Tomaten'), T)).toBe('vorrat');
    expect(storageOf(item('Pesto'), T)).toBe('vorrat');
    expect(storageOf(item('Milch'), T)).toBe('kuehl');
    expect(storageOf(item('Rinderhack'), T)).toBe('kuehl');
    expect(storageOf(item('Rinderhack', { frozenAt: NOW }), T)).toBe('gefroren');
  });
  it('offen: Pesto und Konserven in den Kühlschrank, offene Nudeln bleiben im Schrank; Vorgekochtes ist kühl', () => {
    expect(storageOf(item('Pesto', { openedAt: NOW }), T)).toBe('kuehl');
    expect(storageOf(item('Passierte Tomaten', { openedAt: NOW }), T)).toBe('kuehl');
    expect(storageOf(item('Pasta', { openedAt: NOW }), T)).toBe('vorrat');
    expect(storageOf(item('Bolognese', { recipeId: 'r1' }), T)).toBe('kuehl');
  });
});
