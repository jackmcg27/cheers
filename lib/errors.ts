/** Extracts a readable message from anything a try/catch might throw, including Supabase's
 * PostgrestError (a plain object with a `message` field, not an `Error` instance). */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
    return e.message;
  }
  return fallback;
}
