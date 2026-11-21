import type { ReactNode } from 'react';

/**
 * Geschlossene Türchen als kleine Grafik (Julia: „so fancy wie mein Beispiel“, Variante A: kräftig, Hochformat).
 * Eigene Motive – Bäumchen, Streifen, Schneeflocke, Schleife, Punkte, Sterne, Kugel, Stechpalme, Rauten – in Rot,
 * Grün, Braun und Rosa; die Zahl mal groß mit Innenlinie, mal klein in der Ecke. Reines SVG: keine Bilddateien,
 * scharf auf jeder Größe. Nur Bild (aria-hidden) – was das Türchen ist, sagt der Knopf selbst (aria-label).
 */

const C = {
  red: '#d8383d', rose: '#ee6e6c', pink: '#f6a7a4', green: '#1e5b45', lime: '#8dbb3e',
  brown: '#5b3a2a', cream: '#fbf1e6', white: '#ffffff',
};
const FONT = "'Nunito Sans', system-ui, sans-serif";
const W = 60, H = 80;

const f = (n: number) => n.toFixed(1);

function starPath(cx: number, cy: number, r: number): string {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return `${f(cx + rr * Math.cos(a))},${f(cy + rr * Math.sin(a))}`;
  });
  return `M${pts.join('L')}Z`;
}

const Star = ({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) => <path d={starPath(x, y, r)} fill={fill} />;

const Tree = ({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) => (
  <g fill={fill}>
    <polygon points={`${f(x)},${f(y - s)} ${f(x - s * 0.75)},${f(y + s * 0.6)} ${f(x + s * 0.75)},${f(y + s * 0.6)}`} />
    <rect x={x - s * 0.12} y={y + s * 0.6} width={s * 0.24} height={s * 0.3} />
  </g>
);

/** sechs Arme mit je zwei Ästchen */
function Snowflake({ x, y, r, stroke, w }: { x: number; y: number; r: number; stroke: string; w: number }) {
  const d = [0, 60, 120, 180, 240, 300].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const bx = x + r * 0.58 * Math.cos(a), by = y + r * 0.58 * Math.sin(a);
    const l = r * 0.32;
    return `M${f(x)},${f(y)}L${f(x + r * Math.cos(a))},${f(y + r * Math.sin(a))}`
      + `M${f(bx)},${f(by)}L${f(bx + l * Math.cos(a + 0.7))},${f(by + l * Math.sin(a + 0.7))}`
      + `M${f(bx)},${f(by)}L${f(bx + l * Math.cos(a - 0.7))},${f(by + l * Math.sin(a - 0.7))}`;
  }).join('');
  return <path d={d} stroke={stroke} strokeWidth={w} strokeLinecap="round" fill="none" />;
}

/** Schleife: zwei Schlaufen, zwei Enden, Knoten – gefüllt oder als Linie */
function Bow({ x, y, s, color, outline = false }: { x: number; y: number; s: number; color: string; outline?: boolean }) {
  const paint = outline ? { fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinejoin: 'round' as const } : { fill: color };
  return (
    <g {...paint}>
      <path d={`M${x},${y}C${f(x - s * 1.5)},${f(y - s * 1.2)} ${f(x - s * 1.7)},${f(y + s * 0.6)} ${x},${y}Z`} />
      <path d={`M${x},${y}C${f(x + s * 1.5)},${f(y - s * 1.2)} ${f(x + s * 1.7)},${f(y + s * 0.6)} ${x},${y}Z`} />
      <path d={`M${x},${y}L${f(x - s * 0.8)},${f(y + s * 1.4)}L${f(x - s * 0.35)},${f(y + s * 1.3)}Z`} />
      <path d={`M${x},${y}L${f(x + s * 0.8)},${f(y + s * 1.4)}L${f(x + s * 0.35)},${f(y + s * 1.3)}Z`} />
      <circle cx={x} cy={y} r={s * 0.3} />
    </g>
  );
}

