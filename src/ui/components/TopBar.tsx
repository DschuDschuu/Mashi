import type { ReactNode } from 'react';
import { goBack } from '../../router';
import { Icon } from './Icon';

export function TopBar({ title, back = true, backTo = '/', right }: { title?: ReactNode; back?: boolean; backTo?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      {back ? (
        <button className="iconbtn" onClick={() => goBack(backTo)} aria-label="Zurück">
          <Icon name="back" />
        </button>
      ) : <span className="iconbtn-spacer" />}
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__right">{right ?? <span className="iconbtn-spacer" />}</div>
    </header>
  );
}
