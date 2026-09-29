import { Component, type ReactNode } from 'react';
import { goBack } from '../../router';

/**
 * Fängt einen Fehler beim Zeichnen einer Seite ab. Ohne das bliebe der Bildschirm leer oder
 * eingefroren (React wirft dann alles weg) – so steht da, was passiert ist, und es geht weiter.
 * Der Fehlertext ist zum Weitergeben gedacht: Damit lässt sich die Ursache finden.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Mashi: Seite abgestürzt', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="screen crash" role="alert">
        <h1>Hier ist etwas schiefgegangen</h1>
        <p className="muted">Deine Daten sind sicher – nur diese Seite konnte nicht angezeigt werden.</p>
        <pre className="crash__detail">{error.message}</pre>
        <p className="small muted">Schick den Text oben gern weiter – damit lässt sich die Ursache finden.</p>
        <div className="row-gap">
          <button className="btn btn--primary" onClick={() => goBack('/')}>Zurück</button>
          <button className="btn btn--ghost" onClick={() => location.reload()}>Neu laden</button>
        </div>
      </main>
    );
  }
}
