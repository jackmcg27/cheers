/* eslint-disable import/first -- jest.mock must run before the mocked modules are imported */
jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      setSession: jest.fn(),
    },
  },
}));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(),
  addEventListener: jest.fn(),
}));

import { act, create } from 'react-test-renderer';
import * as Linking from 'expo-linking';

import { AuthProvider, useAuth } from '../auth-context';
import { supabase } from '../supabase';

const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockOnAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;
const mockSetSession = supabase.auth.setSession as jest.Mock;
const mockGetInitialURL = Linking.getInitialURL as jest.Mock;
const mockAddEventListener = Linking.addEventListener as jest.Mock;

let ctx: ReturnType<typeof useAuth>;
function Harness() {
  ctx = useAuth();
  return null;
}

async function renderProvider() {
  await act(async () => {
    create(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );
  });
  return () => ctx;
}

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  mockSetSession.mockReset();
  mockGetInitialURL.mockReset().mockResolvedValue(null);
  mockAddEventListener.mockReset().mockReturnValue({ remove: jest.fn() });
});

it('starts initializing and clears it once the session resolves', async () => {
  const session = { user: { id: 'user-1' } } as any;
  mockGetSession.mockResolvedValue({ data: { session } });

  const getCtx = await renderProvider();

  expect(getCtx().initializing).toBe(false);
  expect(getCtx().session).toEqual(session);
});

it('updates the session when auth state changes fire', async () => {
  let authChangeCb: (event: string, session: unknown) => void = () => {};
  mockOnAuthStateChange.mockImplementation((cb) => {
    authChangeCb = cb;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });

  const getCtx = await renderProvider();
  const newSession = { user: { id: 'user-2' } } as any;

  act(() => {
    authChangeCb('SIGNED_IN', newSession);
  });

  expect(getCtx().session).toEqual(newSession);
});

it('clearPasswordRecovery resets the flag', async () => {
  mockGetInitialURL.mockResolvedValue('cheers://reset-password#access_token=at&refresh_token=rt&type=recovery');

  const getCtx = await renderProvider();
  expect(getCtx().passwordRecovery).toBe(true);

  act(() => {
    getCtx().clearPasswordRecovery();
  });
  expect(getCtx().passwordRecovery).toBe(false);
});

it('consumes a recovery deep link from the initial URL and sets the session', async () => {
  mockGetInitialURL.mockResolvedValue('cheers://reset-password#access_token=at&refresh_token=rt&type=recovery');

  const getCtx = await renderProvider();

  expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
  expect(getCtx().passwordRecovery).toBe(true);
});

it('ignores an initial URL with no tokens', async () => {
  mockGetInitialURL.mockResolvedValue('cheers://sign-in');

  const getCtx = await renderProvider();

  expect(mockSetSession).not.toHaveBeenCalled();
  expect(getCtx().passwordRecovery).toBe(false);
});

it('does nothing when there is no initial URL', async () => {
  mockGetInitialURL.mockResolvedValue(null);

  await renderProvider();

  expect(mockSetSession).not.toHaveBeenCalled();
});

it('consumes a non-recovery deep link from a live url event without flagging recovery', async () => {
  let urlListener: (event: { url: string }) => void = () => {};
  mockAddEventListener.mockImplementation((_event: string, cb: (event: { url: string }) => void) => {
    urlListener = cb;
    return { remove: jest.fn() };
  });

  const getCtx = await renderProvider();

  act(() => {
    urlListener({ url: 'cheers://confirm#access_token=at2&refresh_token=rt2&type=signup' });
  });

  expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'at2', refresh_token: 'rt2' });
  expect(getCtx().passwordRecovery).toBe(false);
});
