import { readLocalImageBytes, sniffImageFormat } from './image-upload';
import { supabase } from './supabase';

const BUCKET = 'trip-photos';

function pathFromPublicUrl(photoUrl: string): string {
  const marker = `/object/public/${BUCKET}/`;
  const idx = photoUrl.indexOf(marker);
  if (idx === -1) throw new Error('Unrecognized trip photo URL');
  return photoUrl.slice(idx + marker.length).split('?')[0];
}

/** Uploads (or replaces) a trip's photo from a local file URI, then writes the resulting public
 * URL onto `trips.photo_url`. Reads the file as base64 and decodes to an ArrayBuffer rather than
 * `fetch(localUri).then(r => r.blob())` — that produces a 0-byte blob for local `file://` URIs on
 * some platforms (a known Expo/React Native gotcha), silently uploading an empty file. The
 * storage path's extension and the upload's `contentType` are sniffed from those decoded bytes
 * (see `sniffImageFormat` in `image-upload.ts`) rather than taken from the picker's `mimeType`, since that field can
 * disagree with the actual re-encoded output. Path is namespaced by `userId` to match the
 * storage.objects RLS policies from `0009_trip_photos.sql`, which check the first path segment
 * against `auth.uid()`. A cache-busting `?v=` query param is appended to the stored URL — a
 * re-uploaded photo of the same format reuses the exact same path, so without it the URL never
 * changes and RN's `Image` (which caches by URI) keeps showing the previous photo's bytes even
 * though the Storage object underneath was replaced. */
export async function uploadTripPhoto(tripId: string, userId: string, localUri: string): Promise<string> {
  const bytes = await readLocalImageBytes(localUri);
  const { ext, contentType } = sniffImageFormat(new Uint8Array(bytes));
  const path = `${userId}/${tripId}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const bustedUrl = `${publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase.from('trips').update({ photo_url: bustedUrl }).eq('id', tripId);
  if (updateError) throw updateError;

  return bustedUrl;
}

/** Removes a trip's photo from Storage and clears `trips.photo_url`. Takes the current
 * `photoUrl` rather than reconstructing the storage path, since the extension varies with
 * whatever format the photo was originally uploaded as. */
export async function removeTripPhoto(tripId: string, photoUrl: string): Promise<void> {
  const path = pathFromPublicUrl(photoUrl);
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
  if (removeError) throw removeError;

  const { error: updateError } = await supabase.from('trips').update({ photo_url: null }).eq('id', tripId);
  if (updateError) throw updateError;
}