/** Christbaumkugel am Faden – mit Bändern oder vielen feinen Linien, auf Wunsch mit Stern */
function Ornament({ id, x, y, r, color, band, star, lines = false }: {
  id: string; x: number; y: number; r: number; color: string; band: string; star?: string; lines?: boolean;
}) {
  const bands = lines
    ? Array.from({ length: 7 }, (_, i) => <rect key={i} x={x - r} y={y - r + 2 + i * ((2 * r) / 7)} width={2 * r} height={1.2} />)
    : [<rect key="a" x={x - r} y={y - r * 0.5} width={2 * r} height={r * 0.24} />, <rect key="b" x={x - r} y={y + r * 0.26} width={2 * r} height={r * 0.24} />];
  return (
    <g>
      <line x1={x} y1={0} x2={x} y2={y - r - 3} stroke={band} strokeWidth={1} />
      <rect x={x - 3} y={y - r - 4} width={6} height={4.5} rx={1} fill={band} />
      <clipPath id={id}><circle cx={x} cy={y} r={r} /></clipPath>
      <circle cx={x} cy={y} r={r} fill={color} />
      <g clipPath={`url(#${id})`} fill={band}>{bands}</g>
      {star && <Star x={x} y={y} r={r * 0.42} fill={star} />}
    </g>
  );
}

/** Streifen über die ganze Fläche (schräg: 45, waagerecht: 90) */
function Stripes({ id, color, angle = 45, w = 3, gap = 5 }: { id: string; color: string; angle?: number; w?: number; gap?: number }) {
  return (
    <>
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width={w + gap} height={w + gap} patternTransform={`rotate(${angle})`}>
          <rect width={w} height={w + gap} fill={color} />
        </pattern>
      </defs>
      <rect width={W} height={H} fill={`url(#${id})`} />
    </>
  );
}

/** Geschenkband: senkrecht und waagerecht, mit feiner Kante */
const Ribbon = ({ x, y, w, color, edge }: { x: number; y: number; w: number; color: string; edge?: string }) => (
  <g>
    {edge && <rect x={x - 1.2} width={w + 2.4} height={H} fill={edge} />}
    {edge && <rect y={y - 1.2} width={W} height={w + 2.4} fill={edge} />}
    <rect x={x} width={w} height={H} fill={color} />
    <rect y={y} width={W} height={w} fill={color} />
  </g>
);

/** zwei spitze Stechpalmenblätter, schräg nach oben, mit Mittelrippe und drei Beeren */
const Holly = ({ x, y }: { x: number; y: number }) => {
  const leaf = 'M0,0 C-4,-7 -12,-10 -20,-8 C-15,-4 -9,2 0,0Z';
  return (
    <g>
      {[[-1, -12], [1, 12]].map(([flip, rot]) => (
        <g key={flip} transform={`translate(${x} ${y}) scale(${flip} 1) rotate(${rot * flip})`}>
          <path d={leaf} fill={C.green} />
          <path d="M-1,-1 C-7,-5 -12,-7 -17,-7" stroke={C.lime} strokeWidth={0.9} fill="none" strokeLinecap="round" />
        </g>
      ))}
      <circle cx={x - 2.6} cy={y + 1.8} r={2.7} fill={C.red} />
      <circle cx={x + 2.6} cy={y + 1.8} r={2.7} fill={C.red} />
      <circle cx={x} cy={y - 1.8} r={2.7} fill={C.red} />
    </g>
  );
};

type NumAt = 'big' | 'tl' | 'tr' | 'bl' | 'br';
interface Design {
  bg: string;
  /** Farbe der Zahl; halo = Kontur, damit sie auf hellem Grund lesbar bleibt */
  ink: string;
  halo?: string;
  num: NumAt;
  /** Höhe der großen Zahl (Mitte), falls oben ein Motiv sitzt */
  bigY?: number;
  art: (id: string) => ReactNode;
}

const trees = (fill: string, pts: [number, number][], s = 6) => pts.map(([x, y], i) => <Tree key={i} x={x} y={y} s={s} fill={fill} />);
const stars = (fill: string, pts: [number, number, number][]) => pts.map(([x, y, r], i) => <Star key={i} x={x} y={y} r={r} fill={fill} />);

