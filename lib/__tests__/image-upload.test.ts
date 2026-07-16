/* eslint-disable import/first -- jest.mock must run before the mocked module is imported */
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ base64: () => Promise.resolve('ZmFrZS1iYXNlNjQ=') })),
}));

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;

jest.mock('base64-arraybuffer', () => ({ decode: jest.fn() }));

import { decode } from 'base64-arraybuffer';
import { readLocalImageBytes, sniffImageFormat } from '../image-upload';

const mockDecode = decode as jest.Mock;

beforeEach(() => {
  mockDecode.mockReset();
  mockDecode.mockReturnValue(JPEG_BYTES);
});

describe('sniffImageFormat', () => {
  it('recognizes a JPEG from its magic bytes', () => {
    expect(sniffImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0]))).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
  });

  it('recognizes a PNG from its magic bytes', () => {
    expect(sniffImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual({
      ext: 'png',
      contentType: 'image/png',
    });
  });

  it('recognizes a GIF from its magic bytes', () => {
    expect(sniffImageFormat(new Uint8Array([0x47, 0x49, 0x46]))).toEqual({ ext: 'gif', contentType: 'image/gif' });
  });

  it('recognizes a WEBP from its RIFF/WEBP magic bytes', () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageFormat(bytes)).toEqual({ ext: 'webp', contentType: 'image/webp' });
  });

  it('recognizes a HEIC from its ftyp box', () => {
    const bytes = new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]);
    expect(sniffImageFormat(bytes)).toEqual({ ext: 'heic', contentType: 'image/heic' });
  });

  it('falls back to JPEG for unrecognized bytes', () => {
    expect(sniffImageFormat(new Uint8Array([1, 2, 3, 4]))).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
  });
});

describe('readLocalImageBytes', () => {
  it('reads the file as base64 and decodes it', async () => {
    const bytes = await readLocalImageBytes('file:///photo.jpg');
    expect(mockDecode).toHaveBeenCalledWith('ZmFrZS1iYXNlNjQ=');
    expect(bytes).toBe(JPEG_BYTES);
  });
});
