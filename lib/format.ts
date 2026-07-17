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

/** Splits a trip's drink logs by who drank them, for History's per-person breakdown. Drinks with
 * no `companion_id` bucket under `'owner'`; `viewerKey` (defaulting to `null`, i.e. the owner)
 * says which bucket is "the viewer" — pass a companion's own `id` when a companion, not the
 * trip's owner, is looking at their own History, so their own drinks are labeled "You" instead of
 * the host's (the host then needs its own labeled entry, via a synthesized `{ id: 'owner', ... }`
 * companion the caller adds — see `lib/history.ts`). That entry is skipped below since it's
 * already shown as "You". People with no named drinks are omitted, same as `summarizeDrinkNames`. */
export function summarizeDrinksByCompanion(
  logs: { drink_name: string | null; companion_id: string | null }[],
  companions: { id: string; label: string }[],
  viewerKey: string | null = null
): CompanionDrinkSummary[] {
  const byKey = new Map<string, (string | null)[]>();
  for (const log of logs) {
    const key = log.companion_id ?? 'owner';
    const names = byKey.get(key) ?? [];
    names.push(log.drink_name);
    byKey.set(key, names);
  }

  const meKey = viewerKey ?? 'owner';
  const result: CompanionDrinkSummary[] = [];
  const ownSummary = summarizeDrinkNames(byKey.get(meKey) ?? []);
  if (ownSummary) result.push({ label: 'You', summary: ownSummary });
  for (const companion of companions) {
    if (companion.id === meKey) continue;
    const summary = summarizeDrinkNames(byKey.get(companion.id) ?? []);
    if (summary) result.push({ label: companion.label, summary });
  }
  return result;
}
