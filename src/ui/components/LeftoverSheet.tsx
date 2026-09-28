import { useState } from 'react';
import { answerLeftover, useLeftoverAsk } from '../../data/store';
import { useSheet } from '../useSheet';
import { Icon } from './Icon';

/**
 * Nach „Gekocht“: Wie viele Portionen sind übrig? Die kommen als „Vorgekocht“ in die Speisekammer –
 * mit Haltbarkeit, Erinnerung und Einfrieren. Vorgeschlagen: alles bis auf eine (die isst du gleich).
 */
export function LeftoverSheet() {
  const ask = useLeftoverAsk();
  if (!ask) return null;
  return <Sheet key={ask.recipeId} title={ask.title} servings={ask.servings} />;
}

function Sheet({ title, servings }: { title: string; servings: number }) {
  const [left, setLeft] = useState(Math.max(0, servings - 1));
  const ref = useSheet(() => answerLeftover(0));
  return (
    <div className="sheet-backdrop" onClick={() => answerLeftover(0)}>
      <div className="sheet leftover" role="dialog" aria-modal="true" aria-label="Portionen übrig" onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{title} gekocht – was ist übrig?</h2>
        <p className="small muted">Übrige Portionen kommen als „Vorgekocht“ in die Speisekammer: Mashi erinnert dich, bevor sie weg müssen, und du kannst sie einfrieren.</p>
        <div className="leftover__stepper">
          <button type="button" className="iconbtn iconbtn--box" onClick={() => setLeft(Math.max(0, left - 1))} disabled={left <= 0} aria-label="Eine Portion weniger"><Icon name="minus" size={18} /></button>
          <span className="leftover__count"><strong>{left}</strong> {left === 1 ? 'Portion' : 'Portionen'} übrig</span>
          <button type="button" className="iconbtn iconbtn--box" onClick={() => setLeft(Math.min(servings, left + 1))} disabled={left >= servings} aria-label="Eine Portion mehr"><Icon name="plus" size={18} /></button>
        </div>
        <div className="sheet__actions">
          <button type="button" className="btn btn--primary" onClick={() => answerLeftover(left)} disabled={left <= 0}>In die Speisekammer</button>
          <button type="button" className="btn btn--ghost" onClick={() => answerLeftover(0)}>Nichts übrig</button>
        </div>
      </div>
    </div>
  );
}
