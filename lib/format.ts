export { formatDistance } from './bearing';

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Collapses a trip's logged drink names into a display string, e.g. "IPA ×2, Stout".
 * Unnamed drinks (no `drink_name` given when logging) are dropped — they're still counted
 * in the 🍻 total, just not listed here. Returns null when nothing was named. */
export function summarizeDrinkNames(names: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const raw of names) {
    const name = raw?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return Array.from(counts.entries())
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(', ');
}

export type CompanionDrinkSummary = { label: string; summary: string };

/** Splits a trip's drink logs by who drank them, for History's per-person breakdown. Drinks
 * with no `companion_id` are the trip owner's own ("You"), listed first; each companion after,
 * in the order given. People with no named drinks are omitted, same as `summarizeDrinkNames`. */
export function summarizeDrinksByCompanion(
  logs: { drink_name: string | null; companion_id: string | null }[],
  companions: { id: string; label: string }[]
): CompanionDrinkSummary[] {
  const byCompanion = new Map<string, (string | null)[]>();
  for (const log of logs) {
    const key = log.companion_id ?? 'owner';
    const names = byCompanion.get(key) ?? [];
    names.push(log.drink_name);
    byCompanion.set(key, names);
  }

  const result: CompanionDrinkSummary[] = [];
  const ownSummary = summarizeDrinkNames(byCompanion.get('owner') ?? []);
  if (ownSummary) result.push({ label: 'You', summary: ownSummary });
  for (const companion of companions) {
    const summary = summarizeDrinkNames(byCompanion.get(companion.id) ?? []);
    if (summary) result.push({ label: companion.label, summary });
  }
  return result;
}
