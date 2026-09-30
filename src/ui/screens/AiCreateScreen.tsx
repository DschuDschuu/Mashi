import { useState } from 'react';
import { currentMode } from '../../data/connection';
import { createRecipe, usePantry } from '../../data/store';
import { basicsOf } from '../../domain/mealplan';
import { isPrepared } from '../../domain/pantry';
import { navigate } from '../../router';
import { recipeAi } from '../../services';
import { KiError } from '../../services/ai/serverAi';
import { useUseUp } from '../useUseUp';
import { ChipSelect, DevicePicker, Stepper, Switch } from '../components/Controls';
import { LineArt } from '../components/RecipeImage';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';

const WISHES = ['Proteinreich', 'Vegetarisch', 'Low Calorie', 'Koreanisch', 'Meal Prep', 'Comfort Food'];
const TIMES = [15, 20, 30, 45];

/** erste Zeile der Vorlieben als Hinweis am Schalter – „…“, wenn mehr dasteht */
function tastesPreview(t: string): string {
  const first = t.split('\n')[0];
  const short = first.slice(0, 80);
  return short + (short.length < t.trim().length ? ' …' : '');
}

export function AiCreateScreen({ initialPrompt = '' }: { initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  // null = nicht angefasst → Portionen aus dem Freitext („für drei Personen“) haben Vorrang
  const [servings, setServings] = useState<number | null>(null);
  const [devices, setDevices] = useState<string[]>([]);
  const [wishes, setWishes] = useState<string[]>([]);
  const [time, setTime] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Echte KI: deinen Vorrat als „gern nutzen“ mitschicken (Beispiel-KI im Demo-Modus kann damit nichts anfangen)
  const real = currentMode() === 'sync';
  const [withPantry, setWithPantry] = useState(true);
  const [withTastes, setWithTastes] = useState(true);
  const pantry = usePantry();
  const { rest } = useUseUp();

  const canGenerate = prompt.trim().length > 0 || wishes.length > 0 || devices.length > 0;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const draft = await recipeAi.generateRecipe({
        prompt, servings: servings ?? undefined, devices, wishes, maxMinutes: time[0] ? Number(time[0]) : undefined,
        // frei (nach dem Plan), ohne Vorgekochtes – das ist ein Gericht, keine Zutat
        ...(real ? {
          kitchen: {
            ...(withPantry ? { pantry: rest.items.filter((i) => !isPrepared(i)).map((i) => i.name), basics: [...basicsOf(pantry)] } : {}),
            ...(withTastes && pantry.tastes ? { tastes: pantry.tastes } : {}),
          },
        } : {}),
      });
      // Landet als KI-Idee – nicht im Kochbuch. Der Nutzer entscheidet auf der Detailseite.
      const id = createRecipe(draft, { source: 'ki', status: 'ki_entwurf' });
      navigate(`/rezept/${id}`, { replace: true });
    } catch (e) {
      // vom Server: verständliche Meldung (Limit, ausgelastet, nicht verbunden …)
      setError(e instanceof KiError ? e.message : 'Das hat gerade nicht geklappt. Versuch es bitte noch einmal.');
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <main className="screen screen--center">
        <div className="thinking">
          <LineArt motif="bowl" />
          <p className="handwritten">Aus deinen Zutaten wird ein Rezept …</p>
          <p className="muted small">Das Bild entsteht gleich danach.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar title="Rezept mit KI erstellen" confirmBack={servings || devices.length || wishes.length || time.length ? 'Verwerfen? Deine Auswahl geht verloren.' : undefined} />

      <label className="field">
        <span className="field__label-lg">Beschreibe deine Zutaten oder deinen Wunsch</span>
        <textarea
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="z. B. Ich habe Hähnchenhack, Paprika, Avocado und Reis. Gerne etwas Koreanisches, proteinreich und nicht zu aufwendig."
        />
      </label>

      <div className="panel">
        <div className="row-between">
          <span>Portionen</span>
          <Stepper value={servings ?? 2} onChange={setServings} max={12} label="Portionen" />
        </div>
        <h3 className="small muted">Gerät (optional)</h3>
        <DevicePicker selected={devices} onChange={setDevices} />
        <h3 className="small muted">Zeit</h3>
        <ChipSelect single options={TIMES.map((t) => ({ value: String(t), label: `≤ ${t} Min.` }))} selected={time} onChange={setTime} />
        <h3 className="small muted">Wünsche</h3>
        <ChipSelect options={WISHES.map((w) => ({ value: w, label: w }))} selected={wishes} onChange={setWishes} />
        {real && (
          <Switch checked={withPantry} onChange={setWithPantry} label="Meinen Vorrat einbeziehen"
            hint="Die KI nutzt gern, was du schon hast – dann musst du weniger einkaufen." />
        )}
        {real && (pantry.tastes ? (
          <Switch checked={withTastes} onChange={setWithTastes} label="Meine Vorlieben einbeziehen"
            hint={tastesPreview(pantry.tastes)} />
        ) : (
          <button type="button" className="link small" onClick={() => navigate('/mehr')}>Vorlieben für die KI festlegen (Einstellungen)</button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      <button className="btn btn--primary btn--block btn--lg" disabled={!canGenerate} onClick={generate}>
        <Icon name="sparkles" size={20} /> Rezeptidee generieren
      </button>

      <div className="tip tint-sky">
        <Icon name="bulb" size={20} />
        <p><strong>Tipp:</strong> Je genauer du Zutaten und Vorlieben beschreibst, desto besser passt die Idee. Nährwerte berechnet Mashi anschließend selbst aus den Zutaten.</p>
      </div>

      <div className="ai-art" aria-hidden="true">
        <LineArt motif="bowl" />
        <p className="handwritten">Aus deinen Zutaten wird ein Rezept – mit Bild!</p>
      </div>
    </main>
  );
}
