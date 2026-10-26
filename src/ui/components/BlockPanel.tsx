import { DIRECTIONS, guessKind, normDirection } from '../../domain/craving';
import { FINISH, REST, partsOf } from '../../domain/parts';
import { currentContent } from '../../domain/recipe';
import { SIDE_KINDS, sideOf, sidesOfKind, type SideKind } from '../../domain/sides';
import type { Recipe, RecipeBlock } from '../../domain/types';
import { householdOf, setBlocks, setPairs, usePlan } from '../../data/store';
import { toast } from '../toast';
import { Icon } from './Icon';

/**
 * „Auch als Baustein“ (Julia: „Knusprige Hähnchenstreifen“ soll beim Taco als Protein auftauchen): das ganze Rezept
 * oder einzelne Teile (zwei Saucen = zwei Bausteine), je mit Stufe und Richtungen. Keine Richtung = passt überall.
 * Ein Baustein kann einen festen ersetzen (meine Guacamole statt der festen). Darunter, auch ohne Baustein: „Passt gut
 * zu“ – Bausteine, die im Stepper vorn stehen, wenn dieses Rezept gewählt ist (Julia: Bolognese → Spätzle, Parmesan).
 */
export function BlockPanel({ recipe }: { recipe: Recipe }) {
  const hh = householdOf(usePlan());
  const c = currentContent(recipe);
  const parts = partsOf(c).filter((p) => p !== REST && p !== FINISH);
  const blocks = recipe.blocks ?? [];
  const on = blocks.length > 0;
  // ohne Teile heißt „das ganze Rezept“ einfach wie das Rezept
  const nameOf = (part?: string) => (part ? `„${part}“` : parts.length ? 'Ganzes Rezept' : `„${c.title}“`);

  const save = (next: RecipeBlock[], message: string) => toast(message, { label: 'Rückgängig', run: setBlocks(recipe.id, next.length ? next : undefined) });
  const change = (part: string | undefined, patch: Partial<RecipeBlock>) => blocks.map((b) => (b.part === part ? { ...b, ...patch } : b));
  const add = (part?: string): RecipeBlock => ({ ...(part ? { part } : {}), kind: guessKind(part ?? c.title), directions: [] });

  const toggleTarget = (part?: string) => {
    const has = blocks.some((b) => b.part === part);
    save(has ? blocks.filter((b) => b.part !== part) : [...blocks, add(part)], has ? `${nameOf(part)} ist kein Baustein mehr` : `${nameOf(part)} als Baustein`);
  };
  // mehrere Stufen (Julia: Bolognese ist Protein und Sauce) – die früheste ist `kind`, die übrigen `also`; eine bleibt immer
  const covers = (b: RecipeBlock) => [b.kind, ...(b.also ?? [])];
  const toggleKind = (b: RecipeBlock, kind: SideKind) => {
    const on = covers(b);
    const next = SIDE_KINDS.map((k) => k.kind).filter((k) => (k === kind ? !on.includes(k) : on.includes(k)));
    if (!next.length) return;
    const [first, ...rest] = next;
    const { also: _a, ...plain } = b;
    const label = next.map((k) => SIDE_KINDS.find((x) => x.kind === k)?.label).join(' und ');
    save(blocks.map((x) => (x.part === b.part ? { ...plain, kind: first, ...(rest.length ? { also: rest } : {}) } : x)), `${nameOf(b.part)}: ${label}`);
  };
  // alte Richtungen zählen unter ihrem neuen Namen (Wrap → Tortilla)
  const dirsOf = (b: RecipeBlock) => [...new Set(b.directions.map(normDirection))];
  const toggleDir = (b: RecipeBlock, id: string) => {
    const now = dirsOf(b);
    const dirs = now.includes(id) ? now.filter((d) => d !== id) : [...now, id];
    save(change(b.part, { directions: dirs }), dirs.length ? `${nameOf(b.part)} passt zu ${dirs.map((d) => DIRECTIONS.find((x) => x.id === d)?.name).join(', ')}` : `${nameOf(b.part)} passt überall`);
  };

  const setReplaces = (b: RecipeBlock, id: string) => {
    const { replaces: _r, ...plain } = b;
    save(blocks.map((x) => (x.part === b.part ? { ...plain, ...(id ? { replaces: id } : {}) } : x)),
      id ? `${nameOf(b.part)} statt ${sideOf(id)?.name}` : `${nameOf(b.part)} ersetzt nichts mehr`);
  };
  const pairs = recipe.pairs ?? [];
  const savePairs = (next: string[], message: string) => toast(message, { label: 'Rückgängig', run: setPairs(recipe.id, next.length ? next : undefined) });

  return (
    <section className="prep blocks" aria-labelledby="blocks-title">
      <div className="row-between">
        <h2 className="h3 blocks__title" id="blocks-title"><Icon name="grid" size={18} /> Auch als Baustein</h2>
        <button type="button" className={`chip chip--sm${on ? ' is-on' : ''}`} aria-pressed={on}
          onClick={() => save(on ? [] : [add()], on ? 'Kein Baustein mehr' : 'Als Baustein')}>{on ? 'an' : 'aus'}</button>
      </div>
      {!on && <p className="small muted blocks__hint">Dann taucht es bei „Worauf hast du Lust?“ als Stufe auf – zum Beispiel als Protein beim Taco.</p>}
      {on && parts.length > 0 && (
        <div className="blocks__row">
          <span className="small muted">Was davon?</span>
          <div className="chips" role="group" aria-label="Was davon?">
            {[undefined, ...parts].map((p) => {
              const sel = blocks.some((b) => b.part === p);
              return <button key={p ?? '-'} type="button" className={`chip chip--sm${sel ? ' is-on' : ''}`} aria-pressed={sel} onClick={() => toggleTarget(p)}>{p ? `Teil ${p}` : 'Ganzes Rezept'}</button>;
            })}
          </div>
        </div>
      )}
      {blocks.map((b) => (
        <div key={b.part ?? '-'} className="blocks__card">
          {parts.length > 0 && <strong className="blocks__name">{nameOf(b.part)}</strong>}
          <div className="blocks__row">
            <span className="small muted">Stufe <span className="blocks__more">– auch mehrere, z. B. Protein und Sauce</span></span>
            <div className="chips" role="group" aria-label={`Stufe für ${nameOf(b.part)}`}>
              {SIDE_KINDS.map(({ kind, label }) => (
                <button key={kind} type="button" className={`chip chip--sm${covers(b).includes(kind) ? ' is-on' : ''}`} aria-pressed={covers(b).includes(kind)}
                  onClick={() => toggleKind(b, kind)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="blocks__row">
            <span className="small muted">Passt zu {b.directions.length ? '' : '– noch keine gewählt: überall'}</span>
            <div className="chips" role="group" aria-label={`Passt zu – ${nameOf(b.part)}`}>
              {DIRECTIONS.map((d) => (
                <button key={d.id} type="button" className={`chip chip--sm${dirsOf(b).includes(d.id) ? ' is-on' : ''}`} aria-pressed={dirsOf(b).includes(d.id)}
                  onClick={() => toggleDir(b, d.id)}>{d.name}</button>
              ))}
            </div>
          </div>
          <label className="blocks__row">
            <span className="small muted">Ersetzt festen Baustein <span className="blocks__more">– dann steht deiner statt des festen zur Wahl</span></span>
            <select className="blocks__select" value={b.replaces ?? ''} onChange={(e) => setReplaces(b, e.target.value)}>
              <option value="">– keinen –</option>
              {sidesOfKind(b.kind).filter((x) => !x.id.startsWith('eigen:')).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        </div>
      ))}
      <div className="blocks__row blocks__pairs">
        <span className="small muted">Passt gut zu <span className="blocks__more">– steht im Baukasten dann vorn</span></span>
        <div className="chips" role="group" aria-label="Passt gut zu">
          {pairs.map((id) => (
            <button key={id} type="button" className="chip chip--sm is-on" aria-label={`${sideOf(id)?.name ?? id} entfernen`}
              onClick={() => savePairs(pairs.filter((x) => x !== id), `${sideOf(id)?.name ?? id} entfernt`)}>
              {sideOf(id)?.name ?? id} <Icon name="close" size={12} />
            </button>
          ))}
          <select className="blocks__select" value="" aria-label="Baustein hinzufügen"
            onChange={(e) => e.target.value && savePairs([...pairs, e.target.value], `Passt gut zu ${sideOf(e.target.value)?.name}`)}>
            <option value="">+ hinzufügen</option>
            {SIDE_KINDS.map(({ kind, label }) => (
              <optgroup key={kind} label={label}>
                {sidesOfKind(kind, hh.customSides).filter((x) => !pairs.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
