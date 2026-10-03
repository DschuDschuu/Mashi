import { useEffect, useRef, useState } from 'react';
import { currentMode } from '../../data/connection';
import { createRecipe, deleteRecipe, useMacroGoal, usePantry, useRecipes } from '../../data/store';
import { basicsOf } from '../../domain/mealplan';
import { isPrepared } from '../../domain/pantry';
import { currentContent } from '../../domain/recipe';
import { navigate } from '../../router';
import { recipeAi } from '../../services';
import { KiError } from '../../services/ai/serverAi';
import { useUseUp } from '../useUseUp';
import { clearAgain, peekAgain, rememberForm, type KiForm } from '../kiAgain';
import { ChipSelect, DevicePicker, Stepper, Switch } from '../components/Controls';
import { LineArt } from '../components/RecipeImage';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';

const WISHES = ['Proteinreich', 'Vegetarisch', 'Low Calorie', 'Koreanisch', 'Meal Prep', 'Comfort Food'];
const TIMES = [15, 20, 30, 45];
/** so viele der letzten KI-Ideen gehen als „bitte etwas anderes“ mit */
const RECENT = 6;

/** erste Zeile der Vorlieben als Hinweis am Schalter – „…“, wenn mehr dasteht */
function tastesPreview(t: string): string {
  const first = t.split('\n')[0];
  const short = first.slice(0, 80);
  return short + (short.length < t.trim().length ? ' …' : '');
}

export function AiCreateScreen({ initialPrompt = '' }: { initialPrompt?: string }) {
  // „Neu überlegen“ / „Auftrag anpassen“: der Auftrag der alten Idee (nur gelesen – gelöscht wird im Effekt)
  const [again] = useState(peekAgain);
  const start = again?.form;
  const [prompt, setPrompt] = useState(start?.prompt ?? initialPrompt);
  // null = nicht angefasst → Portionen aus dem Freitext („für drei Personen“) haben Vorrang
  const [servings, setServings] = useState<number | null>(start?.servings ?? null);
  const [devices, setDevices] = useState<string[]>(start?.devices ?? []);
  const [wishes, setWishes] = useState<string[]>(start?.wishes ?? []);
  const [time, setTime] = useState<string[]>(start?.time ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Echte KI: deinen Vorrat als „gern nutzen“ mitschicken (Beispiel-KI im Demo-Modus kann damit nichts anfangen)
  const real = currentMode() === 'sync';
  const [withPantry, setWithPantry] = useState(start?.withPantry ?? true);
  const [withTastes, setWithTastes] = useState(start?.withTastes ?? true);
  // Makro-Ziel aus den Einstellungen mitschicken (Julia) – standardmäßig an
  const [withMacros, setWithMacros] = useState(start?.withMacros ?? true);
  const goal = useMacroGoal();
  const pantry = usePantry();
  const recipes = useRecipes();
  const { rest } = useUseUp();

  // „Überrasch mich“ (Julia): der Knopf geht immer – auch nur mit Zeit, nur mit Chips oder ganz leer
  const empty = !prompt.trim() && !wishes.length && !devices.length && !time.length;

  const generate = async () => {
    setBusy(true);
    setError(null);
    const form: KiForm = { prompt, servings, devices, wishes, time, withPantry, withTastes, withMacros };
    // die letzten Ideen (auch die, die gerade ersetzt wird) – damit die KI sich nicht wiederholt
    const recent = recipes
      .filter((r) => r.source === 'ki')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, RECENT)
      .map((r) => currentContent(r).title);
    try {
      const draft = await recipeAi.generateRecipe({
        prompt, servings: servings ?? undefined, devices, wishes, maxMinutes: time[0] ? Number(time[0]) : undefined,
        recent,
        // frei (nach dem Plan), ohne Vorgekochtes – das ist ein Gericht, keine Zutat
        ...(real ? {
          kitchen: {
            ...(withPantry ? { pantry: rest.items.filter((i) => !isPrepared(i)).map((i) => i.name), basics: [...basicsOf(pantry)] } : {}),
            ...(withTastes && pantry.tastes ? { tastes: pantry.tastes } : {}),
            ...(withMacros ? { macros: goal } : {}),
          },
        } : {}),
      });
      // Landet als KI-Idee – nicht im Kochbuch. Der Nutzer entscheidet auf der Detailseite.
      const id = createRecipe(draft, { source: 'ki', status: 'ki_entwurf' });
      rememberForm(id, form);
      // „Neu überlegen“ / „Auftrag anpassen“: die alte Idee wird ersetzt (Julia)
      if (again?.replaces && recipes.some((r) => r.id === again.replaces && r.status === 'ki_entwurf')) deleteRecipe(again.replaces);
      navigate(`/rezept/${id}`, { replace: true });
    } catch (e) {
      // vom Server: verständliche Meldung (Limit, ausgelastet, nicht verbunden …) – das Formular bleibt ausgefüllt
      setError(e instanceof KiError ? e.message : 'Das hat gerade nicht geklappt. Versuch es bitte noch einmal.');
      setBusy(false);
    }
  };

  // „Neu überlegen“: gleich mit demselben Auftrag los – nur einmal (StrictMode ruft Effekte doppelt auf)
  const started = useRef(false);
  useEffect(() => {
    clearAgain();
    if (again?.auto && !started.current) {
      started.current = true;
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Öffnen
  }, []);

  if (busy) {
    return (
      <main className="screen screen--center">
        <div className="thinking">
          <LineArt motif="bowl" />
          <p className="handwritten">{again?.auto ? 'Ich überlege neu …' : 'Aus deinen Zutaten wird ein Rezept …'}</p>
          <p className="muted small">Das Bild entsteht gleich danach.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar title="Rezept mit KI erstellen" confirmBack={servings || devices.length || wishes.length || time.length ? 'Verwerfen? Deine Auswahl geht verloren.' : undefined} />

      {again && !again.auto && <p className="small muted">Dein Auftrag von eben – ändere, was du möchtest. Die neue Idee ersetzt die alte.</p>}

      <label className="field">
        <span className="field__label-lg">Beschreibe deine Zutaten oder deinen Wunsch</span>
        <textarea
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="z. B. Ich habe Hähnchenhack, Paprika, Avocado und Reis. Gerne etwas Koreanisches, proteinreich und nicht zu aufwendig. – Oder leer lassen und überraschen lassen."
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
        {real && (
          <Switch checked={withMacros} onChange={setWithMacros} label="Mein Makro-Ziel einbeziehen"
            hint={`Kohlenhydrate ${goal.carbs} % · Eiweiß ${goal.protein} % · Fett ${goal.fat} %`} />
        )}
        {real && (pantry.tastes ? (
          <Switch checked={withTastes} onChange={setWithTastes} label="Meine Vorlieben einbeziehen"
            hint={tastesPreview(pantry.tastes)} />
        ) : (
          <button type="button" className="link small" onClick={() => navigate('/mehr')}>Vorlieben für die KI festlegen (Einstellungen)</button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      <button className="btn btn--primary btn--block btn--lg" onClick={() => void generate()}>
        <Icon name="sparkles" size={20} /> {empty ? 'Überrasch mich' : 'Rezeptidee generieren'}
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
