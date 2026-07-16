/* eslint-disable import/first -- jest.mock must run before the mocked module is imported */
jest.mock('../supabase', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ base64: () => Promise.resolve('ZmFrZS1iYXNlNjQ=') })),
}));

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;

jest.mock('base64-arraybuffer', () => ({ decode: jest.fn() }));

import { decode } from 'base64-arraybuffer';
import { supabase } from '../supabase';
import { removeAvatar, uploadAvatar } from '../avatar';

const mockDecode = decode as jest.Mock;

/** A stub PostgREST query builder: every chain method returns itself, and it resolves
 * (thenable, like the real builder) to whatever response you configure. */
function queryResult(response: unknown) {
  const obj: any = {
    update: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return obj;
}

const mockFrom = supabase.from as jest.Mock;
const mockStorageFrom = supabase.storage.from as jest.Mock;

beforeEach(() => {
  mockFrom.mockReset();
  mockStorageFrom.mockReset();
  mockDecode.mockReset();
  mockDecode.mockReturnValue(JPEG_BYTES);
});

describe('uploadAvatar', () => {
  it('sniffs a JPEG from its magic bytes for the storage path extension and content-type', async () => {
    const upload = jest.fn(() => Promise.resolve({ error: null }));
    const getPublicUrl = jest.fn(() => ({ data: { publicUrl: 'https://cdn.example/u1/avatar.jpg' } }));
    mockStorageFrom.mockReturnValue({ upload, getPublicUrl });

    const q = queryResult({ error: null });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('profiles');
      return q;
    });

    const url = await uploadAvatar('u1', 'file:///photo.jpg');

    expect(url).toMatch(/^https:\/\/cdn\.example\/u1\/avatar\.jpg\?v=\d+$/);
    expect(upload).toHaveBeenCalledWith('u1/avatar.jpg', JPEG_BYTES, { contentType: 'image/jpeg', upsert: true });
    expect(q.update).toHaveBeenCalledWith({ avatar_url: url });
    expect(q.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('sniffs a PNG from its magic bytes, ignoring whatever extension the local URI has', async () => {
    mockDecode.mockReturnValue(PNG_BYTES);
    const upload = jest.fn(() => Promise.resolve({ error: null }));
    const getPublicUrl = jest.fn(() => ({ data: { publicUrl: 'https://cdn.example/u1/avatar.png' } }));
    mockStorageFrom.mockReturnValue({ upload, getPublicUrl });
    mockFrom.mockImplementation(() => queryResult({ error: null }));

    await uploadAvatar('u1', 'file:///photo.jpg');

    expect(upload).toHaveBeenCalledWith('u1/avatar.png', PNG_BYTES, { contentType: 'image/png', upsert: true });
  });

  it('appends a cache-busting query param so a same-path re-upload gets a new URL', async () => {
    const getPublicUrl = jest.fn(() => ({ data: { publicUrl: 'https://cdn.example/u1/avatar.jpg' } }));
    mockStorageFrom.mockReturnValue({ upload: jest.fn(() => Promise.resolve({ error: null })), getPublicUrl });
    mockFrom.mockImplementation(() => queryResult({ error: null }));

    const first = await uploadAvatar('u1', 'file:///photo.jpg');
    await new Promise((r) => setTimeout(r, 2));
    const second = await uploadAvatar('u1', 'file:///photo.jpg');

    expect(first).not.toBe(second);
  });

  it('throws the Supabase error if the storage upload fails, without touching the profile row', async () => {
    mockStorageFrom.mockReturnValue({ upload: jest.fn(() => Promise.resolve({ error: { message: 'denied' } })) });

    await expect(uploadAvatar('u1', 'file:///photo.jpg')).rejects.toEqual({ message: 'denied' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws if the profile row update fails', async () => {
    mockStorageFrom.mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ error: null })),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://cdn.example/u1/avatar.jpg' } })),
    });
    mockFrom.mockImplementation(() => queryResult({ error: { message: 'nope' } }));

    await expect(uploadAvatar('u1', 'file:///photo.jpg')).rejects.toEqual({ message: 'nope' });
  });
});

describe('removeAvatar', () => {
  it('parses the storage path out of the public URL and clears avatar_url on the profile', async () => {
    const remove = jest.fn(() => Promise.resolve({ error: null }));
    mockStorageFrom.mockReturnValue({ remove });

    const q = queryResult({ error: null });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('profiles');
      return q;
    });

    await removeAvatar('u1', 'https://proj.supabase.co/storage/v1/object/public/avatars/u1/avatar.png');

    expect(remove).toHaveBeenCalledWith(['u1/avatar.png']);
    expect(q.update).toHaveBeenCalledWith({ avatar_url: null });
    expect(q.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('strips a cache-busting query param before deriving the storage path', async () => {
    const remove = jest.fn(() => Promise.resolve({ error: null }));
    mockStorageFrom.mockReturnValue({ remove });
    mockFrom.mockImplementation(() => queryResult({ error: null }));

    await removeAvatar('u1', 'https://proj.supabase.co/storage/v1/object/public/avatars/u1/avatar.png?v=12345');

    expect(remove).toHaveBeenCalledWith(['u1/avatar.png']);
  });

  it('throws on an unrecognized URL, without touching storage or the profile row', async () => {
    await expect(removeAvatar('u1', 'https://example.com/not-a-storage-url.jpg')).rejects.toThrow(
      'Unrecognized avatar URL'
    );
    expect(mockStorageFrom).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws the Supabase error if the storage removal fails, without touching the profile row', async () => {
    mockStorageFrom.mockReturnValue({ remove: jest.fn(() => Promise.resolve({ error: { message: 'denied' } })) });

    await expect(
      removeAvatar('u1', 'https://proj.supabase.co/storage/v1/object/public/avatars/u1/avatar.png')
    ).rejects.toEqual({ message: 'denied' });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
