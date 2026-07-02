import { errorMessage } from '../errors';

describe('errorMessage', () => {
  it('extracts the message from a real Error instance', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('extracts the message from a plain object with a message field (e.g. PostgrestError)', () => {
    const postgrestError = { message: 'permission denied', code: '42501', details: null, hint: null };
    expect(errorMessage(postgrestError)).toBe('permission denied');
  });

  it('falls back for a message field that is not a string', () => {
    expect(errorMessage({ message: 42 }, 'fallback')).toBe('fallback');
  });

  it('falls back for values with no message at all', () => {
    expect(errorMessage('just a string', 'fallback')).toBe('fallback');
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
    expect(errorMessage(42, 'fallback')).toBe('fallback');
  });

  it('uses the default fallback when none is provided', () => {
    expect(errorMessage(null)).toBe('Something went wrong');
  });
});
