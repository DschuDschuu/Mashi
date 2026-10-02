import { useState, type PointerEvent } from 'react';
import { displayPrice, displayUnit, type PricePoint } from '../../domain/priceHistory';
import { euro } from '../format';

const W = 320;
const H = 150;
const PAD = { left: 46, right: 14, top: 22, bottom: 24 };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

export interface PriceSeries { id: string; label: string; color: string; points: PricePoint[] }

/**
 * Preisverlauf mehrerer Sorten in EINEM Diagramm (Julia: je Sorte eine Farbe, per Chip ein- und ausblendbar –
 * die Chips stehen darüber, hier nur die sichtbaren Linien). Tippen rastet am nächsten Einkauf ein.
 */
export function PriceLines({ series, unit, label }: { series: PriceSeries[]; unit: 'g' | 'Stück'; label: string }) {
  const [active, setActive] = useState<{ s: number; i: number } | null>(null);
  const all = series.flatMap((s) => s.points);
  if (!all.length) return null;
  const values = all.map((p) => displayPrice(p.perUnit, unit));
  const times = all.map((p) => new Date(p.date).getTime());
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = hi === lo ? hi * 0.05 || 0.5 : (hi - lo) * 0.15;
  lo -= pad;
  hi += pad;
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const x = (iso: string) => PAD.left + (t1 === t0 ? 0.5 : (new Date(iso).getTime() - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (p: PricePoint) => PAD.top + (1 - (displayPrice(p.perUnit, unit) - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const money = (p: PricePoint) => `${euro(displayPrice(p.perUnit, unit))}/${displayUnit(unit)}`;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    const vy = ((e.clientY - r.top) / r.height) * H;
    let best: { s: number; i: number; d: number } | null = null;
    series.forEach((s, si) => s.points.forEach((p, i) => {
      const d = Math.abs(x(p.date) - vx) + Math.abs(y(p) - vy) * 0.5;
      if (!best || d < best.d) best = { s: si, i, d };
    }));
    if (best) setActive({ s: (best as { s: number }).s, i: (best as { i: number }).i });
  };
  const tip = active && series[active.s]?.points[active.i] ? (() => {
    const s = series[active.s];
    const p = s.points[active.i];
    const text = `${shortDate(p.date)} · ${money(p)}${series.length > 1 ? ` · ${s.label}` : ''}`;
    const w = text.length * 5.4 + 14;
    return { px: x(p.date), text, w, left: Math.min(Math.max(x(p.date) - w / 2, 2), W - w - 2) };
  })() : null;

  return (
    <svg className="price-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${label}: Preisverlauf ${series.map((s) => `${s.label} zuletzt ${money(s.points[s.points.length - 1])}`).join(', ')}`}
      onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}>
      {[hi - pad, lo + pad].map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)} y2={PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)} className="price-chart__grid" />
          <text x={PAD.left - 6} y={PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom) + 3.5} textAnchor="end" className="price-chart__axis">{euro(v)}</text>
        </g>
      ))}
      <text x={PAD.left} y={H - 6} className="price-chart__axis">{shortDate(new Date(t0).toISOString())}</text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end" className="price-chart__axis">{shortDate(new Date(t1).toISOString())}</text>
      {series.map((s, si) => (
        <g key={s.id}>
          {s.points.length > 1 && (
            <path d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p).toFixed(1)}`).join(' ')}
              fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {s.points.map((p, i) => (
            <circle key={i} cx={x(p.date)} cy={y(p)} r={active?.s === si && active.i === i ? 5 : 4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
          ))}
        </g>
      ))}
      {tip && (
        <g className="price-chart__tip" aria-hidden="true">
          <line x1={tip.px} x2={tip.px} y1={PAD.top - 4} y2={H - PAD.bottom} className="price-chart__cross" />
          <rect x={tip.left} y={0} width={tip.w} height={16} rx={8} />
          <text x={tip.left + tip.w / 2} y={11.5} textAnchor="middle">{tip.text}</text>
        </g>
      )}
    </svg>
  );
}
