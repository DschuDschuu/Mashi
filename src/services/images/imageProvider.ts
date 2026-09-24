import type { ImageMotif, RecipeContent, RecipeImage } from '../../domain/types';
import { buildImagePrompt } from './imageStyle';

export interface ImageProvider {
  id: string;
  /** Erzeugt EIN Bild. Aufrufer speichern es dauerhaft – nie bei jedem Anzeigen neu erzeugen. */
  generate(content: RecipeContent): Promise<RecipeImage>;
}

const MOTIF_HINTS: [RegExp, ImageMotif][] = [
  [/pancake|pfannkuchen|waffel/i, 'stack'],
  [/oats|porridge|müsli|smoothie|shake|getränk/i, 'jar'],
  [/suppe|eintopf|curry|chili/i, 'pot'],
  [/pasta|nudel|spaghetti|lasagne|hähnchen|chicken|schnitzel|fisch/i, 'plate'],
];

export function motifFor(title: string): ImageMotif {
  return MOTIF_HINTS.find(([re]) => re.test(title))?.[1] ?? 'bowl';
}

/** Nur die Pastelltöne der App (Pfirsich, Butter, Salbei, Mint, Himmelblau) – nie Lila oder Neon. */
export const PASTEL_HUES = [22, 40, 110, 155, 200];

/** Prototyp: kein echtes Bild, sondern eine Linienzeichnung auf Pastellgrund. */
export const placeholderImages: ImageProvider = {
  id: 'placeholder',
  async generate(content) {
    // Der Prompt wird schon gebaut, damit der spätere Wechsel nur den Provider betrifft.
    void buildImagePrompt(content.imagePrompt ?? content.title);
    await new Promise((r) => setTimeout(r, 600));
    const hue = PASTEL_HUES[Math.floor(Math.random() * PASTEL_HUES.length)];
    return { kind: 'placeholder', motif: motifFor(content.title), hue };
  },
};
