import type { ReactNode } from 'react';
import { goBack } from '../../router';
import { Icon } from './Icon';

/** @param confirmBack Frage vor dem Zurückgehen, z. B. wenn sonst Eingaben verloren gingen */
export function TopBar({ title, back = true, backTo = '/', right, confirmBack }: { title?: ReactNode; back?: boolean; backTo?: string; right?: ReactNode; confirmBack?: string }) {
  return (
    <header className="topbar">
      {back ? (
        <button className="iconbtn" onClick={() => (!confirmBack || confirm(confirmBack)) && goBack(backTo)} aria-label="Zurück">
          <Icon name="back" />
        </button>
      ) : <span className="iconbtn-spacer" />}
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__right">{right ?? <span className="iconbtn-spacer" />}</div>
    </header>
  );
}
