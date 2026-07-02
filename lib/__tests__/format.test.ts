import { formatDistance, formatDuration } from '../format';

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
