import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { FilesystemObjectStorage } from './filesystem-object-storage';
import { InMemoryObjectStorage } from './in-memory-object-storage';
import { S3ObjectStorage } from './s3-object-storage';

const key = 'assets/550e8400-e29b-41d4-a716-446655440000/650e8400-e29b-41d4-a716-446655440000';

describe('asset storage test adapters', () => {
  it('stores bytes and metadata in memory and can inject operation errors', async () => {
    const storage = new InMemoryObjectStorage();
    const bytes = Buffer.from('image bytes');
    await storage.putObject(key, {
      body: Readable.from([bytes]),
      checksum: 'sha256-value',
      contentLength: bytes.length,
      contentType: 'image/webp',
    });
    expect(await storage.headObject(key)).toEqual({
      checksum: 'sha256-value',
      contentType: 'image/webp',
      sizeBytes: bytes.length,
    });
    expect(await storage.readObject(key)).toEqual(bytes);
    await expect(
      storage.putObject(key, {
        body: Readable.from([bytes]),
        checksum: 'sha256-value',
        contentLength: bytes.length,
        contentType: 'image/webp',
      }),
    ).rejects.toThrow('already exists');
    storage.failNext.add('delete');
    await expect(storage.deleteObject(key)).rejects.toThrow('Injected delete failure');
    await storage.deleteObject(key);
    expect(await storage.headObject(key)).toBeNull();
  });

  it('isolates files in a temporary directory and removes them with the suite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lite-notion-storage-test-'));
    try {
      const storage = new FilesystemObjectStorage(directory);
      const bytes = Buffer.from('filesystem bytes');
      await storage.putObject(key, {
        body: Readable.from([bytes]),
        checksum: 'sha256-value',
        contentLength: bytes.length,
        contentType: 'image/png',
      });
      expect(await storage.readObject(key)).toEqual(bytes);
      expect(await storage.headObject(key)).toEqual({
        checksum: 'sha256-value',
        contentType: 'image/png',
        sizeBytes: bytes.length,
      });
      await expect(
        storage.putObject(key, {
          body: Readable.from([bytes]),
          checksum: 'sha256-value',
          contentLength: bytes.length,
          contentType: 'image/png',
        }),
      ).rejects.toThrow();
      await storage.deleteObject(key);
      expect(await storage.headObject(key)).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a key that could escape the managed prefix', async () => {
    const storage = new InMemoryObjectStorage();
    await expect(storage.headObject('../secret')).rejects.toThrow(
      'Invalid server-generated storage key',
    );
  });

  it('changes only S3 URL configuration while preserving the provider-independent key', async () => {
    const first = new S3ObjectStorage({
      assets: {
        s3RequestTimeoutMs: 5_000,
        s3: {
          accessKeyId: 'test-access',
          bucket: 'first-bucket',
          endpoint: 'https://objects.first.example',
          forcePathStyle: true,
          region: 'region-a',
          secretAccessKey: 'test-secret',
        },
      },
    } as never);
    const second = new S3ObjectStorage({
      assets: {
        s3RequestTimeoutMs: 5_000,
        s3: {
          accessKeyId: 'test-access',
          bucket: 'second-bucket',
          endpoint: 'https://objects.second.example',
          forcePathStyle: false,
          region: 'region-b',
          secretAccessKey: 'test-secret',
        },
      },
    } as never);

    const firstUrl = new URL(await first.signedReadUrl(key, 60));
    const secondUrl = new URL(await second.signedReadUrl(key, 60));

    expect(firstUrl.host).toBe('objects.first.example');
    expect(firstUrl.pathname).toBe(`/${'first-bucket'}/${key}`);
    expect(firstUrl.searchParams.get('X-Amz-Credential')).toContain('/region-a/s3/');
    expect(secondUrl.host).toBe('second-bucket.objects.second.example');
    expect(secondUrl.pathname).toBe(`/${key}`);
    expect(secondUrl.searchParams.get('X-Amz-Credential')).toContain('/region-b/s3/');
    expect(key).toBe(
      'assets/550e8400-e29b-41d4-a716-446655440000/650e8400-e29b-41d4-a716-446655440000',
    );
  });
});
