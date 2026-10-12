/** „2026-09-24“ in Ortszeit – der Tag wechselt um Mitternacht bei dir, nicht in London. */
export const localDay = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Ein Kalendertag als Zeitpunkt „12 Uhr“ – so wie das Datumsfeld beim Bon (Code-Review #24): Mashi gruppiert Bons
 * und Preise nach den ersten 10 Zeichen. „Jetzt“ in UTC lag um 0:30 Uhr deutscher Zeit noch auf dem Vortag.
 */
export const localNoon = (d: Date = new Date()) => `${localDay(d)}T12:00:00.000Z`;
