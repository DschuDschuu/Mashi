import { useState } from 'react';
import { DIRECTIONS } from '../../domain/craving';
import { navigate } from '../../router';
import { loadCraving } from '../cravingMemory';
import { Icon } from './Icon';

/**
 * „Worauf hast du Lust?“ (Julia: „ich klick die App an und sie fragt mich“): Textfeld + Richtungen zum Anfangen.
 * Auf der Startseite und auf der Lust-Seite, wenn Mashi mit dem Getippten nichts anfangen konnte (replace: dann kein
 * zweiter Eintrag im Verlauf).
 */
export function CravingAsk({ replace = false }: { replace?: boolean }) {
  const [text, setText] = useState('');
  // angefangen und weggeblättert (cravingMemory.ts) – mit einem Tipp zurück
  const [open] = useState(() => {
    const mem = loadCraving();
    return mem && (mem.state.direction || Object.values(mem.state.picks).some((x) => x?.length)) ? mem.q : undefined;
  });
  const go = (q: string) => {
    if (q.trim()) navigate(`/lust?q=${encodeURIComponent(q.trim())}`, { replace });
  };
  return (
    <div className="craving-ask">
      {open && (
        <button type="button" className="home-row" onClick={() => go(open)}>
          <Icon name="refresh" size={18} />
          <span><strong>Weitermachen</strong> · „{open}“</span>
          <Icon name="chevron" size={16} />
        </button>
      )}
      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); go(text); }}>
        <Icon name="search" size={18} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Taco, Hähnchen, was mit Brokkoli …"
          aria-label="Worauf hast du Lust?" enterKeyHint="go" maxLength={80} />
      </form>
      <div className="chips" role="group" aria-label="Zum Anfangen">
        {DIRECTIONS.map((d) => <button key={d.id} type="button" className="chip" onClick={() => go(d.name)}>{d.name}</button>)}
      </div>
    </div>
  );
}
