import { parseAuthTokensFromUrl } from '../deep-link';

describe('parseAuthTokensFromUrl', () => {
  it('extracts tokens and type from the URL fragment (implicit flow)', () => {
    const url =
      'cheers:///#access_token=abc123&refresh_token=def456&expires_in=3600&token_type=bearer&type=magiclink';
    expect(parseAuthTokensFromUrl(url)).toEqual({
      accessToken: 'abc123',
      refreshToken: 'def456',
      type: 'magiclink',
    });
  });

  it('extracts a recovery type, for the password-reset flow', () => {
    const url = 'cheers:///#access_token=abc123&refresh_token=def456&type=recovery';
    expect(parseAuthTokensFromUrl(url)?.type).toBe('recovery');
  });

  it('extracts tokens from query params, with a null type when absent', () => {
    const url = 'cheers:///?access_token=abc123&refresh_token=def456';
    expect(parseAuthTokensFromUrl(url)).toEqual({
      accessToken: 'abc123',
      refreshToken: 'def456',
      type: null,
    });
  });

  it('prefers fragment params over query params when both are present', () => {
    const url = 'cheers:///?access_token=query-token#access_token=hash-token&refresh_token=def456';
    expect(parseAuthTokensFromUrl(url)).toEqual({
      accessToken: 'hash-token',
      refreshToken: 'def456',
      type: null,
    });
  });

  it('returns null when the URL has no tokens', () => {
    expect(parseAuthTokensFromUrl('cheers:///')).toBeNull();
  });

  it('returns null when only one of the two tokens is present', () => {
    expect(parseAuthTokensFromUrl('cheers:///#access_token=abc123')).toBeNull();
  });
});