/** 24 Türchen – jedes anders, Nachbarn in anderen Farben */
const DESIGNS: Design[] = [
  { bg: C.lime, ink: C.white, halo: C.green, num: 'tr', art: () => trees(C.green, [[12, 18], [28, 28], [47, 36], [14, 46], [33, 52], [50, 62], [12, 68], [31, 74]]) },
  { bg: C.green, ink: C.white, num: 'big', bigY: 38, art: () => <><rect y={60} width={W} height={5} fill={C.lime} /><rect y={68} width={W} height={2} fill={C.white} /></> },
  { bg: C.rose, ink: C.white, halo: C.red, num: 'tl', art: (id) => <><Stripes id={id} color={C.pink} /><rect y={34} width={W} height={13} fill={C.red} /><rect y={49} width={W} height={2} fill={C.white} /></> },
  { bg: C.red, ink: C.white, num: 'bl', art: () => <Snowflake x={30} y={34} r={19} stroke={C.white} w={3.2} /> },
  { bg: C.brown, ink: C.white, num: 'big', bigY: 54, art: () => <Bow x={30} y={20} s={12} color={C.pink} /> },
  { bg: C.green, ink: C.white, num: 'br', art: () => <Ribbon x={38} y={44} w={4} color={C.lime} edge={C.white} /> },
  { bg: C.rose, ink: C.white, halo: C.red, num: 'tl', art: (id) => <Ornament id={id} x={30} y={46} r={15} color={C.green} band={C.white} /> },
  { bg: C.red, ink: C.white, num: 'bl', art: (id) => (
    <>
      <defs><pattern id={id} patternUnits="userSpaceOnUse" width={12} height={12}><circle cx={3} cy={3} r={2.8} fill={C.rose} /><circle cx={9} cy={9} r={2.8} fill={C.rose} /></pattern></defs>
      <rect width={W} height={H} fill={`url(#${id})`} />
    </>
  ) },
  { bg: C.lime, ink: C.white, halo: C.brown, num: 'br', art: () => <><Ribbon x={28} y={36} w={3} color={C.brown} /><Bow x={29.5} y={37.5} s={7} color={C.brown} outline /></> },
  { bg: C.brown, ink: C.white, num: 'big', art: () => <><rect y={66} width={W} height={1.5} fill={C.cream} /><rect y={70} width={W} height={1.5} fill={C.cream} /></> },
  { bg: C.green, ink: C.white, num: 'tl', art: () => stars(C.lime, [[40, 14, 4], [14, 30, 4.5], [44, 34, 3.5], [26, 46, 4], [10, 58, 3.5], [46, 58, 4.5], [28, 70, 3.5]]) },
  { bg: C.rose, ink: C.white, halo: C.red, num: 'tr', art: (id) => <><Stripes id={id} color={C.pink} angle={90} w={2} gap={4} /><polygon points="30,24 12,66 48,66" fill={C.white} /></> },
  { bg: C.green, ink: C.white, num: 'br', art: (id) => (
    <>
      <clipPath id={id}><path d="M10 72L16 58 7 52 18 46 13 35 26 33 25 21 36 25 41 11 47 26 50 41 41 45 46 56 35 57 33 67 22 63z" /></clipPath>
      <path d="M10 72L16 58 7 52 18 46 13 35 26 33 25 21 36 25 41 11 47 26 50 41 41 45 46 56 35 57 33 67 22 63z" fill={C.lime} />
      <g clipPath={`url(#${id})`} fill={C.green}>{Array.from({ length: 9 }, (_, i) => <rect key={i} x={-10} y={14 + i * 7} width={80} height={2} transform={`rotate(-30 30 40)`} />)}</g>
    </>
  ) },
  { bg: C.cream, ink: C.red, num: 'tr', art: () => <Ribbon x={14} y={30} w={7} color={C.rose} edge={C.white} /> },
  { bg: C.red, ink: C.white, num: 'big', bigY: 48, art: () => <><rect y={12} width={W} height={3} fill={C.white} /><rect y={18} width={W} height={3} fill={C.white} /></> },
  { bg: C.lime, ink: C.white, halo: C.green, num: 'tl', art: (id) => <><Stripes id={id} color={C.green} angle={-45} w={3} gap={6} /><polygon points="30,26 12,72 48,72" fill={C.green} /></> },
  { bg: C.rose, ink: C.white, halo: C.red, num: 'br', art: (id) => <Ornament id={id} x={30} y={40} r={17} color={C.red} band={C.white} star={C.brown} lines /> },
  { bg: C.brown, ink: C.white, num: 'tr', art: () => (
    <>
      <Snowflake x={16} y={26} r={7} stroke={C.red} w={1.6} />
      <Snowflake x={42} y={38} r={9} stroke={C.lime} w={1.8} />
      <Snowflake x={18} y={56} r={8} stroke={C.lime} w={1.6} />
      <Snowflake x={44} y={66} r={6} stroke={C.red} w={1.5} />
    </>
  ) },
  { bg: C.red, ink: C.white, num: 'big', bigY: 54, art: () => <Bow x={30} y={20} s={12} color={C.lime} /> },
  { bg: C.brown, ink: C.white, num: 'tr', art: () => (
    <g fill={C.lime}>
      <polygon points="4,44 16,22 28,44" /><polygon points="30,74 44,48 58,74" /><polygon points="2,80 14,58 26,80" />
    </g>
  ) },
  { bg: C.red, ink: C.white, num: 'bl', art: (id) => <Ornament id={id} x={30} y={40} r={16} color={C.rose} band={C.white} star={C.white} /> },
  { bg: C.rose, ink: C.white, halo: C.red, num: 'br', art: () => <Ribbon x={18} y={50} w={6} color={C.green} edge={C.white} /> },
  { bg: C.red, ink: C.white, num: 'br', art: (id) => (
    <>
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width={20} height={26}>
          <polygon points="10,0 20,13 10,26 0,13" fill={C.rose} />
          <path d="M0,0L20,26M20,0L0,26" stroke={C.brown} strokeWidth={0.8} />
        </pattern>
      </defs>
      <rect width={W} height={H} fill={`url(#${id})`} />
    </>
  ) },
  { bg: C.lime, ink: C.green, num: 'big', bigY: 52, art: () => <Holly x={30} y={20} /> },
];

