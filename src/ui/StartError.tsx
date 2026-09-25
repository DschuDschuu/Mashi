/**
 * Wenn der Start scheitert (Speicher voll, Browser sperrt die Datenbank, beschädigte Daten):
 * eine verständliche Meldung statt einer weißen Seite. Bewusst ohne Store und Router –
 * die sind ja gerade nicht gestartet.
 */
export function StartError({ error }: { error: unknown }) {
  const quota = (error as { name?: string })?.name === 'QuotaExceededError';
  return (
    <main className="screen screen--center">
      <div className="panel stack">
        <h1>Mashi konnte nicht starten</h1>
        <p>
          {quota
            ? 'Der Speicher dieses Geräts ist voll. Mach etwas Platz frei (z. B. alte Fotos oder Apps) und versuch es noch einmal.'
            : 'Deine Daten ließen sich gerade nicht öffnen. Das ist meist vorübergehend – z. B. wenn der Browser im privaten Modus läuft oder Mashi in einem zweiten Tab gerade aktualisiert wird.'}
        </p>
        <p className="muted small">
          Bist du mit deinem Server verbunden, liegen deine Rezepte dort sicher – auch wenn es auf diesem Gerät gerade hakt.
        </p>
        <button className="btn btn--primary" onClick={() => location.reload()}>Erneut versuchen</button>
        <details className="small muted">
          <summary>Technische Details</summary>
          <code>{String((error as Error)?.message ?? error)}</code>
        </details>
      </div>
    </main>
  );
}
