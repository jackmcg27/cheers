import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';

/** Sniffs the real image format from its magic bytes rather than trusting
 * `expo-image-picker`'s `mimeType` field, which reflects the *picked* asset and can
 * disagree with the actual bytes once `allowsEditing` crops/re-encodes it (commonly to
 * JPEG regardless of source format) — trusting it produced files whose extension and
 * `Content-Type` didn't match their contents, which uploaded and rendered fine in-app
 * (RN's `Image` ignores both) but the Supabase dashboard's preview/download, which does
 * rely on them, reported the file as corrupted. */
export function sniffImageFormat(bytes: Uint8Array): { ext: string; contentType: string } {
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

/** Reads a local `file://` URI's bytes as base64 and decodes to an ArrayBuffer, rather than
 * `fetch(localUri).then(r => r.blob())` — that produces a 0-byte blob for local `file://` URIs on
 * some platforms (a known Expo/React Native gotcha), silently uploading an empty file. */
export async function readLocalImageBytes(localUri: string): Promise<ArrayBuffer> {
  const base64 = await new File(localUri).base64();
  return decode(base64);
}
