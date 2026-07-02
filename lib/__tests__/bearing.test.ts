import { angleDiff, bearingDegrees, distanceMeters, formatDistance } from '../bearing';

describe('distanceMeters', () => {
  it('is zero for identical points', () => {
    const p = { latitude: 40.7128, longitude: -74.006 };
    expect(distanceMeters(p, p)).toBeCloseTo(0, 3);
  });

  it('matches a known distance (roughly 1 degree of latitude ~= 111km)', () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 1, longitude: 0 };
    expect(distanceMeters(a, b)).toBeCloseTo(111_195, -2);
  });

  it('is symmetric', () => {
    const a = { latitude: 40.7128, longitude: -74.006 };
    const b = { latitude: 40.73, longitude: -73.99 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe('bearingDegrees', () => {
  it('points due north (0 deg) when target is directly north', () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 1, longitude: 0 };
    expect(bearingDegrees(a, b)).toBeCloseTo(0, 1);
  });

  it('points due east (90 deg) when target is directly east on the equator', () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0, longitude: 1 };
    expect(bearingDegrees(a, b)).toBeCloseTo(90, 1);
  });

  it('points due south (180 deg) when target is directly south', () => {
    const a = { latitude: 1, longitude: 0 };
    const b = { latitude: 0, longitude: 0 };
    expect(bearingDegrees(a, b)).toBeCloseTo(180, 1);
  });

  it('points due west (270 deg) when target is directly west on the equator', () => {
    const a = { latitude: 0, longitude: 1 };
    const b = { latitude: 0, longitude: 0 };
    expect(bearingDegrees(a, b)).toBeCloseTo(270, 1);
  });

  it('always returns a value in [0, 360)', () => {
    const a = { latitude: 12.3, longitude: 45.6 };
    const b = { latitude: -5, longitude: -10 };
    const bearing = bearingDegrees(a, b);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});

describe('angleDiff', () => {
  it('is zero for identical headings', () => {
    expect(angleDiff(90, 90)).toBe(0);
  });

  it('takes the short way across the 0/360 wraparound', () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
  });

  it('handles a plain forward turn', () => {
    expect(angleDiff(10, 100)).toBe(90);
  });

  it('handles a plain backward turn', () => {
    expect(angleDiff(100, 10)).toBe(-90);
  });

  it('stays within (-180, 180]', () => {
    for (let from = 0; from < 360; from += 37) {
      for (let to = 0; to < 360; to += 53) {
        const diff = angleDiff(from, to);
        expect(diff).toBeGreaterThan(-180);
        expect(diff).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('formatDistance', () => {
  it('formats sub-kilometer distances in meters, rounded', () => {
    expect(formatDistance(42.4)).toBe('42 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('formats 1000m and above in kilometers to one decimal', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(2500)).toBe('2.5 km');
  });
});
