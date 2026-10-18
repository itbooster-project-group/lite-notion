import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { type ApplicationConfig, applicationConfig } from '../../config/application-config';
import type {
  ListedObject,
  ObjectStorage,
  PutObjectInput,
  StoredObjectMetadata,
} from './object-storage';
import { assertStorageKey } from './object-storage';

@Injectable()
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly requestTimeoutMs: number;

  constructor(@Inject(applicationConfig.KEY) config: ApplicationConfig) {
    const storage = config.assets.s3;
    this.requestTimeoutMs = config.assets.s3RequestTimeoutMs;
    this.bucket = storage?.bucket ?? null;
    this.client = storage
      ? new S3Client({
          credentials: {
            accessKeyId: storage.accessKeyId,
            secretAccessKey: storage.secretAccessKey,
          },
          endpoint: storage.endpoint,
          forcePathStyle: storage.forcePathStyle,
          maxAttempts: 2,
          region: storage.region,
        })
      : null;
  }

  async putObject(key: string, input: PutObjectInput): Promise<void> {
    assertStorageKey(key);
    const { bucket, client } = this.requireConfigured();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Body: input.body,
        ContentLength: input.contentLength,
        ContentType: input.contentType,
        Key: key,
        Metadata: { sha256: input.checksum },
      }),
      { abortSignal: AbortSignal.timeout(this.requestTimeoutMs) },
    );
  }

  async headObject(key: string): Promise<StoredObjectMetadata | null> {
    assertStorageKey(key);
    const { bucket, client } = this.requireConfigured();
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (typeof result.ContentLength !== 'number') return null;
      return {
        checksum: result.Metadata?.sha256 ?? null,
        contentType: result.ContentType ?? null,
        sizeBytes: result.ContentLength,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async signedReadUrl(key: string, expiresInSeconds: number): Promise<string> {
    assertStorageKey(key);
    const { bucket, client } = this.requireConfigured();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async deleteObject(key: string): Promise<void> {
    assertStorageKey(key);
    const { bucket, client } = this.requireConfigured();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(this.requestTimeoutMs),
    });
  }

  async listObjects(
    prefix: string,
    continuationToken?: string,
    maxKeys = 1000,
  ): Promise<{ continuationToken: string | null; objects: ListedObject[] }> {
    const { bucket, client } = this.requireConfigured();
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        MaxKeys: Math.max(1, Math.min(maxKeys, 1000)),
        Prefix: prefix,
      }),
      { abortSignal: AbortSignal.timeout(this.requestTimeoutMs) },
    );
    return {
      continuationToken: result.IsTruncated ? (result.NextContinuationToken ?? null) : null,
      objects: (result.Contents ?? [])
        .filter((item): item is typeof item & { Key: string } => typeof item.Key === 'string')
        .map((item) => ({ key: item.Key, lastModified: item.LastModified ?? null })),
    };
  }

  private requireConfigured(): { bucket: string; client: S3Client } {
    if (this.client === null || this.bucket === null) {
      throw new Error('Object storage is not configured');
    }
    return { bucket: this.bucket, client: this.client };
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata &&
    error.$metadata.httpStatusCode === 404
  );
}
