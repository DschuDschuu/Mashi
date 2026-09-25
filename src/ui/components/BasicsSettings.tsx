import { useState } from 'react';
import { DEFAULT_BASICS } from '../../domain/mealplan';
import type { MyProduct } from '../../domain/nutrition/myProducts';
import { DEFAULT_NO_NUTRITION } from '../../domain/nutrition/noNutrition';
import { normalizeName } from '../../domain/nutrition/localFoods';
import { saveProducts, setNoNutrition, setPantryBasics, usePantry, useProducts } from '../../data/store';
import { foodTable } from '../../services';
import { toast } from '../toast';
import { ProductForm } from './MyProductsPanel';
import { NameListSettings } from './NameListSettings';

/**
 * „Immer im Haus“: was du immer im Schrank hast. Auf der Einkaufsliste unter „Basics“, nie „fehlt“ –
 * bei Vorschlägen zählt es weiter mit. Antippen → eigene Nährwerte (als „Mein Produkt“).
 */
export function BasicsSettings() {
  const pantry = usePantry();
  const products = useProducts();
  const names = pantry.basics ?? DEFAULT_BASICS;
  const [picked, setPicked] = useState<string | null>(null);
  const draft = picked ? productFor(picked, products) : null;
  const save = (p: MyProduct) => {
    saveProducts(products.some((x) => x.id === p.id) ? products.map((x) => (x.id === p.id ? p : x)) : [...products, p]);
    toast(`Nährwerte für „${picked}“ gespeichert`);
    setPicked(null);
  };
  return (
    <NameListSettings icon="archive" title="Immer im Haus" names={names} onChange={setPantryBasics}
      hint="Steht auf der Einkaufsliste unter „Basics“ und wird bei Rezepten nie als „fehlt“ gemeldet. Antippen, um eigene Nährwerte zu hinterlegen."
      placeholder="z. B. Haferflocken" onPick={(n) => setPicked(picked === n ? null : n)} picked={picked}>
      {draft && <ProductForm key={picked} initial={draft} onSave={save} onCancel={() => setPicked(null)} />}
    </NameListSettings>
  );
}

/** Eigenes Produkt zu diesem Namen – vorhandenes bearbeiten oder neu, vorausgefüllt mit den Werten der Tabelle. */
function productFor(name: string, products: MyProduct[]): Partial<MyProduct> {
  const n = normalizeName(name);
  const food = foodTable.matchName(name)?.food;
  const id = food?.ref.foodId;
  const existing = products.find((p) => p.names?.includes(n) || (id && p.replaces.includes(id)) || normalizeName(p.name) === n);
  if (existing) return existing;
  return food
    ? { name, replaces: [id!], per100g: food.per100g }
    : { name, replaces: [], names: [n] };
}

/** „Ohne Nährwerte“: Gewürze & Co., die in Rezepten nicht mitgezählt werden. */
export function NoNutritionSettings() {
  const pantry = usePantry();
  return (
    <NameListSettings icon="leaf" title="Ohne Nährwerte" names={pantry.noNutrition ?? DEFAULT_NO_NUTRITION} onChange={setNoNutrition}
      hint="Gewürze und Kräuter, die in Rezepten nicht mitgezählt werden – wie Salz. Auch im Nährwerte-Tab eines Rezepts umschaltbar."
      placeholder="z. B. Sumach" />
  );
}
