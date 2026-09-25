import { useState } from 'react';
import { createRecipe } from '../../data/store';
import { navigate } from '../../router';
import { recipeAi } from '../../services';
import { ChipSelect, DevicePicker, Stepper } from '../components/Controls';
import { LineArt } from '../components/RecipeImage';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';

const WISHES = ['Proteinreich', 'Vegetarisch', 'Low Calorie', 'Koreanisch', 'Meal Prep', 'Comfort Food'];
const TIMES = [15, 20, 30, 45];

export function AiCreateScreen({ initialPrompt = '' }: { initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  // null = nicht angefasst → Portionen aus dem Freitext („für drei Personen“) haben Vorrang
  const [servings, setServings] = useState<number | null>(null);
  const [devices, setDevices] = useState<string[]>([]);
  const [wishes, setWishes] = useState<string[]>([]);
  const [time, setTime] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = prompt.trim().length > 0 || wishes.length > 0 || devices.length > 0;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const draft = await recipeAi.generateRecipe({
        prompt, servings: servings ?? undefined, devices, wishes, maxMinutes: time[0] ? Number(time[0]) : undefined,
      });
      // Landet als KI-Idee – nicht im Kochbuch. Der Nutzer entscheidet auf der Detailseite.
      const id = createRecipe(draft, { source: 'ki', status: 'ki_entwurf' });
      navigate(`/rezept/${id}`, { replace: true });
    } catch {
      setError('Das hat gerade nicht geklappt. Versuch es bitte noch einmal.');
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
      <TopBar title="Rezept mit KI erstellen" />

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
