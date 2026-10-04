import { useConfirm } from '../confirm';
import { useSheet } from '../useSheet';

/** Die Nachfrage aus ask() – ein Blatt von unten, wie „Was ist übrig?“. Daneben tippen oder Escape = „nein“. */
export function ConfirmSheet() {
  const req = useConfirm();
  if (!req) return null;
  return <Sheet key={req.title} />;
}

function Sheet() {
  const req = useConfirm()!;
  const no = () => req.resolve(null);
  const ref = useSheet(no);
  return (
    <div className="sheet-backdrop confirm-backdrop" onClick={no}>
      <div className="sheet confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={req.text ? 'confirm-text' : undefined}
        onClick={(e) => e.stopPropagation()} ref={ref}>
        <div className="sheet__grip" />
        <h2 className="sheet__title" id="confirm-title">{req.title}</h2>
        {req.text && <p className="small muted" id="confirm-text">{req.text}</p>}
        {/* „nein“ steht im Code zuerst: der Fokus landet dort – ein versehentliches Enter löscht nichts.
            Angezeigt wird der Knopf, der es tut, oben (column-reverse). */}
        {req.choices ? (
          // Auswahl (choose): je Möglichkeit ein Knopf, „Abbrechen“ zuletzt
          <div className="confirm__choices">
            {req.choices.map((c) => (
              <button key={c.value} type="button" className="btn btn--soft btn--block" onClick={() => req.resolve(c.value)}>{c.label}</button>
            ))}
            <button type="button" className="btn btn--ghost btn--block" onClick={no}>{req.cancel ?? 'Abbrechen'}</button>
          </div>
        ) : (
          <div className="confirm__actions">
            <button type="button" className="btn btn--ghost" onClick={no}>{req.cancel ?? 'Abbrechen'}</button>
            <button type="button" className={`btn ${req.danger ? 'btn--danger' : 'btn--primary'}`} onClick={() => req.resolve('ja')}>{req.confirm}</button>
          </div>
        )}
      </div>
    </div>
  );
}
