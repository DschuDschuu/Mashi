import type { ReactNode } from 'react';
import { goBack } from '../../router';
import { Icon } from './Icon';

/**
 * @param confirmBack Frage vor dem Zurückgehen, z. B. wenn sonst Eingaben verloren gingen
 * @param onBack statt zur vorigen Seite: selbst zurück (z. B. „Import prüfen“ → zum eingefügten Text)
 */
export function TopBar({ title, back = true, backTo = '/', right, confirmBack, onBack }: { title?: ReactNode; back?: boolean; backTo?: string; right?: ReactNode; confirmBack?: string; onBack?: () => void }) {
  return (
    <header className="topbar">
      {back ? (
        <button className="iconbtn" onClick={() => (!confirmBack || confirm(confirmBack)) && (onBack ? onBack() : goBack(backTo))} aria-label="Zurück">
          <Icon name="back" />
        </button>
      ) : <span className="iconbtn-spacer" />}
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__right">{right ?? <span className="iconbtn-spacer" />}</div>
    </header>
  );
}
