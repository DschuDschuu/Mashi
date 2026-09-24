/**
 * Einheitlicher Bildstil für alle KI-Rezeptbilder – damit sie wie aus EINEM Kochbuch wirken.
 * Zentral an einer Stelle, damit Rezepte nur das Gericht beschreiben müssen.
 */
export const IMAGE_SIZE = { width: 1024, height: 1024 } as const;

export const IMAGE_STYLE_PROMPT = [
  'realistic food photography',
  'soft natural daylight',
  'bright, clean setting with a subtle neutral background',
  'authentic home-cooked food, appetizing, not overly styled',
  'modern cookbook aesthetic, understated ceramic tableware',
  '45-degree angle or slight top-down view',
].join(', ');

export const IMAGE_NEGATIVE_PROMPT = 'people, hands, text, letters, logos, watermark, restaurant plating, artificial perfection';

export function buildImagePrompt(dishDescription: string): string {
  return `${dishDescription}. ${IMAGE_STYLE_PROMPT}. Avoid: ${IMAGE_NEGATIVE_PROMPT}.`;
}
