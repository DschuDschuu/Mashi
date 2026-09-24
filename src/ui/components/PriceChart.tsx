import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { displayPrice, displayUnit, type PricePoint } from '../../domain/priceHistory';
import { euro } from '../format';

const W = 320;
const H = 132;
const PAD = { left: 46, right: 14, top: 14, bottom: 24 };

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

/**
 * Preisverlauf eines Artikels als Linie über die Zeit. Eine Linie (kein Legendenkasten – der
 * Titel sagt, was es ist), 2px, Punkte mit weißem Ring. Tippen/Zeigen rastet am nächsten
 * Einkauf ein und zeigt Datum + Preis; Pfeiltasten gehen von Einkauf zu Einkauf.
 */
export function PriceChart({ points, unit, label }: { points: PricePoint[]; unit: 'g' | 'Stück'; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const values = points.map((p) => displayPrice(p.perUnit, unit));
  const times = points.map((p) => new Date(p.date).getTime());

  // Wertebereich mit etwas Luft; bei gleichbleibendem Preis ±5 %, damit die Linie mittig liegt
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = hi === lo ? hi * 0.05 || 0.5 : (hi - lo) * 0.15;
  lo -= pad;
  hi += pad;
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const x = (t: number) => PAD.left + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const pts = points.map((_, i) => [x(times[i]), y(values[i])] as const);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const base = H - PAD.bottom;
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`;

  const nearest = (clientX: number, rect: DOMRect) => {
    const vx = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    pts.forEach(([px], i) => { if (Math.abs(px - vx) < Math.abs(pts[best][0] - vx)) best = i; });
    return best;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cur = active ?? points.length - 1;
    setActive(Math.max(0, Math.min(points.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))));
  };

  const money = (v: number) => `${euro(v)}/${displayUnit(unit)}`;
  const tip = active === null ? null : { px: pts[active][0], py: pts[active][1], text: `${shortDate(points[active].date)} · ${money(values[active])}` };
  const tipW = tip ? tip.text.length * 5.6 + 14 : 0;
  const tipX = tip ? Math.min(Math.max(tip.px - tipW / 2, 2), W - tipW - 2) : 0;

  return (
    <svg className="price-chart" viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0}
      aria-label={`${label}: Preisverlauf von ${shortDate(points[0].date)} bis ${shortDate(points[points.length - 1].date)}, zuletzt ${money(values[values.length - 1])}`}
      onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
      onKeyDown={onKey} onBlur={() => setActive(null)}>
      {/* Gitter: nur Höchst- und Tiefstwert, haarfein */}
      {[hi - pad, lo + pad].map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="price-chart__grid" />
          <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" className="price-chart__axis">{euro(v)}</text>
        </g>
      ))}
      <text x={PAD.left} y={H - 6} className="price-chart__axis">{shortDate(points[0].date)}</text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end" className="price-chart__axis">{shortDate(points[points.length - 1].date)}</text>

      <path d={area} className="price-chart__area" />
      <path d={line} className="price-chart__line" />
      {pts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r={i === active ? 5 : 4} className={`price-chart__dot${i === active ? ' is-on' : ''}`} />
      ))}

      {tip && (
        <g className="price-chart__tip" aria-hidden="true">
          <line x1={tip.px} x2={tip.px} y1={PAD.top - 4} y2={base} className="price-chart__cross" />
          <rect x={tipX} y={0} width={tipW} height={16} rx={8} />
          <text x={tipX + tipW / 2} y={11.5} textAnchor="middle">{tip.text}</text>
        </g>
      )}
    </svg>
  );
}
