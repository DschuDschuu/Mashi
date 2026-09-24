import { useState, type FormEvent } from 'react';
import { connect, DEFAULT_DB_URL, startDemo } from '../../data/backend';
import { normalizeDbUrl } from '../../data/sync';
import { Icon } from '../components/Icon';

/** Erster Start auf einem Gerät: mit deinem Mashi-Server verbinden – oder die Demo ansehen. */
export function ConnectScreen() {
  const [url, setUrl] = useState(DEFAULT_DB_URL);
  const [showUrl, setShowUrl] = useState(!DEFAULT_DB_URL);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !username.trim() || !password) return setError('Bitte alle Felder ausfüllen.');
    setBusy(true);
    setError(null);
    let normalized: string;
    try {
      normalized = normalizeDbUrl(url);
    } catch {
      setBusy(false);
      return setError('Das ist keine gültige Adresse.');
    }
    const err = await connect({ url: normalized, username: username.trim(), password });
    if (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <main className="screen connect">
      <header className="home-head">
        <h1 className="logo">Mashi</h1>
        <Icon name="heart" size={18} className="logo-heart" />
        <Icon name="sparkles" size={20} className="home-head__spark home-head__spark--a" />
        <Icon name="sparkles" size={14} className="home-head__spark home-head__spark--b" />
      </header>
      <p className="connect__lead">Deine Rezepte liegen auf deinem eigenen Server – und sind auf all deinen Geräten gleich.</p>

      <form className="panel" onSubmit={submit} noValidate>
        {showUrl ? (
          <label className="field"><span>Adresse deiner Mashi-Datenbank</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mashi-db.<server-ip>.sslip.io/mashi" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </label>
        ) : (
          <button type="button" className="link link--muted" onClick={() => setShowUrl(true)}>Server: {DEFAULT_DB_URL.replace(/^https?:\/\//, '')} · ändern</button>
        )}
        <label className="field"><span>Benutzername</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </label>
        <label className="field"><span>Passwort</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={busy}>
          {busy ? 'Verbinde …' : 'Verbinden'}
        </button>
      </form>

      <div className="tip tint-sky">
        <Icon name="info" size={20} />
        <p>Nach dem Verbinden liegt eine Kopie deiner Rezepte auf diesem Gerät. So kannst du auch ohne Internet kochen – Änderungen gleichen sich automatisch ab, sobald du wieder online bist.</p>
      </div>

      <button className="link link--muted center" onClick={startDemo}>
        Erst mal ohne Server ausprobieren (Beispieldaten, nur auf diesem Gerät)
      </button>
    </main>
  );
}
