import type { CSSProperties, ReactNode } from 'react';
import type { ImageMotif, RecipeImage as Img } from '../../domain/types';

/**
 * Rezeptbild. Im Prototyp eine Linienzeichnung auf Pastellgrund – im Stil der
 * Illustrationen aus der Mashi-Gestaltungsvorlage. Später { kind: 'url' } mit echtem Foto;
 * der Rest der App merkt davon nichts.
 */
export function RecipeImage({ image, size = 'md', className = '' }: { image?: Img; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  if (image?.kind === 'url') {
    return <img className={`rimg rimg--${size} ${className}`} src={image.url} alt="" loading="lazy" />;
  }
  const style = { '--h': image?.hue ?? 155 } as CSSProperties;
  return (
    <div className={`rimg rimg--ph rimg--${size} ${className}`} style={style} role="img" aria-label="Platzhalterbild">
      <LineArt motif={image?.motif ?? 'bowl'} />
    </div>
  );
}

/** Vierzackiger Funkelstern ✦ */
const sparkle = (x: number, y: number, s: number) =>
  `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}z`;

const STEAM = 'M88 40c-5-6 5-11 0-18 M102 36c-5-6 5-11 0-18 M116 40c-5-6 5-11 0-18';

const MOTIFS: Record<ImageMotif, ReactNode> = {
  bowl: (
    <>
      <path className="art-line" d={STEAM} />
      <path className="art-food" d="M56 86c2-12 12-18 22-15 5-10 18-13 26-5 8-8 22-6 28 3 9-2 18 6 18 17z" />
      <path className="art-line" d="M68 76l6-6 M78 73l3-7 M118 74c6-5 15-4 19 2 M122 80c5-4 12-3 15 1" />
      <path className="art-line" d="M126 62l46-26 M130 68l46-24" />
      <path className="art-fill" d="M46 86h108c0 26-22 44-54 44S46 112 46 86z" />
      <path className="art-line" d="M84 130c4 5 28 5 32 0 M60 98c16 6 64 6 80 0" />
    </>
  ),
  plate: (
    <>
      <circle className="art-fill" cx="100" cy="82" r="46" />
      <circle className="art-line" cx="100" cy="82" r="34" />
      <path className="art-food" d="M80 84c-6-14 10-26 24-20 14-4 22 10 16 22-2 12-18 16-28 10-8 2-14-4-12-12z" />
      <path className="art-line" d="M90 80c4-6 14-6 18 0s-2 12-10 10 M112 68c5-5 12-4 13-4 0 6-5 9-10 9" />
      <path className="art-line" d="M42 44v26 M36 44v14a6 6 0 0 0 12 0V44 M42 72v46 M158 44c7 6 7 24 0 32v42" />
    </>
  ),
  pot: (
    <>
      <path className="art-line" d={STEAM} />
      <path className="art-food" d="M58 68c6-6 14-6 20 0 6-6 14-6 20 0 6-6 14-6 20 0 6-6 14-6 20 0z" />
      <path className="art-line" d="M136 28l-14 38" />
      <path className="art-fill" d="M52 68h96v38c0 14-10 24-24 24H76c-14 0-24-10-24-24z" />
      <path className="art-line" d="M46 68h108 M52 78h-8a5 5 0 0 0 0 10h8 M148 78h8a5 5 0 0 1 0 10h-8 M66 96c10 4 58 4 68 0" />
    </>
  ),
  stack: (
    <>
      <path className="art-line" d="M34 110c0 9 30 16 66 16s66-7 66-16" />
      <path className="art-fill" d="M58 62v36c0 5 19 9 42 9s42-4 42-9V62z" />
      <path className="art-food" d="M58 62c0-5 19-9 42-9s42 4 42 9-19 9-42 9-42-4-42-9z" />
      <path className="art-line" d="M58 62v36 M142 62v36 M58 74c0 5 19 9 42 9s42-4 42-9 M58 86c0 5 19 9 42 9s42-4 42-9 M58 98c0 5 19 9 42 9s42-4 42-9 M84 68c0 8 3 12 3 16 M114 70c0 5 3 8 3 12" />
      <circle className="art-berry" cx="92" cy="54" r="4.5" />
      <circle className="art-berry" cx="104" cy="52" r="4.5" />
      <circle className="art-berry" cx="98" cy="45" r="4.5" />
    </>
  ),
  jar: (
    <>
      <path className="art-line" d="M124 20c6-6 14-2 12 6-1 5-7 7-11 4l-12 28" />
      <path className="art-fill" d="M72 46h56v70c0 8-6 14-14 14H86c-8 0-14-6-14-14z" />
      <path className="art-food" d="M72 78c10 4 46 4 56 0v20c-10 4-46 4-56 0z" />
      <path className="art-line" d="M68 40h64v6H68z M72 46v70c0 8 6 14 14 14h28c8 0 14-6 14-14V46 M72 78c10 4 46 4 56 0 M72 98c10 4 46 4 56 0 M84 58h8v8h-8z M100 54h8v8h-8z M114 60h7v7h-7z" />
    </>
  ),
};

export function LineArt({ motif }: { motif: ImageMotif }) {
  return (
    <svg className="art" viewBox="0 0 200 156" aria-hidden="true">
      {MOTIFS[motif]}
      <path className="art-spark" d={`${sparkle(34, 34, 7)} ${sparkle(168, 112, 5)} ${sparkle(158, 22, 4)} ${sparkle(28, 120, 4)}`} />
    </svg>
  );
}
