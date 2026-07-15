import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';

import { supabase } from './supabase';

const BUCKET = 'trip-photos';

/** Sniffs the real image format from its magic bytes rather than trusting
 * `expo-image-picker`'s `mimeType` field, which reflects the *picked* asset and can
 * disagree with the actual bytes once `allowsEditing` crops/re-encodes it (commonly to
 * JPEG regardless of source format) — trusting it produced files whose extension and
 * `Content-Type` didn't match their contents, which uploaded and rendered fine in-app
 * (RN's `Image` ignores both) but the Supabase dashboard's preview/download, which does
 * rely on them, reported the file as corrupted. */
function sniffFormat(bytes: Uint8Array): { ext: string; contentType: string } {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return { ext: 'png', contentType: 'image/png' };
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return { ext: 'gif', contentType: 'image/gif' };
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return { ext: 'webp', contentType: 'image/webp' };
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70)
    return { ext: 'heic', contentType: 'image/heic' };
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

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
 * (see `sniffFormat`) rather than taken from the picker's `mimeType`, since that field can
 * disagree with the actual re-encoded output. Path is namespaced by `userId` to match the
 * storage.objects RLS policies from `0009_trip_photos.sql`, which check the first path segment
 * against `auth.uid()`. A cache-busting `?v=` query param is appended to the stored URL — a
 * re-uploaded photo of the same format reuses the exact same path, so without it the URL never
 * changes and RN's `Image` (which caches by URI) keeps showing the previous photo's bytes even
 * though the Storage object underneath was replaced. */
export async function uploadTripPhoto(tripId: string, userId: string, localUri: string): Promise<string> {
  const base64 = await new File(localUri).base64();
  const bytes = decode(base64);
  const { ext, contentType } = sniffFormat(new Uint8Array(bytes));
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
