import { describe, expect, it } from 'vitest';
import { SIDES } from '../domain/sides';
import { mixIcon } from './catalogIcons';

describe('Icons im Teller als Bild (Julia: „Icons für Protein & Co.“)', () => {
  it('jeder feste Baustein außer Toppings hat ein Icon – Toppings ohne bekommen Streusel', () => {
    const without = SIDES.filter((s) => !s.retired && s.kind !== 'topping' && !mixIcon(s.name, s.kind)).map((s) => s.name);
    expect(without).toEqual([]);
  });

  it('die neuen Icons', () => {
    const protein = ['Hackfleisch', 'Hack-Patty', 'Tofu', 'Linsen', 'Schwarze Bohnen', 'Kichererbsen', 'Halloumi'];
    expect(protein.map((n) => mixIcon(n, 'protein'))).toEqual(['patty', 'patty', 'tofu', 'legume', 'legume', 'legume', 'cheese']);
    expect(['Tortillas', 'Wraps'].map((n) => mixIcon(n, 'carb'))).toEqual(['tortilla', 'tortilla']);
    const topping = ['Parmesan', 'Feta', 'Geriebener Käse', 'Cheddar', 'Ei', 'Koriander'];
    expect(topping.map((n) => mixIcon(n, 'topping'))).toEqual(['cheese', 'cheese', 'cheese', 'cheese', 'egg', 'leaf']);
  });

  it('kein Fehlgriff: Reis und Brei sind kein Ei, gehackte Mandeln kein Hack; Sesam bleibt Streusel', () => {
    expect(mixIcon('Reis', 'carb')).toBe('rice');
    expect(mixIcon('Grießbrei', 'carb')).toBeUndefined();
    expect(mixIcon('Rührei', 'protein')).toBe('egg');
    expect(mixIcon('Gehackte Mandeln', 'topping')).toBeUndefined();
    expect(mixIcon('Sesam', 'topping')).toBeUndefined();
  });
});
