import type { Readable } from 'node:stream';

export interface StoredObjectMetadata {
  checksum: string | null;
  contentType: string | null;
  sizeBytes: number;
}

export interface PutObjectInput {
  body: Readable;
  checksum: string;
  contentLength: number;
  contentType: string;
}

export interface ListedObject {
  key: string;
  lastModified: Date | null;
}

export interface ObjectStorage {
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<StoredObjectMetadata | null>;
  listObjects(
    prefix: string,
    continuationToken?: string,
  ): Promise<{
    continuationToken: string | null;
    objects: ListedObject[];
  }>;
  putObject(key: string, input: PutObjectInput): Promise<void>;
  signedReadUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export function assertStorageKey(key: string): void {
  if (!/^assets\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(key)) {
    throw new Error('Invalid server-generated storage key');
  }
}
