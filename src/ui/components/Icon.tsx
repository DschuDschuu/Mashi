/** Schlanke Linien-Icons (24er Raster), inline statt Icon-Bibliothek. */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  book: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  flask: 'M9 3h6 M10 3v6l-5.6 9.6A1.6 1.6 0 0 0 5.8 21h12.4a1.6 1.6 0 0 0 1.4-2.4L14 9V3 M7.5 15h9',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  dots: 'M12 5h.01 M12 12h.01 M12 19h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20.5 20.5 16 16',
  back: 'M19 12H5 M11 18l-6-6 6-6',
  close: 'M18 6 6 18 M6 6l12 12',
  heart: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 3v4 M17 5h4 M5 17v4 M3 19h4',
  pencil: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  check: 'M20 6 9 17l-5-5',
  chevron: 'M9 18l6-6-6-6',
  up: 'M18 15l-6-6-6 6',
  down: 'M6 9l6 6 6-6',
  timer: 'M10 2h4 M12 14l3-3 M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M8 5v14 M16 5v14',
  archive: 'M3 4h18v4H3z M5 8v12h14V8 M10 12h4',
  refresh: 'M3 12a9 9 0 0 1 15.4-6.4L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15.4 6.4L3 16 M3 21v-5h5',
  bulb: 'M9 18h6 M10 22h4 M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z',
  sliders: 'M4 6h16 M7 12h10 M10 18h4',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  trash: 'M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8h.01',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  grid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  image: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M4 16l5-5 4 4 3-3 4 4 M15.5 8.5h.01',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 13h6 M9 17h6',
  clipboard: 'M9 3.5h6v3H9z M9 5H6v16h12V5h-3 M9 12h6 M9 16h4',

  // Geräte
  stove: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 8h18 M7 5.5h.01 M10.5 5.5h.01 M6 14.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0z M13 14.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0z',
  oven: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 8h18 M7 5.5h.01 M10.5 5.5h.01 M14 5.5h3 M7 11h10v6H7z',
  airfryer: 'M8 3h8a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z M4 12h16 M9.5 16.5h5 M10 7.5a2 2 0 1 0 4 0 2 2 0 1 0-4 0z',
  mixer: 'M7 3h9l-1 10H8z M16 5h1.5a1.5 1.5 0 0 1 1.5 1.5v2A1.5 1.5 0 0 1 17.5 10H15.6 M5 13h14v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z M10 17h4',
  microwave: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M5.5 8.5h10v7h-10z M19 9h.01 M19 12h.01 M19 15h.01',

  // Kategorien
  cup: 'M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M16 10.5h1.5a2.5 2.5 0 0 1 0 5H15 M8 3c-.6 1 .6 2 0 3 M12 3c-.6 1 .6 2 0 3 M3 21h14',
  cloche: 'M3 18h18 M5 18a7 7 0 0 1 14 0 M12 11V9 M10.5 9h3',
  pot: 'M5 10h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z M3 10h18 M5 13H3 M19 13h2 M9.5 3.5c-.6 1 .6 2 0 3 M14.5 3.5c-.6 1 .6 2 0 3',
  leaf: 'M5 19C5 11 10 5 20 4c-.5 9.5-6 15-15 15z M5 19l8-8',
  rice: 'M3 13h18a9 9 0 0 1-18 0z M6.5 13a5.5 4.5 0 0 1 11 0 M10 20.5h4',
  cookie: 'M12 3a9 9 0 1 0 9 9 3 3 0 0 1-3.5-3A3 3 0 0 1 14 5.5 3 3 0 0 1 12 3z M8.5 10h.01 M9 15h.01 M13.5 14h.01 M12 11h.01',
  cake: 'M4 11h16v9H4z M4 15c2 1.5 4 1.5 6 0s4-1.5 6 0 3 1 4 0 M12 11V7.5 M12 4.5h.01',
  bread: 'M6 21V11.5A4 4 0 1 1 9 4h6a4 4 0 1 1 3 7.5V21z M10 12.5l-1.5 2 M14.5 12.5l-1.5 2',
  glass: 'M6 3h12l-1.6 16.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8z M6.5 8h11',
  drumstick: 'M15.4 3a5.6 5.6 0 0 1 5.6 5.6c0 3.4-3.4 6.4-6.8 6.4l-3.1 3.1a2 2 0 1 1-2.9 2.2 2 2 0 1 1-2.2-2.9L9.1 14.3C8.8 10.5 11.8 3 15.4 3z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, filled = false, className }: { name: IconName; size?: number; filled?: boolean; className?: string }) {
  const bold = name === 'more' || name === 'dots';
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={bold ? 3 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
