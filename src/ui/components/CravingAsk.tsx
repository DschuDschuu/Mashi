import { useState } from 'react';
import { DIRECTIONS, withoutGone } from '../../domain/craving';
import { navigate } from '../../router';
import { useOwnChoices } from '../cravingHooks';
import { SURPRISE, clearCraving, loadCraving, loadRecent, saveCraving, type RecentPlate } from '../cravingMemory';
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
  // „Wie letztes Mal?“ (Julia): die letzten drei Teller – ein Tipp legt ihn fertig hin, ändern geht trotzdem
  const own = useOwnChoices();
  const [recent] = useState(loadRecent);
  const again = (r: RecentPlate) => {
    saveCraving(r.title, withoutGone(r.state, own));
    go(r.title);
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
        {/* Julia: „Überrasch mich“ – jedes Mal ein frischer Wurf, darum das Gemerkte vorher weg */}
        <button type="button" className="chip" onClick={() => { clearCraving(); go(SURPRISE); }}><Icon name="dice" size={14} /> Überrasch mich</button>
      </div>
      {recent.length > 0 && (
        <div className="craving-recent">
          <span className="small muted">Wie letztes Mal?</span>
          <div className="chips" role="group" aria-label="Wie letztes Mal">
            {recent.map((r) => (
              <button key={r.title + JSON.stringify(r.state.picks)} type="button" className="chip craving-recent__chip" onClick={() => again(r)}>
                <Icon name="clock" size={14} /><span className="craving-recent__name">{r.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
