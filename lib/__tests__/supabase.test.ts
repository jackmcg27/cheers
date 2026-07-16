jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

it('throws a helpful error when the Supabase env vars are missing', () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  expect(() => require('../supabase')).toThrow(/Missing EXPO_PUBLIC_SUPABASE_URL/);
});

it('builds a client when the env vars are present', () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

  const { supabase } = require('../supabase');

  expect(supabase.auth).toBeDefined();
  expect(typeof supabase.from).toBe('function');
});
