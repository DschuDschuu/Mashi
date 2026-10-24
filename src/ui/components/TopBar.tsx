import type { ReactNode } from 'react';
import { askDiscard } from '../confirm';
import { goBack } from '../../router';
import { Icon } from './Icon';
import { PageIntro, type IntroId } from './PageIntro';

/**
 * @param confirmBack Frage vor dem Zurückgehen, z. B. wenn sonst Eingaben verloren gingen
 * @param onBack statt zur vorigen Seite: selbst zurück (z. B. „Import prüfen“ → zum eingefügten Text)
 */
export function TopBar({ title, back = true, backTo = '/', right, confirmBack, onBack, intro }: { title?: ReactNode; back?: boolean; backTo?: string; right?: ReactNode; confirmBack?: string; onBack?: () => void; intro?: IntroId }) {
  return (
    <>
      <header className="topbar">
        {back ? (
          <button className="iconbtn" onClick={async () => {
            // ungespeicherte Eingaben: im Mashi-Blatt nachfragen („Verwerfen?“ / „Weiter bearbeiten“)
            if (confirmBack && !(await askDiscard(confirmBack))) return;
            if (onBack) onBack();
            else goBack(backTo);
          }} aria-label="Zurück">
            <Icon name="back" />
          </button>
        ) : <span className="iconbtn-spacer" />}
        <h1 className="topbar__title">{title}</h1>
        <div className="topbar__right">
          {right ?? <span className="iconbtn-spacer" />}
        </div>
      </header>
      {/* Tour dieser Seite – startet beim ersten Besuch von selbst */}
      {intro && <PageIntro id={intro} />}
    </>
  );
}
