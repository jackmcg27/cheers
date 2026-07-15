// places.ts reads EXPO_PUBLIC_GOOGLE_PLACES_API_KEY at module-load time, so tests that need a
// specific key state reset the module registry and `require` a fresh copy after setting it.

describe('places', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY = originalKey;
  });

  function loadPlacesWithKey(key: string | undefined): typeof import('../places') {
    jest.resetModules();
    if (key === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    else process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY = key;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- need require() to re-evaluate the module after resetModules()
    return require('../places');
  }

  function mockFetchOnce(body: unknown, ok = true, status = 200) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as typeof fetch;
  }

  describe('without an API key configured', () => {
    it('findNearbyBars rejects with a message pointing at the missing env var', async () => {
      const places = loadPlacesWithKey(undefined);
      await expect(places.findNearbyBars({ latitude: 0, longitude: 0 })).rejects.toThrow(
        /EXPO_PUBLIC_GOOGLE_PLACES_API_KEY/
      );
    });

    it('placePhotoUrl returns null instead of a broken URL', () => {
      const places = loadPlacesWithKey(undefined);
      expect(places.placePhotoUrl('places/abc/photos/xyz')).toBeNull();
    });

    it('searchBarsByText rejects with a message pointing at the missing env var', async () => {
      const places = loadPlacesWithKey(undefined);
      await expect(places.searchBarsByText('dive bar')).rejects.toThrow(
        /EXPO_PUBLIC_GOOGLE_PLACES_API_KEY/
      );
    });
  });

  describe('with an API key configured', () => {
    const rawResponse = {
      places: [
        {
          id: 'place-1',
          displayName: { text: 'The Thirsty Crow' },
          formattedAddress: '123 Main St',
          location: { latitude: 40.71, longitude: -74.0 },
          photos: [{ name: 'places/place-1/photos/photo-1' }],
        },
        {
          // No location — the app can't point a compass at this, so it must be filtered out.
          id: 'place-2',
          displayName: { text: 'No Location Bar' },
        },
      ],
    };

    it('posts to searchNearby with the origin/radius and maps the response', async () => {
      mockFetchOnce(rawResponse);
      const places = loadPlacesWithKey('test-key');

      const bars = await places.findNearbyBars({ latitude: 1, longitude: 2 }, [], 500);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places:searchNearby',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'X-Goog-Api-Key': 'test-key' }),
        })
      );
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.locationRestriction.circle.center).toEqual({ latitude: 1, longitude: 2 });
      expect(body.locationRestriction.circle.radius).toBe(500);

      expect(bars).toHaveLength(1); // the location-less place was filtered out
      expect(bars[0]).toEqual({
        placeId: 'place-1',
        name: 'The Thirsty Crow',
        address: '123 Main St',
        location: { latitude: 40.71, longitude: -74.0 },
        photoRef: 'places/place-1/photos/photo-1',
      });
    });

    it('excludes place ids passed in excludePlaceIds', async () => {
      mockFetchOnce(rawResponse);
      const places = loadPlacesWithKey('test-key');
      const bars = await places.findNearbyBars({ latitude: 1, longitude: 2 }, ['place-1']);
      expect(bars).toHaveLength(0);
    });

    it('defaults a missing display name to "Unknown bar"', async () => {
      mockFetchOnce({
        places: [{ id: 'p', location: { latitude: 1, longitude: 1 } }],
      });
      const places = loadPlacesWithKey('test-key');
      const bars = await places.findNearbyBars({ latitude: 1, longitude: 2 });
      expect(bars[0].name).toBe('Unknown bar');
      expect(bars[0].address).toBeNull();
      expect(bars[0].photoRef).toBeNull();
    });

    it('findNearestBar returns the first result, or null when there are none', async () => {
      mockFetchOnce(rawResponse);
      let places = loadPlacesWithKey('test-key');
      expect(await places.findNearestBar({ latitude: 1, longitude: 2 })).toEqual(
        expect.objectContaining({ placeId: 'place-1' })
      );

      mockFetchOnce({ places: [] });
      places = loadPlacesWithKey('test-key');
      expect(await places.findNearestBar({ latitude: 1, longitude: 2 })).toBeNull();
    });

    it('throws including the status and body text on a non-ok response', async () => {
      mockFetchOnce({ error: { message: 'no billing' } }, false, 403);
      const places = loadPlacesWithKey('test-key');
      await expect(places.findNearbyBars({ latitude: 1, longitude: 2 })).rejects.toThrow(/403/);
    });

    it('searchBarsByText throws including the status and body text on a non-ok response', async () => {
      mockFetchOnce({ error: { message: 'no billing' } }, false, 403);
      const places = loadPlacesWithKey('test-key');
      await expect(places.searchBarsByText('dive bar')).rejects.toThrow(/403/);
    });

    it('searchBarsByText short-circuits on a blank query without calling fetch', async () => {
      global.fetch = jest.fn();
      const places = loadPlacesWithKey('test-key');
      expect(await places.searchBarsByText('   ')).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('searchBarsByText includes locationBias only when a bias origin is given', async () => {
      mockFetchOnce({ places: [] });
      const places = loadPlacesWithKey('test-key');
      await places.searchBarsByText('dive bar', { latitude: 5, longitude: 6 });
      const [, initWithBias] = (global.fetch as jest.Mock).mock.calls[0];
      const bodyWithBias = JSON.parse(initWithBias.body);
      expect(bodyWithBias.textQuery).toBe('dive bar');
      expect(bodyWithBias.locationBias.circle.center).toEqual({ latitude: 5, longitude: 6 });

      mockFetchOnce({ places: [] });
      const places2 = loadPlacesWithKey('test-key');
      await places2.searchBarsByText('dive bar');
      const [, initWithoutBias] = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(initWithoutBias.body).locationBias).toBeUndefined();
    });

    it('placePhotoUrl builds a URL with the key and maxWidthPx', () => {
      const places = loadPlacesWithKey('test-key');
      expect(places.placePhotoUrl('places/abc/photos/xyz')).toBe(
        'https://places.googleapis.com/v1/places/abc/photos/xyz/media?maxWidthPx=800&key=test-key'
      );
      expect(places.placePhotoUrl('places/abc/photos/xyz', 200)).toContain('maxWidthPx=200');
    });
  });
});
