import { useMemo, useState, type ReactNode } from 'react';
import { CATEGORIES, DEVICES } from '../../domain/catalog';
import { activeFilterCount, activeFilters, filterRecipes, HIGH_PROTEIN_G, removeFilter, type RecipeFilter } from '../../domain/filter';
import { currentContent } from '../../domain/recipe';
import { useRecipes } from '../../data/store';
import type { Route } from '../../router';
import { ChipSelect, Empty } from '../components/Controls';
import { Icon } from '../components/Icon';
import { deviceIcon } from '../catalogIcons';
import { RecipeCard } from '../components/RecipeCard';
import { recipeCount } from '../format';
import { recipeNutrition } from '../useNutrition';

/** Oben im Kochbuch: die drei Ansichten, die man am häufigsten braucht. */
type Segment = 'alle' | 'favoriten' | 'zum_testen';
const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'alle', label: 'Alle' },
  { value: 'favoriten', label: 'Favoriten' },
  { value: 'zum_testen', label: 'Zum Testen' },
];

/** Was ein Segment zusätzlich zu den Filtern verlangt. */
const SEGMENT_FILTER: Record<Segment, Partial<RecipeFilter>> = {
  alle: {},
  favoriten: { favoritesOnly: true },
  zum_testen: { statuses: ['zum_testen'] },
};

/** Filter aus der URL lesen – so funktionieren die Schnellfilter der Startseite als Links. */
function filterFromQuery(q: URLSearchParams): RecipeFilter {
  const num = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
  return {
    query: q.get('q') ?? '',
    devices: q.getAll('device'),
    categories: q.getAll('cat'),
    maxMinutes: num('maxMin'),
    minProtein: q.get('protein') ? HIGH_PROTEIN_G : undefined,
  };
}

export function CookbookScreen({ route }: { route: Route }) {
  const recipes = useRecipes();
  // „Favoriten“ auf der Startseite verlinkt ?fav=1 → gleich im passenden Segment öffnen
  const [segment, setSegment] = useState<Segment>(route.query.get('fav') === '1' ? 'favoriten' : 'alle');
  const [f, setF] = useState<RecipeFilter>(() => filterFromQuery(route.query));
  // Bewusst zu: Wer vom Schnellfilter kommt, will Ergebnisse sehen, nicht das Panel.
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<RecipeFilter>) => setF((prev) => ({ ...prev, ...patch }));

  const allTags = useMemo(
    () => [...new Set(recipes.flatMap((r) => currentContent(r).tags))].sort((a, b) => a.localeCompare(b, 'de')),
    [recipes],
  );
  const result = filterRecipes(recipes, { ...f, ...SEGMENT_FILTER[segment] }, recipeNutrition);
  const count = activeFilterCount(f);
  const badges = activeFilters(f);

  return (
    <main className="screen screen--tabbed">
      <header className="page-head">
        <h1>Mein Kochbuch</h1>
        <span className="muted small">{recipeCount(result.length)}</span>
      </header>

      <div className="search-row">
        <label className="search">
          <Icon name="search" size={20} />
          <input value={f.query} onChange={(e) => set({ query: e.target.value })} placeholder="Suchen …" aria-label="Rezepte suchen" />
          {f.query && (
            <button type="button" className="iconbtn iconbtn--sm search__clear" onClick={() => set({ query: '' })} aria-label="Suche leeren">
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
        <button className={`iconbtn iconbtn--box${count ? ' is-on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Filter">
          <Icon name="sliders" />
          {count > 0 && <span className="iconbtn__count">{count}</span>}
        </button>
      </div>

      {/* Aktive Filter als Badges – einzeln abwählbar, ohne das Filtermenü zu öffnen.
          Bei offenem Menü ausgeblendet: dort sind dieselben Filter schon markiert. */}
      {!open && badges.length > 0 && (
        <div className="active-filters" aria-label="Aktive Filter">
          {badges.map((a) => (
            <button
              key={a.kind + ('value' in a ? a.value : '')}
              className="afilter"
              onClick={() => setF(removeFilter(f, a))}
              aria-label={`Filter „${a.label}“ entfernen`}
            >
              {a.kind === 'device' && <Icon name={deviceIcon(a.value)} size={15} />}
              {a.label}
              <Icon name="close" size={14} />
            </button>
          ))}
          {badges.length > 1 && <button className="link link--muted" onClick={() => setF({ query: f.query })}>Alle entfernen</button>}
        </div>
      )}

      <div className="segments" role="tablist">
        {SEGMENTS.map((s) => (
          <button key={s.value} role="tab" aria-selected={segment === s.value} className={`segment${segment === s.value ? ' is-on' : ''}`} onClick={() => setSegment(s.value)}>
            {s.label}
          </button>
        ))}
      </div>

      {open && (
        <div className="filters">
          <FilterGroup title="Gerät">
            <ChipSelect options={DEVICES.map((d) => ({ value: d.id, label: <><Icon name={deviceIcon(d.id)} size={16} />{d.label}</> }))} selected={f.devices ?? []} onChange={(devices) => set({ devices })} />
          </FilterGroup>
          <FilterGroup title="Kategorie">
            <ChipSelect options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} selected={f.categories ?? []} onChange={(categories) => set({ categories })} />
          </FilterGroup>
          <FilterGroup title="Zeit">
            <ChipSelect single options={[15, 30, 45, 60].map((m) => ({ value: String(m), label: `≤ ${m} Min.` }))} selected={f.maxMinutes ? [String(f.maxMinutes)] : []} onChange={([v]) => set({ maxMinutes: v ? Number(v) : undefined })} />
          </FilterGroup>
          <FilterGroup title="Pro Portion">
            <ChipSelect single options={[400, 600, 800].map((k) => ({ value: String(k), label: `≤ ${k} kcal` }))} selected={f.maxKcal ? [String(f.maxKcal)] : []} onChange={([v]) => set({ maxKcal: v ? Number(v) : undefined })} />
            <ChipSelect single options={[20, HIGH_PROTEIN_G, 35].map((p) => ({ value: String(p), label: `≥ ${p} g Protein` }))} selected={f.minProtein ? [String(f.minProtein)] : []} onChange={([v]) => set({ minProtein: v ? Number(v) : undefined })} />
          </FilterGroup>
          <FilterGroup title="Tags">
            <ChipSelect options={allTags.map((t) => ({ value: t, label: t }))} selected={f.tags ?? []} onChange={(tags) => set({ tags })} />
          </FilterGroup>
          {/* Fest unten, damit man nach dem Auswählen nicht zurückscrollen muss */}
          <div className="filterbar">
            <button className="btn btn--ghost" disabled={!count} onClick={() => setF({ query: f.query })}>Zurücksetzen</button>
            <button className="btn btn--primary" onClick={() => setOpen(false)}>
              Fertig · {recipeCount(result.length)}
            </button>
          </div>
        </div>
      )}

      {result.length ? (
        <div className="grid">{result.map((r) => <RecipeCard key={r.id} recipe={r} />)}</div>
      ) : (
        <Empty icon="search">Keine Rezepte gefunden. Probier weniger Filter.</Empty>
      )}
    </main>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="filters__group">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
