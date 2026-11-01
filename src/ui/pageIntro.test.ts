import { describe, expect, it } from 'vitest';
import { standOf, standsFrom, stepsToShow } from './components/PageIntro';

describe('Geführte Tour: neue Schritte (Julia: „neue Schritte, auch für mich“)', () => {
  const steps = [{ title: 'a' }, { title: 'b', added: 2 }, { title: 'c' }, { title: 'd', added: 2 }];

  it('noch nie gesehen: die ganze Tour; schon gesehen: nur, was seither dazukam; alles gesehen: nichts', () => {
    expect(stepsToShow(steps, undefined).map((x) => x.title)).toEqual(['a', 'b', 'c', 'd']);
    expect(stepsToShow(steps, 1).map((x) => x.title)).toEqual(['b', 'd']);
    expect(stepsToShow(steps, 2)).toEqual([]);
    expect(standOf(steps)).toBe(2);
    expect(standOf([{}, {}])).toBe(1);
  });

  it('die alte Liste „gesehen“ zählt als Stand 1 – wer die Tour kannte, sieht nur das Neue; kaputt: wie ungesehen', () => {
    expect(standsFrom(null, '["start","woche"]')).toEqual({ start: 1, woche: 1 });
    expect(standsFrom('{"start":2}', '["start","woche"]')).toEqual({ start: 2 }); // der neue Speicher gilt
    expect(standsFrom(null, null)).toEqual({});
    expect(standsFrom('kaputt', null)).toEqual({});
    expect(standsFrom(null, '{"nicht":"liste"}')).toEqual({});
  });
});
