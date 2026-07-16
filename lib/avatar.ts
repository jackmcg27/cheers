import { readLocalImageBytes, sniffImageFormat } from './image-upload';
import { supabase } from './supabase';

const BUCKET = 'avatars';

function pathFromPublicUrl(avatarUrl: string): string {
  const marker = `/object/public/${BUCKET}/`;
  const idx = avatarUrl.indexOf(marker);
  if (idx === -1) throw new Error('Unrecognized avatar URL');
  return avatarUrl.slice(idx + marker.length).split('?')[0];
}

/** Uploads (or replaces) a user's avatar from a local file URI, then writes the resulting public
 * URL onto `profiles.avatar_url`. See `trip-photos.ts`'s `uploadTripPhoto` for why bytes are read
 * via `readLocalImageBytes` and format is sniffed via `sniffImageFormat` rather than trusted from
 * the picker. Path is namespaced by `userId` to match the storage.objects RLS policies from
 * `0010_avatars.sql`, which check the first path segment against `auth.uid()`. A cache-busting
 * `?v=` query param is appended to the stored URL, same reasoning as trip photos: a re-uploaded
 * avatar of the same format reuses the exact same path, so without it RN's `Image` keeps showing
 * the previous avatar's bytes even though the Storage object underneath was replaced. */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const bytes = await readLocalImageBytes(localUri);
  const { ext, contentType } = sniffImageFormat(new Uint8Array(bytes));
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const bustedUrl = `${publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: bustedUrl }).eq('id', userId);
  if (updateError) throw updateError;

  return bustedUrl;
}

/** Removes a user's avatar from Storage and clears `profiles.avatar_url`. Takes the current
 * `avatarUrl` rather than reconstructing the storage path, since the extension varies with
 * whatever format the avatar was originally uploaded as. */
export async function removeAvatar(userId: string, avatarUrl: string): Promise<void> {
  const path = pathFromPublicUrl(avatarUrl);
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
  if (removeError) throw removeError;

  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (updateError) throw updateError;
}
