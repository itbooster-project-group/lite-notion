import type { Readable } from 'node:stream';
import {
  assertStorageKey,
  type ListedObject,
  type ObjectStorage,
  type PutObjectInput,
  type StoredObjectMetadata,
} from './object-storage';

export type StorageOperation = 'put' | 'head' | 'signedRead' | 'delete' | 'list';

export class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<
    string,
    { bytes: Uint8Array; checksum: string; contentType: string; lastModified: Date }
  >();
  readonly failNext = new Set<StorageOperation>();

  async putObject(key: string, input: PutObjectInput): Promise<void> {
    assertStorageKey(key);
    this.fail('put');
    if (this.objects.has(key)) throw new Error('Object key already exists');
    const chunks: Uint8Array[] = [];
    for await (const chunk of input.body as Readable) {
      chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk));
    }
    this.objects.set(key, {
      bytes: Buffer.concat(chunks),
      checksum: input.checksum,
      contentType: input.contentType,
      lastModified: new Date(),
    });
  }

  async headObject(key: string): Promise<StoredObjectMetadata | null> {
    assertStorageKey(key);
    this.fail('head');
    const object = this.objects.get(key);
    return object
      ? {
          checksum: object.checksum,
          contentType: object.contentType,
          sizeBytes: object.bytes.byteLength,
        }
      : null;
  }

  async readObject(key: string): Promise<Uint8Array | null> {
    assertStorageKey(key);
    const object = this.objects.get(key);
    return object?.bytes.slice() ?? null;
  }

  async signedReadUrl(key: string, _expiresInSeconds: number): Promise<string> {
    assertStorageKey(key);
    this.fail('signedRead');
    if (!this.objects.has(key)) throw new Error('Object not found');
    return `memory://assets/${encodeURIComponent(key)}`;
  }

  async deleteObject(key: string): Promise<void> {
    assertStorageKey(key);
    this.fail('delete');
    this.objects.delete(key);
  }

  async listObjects(
    prefix: string,
  ): Promise<{ continuationToken: string | null; objects: ListedObject[] }> {
    this.fail('list');
    return {
      continuationToken: null,
      objects: [...this.objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, lastModified: value.lastModified })),
    };
  }

  private fail(operation: StorageOperation): void {
    if (this.failNext.delete(operation)) throw new Error(`Injected ${operation} failure`);
  }
}
