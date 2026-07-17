import { formatDistance, formatDuration, summarizeDrinkNames, summarizeDrinksByCompanion } from '../format';

describe('formatDistance (re-exported from bearing)', () => {
  it('is available from lib/format', () => {
    expect(formatDistance(500)).toBe('500 m');
  });
});

describe('formatDuration', () => {
  it('renders null/zero as an em dash', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('—');
  });

  it('renders under an hour in minutes', () => {
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(90)).toBe('2 min'); // rounds
    expect(formatDuration(59 * 60)).toBe('59 min');
  });

  it('renders an hour or more as "Xh Ym"', () => {
    expect(formatDuration(60 * 60)).toBe('1h 0m');
    expect(formatDuration(90 * 60)).toBe('1h 30m');
    expect(formatDuration(125 * 60)).toBe('2h 5m');
  });
});

describe('summarizeDrinkNames', () => {
  it('returns null when there are no names', () => {
    expect(summarizeDrinkNames([])).toBeNull();
    expect(summarizeDrinkNames([null, undefined, '  '])).toBeNull();
  });

  it('drops blank/null entries and counts repeats', () => {
    expect(summarizeDrinkNames(['IPA', null, 'IPA', 'Stout'])).toBe('IPA ×2, Stout');
  });

  it('trims whitespace and treats it as the same drink', () => {
    expect(summarizeDrinkNames(['IPA', ' IPA '])).toBe('IPA ×2');
  });

  it('omits the ×N suffix for a single occurrence', () => {
    expect(summarizeDrinkNames(['Stout'])).toBe('Stout');
  });
});

describe('summarizeDrinksByCompanion', () => {
  it('groups by companion_id, with the owner ("You") first', () => {
    const logs = [
      { drink_name: 'IPA', companion_id: null },
      { drink_name: 'Stout', companion_id: 'c1' },
      { drink_name: 'Stout', companion_id: 'c1' },
      { drink_name: 'Lager', companion_id: 'c2' },
    ];
    const companions = [
      { id: 'c1', label: 'Sam' },
      { id: 'c2', label: 'Alex' },
    ];

    expect(summarizeDrinksByCompanion(logs, companions)).toEqual([
      { label: 'You', summary: 'IPA' },
      { label: 'Sam', summary: 'Stout ×2' },
      { label: 'Alex', summary: 'Lager' },
    ]);
  });

  it('omits people with no named drinks', () => {
    const logs = [{ drink_name: null, companion_id: 'c1' }];
    const companions = [{ id: 'c1', label: 'Sam' }];

    expect(summarizeDrinksByCompanion(logs, companions)).toEqual([]);
  });

  it('returns [] for no logs and no companions', () => {
    expect(summarizeDrinksByCompanion([], [])).toEqual([]);
  });

  it('attributes "You" to a given viewerKey instead of the owner, and excludes that companion from the rest of the list', () => {
    const logs = [
      { drink_name: 'IPA', companion_id: null },
      { drink_name: 'Cider', companion_id: 'c1' },
      { drink_name: 'Lager', companion_id: 'c2' },
    ];
    const companions = [
      { id: 'owner', label: 'Host Person' },
      { id: 'c2', label: 'Alex' },
    ];

    expect(summarizeDrinksByCompanion(logs, companions, 'c1')).toEqual([
      { label: 'You', summary: 'Cider' },
      { label: 'Host Person', summary: 'IPA' },
      { label: 'Alex', summary: 'Lager' },
    ]);
  });
});