/** Große Zahl mit Innenlinie: dicke Zahl in der Schriftfarbe, darauf eine feine Linie im Grund */
function BigNumber({ n, ink, bg, y }: { n: number; ink: string; bg: string; y: number }) {
  const text = { x: W / 2, y, textAnchor: 'middle' as const, dominantBaseline: 'central' as const, fontSize: n > 9 ? 30 : 36, fontWeight: 700, fontFamily: FONT };
  return (
    <g>
      <text {...text} fill={ink} stroke={ink} strokeWidth={5} strokeLinejoin="round">{n}</text>
      <text {...text} fill="none" stroke={bg} strokeWidth={1.5} strokeLinejoin="round">{n}</text>
    </g>
  );
}

function CornerNumber({ n, at, ink, halo }: { n: number; at: Exclude<NumAt, 'big'>; ink: string; halo?: string }) {
  const left = at.endsWith('l');
  return (
    <text x={left ? 5 : W - 5} y={at.startsWith('t') ? 14 : 71} textAnchor={left ? 'start' : 'end'} fontSize={13} fontWeight={700} fontFamily={FONT}
      fill={ink} stroke={halo ?? 'none'} strokeWidth={halo ? 2.6 : 0} strokeLinejoin="round" paintOrder="stroke">
      {n}
    </text>
  );
}

export function AdventDoorArt({ day }: { day: number }) {
  const d = DESIGNS[(day - 1) % DESIGNS.length];
  const id = `advent-art-${day}`;
  return (
    <svg className="advent-door__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width={W} height={H} fill={d.bg} />
      {d.art(id)}
      {d.num === 'big' ? <BigNumber n={day} ink={d.ink} bg={d.bg} y={d.bigY ?? 42} /> : <CornerNumber n={day} at={d.num} ink={d.ink} halo={d.halo} />}
    </svg>
  );
}
