// mock-location.ts reads EXPO_PUBLIC_MOCK_LAT/LNG at module-load time and keeps state at module
// scope, so each test resets the module registry to get an isolated, fresh store.

describe('mock-location', () => {
  const originalLat = process.env.EXPO_PUBLIC_MOCK_LAT;
  const originalLng = process.env.EXPO_PUBLIC_MOCK_LNG;
  const originalFlag = process.env.EXPO_PUBLIC_MOCK_LOCATION;

  afterEach(() => {
    process.env.EXPO_PUBLIC_MOCK_LAT = originalLat;
    process.env.EXPO_PUBLIC_MOCK_LNG = originalLng;
    process.env.EXPO_PUBLIC_MOCK_LOCATION = originalFlag;
  });

  function load(): typeof import('../mock-location') {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- need require() to re-evaluate the module after resetModules()
    return require('../mock-location');
  }

  it('isMockLocationEnabled reflects EXPO_PUBLIC_MOCK_LOCATION exactly', () => {
    process.env.EXPO_PUBLIC_MOCK_LOCATION = 'true';
    expect(load().isMockLocationEnabled).toBe(true);

    process.env.EXPO_PUBLIC_MOCK_LOCATION = 'false';
    expect(load().isMockLocationEnabled).toBe(false);

    delete process.env.EXPO_PUBLIC_MOCK_LOCATION;
    expect(load().isMockLocationEnabled).toBe(false);
  });

  it('defaults coords from EXPO_PUBLIC_MOCK_LAT/LNG, and heading to 0', () => {
    process.env.EXPO_PUBLIC_MOCK_LAT = '12.5';
    process.env.EXPO_PUBLIC_MOCK_LNG = '34.5';
    const { getMockState } = load();
    expect(getMockState()).toEqual({ latitude: 12.5, longitude: 34.5, heading: 0 });
  });

  it('setMockCoords updates latitude/longitude without touching heading', () => {
    const { getMockState, setMockCoords, setMockHeading } = load();
    setMockHeading(90);
    setMockCoords(1, 2);
    expect(getMockState()).toEqual({ latitude: 1, longitude: 2, heading: 90 });
  });

  it('setMockHeading normalizes into [0, 360)', () => {
    const { getMockState, setMockHeading } = load();
    setMockHeading(370);
    expect(getMockState().heading).toBe(10);
    setMockHeading(-10);
    expect(getMockState().heading).toBe(350);
  });

  it('nudgeMockHeading adds a delta and wraps', () => {
    const { getMockState, setMockHeading, nudgeMockHeading } = load();
    setMockHeading(350);
    nudgeMockHeading(20);
    expect(getMockState().heading).toBe(10);
  });

  it('resetMockCoords restores the original EXPO_PUBLIC_MOCK_LAT/LNG default', () => {
    process.env.EXPO_PUBLIC_MOCK_LAT = '5';
    process.env.EXPO_PUBLIC_MOCK_LNG = '6';
    const { getMockState, setMockCoords, resetMockCoords } = load();

    setMockCoords(99, 99);
    expect(getMockState()).toMatchObject({ latitude: 99, longitude: 99 });

    resetMockCoords();
    expect(getMockState()).toMatchObject({ latitude: 5, longitude: 6 });
  });
});
