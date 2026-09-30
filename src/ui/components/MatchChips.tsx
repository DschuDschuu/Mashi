import { useState } from 'react';
import { appliesAliases, FOOD_CHOICES, normalizeName } from '../../domain/nutrition/localFoods';
import { Icon } from './Icon';

/** Wofür ein Produkt gilt: ersetzte Tabellen-Einträge (mit ihren Schreibweisen), eigene Namen, ausgenommene Schreibweisen */
export interface Match { replaces: string[]; names: string[]; excludes: string[] }

/** „entrahmte milch“ → „Entrahmte Milch“ (gespeichert wird klein) – wie die Namen der Tabelle */
const cap = (s: string) => s.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('de-DE'));

/** nur Ausnahmen, die sichtbar sind – überflüssige (z. B. „Vollmilch“ beim 0,1-%-Produkt) fallen still weg */
export const visibleExcludes = (name: string, m: Match) => m.excludes.filter((x) => m.replaces.some((id) => appliesAliases(name, id).includes(x)));

/**
 * „Gilt für diese Zutaten in deinen Rezepten“ – im Stil der Stufen-Chips (Nachkaufen · Im Haus · Gewürze): eine Zeile Chips.
 * Tabellen-Einträge zeigen alle Schreibweisen (antippen = ausnehmen / wieder einschließen), eigene Namen lassen
 * sich entfernen; „+ Zutat“ sucht in der Tabelle oder übernimmt einen freien Namen („Kimchi-Paste“).
 * Gemeinsam genutzt vom Produkt-Formular und der Kachel unter „Meine Lebensmittel“.
 */
export function MatchChips({ name, value, onChange }: { name: string; value: Match; onChange: (m: Match) => void }) {
  const { replaces, names, excludes } = value;
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  /** Eine Schreibweise aus- oder wieder einschließen; sind alle aus, fällt der ganze Eintrag weg */
  const toggleAlias = (id: string, alias: string) => {
    const next = excludes.includes(alias) ? excludes.filter((x) => x !== alias) : [...excludes, alias];
    const all = appliesAliases(name, id);
    if (all.every((al) => next.includes(al))) onChange({ ...value, replaces: replaces.filter((x) => x !== id), excludes: next.filter((x) => !all.includes(x)) });
    else onChange({ ...value, excludes: next });
  };

  const q = search.trim().toLocaleLowerCase('de-DE');
  // eigener Zutatenname – nur, wenn die Tabelle ihn nicht genau so kennt und er noch nicht dabei ist
  const freeName = q && !FOOD_CHOICES.some((f) => normalizeName(f.name) === normalizeName(q)) && !names.includes(normalizeName(q)) ? normalizeName(q) : '';
  const hits = q ? FOOD_CHOICES.filter((f) => f.name.toLocaleLowerCase('de-DE').includes(q) && !replaces.includes(f.id)).slice(0, 10) : [];
  const add = (m: Match) => { onChange(m); setSearch(''); setAdding(false); };

  return (
    <div className="stage match">
      <span className="small muted">Gilt für diese Zutaten in deinen Rezepten:</span>
      <div className="chips giltfuer">
        {replaces.flatMap((id) => appliesAliases(name, id).map((al) => {
          const off = excludes.includes(al);
          return (
            <button key={id + al} type="button" className={`afilter${off ? ' is-off' : ''}`}
              aria-label={off ? `${cap(al)} wieder einschließen` : `${cap(al)} ausnehmen`}
              onClick={() => toggleAlias(id, al)}>
              {cap(al)} <Icon name={off ? 'refresh' : 'close'} size={14} />
            </button>
          );
        }))}
        {/* ein eigener Name, der schon eine Schreibweise eines ersetzten Eintrags ist, stünde sonst doppelt da */}
        {names.filter((x) => !replaces.some((id) => appliesAliases(name, id).includes(x))).map((x) => (
          <button key={x} type="button" className="afilter" onClick={() => onChange({ ...value, names: names.filter((y) => y !== x) })} aria-label={`${cap(x)} entfernen`}>
            {cap(x)} <Icon name="close" size={14} />
          </button>
        ))}
        {!adding && (
          <button type="button" className="chip chip--sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Zutat</button>
        )}
      </div>
      {replaces.some((id) => appliesAliases(name, id).some((a) => excludes.includes(a))) && <p className="small muted">Durchgestrichen = ausgenommen: dort rechnet Mashi mit dem Richtwert. Antippen holt es zurück.</p>}
      {adding && (
        <>
          <label className="search">
            <Icon name="search" size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zutat hinzufügen, z. B. Milch" aria-label="Zutat hinzufügen" autoFocus
              onKeyDown={(e) => e.key === 'Escape' && (setSearch(''), setAdding(false))} />
            <button type="button" className="iconbtn iconbtn--sm search__clear" onClick={() => { setSearch(''); setAdding(false); }} aria-label="Hinzufügen abbrechen">
              <Icon name="close" size={16} />
            </button>
          </label>
          {(hits.length > 0 || freeName) && (
            <div className="chips">
              {hits.map((f) => (
                <button key={f.id} type="button" className="chip chip--sm" onClick={() => add({ ...value, replaces: [...replaces, f.id] })}>
                  <Icon name="plus" size={14} /> {f.name}
                </button>
              ))}
              {/* Kennt die Tabelle den Namen nicht genau: als eigene Zutat übernehmen („Kimchi-Paste“) */}
              {freeName && (
                <button type="button" className="chip chip--sm" onClick={() => add({ ...value, names: [...names, freeName] })}>
                  <Icon name="plus" size={14} /> „{search.trim()}“ als Zutat
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
