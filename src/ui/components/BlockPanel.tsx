import { DIRECTIONS, guessKind } from '../../domain/craving';
import { FINISH, REST, partsOf } from '../../domain/parts';
import { currentContent } from '../../domain/recipe';
import { SIDE_KINDS, type SideKind } from '../../domain/sides';
import type { Recipe, RecipeBlock } from '../../domain/types';
import { setBlocks } from '../../data/store';
import { toast } from '../toast';
import { Icon } from './Icon';

/**
 * „Auch als Baustein“ (Julia: „Knusprige Hähnchenstreifen“ soll beim Taco als Protein auftauchen): das ganze Rezept
 * oder einzelne Teile (zwei Saucen = zwei Bausteine), je mit Stufe und Richtungen. Keine Richtung = passt überall.
 */
export function BlockPanel({ recipe }: { recipe: Recipe }) {
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
  const setKind = (b: RecipeBlock, kind: SideKind) =>
    save(change(b.part, { kind }), `${nameOf(b.part)}: ${SIDE_KINDS.find((k) => k.kind === kind)?.label}`);
  const toggleDir = (b: RecipeBlock, id: string) => {
    const dirs = b.directions.includes(id) ? b.directions.filter((d) => d !== id) : [...b.directions, id];
    save(change(b.part, { directions: dirs }), dirs.length ? `${nameOf(b.part)} passt zu ${dirs.map((d) => DIRECTIONS.find((x) => x.id === d)?.name).join(', ')}` : `${nameOf(b.part)} passt überall`);
  };

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
            <span className="small muted">Stufe</span>
            <div className="chips" role="group" aria-label={`Stufe für ${nameOf(b.part)}`}>
              {SIDE_KINDS.map(({ kind, label }) => (
                <button key={kind} type="button" className={`chip chip--sm${b.kind === kind ? ' is-on' : ''}`} aria-pressed={b.kind === kind}
                  onClick={() => b.kind !== kind && setKind(b, kind)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="blocks__row">
            <span className="small muted">Passt zu {b.directions.length ? '' : '– noch keine gewählt: überall'}</span>
            <div className="chips" role="group" aria-label={`Passt zu – ${nameOf(b.part)}`}>
              {DIRECTIONS.map((d) => (
                <button key={d.id} type="button" className={`chip chip--sm${b.directions.includes(d.id) ? ' is-on' : ''}`} aria-pressed={b.directions.includes(d.id)}
                  onClick={() => toggleDir(b, d.id)}>{d.name}</button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
