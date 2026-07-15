/** Supabase's magic-link and signup-confirmation emails redirect back into the app with the
 * session tokens embedded in the URL — as query params for some flows, but in the fragment
 * (`#access_token=...&refresh_token=...`) for the implicit flow this project uses. `expo-linking`'s
 * own `parse()` only reads the query string, so hash-fragment tokens need to be pulled out by
 * hand. Plain string splitting instead of the `URL`/`URLSearchParams` globals, since those come
 * from a polyfill that isn't guaranteed to handle a custom scheme like `cheers://` the same way
 * it handles `http(s)://`. */
export function parseAuthTokensFromUrl(
  url: string
): { accessToken: string; refreshToken: string; type: string | null } | null {
  let rest = url;
  let hash = '';
  const hashIndex = rest.indexOf('#');
  if (hashIndex >= 0) {
    hash = rest.slice(hashIndex + 1);
    rest = rest.slice(0, hashIndex);
  }
  let search = '';
  const queryIndex = rest.indexOf('?');
  if (queryIndex >= 0) {
    search = rest.slice(queryIndex + 1);
  }

  const params = new URLSearchParams(search);
  new URLSearchParams(hash).forEach((value, key) => params.set(key, value));

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, type: params.get('type') };
}
